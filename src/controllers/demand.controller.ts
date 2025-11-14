import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import { generateDemandCode } from "../utils/generateCode";
import {
  buildQueryOptions,
  extractQueryParams,
  buildPaginationMeta,
} from "../utils/buildQueryOptions";
import { sendNotificationToUserSafe } from "../utils/notification";
import { NotificationService } from "../utils/notificationService";
import prisma from "../utils/prisma";

const createDemand = catchAsync(async (req, res, next) => {
  const { materialId, quantity, unit, sectionId, notes } = req.body;
  const userId = req.user.id;

  if (!sectionId || !materialId || !quantity || !unit) {
    return next(
      new AppError(
        "sectionId, materialId, quantity, and unit are required",
        400
      )
    );
  }

  // Check if user is a Construction Manager
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  if (user.role !== "CONSTRUCTION_MANAGER") {
    return next(
      new AppError("Only Construction Managers can create demands", 403)
    );
  }

  // Check if section exists
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  if (!section) {
    return next(new AppError("Section not found", 404));
  }

  // Check if material exists
  const material = await prisma.material.findUnique({
    where: { id: materialId },
  });

  if (!material) {
    return next(new AppError("Material not found", 404));
  }

  // Generate automatic demand reference number
  const referenceNumber = await generateDemandCode(section.projectId);

  const demand = await prisma.demand.create({
    data: {
      materialId,
      quantity,
      unit,
      sectionId,
      notes,
      status: "REQUEST_SENT",
      createdBy: userId,
      referenceNumber,
      quantityRemaining: quantity,
    },
    include: {
      section: {
        include: {
          project: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      material: true,
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  res.status(201).json({
    message: "Demand created successfully",
    demand,
  });

  // Use the new notification service for comprehensive notifications
  await NotificationService.notifyDemandCreated(demand.id);
});

const getDemands = catchAsync(async (req, res) => {
  const user = req.user;

  // Extract query parameters
  const filterOptions = extractQueryParams(req);

  // Define searchable fields for demands
  const searchableFields = ["referenceNumber", "notes", "activity"];

  // Build default filters
  let defaultFilters: any = { isDeleted: false };

  // Role-based filtering for demands
  if (user.role === "ADMIN") {
    // No filter, see all
  } else if (user.role === "SITE_INCHARGE") {
    const assignments = await prisma.siteInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    defaultFilters.sectionId = { in: sectionIds };
  } else if (user.role === "PROJECT_MANAGER") {
    const assignments = await prisma.projectManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    defaultFilters.sectionId = { in: sectionIds };
  } else if (user.role === "CONSTRUCTION_MANAGER") {
    const assignments = await prisma.constructionManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    defaultFilters.sectionId = { in: sectionIds };
    // CMs should only see demands they created in their assigned sections
    defaultFilters.createdBy = user.id;
  } else if (user.role === "STORE_INCHARGE") {
    const assignments = await prisma.storeInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { store: { select: { sectionId: true } } },
    });
    const sectionIds = assignments.map((a) => a.store.sectionId);
    defaultFilters.sectionId = { in: sectionIds };
  } else if (user.role === "ACCOUNTANT") {
    // If user is head accountant, they can see all demands
    if (user.isHead) {
      // No filter, see all demands
    } else {
      // Regular accountant - only assigned sections
      const assignments = await prisma.accountantAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);
      defaultFilters.sectionId = { in: sectionIds };
    }
  }

  // Build query options
  const queryOptions = buildQueryOptions(
    filterOptions,
    defaultFilters,
    searchableFields
  );

  // Get total count for pagination
  const total = await prisma.demand.count({
    where: queryOptions.where,
  });

  // Get demands with pagination
  const demands = await prisma.demand.findMany({
    ...queryOptions,
    include: {
      section: {
        include: {
          project: {
            select: { name: true },
          },
        },
      },
      material: true,
      creator: true,
      updater: true,
      approvals: true,
      fulfillments: true,
      purchaseOrders: true,
    },
  });

  // Add projectName to each demand's section and remove the full project object
  const demandsWithProjectName = demands.map((demand) => {
    if (
      demand.section &&
      typeof demand.section === "object" &&
      "project" in demand.section &&
      demand.section.project &&
      typeof demand.section.project === "object" &&
      "name" in demand.section.project
    ) {
      (demand.section as any).projectName = demand.section.project.name;
      delete (demand.section as any).project;
    }
    return demand;
  });

  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(
    total,
    filterOptions.page || 1,
    filterOptions.limit || 50
  );

  res.json({
    message: "Demands retrieved successfully",
    demands: demandsWithProjectName,
    ...paginationMeta,
  });
});

const getDemandById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const user = req.user;

  const demand = await prisma.demand.findUnique({
    where: { id },
    include: {
      section: {
        include: {
          project: {
            select: { name: true },
          },
        },
      },
      material: true,
      creator: true,
      updater: true,
      approvals: {
        include: {
          user: {
            select: {
              name: true,
              role: true,
            },
          },
        },
      },
      fulfillments: true,
      purchaseOrders: {
        include: {
          demand: {
            include: {
              section: {
                include: {
                  project: true,
                },
              },
            },
          },
          section: true,
          material: true,
          vendor: true,
        },
      },
    },
  });
  if (!demand) {
    return next(new AppError("Demand not found", 404));
  }

  // Role-based access check
  if (user.role !== "ADMIN") {
    let assigned = false;
    const sectionId = demand.sectionId;
    if (user.role === "SITE_INCHARGE") {
      const assignment = await prisma.siteInchargeAssignment.findFirst({
        where: { userId: user.id, sectionId, isActive: true },
      });
      assigned = !!assignment;
    } else if (user.role === "PROJECT_MANAGER") {
      const assignment = await prisma.projectManagerAssignment.findFirst({
        where: { userId: user.id, sectionId, isActive: true },
      });
      assigned = !!assignment;
    } else if (user.role === "CONSTRUCTION_MANAGER") {
      const assignment = await prisma.constructionManagerAssignment.findFirst({
        where: { userId: user.id, sectionId, isActive: true },
      });
      assigned = !!assignment;
    } else if (user.role === "STORE_INCHARGE") {
      const assignment = await prisma.storeInchargeAssignment.findFirst({
        where: { userId: user.id, isActive: true, store: { sectionId } },
      });
      assigned = !!assignment;
    } else if (user.role === "ACCOUNTANT") {
      // If user is head accountant, they can access all demands
      if (user.isHead) {
        assigned = true;
      } else {
        // Regular accountant - only assigned sections
        const assignment = await prisma.accountantAssignment.findFirst({
          where: { userId: user.id, sectionId, isActive: true },
        });
        assigned = !!assignment;
      }
    }
    if (!assigned) {
      return next(
        new AppError(
          "Access denied: not assigned to this demand's section",
          403
        )
      );
    }
  }
  // Add projectName to section and remove the full project object
  if (
    demand.section &&
    typeof demand.section === "object" &&
    "project" in demand.section &&
    demand.section.project &&
    typeof demand.section.project === "object" &&
    "name" in demand.section.project
  ) {
    (demand.section as any).projectName = demand.section.project.name;
    delete (demand.section as any).project;
  }

  // --- New logic: Fetch CM and Head store stock for the material ---
  let cmStoreQty: number | null = null;
  let headStoreQty: number | null = null;
  let cmStoreId: string | null = null;
  let headStoreId: string | null = null;
  try {
    const [cmStore, headStore] = await Promise.all([
      prisma.store.findFirst({
        where: {
          sectionId: demand.sectionId,
          type: "CM_STORE",
          isActive: true,
          isDeleted: false,
        },
      }),
      prisma.store.findFirst({
        where: {
          sectionId: demand.sectionId,
          type: "HEAD_STORE",
          isActive: true,
          isDeleted: false,
        },
      }),
    ]);

    if (cmStore) {
      cmStoreId = cmStore.id;
      const cmInv = await prisma.storeInventory.findUnique({
        where: {
          storeId_materialId: {
            storeId: cmStore.id,
            materialId: demand.materialId,
          },
        },
      });
      cmStoreQty = cmInv ? Number(cmInv.available) : 0;
    }
    if (headStore) {
      headStoreId = headStore.id;
      const headInv = await prisma.storeInventory.findUnique({
        where: {
          storeId_materialId: {
            storeId: headStore.id,
            materialId: demand.materialId,
          },
        },
      });
      headStoreQty = headInv ? Number(headInv.available) : 0;
    }
  } catch (e) {
    // If error, leave as null
  }
  // --- End new logic ---

  res.json({
    message: "Demand retrieved successfully",
    demand: {
      ...demand,
      cmStoreQty,
      headStoreQty,
      cmStoreId,
      headStoreId,
      approvals: Array.isArray(demand.approvals)
        ? demand.approvals.map((a) => ({
            ...a,
            userName: a.user && a.user.name ? a.user.name : null,
            userRole: a.user && a.user.role ? a.user.role : null,
            timestamp: a.createdAt,
          }))
        : demand.approvals,
    },
  });
});

