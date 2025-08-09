import { PrismaClient } from "@prisma/client";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import {
  buildQueryOptions,
  extractQueryParams,
  buildPaginationMeta,
} from "../utils/buildQueryOptions";
import { TRANSACTION_REFERENCES } from "../constants";
import { sendNotificationToUserSafe } from "../utils/notification";
import { NotificationService } from "../utils/notificationService";

const prisma = new PrismaClient();

const createStore = catchAsync(async (req, res, next) => {
  const {
    name,
    type,
    sectionId,
    cmUserId,
    initialStock, // Array of { materialId, quantity, notes? }
  } = req.body;
  const userId = req.user.id;

  if (!name || !type || !sectionId) {
    return next(new AppError("Name, type, and sectionId are required", 400));
  }

  // Check if section exists
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
  });

  if (!section) {
    return next(new AppError("Section not found", 404));
  }

  // For CM stores, cmUserId is required
  if (type === "CM_STORE" && !cmUserId) {
    return next(new AppError("CM User ID is required for CM stores", 400));
  }

  // Check if CM user exists and has CONSTRUCTION_MANAGER role
  if (cmUserId) {
    const cmUser = await prisma.user.findUnique({
      where: { id: cmUserId },
    });

    if (!cmUser) {
      return next(new AppError("CM User not found", 404));
    }

    if (cmUser.role !== "CONSTRUCTION_MANAGER") {
      return next(
        new AppError("CM User must have CONSTRUCTION_MANAGER role", 400)
      );
    }
  }

  // Validate initial stock if provided
  if (initialStock && Array.isArray(initialStock)) {
    for (const item of initialStock) {
      if (!item.materialId || !item.quantity) {
        return next(
          new AppError(
            "Each initial stock item must have materialId and quantity",
            400
          )
        );
      }

      if (item.quantity <= 0) {
        return next(
          new AppError("Initial stock quantity must be greater than 0", 400)
        );
      }

      // Check if material exists
      const material = await prisma.material.findUnique({
        where: { id: item.materialId },
      });

      if (!material) {
        return next(
          new AppError(`Material with ID ${item.materialId} not found`, 404)
        );
      }
    }
  }

  // Create store with initial stock in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create the store
    const store = await tx.store.create({
      data: {
        name,
        type,
        sectionId,
        cmUserId,
        createdBy: userId,
      },
      include: {
        section: {
          select: {
            id: true,
            name: true,
          },
        },
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
    });

    // Add initial stock if provided
    if (initialStock && Array.isArray(initialStock)) {
      for (const item of initialStock) {
        // Create or update store inventory
        await tx.storeInventory.upsert({
          where: {
            storeId_materialId: {
              storeId: store.id,
              materialId: item.materialId,
            },
          },
          update: {
            stock: {
              increment: item.quantity,
            },
            available: {
              increment: item.quantity,
            },
          },
          create: {
            storeId: store.id,
            materialId: item.materialId,
            stock: item.quantity,
            available: item.quantity,
            reserved: 0,
          },
        });

        // Create store transaction record
        await tx.storeTransaction.create({
          data: {
            storeId: store.id,
            materialId: item.materialId,
            type: "IN",
            quantity: item.quantity,
            reference: TRANSACTION_REFERENCES.INITIAL_STOCK,
            notes: item.notes || "Initial stock setup",
            createdBy: userId,
          },
        });
      }
    }

    return store;
  });

  res.status(201).json({
    message: "Store created successfully",
    store: result,
  });
});

