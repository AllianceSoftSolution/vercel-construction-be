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
import prisma from "../utils/prisma";

const createStore = catchAsync(async (req, res, next) => {
  const {
    name,
    type,
    sectionId,
    projectId,
    cmUserId,
    initialStock, // Array of { materialId, quantity, notes? }
  } = req.body;
  const userId = req.user.id;

  if (!name || !type) {
    return next(new AppError("Name and type are required", 400));
  }

  // HEAD_STORE requires projectId; SECTION_STORE and CM_STORE require sectionId
  if (type === "HEAD_STORE" && !projectId) {
    return next(new AppError("projectId is required for HEAD_STORE", 400));
  }
  if ((type === "SECTION_STORE" || type === "CM_STORE") && !sectionId) {
    return next(new AppError("sectionId is required for SECTION_STORE and CM_STORE", 400));
  }

  // Validate section exists (for non HEAD_STORE)
  let section: any = null;
  if (sectionId) {
    section = await prisma.section.findUnique({
      where: { id: sectionId },
    });
    if (!section) {
      return next(new AppError("Section not found", 404));
    }
  }

  // Validate project exists (for HEAD_STORE)
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      return next(new AppError("Project not found", 404));
    }
  }

  // Enforce only ONE HEAD_STORE per project
  if (type === "HEAD_STORE") {
    const existingHead = await prisma.store.findFirst({
      where: { projectId, type: "HEAD_STORE", isDeleted: false },
    });
    if (existingHead) {
      return next(new AppError("A Head Store already exists for this project", 400));
    }
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
        sectionId: sectionId || null,
        projectId: projectId || null,
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
  const { projectId } = req.query;
  // Extract query parameters (exclude projectId from filters since we handle it manually)
  const filterOptions = extractQueryParams(req);
  if (filterOptions.filters && filterOptions.filters.projectId) {
    delete filterOptions.filters.projectId;
  }

  // Define searchable fields for stores
  const searchableFields = ["name"];

  // Build default filters
  let defaultFilters: any = { isDeleted: false };

  // Filter by projectId if provided (across sectionId->project and direct projectId)
  if (projectId) {
    defaultFilters.OR = [
      { projectId: projectId as string },
      { section: { projectId: projectId as string } },
    ];
  }

  if (user.role === "ADMIN") {
    // No additional filter, see all
  } else if (user.role === "PROJECT_MANAGER") {
    // Get assigned sectionIds and projectIds
    const assignments = await prisma.projectManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true, projectId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    // PM only sees SECTION_STORE types (not HEAD_STORE)
    defaultFilters.type = "SECTION_STORE";
    defaultFilters.sectionId = { in: sectionIds };
    // Also allow project-level filtering if projectId query param was provided
    if (defaultFilters.OR) {
      defaultFilters.AND = [
        { OR: defaultFilters.OR },
        { sectionId: { in: sectionIds } },
      ];
      delete defaultFilters.OR;
      delete defaultFilters.sectionId;
    }
  } else if (user.role === "SITE_INCHARGE") {
    const assignments = await prisma.siteInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true, projectId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    const projectIds = [...new Set(assignments.map((a) => a.projectId))];
    const roleOR: any[] = [{ sectionId: { in: sectionIds } }];
    if (projectIds.length > 0) roleOR.push({ projectId: { in: projectIds } });
    defaultFilters.OR = defaultFilters.OR
      ? [{ AND: [{ OR: defaultFilters.OR }, { OR: roleOR }] }]
      : roleOR;
    delete defaultFilters.sectionId;
  } else if (user.role === "CONSTRUCTION_MANAGER") {
    const assignments = await prisma.constructionManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    // CM sees: SECTION_STOREs in their assigned sections + CM_STOREs explicitly assigned to them
    const cmStoreFilter: any[] = [
      { type: "SECTION_STORE", sectionId: { in: sectionIds } },
      { type: "CM_STORE", cmUserId: user.id },
    ];
    if (defaultFilters.OR) {
      // Combine with any existing OR filter (e.g., from projectId query param)
      defaultFilters.AND = [
        { OR: defaultFilters.OR },
        { OR: cmStoreFilter },
      ];
      delete defaultFilters.OR;
    } else {
      defaultFilters.OR = cmStoreFilter;
    }
  } else if (user.role === "STORE_INCHARGE") {
    if (user.isHead) {
      // Head Store Incharge: sees all stores in their assigned projects
      const headAssignments = await prisma.headStoreInchargeAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { projectId: true },
      });
      const projectIds = headAssignments.map((a) => a.projectId);
      // Stores belonging to the assigned projects (HEAD_STORE) or sections within those projects
      const projectSections = await prisma.section.findMany({
        where: { projectId: { in: projectIds }, isDeleted: false },
        select: { id: true },
      });
      const sectionIds = projectSections.map((s) => s.id);

      // Also include stores directly assigned via assignPersonnel (storeInchargeAssignment)
      const directAssignments = await prisma.storeInchargeAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { storeId: true },
      });
      const directStoreIds = directAssignments.map((a) => a.storeId);

      const orConditions: any[] = [
        { projectId: { in: projectIds } },
        { sectionId: { in: sectionIds } },
      ];
      if (directStoreIds.length > 0) {
        orConditions.push({ id: { in: directStoreIds } });
      }

      // If a specific projectId was requested, intersect it with the authorised scope
      // (same pattern as SITE_INCHARGE / CM) so we honour both constraints.
      if (defaultFilters.OR) {
        defaultFilters.AND = [
          { OR: defaultFilters.OR },
          { OR: orConditions },
        ];
        delete defaultFilters.OR;
      } else {
        defaultFilters.OR = orConditions;
      }
    } else {
      // Regular store incharges only see stores explicitly assigned to them
      const assignments = await prisma.storeInchargeAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { storeId: true },
      });
      const storeIds = assignments.map((a) => a.storeId);
      defaultFilters.id = { in: storeIds };
    }
  } else if (user.role === "ACCOUNTANT") {
    // All accountants (including head) only see stores in sections they are explicitly assigned to
    const assignments = await prisma.accountantAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);
    defaultFilters.sectionId = { in: sectionIds };
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
      project: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      assignedUser: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
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
      if (user.isHead) {
        // Head Store Incharge: check if store belongs to one of their assigned projects
        // OR if the store was directly assigned via assignPersonnel
        const store = await prisma.store.findUnique({
          where: { id },
          select: { projectId: true, sectionId: true },
        });
        if (store) {
          let projectId = store.projectId;
          if (!projectId && store.sectionId) {
            const section = await prisma.section.findUnique({
              where: { id: store.sectionId },
              select: { projectId: true },
            });
            projectId = section?.projectId ?? null;
          }
          if (projectId) {
            const headAssignment = await prisma.headStoreInchargeAssignment.findFirst({
              where: { userId: user.id, projectId, isActive: true },
            });
            assigned = !!headAssignment;
          }
          // Fallback: also check direct storeInchargeAssignment (assigned via assignPersonnel)
          if (!assigned) {
            const directAssignment = await prisma.storeInchargeAssignment.findFirst({
              where: { userId: user.id, storeId: id, isActive: true },
            });
            assigned = !!directAssignment;
          }
        }
      } else {
        // Regular store incharges need explicit assignment
        const assignment = await prisma.storeInchargeAssignment.findFirst({
          where: { userId: user.id, storeId: id, isActive: true },
        });
        assigned = !!assignment;
      }
    } else if (user.role === "SITE_INCHARGE") {
      // Site incharge can access if assigned to the section of this store
      const store = await prisma.store.findUnique({
        where: { id },
        select: { sectionId: true, projectId: true },
      });
      if (store) {
        if (store.sectionId) {
          const assignment = await prisma.siteInchargeAssignment.findFirst({
            where: {
              userId: user.id,
              sectionId: store.sectionId,
              isActive: true,
            },
          });
          assigned = !!assignment;
        } else if (store.projectId) {
          // HEAD_STORE: check if SI is assigned to any section in the project
          const sections = await prisma.section.findMany({
            where: { projectId: store.projectId },
            select: { id: true },
          });
          for (const section of sections) {
            const found = await prisma.siteInchargeAssignment.findFirst({
              where: { userId: user.id, sectionId: section.id, isActive: true },
            });
            if (found) { assigned = true; break; }
          }
        }
      }
    } else if (user.role === "PROJECT_MANAGER") {
      const store = await prisma.store.findUnique({
        where: { id },
        select: { sectionId: true, projectId: true },
      });
      if (store) {
        if (store.sectionId) {
          const assignment = await prisma.projectManagerAssignment.findFirst({
            where: {
              userId: user.id,
              sectionId: store.sectionId,
              isActive: true,
            },
          });
          assigned = !!assignment;
        } else if (store.projectId) {
          // HEAD_STORE: check if PM is assigned to any section in the project
          const sections = await prisma.section.findMany({
            where: { projectId: store.projectId },
            select: { id: true },
          });
          for (const section of sections) {
            const found = await prisma.projectManagerAssignment.findFirst({
              where: { userId: user.id, sectionId: section.id, isActive: true },
            });
            if (found) { assigned = true; break; }
          }
        }
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
              sectionId: store.sectionId ?? undefined,
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
              sectionId: store.sectionId ?? undefined,
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
      transactions: {
        orderBy: { transactionDate: "desc" },
        include: {
          fromStore: {
            select: { id: true, name: true, type: true },
          },
          toStore: {
            select: { id: true, name: true, type: true },
          },
        },
      },
    },
  });

  if (!store) {
    return next(new AppError("Store not found", 404));
  }

  // For STORE_INCHARGE: hide fromStore / toStore details for stores outside the
  // current store's project so cross-project names are not leaked.
  let storeResponse: any = store;
  if (user.role === "STORE_INCHARGE" && (store as any).transactions?.length > 0) {
    const visibleStoreIds = await getFlowVisibleStoreIds(user, store);
    storeResponse = {
      ...store,
      transactions: (store as any).transactions.map((txn: any) => ({
        ...txn,
        fromStore:
          txn.fromStore && visibleStoreIds.has(txn.fromStore.id)
            ? txn.fromStore
            : null,
        toStore:
          txn.toStore && visibleStoreIds.has(txn.toStore.id) ? txn.toStore : null,
      })),
    };
  }

  res.json({
    message: "Store retrieved successfully",
    store: storeResponse,
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
    poReferenceNumber, // Optional - for PO-based stock in
    notes,
    stockInType = "PO", // PO, INITIAL, TRANSFER, MANUAL
  } = req.body;
  const quantity = parseFloat(req.body.quantity); // Parse to number — FormData sends strings
  const userId = req.user.id;

  // Validate required fields
  if (!materialId || !req.body.quantity) {
    return next(new AppError("Material ID and quantity are required", 400));
  }

  if (isNaN(quantity) || quantity <= 0) {
    return next(new AppError("Quantity must be a valid number greater than 0", 400));
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

  // Check if user is store incharge for this store
  const isStoreIncharge = store.storeInchargeAssignments.some(
    (assignment) => assignment.user.id === userId
  );

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isHead: true },
  });

  // Head Store Incharge: check project-level access
  let isHeadStoreIncharge = false;
  if (currentUser?.role === "STORE_INCHARGE" && currentUser.isHead) {
    let projectId = store.projectId;
    if (!projectId && store.sectionId) {
      const section = await prisma.section.findUnique({
        where: { id: store.sectionId },
        select: { projectId: true },
      });
      projectId = section?.projectId ?? null;
    }
    if (projectId) {
      const headAssignment = await prisma.headStoreInchargeAssignment.findFirst({
        where: { userId, projectId, isActive: true },
      });
      isHeadStoreIncharge = !!headAssignment;
    }
  }

  if (!isStoreIncharge && !isHeadStoreIncharge && currentUser?.role !== "ADMIN") {
    return next(
      new AppError(
        "Only assigned store incharges can perform stock-in operations",
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
      ![
        "CREATED",
        "CONFIRMED",
        "ORDER_PLACED",
        "IN_TRANSIT",
        "IN_STORE",
      ].includes(purchaseOrder.status)
    ) {
      return next(
        new AppError(
          "Purchase order is not in appropriate status for stock in. Must be CREATED, CONFIRMED, ORDER_PLACED, IN_TRANSIT, or IN_STORE",
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

    // Create store transaction record (track PO reference as source for IN)
    const transaction = await tx.storeTransaction.create({
      data: {
        storeId,
        materialId,
        type: "IN",
        quantity,
        reference: poReferenceNumber || stockInType.toUpperCase(),
        notes: notes || `${stockInType} stock in`,
        createdBy: userId,
        documentUrl: (req as any).filesFromS3?.document || null,
        // fromStoreId intentionally null for external PO deliveries (source is a vendor, not a store)
      },
    });

    // Update PO status if it's a PO-based stock in
    if (poReferenceNumber && stockInType === "PO") {
      const po = await tx.purchaseOrder.findFirst({
        where: { referenceNumber: poReferenceNumber },
      });
      if (po) {
        const receivedQuantityResult = await tx.storeTransaction.aggregate({
          where: {
            reference: poReferenceNumber,
            type: "IN",
          },
          _sum: {
            quantity: true,
          },
        });

        const totalReceivedQuantity = Number(
          receivedQuantityResult._sum.quantity || 0
        );

        const newStatus =
          totalReceivedQuantity >= Number(po.quantity)
            ? "COMPLETED"
            : "IN_STORE";

        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { status: newStatus },
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
    demandReferenceNumber, // Optional - for demand-based stock out
    toStoreId,            // Optional - destination store for TRANSFER type
    notes,
    stockOutType = "DEMAND", // DEMAND, TRANSFER, MANUAL, LOSS
  } = req.body;
  const quantity = parseFloat(req.body.quantity); // Parse to number — FormData sends strings
  const userId = req.user.id;

  // Validate required fields
  if (!materialId || !req.body.quantity) {
    return next(new AppError("Material ID and quantity are required", 400));
  }

  if (isNaN(quantity) || quantity <= 0) {
    return next(new AppError("Quantity must be a valid number greater than 0", 400));
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

  // Check if user is store incharge for this store
  const isStoreIncharge = store.storeInchargeAssignments.some(
    (assignment) => assignment.user.id === userId
  );

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isHead: true },
  });

  // Head Store Incharge: check project-level access
  let isHeadStoreIncharge = false;
  if (currentUser?.role === "STORE_INCHARGE" && currentUser.isHead) {
    let projectId = store.projectId;
    if (!projectId && store.sectionId) {
      const section = await prisma.section.findUnique({
        where: { id: store.sectionId },
        select: { projectId: true },
      });
      projectId = section?.projectId ?? null;
    }
    if (projectId) {
      const headAssignment = await prisma.headStoreInchargeAssignment.findFirst({
        where: { userId, projectId, isActive: true },
      });
      isHeadStoreIncharge = !!headAssignment;
    }
  }

  if (!isStoreIncharge && !isHeadStoreIncharge && currentUser?.role !== "ADMIN") {
    return next(
      new AppError(
        "Only assigned store incharges can perform stock-out operations",
        403
      )
    );
  }

  if (
    currentUser?.role === "STORE_INCHARGE" &&
    !currentUser.isHead &&
    toStoreId
  ) {
    return next(
      new AppError("Section store incharges cannot transfer stock out", 403)
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
  // Use .toNumber() to safely compare Prisma Decimal with a JS number
  if (currentInventory.available.toNumber() < quantity) {
    return next(
      new AppError(
        `Insufficient stock. Available: ${currentInventory.available}, Requested: ${quantity}`,
        400
      )
    );
  }

  // Validate destination store for TRANSFER
  if (stockOutType === "TRANSFER") {
    if (!toStoreId) {
      return next(new AppError("toStoreId is required for TRANSFER stock out", 400));
    }
    const destStore = await prisma.store.findUnique({ where: { id: toStoreId } });
    if (!destStore || destStore.isDeleted || !destStore.isActive) {
      return next(new AppError("Destination store not found or inactive", 404));
    }
    if (destStore.id === storeId) {
      return next(new AppError("Destination store cannot be the same as source store", 400));
    }

    if (currentUser?.role === "STORE_INCHARGE") {
      if (!currentUser.isHead) {
        return next(
          new AppError("Section store incharges cannot transfer stock out", 403)
        );
      }

      const allowedTypes = ["HEAD_STORE", "SECTION_STORE"];
      if (
        !allowedTypes.includes(store.type) ||
        !allowedTypes.includes(destStore.type)
      ) {
        return next(
          new AppError(
            "Transfers are only allowed between head and section stores",
            400
          )
        );
      }

      const sourceProjectId = await getStoreProjectId(store);
      const destProjectId = await getStoreProjectId(destStore);
      if (
        !sourceProjectId ||
        !destProjectId ||
        sourceProjectId !== destProjectId
      ) {
        return next(
          new AppError(
            "Transfer destination must be in the same project as the source store",
            400
          )
        );
      }

      const headAssignment = await prisma.headStoreInchargeAssignment.findFirst({
        where: { userId, projectId: sourceProjectId, isActive: true },
      });
      if (!headAssignment) {
        return next(
          new AppError("Not authorized to transfer between these stores", 403)
        );
      }

      const projectStoreIds = await getProjectTransferStoreIds(sourceProjectId);
      if (!projectStoreIds.has(storeId) || !projectStoreIds.has(toStoreId)) {
        return next(
          new AppError(
            "Transfer is only allowed between stores in your assigned project",
            403
          )
        );
      }
    }
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
    if (remainingQuantity.toNumber() < quantity) {
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

    // Create store transaction record (track destination store for traceability)
    const transaction = await tx.storeTransaction.create({
      data: {
        storeId,
        materialId,
        type: "OUT",
        quantity,
        reference: demandReferenceNumber || stockOutType.toUpperCase(),
        notes: notes || `${stockOutType} stock out`,
        createdBy: userId,
        toStoreId: toStoreId || null, // Optional: which store received this stock
        documentUrl: (req as any).filesFromS3?.document || null,
      },
    });

    // If TRANSFER: update destination store inventory and create an IN transaction there
    if (stockOutType === "TRANSFER" && toStoreId) {
      // Upsert destination store inventory (create if first transfer, increment if exists)
      await tx.storeInventory.upsert({
        where: { storeId_materialId: { storeId: toStoreId, materialId } },
        update: {
          stock: { increment: quantity },
          available: { increment: quantity },
        },
        create: {
          storeId: toStoreId,
          materialId,
          stock: quantity,
          reserved: 0,
          available: quantity,
        },
      });

      // Create IN transaction on destination store so it appears in its incoming table
      await tx.storeTransaction.create({
        data: {
          storeId: toStoreId,
          materialId,
          type: "IN",
          quantity,
          reference: "TRANSFER",
          notes: notes || `Transfer from store`,
          createdBy: userId,
          fromStoreId: storeId,
          documentUrl: (req as any).filesFromS3?.document || null,
        },
      });
    }

    // Update demand status if it's a demand-based stock out
    if (demandReferenceNumber && stockOutType === "DEMAND") {
      const demand = await tx.demand.findFirst({
        where: { referenceNumber: demandReferenceNumber },
      });

      if (demand) {
        // Check if this will complete the demand
        const currentRemaining = demand.quantityRemaining || demand.quantity;
        const willComplete = currentRemaining.toNumber() <= quantity;

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

const getStoreProjectId = async (store: {
  projectId: string | null;
  sectionId: string | null;
}) => {
  if (store.projectId) return store.projectId;
  if (store.sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: store.sectionId },
      select: { projectId: true },
    });
    return section?.projectId ?? null;
  }
  return null;
};

const getProjectTransferStoreIds = async (projectId: string) => {
  const stores = await prisma.store.findMany({
    where: {
      isDeleted: false,
      isActive: true,
      type: { in: ["HEAD_STORE", "SECTION_STORE"] },
      OR: [{ projectId }, { section: { projectId } }],
    },
    select: { id: true },
  });
  return new Set(stores.map((s) => s.id));
};

// Store IDs whose names can appear in transfer flow columns for a given store.
// Section incharges only have direct store assignments, but should still see
// head/section store names within the same project on their transaction history.
const getFlowVisibleStoreIds = async (
  user: any,
  store: { projectId: string | null; sectionId: string | null }
) => {
  const visibleIds = await getStoreInchargeAuthorizedStoreIds(user);
  const projectId = await getStoreProjectId(store);
  if (projectId) {
    const projectStoreIds = await getProjectTransferStoreIds(projectId);
    projectStoreIds.forEach((id) => visibleIds.add(id));
  }
  return visibleIds;
};

// Helper: Get all store IDs that a STORE_INCHARGE user is authorised to see.
// Used to filter fromStore / toStore cross-references in transaction responses.
const getStoreInchargeAuthorizedStoreIds = async (user: any): Promise<Set<string>> => {
  const ids = new Set<string>();

  if (user.isHead) {
    const headAssignments = await prisma.headStoreInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { projectId: true },
    });
    const projectIds = headAssignments.map((a: any) => a.projectId);
    if (projectIds.length > 0) {
      const projectStores = await prisma.store.findMany({
        where: {
          isDeleted: false,
          OR: [
            { projectId: { in: projectIds } },
            { section: { projectId: { in: projectIds } } },
          ],
        },
        select: { id: true },
      });
      projectStores.forEach((s: any) => ids.add(s.id));
    }
  }

  // Also include directly-assigned stores (covers non-head and mixed scenarios)
  const directAssignments = await prisma.storeInchargeAssignment.findMany({
    where: { userId: user.id, isActive: true },
    select: { storeId: true },
  });
  directAssignments.forEach((a: any) => ids.add(a.storeId));

  return ids;
};

// Helper: Check if user has access to a store based on role
const checkStoreAccess = async (user: any, store: any): Promise<boolean> => {
  const userId = user.id;
  const userRole = user.role;

  if (userRole === "ADMIN") return true;

  if (userRole === "STORE_INCHARGE") {
    const directAssignment = await prisma.storeInchargeAssignment.findFirst({
      where: { userId, storeId: store.id, isActive: true },
    });
    if (directAssignment) return true;

    // Head Store Incharge can access any store in their assigned projects
    if (user.isHead) {
      let projectId = store.projectId;
      if (!projectId && store.sectionId) {
        const section = await prisma.section.findUnique({
          where: { id: store.sectionId },
          select: { projectId: true },
        });
        projectId = section?.projectId ?? null;
      }

      if (projectId) {
        const headAssignment = await prisma.headStoreInchargeAssignment.findFirst({
          where: { userId, projectId, isActive: true },
        });
        return !!headAssignment;
      }
    }

    return false;
  }

  // For section-level roles, if sectionId is null (HEAD_STORE), check via project
  const getSectionIdFilter = async (roleFilter: any) => {
    if (store.sectionId) {
      return roleFilter(store.sectionId);
    }
    // HEAD_STORE: check if user is assigned to ANY section in the store's project
    if (store.projectId) {
      const sections = await prisma.section.findMany({
        where: { projectId: store.projectId },
        select: { id: true },
      });
      for (const section of sections) {
        const found = await roleFilter(section.id);
        if (found) return true;
      }
    }
    return false;
  };

  if (userRole === "SITE_INCHARGE") {
    return !!(await getSectionIdFilter((sectionId: string) =>
      prisma.siteInchargeAssignment.findFirst({
        where: { userId, sectionId, isActive: true },
      })
    ));
  }

  if (userRole === "PROJECT_MANAGER") {
    return !!(await getSectionIdFilter((sectionId: string) =>
      prisma.projectManagerAssignment.findFirst({
        where: { userId, sectionId, isActive: true },
      })
    ));
  }

  if (userRole === "CONSTRUCTION_MANAGER") {
    return !!(await getSectionIdFilter((sectionId: string) =>
      prisma.constructionManagerAssignment.findFirst({
        where: { userId, sectionId, isActive: true },
      })
    ));
  }

  if (userRole === "ACCOUNTANT") {
    return !!(await getSectionIdFilter((sectionId: string) =>
      prisma.accountantAssignment.findFirst({
        where: { userId, sectionId, isActive: true },
      })
    ));
  }

  return false;
};

const getStoreInventory = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;
  const { materialId } = req.query;
  const user = req.user;

  // Validate store exists
  const store = await prisma.store.findUnique({
    where: { id: storeId },
  });

  if (!store) {
    return next(new AppError("Store not found", 404));
  }

  // Role-based access check
  const hasInventoryAccess = await checkStoreAccess(user, store);
  if (!hasInventoryAccess) {
    return next(new AppError("Access denied: not assigned to this store", 403));
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
  const user = req.user;

  // Validate store exists
  const store = await prisma.store.findUnique({
    where: { id: storeId },
  });

  if (!store) {
    return next(new AppError("Store not found", 404));
  }

  // Role-based access check
  const hasTransactionAccess = await checkStoreAccess(user, store);
  if (!hasTransactionAccess) {
    return next(new AppError("Access denied: not assigned to this store", 403));
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

const acceptIncomingTransaction = catchAsync(async (req, res, next) => {
  const { storeId, transactionId } = req.params;
  const { note } = req.body;
  const user = req.user;

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.isDeleted) {
    return next(new AppError("Store not found", 404));
  }

  const hasAccess = await checkStoreAccess(user, store);
  if (!hasAccess) {
    return next(new AppError("Access denied: not assigned to this store", 403));
  }

  const transaction = await prisma.storeTransaction.findUnique({
    where: { id: transactionId },
  });

  if (
    !transaction ||
    transaction.storeId !== storeId ||
    transaction.type !== "IN" ||
    !transaction.fromStoreId
  ) {
    return next(new AppError("Incoming transfer transaction not found", 404));
  }

  const updatedNotes = note
    ? transaction.notes
      ? `${transaction.notes} | Received: ${note}`
      : note
    : transaction.notes;

  const updatedTransaction = await prisma.storeTransaction.update({
    where: { id: transactionId },
    data: {
      notes: updatedNotes,
      documentUrl: (req as any).filesFromS3?.document || transaction.documentUrl,
    },
  });

  res.json({
    message: "Incoming request accepted successfully",
    transaction: updatedTransaction,
  });
});

const getProjectInventory = catchAsync(async (req, res, next) => {
  const { projectId } = req.params;
  const { sectionIds } = req.query; // Can be single sectionId or array of sectionIds
  const user = req.user;

  if (user.role === "STORE_INCHARGE") {
    let hasProjectAccess = false;

    if (user.isHead) {
      const headAssignment = await prisma.headStoreInchargeAssignment.findFirst({
        where: { userId: user.id, projectId, isActive: true },
      });
      hasProjectAccess = !!headAssignment;
    }

    // Fallback: direct store assignment under this project
    if (!hasProjectAccess) {
      const directAssignment = await prisma.storeInchargeAssignment.findFirst({
        where: {
          userId: user.id,
          isActive: true,
          store: {
            OR: [
              { projectId },
              { section: { projectId } },
            ],
          },
        },
      });
      hasProjectAccess = !!directAssignment;
    }

    if (!hasProjectAccess) {
      return next(new AppError("Access denied: not assigned to this project", 403));
    }
  }

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

  // Get all stores in the target sections plus the project's HEAD_STORE
  const stores = await prisma.store.findMany({
    where: {
      isDeleted: false,
      isActive: true,
      OR: [
        { sectionId: { in: targetSectionIds } },
        { projectId, type: "HEAD_STORE" },
      ],
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
        sectionName: store.section?.name ?? "",
        sectionCode: store.section?.code ?? "",
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

// Assign a personnel to a store (creates/updates StoreInchargeAssignment + sets assignedUserId)
const assignPersonnel = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;
  const { userId } = req.body;
  const actorId = req.user.id;

  if (!userId) {
    return next(new AppError("userId is required", 400));
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.isDeleted) {
    return next(new AppError("Store not found", 404));
  }

  const userToAssign = await prisma.user.findUnique({ where: { id: userId } });
  if (!userToAssign) {
    return next(new AppError("User not found", 404));
  }

  // Check if this user is already actively assigned to avoid duplicates
  const existing = await prisma.storeInchargeAssignment.findUnique({
    where: { userId_storeId: { userId, storeId } },
  });
  if (existing?.isActive) {
    return next(new AppError("This user is already assigned to this store", 400));
  }

  // Get uploaded utility file URL (if any)
  const utilityFileUrl = (req as any).filesFromS3?.utilityFile as string | undefined;

  // Add (or reactivate) the assignment — do NOT deactivate other assignments
  await prisma.storeInchargeAssignment.upsert({
    where: { userId_storeId: { userId, storeId } },
    update: { isActive: true, ...(utilityFileUrl ? { utilityFile: utilityFileUrl } : {}) },
    create: { userId, storeId, createdBy: actorId, ...(utilityFileUrl ? { utilityFile: utilityFileUrl } : {}) },
  });

  // Update assignedUserId on the store to the latest assigned user
  const updatedStore = await prisma.store.update({
    where: { id: storeId },
    data: { assignedUserId: userId, updatedBy: actorId },
    include: {
      assignedUser: { select: { id: true, name: true, email: true, role: true } },
      storeInchargeAssignments: {
        where: { isActive: true },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  });

  res.json({
    message: "Personnel assigned successfully",
    store: updatedStore,
  });
});

// Remove personnel assignment from a store
const removePersonnel = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;
  const actorId = req.user.id;

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.isDeleted) {
    return next(new AppError("Store not found", 404));
  }

  // Deactivate all active assignments
  await prisma.storeInchargeAssignment.updateMany({
    where: { storeId, isActive: true },
    data: { isActive: false },
  });

  const updatedStore = await prisma.store.update({
    where: { id: storeId },
    data: { assignedUserId: null, updatedBy: actorId },
  });

  res.json({
    message: "Personnel assignment removed successfully",
    store: updatedStore,
  });
});

// Remove a specific user's assignment from a store
const removeSpecificPersonnel = catchAsync(async (req, res, next) => {
  const { storeId, userId } = req.params;
  const actorId = req.user.id;

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.isDeleted) {
    return next(new AppError("Store not found", 404));
  }

  // Deactivate this specific assignment
  await prisma.storeInchargeAssignment.updateMany({
    where: { storeId, userId, isActive: true },
    data: { isActive: false },
  });

  // Find the next active assignment to keep assignedUserId consistent
  const remaining = await prisma.storeInchargeAssignment.findFirst({
    where: { storeId, isActive: true },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });

  const updatedStore = await prisma.store.update({
    where: { id: storeId },
    data: { assignedUserId: remaining?.userId ?? null, updatedBy: actorId },
    include: {
      storeInchargeAssignments: {
        where: { isActive: true },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  });

  res.json({
    message: "Personnel assignment removed successfully",
    store: updatedStore,
  });
});

// Assign a store to a Site Incharge (creates SiteInchargeAssignment for the store's section/project)
const assignSiteIncharge = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return next(new AppError("userId is required", 400));
  }

  // Verify store exists
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { section: { select: { id: true, projectId: true } } },
  });
  if (!store || store.isDeleted) {
    return next(new AppError("Store not found", 404));
  }

  // Verify user exists and is SITE_INCHARGE
  const siUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!siUser) {
    return next(new AppError("User not found", 404));
  }
  if (siUser.role !== "SITE_INCHARGE") {
    return next(new AppError("User must have SITE_INCHARGE role", 400));
  }

  // Determine projectId and sectionId
  let projectId: string | null = null;
  let sectionId: string | null = null;

  if (store.type === "SECTION_STORE" || store.type === "CM_STORE") {
    sectionId = store.sectionId;
    projectId = store.section?.projectId || null;
  } else if (store.type === "HEAD_STORE") {
    projectId = store.projectId;
    // HEAD_STORE has no section — pick the first section in the project
    if (projectId) {
      const firstSection = await prisma.section.findFirst({
        where: { projectId },
        select: { id: true },
      });
      if (!firstSection) {
        return next(new AppError("No sections found in this project. Create a section first.", 400));
      }
      sectionId = firstSection.id;
    }
  }

  if (!projectId || !sectionId) {
    return next(new AppError("Cannot determine project/section for this store", 400));
  }

  // Upsert SiteInchargeAssignment
  const assignment = await prisma.siteInchargeAssignment.upsert({
    where: {
      userId_sectionId: { userId, sectionId },
    },
    create: {
      userId,
      projectId,
      sectionId,
      createdBy: req.user.id,
      isActive: true,
    },
    update: {
      isActive: true,
    },
  });

  res.json({
    message: "Site Incharge assigned to store successfully",
    assignment,
  });
});

// Assign a store to a Project Manager (creates ProjectManagerAssignment for the store's section/project)
const assignProjectManager = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return next(new AppError("userId is required", 400));
  }

  // Verify store exists
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { section: { select: { id: true, projectId: true } } },
  });
  if (!store || store.isDeleted) {
    return next(new AppError("Store not found", 404));
  }

  // Only SECTION_STORE can be assigned to PM
  if (store.type !== "SECTION_STORE") {
    return next(new AppError("Only Section Stores can be assigned to a Project Manager", 400));
  }

  // Verify user exists and is PROJECT_MANAGER
  const pmUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!pmUser) {
    return next(new AppError("User not found", 404));
  }
  if (pmUser.role !== "PROJECT_MANAGER") {
    return next(new AppError("User must have PROJECT_MANAGER role", 400));
  }

  const sectionId = store.sectionId;
  const projectId = store.section?.projectId || null;

  if (!projectId || !sectionId) {
    return next(new AppError("Cannot determine project/section for this store", 400));
  }

  // Upsert ProjectManagerAssignment
  const assignment = await prisma.projectManagerAssignment.upsert({
    where: {
      userId_sectionId: { userId, sectionId },
    },
    create: {
      userId,
      projectId,
      sectionId,
      createdBy: req.user.id,
      isActive: true,
    },
    update: {
      isActive: true,
    },
  });

  res.json({
    message: "Project Manager assigned to store successfully",
    assignment,
  });
});