const updateDemand = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = { ...req.body };
  const userId = req.user.id;
  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.createdAt;
  delete updates.createdBy;
  delete updates.sectionId;
  delete updates.referenceNumber;
  const existing = await prisma.demand.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Demand not found", 404));
  }
  const updatedDemand = await prisma.demand.update({
    where: { id },
    data: {
      ...updates,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    include: {
      section: true,
      material: true,
      creator: true,
      updater: true,
      approvals: {
        include: {
          user: {
            select: {
              name: true,
              role: true,
            },
          },
        },
      },
      fulfillments: true,
      purchaseOrders: true,
    },
  });
  res.json({
    message: "Demand updated successfully",
    demand: {
      ...updatedDemand,
      approvals: Array.isArray(updatedDemand.approvals)
        ? updatedDemand.approvals.map((a) => ({
            ...a,
            userName: a.user && a.user.name ? a.user.name : null,
            userRole: a.user && a.user.role ? a.user.role : null,
            timestamp: a.createdAt,
          }))
        : updatedDemand.approvals,
    },
  });
  await sendNotificationToUserSafe({
    userId: updatedDemand.updatedBy ?? userId,
    title: "Demand Updated",
    body: `Demand (${updatedDemand.referenceNumber}) was updated successfully.`,
  });
});

