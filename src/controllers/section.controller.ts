import { PrismaClient } from "@prisma/client";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import { generateSectionCode } from "../utils/generateCode";
import {
  buildQueryOptions,
  extractQueryParams,
  buildPaginationMeta,
} from "../utils/buildQueryOptions";
import { sendNotificationToUserSafe } from "../utils/notification";

const prisma = new PrismaClient();

const createSection = catchAsync(async (req, res, next) => {
  const { name, description, projectId } = req.body;
  const userId = req.user.id;

  if (!name || !projectId) {
    return next(new AppError("Name and projectId are required", 400));
  }

  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return next(new AppError("Project not found", 404));
  }

  // Generate automatic section code
  const code = await generateSectionCode();

  // Create section and head store in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const section = await tx.section.create({
      data: {
        name,
        code,
        description,
        projectId,
        createdBy: userId,
      },
    });

    // Create head store for the section
    const headStore = await tx.store.create({
      data: {
        name: `Head Store - ${section.code}`,
        type: "HEAD_STORE",
        sectionId: section.id,
        isActive: true,
        isDeleted: false,
        createdBy: userId,
      },
    });

    return { section, headStore };
  });

  // Fetch the section with all details and the head store
  const section = await prisma.section.findUnique({
    where: { id: result.section.id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      stores: {
        where: { isDeleted: false },
        include: {
          cmUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          storeInchargeAssignments: {
            where: { isActive: true },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!section) {
    return next(new AppError("Section not found after creation", 404));
  }

  // Find the head store (should be only one)
  const headStore = section.stores.find((s) => s.type === "HEAD_STORE");

  res.status(201).json({
    message: "Section created successfully",
    section: {
      ...section,
      headStore,
    },
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Section Created",
    body: `Section ${section.name} was created successfully.`,
  });
});

const getSections = catchAsync(async (req, res) => {
  const user = req.user;

  // Extract query parameters
  const filterOptions = extractQueryParams(req);

  // Define searchable fields for sections
  const searchableFields = ["name", "code", "description"];

  // Build default filters based on user role
  let defaultFilters: any = { isDeleted: false };

  // Role-based filtering for sections
  if (user.role === "ADMIN") {
    // No filter, see all
  } else if (user.role === "SITE_INCHARGE") {
    const assignments = await prisma.siteInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    defaultFilters.id = { in: sectionIds };
  } else if (user.role === "PROJECT_MANAGER") {
    const assignments = await prisma.projectManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    defaultFilters.id = { in: sectionIds };
  } else if (user.role === "CONSTRUCTION_MANAGER") {
    const assignments = await prisma.constructionManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    defaultFilters.id = { in: sectionIds };
  } else if (user.role === "STORE_INCHARGE") {
    const assignments = await prisma.storeInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { store: { select: { sectionId: true } } },
    });
    const sectionIds = assignments.map((a) => a.store.sectionId);
    defaultFilters.id = { in: sectionIds };
  } else if (user.role === "ACCOUNTANT") {
    const assignments = await prisma.accountantAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    defaultFilters.id = { in: sectionIds };
  }

  // Build query options
  const queryOptions = buildQueryOptions(
    filterOptions,
    defaultFilters,
    searchableFields
  );

  // Get total count for pagination
  const total = await prisma.section.count({
    where: queryOptions.where,
  });

  // Get sections with pagination
  const sections = await prisma.section.findMany({
    ...queryOptions,
    include: {
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      stores: {
        where: { isDeleted: false },
        include: {
          cmUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          storeInchargeAssignments: {
            where: { isActive: true },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          stores: true,
          demands: true,
        },
      },
    },
  });

  // Calculate total amounts for each section
  const sectionsWithAmounts = await Promise.all(
    sections.map(async (section) => {
      const sectionPOs = await prisma.purchaseOrder.aggregate({
        where: {
          sectionId: section.id,
          isDeleted: false,
          totalAmount: { not: null }
        },
        _sum: {
          totalAmount: true
        }
      });

      return {
        ...section,
        totalAmountSpent: sectionPOs._sum.totalAmount || 0
      };
    })
  );

  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(
    total,
    filterOptions.page || 1,
    filterOptions.limit || 50
  );

  res.json({
    message: "Sections retrieved successfully",
    sections: sectionsWithAmounts,
    ...paginationMeta,
  });
});

const getSectionById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const section = await prisma.section.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      stores: {
        where: {
          isDeleted: false,
        },
        include: {
          cmUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          storeInchargeAssignments: {
            where: { isActive: true },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
        },
      },
      siteInchargeAssignments: {
        where: { isActive: true },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      },
      projectManagerAssignments: {
        where: { isActive: true },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              creator: true,
            },
          },
        },
      },
      constructionManagerAssignments: {
        where: { isActive: true },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              creator: true,
            },
          },
        },
      },
      accountantAssignments: {
        where: { isActive: true },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      },
      demands: {
        where: { isDeleted: false },
        select: {
          id: true,
          referenceNumber: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!section) {
    return next(new AppError("Section not found", 404));
  }

  // Calculate total amount spent on POs for this section
  const sectionPOs = await prisma.purchaseOrder.aggregate({
    where: {
      sectionId: section.id,
      isDeleted: false,
      totalAmount: { not: null }
    },
    _sum: {
      totalAmount: true
    }
  });

  // Find the head store (should be only one)
  const headStore = section.stores.find((s) => s.type === "HEAD_STORE");

  // Prepare the response with organized data
  const response = {
    id: section.id,
    name: section.name,
    code: section.code,
    description: section.description,
    projectId: section.projectId,
    isActive: section.isActive,
    isDeleted: section.isDeleted,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
    createdBy: section.createdBy,
    updatedBy: section.updatedBy,
    project: section.project,
    headStore,
    associatedProjectManager:
      section.projectManagerAssignments.length > 0
        ? section.projectManagerAssignments[0]
        : null,
    associatedConstructionManagers: await Promise.all(
      section.constructionManagerAssignments.map(async (cmAssignment) => {
        // Find the CM store for this CM
        const cmStore = await prisma.store.findFirst({
          where: {
            type: "CM_STORE",
            cmUserId: cmAssignment.userId,
            sectionId: section.id,
            isDeleted: false,
          },
          select: {
            id: true,
            name: true,
            type: true,
            isActive: true,
            isDeleted: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        return {
          ...cmAssignment,
          cmStore,
        };
      })
    ),
    associatedSiteIncharges: section.siteInchargeAssignments,
    associatedAccountants: section.accountantAssignments,
    recentDemands: section.demands,
    totalAmountSpent: sectionPOs._sum.totalAmount || 0
  };

  res.json({
    message: "Section retrieved successfully",
    section: response,
  });
});

const updateSection = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = { ...req.body };
  const userId = req.user.id;

  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.createdAt;
  delete updates.createdBy;
  delete updates.projectId;
  delete updates.code; // Prevent manual code updates

  const existing = await prisma.section.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Section not found", 404));
  }

  const updatedSection = await prisma.section.update({
    where: { id },
    data: {
      ...updates,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      stores: {
        where: { isDeleted: false },
        include: {
          cmUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          storeInchargeAssignments: {
            where: { isActive: true },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
        },
      },
    },
  });

  res.json({
    message: "Section updated successfully",
    section: updatedSection,
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Section Updated",
    body: `Section ${updatedSection.name} was updated successfully.`,
  });
});

