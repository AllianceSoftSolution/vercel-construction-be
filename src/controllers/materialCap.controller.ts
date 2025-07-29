import { PrismaClient } from "@prisma/client";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import {
  buildQueryOptions,
  extractQueryParams,
  buildPaginationMeta,
} from "../utils/buildQueryOptions";
import { sendNotificationToUserSafe } from "../utils/notification";

const prisma = new PrismaClient();

// Create/Update caps for a section
const createSectionCaps = catchAsync(async (req, res, next) => {
  const { sectionId } = req.params;
  const { caps } = req.body; // Array of { materialId, quantity, unit }
  const userId = req.user.id;

  if (!caps || !Array.isArray(caps) || caps.length === 0) {
    return next(
      new AppError("Caps array is required and must not be empty", 400)
    );
  }

  // Validate section exists
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { project: true },
  });

  if (!section) {
    return next(new AppError("Section not found", 404));
  }

  // Validate all materials exist
  const materialIds = caps.map((cap) => cap.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds } },
  });

  if (materials.length !== materialIds.length) {
    return next(new AppError("One or more materials not found", 404));
  }

  // Validate required fields for each cap
  for (const cap of caps) {
    if (!cap.materialId || !cap.quantity || !cap.unit) {
      return next(
        new AppError(
          "materialId, quantity, and unit are required for each cap",
          400
        )
      );
    }
    if (cap.quantity <= 0) {
      return next(new AppError("Quantity must be greater than 0", 400));
    }
  }

  // Process caps in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const createdCaps: any[] = [];

    for (const cap of caps) {
      const material = materials.find((m) => m.id === cap.materialId);

      // Validate unit matches material's default unit
      if (material && material.unit !== cap.unit) {
        throw new AppError(
          `Unit mismatch for material ${material.name}. Expected: ${material.unit}, Got: ${cap.unit}`,
          400
        );
      }

      // Upsert the cap
      const createdCap = await tx.materialCap.upsert({
        where: {
          materialId_sectionId: {
            materialId: cap.materialId,
            sectionId: sectionId,
          },
        },
        update: {
          quantity: cap.quantity,
          unit: cap.unit,
          updatedBy: userId,
          updatedAt: new Date(),
        },
        create: {
          materialId: cap.materialId,
          sectionId: sectionId,
          projectId: section.projectId,
          quantity: cap.quantity,
          unit: cap.unit,
          createdBy: userId,
        },
        include: {
          material: {
            select: {
              id: true,
              name: true,
              unit: true,
            },
          },
        },
      });

      createdCaps.push(createdCap);
    }

    return createdCaps;
  });

  res.status(201).json({
    message: "Material caps created/updated successfully",
    caps: result,
  });

  await sendNotificationToUserSafe({
    userId: req.user.id,
    title: "Material Caps Updated",
    body: `${result.length} material caps were updated for section ${section.name}.`,
  });
});

// Get caps for a section
const getSectionCaps = catchAsync(async (req, res, next) => {
  const { sectionId } = req.params;

  // Validate section exists
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
  });

  if (!section) {
    return next(new AppError("Section not found", 404));
  }

  const caps = await prisma.materialCap.findMany({
    where: {
      sectionId: sectionId,
      isDeleted: false,
    },
    include: {
      material: {
        select: {
          id: true,
          name: true,
          unit: true,
          category: true,
        },
      },
    },
    orderBy: {
      material: {
        name: "asc",
      },
    },
  });

  res.json({
    message: "Material caps retrieved successfully",
    caps,
  });
});