const getStores = catchAsync(async (req, res) => {
  const user = req.user;
  // Extract query parameters
  const filterOptions = extractQueryParams(req);

  // Define searchable fields for stores
  const searchableFields = ["name"];

  // Build default filters
  let defaultFilters: any = { isDeleted: false };

  if (user.role === "ADMIN") {
    // No filter, see all
  } else if (user.role === "PROJECT_MANAGER") {
    // Get assigned sectionIds
    const assignments = await prisma.projectManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    defaultFilters.sectionId = { in: sectionIds };
  } else if (user.role === "SITE_INCHARGE") {
    const assignments = await prisma.siteInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    defaultFilters.sectionId = { in: sectionIds };
  } else if (user.role === "STORE_INCHARGE") {
    if (user.isHead) {
      // Head store incharge can see all stores
    } else {
      // Only stores assigned to this store incharge
      const assignments = await prisma.storeInchargeAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { storeId: true },
      });
      const storeIds = assignments.map((a) => a.storeId);
      defaultFilters.id = { in: storeIds };
    }
  } else if (user.role === "ACCOUNTANT") {
    // If user is head accountant, they can see all stores
    if (user.isHead) {
      // No filter, see all stores
    } else {
      // Regular accountant - only stores in assigned sections
      const assignments = await prisma.accountantAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);
      defaultFilters.sectionId = { in: sectionIds };
    }
  } else {
    // Other roles: no stores
    defaultFilters.id = { in: [] };
  }

  // Build query options
  const queryOptions = buildQueryOptions(
    filterOptions,
    defaultFilters,
    searchableFields
  );

  // Get total count for pagination
  const total = await prisma.store.count({
    where: queryOptions.where,
  });

  // Get stores with pagination
  const stores = await prisma.store.findMany({
    ...queryOptions,
    include: {
      section: {
        select: {
          id: true,
          name: true,
          project: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
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
  });

  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(
    total,
    filterOptions.page || 1,
    filterOptions.limit || 50
  );

  res.json({
    message: "Stores retrieved successfully",
    stores,
    ...paginationMeta,
  });
});

const getStoreById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const user = req.user;

  // Role-based access check
  if (user.role !== "ADMIN") {
    let assigned = false;
    if (user.role === "STORE_INCHARGE") {
      const assignment = await prisma.storeInchargeAssignment.findFirst({
        where: { userId: user.id, storeId: id, isActive: true },
      });
      assigned = !!assignment;
    } else if (user.role === "SITE_INCHARGE") {
      // Site incharge can access if assigned to the section of this store
      const store = await prisma.store.findUnique({
        where: { id },
        select: { sectionId: true },
      });
      if (store) {
        const assignment = await prisma.siteInchargeAssignment.findFirst({
          where: {
            userId: user.id,
            sectionId: store.sectionId,
            isActive: true,
          },
        });
        assigned = !!assignment;
      }
    } else if (user.role === "PROJECT_MANAGER") {
      const store = await prisma.store.findUnique({
        where: { id },
        select: { sectionId: true },
      });
      if (store) {
        const assignment = await prisma.projectManagerAssignment.findFirst({
          where: {
            userId: user.id,
            sectionId: store.sectionId,
            isActive: true,
          },
        });
        assigned = !!assignment;
      }
    } else if (user.role === "CONSTRUCTION_MANAGER") {
      const store = await prisma.store.findUnique({
        where: { id },
        select: { sectionId: true },
      });
      if (store) {
        const assignment = await prisma.constructionManagerAssignment.findFirst(
          {
            where: {
              userId: user.id,
              sectionId: store.sectionId,
              isActive: true,
            },
          }
        );
        assigned = !!assignment;
      }
    } else if (user.role === "ACCOUNTANT") {
      // If user is head accountant, they can access all stores
      if (user.isHead) {
        assigned = true;
      } else {
        // Regular accountant - only stores in assigned sections
        const store = await prisma.store.findUnique({
          where: { id },
          select: { sectionId: true },
        });
        if (store) {
          const assignment = await prisma.accountantAssignment.findFirst({
            where: {
              userId: user.id,
              sectionId: store.sectionId,
              isActive: true,
            },
          });
          assigned = !!assignment;
        }
      }
    }
    if (!assigned) {
      return next(
        new AppError("Access denied: not assigned to this store", 403)
      );
    }
  }

  const store = await prisma.store.findUnique({
    where: { id },
    include: {
      section: {
        select: {
          id: true,
          name: true,
          project: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
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
      inventory: {
        include: {
          material: {
            select: {
              id: true,
              name: true,
              unit: true,
            },
          },
        },
      },
      transactions: true,
    },
  });

  if (!store) {
    return next(new AppError("Store not found", 404));
  }

  res.json({
    message: "Store retrieved successfully",
    store,
  });
});

const updateStore = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = { ...req.body };
  const userId = req.user.id;

  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.createdAt;
  delete updates.createdBy;
  delete updates.sectionId;

  const existing = await prisma.store.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Store not found", 404));
  }

  // For CM stores, cmUserId is required
  if (updates.type === "CM_STORE" && !updates.cmUserId) {
    return next(new AppError("CM User ID is required for CM stores", 400));
  }

  // Check if CM user exists and has CONSTRUCTION_MANAGER role
  if (updates.cmUserId) {
    const cmUser = await prisma.user.findUnique({
      where: { id: updates.cmUserId },
    });

    if (!cmUser) {
      return next(new AppError("CM User not found", 404));
    }

    if (cmUser.role !== "CONSTRUCTION_MANAGER") {
      return next(
        new AppError("CM User must have CONSTRUCTION_MANAGER role", 400)
      );
    }
  }

  const updatedStore = await prisma.store.update({
    where: { id },
    data: {
      ...updates,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    include: {
      section: {
        select: {
          id: true,
          name: true,
        },
      },
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
  });

  res.json({
    message: "Store updated successfully",
    store: updatedStore,
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Store Updated",
    body: `Store ${updatedStore.name} was updated successfully.`,
  });
});