const deleteSection = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.section.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Section not found", 404));
  }

  await prisma.section.update({
    where: { id },
    data: {
      isDeleted: true,
      isActive: false,
      updatedBy: userId,
      updatedAt: new Date(),
    },
  });

  res.json({
    message: "Section deleted successfully",
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Section Deleted",
    body: `Section ${existing.name} was deleted successfully.`,
  });
});

const activateSection = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.section.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Section not found", 404));
  }

  const updatedSection = await prisma.section.update({
    where: { id },
    data: {
      isActive: true,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      stores: {
        where: { isDeleted: false },
        include: {
          cmUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          storeInchargeAssignments: {
            where: { isActive: true },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
        },
      },
    },
  });

  res.json({
    message: "Section activated successfully",
    section: updatedSection,
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Section Activated",
    body: `Section ${updatedSection.name} was activated successfully.`,
  });
});

const deactivateSection = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.section.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Section not found", 404));
  }

  const updatedSection = await prisma.section.update({
    where: { id },
    data: {
      isActive: false,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      stores: {
        where: { isDeleted: false },
        include: {
          cmUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          storeInchargeAssignments: {
            where: { isActive: true },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
        },
      },
    },
  });

  res.json({
    message: "Section deactivated successfully",
    section: updatedSection,
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Section Deactivated",
    body: `Section ${updatedSection.name} was deactivated successfully.`,
  });
});

export {
  createSection,
  getSections,
  getSectionById,
  updateSection,
  deleteSection,
  activateSection,
  deactivateSection,
};
