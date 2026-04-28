import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import { generateSectionCode } from "../utils/generateCode";
import {
  buildQueryOptions,
  extractQueryParams,
  buildPaginationMeta,
} from "../utils/buildQueryOptions";
import { sendNotificationToUserSafe } from "../utils/notification";
import prisma from "../utils/prisma";

const createSection = catchAsync(async (req, res, next) => {
  const { name, description, projectId, createStore, storePermissions } = req.body;
  // createStore: boolean — only create the SECTION_STORE when explicitly requested
  // storePermissions: Array<{ userId, canViewStock, canRequestMaterials, canApproveMaterials, canAddStock, canTransferStock }>
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
  const code = await generateSectionCode(projectId);

  // Create section and optionally SECTION_STORE + permissions in one transaction
  const createdSection = await prisma.$transaction(async (tx) => {
    const section = await tx.section.create({
      data: {
        name,
        code,
        description,
        projectId,
        createdBy: userId,
      },
    });

    // Only create the SECTION_STORE when the admin explicitly opts in
    if (createStore === true) {
      const sectionStore = await tx.store.create({
        data: {
          name: `Section Store - ${section.code}`,
          type: "SECTION_STORE",
          sectionId: section.id,
          createdBy: userId,
        },
      });

      // Create permissions if provided
      if (Array.isArray(storePermissions) && storePermissions.length > 0) {
        await tx.storePermission.createMany({
          data: storePermissions.map((p: any) => ({
            storeId: sectionStore.id,
            userId: p.userId,
            canViewStock: p.canViewStock ?? true,
            canRequestMaterials: p.canRequestMaterials ?? false,
            canApproveMaterials: p.canApproveMaterials ?? false,
            canAddStock: p.canAddStock ?? false,
            canTransferStock: p.canTransferStock ?? false,
            createdBy: userId,
          })),
          skipDuplicates: true,
        });
      }
    }

    return section;
  });

  // Fetch the section with all details
  const section = await prisma.section.findUnique({
    where: { id: createdSection.id },
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

  res.status(201).json({
    message: "Section created successfully",
    section,
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
      select: { sectionId: true, projectId: true },
    });
    if (user.isHead) {
      // Head Accountant: see all sections in their assigned projects
      const projectIds = Array.from(new Set(assignments.map((a) => a.projectId)));
      const projectSections = await prisma.section.findMany({
        where: { projectId: { in: projectIds }, isDeleted: false },
        select: { id: true },
      });
      defaultFilters.id = { in: projectSections.map((s) => s.id) };
    } else {
      // Section Accountant: only explicitly assigned sections
      const sectionIds = assignments
        .map((a) => a.sectionId)
        .filter((id): id is string => !!id);
      defaultFilters.id = { in: sectionIds };
    }
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
          totalAmount: { not: null },
        },
        _sum: {
          totalAmount: true,
        },
      });

      return {
        ...section,
        totalAmountSpent: sectionPOs._sum.totalAmount || 0,
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
  const user = req.user;

  // Role-based access check
  if (user.role !== "ADMIN") {
    let assigned = false;
    if (user.role === "SITE_INCHARGE") {
      const assignment = await prisma.siteInchargeAssignment.findFirst({
        where: { userId: user.id, sectionId: id, isActive: true },
      });
      assigned = !!assignment;
    } else if (user.role === "PROJECT_MANAGER") {
      const assignment = await prisma.projectManagerAssignment.findFirst({
        where: { userId: user.id, sectionId: id, isActive: true },
      });
      assigned = !!assignment;
    } else if (user.role === "CONSTRUCTION_MANAGER") {
      const assignment = await prisma.constructionManagerAssignment.findFirst({
        where: { userId: user.id, sectionId: id, isActive: true },
      });
      assigned = !!assignment;
    } else if (user.role === "STORE_INCHARGE") {
      const assignment = await prisma.storeInchargeAssignment.findFirst({
        where: { userId: user.id, isActive: true, store: { sectionId: id } },
      });
      assigned = !!assignment;
    } else if (user.role === "ACCOUNTANT") {
      // If user is head accountant, they can access all sections
      if (user.isHead) {
        // Check the section belongs to one of their assigned projects
        const section = await prisma.section.findUnique({
          where: { id },
          select: { projectId: true },
        });
        if (section) {
          const projectAssignment = await prisma.accountantAssignment.findFirst({
            where: { userId: user.id, projectId: section.projectId, isActive: true },
          });
          assigned = !!projectAssignment;
        }
      } else {
        // Regular accountant - only assigned sections
        const assignment = await prisma.accountantAssignment.findFirst({
          where: { userId: user.id, sectionId: id, isActive: true },
        });
        assigned = !!assignment;
      }
    }
    if (!assigned) {
      return next(
        new AppError("Access denied: not assigned to this section", 403)
      );
    }
  }

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
      totalAmount: { not: null },
    },
    _sum: {
      totalAmount: true,
    },
  });

  // Get material caps for this section
  const materialCaps = await prisma.materialCap.findMany({
    where: {
      sectionId: section.id,
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
  });

  // Get demands for this section to calculate demand amounts
  const sectionDemands = await prisma.demand.findMany({
    where: {
      sectionId: section.id,
      isDeleted: false,
    },
    select: {
      materialId: true,
      quantity: true,
      unit: true,
      status: true,
    },
  });

  // Get purchase orders for this section to calculate PO amounts
  const sectionPurchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      sectionId: section.id,
      isDeleted: false,
    },
    select: {
      materialId: true,
      quantity: true,
      status: true,
    },
  });

  // Calculate material cap analytics
  const materialCapAnalytics = materialCaps.map((cap) => {
    // Calculate total demand quantity for this material
    const materialDemands = sectionDemands.filter(
      (d) => d.materialId === cap.materialId
    );
    const totalDemandQuantity = materialDemands.reduce(
      (sum, demand) => sum + Number(demand.quantity),
      0
    );

    // Calculate total PO quantity for this material
    const materialPOs = sectionPurchaseOrders.filter(
      (po) => po.materialId === cap.materialId
    );
    const totalPOQuantity = materialPOs.reduce(
      (sum, po) => sum + Number(po.quantity),
      0
    );

    // Calculate if cap is exceeded
    const capQuantity = Number(cap.quantity);
    const isCapExceeded = totalDemandQuantity > capQuantity;
    const isPOExceeded = totalPOQuantity > capQuantity;
    const isInLimit = !isCapExceeded && !isPOExceeded;

    // Calculate usage percentage
    const demandUsagePercentage =
      capQuantity > 0 ? (totalDemandQuantity / capQuantity) * 100 : 0;
    const poUsagePercentage =
      capQuantity > 0 ? (totalPOQuantity / capQuantity) * 100 : 0;

    return {
      materialId: cap.materialId,
      materialName: cap.material.name,
      materialUnit: cap.material.unit,
      materialCategory: cap.material.category,
      capQuantity: capQuantity,
      capUnit: cap.unit,
      totalDemandQuantity: totalDemandQuantity,
      totalPurchaseOrderQuantity: totalPOQuantity,
      isDemandCapExceeded: isCapExceeded,
      isPurchaseOrderCapExceeded: isPOExceeded,
      isWithinLimit: isInLimit,
      demandUsagePercentage: Math.round(demandUsagePercentage * 100) / 100,
      purchaseOrderUsagePercentage: Math.round(poUsagePercentage * 100) / 100,
      remainingQuantity:
        capQuantity - Math.max(totalDemandQuantity, totalPOQuantity),
      status: isCapExceeded
        ? "EXCEEDED"
        : isPOExceeded
        ? "PO_EXCEEDED"
        : "WITHIN_LIMIT",
    };
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
        // Prefer section-level store for section operations; fallback to legacy CM store.
        const cmStore = await prisma.store.findFirst({
          where: {
            sectionId: section.id,
            OR: [{ type: "SECTION_STORE" }, { type: "CM_STORE" }],
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
    totalAmountSpent: sectionPOs._sum.totalAmount || 0,
    materialCapAnalytics: materialCapAnalytics,
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

  // Delete all assignments for this section
  await prisma.siteInchargeAssignment.deleteMany({ where: { sectionId: id } });
  await prisma.projectManagerAssignment.deleteMany({
    where: { sectionId: id },
  });
  await prisma.constructionManagerAssignment.deleteMany({
    where: { sectionId: id },
  });
  await prisma.accountantAssignment.deleteMany({ where: { sectionId: id } });
  // For all stores in this section, delete their store incharge assignments
  const stores = await prisma.store.findMany({ where: { sectionId: id } });
  for (const store of stores) {
    await prisma.storeInchargeAssignment.deleteMany({
      where: { storeId: store.id },
    });
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