// Update caps for a section (with deletion logic)
const updateSectionCaps = catchAsync(async (req, res, next) => {
  const { sectionId } = req.params;
  const { caps } = req.body; // Array of { materialId, quantity, unit }
  const userId = req.user.id;

  if (!caps || !Array.isArray(caps)) {
    return next(new AppError("Caps array is required", 400));
  }

  // Validate section exists
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { project: true },
  });

  if (!section) {
    return next(new AppError("Section not found", 404));
  }

  // Get existing caps for this section
  const existingCaps = await prisma.materialCap.findMany({
    where: {
      sectionId: sectionId,
      isDeleted: false,
    },
  });

  // Get material IDs from the incoming caps array
  const incomingMaterialIds = caps.map((cap) => cap.materialId);

  // Find caps that should be deleted (exist in DB but not in incoming array)
  const capsToDelete = existingCaps.filter(
    (cap) => !incomingMaterialIds.includes(cap.materialId)
  );

  // Validate all materials exist
  const materialIds = caps.map((cap) => cap.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds } },
  });

  if (materials.length !== materialIds.length) {
    return next(new AppError("One or more materials not found", 404));
  }

  // Validate required fields for each cap
  for (const cap of caps) {
    if (!cap.materialId || !cap.quantity || !cap.unit) {
      return next(
        new AppError(
          "materialId, quantity, and unit are required for each cap",
          400
        )
      );
    }
    if (cap.quantity <= 0) {
      return next(new AppError("Quantity must be greater than 0", 400));
    }
  }

  // Process caps in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Delete caps that are not in the incoming array
    if (capsToDelete.length > 0) {
      await tx.materialCap.updateMany({
        where: {
          id: { in: capsToDelete.map((cap) => cap.id) },
        },
        data: {
          isDeleted: true,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      });
    }

    const updatedCaps: any[] = [];

    // Update/create caps from the incoming array
    for (const cap of caps) {
      const material = materials.find((m) => m.id === cap.materialId);

      // Validate unit matches material's default unit
      if (material && material.unit !== cap.unit) {
        throw new AppError(
          `Unit mismatch for material ${material.name}. Expected: ${material.unit}, Got: ${cap.unit}`,
          400
        );
      }

      // Upsert the cap
      const updatedCap = await tx.materialCap.upsert({
        where: {
          materialId_sectionId: {
            materialId: cap.materialId,
            sectionId: sectionId,
          },
        },
        update: {
          quantity: cap.quantity,
          unit: cap.unit,
          updatedBy: userId,
          updatedAt: new Date(),
        },
        create: {
          materialId: cap.materialId,
          sectionId: sectionId,
          projectId: section.projectId,
          quantity: cap.quantity,
          unit: cap.unit,
          createdBy: userId,
        },
        include: {
          material: {
            select: {
              id: true,
              name: true,
              unit: true,
            },
          },
        },
      });

      updatedCaps.push(updatedCap);
    }

    return {
      updatedCaps,
      deletedCaps: capsToDelete,
    };
  });

  res.json({
    message: "Material caps updated successfully",
    caps: result.updatedCaps,
    deletedCaps: result.deletedCaps,
  });

  await sendNotificationToUserSafe({
    userId: req.user.id,
    title: "Material Caps Updated",
    body: `${result.updatedCaps.length} material caps were updated and ${result.deletedCaps.length} were removed for section ${section.name}.`,
  });
});

// Get accumulated caps for a project
const getProjectCaps = catchAsync(async (req, res, next) => {
  const { projectId } = req.params;

  // Validate project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return next(new AppError("Project not found", 404));
  }

  // Get all caps for the project's sections
  const caps = await prisma.materialCap.findMany({
    where: {
      projectId: projectId,
      isDeleted: false,
    },
    include: {
      material: {
        select: {
          id: true,
          name: true,
          unit: true,
          category: true,
        },
      },
      section: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: [
      {
        material: {
          name: "asc",
        },
      },
      {
        section: {
          name: "asc",
        },
      },
    ],
  });

  // Aggregate caps by material
  const aggregatedCaps = caps.reduce((acc: any[], cap) => {
    const materialId = cap.materialId;
    const existingCap = acc.find((c) => c.materialId === materialId);

    if (existingCap) {
      existingCap.totalQuantity = existingCap.totalQuantity + cap.quantity;
      existingCap.sections.push({
        sectionId: cap.section.id,
        sectionName: cap.section.name,
        sectionCode: cap.section.code,
        quantity: cap.quantity,
      });
    } else {
      acc.push({
        materialId: cap.materialId,
        materialName: cap.material.name,
        materialUnit: cap.material.unit,
        materialCategory: cap.material.category,
        totalQuantity: cap.quantity,
        sections: [
          {
            sectionId: cap.section.id,
            sectionName: cap.section.name,
            sectionCode: cap.section.code,
            quantity: cap.quantity,
          },
        ],
      });
    }

    return acc;
  }, []);

  res.json({
    message: "Project material caps retrieved successfully",
    project: {
      id: project.id,
      name: project.name,
      code: project.code,
    },
    aggregatedCaps,
    detailedCaps: caps,
  });
});

// Get all material caps (for admin purposes)
const getAllMaterialCaps = catchAsync(async (req, res) => {
  // Extract query parameters
  const filterOptions = extractQueryParams(req);

  // Define searchable fields
  const searchableFields = ["material.name", "section.name", "project.name"];

  // Build default filters
  const defaultFilters = { isDeleted: false };

  // Build query options
  const queryOptions = buildQueryOptions(
    filterOptions,
    defaultFilters,
    searchableFields
  );

  // Get total count for pagination
  const total = await prisma.materialCap.count({
    where: queryOptions.where,
  });

  // Get material caps with pagination
  const caps = await prisma.materialCap.findMany({
    ...queryOptions,
    include: {
      material: {
        select: {
          id: true,
          name: true,
          unit: true,
          category: true,
        },
      },
      section: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(
    total,
    filterOptions.page || 1,
    filterOptions.limit || 50
  );

  res.json({
    message: "Material caps retrieved successfully",
    caps,
    ...paginationMeta,
  });
});

export {
  createSectionCaps,
  getSectionCaps,
  updateSectionCaps,
  getProjectCaps,
  getAllMaterialCaps,
};