const deleteStore = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.store.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Store not found", 404));
  }

  // Delete all store incharge assignments for this store
  await prisma.storeInchargeAssignment.deleteMany({ where: { storeId: id } });

  await prisma.store.update({
    where: { id },
    data: {
      isDeleted: true,
      isActive: false,
      updatedBy: userId,
      updatedAt: new Date(),
    },
  });

  res.json({
    message: "Store deleted successfully",
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Store Deleted",
    body: `Store ${existing.name} was deleted successfully.`,
  });
});

const activateStore = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.store.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Store not found", 404));
  }

  const updatedStore = await prisma.store.update({
    where: { id },
    data: {
      isActive: true,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    include: {
      section: {
        select: {
          id: true,
          name: true,
        },
      },
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
  });

  res.json({
    message: "Store activated successfully",
    store: updatedStore,
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Store Activated",
    body: `Store ${updatedStore.name} was activated successfully.`,
  });
});

const deactivateStore = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.store.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Store not found", 404));
  }

  const updatedStore = await prisma.store.update({
    where: { id },
    data: {
      isActive: false,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    include: {
      section: {
        select: {
          id: true,
          name: true,
        },
      },
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
  });

  res.json({
    message: "Store deactivated successfully",
    store: updatedStore,
  });
  await sendNotificationToUserSafe({
    userId,
    title: "Store Deactivated",
    body: `Store ${updatedStore.name} was deactivated successfully.`,
  });
});

const stockIn = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;
  const {
    materialId,
    quantity,
    poReferenceNumber, // Optional - for PO-based stock in
    notes,
    stockInType = "PO", // PO, INITIAL, TRANSFER, MANUAL
  } = req.body;
  const userId = req.user.id;

  // Validate required fields
  if (!materialId || !quantity) {
    return next(new AppError("Material ID and quantity are required", 400));
  }

  if (quantity <= 0) {
    return next(new AppError("Quantity must be greater than 0", 400));
  }

  // Validate store exists and user has access
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      storeInchargeAssignments: {
        where: { isActive: true },
        include: {
          user: {
            select: { id: true, isHead: true },
          },
        },
      },
    },
  });

  if (!store) {
    return next(new AppError("Store not found", 404));
  }

  if (store.isDeleted || !store.isActive) {
    return next(new AppError("Store is not active", 400));
  }

  // Check if user is store incharge for this store or has isHead permission
  const isStoreIncharge = store.storeInchargeAssignments.some(
    (assignment) => assignment.user.id === userId
  );

  // Get current user to check isHead status
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { isHead: true },
  });

  if (!isStoreIncharge && !currentUser?.isHead) {
    return next(
      new AppError(
        "Only store incharges or head store incharges can perform stock operations",
        403
      )
    );
  }

  // Validate material exists
  const material = await prisma.material.findUnique({
    where: { id: materialId },
  });

  if (!material) {
    return next(new AppError("Material not found", 404));
  }

  if (material.isDeleted || !material.isActive) {
    return next(new AppError("Material is not active", 400));
  }

  // Validate PO reference if provided
  if (poReferenceNumber && stockInType === "PO") {
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: {
        referenceNumber: poReferenceNumber,
        isDeleted: false,
      },
      // items removed; use materialId and vendorId directly if needed
    });

    if (!purchaseOrder) {
      return next(new AppError("Purchase order not found", 404));
    }

    // Check if PO is in appropriate status for stock in
    if (
      !["CONFIRMED", "ORDER_PLACED", "IN_TRANSIT"].includes(
        purchaseOrder.status
      )
    ) {
      return next(
        new AppError(
          "Purchase order is not in appropriate status for stock in. Must be CONFIRMED, ORDER_PLACED, or IN_TRANSIT",
          400
        )
      );
    }
  }

  // Perform stock in operation in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update or create store inventory
    const inventory = await tx.storeInventory.upsert({
      where: {
        storeId_materialId: {
          storeId,
          materialId,
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
        storeId,
        materialId,
        stock: quantity,
        available: quantity,
        reserved: 0,
      },
    });

    // Create store transaction record
    const transaction = await tx.storeTransaction.create({
      data: {
        storeId,
        materialId,
        type: "IN",
        quantity,
        reference: poReferenceNumber || stockInType.toUpperCase(),
        notes: notes || `${stockInType} stock in`,
        createdBy: userId,
      },
    });

    // Update PO status if it's a PO-based stock in
    if (poReferenceNumber && stockInType === "PO") {
      const po = await tx.purchaseOrder.findFirst({
        where: { referenceNumber: poReferenceNumber },
      });
      if (po) {
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { status: "COMPLETED" }, // Change to COMPLETED when stock is received
        });
      }
    }

    return {
      inventory,
      transaction,
    };
  });

  res.json({
    message: "Stock in successful",
    data: {
      storeId,
      materialId,
      quantity,
      newStock: result.inventory.stock,
      newAvailable: result.inventory.available,
      transaction: result.transaction,
    },
  });

  // Use the new notification service for comprehensive notifications
  await NotificationService.notifyStoreTransaction(result.transaction.id);
});

