"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectAccountants = exports.addSectionExpense = exports.addDistribution = exports.addInternalExpense = exports.addFunding = exports.getTransactions = exports.getProjectBalance = exports.getSummaryByProject = exports.getSummary = exports.deleteExpenseHead = exports.updateExpenseHead = exports.createExpenseHead = exports.getExpenseHeads = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const pettyCashAccess_1 = require("../utils/pettyCashAccess");
const transactionInclude = {
    project: { select: { id: true, name: true, code: true } },
    section: { select: { id: true, name: true, code: true } },
    expenseHead: { select: { id: true, name: true } },
    creator: { select: { id: true, name: true, email: true, role: true } },
    recipient: { select: { id: true, name: true, email: true } },
};
exports.getExpenseHeads = (0, catchAsync_1.default)(async (req, res) => {
    const heads = await prisma_1.default.pettyCashExpenseHead.findMany({
        where: { isDeleted: false, isActive: true },
        orderBy: { name: "asc" },
    });
    res.status(200).json({ status: "success", data: heads });
});
exports.createExpenseHead = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (!(0, pettyCashAccess_1.isHeadOfficeUser)(user)) {
        return next(new appError_1.default("Not authorized to manage expense heads", 403));
    }
    const { name, description } = req.body;
    if (!name?.trim()) {
        return next(new appError_1.default("Expense head name is required", 400));
    }
    const head = await prisma_1.default.pettyCashExpenseHead.create({
        data: {
            name: name.trim(),
            description: description?.trim() || null,
            createdBy: user.id,
        },
    });
    res.status(201).json({ status: "success", data: head });
});
exports.updateExpenseHead = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (!(0, pettyCashAccess_1.isHeadOfficeUser)(user)) {
        return next(new appError_1.default("Not authorized to manage expense heads", 403));
    }
    const { id } = req.params;
    const { name, description, isActive } = req.body;
    const head = await prisma_1.default.pettyCashExpenseHead.update({
        where: { id },
        data: {
            ...(name && { name: name.trim() }),
            ...(description !== undefined && {
                description: description?.trim() || null,
            }),
            ...(isActive !== undefined && { isActive }),
            updatedBy: user.id,
        },
    });
    res.status(200).json({ status: "success", data: head });
});
exports.deleteExpenseHead = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (!(0, pettyCashAccess_1.isHeadOfficeUser)(user)) {
        return next(new appError_1.default("Not authorized to manage expense heads", 403));
    }
    const { id } = req.params;
    await prisma_1.default.pettyCashExpenseHead.update({
        where: { id },
        data: { isDeleted: true, isActive: false, updatedBy: user.id },
    });
    res.status(200).json({ status: "success", message: "Expense head deleted" });
});
exports.getSummary = (0, catchAsync_1.default)(async (req, res) => {
    const user = req.user;
    const accessWhere = await (0, pettyCashAccess_1.buildPettyCashAccessWhere)(user);
    const transactions = await prisma_1.default.pettyCashTransaction.findMany({
        where: accessWhere,
        select: { type: true, amount: true },
    });
    let totalFunded = 0;
    let totalDistributed = 0;
    let totalInternalExpenses = 0;
    let totalSectionExpenses = 0;
    for (const tx of transactions) {
        const amt = Number(tx.amount);
        switch (tx.type) {
            case "FUNDING":
                totalFunded += amt;
                break;
            case "DISTRIBUTION":
                totalDistributed += amt;
                break;
            case "INTERNAL_EXPENSE":
                totalInternalExpenses += amt;
                break;
            case "SECTION_EXPENSE":
                totalSectionExpenses += amt;
                break;
        }
    }
    const totalSpent = totalInternalExpenses + totalSectionExpenses;
    const poolRemaining = totalFunded - totalDistributed - totalInternalExpenses;
    const headOffice = (0, pettyCashAccess_1.isHeadOfficeUser)(user);
    let canDistribute = headOffice;
    let canAddInternalExpense = headOffice;
    let canAddSectionExpense = headOffice;
    if (user.role === "ACCOUNTANT" && !user.isHead) {
        const projectIds = await (0, pettyCashAccess_1.getProjectAccountantProjectIds)(user.id);
        const sectionIds = await (0, pettyCashAccess_1.getSectionAccountantSectionIds)(user.id);
        canDistribute = projectIds.length > 0;
        canAddInternalExpense = projectIds.length > 0;
        canAddSectionExpense = sectionIds.length > 0 || projectIds.length > 0;
    }
    res.status(200).json({
        status: "success",
        data: {
            totalFunded,
            totalDistributed,
            totalInternalExpenses,
            totalSectionExpenses,
            totalSpent,
            poolRemaining,
            canAddFunding: headOffice,
            canManageHeads: headOffice,
            canDistribute,
            canAddInternalExpense,
            canAddSectionExpense,
        },
    });
});
exports.getSummaryByProject = (0, catchAsync_1.default)(async (req, res) => {
    const user = req.user;
    const accessibleIds = await (0, pettyCashAccess_1.getAccessibleProjectIds)(user);
    const projects = await prisma_1.default.project.findMany({
        where: {
            id: { in: accessibleIds.length ? accessibleIds : ["__none__"] },
            isDeleted: false,
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
    });
    const result = await Promise.all(projects.map(async (project) => {
        const balances = await (0, pettyCashAccess_1.computeProjectBalances)(project.id);
        return { ...project, ...balances };
    }));
    res.status(200).json({ status: "success", data: result });
});
exports.getProjectBalance = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const { projectId } = req.params;
    if (!(await (0, pettyCashAccess_1.assertProjectAccess)(user, projectId))) {
        return next(new appError_1.default("Not authorized for this project", 403));
    }
    const project = await prisma_1.default.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, code: true },
    });
    if (!project)
        return next(new appError_1.default("Project not found", 404));
    const balances = await (0, pettyCashAccess_1.computeProjectBalances)(projectId);
    const sections = await prisma_1.default.section.findMany({
        where: { projectId, isDeleted: false },
        select: { id: true, name: true, code: true },
    });
    const sectionDetails = sections.map((s) => ({
        ...s,
        ...(balances.sectionBalances[s.id] || {
            received: 0,
            spent: 0,
            remaining: 0,
        }),
    }));
    res.status(200).json({
        status: "success",
        data: { project, ...balances, sections: sectionDetails },
    });
});
exports.getTransactions = (0, catchAsync_1.default)(async (req, res) => {
    const user = req.user;
    const { projectId, sectionId, type, dateFrom, dateTo, page = "1", limit = "50", } = req.query;
    const accessWhere = await (0, pettyCashAccess_1.buildPettyCashAccessWhere)(user);
    const where = { ...accessWhere };
    if (projectId)
        where.projectId = projectId;
    if (sectionId)
        where.sectionId = sectionId;
    if (type)
        where.type = type;
    if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom)
            where.createdAt.gte = new Date(dateFrom);
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            where.createdAt.lte = end;
        }
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [transactions, total] = await Promise.all([
        prisma_1.default.pettyCashTransaction.findMany({
            where,
            include: transactionInclude,
            orderBy: { createdAt: "desc" },
            skip,
            take: Number(limit),
        }),
        prisma_1.default.pettyCashTransaction.count({ where }),
    ]);
    res.status(200).json({
        status: "success",
        data: transactions,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
        },
    });
});
exports.addFunding = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (!(0, pettyCashAccess_1.isHeadOfficeUser)(user)) {
        return next(new appError_1.default("Only head office users can add petty cash funding", 403));
    }
    const { projectId, amount, description } = req.body;
    const filesFromS3 = req.filesFromS3;
    const proofUrl = filesFromS3?.proofOfExpense || null;
    if (!projectId)
        return next(new appError_1.default("Project is required", 400));
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return next(new appError_1.default("A valid amount is required", 400));
    }
    const project = await prisma_1.default.project.findFirst({
        where: { id: projectId, isDeleted: false },
    });
    if (!project)
        return next(new appError_1.default("Project not found", 404));
    const tx = await prisma_1.default.pettyCashTransaction.create({
        data: {
            type: "FUNDING",
            projectId,
            amount: Number(amount),
            proofUrl,
            description: description?.trim() || null,
            createdBy: user.id,
        },
        include: transactionInclude,
    });
    res.status(201).json({ status: "success", data: tx });
});
exports.addInternalExpense = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const { projectId, expenseHeadId, amount, description } = req.body;
    const filesFromS3 = req.filesFromS3;
    const proofUrl = filesFromS3?.proofOfExpense || null;
    if (!projectId)
        return next(new appError_1.default("Project is required", 400));
    if (!expenseHeadId)
        return next(new appError_1.default("Expense head is required", 400));
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return next(new appError_1.default("A valid amount is required", 400));
    }
    const canAdd = (0, pettyCashAccess_1.isHeadOfficeUser)(user) ||
        (await (0, pettyCashAccess_1.isProjectAccountant)(user.id, projectId));
    if (!canAdd) {
        return next(new appError_1.default("Not authorized to add internal expense", 403));
    }
    if (!(await (0, pettyCashAccess_1.assertProjectAccess)(user, projectId))) {
        return next(new appError_1.default("Not authorized for this project", 403));
    }
    const remaining = await (0, pettyCashAccess_1.getProjectPoolRemaining)(projectId);
    if (Number(amount) > remaining) {
        return next(new appError_1.default(`Insufficient project pool balance. Available: ${remaining.toFixed(2)}`, 400));
    }
    const head = await prisma_1.default.pettyCashExpenseHead.findFirst({
        where: { id: expenseHeadId, isDeleted: false, isActive: true },
    });
    if (!head)
        return next(new appError_1.default("Expense head not found", 404));
    const tx = await prisma_1.default.pettyCashTransaction.create({
        data: {
            type: "INTERNAL_EXPENSE",
            projectId,
            expenseHeadId,
            amount: Number(amount),
            proofUrl,
            description: description?.trim() || null,
            createdBy: user.id,
        },
        include: transactionInclude,
    });
    res.status(201).json({ status: "success", data: tx });
});
exports.addDistribution = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const { projectId, sectionId, recipientUserId, amount, description } = req.body;
    if (!projectId)
        return next(new appError_1.default("Project is required", 400));
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return next(new appError_1.default("A valid amount is required", 400));
    }
    const canDistribute = (0, pettyCashAccess_1.isHeadOfficeUser)(user) ||
        (await (0, pettyCashAccess_1.isProjectAccountant)(user.id, projectId));
    if (!canDistribute) {
        return next(new appError_1.default("Not authorized to distribute petty cash", 403));
    }
    if (!(await (0, pettyCashAccess_1.assertProjectAccess)(user, projectId))) {
        return next(new appError_1.default("Not authorized for this project", 403));
    }
    const remaining = await (0, pettyCashAccess_1.getProjectPoolRemaining)(projectId);
    if (Number(amount) > remaining) {
        return next(new appError_1.default(`Insufficient project pool. Available: ${remaining.toFixed(2)}`, 400));
    }
    if (sectionId) {
        const section = await prisma_1.default.section.findFirst({
            where: { id: sectionId, projectId, isDeleted: false },
        });
        if (!section)
            return next(new appError_1.default("Section not found in project", 404));
    }
    if (recipientUserId) {
        const recipient = await prisma_1.default.user.findFirst({
            where: { id: recipientUserId, isDeleted: false, isActive: true },
        });
        if (!recipient)
            return next(new appError_1.default("Recipient not found", 404));
    }
    const tx = await prisma_1.default.pettyCashTransaction.create({
        data: {
            type: "DISTRIBUTION",
            projectId,
            sectionId: sectionId || null,
            recipientUserId: recipientUserId || user.id,
            amount: Number(amount),
            description: description?.trim() || null,
            createdBy: user.id,
        },
        include: transactionInclude,
    });
    res.status(201).json({ status: "success", data: tx });
});
exports.addSectionExpense = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const { projectId, sectionId, expenseHeadId, amount, description } = req.body;
    const filesFromS3 = req.filesFromS3;
    const proofUrl = filesFromS3?.proofOfExpense || null;
    if (!projectId || !sectionId) {
        return next(new appError_1.default("Project and section are required", 400));
    }
    if (!expenseHeadId)
        return next(new appError_1.default("Expense head is required", 400));
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return next(new appError_1.default("A valid amount is required", 400));
    }
    const canExpense = (0, pettyCashAccess_1.isHeadOfficeUser)(user) ||
        (await (0, pettyCashAccess_1.isProjectAccountant)(user.id, projectId)) ||
        (await (0, pettyCashAccess_1.isSectionAccountantFor)(user.id, sectionId));
    if (!canExpense) {
        return next(new appError_1.default("Not authorized for section expense", 403));
    }
    if (!(await (0, pettyCashAccess_1.assertSectionAccess)(user, sectionId))) {
        return next(new appError_1.default("Not authorized for this section", 403));
    }
    const remaining = await (0, pettyCashAccess_1.getSectionRemaining)(sectionId);
    if (Number(amount) > remaining) {
        return next(new appError_1.default(`Insufficient section balance. Available: ${remaining.toFixed(2)}`, 400));
    }
    const head = await prisma_1.default.pettyCashExpenseHead.findFirst({
        where: { id: expenseHeadId, isDeleted: false, isActive: true },
    });
    if (!head)
        return next(new appError_1.default("Expense head not found", 404));
    const tx = await prisma_1.default.pettyCashTransaction.create({
        data: {
            type: "SECTION_EXPENSE",
            projectId,
            sectionId,
            expenseHeadId,
            amount: Number(amount),
            proofUrl,
            description: description?.trim() || null,
            createdBy: user.id,
        },
        include: transactionInclude,
    });
    res.status(201).json({ status: "success", data: tx });
});
exports.getProjectAccountants = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const { projectId } = req.params;
    if (!(await (0, pettyCashAccess_1.assertProjectAccess)(user, projectId))) {
        return next(new appError_1.default("Not authorized for this project", 403));
    }
    const assignments = await prisma_1.default.accountantAssignment.findMany({
        where: { projectId, isActive: true },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    employeeId: true,
                    isHead: true,
                },
            },
        },
    });
    const accountants = assignments.map((a) => ({
        ...a.user,
        sectionId: a.sectionId,
        assignmentType: a.sectionId ? "SECTION" : "PROJECT",
    }));
    res.status(200).json({ status: "success", data: accountants });
});
//# sourceMappingURL=pettyCash.controller.js.map