// ─── Store Permissions ─────────────────────────────────────────────────────────

const getStorePermissions = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return next(new AppError("Store not found", 404));

  const permissions = await prisma.storePermission.findMany({
    where: { storeId },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  res.json({ message: "Store permissions retrieved", permissions });
});

const setStorePermissions = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;
  const { permissions } = req.body; // array of { userId, canViewStock, canRequestMaterials, canApproveMaterials, canAddStock, canTransferStock }
  const adminId = req.user.id;

  if (!Array.isArray(permissions)) {
    return next(new AppError("permissions must be an array", 400));
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return next(new AppError("Store not found", 404));

  const results = await prisma.$transaction(
    permissions.map((p) =>
      prisma.storePermission.upsert({
        where: { userId_storeId: { userId: p.userId, storeId } },
        create: {
          storeId,
          userId: p.userId,
          canViewStock: p.canViewStock ?? true,
          canRequestMaterials: p.canRequestMaterials ?? false,
          canApproveMaterials: p.canApproveMaterials ?? false,
          canAddStock: p.canAddStock ?? false,
          canTransferStock: p.canTransferStock ?? false,
          createdBy: adminId,
        },
        update: {
          canViewStock: p.canViewStock ?? true,
          canRequestMaterials: p.canRequestMaterials ?? false,
          canApproveMaterials: p.canApproveMaterials ?? false,
          canAddStock: p.canAddStock ?? false,
          canTransferStock: p.canTransferStock ?? false,
        },
      })
    )
  );

  res.json({ message: "Store permissions saved successfully", permissions: results });
});

