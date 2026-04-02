"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectInventory = exports.getStoreTransactions = exports.getStoreInventory = exports.stockOut = exports.stockIn = exports.deactivateStore = exports.activateStore = exports.deleteStore = exports.updateStore = exports.getStoreById = exports.getStores = exports.createStore = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const buildQueryOptions_1 = require("../utils/buildQueryOptions");
const constants_1 = require("../constants");
const notification_1 = require("../utils/notification");
const notificationService_1 = require("../utils/notificationService");
const prisma_1 = __importDefault(require("../utils/prisma"));
const createStore = (0, catchAsync_1.default)(async (req, res, next) => {
    const { name, type, sectionId, cmUserId, initialStock, } = req.body;
    const userId = req.user.id;
    if (!name || !type || !sectionId) {
        return next(new appError_1.default("Name, type, and sectionId are required", 400));
    }
    const section = await prisma_1.default.section.findUnique({
        where: { id: sectionId },
    });
    if (!section) {
        return next(new appError_1.default("Section not found", 404));
    }
    if (type === "CM_STORE" && !cmUserId) {
        return next(new appError_1.default("CM User ID is required for CM stores", 400));
    }
    if (cmUserId) {
        const cmUser = await prisma_1.default.user.findUnique({
            where: { id: cmUserId },
        });
        if (!cmUser) {
            return next(new appError_1.default("CM User not found", 404));
        }
        if (cmUser.role !== "CONSTRUCTION_MANAGER") {
            return next(new appError_1.default("CM User must have CONSTRUCTION_MANAGER role", 400));
        }
    }
    if (initialStock && Array.isArray(initialStock)) {
        for (const item of initialStock) {
            if (!item.materialId || !item.quantity) {
                return next(new appError_1.default("Each initial stock item must have materialId and quantity", 400));
            }
            if (item.quantity <= 0) {
                return next(new appError_1.default("Initial stock quantity must be greater than 0", 400));
            }
            const material = await prisma_1.default.material.findUnique({
                where: { id: item.materialId },
            });
            if (!material) {
                return next(new appError_1.default(`Material with ID ${item.materialId} not found`, 404));
            }
        }
    }
    const result = await prisma_1.default.$transaction(async (tx) => {
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
        if (initialStock && Array.isArray(initialStock)) {
            for (const item of initialStock) {
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
                await tx.storeTransaction.create({
                    data: {
                        storeId: store.id,
                        materialId: item.materialId,
                        type: "IN",
                        quantity: item.quantity,
                        reference: constants_1.TRANSACTION_REFERENCES.INITIAL_STOCK,
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
exports.createStore = createStore;
const getStores = (0, catchAsync_1.default)(async (req, res) => {
    const user = req.user;
    const filterOptions = (0, buildQueryOptions_1.extractQueryParams)(req);
    const searchableFields = ["name"];
    let defaultFilters = { isDeleted: false };
    if (user.role === "ADMIN") {
    }
    else if (user.role === "PROJECT_MANAGER") {
        const assignments = await prisma_1.default.projectManagerAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        defaultFilters.sectionId = { in: sectionIds };
    }
    else if (user.role === "SITE_INCHARGE") {
        const assignments = await prisma_1.default.siteInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        defaultFilters.sectionId = { in: sectionIds };
    }
    else if (user.role === "CONSTRUCTION_MANAGER") {
        const assignments = await prisma_1.default.constructionManagerAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        defaultFilters.sectionId = { in: sectionIds };
    }
    else if (user.role === "STORE_INCHARGE") {
        if (user.isHead) {
        }
        else {
            const assignments = await prisma_1.default.storeInchargeAssignment.findMany({
                where: { userId: user.id, isActive: true },
                select: { storeId: true },
            });
            const storeIds = assignments.map((a) => a.storeId);
            defaultFilters.id = { in: storeIds };
        }
    }
    else if (user.role === "ACCOUNTANT") {
        if (user.isHead) {
        }
        else {
            const assignments = await prisma_1.default.accountantAssignment.findMany({
                where: { userId: user.id, isActive: true },
                select: { sectionId: true },
            });
            const sectionIds = assignments.map((a) => a.sectionId);
            defaultFilters.sectionId = { in: sectionIds };
        }
    }
    else {
        defaultFilters.id = { in: [] };
    }
    const queryOptions = (0, buildQueryOptions_1.buildQueryOptions)(filterOptions, defaultFilters, searchableFields);
    const total = await prisma_1.default.store.count({
        where: queryOptions.where,
    });
    const stores = await prisma_1.default.store.findMany({
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
    const paginationMeta = (0, buildQueryOptions_1.buildPaginationMeta)(total, filterOptions.page || 1, filterOptions.limit || 50);
    res.json({
        message: "Stores retrieved successfully",
        stores,
        ...paginationMeta,
    });
});
exports.getStores = getStores;
const getStoreById = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const user = req.user;
    if (user.role !== "ADMIN") {
        let assigned = false;
        if (user.role === "STORE_INCHARGE") {
            const assignment = await prisma_1.default.storeInchargeAssignment.findFirst({
                where: { userId: user.id, storeId: id, isActive: true },
            });
            assigned = !!assignment;
        }
        else if (user.role === "SITE_INCHARGE") {
            const store = await prisma_1.default.store.findUnique({
                where: { id },
                select: { sectionId: true },
            });
            if (store) {
                const assignment = await prisma_1.default.siteInchargeAssignment.findFirst({
                    where: {
                        userId: user.id,
                        sectionId: store.sectionId,
                        isActive: true,
                    },
                });
                assigned = !!assignment;
            }
        }
        else if (user.role === "PROJECT_MANAGER") {
            const store = await prisma_1.default.store.findUnique({
                where: { id },
                select: { sectionId: true },
            });
            if (store) {
                const assignment = await prisma_1.default.projectManagerAssignment.findFirst({
                    where: {
                        userId: user.id,
                        sectionId: store.sectionId,
                        isActive: true,
                    },
                });
                assigned = !!assignment;
            }
        }
        else if (user.role === "CONSTRUCTION_MANAGER") {
            const store = await prisma_1.default.store.findUnique({
                where: { id },
                select: { sectionId: true },
            });
            if (store) {
                const assignment = await prisma_1.default.constructionManagerAssignment.findFirst({
                    where: {
                        userId: user.id,
                        sectionId: store.sectionId,
                        isActive: true,
                    },
                });
                assigned = !!assignment;
            }
        }
        else if (user.role === "ACCOUNTANT") {
            if (user.isHead) {
                assigned = true;
            }
            else {
                const store = await prisma_1.default.store.findUnique({
                    where: { id },
                    select: { sectionId: true },
                });
                if (store) {
                    const assignment = await prisma_1.default.accountantAssignment.findFirst({
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
            return next(new appError_1.default("Access denied: not assigned to this store", 403));
        }
    }
    const store = await prisma_1.default.store.findUnique({
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
        return next(new appError_1.default("Store not found", 404));
    }
    res.json({
        message: "Store retrieved successfully",
        store,
    });
});
exports.getStoreById = getStoreById;
const updateStore = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const updates = { ...req.body };
    const userId = req.user.id;
    delete updates.id;
    delete updates.createdAt;
    delete updates.createdBy;
    delete updates.sectionId;
    const existing = await prisma_1.default.store.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Store not found", 404));
    }
    if (updates.type === "CM_STORE" && !updates.cmUserId) {
        return next(new appError_1.default("CM User ID is required for CM stores", 400));
    }
    if (updates.cmUserId) {
        const cmUser = await prisma_1.default.user.findUnique({
            where: { id: updates.cmUserId },
        });
        if (!cmUser) {
            return next(new appError_1.default("CM User not found", 404));
        }
        if (cmUser.role !== "CONSTRUCTION_MANAGER") {
            return next(new appError_1.default("CM User must have CONSTRUCTION_MANAGER role", 400));
        }
    }
    const updatedStore = await prisma_1.default.store.update({
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
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Store Updated",
        body: `Store ${updatedStore.name} was updated successfully.`,
    });
});
exports.updateStore = updateStore;
const deleteStore = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.store.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Store not found", 404));
    }
    await prisma_1.default.storeInchargeAssignment.deleteMany({ where: { storeId: id } });
    await prisma_1.default.store.update({
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
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Store Deleted",
        body: `Store ${existing.name} was deleted successfully.`,
    });
});
exports.deleteStore = deleteStore;
const activateStore = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.store.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Store not found", 404));
    }
    const updatedStore = await prisma_1.default.store.update({
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
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Store Activated",
        body: `Store ${updatedStore.name} was activated successfully.`,
    });
});
exports.activateStore = activateStore;
const deactivateStore = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.store.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Store not found", 404));
    }
    const updatedStore = await prisma_1.default.store.update({
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
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Store Deactivated",
        body: `Store ${updatedStore.name} was deactivated successfully.`,
    });
});
exports.deactivateStore = deactivateStore;
const stockIn = (0, catchAsync_1.default)(async (req, res, next) => {
    const { storeId } = req.params;
    const { materialId, quantity, poReferenceNumber, notes, stockInType = "PO", } = req.body;
    const userId = req.user.id;
    if (!materialId || !quantity) {
        return next(new appError_1.default("Material ID and quantity are required", 400));
    }
    if (quantity <= 0) {
        return next(new appError_1.default("Quantity must be greater than 0", 400));
    }
    const store = await prisma_1.default.store.findUnique({
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
        return next(new appError_1.default("Store not found", 404));
    }
    if (store.isDeleted || !store.isActive) {
        return next(new appError_1.default("Store is not active", 400));
    }
    const isStoreIncharge = store.storeInchargeAssignments.some((assignment) => assignment.user.id === userId);
    const currentUser = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { isHead: true },
    });
    if (!isStoreIncharge && !currentUser?.isHead) {
        return next(new appError_1.default("Only store incharges or head store incharges can perform stock operations", 403));
    }
    const material = await prisma_1.default.material.findUnique({
        where: { id: materialId },
    });
    if (!material) {
        return next(new appError_1.default("Material not found", 404));
    }
    if (material.isDeleted || !material.isActive) {
        return next(new appError_1.default("Material is not active", 400));
    }
    if (poReferenceNumber && stockInType === "PO") {
        const purchaseOrder = await prisma_1.default.purchaseOrder.findFirst({
            where: {
                referenceNumber: poReferenceNumber,
                isDeleted: false,
            },
        });
        if (!purchaseOrder) {
            return next(new appError_1.default("Purchase order not found", 404));
        }
        if (!["CONFIRMED", "ORDER_PLACED", "IN_TRANSIT"].includes(purchaseOrder.status)) {
            return next(new appError_1.default("Purchase order is not in appropriate status for stock in. Must be CONFIRMED, ORDER_PLACED, or IN_TRANSIT", 400));
        }
    }
    const result = await prisma_1.default.$transaction(async (tx) => {
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
        if (poReferenceNumber && stockInType === "PO") {
            const po = await tx.purchaseOrder.findFirst({
                where: { referenceNumber: poReferenceNumber },
            });
            if (po) {
                await tx.purchaseOrder.update({
                    where: { id: po.id },
                    data: { status: "COMPLETED" },
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
    await notificationService_1.NotificationService.notifyStoreTransaction(result.transaction.id);
});
exports.stockIn = stockIn;
const stockOut = (0, catchAsync_1.default)(async (req, res, next) => {
    const { storeId } = req.params;
    const { materialId, quantity, demandReferenceNumber, notes, stockOutType = "DEMAND", } = req.body;
    const userId = req.user.id;
    if (!materialId || !quantity) {
        return next(new appError_1.default("Material ID and quantity are required", 400));
    }
    if (quantity <= 0) {
        return next(new appError_1.default("Quantity must be greater than 0", 400));
    }
    const store = await prisma_1.default.store.findUnique({
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
        return next(new appError_1.default("Store not found", 404));
    }
    if (store.isDeleted || !store.isActive) {
        return next(new appError_1.default("Store is not active", 400));
    }
    const isStoreIncharge = store.storeInchargeAssignments.some((assignment) => assignment.user.id === userId);
    const currentUser = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { isHead: true },
    });
    if (!isStoreIncharge && !currentUser?.isHead) {
        return next(new appError_1.default("Only store incharges or head store incharges can perform stock operations", 403));
    }
    const material = await prisma_1.default.material.findUnique({
        where: { id: materialId },
    });
    if (!material) {
        return next(new appError_1.default("Material not found", 404));
    }
    if (material.isDeleted || !material.isActive) {
        return next(new appError_1.default("Material is not active", 400));
    }
    const currentInventory = await prisma_1.default.storeInventory.findUnique({
        where: {
            storeId_materialId: {
                storeId,
                materialId,
            },
        },
    });
    if (!currentInventory) {
        return next(new appError_1.default("No inventory found for this material in the store", 404));
    }
    if (currentInventory.available < quantity) {
        return next(new appError_1.default(`Insufficient stock. Available: ${currentInventory.available}, Requested: ${quantity}`, 400));
    }
    if (demandReferenceNumber && stockOutType === "DEMAND") {
        const demand = await prisma_1.default.demand.findFirst({
            where: {
                referenceNumber: demandReferenceNumber,
                isDeleted: false,
            },
        });
        if (!demand) {
            return next(new appError_1.default("Demand not found", 404));
        }
        if (!["APPROVED", "FULFILLED_FROM_STORE"].includes(demand.status)) {
            return next(new appError_1.default("Demand is not in appropriate status for stock out", 400));
        }
        const remainingQuantity = demand.quantityRemaining || demand.quantity;
        if (remainingQuantity < quantity) {
            return next(new appError_1.default(`Requested quantity exceeds remaining demand quantity. Remaining: ${remainingQuantity}, Requested: ${quantity}`, 400));
        }
    }
    const result = await prisma_1.default.$transaction(async (tx) => {
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
        if (demandReferenceNumber && stockOutType === "DEMAND") {
            const demand = await tx.demand.findFirst({
                where: { referenceNumber: demandReferenceNumber },
            });
            if (demand) {
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
    await notificationService_1.NotificationService.notifyStoreTransaction(result.transaction.id);
});
exports.stockOut = stockOut;
const getStoreInventory = (0, catchAsync_1.default)(async (req, res, next) => {
    const { storeId } = req.params;
    const { materialId } = req.query;
    const store = await prisma_1.default.store.findUnique({
        where: { id: storeId },
    });
    if (!store) {
        return next(new appError_1.default("Store not found", 404));
    }
    const where = { storeId };
    if (materialId) {
        where.materialId = materialId;
    }
    const inventory = await prisma_1.default.storeInventory.findMany({
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
exports.getStoreInventory = getStoreInventory;
const getStoreTransactions = (0, catchAsync_1.default)(async (req, res, next) => {
    const { storeId } = req.params;
    const { materialId, type, startDate, endDate, page = 1, limit = 50, } = req.query;
    const store = await prisma_1.default.store.findUnique({
        where: { id: storeId },
    });
    if (!store) {
        return next(new appError_1.default("Store not found", 404));
    }
    const where = { storeId };
    if (materialId) {
        where.materialId = materialId;
    }
    if (type) {
        where.type = type;
    }
    if (startDate || endDate) {
        where.transactionDate = {};
        if (startDate) {
            where.transactionDate.gte = new Date(startDate);
        }
        if (endDate) {
            where.transactionDate.lte = new Date(endDate);
        }
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [transactions, total] = await Promise.all([
        prisma_1.default.storeTransaction.findMany({
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
            take: parseInt(limit),
        }),
        prisma_1.default.storeTransaction.count({ where }),
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
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
        },
    });
});
exports.getStoreTransactions = getStoreTransactions;
const getProjectInventory = (0, catchAsync_1.default)(async (req, res, next) => {
    const { projectId } = req.params;
    const { sectionIds } = req.query;
    const project = await prisma_1.default.project.findUnique({
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
        return next(new appError_1.default("Project not found", 404));
    }
    let targetSectionIds = [];
    if (sectionIds) {
        if (Array.isArray(sectionIds)) {
            targetSectionIds = sectionIds;
        }
        else {
            targetSectionIds = [sectionIds];
        }
    }
    else {
        targetSectionIds = project.sections.map((section) => section.id);
    }
    const validSectionIds = project.sections.map((section) => section.id);
    const invalidSectionIds = targetSectionIds.filter((id) => !validSectionIds.includes(id));
    if (invalidSectionIds.length > 0) {
        return next(new appError_1.default(`Invalid section IDs: ${invalidSectionIds.join(", ")}`, 400));
    }
    const stores = await prisma_1.default.store.findMany({
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
                        gte: new Date(new Date().getFullYear(), 0, 1),
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
        store.transactions.forEach((transaction) => {
            const materialId = transaction.materialId;
            if (materialInventoryMap.has(materialId)) {
                const materialData = materialInventoryMap.get(materialId);
                const quantity = Number(transaction.quantity);
                if (transaction.type === "IN") {
                    materialData.usage.totalIn += quantity;
                }
                else if (transaction.type === "OUT") {
                    materialData.usage.totalOut += quantity;
                }
            }
        });
    });
    const inventorySummary = Array.from(materialInventoryMap.values()).map((materialData) => {
        materialData.usage.netUsage =
            materialData.usage.totalOut - materialData.usage.totalIn;
        const totalReceived = materialData.usage.totalIn + materialData.totalStock;
        const usagePercentage = totalReceived > 0
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
    });
    inventorySummary.sort((a, b) => a.material.name.localeCompare(b.material.name));
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
            totalStockValue: inventorySummary.reduce((sum, item) => sum + item.summary.totalStock, 0),
            totalUsage: inventorySummary.reduce((sum, item) => sum + item.summary.usage.totalOut, 0),
        },
    };
    res.json({
        message: "Project inventory retrieved successfully",
        data: response,
    });
});
exports.getProjectInventory = getProjectInventory;
//# sourceMappingURL=store.controller.js.map