const deleteDemand = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const existing = await prisma.demand.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Demand not found", 404));
  }
  await prisma.demand.delete({
    where: { id },
  });
  res.json({
    message: "Demand deleted successfully",
  });
  await sendNotificationToUserSafe({
    userId: existing.createdBy,
    title: "Demand Deleted",
    body: `Your demand (${existing.referenceNumber}) was deleted.`,
  });
});

const updateDemandStatus = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user.id;
  if (!status) {
    return next(new AppError("Status is required", 400));
  }
  const existing = await prisma.demand.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Demand not found", 404));
  }
  const updatedDemand = await prisma.demand.update({
    where: { id },
    data: {
      status,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    include: {
      section: true,
      material: true,
      creator: true,
      updater: true,
      approvals: {
        include: {
          user: {
            select: {
              name: true,
              role: true,
            },
          },
        },
      },
      fulfillments: true,
      purchaseOrders: true,
    },
  });
  res.json({
    message: "Demand status updated successfully",
    demand: {
      ...updatedDemand,
      approvals: Array.isArray(updatedDemand.approvals)
        ? updatedDemand.approvals.map((a) => ({
            ...a,
            userName: a.user && a.user.name ? a.user.name : null,
            userRole: a.user && a.user.role ? a.user.role : null,
            timestamp: a.createdAt,
          }))
        : updatedDemand.approvals,
    },
  });
  await sendNotificationToUserSafe({
    userId: updatedDemand.updatedBy ?? userId,
    title: "Demand Status Updated",
    body: `Demand (${updatedDemand.referenceNumber}) status changed to ${updatedDemand.status}.`,
  });
});