const stockOut = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;
  const {
    materialId,
    quantity,
    demandReferenceNumber, // Optional - for demand-based stock out
    notes,
    stockOutType = "DEMAND", // DEMAND, TRANSFER, MANUAL, LOSS
  } = req.body;
  const userId = req.user.id;

  // Validate required fields
  if (!materialId || !quantity) {
    return next(new AppError("Material ID and quantity are required", 400));
  }

  if (quantity <= 0) {
    return next(new AppError("Quantity must be greater than 0", 400));
  }

  // Validate store exists and user has access
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      storeInchargeAssignments: {
        where: { isActive: true },
        include: {
          user: {
            select: { id: true, isHead: true },
          },
        },
      },
    },
  });

  if (!store) {
    return next(new AppError("Store not found", 404));
  }

  if (store.isDeleted || !store.isActive) {
    return next(new AppError("Store is not active", 400));
  }

  // Check if user is store incharge for this store or has isHead permission
  const isStoreIncharge = store.storeInchargeAssignments.some(
    (assignment) => assignment.user.id === userId
  );

  // Get current user to check isHead status
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { isHead: true },
  });

  if (!isStoreIncharge && !currentUser?.isHead) {
    return next(
      new AppError(
        "Only store incharges or head store incharges can perform stock operations",
        403
      )
    );
  }

  // Validate material exists
  const material = await prisma.material.findUnique({
    where: { id: materialId },
  });

  if (!material) {
    return next(new AppError("Material not found", 404));
  }

  if (material.isDeleted || !material.isActive) {
    return next(new AppError("Material is not active", 400));
  }

  // Check current inventory
  const currentInventory = await prisma.storeInventory.findUnique({
    where: {
      storeId_materialId: {
        storeId,
        materialId,
      },
    },
  });

  if (!currentInventory) {
    return next(
      new AppError("No inventory found for this material in the store", 404)
    );
  }

  // Check if sufficient stock is available
  if (currentInventory.available < quantity) {
    return next(
      new AppError(
        `Insufficient stock. Available: ${currentInventory.available}, Requested: ${quantity}`,
        400
      )
    );
  }

  // Validate demand reference if provided
  if (demandReferenceNumber && stockOutType === "DEMAND") {
    const demand = await prisma.demand.findFirst({
      where: {
        referenceNumber: demandReferenceNumber,
        isDeleted: false,
      },
    });

    if (!demand) {
      return next(new AppError("Demand not found", 404));
    }

    // Check if demand is in appropriate status for stock out
    if (!["APPROVED", "FULFILLED_FROM_STORE"].includes(demand.status)) {
      return next(
        new AppError("Demand is not in appropriate status for stock out", 400)
      );
    }

    // Check if remaining quantity is sufficient
    const remainingQuantity = demand.quantityRemaining || demand.quantity;
    if (remainingQuantity < quantity) {
      return next(
        new AppError(
          `Requested quantity exceeds remaining demand quantity. Remaining: ${remainingQuantity}, Requested: ${quantity}`,
          400
        )
      );
    }
  }

  // Perform stock out operation in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update store inventory
    const updatedInventory = await tx.storeInventory.update({
      where: {
        storeId_materialId: {
          storeId,
          materialId,
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

    // Create store transaction record
    const transaction = await tx.storeTransaction.create({
      data: {
        storeId,
        materialId,
        type: "OUT",
        quantity,
        reference: demandReferenceNumber || stockOutType.toUpperCase(),
        notes: notes || `${stockOutType} stock out`,
        createdBy: userId,
      },
    });

    // Update demand status if it's a demand-based stock out
    if (demandReferenceNumber && stockOutType === "DEMAND") {
      const demand = await tx.demand.findFirst({
        where: { referenceNumber: demandReferenceNumber },
      });

      if (demand) {
        // Check if this will complete the demand
        const currentRemaining = demand.quantityRemaining || demand.quantity;
        const willComplete = currentRemaining <= quantity;

        await tx.demand.update({
          where: { id: demand.id },
          data: {
            quantityRemaining: {
              decrement: quantity,
            },
            quantityFulfilled: {
              increment: quantity,
            },
            status: willComplete ? "COMPLETED" : "FULFILLED_FROM_STORE",
          },
        });
      }
    }

    return {
      inventory: updatedInventory,
      transaction,
    };
  });

  res.json({
    message: "Stock out successful",
    data: {
      storeId,
      materialId,
      quantity,
      remainingStock: result.inventory.stock,
      remainingAvailable: result.inventory.available,
      transaction: result.transaction,
    },
  });

  // Use the new notification service for comprehensive notifications
  await NotificationService.notifyStoreTransaction(result.transaction.id);
});

