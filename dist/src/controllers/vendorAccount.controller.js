"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllVendorAccounts = exports.getVendorAccountSummary = exports.getVendorAccountTransactions = exports.getVendorPayments = exports.addVendorPayment = exports.getVendorAccountStatement = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const notificationService_1 = require("../utils/notificationService");
const prisma_1 = __importDefault(require("../utils/prisma"));
exports.getVendorAccountStatement = (0, catchAsync_1.default)(async (req, res, next) => {
    const { vendorId } = req.params;
    const vendorAccount = await prisma_1.default.vendorAccount.findUnique({
        where: { vendorId },
        include: {
            vendor: true,
            transactions: {
                orderBy: { createdAt: "desc" },
            },
        },
    });
    if (!vendorAccount) {
        return next(new appError_1.default("Vendor account not found", 404));
    }
    res.status(200).json({
        status: "success",
        data: vendorAccount,
    });
});
exports.addVendorPayment = (0, catchAsync_1.default)(async (req, res, next) => {
    const { vendorId } = req.params;
    const { amount, note } = req.body;
    const userId = req.user.id;
    const filesFromS3 = req.filesFromS3;
    const proofOfPayment = filesFromS3?.proofOfPayment;
    const vendor = await prisma_1.default.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
        return next(new appError_1.default("Vendor not found", 404));
    }
    if (!proofOfPayment) {
        return next(new appError_1.default("Proof of payment file is required", 400));
    }
    let vendorAccount = await prisma_1.default.vendorAccount.findUnique({
        where: { vendorId },
    });
    if (!vendorAccount) {
        vendorAccount = await prisma_1.default.vendorAccount.create({
            data: { vendorId },
        });
    }
    const payment = await prisma_1.default.vendorPayment.create({
        data: {
            vendorId,
            amount,
            addedBy: userId,
            proofOfPayment,
            note,
        },
    });
    await prisma_1.default.vendorAccountTransaction.create({
        data: {
            vendorAccountId: vendorAccount.id,
            type: "DEBIT",
            amount,
            vendorPaymentId: payment.id,
            addedBy: userId,
            proofOfPayment,
            note,
        },
    });
    const credited = vendorAccount.totalCredited;
    const allDebits = await prisma_1.default.vendorAccountTransaction.findMany({
        where: { vendorAccountId: vendorAccount.id, type: "DEBIT" },
    });
    const totalDebited = allDebits.reduce((sum, t) => sum + Number(t.amount), 0);
    const balance = Number(credited) - totalDebited;
    await prisma_1.default.vendorAccount.update({
        where: { id: vendorAccount.id },
        data: {
            totalDebited,
            balance,
        },
    });
    res.status(201).json({
        status: "success",
        data: payment,
    });
    await notificationService_1.NotificationService.notifyVendorPayment(payment.id);
});
exports.getVendorPayments = (0, catchAsync_1.default)(async (req, res) => {
    const { vendorId } = req.query;
    const payments = await prisma_1.default.vendorPayment.findMany({
        where: { vendorId: vendorId },
        orderBy: { createdAt: "desc" },
    });
    res.status(200).json({
        status: "success",
        data: payments,
    });
});
exports.getVendorAccountTransactions = (0, catchAsync_1.default)(async (req, res) => {
    const { vendorAccountId } = req.query;
    const transactions = await prisma_1.default.vendorAccountTransaction.findMany({
        where: { vendorAccountId: vendorAccountId },
        orderBy: { createdAt: "desc" },
    });
    res.status(200).json({
        status: "success",
        data: transactions,
    });
});
exports.getVendorAccountSummary = (0, catchAsync_1.default)(async (req, res) => {
    const { vendorId } = req.params;
    const vendorAccount = await prisma_1.default.vendorAccount.findUnique({
        where: { vendorId },
        include: {
            vendor: true,
        },
    });
    if (!vendorAccount) {
        res.status(200).json({
            status: "success",
            data: {
                vendorId,
                totalCredited: 0,
                totalDebited: 0,
                balance: 0,
                vendor: null,
            },
        });
        return;
    }
    res.status(200).json({
        status: "success",
        data: vendorAccount,
    });
});
exports.getAllVendorAccounts = (0, catchAsync_1.default)(async (req, res) => {
    const { page = 1, limit = 10, search, projectId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    let where = {};
    if (search) {
        where.vendor = {
            OR: [
                { name: { contains: search, mode: "insensitive" } },
                {
                    contactPerson: { contains: search, mode: "insensitive" },
                },
                { email: { contains: search, mode: "insensitive" } },
            ],
        };
    }
    if (projectId) {
        const projectPurchaseOrderIds = await prisma_1.default.purchaseOrder.findMany({
            where: {
                projectId: projectId,
                isDeleted: false,
            },
            select: {
                id: true,
            },
        });
        const purchaseOrderIds = projectPurchaseOrderIds.map((po) => po.id);
        const vendorAccountsWithProjectTransactions = await prisma_1.default.vendorAccount.findMany({
            where: {
                ...where,
                transactions: {
                    some: {
                        purchaseOrderId: {
                            in: purchaseOrderIds,
                        },
                    },
                },
            },
            include: {
                vendor: {
                    select: {
                        id: true,
                        name: true,
                        contactPerson: true,
                        email: true,
                        phone: true,
                        address: true,
                        isActive: true,
                    },
                },
                transactions: {
                    where: {
                        purchaseOrderId: {
                            in: purchaseOrderIds,
                        },
                    },
                    orderBy: { createdAt: "desc" },
                },
            },
            skip,
            take: Number(limit),
            orderBy: { lastUpdated: "desc" },
        });
        const vendorAccountsWithMetrics = vendorAccountsWithProjectTransactions.map((account) => {
            const projectCredited = account.transactions
                .filter((t) => t.type === "CREDIT")
                .reduce((sum, t) => sum + Number(t.amount), 0);
            const projectDebited = account.transactions
                .filter((t) => t.type === "DEBIT")
                .reduce((sum, t) => sum + Number(t.amount), 0);
            const projectBalance = projectCredited - projectDebited;
            const paidAmount = projectDebited;
            const remainingAmount = projectBalance;
            const overdueAmount = projectBalance > 0 ? projectBalance : 0;
            const advanceAmount = projectBalance < 0 ? Math.abs(projectBalance) : 0;
            return {
                id: account.id,
                vendorId: account.vendorId,
                vendor: account.vendor,
                totalCredited: projectCredited,
                totalDebited: projectDebited,
                balance: projectBalance,
                paidAmount,
                remainingAmount,
                overdueAmount,
                advanceAmount,
                lastUpdated: account.lastUpdated,
                recentTransactions: account.transactions.slice(0, 5),
                hasOverdueAmount: overdueAmount > 0,
                hasAdvanceAmount: advanceAmount > 0,
                isBalanced: projectBalance === 0,
            };
        });
        const vendorsWithProjectActivity = vendorAccountsWithMetrics.filter((account) => account.totalCredited > 0 || account.totalDebited > 0);
        const total = await prisma_1.default.vendorAccount.count({
            where: {
                ...where,
                transactions: {
                    some: {
                        purchaseOrderId: {
                            in: purchaseOrderIds,
                        },
                    },
                },
            },
        });
        res.status(200).json({
            status: "success",
            data: vendorsWithProjectActivity,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit)),
            },
            summary: {
                totalVendors: total,
                totalCredited: vendorsWithProjectActivity.reduce((sum, acc) => sum + acc.totalCredited, 0),
                totalDebited: vendorsWithProjectActivity.reduce((sum, acc) => sum + acc.totalDebited, 0),
                totalBalance: vendorsWithProjectActivity.reduce((sum, acc) => sum + acc.balance, 0),
                vendorsWithOverdue: vendorsWithProjectActivity.filter((acc) => acc.hasOverdueAmount).length,
                vendorsWithAdvance: vendorsWithProjectActivity.filter((acc) => acc.hasAdvanceAmount).length,
            },
        });
        return;
    }
    const vendorAccounts = await prisma_1.default.vendorAccount.findMany({
        where,
        include: {
            vendor: {
                select: {
                    id: true,
                    name: true,
                    contactPerson: true,
                    email: true,
                    phone: true,
                    address: true,
                    isActive: true,
                },
            },
            transactions: {
                orderBy: { createdAt: "desc" },
                take: 5,
            },
        },
        skip,
        take: Number(limit),
        orderBy: { lastUpdated: "desc" },
    });
    const vendorAccountsWithMetrics = vendorAccounts.map((account) => {
        const totalCredited = Number(account.totalCredited);
        const totalDebited = Number(account.totalDebited);
        const balance = Number(account.balance);
        const paidAmount = totalDebited;
        const remainingAmount = balance;
        const overdueAmount = balance > 0 ? balance : 0;
        const advanceAmount = balance < 0 ? Math.abs(balance) : 0;
        return {
            id: account.id,
            vendorId: account.vendorId,
            vendor: account.vendor,
            totalCredited,
            totalDebited,
            balance,
            paidAmount,
            remainingAmount,
            overdueAmount,
            advanceAmount,
            lastUpdated: account.lastUpdated,
            recentTransactions: account.transactions,
            hasOverdueAmount: overdueAmount > 0,
            hasAdvanceAmount: advanceAmount > 0,
            isBalanced: balance === 0,
        };
    });
    const total = await prisma_1.default.vendorAccount.count({ where });
    res.status(200).json({
        status: "success",
        data: vendorAccountsWithMetrics,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
        },
        summary: {
            totalVendors: total,
            totalCredited: vendorAccounts.reduce((sum, acc) => sum + Number(acc.totalCredited), 0),
            totalDebited: vendorAccounts.reduce((sum, acc) => sum + Number(acc.totalDebited), 0),
            totalBalance: vendorAccounts.reduce((sum, acc) => sum + Number(acc.balance), 0),
            vendorsWithOverdue: vendorAccountsWithMetrics.filter((acc) => acc.hasOverdueAmount).length,
            vendorsWithAdvance: vendorAccountsWithMetrics.filter((acc) => acc.hasAdvanceAmount).length,
        },
    });
});
//# sourceMappingURL=vendorAccount.controller.js.map