const approveDemand = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { remarks } = req.body;
  const userId = req.user.id;

  // Validate user role (PM, Site Incharge, or Admin can approve)
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  const allowedRoles = ["PROJECT_MANAGER", "SITE_INCHARGE", "ADMIN"];
  if (!allowedRoles.includes(user.role)) {
    return next(
      new AppError(
        "Only Project Managers, Site Incharges, or Admins can approve demands",
        403
      )
    );
  }

  // Check if demand exists
  const demand = await prisma.demand.findUnique({
    where: { id },
    include: {
      approvals: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
      },
    },
  });

  if (!demand) {
    return next(new AppError("Demand not found", 404));
  }

  if (demand.isDeleted) {
    return next(new AppError("Demand is deleted", 400));
  }

  // Check if user has already approved/rejected this demand
  const existingApproval = demand.approvals.find(
    (approval) => approval.userId === userId
  );
  if (existingApproval) {
    return next(
      new AppError("You have already provided feedback for this demand", 400)
    );
  }

  // Check if demand is already rejected
  const hasRejection = demand.approvals.some(
    (approval) => approval.status === "REJECTED"
  );
  if (hasRejection) {
    return next(new AppError("Demand is already rejected", 400));
  }

  // Check if demand is already fully approved
  const approvalCount = demand.approvals.filter(
    (approval) => approval.status === "APPROVED"
  ).length;
  if (approvalCount >= 2) {
    return next(new AppError("Demand is already fully approved", 400));
  }

  // Perform approval in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create approval record
    const approval = await tx.demandApproval.create({
      data: {
        demandId: id,
        userId,
        status: "APPROVED",
        remarks: remarks || "Approved",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Get updated demand with all approvals
    const updatedDemand = await tx.demand.findUnique({
      where: { id },
      include: {
        approvals: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
    });

    // Determine new status based on approval count
    const newApprovalCount = updatedDemand!.approvals.filter(
      (a) => a.status === "APPROVED"
    ).length;
    const hasRejection = updatedDemand!.approvals.some(
      (a) => a.status === "REJECTED"
    );

    let newStatus = "REQUEST_SENT";
    if (hasRejection) {
      newStatus = "REJECTED";
    } else if (newApprovalCount >= 2) {
      newStatus = "APPROVED";
    } else if (newApprovalCount === 1) {
      newStatus = "PARTIALLY_APPROVED";
    }

    // Update demand status
    const finalDemand = await tx.demand.update({
      where: { id },
      data: {
        status: newStatus as any,
        updatedBy: userId,
        updatedAt: new Date(),
      },
      include: {
        section: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        material: true,
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        approvals: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return { approval, demand: finalDemand };
  });

  res.json({
    message: "Demand approved successfully",
    data: {
      approval: {
        ...result.approval,
        userName: result.approval.user?.name || null,
        userRole: result.approval.user?.role || null,
        timestamp: result.approval.createdAt,
      },
      demand: {
        ...result.demand,
        approvals: Array.isArray(result.demand.approvals)
          ? result.demand.approvals.map((a) => ({
              ...a,
              userName: a.user && a.user.name ? a.user.name : null,
              userRole: a.user && a.user.role ? a.user.role : null,
              timestamp: a.createdAt,
            }))
          : result.demand.approvals,
      },
      newStatus: result.demand.status,
    },
  });

  // Use the new notification service for comprehensive notifications
  await NotificationService.notifyDemandApproval(id, userId, "APPROVED");
});

const rejectDemand = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { remarks } = req.body;
  const userId = req.user.id;

  if (!remarks) {
    return next(new AppError("Rejection remarks are required", 400));
  }

  // Validate user role (PM, Site Incharge, or Admin can reject)
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  const allowedRoles = ["PROJECT_MANAGER", "SITE_INCHARGE", "ADMIN"];
  if (!allowedRoles.includes(user.role)) {
    return next(
      new AppError(
        "Only Project Managers, Site Incharges, or Admins can reject demands",
        403
      )
    );
  }

  // Check if demand exists
  const demand = await prisma.demand.findUnique({
    where: { id },
    include: {
      approvals: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
      },
    },
  });

  if (!demand) {
    return next(new AppError("Demand not found", 404));
  }

  if (demand.isDeleted) {
    return next(new AppError("Demand is deleted", 400));
  }

  // Check if user has already approved/rejected this demand
  const existingApproval = demand.approvals.find(
    (approval) => approval.userId === userId
  );
  if (existingApproval) {
    return next(
      new AppError("You have already provided feedback for this demand", 400)
    );
  }

  // Check if demand is already rejected
  const hasRejection = demand.approvals.some(
    (approval) => approval.status === "REJECTED"
  );
  if (hasRejection) {
    return next(new AppError("Demand is already rejected", 400));
  }

  // Perform rejection in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create rejection record
    const approval = await tx.demandApproval.create({
      data: {
        demandId: id,
        userId,
        status: "REJECTED",
        remarks,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Update demand status to rejected
    const updatedDemand = await tx.demand.update({
      where: { id },
      data: {
        status: "REJECTED",
        updatedBy: userId,
        updatedAt: new Date(),
      },
      include: {
        section: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        material: true,
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        approvals: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return { approval, demand: updatedDemand };
  });

  res.json({
    message: "Demand rejected successfully",
    data: {
      approval: {
        ...result.approval,
        userName: result.approval.user?.name || null,
        userRole: result.approval.user?.role || null,
        timestamp: result.approval.createdAt,
      },
      demand: {
        ...result.demand,
        approvals: Array.isArray(result.demand.approvals)
          ? result.demand.approvals.map((a) => ({
              ...a,
              userName: a.user && a.user.name ? a.user.name : null,
              userRole: a.user && a.user.role ? a.user.role : null,
              timestamp: a.createdAt,
            }))
          : result.demand.approvals,
      },
    },
  });

  // Use the new notification service for comprehensive notifications
  await NotificationService.notifyDemandApproval(id, userId, "REJECTED");
});

const fulfillDemand = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const {
    fromStoreId, // Head store ID
    toStoreId, // CM store ID
    quantity,
    notes,
  } = req.body;
  const userId = req.user.id;

  if (!fromStoreId || !toStoreId || !quantity) {
    return next(
      new AppError("fromStoreId, toStoreId, and quantity are required", 400)
    );
  }

  if (quantity <= 0) {
    return next(new AppError("Quantity must be greater than 0", 400));
  }

  // Validate user role (PM or Site Incharge can fulfill)
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  const allowedRoles = ["PROJECT_MANAGER", "SITE_INCHARGE"];
  if (!allowedRoles.includes(user.role)) {
    return next(
      new AppError(
        "Only Project Managers or Site Incharges can fulfill demands",
        403
      )
    );
  }

  // Check if demand exists and is approved
  const demand = await prisma.demand.findUnique({
    where: { id },
    include: {
      section: {
        include: {
          project: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      material: true,
      fulfillments: true,
    },
  });

  if (!demand) {
    return next(new AppError("Demand not found", 404));
  }

  if (demand.isDeleted) {
    return next(new AppError("Demand is deleted", 400));
  }

  if (demand.status !== "APPROVED") {
    return next(new AppError("Only approved demands can be fulfilled", 400));
  }

  // Check if quantity exceeds remaining demand
  const remainingQuantity = demand.quantityRemaining || demand.quantity;
  if (quantity > remainingQuantity) {
    return next(
      new AppError(
        `Quantity exceeds remaining demand. Remaining: ${remainingQuantity}, Requested: ${quantity}`,
        400
      )
    );
  }

  // Validate stores
  const [fromStore, toStore] = await Promise.all([
    prisma.store.findUnique({
      where: { id: fromStoreId },
      include: { section: true },
    }),
    prisma.store.findUnique({
      where: { id: toStoreId },
      include: { section: true },
    }),
  ]);

  if (!fromStore || !toStore) {
    return next(new AppError("One or both stores not found", 404));
  }

  if (fromStore.type !== "HEAD_STORE") {
    return next(new AppError("From store must be a head store", 400));
  }

  if (toStore.type !== "CM_STORE") {
    return next(new AppError("To store must be a CM store", 400));
  }

  // Check if stores belong to the same section as the demand
  if (
    fromStore.sectionId !== demand.sectionId ||
    toStore.sectionId !== demand.sectionId
  ) {
    return next(
      new AppError("Stores must belong to the same section as the demand", 400)
    );
  }

  // Check if head store has sufficient stock
  const headStoreInventory = await prisma.storeInventory.findUnique({
    where: {
      storeId_materialId: {
        storeId: fromStoreId,
        materialId: demand.materialId,
      },
    },
  });

  if (!headStoreInventory || headStoreInventory.available < quantity) {
    return next(
      new AppError(
        `Insufficient stock in head store. Available: ${
          headStoreInventory?.available || 0
        }, Requested: ${quantity}`,
        400
      )
    );
  }

  // Perform fulfillment in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create fulfillment record
    const fulfillment = await tx.demandFulfillment.create({
      data: {
        demandId: id,
        fromStoreId,
        toStoreId,
        quantity,
        fulfilledBy: userId,
      },
      include: {
        fromStore: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        toStore: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    // Update head store inventory (decrease)
    await tx.storeInventory.update({
      where: {
        storeId_materialId: {
          storeId: fromStoreId,
          materialId: demand.materialId,
        },
      },
      data: {
        stock: {
          decrement: quantity,
        },
        available: {
          decrement: quantity,
        },
      },
    });

    // Update CM store inventory (increase)
    await tx.storeInventory.upsert({
      where: {
        storeId_materialId: {
          storeId: toStoreId,
          materialId: demand.materialId,
        },
      },
      update: {
        stock: {
          increment: quantity,
        },
        available: {
          increment: quantity,
        },
      },
      create: {
        storeId: toStoreId,
        materialId: demand.materialId,
        stock: quantity,
        available: quantity,
        reserved: 0,
      },
    });

    // Create store transactions
    await Promise.all([
      // Head store transaction (OUT)
      tx.storeTransaction.create({
        data: {
          storeId: fromStoreId,
          materialId: demand.materialId,
          type: "OUT",
          quantity,
          reference: demand.referenceNumber,
          notes: notes || `Fulfilled demand ${demand.referenceNumber}`,
          createdBy: userId,
        },
      }),
      // CM store transaction (IN)
      tx.storeTransaction.create({
        data: {
          storeId: toStoreId,
          materialId: demand.materialId,
          type: "IN",
          quantity,
          reference: demand.referenceNumber,
          notes:
            notes ||
            `Received from demand fulfillment ${demand.referenceNumber}`,
          createdBy: userId,
        },
      }),
    ]);

    // Update demand status
    const newRemainingQuantity = Number(remainingQuantity) - Number(quantity);
    const newFulfilledQuantity =
      Number(demand.quantityFulfilled || 0) + Number(quantity);

    const updatedDemand = await tx.demand.update({
      where: { id },
      data: {
        quantityRemaining: newRemainingQuantity,
        quantityFulfilled: newFulfilledQuantity,
        status:
          newRemainingQuantity <= 0 ? "COMPLETED" : "FULFILLED_FROM_STORE",
        updatedBy: userId,
        updatedAt: new Date(),
      },
      include: {
        section: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        material: true,
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        fulfillments: {
          include: {
            fromStore: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
            toStore: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
          orderBy: { fulfilledAt: "asc" },
        },
      },
    });

    return { fulfillment, demand: updatedDemand };
  });

  res.json({
    message: "Demand fulfilled successfully",
    data: {
      fulfillment: result.fulfillment,
      demand: result.demand,
      remainingQuantity: result.demand.quantityRemaining,
    },
  });
});

export {
  createDemand,
  getDemands,
  getDemandById,
  updateDemand,
  deleteDemand,
  updateDemandStatus,
  approveDemand,
  rejectDemand,
  fulfillDemand,
};
