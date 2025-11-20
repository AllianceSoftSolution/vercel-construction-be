"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePOAmount = exports.addPOAmount = exports.updatePOStatus = exports.getDemandPOStatistics = exports.getPurchaseOrderSummary = exports.getPurchaseOrdersByVendor = exports.deletePurchaseOrder = exports.updatePurchaseOrder = exports.getPurchaseOrder = exports.getPurchaseOrders = exports.createPurchaseOrder = void 0;
const library_1 = require("@prisma/client/runtime/library");
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const notification_1 = require("../utils/notification");
const generateCode_1 = require("../utils/generateCode");
const notificationService_1 = require("../utils/notificationService");
const prisma_1 = __importDefault(require("../utils/prisma"));
async function getTotalPOQuantityForDemand(demandId) {
    const existingPOs = await prisma_1.default.purchaseOrder.findMany({
        where: {
            demandId,
            isDeleted: false,
        },
        select: {
            quantity: true,
        },
    });
    return existingPOs.reduce((total, po) => total + Number(po.quantity), 0);
}
async function updateDemandStatus(demandId) {
    const demand = await prisma_1.default.demand.findUnique({
        where: { id: demandId },
    });
    if (!demand)
        return;
    const totalPOQuantity = await getTotalPOQuantityForDemand(demandId);
    const demandQuantity = Number(demand.quantity);
    let newStatus = demand.status;
    if (totalPOQuantity === 0) {
        if (demand.status === "APPROVED") {
            newStatus = "APPROVED";
        }
    }
    else if (totalPOQuantity < demandQuantity) {
        newStatus = "PARTIALLY_PO_CREATED";
    }
    else if (totalPOQuantity >= demandQuantity) {
        newStatus = "PO_CREATED";
    }
    const newFulfilledQuantity = totalPOQuantity;
    const newRemainingQuantity = demandQuantity - totalPOQuantity;
    if (newStatus !== demand.status ||
        newFulfilledQuantity !== Number(demand.quantityFulfilled || 0) ||
        newRemainingQuantity !== Number(demand.quantityRemaining || demandQuantity)) {
        await prisma_1.default.demand.update({
            where: { id: demandId },
            data: {
                status: newStatus,
                quantityFulfilled: newFulfilledQuantity,
                quantityRemaining: newRemainingQuantity,
                updatedBy: demand.createdBy,
            },
        });
    }
}
exports.createPurchaseOrder = (0, catchAsync_1.default)(async (req, res, next) => {
    const { demandId, materialId, vendorId, quantity, sectionId, notes } = req.body;
    if (!["SITE_INCHARGE", "ADMIN"].includes(req.user.role)) {
        return next(new appError_1.default("Only Site Incharge and Admin can create Purchase Orders", 403));
    }
    if (!demandId || !materialId || !vendorId || !quantity || !sectionId) {
        return next(new appError_1.default("demandId, materialId, vendorId, quantity, and sectionId are required", 400));
    }
    const demand = await prisma_1.default.demand.findUnique({
        where: { id: demandId },
        include: {
            section: {
                include: {
                    project: true,
                },
            },
        },
    });
    if (!demand) {
        return next(new appError_1.default("Demand not found", 404));
    }
    if (demand.status !== "APPROVED" &&
        demand.status !== "PO_IN_PROGRESS" &&
        demand.status !== "PARTIALLY_PO_CREATED") {
        return next(new appError_1.default("Demand must be approved before creating PO", 400));
    }
    const existingPOQuantity = await getTotalPOQuantityForDemand(demandId);
    const demandQuantity = Number(demand.quantity);
    const newTotalQuantity = existingPOQuantity + Number(quantity);
    if (newTotalQuantity > demandQuantity) {
        if (!notes || notes.trim() === "") {
            return next(new appError_1.default("Notes are required when PO quantity exceeds demand quantity", 400));
        }
    }
    const material = await prisma_1.default.material.findUnique({
        where: { id: materialId },
    });
    if (!material) {
        return next(new appError_1.default(`Material with id ${materialId} not found`, 404));
    }
    const vendor = await prisma_1.default.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
        return next(new appError_1.default(`Vendor with id ${vendorId} not found`, 404));
    }
    const referenceNumber = await (0, generateCode_1.generatePOReferenceNumber)(demandId);
    const purchaseOrder = await prisma_1.default.purchaseOrder.create({
        data: {
            demandId,
            projectId: demand.section.projectId,
            sectionId,
            referenceNumber,
            materialId,
            vendorId,
            quantity,
            notes: notes || null,
            createdBy: req.user.id,
        },
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
    });
    await updateDemandStatus(demandId);
    res.status(201).json({
        status: "success",
        message: "Purchase Order created successfully",
        data: purchaseOrder,
    });
    await notificationService_1.NotificationService.notifyPOCreated(purchaseOrder.id);
});
exports.getPurchaseOrders = (0, catchAsync_1.default)(async (req, res) => {
    const { projectId, sectionId, demandId, status, hasAmount, page = 1, limit = 10, } = req.query;
    const user = req.user;
    const skip = (Number(page) - 1) * Number(limit);
    let where = {
        isDeleted: false,
    };
    if (projectId)
        where.projectId = projectId;
    if (sectionId)
        where.sectionId = sectionId;
    if (demandId)
        where.demandId = demandId;
    if (status)
        where.status = status;
    if (hasAmount === "true") {
        where.unitPrice = { not: null };
    }
    else if (hasAmount === "false") {
        where.unitPrice = null;
    }
    if (user.role === "ADMIN" || (user.role === "ACCOUNTANT" && user.isHead)) {
    }
    else if (user.role === "SITE_INCHARGE") {
        const assignments = await prisma_1.default.siteInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        where.sectionId = { in: sectionIds };
    }
    else if (user.role === "PROJECT_MANAGER") {
        const assignments = await prisma_1.default.projectManagerAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        where.sectionId = { in: sectionIds };
    }
    else if (user.role === "CONSTRUCTION_MANAGER") {
        const assignments = await prisma_1.default.constructionManagerAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        where.sectionId = { in: sectionIds };
        where.demand = {
            ...(where.demand || {}),
            createdBy: user.id,
        };
    }
    else if (user.role === "STORE_INCHARGE") {
        const assignments = await prisma_1.default.storeInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { store: { select: { sectionId: true } } },
        });
        const sectionIds = assignments.map((a) => a.store.sectionId);
        where.sectionId = { in: sectionIds };
    }
    else if (user.role === "ACCOUNTANT") {
        const assignments = await prisma_1.default.accountantAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        where.sectionId = { in: sectionIds };
    }
    const purchaseOrders = await prisma_1.default.purchaseOrder.findMany({
        where,
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
            amountAdder: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        },
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
    });
    const total = await prisma_1.default.purchaseOrder.count({ where });
    res.status(200).json({
        status: "success",
        data: purchaseOrders,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
        },
    });
});
exports.getPurchaseOrder = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const user = req.user;
    const purchaseOrder = await prisma_1.default.purchaseOrder.findFirst({
        where: { id, isDeleted: false },
        include: {
            demand: {
                include: {
                    section: {
                        include: {
                            project: true,
                        },
                    },
                    approvals: {
                        include: {
                            user: true,
                        },
                    },
                },
            },
            section: true,
            material: true,
            vendor: true,
        },
    });
    if (!purchaseOrder) {
        return next(new appError_1.default("Purchase Order not found", 404));
    }
    if (user.role !== "ADMIN") {
        let assigned = false;
        const sectionId = purchaseOrder.sectionId;
        if (user.role === "SITE_INCHARGE") {
            const assignment = await prisma_1.default.siteInchargeAssignment.findFirst({
                where: { userId: user.id, sectionId, isActive: true },
            });
            assigned = !!assignment;
        }
        else if (user.role === "PROJECT_MANAGER") {
            const assignment = await prisma_1.default.projectManagerAssignment.findFirst({
                where: { userId: user.id, sectionId, isActive: true },
            });
            assigned = !!assignment;
        }
        else if (user.role === "CONSTRUCTION_MANAGER") {
            const assignment = await prisma_1.default.constructionManagerAssignment.findFirst({
                where: { userId: user.id, sectionId, isActive: true },
            });
            assigned = !!assignment;
        }
        else if (user.role === "STORE_INCHARGE") {
            const assignment = await prisma_1.default.storeInchargeAssignment.findFirst({
                where: { userId: user.id, isActive: true, store: { sectionId } },
            });
            assigned = !!assignment;
        }
        else if (user.role === "ACCOUNTANT") {
            const assignment = await prisma_1.default.accountantAssignment.findFirst({
                where: { userId: user.id, sectionId, isActive: true },
            });
            assigned = !!assignment;
        }
        if (!assigned) {
            return next(new appError_1.default("Access denied: not assigned to this purchase order's section", 403));
        }
        if (user.role === "CONSTRUCTION_MANAGER" &&
            purchaseOrder.demand?.createdBy !== user.id) {
            return next(new appError_1.default("Access denied: purchase order not linked to your demands", 403));
        }
    }
    res.status(200).json({
        status: "success",
        data: purchaseOrder,
    });
});
exports.updatePurchaseOrder = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const { status, materialId, vendorId, quantity, notes } = req.body;
    const purchaseOrder = await prisma_1.default.purchaseOrder.findFirst({
        where: { id, isDeleted: false },
        include: {
            demand: true,
        },
    });
    if (!purchaseOrder) {
        return next(new appError_1.default("Purchase Order not found", 404));
    }
    if (!["CREATED", "CONFIRMED"].includes(purchaseOrder.status)) {
        return next(new appError_1.default("Can only update PO in CREATED or CONFIRMED status", 400));
    }
    if (status &&
        !["CREATED", "CONFIRMED", "ORDER_PLACED", "CANCELLED"].includes(status)) {
        return next(new appError_1.default("Invalid status transition", 400));
    }
    if (quantity) {
        const existingPOQuantity = await getTotalPOQuantityForDemand(purchaseOrder.demandId);
        const currentPOQuantity = Number(purchaseOrder.quantity);
        const newTotalQuantity = existingPOQuantity - currentPOQuantity + Number(quantity);
        const demandQuantity = Number(purchaseOrder.demand.quantity);
        if (newTotalQuantity > demandQuantity &&
            (!notes || notes.trim() === "")) {
            return next(new appError_1.default("Notes are required when PO quantity exceeds demand quantity", 400));
        }
    }
    if (materialId) {
        const material = await prisma_1.default.material.findUnique({
            where: { id: materialId },
        });
        if (!material) {
            return next(new appError_1.default(`Material with id ${materialId} not found`, 404));
        }
    }
    if (vendorId) {
        const vendor = await prisma_1.default.vendor.findUnique({
            where: { id: vendorId },
        });
        if (!vendor) {
            return next(new appError_1.default(`Vendor with id ${vendorId} not found`, 404));
        }
    }
    const updatedPO = await prisma_1.default.purchaseOrder.update({
        where: { id },
        data: {
            status,
            materialId,
            vendorId,
            quantity,
            notes: notes !== undefined ? notes || null : undefined,
            updatedBy: req.user.id,
        },
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
    });
    if (quantity) {
        await updateDemandStatus(purchaseOrder.demandId);
    }
    res.status(200).json({
        status: "success",
        data: updatedPO,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Purchase Order Updated",
        body: `Purchase Order ${updatedPO.referenceNumber} was updated successfully.`,
    });
});
exports.deletePurchaseOrder = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const purchaseOrder = await prisma_1.default.purchaseOrder.findFirst({
        where: { id, isDeleted: false },
        include: {
            demand: true,
        },
    });
    if (!purchaseOrder) {
        return next(new appError_1.default("Purchase Order not found", 404));
    }
    if (!["CREATED", "CONFIRMED"].includes(purchaseOrder.status)) {
        return next(new appError_1.default("Can only delete PO in CREATED or CONFIRMED status", 400));
    }
    await prisma_1.default.purchaseOrder.update({
        where: { id },
        data: {
            isDeleted: true,
            updatedBy: req.user.id,
        },
    });
    await updateDemandStatus(purchaseOrder.demandId);
    res.status(204).json({
        status: "success",
        data: null,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Purchase Order Deleted",
        body: `Purchase Order was deleted successfully.`,
    });
});
exports.getPurchaseOrdersByVendor = (0, catchAsync_1.default)(async (req, res) => {
    const { vendorId, projectId, sectionId } = req.query;
    const where = {
        isDeleted: false,
        ...(vendorId && { vendorId: vendorId }),
        ...(projectId && { projectId: projectId }),
        ...(sectionId && { sectionId: sectionId }),
    };
    const purchaseOrders = await prisma_1.default.purchaseOrder.findMany({
        where,
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
        orderBy: { createdAt: "desc" },
    });
    res.status(200).json({
        status: "success",
        data: purchaseOrders,
    });
});
exports.getPurchaseOrderSummary = (0, catchAsync_1.default)(async (req, res) => {
    const { projectId, sectionId } = req.query;
    const where = {
        isDeleted: false,
    };
    if (projectId)
        where.projectId = projectId;
    if (sectionId)
        where.sectionId = sectionId;
    const summary = await prisma_1.default.purchaseOrder.groupBy({
        by: ["status"],
        where,
        _count: {
            id: true,
        },
        _sum: {
            quantity: true,
        },
    });
    const totalPOs = await prisma_1.default.purchaseOrder.count({ where });
    const totalAmount = await prisma_1.default.purchaseOrder.aggregate({
        where,
        _sum: {
            quantity: true,
        },
    });
    res.status(200).json({
        status: "success",
        data: {
            summary,
            totalPOs,
            totalQuantity: totalAmount._sum.quantity || 0,
        },
    });
});
exports.getDemandPOStatistics = (0, catchAsync_1.default)(async (req, res, next) => {
    const { demandId } = req.params;
    const demand = await prisma_1.default.demand.findUnique({
        where: { id: demandId },
    });
    if (!demand) {
        return next(new appError_1.default("Demand not found", 404));
    }
    const totalPOQuantity = await getTotalPOQuantityForDemand(demandId);
    const demandQuantity = Number(demand.quantity);
    const remainingQuantity = demandQuantity - totalPOQuantity;
    const purchaseOrders = await prisma_1.default.purchaseOrder.findMany({
        where: {
            demandId,
            isDeleted: false,
        },
        include: {
            material: true,
            vendor: true,
        },
        orderBy: { createdAt: "desc" },
    });
    res.status(200).json({
        status: "success",
        data: {
            demand,
            totalPOQuantity,
            demandQuantity,
            remainingQuantity,
            purchaseOrders,
            isFullyCovered: totalPOQuantity >= demandQuantity,
            isPartiallyCovered: totalPOQuantity > 0 && totalPOQuantity < demandQuantity,
        },
    });
});
exports.updatePOStatus = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;
    const purchaseOrder = await prisma_1.default.purchaseOrder.findFirst({
        where: { id, isDeleted: false },
        include: {
            demand: true,
            material: true,
            vendor: true,
        },
    });
    if (!purchaseOrder) {
        return next(new appError_1.default("Purchase Order not found", 404));
    }
    const validTransitions = {
        CREATED: ["CONFIRMED", "ORDER_PLACED", "CANCELLED"],
        CONFIRMED: ["ORDER_PLACED", "CANCELLED"],
        ORDER_PLACED: ["IN_TRANSIT", "CANCELLED"],
        IN_TRANSIT: ["IN_STORE", "CANCELLED"],
        IN_STORE: ["COMPLETED"],
        COMPLETED: [],
        CANCELLED: [],
    };
    const currentStatus = purchaseOrder.status;
    const allowedTransitions = validTransitions[currentStatus] || [];
    if (!allowedTransitions.includes(status)) {
        return next(new appError_1.default(`Invalid status transition from ${currentStatus} to ${status}. Allowed transitions: ${allowedTransitions.join(", ")}`, 400));
    }
    if (status === "ORDER_PLACED") {
        if (!purchaseOrder.materialId ||
            !purchaseOrder.vendorId ||
            !purchaseOrder.quantity) {
            return next(new appError_1.default("PO must have material, vendor, and quantity before placing order", 400));
        }
    }
    const updatedPO = await prisma_1.default.purchaseOrder.update({
        where: { id },
        data: {
            status,
            updatedBy: req.user.id,
        },
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
    });
    res.status(200).json({
        status: "success",
        message: `Purchase Order status updated to ${status}`,
        data: updatedPO,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Purchase Order Status Updated",
        body: `Purchase Order ${updatedPO.referenceNumber} status changed to ${status}.`,
    });
});
exports.addPOAmount = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const { unitPrice, notes } = req.body;
    const filesFromS3 = req.filesFromS3;
    const proofOfBill = filesFromS3?.proofOfBill;
    const purchaseOrder = await prisma_1.default.purchaseOrder.findFirst({
        where: { id, isDeleted: false },
        include: {
            demand: true,
            material: true,
            vendor: true,
        },
    });
    if (!purchaseOrder) {
        return next(new appError_1.default("Purchase Order not found", 404));
    }
    if (purchaseOrder.status !== "CREATED") {
        return next(new appError_1.default("Can only add amounts to PO in CREATED status", 400));
    }
    if (!unitPrice || unitPrice <= 0) {
        return next(new appError_1.default("Unit price must be greater than 0", 400));
    }
    if (!proofOfBill) {
        return next(new appError_1.default("Proof of bill/invoice file is required", 400));
    }
    const totalAmount = Number(purchaseOrder.quantity) * Number(unitPrice);
    const result = await prisma_1.default.$transaction(async (tx) => {
        const updatedPO = await tx.purchaseOrder.update({
            where: { id },
            data: {
                unitPrice: new library_1.Decimal(unitPrice),
                totalAmount: new library_1.Decimal(totalAmount),
                proofOfBill,
                amountAddedBy: req.user.id,
                amountAddedAt: new Date(),
                status: "CONFIRMED",
                updatedBy: req.user.id,
            },
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
        });
        let vendorAccount = await tx.vendorAccount.findUnique({
            where: { vendorId: purchaseOrder.vendorId },
        });
        if (!vendorAccount) {
            vendorAccount = await tx.vendorAccount.create({
                data: {
                    vendorId: purchaseOrder.vendorId,
                    totalCredited: new library_1.Decimal(0),
                    totalDebited: new library_1.Decimal(0),
                    balance: new library_1.Decimal(0),
                },
            });
        }
        await tx.vendorAccountTransaction.create({
            data: {
                vendorAccountId: vendorAccount.id,
                type: "CREDIT",
                amount: new library_1.Decimal(totalAmount),
                purchaseOrderId: purchaseOrder.id,
                addedBy: req.user.id,
                proofOfPayment: proofOfBill,
                note: notes || `Credit for PO ${purchaseOrder.referenceNumber}`,
            },
        });
        await tx.vendorAccount.update({
            where: { id: vendorAccount.id },
            data: {
                totalCredited: vendorAccount.totalCredited.add(new library_1.Decimal(totalAmount)),
                balance: vendorAccount.balance.add(new library_1.Decimal(totalAmount)),
            },
        });
        return updatedPO;
    });
    res.status(200).json({
        status: "success",
        message: `Amount added to PO, status changed to CONFIRMED, and vendor account credited with ${totalAmount}`,
        data: result,
    });
});
exports.updatePOAmount = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const { unitPrice, notes } = req.body;
    const filesFromS3 = req.filesFromS3;
    const proofOfBill = filesFromS3?.proofOfBill;
    const purchaseOrder = await prisma_1.default.purchaseOrder.findFirst({
        where: { id, isDeleted: false },
        include: {
            demand: true,
            material: true,
            vendor: true,
            amountAdder: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        },
    });
    if (!purchaseOrder) {
        return next(new appError_1.default("Purchase Order not found", 404));
    }
    if (!purchaseOrder.amountAddedAt) {
        return next(new appError_1.default("No amount has been added to this PO yet", 400));
    }
    const now = new Date();
    const amountAddedAt = new Date(purchaseOrder.amountAddedAt);
    const hoursDiff = (now.getTime() - amountAddedAt.getTime()) / (1000 * 60 * 60);
    if (hoursDiff > 24) {
        return next(new appError_1.default("Cannot edit: 24-hour edit window has expired", 400));
    }
    const user = req.user;
    if (purchaseOrder.amountAddedBy !== user.id &&
        user.role !== "ADMIN" &&
        !(user.role === "ACCOUNTANT" && user.isHead)) {
        return next(new appError_1.default("Only the user who added the amount can edit it (or admin/head accountant)", 403));
    }
    if (!unitPrice || unitPrice <= 0) {
        return next(new appError_1.default("Unit price must be greater than 0", 400));
    }
    const oldTotalAmount = Number(purchaseOrder.totalAmount || 0);
    const newTotalAmount = Number(purchaseOrder.quantity) * Number(unitPrice);
    const amountDifference = newTotalAmount - oldTotalAmount;
    const result = await prisma_1.default.$transaction(async (tx) => {
        const updateData = {
            unitPrice: new library_1.Decimal(unitPrice),
            totalAmount: new library_1.Decimal(newTotalAmount),
            updatedBy: user.id,
        };
        if (notes) {
            updateData.notes = notes;
        }
        if (proofOfBill) {
            updateData.proofOfBill = proofOfBill;
        }
        const updatedPO = await tx.purchaseOrder.update({
            where: { id },
            data: updateData,
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
                amountAdder: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
        let vendorAccount = await tx.vendorAccount.findUnique({
            where: { vendorId: purchaseOrder.vendorId },
        });
        if (!vendorAccount) {
            vendorAccount = await tx.vendorAccount.create({
                data: {
                    vendorId: purchaseOrder.vendorId,
                    totalCredited: new library_1.Decimal(0),
                    totalDebited: new library_1.Decimal(0),
                    balance: new library_1.Decimal(0),
                },
            });
        }
        const existingTransaction = await tx.vendorAccountTransaction.findFirst({
            where: {
                vendorAccountId: vendorAccount.id,
                purchaseOrderId: purchaseOrder.id,
                type: "CREDIT",
            },
        });
        if (existingTransaction) {
            await tx.vendorAccountTransaction.update({
                where: { id: existingTransaction.id },
                data: {
                    amount: new library_1.Decimal(newTotalAmount),
                    note: notes || existingTransaction.note || `Credit for PO ${purchaseOrder.referenceNumber}`,
                    ...(proofOfBill && { proofOfPayment: proofOfBill }),
                },
            });
        }
        else {
            await tx.vendorAccountTransaction.create({
                data: {
                    vendorAccountId: vendorAccount.id,
                    type: "CREDIT",
                    amount: new library_1.Decimal(newTotalAmount),
                    purchaseOrderId: purchaseOrder.id,
                    addedBy: user.id,
                    proofOfPayment: proofOfBill || purchaseOrder.proofOfBill,
                    note: notes || `Credit for PO ${purchaseOrder.referenceNumber}`,
                },
            });
        }
        const newTotalCredited = vendorAccount.totalCredited
            .sub(new library_1.Decimal(oldTotalAmount))
            .add(new library_1.Decimal(newTotalAmount));
        await tx.vendorAccount.update({
            where: { id: vendorAccount.id },
            data: {
                totalCredited: newTotalCredited,
                balance: vendorAccount.balance
                    .sub(new library_1.Decimal(oldTotalAmount))
                    .add(new library_1.Decimal(newTotalAmount)),
            },
        });
        return updatedPO;
    });
    res.status(200).json({
        status: "success",
        message: `PO amount updated successfully. Amount difference: ${amountDifference >= 0 ? '+' : ''}${amountDifference}`,
        data: result,
    });
});
//# sourceMappingURL=purchaseOrder.controller.js.map