const deleteStorePermission = catchAsync(async (req, res, next) => {
  const { storeId, userId } = req.params;

  const perm = await prisma.storePermission.findUnique({
    where: { userId_storeId: { userId, storeId } },
  });
  if (!perm) return next(new AppError("Permission record not found", 404));

  await prisma.storePermission.delete({
    where: { userId_storeId: { userId, storeId } },
  });

  res.json({ message: "Store permission removed" });
});

// ─── Incoming Transactions: stock that was transferred INTO this store ────────

const getIncomingTransactions = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const user = req.user;

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.isDeleted) {
    return next(new AppError("Store not found", 404));
  }

  const hasAccess = await checkStoreAccess(user, store);
  if (!hasAccess) {
    return next(new AppError("Access denied: not assigned to this store", 403));
  }

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const where: any = { storeId, type: "IN", fromStoreId: { not: null } };

  // For STORE_INCHARGE: only show incoming transfers from stores in the same project.
  if (user.role === "STORE_INCHARGE") {
    const visibleStoreIds = await getFlowVisibleStoreIds(user, store);
    where.fromStoreId =
      visibleStoreIds.size > 0 ? { in: Array.from(visibleStoreIds) } : { in: [] };
  }

  const [transactions, total] = await Promise.all([
    prisma.storeTransaction.findMany({
      where,
      include: {
        fromStore: { select: { id: true, name: true, type: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { transactionDate: "desc" },
      skip,
      take: parseInt(limit as string),
    }),
    prisma.storeTransaction.count({ where }),
  ]);

  res.json({
    message: "Incoming transactions retrieved successfully",
    transactions,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      pages: Math.ceil(total / parseInt(limit as string)),
    },
  });
});