const getStoreInventory = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;
  const { materialId } = req.query;

  // Validate store exists
  const store = await prisma.store.findUnique({
    where: { id: storeId },
  });

  if (!store) {
    return next(new AppError("Store not found", 404));
  }

  // Build where clause
  const where: any = { storeId };
  if (materialId) {
    where.materialId = materialId as string;
  }

  const inventory = await prisma.storeInventory.findMany({
    where,
    include: {
      material: {
        select: {
          id: true,
          name: true,
          unit: true,
          description: true,
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
    message: "Store inventory retrieved successfully",
    store: {
      id: store.id,
      name: store.name,
      type: store.type,
    },
    inventory,
  });
});

const getStoreTransactions = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;
  const {
    materialId,
    type,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = req.query;

  // Validate store exists
  const store = await prisma.store.findUnique({
    where: { id: storeId },
  });

  if (!store) {
    return next(new AppError("Store not found", 404));
  }

  // Build where clause
  const where: any = { storeId };
  if (materialId) {
    where.materialId = materialId as string;
  }
  if (type) {
    where.type = type as string;
  }
  if (startDate || endDate) {
    where.transactionDate = {};
    if (startDate) {
      where.transactionDate.gte = new Date(startDate as string);
    }
    if (endDate) {
      where.transactionDate.lte = new Date(endDate as string);
    }
  }

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [transactions, total] = await Promise.all([
    prisma.storeTransaction.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        transactionDate: "desc",
      },
      skip,
      take: parseInt(limit as string),
    }),
    prisma.storeTransaction.count({ where }),
  ]);

  res.json({
    message: "Store transactions retrieved successfully",
    store: {
      id: store.id,
      name: store.name,
      type: store.type,
    },
    transactions,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      pages: Math.ceil(total / parseInt(limit as string)),
    },
  });
});