// ─── Cleanup: delete SECTION_STORE entries that have no inventory ─────────────

const cleanupEmptySectionStores = catchAsync(async (req, res) => {
  // Find SECTION_STORE stores with no inventory and no transactions
  const emptyStores = await prisma.store.findMany({
    where: {
      type: "SECTION_STORE",
      isDeleted: false,
      inventory: { none: {} },
      transactions: { none: {} },
    },
    select: { id: true, name: true },
  });

  if (emptyStores.length === 0) {
    return res.json({ message: "No empty section stores found.", deleted: [] });
  }

  const ids = emptyStores.map((s) => s.id);

  // Delete permissions first (FK constraint)
  await prisma.storePermission.deleteMany({ where: { storeId: { in: ids } } });

  // Hard delete the empty stores
  await prisma.store.deleteMany({ where: { id: { in: ids } } });

  return res.json({
    message: `Deleted ${emptyStores.length} empty section store(s).`,
    deleted: emptyStores.map((s) => s.name),
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
  getIncomingTransactions,
  acceptIncomingTransaction,
  getProjectInventory,
  assignPersonnel,
  removePersonnel,
  removeSpecificPersonnel,
  assignSiteIncharge,
  assignProjectManager,
  getStorePermissions,
  setStorePermissions,
  deleteStorePermission,
  cleanupEmptySectionStores,
};