const getProjectInventory = catchAsync(async (req, res, next) => {
  const { projectId } = req.params;
  const { sectionIds } = req.query; // Can be single sectionId or array of sectionIds

  // Validate project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      sections: {
        where: { isDeleted: false },
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  if (!project) {
    return next(new AppError("Project not found", 404));
  }

  // Parse section IDs
  let targetSectionIds: string[] = [];
  if (sectionIds) {
    if (Array.isArray(sectionIds)) {
      targetSectionIds = sectionIds as string[];
    } else {
      targetSectionIds = [sectionIds as string];
    }
  } else {
    // If no section IDs provided, get all sections in the project
    targetSectionIds = project.sections.map((section) => section.id);
  }

  // Validate that all provided section IDs belong to this project
  const validSectionIds = project.sections.map((section) => section.id);
  const invalidSectionIds = targetSectionIds.filter(
    (id) => !validSectionIds.includes(id)
  );

  if (invalidSectionIds.length > 0) {
    return next(
      new AppError(`Invalid section IDs: ${invalidSectionIds.join(", ")}`, 400)
    );
  }

  // Get all stores in the target sections
  const stores = await prisma.store.findMany({
    where: {
      sectionId: { in: targetSectionIds },
      isDeleted: false,
      isActive: true,
    },
    include: {
      section: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      inventory: {
        include: {
          material: {
            select: {
              id: true,
              name: true,
              unit: true,
              description: true,
            },
          },
        },
      },
      transactions: {
        where: {
          transactionDate: {
            gte: new Date(new Date().getFullYear(), 0, 1), // From start of current year
          },
        },
        select: {
          materialId: true,
          type: true,
          quantity: true,
          transactionDate: true,
        },
      },
    },
  });

  // Group inventory by material across all stores
  const materialInventoryMap = new Map();

  stores.forEach((store) => {
    store.inventory.forEach((inventoryItem) => {
      const materialId = inventoryItem.materialId;

      if (!materialInventoryMap.has(materialId)) {
        materialInventoryMap.set(materialId, {
          material: inventoryItem.material,
          totalStock: 0,
          totalReserved: 0,
          totalAvailable: 0,
          stores: [],
          usage: {
            totalIn: 0,
            totalOut: 0,
            netUsage: 0,
          },
        });
      }

      const materialData = materialInventoryMap.get(materialId);
      materialData.totalStock += Number(inventoryItem.stock);
      materialData.totalReserved += Number(inventoryItem.reserved);
      materialData.totalAvailable += Number(inventoryItem.available);

      // Add store-specific inventory
      materialData.stores.push({
        storeId: store.id,
        storeName: store.name,
        storeType: store.type,
        sectionName: store.section.name,
        sectionCode: store.section.code,
        stock: Number(inventoryItem.stock),
        reserved: Number(inventoryItem.reserved),
        available: Number(inventoryItem.available),
      });
    });

    // Calculate usage from transactions
    store.transactions.forEach((transaction) => {
      const materialId = transaction.materialId;

      if (materialInventoryMap.has(materialId)) {
        const materialData = materialInventoryMap.get(materialId);
        const quantity = Number(transaction.quantity);

        if (transaction.type === "IN") {
          materialData.usage.totalIn += quantity;
        } else if (transaction.type === "OUT") {
          materialData.usage.totalOut += quantity;
        }
      }
    });
  });

  // Calculate net usage and prepare final response
  const inventorySummary = Array.from(materialInventoryMap.values()).map(
    (materialData) => {
      materialData.usage.netUsage =
        materialData.usage.totalOut - materialData.usage.totalIn;

      // Calculate usage percentage
      const totalReceived =
        materialData.usage.totalIn + materialData.totalStock;
      const usagePercentage =
        totalReceived > 0
          ? (materialData.usage.totalOut / totalReceived) * 100
          : 0;

      return {
        material: materialData.material,
        summary: {
          totalStock: materialData.totalStock,
          totalReserved: materialData.totalReserved,
          totalAvailable: materialData.totalAvailable,
          usage: {
            totalIn: materialData.usage.totalIn,
            totalOut: materialData.usage.totalOut,
            netUsage: materialData.usage.netUsage,
            usagePercentage: Math.round(usagePercentage * 100) / 100,
          },
        },
        stores: materialData.stores,
      };
    }
  );

  // Sort by material name
  inventorySummary.sort((a, b) =>
    a.material.name.localeCompare(b.material.name)
  );

  // Prepare response
  const response = {
    project: {
      id: project.id,
      name: project.name,
      code: project.code,
    },
    sections: targetSectionIds.map((sectionId) => {
      const section = project.sections.find((s) => s.id === sectionId);
      return {
        id: section?.id,
        name: section?.name,
        code: section?.code,
      };
    }),
    stores: stores.map((store) => ({
      id: store.id,
      name: store.name,
      type: store.type,
      section: store.section,
    })),
    inventory: inventorySummary,
    summary: {
      totalMaterials: inventorySummary.length,
      totalStores: stores.length,
      totalSections: targetSectionIds.length,
      totalStockValue: inventorySummary.reduce(
        (sum, item) => sum + item.summary.totalStock,
        0
      ),
      totalUsage: inventorySummary.reduce(
        (sum, item) => sum + item.summary.usage.totalOut,
        0
      ),
    },
  };

  res.json({
    message: "Project inventory retrieved successfully",
    data: response,
  });
});

export {
  createStore,
  getStores,
  getStoreById,
  updateStore,
  deleteStore,
  activateStore,
  deactivateStore,
  stockIn,
  stockOut,
  getStoreInventory,
  getStoreTransactions,
  getProjectInventory,
};
