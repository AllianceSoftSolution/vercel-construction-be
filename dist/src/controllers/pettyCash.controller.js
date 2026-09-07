"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addDirectExpense = exports.getDirectExpenseSummary = exports.getDirectExpenses = exports.getProjectAccountants = exports.getProjectSections = exports.addSectionExpense = exports.addDistribution = exports.addInternalExpense = exports.addFunding = exports.addPettyCashPool = exports.getAdminPettyCashAuditLogHandler = exports.getTransactions = exports.getProjectBalance = exports.getSummaryBySection = exports.getSummaryByProject = exports.getSummary = exports.deleteExpenseHead = exports.updateExpenseHead = exports.createExpenseHead = exports.getExpenseHeads = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const pettyCashAccess_1 = require("../utils/pettyCashAccess");
const privilegedAdmin_1 = require("../utils/privilegedAdmin");
const attachmentUrls_1 = require("../utils/attachmentUrls");
const resolveUploadUrls_1 = require("../utils/resolveUploadUrls");
const mapTransactionResponse = (tx) => {
    const mapped = (0, attachmentUrls_1.mapRecordAttachmentFields)(tx, ["proofUrl"]);
    if (mapped && "amount" in mapped) {
        const raw = mapped.amount;
        const numeric = raw != null &&
            typeof raw === "object" &&
            typeof raw.toNumber === "function"
            ? raw.toNumber()
            : Number(raw);
        mapped.amount = Number.isFinite(numeric) ? numeric : 0;
    }
    return mapped;
};
const transactionInclude = {
    project: { select: { id: true, name: true, code: true } },
    section: {
        select: {
            id: true,
            name: true,
            code: true,
            accountantAssignments: {
                where: { isActive: true },
                take: 1,
                select: {
                    user: { select: { id: true, name: true, email: true } },
                },
            },
        },
    },
    expenseHead: { select: { id: true, name: true } },
    creator: {
        select: { id: true, name: true, email: true, role: true, isHead: true },
    },
    recipient: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isHead: true,
        },
    },
};
const parseExpenseHeadKind = (value) => {
    const raw = String(value || "PETTY_CASH").trim().toUpperCase();
    if (raw === "ALL")
        return "ALL";
    if (raw === "DIRECT_EXPENSE")
        return "DIRECT_EXPENSE";
    return "PETTY_CASH";
};
exports.getExpenseHeads = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const kind = parseExpenseHeadKind(req.query.kind);
    const where = { isDeleted: false, isActive: true };
    if (kind === "DIRECT_EXPENSE") {
        if (!(await (0, pettyCashAccess_1.canViewDirectExpense)(user))) {
            return next(new appError_1.default("Not authorized to view Direct Expense heads", 403));
        }
        where.kind = kind;
    }
    else if (kind === "ALL") {
        const canSelectAll = await (0, pettyCashAccess_1.canSelectAllExpenseHeadTypes)(user);
        if (!canSelectAll)
            where.kind = "PETTY_CASH";
    }
    else {
        where.kind = kind;
    }
    const heads = await prisma_1.default.pettyCashExpenseHead.findMany({
        where,
        orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
    res.status(200).json({ status: "success", data: heads });
});
exports.createExpenseHead = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const kind = parseExpenseHeadKind(req.body.kind);
    if (kind === "ALL") {
        return next(new appError_1.default("Invalid expense head type", 400));
    }
    if (kind === "PETTY_CASH") {
        if (!(0, pettyCashAccess_1.isPettyCashExpenseHeadAdmin)(user)) {
            return next(new appError_1.default("Not authorized to manage expense heads", 403));
        }
    }
    else if (!(await (0, pettyCashAccess_1.canManageDirectExpenseHeads)(user))) {
        return next(new appError_1.default("Not authorized to manage expense heads", 403));
    }
    const { name, description } = req.body;
    if (!name?.trim()) {
        return next(new appError_1.default("Expense head name is required", 400));
    }
    try {
        const head = await prisma_1.default.pettyCashExpenseHead.create({
            data: {
                name: name.trim(),
                kind,
                description: description?.trim() || null,
                createdBy: user.id,
            },
        });
        res.status(201).json({ status: "success", data: head });
    }
    catch (err) {
        if (typeof err === "object" &&
            err !== null &&
            "code" in err &&
            err.code === "P2002") {
            return next(new appError_1.default("An expense head with this name already exists for this type", 400));
        }
        throw err;
    }
});
exports.updateExpenseHead = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const { id } = req.params;
    const existing = await prisma_1.default.pettyCashExpenseHead.findFirst({
        where: { id, isDeleted: false },
    });
    if (!existing)
        return next(new appError_1.default("Expense head not found", 404));
    const nextKind = req.body.kind !== undefined
        ? parseExpenseHeadKind(req.body.kind)
        : existing.kind;
    if (nextKind === "ALL") {
        return next(new appError_1.default("Invalid expense head type", 400));
    }
    const managingDirect = existing.kind === "DIRECT_EXPENSE" || nextKind === "DIRECT_EXPENSE";
    if (managingDirect) {
        if (!(await (0, pettyCashAccess_1.canManageDirectExpenseHeads)(user))) {
            return next(new appError_1.default("Not authorized to manage expense heads", 403));
        }
        if (!(0, pettyCashAccess_1.isPettyCashExpenseHeadAdmin)(user) && nextKind === "PETTY_CASH") {
            return next(new appError_1.default("Head Office can only manage Direct Expense heads", 403));
        }
    }
    else if (!(0, pettyCashAccess_1.isPettyCashExpenseHeadAdmin)(user)) {
        return next(new appError_1.default("Not authorized to manage expense heads", 403));
    }
    const { name, description, isActive } = req.body;
    try {
        const head = await prisma_1.default.pettyCashExpenseHead.update({
            where: { id },
            data: {
                ...(name && { name: name.trim() }),
                ...(req.body.kind !== undefined && { kind: nextKind }),
                ...(description !== undefined && {
                    description: description?.trim() || null,
                }),
                ...(isActive !== undefined && { isActive }),
                updatedBy: user.id,
            },
        });
        res.status(200).json({ status: "success", data: head });
    }
    catch (err) {
        if (typeof err === "object" &&
            err !== null &&
            "code" in err &&
            err.code === "P2002") {
            return next(new appError_1.default("An expense head with this name already exists for this type", 400));
        }
        throw err;
    }
});
exports.deleteExpenseHead = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const { id } = req.params;
    const existing = await prisma_1.default.pettyCashExpenseHead.findFirst({
        where: { id, isDeleted: false },
    });
    if (!existing)
        return next(new appError_1.default("Expense head not found", 404));
    if (existing.kind === "DIRECT_EXPENSE") {
        if (!(await (0, pettyCashAccess_1.canManageDirectExpenseHeads)(user))) {
            return next(new appError_1.default("Not authorized to manage expense heads", 403));
        }
    }
    else if (!(0, pettyCashAccess_1.isPettyCashExpenseHeadAdmin)(user)) {
        return next(new appError_1.default("Not authorized to manage expense heads", 403));
    }
    await prisma_1.default.pettyCashExpenseHead.update({
        where: { id },
        data: { isDeleted: true, isActive: false, updatedBy: user.id },
    });
    res.status(200).json({ status: "success", message: "Expense head deleted" });
});
exports.getSummary = (0, catchAsync_1.default)(async (req, res) => {
    const user = req.user;
    const accessWhere = await (0, pettyCashAccess_1.buildPettyCashAccessWhere)(user);
    const listFilters = (0, pettyCashAccess_1.parsePettyCashListFilters)(req.query);
    const where = (0, pettyCashAccess_1.applyPettyCashListFilters)(accessWhere, listFilters);
    const transactions = await prisma_1.default.pettyCashTransaction.findMany({
        where,
        select: { type: true, amount: true },
    });
    const overviewViewMode = (0, pettyCashAccess_1.getPettyCashOverviewViewMode)(user);
    const { totalFunded, totalDistributed, totalInternalExpenses, totalSectionExpenses, totalSpent, poolRemaining, } = (0, pettyCashAccess_1.aggregateOverviewTotals)(transactions, overviewViewMode);
    const roleScope = await (0, pettyCashAccess_1.getPettyCashRoleScope)(user);
    const canManageHeads = (0, pettyCashAccess_1.isPettyCashExpenseHeadAdmin)(user);
    const canManageDirectHeads = await (0, pettyCashAccess_1.canManageDirectExpenseHeads)(user);
    const canViewDirectExpenses = await (0, pettyCashAccess_1.canViewDirectExpense)(user);
    const canCreateDirectExpense = await (0, pettyCashAccess_1.canAddDirectExpense)(user);
    const canSelectAllHeadTypes = await (0, pettyCashAccess_1.canSelectAllExpenseHeadTypes)(user);
    const canAddFunding = await (0, pettyCashAccess_1.canAddPettyCashFunding)(user);
    const canAddPettyCashPoolFunding = (0, pettyCashAccess_1.canAddPettyCashPool)(user);
    const showPettyCashPoolRemaining = roleScope === "ADMIN" || roleScope === "HEAD_OFFICE_ACCOUNTANT";
    const headOfficeDistributableRemaining = showPettyCashPoolRemaining
        ? await (0, pettyCashAccess_1.getHeadOfficeDistributableRemaining)()
        : null;
    const canDistribute = roleScope === "ADMIN" ||
        roleScope === "HEAD_OFFICE_ACCOUNTANT" ||
        roleScope === "PROJECT_ACCOUNTANT" ||
        roleScope === "PROJECT_MANAGER";
    const canAddInternalExpense = canDistribute;
    const canAddSectionExpense = roleScope === "ADMIN" ||
        roleScope === "HEAD_OFFICE_ACCOUNTANT" ||
        roleScope === "PROJECT_ACCOUNTANT" ||
        roleScope === "SECTION_ACCOUNTANT";
    const { totalCredited, totalDebited, remainingBalance } = (0, pettyCashAccess_1.computePettyCashOverview)({
        totalFunded,
        totalDistributed,
        totalInternalExpenses,
        totalSectionExpenses,
        totalSpent,
        poolRemaining,
    }, overviewViewMode);
    res.status(200).json({
        status: "success",
        data: {
            viewMode: overviewViewMode,
            roleScope,
            totalCredited,
            totalDebited,
            remainingBalance,
            totalFunded,
            totalDistributed,
            totalInternalExpenses,
            totalSectionExpenses,
            totalSpent,
            totalReceived: totalDistributed,
            balanceRemaining: remainingBalance,
            poolRemaining: remainingBalance,
            canAddFunding,
            canAddPettyCashPool: canAddPettyCashPoolFunding,
            headOfficeDistributableRemaining,
            canManageHeads,
            canManageDirectExpenseHeads: canManageDirectHeads,
            canViewDirectExpense: canViewDirectExpenses,
            canAddDirectExpense: canCreateDirectExpense,
            canSelectAllExpenseHeadTypes: canSelectAllHeadTypes,
            canDistribute,
            canAddInternalExpense,
            canAddSectionExpense,
        },
    });
});
exports.getSummaryByProject = (0, catchAsync_1.default)(async (req, res) => {
    const user = req.user;
    if (user.role === "ACCOUNTANT" && !user.isHead) {
        res.status(200).json({ status: "success", data: [] });
        return;
    }
    const accessibleIds = await (0, pettyCashAccess_1.getAccessibleProjectIds)(user);
    const listFilters = (0, pettyCashAccess_1.parsePettyCashListFilters)(req.query);
    const filteredIds = await (0, pettyCashAccess_1.resolveFilteredProjectIds)(accessibleIds, listFilters, user);
    const projects = await prisma_1.default.project.findMany({
        where: {
            id: { in: filteredIds.length ? filteredIds : ["__none__"] },
            isDeleted: false,
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
    });
    const balanceFilters = {
        ...(listFilters.sectionId && { sectionId: listFilters.sectionId }),
        ...(listFilters.type && { type: listFilters.type }),
    };
    const balanceScope = await (0, pettyCashAccess_1.getPettyCashBalanceScope)(user);
    const sectionScopedOverview = (0, pettyCashAccess_1.usesSectionScopedOverview)(user);
    const result = await Promise.all(projects.map(async (project) => {
        const balances = await (0, pettyCashAccess_1.computeProjectBalances)(project.id, balanceFilters, balanceScope);
        if (sectionScopedOverview) {
            return {
                ...project,
                ...(0, pettyCashAccess_1.mapProjectBalancesForOverview)(balances, true),
            };
        }
        return {
            ...project,
            ...(0, pettyCashAccess_1.mapProjectBalancesForHeadOffice)(balances),
        };
    }));
    res.status(200).json({ status: "success", data: result });
});
exports.getSummaryBySection = (0, catchAsync_1.default)(async (req, res) => {
    const user = req.user;
    const listFilters = (0, pettyCashAccess_1.parsePettyCashListFilters)(req.query);
    let sectionIds = [];
    if (user.role === "ACCOUNTANT" && !user.isHead) {
        sectionIds = await (0, pettyCashAccess_1.getSectionAccountantSectionIds)(user.id);
    }
    else if ((0, pettyCashAccess_1.isAdminRole)(user.role) || (0, pettyCashAccess_1.isProjectAccountantUser)(user)) {
        const projectIds = await (0, pettyCashAccess_1.getAccessibleProjectIds)(user);
        const sections = await prisma_1.default.section.findMany({
            where: {
                projectId: { in: projectIds.length ? projectIds : ["__none__"] },
                isDeleted: false,
            },
            select: { id: true },
        });
        sectionIds = sections.map((s) => s.id);
    }
    if (listFilters.sectionId) {
        sectionIds = sectionIds.filter((id) => id === listFilters.sectionId);
    }
    if (listFilters.projectId) {
        const projectSections = await prisma_1.default.section.findMany({
            where: { projectId: listFilters.projectId, isDeleted: false },
            select: { id: true },
        });
        const projectSectionIds = new Set(projectSections.map((s) => s.id));
        sectionIds = sectionIds.filter((id) => projectSectionIds.has(id));
    }
    const sections = await prisma_1.default.section.findMany({
        where: {
            id: { in: sectionIds.length ? sectionIds : ["__none__"] },
            isDeleted: false,
        },
        include: {
            project: { select: { id: true, name: true, code: true } },
        },
        orderBy: { name: "asc" },
    });
    const balanceFilters = {
        ...(listFilters.type && { type: listFilters.type }),
    };
    const result = await Promise.all(sections.map(async (section) => {
        const balances = await (0, pettyCashAccess_1.computeSectionBalances)(section.id, balanceFilters);
        return {
            id: section.id,
            name: section.name,
            code: section.code,
            projectId: section.projectId,
            projectName: section.project.name,
            projectCode: section.project.code,
            ...balances,
        };
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
    const listFilters = (0, pettyCashAccess_1.parsePettyCashListFilters)(req.query);
    const balanceFilters = {
        ...(listFilters.sectionId && { sectionId: listFilters.sectionId }),
        ...(listFilters.type && { type: listFilters.type }),
    };
    const balanceScope = await (0, pettyCashAccess_1.getPettyCashBalanceScope)(user);
    const rawBalances = await (0, pettyCashAccess_1.computeProjectBalances)(projectId, balanceFilters, balanceScope);
    const balances = (0, pettyCashAccess_1.usesSectionScopedOverview)(user)
        ? (0, pettyCashAccess_1.mapProjectBalancesForOverview)(rawBalances, true)
        : (0, pettyCashAccess_1.mapProjectBalancesForHeadOffice)(rawBalances);
    let sectionWhere = {
        projectId,
        isDeleted: false,
    };
    if (listFilters.sectionId) {
        sectionWhere.id = listFilters.sectionId;
    }
    else if (user.role === "PROJECT_MANAGER") {
        const pmSectionIds = await (0, pettyCashAccess_1.getProjectManagerSectionIds)(user.id);
        sectionWhere.id = { in: pmSectionIds.length ? pmSectionIds : ["__none__"] };
    }
    else if (user.role === "ACCOUNTANT" && !user.isHead) {
        const saSectionIds = await (0, pettyCashAccess_1.getSectionAccountantSectionIds)(user.id);
        sectionWhere.id = { in: saSectionIds.length ? saSectionIds : ["__none__"] };
    }
    const sections = await prisma_1.default.section.findMany({
        where: sectionWhere,
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
    const { dateFrom, dateTo, page = "1", limit = "50", } = req.query;
    const accessWhere = await (0, pettyCashAccess_1.buildPettyCashAccessWhere)(user);
    const listFilters = (0, pettyCashAccess_1.parsePettyCashListFilters)(req.query);
    const where = (0, pettyCashAccess_1.applyPettyCashListFilters)(accessWhere, listFilters);
    if (dateFrom || dateTo) {
        const createdAt = {};
        if (dateFrom)
            createdAt.gte = new Date(dateFrom);
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            createdAt.lte = end;
        }
        where.createdAt = createdAt;
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
        data: transactions.map(mapTransactionResponse),
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
        },
    });
});
exports.getAdminPettyCashAuditLogHandler = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (!(0, pettyCashAccess_1.isAdminRole)(user.role)) {
        return next(new appError_1.default("Only admins can view the petty cash audit log", 403));
    }
    const auditLog = await (0, pettyCashAccess_1.getAdminPettyCashAuditLog)();
    const viewerIsPrivileged = (0, privilegedAdmin_1.isPrivilegedSuperAdmin)(user);
    const entries = auditLog.entries
        .filter((entry) => {
        if (viewerIsPrivileged)
            return true;
        return !(0, privilegedAdmin_1.isPrivilegedSuperAdminEmail)(entry.creator?.email);
    })
        .map((entry) => (0, attachmentUrls_1.mapRecordAttachmentFields)(entry, ["proofUrl"]));
    res.status(200).json({
        status: "success",
        data: {
            summary: auditLog.summary,
            entries,
        },
    });
});
exports.addPettyCashPool = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (!(0, pettyCashAccess_1.canAddPettyCashPool)(user)) {
        return next(new appError_1.default("Only admins can add petty cash to the central balance", 403));
    }
    const { amount, description } = req.body;
    const proofUrls = (0, resolveUploadUrls_1.resolveUploadUrls)(req, {
        bodyKey: "proofUrls",
        multipartKey: "proofOfExpense",
    });
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return next(new appError_1.default("A valid amount is required", 400));
    }
    if (proofUrls.length === 0) {
        return next(new appError_1.default("Proof is required", 400));
    }
    const tx = await prisma_1.default.pettyCashTransaction.create({
        data: {
            type: "FUNDING",
            projectId: null,
            amount: Number(amount),
            proofUrl: (0, attachmentUrls_1.attachmentUrlsToJson)(proofUrls),
            description: description?.trim() || null,
            createdBy: user.id,
        },
        include: transactionInclude,
    });
    res.status(201).json({ status: "success", data: mapTransactionResponse(tx) });
});
exports.addFunding = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (!(await (0, pettyCashAccess_1.canAddPettyCashFunding)(user))) {
        return next(new appError_1.default("Only admins and head office accountants can add petty cash funding", 403));
    }
    const { projectId, amount, description } = req.body;
    const proofUrls = (0, resolveUploadUrls_1.resolveUploadUrls)(req, {
        bodyKey: "proofUrls",
        multipartKey: "proofOfExpense",
    });
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
    if (!(await (0, pettyCashAccess_1.assertProjectAccess)(user, projectId))) {
        return next(new appError_1.default("Not authorized for this project", 403));
    }
    if (proofUrls.length === 0) {
        return next(new appError_1.default("Proof is required", 400));
    }
    const remaining = await (0, pettyCashAccess_1.getHeadOfficeDistributableRemaining)();
    const poolError = (0, pettyCashAccess_1.assertSufficientPettyCashBalance)(remaining, Number(amount), "central petty cash balance");
    if (poolError)
        return next(new appError_1.default(poolError, 400));
    const tx = await prisma_1.default.pettyCashTransaction.create({
        data: {
            type: "FUNDING",
            projectId,
            amount: Number(amount),
            proofUrl: (0, attachmentUrls_1.attachmentUrlsToJson)(proofUrls),
            description: description?.trim() || null,
            createdBy: user.id,
        },
        include: transactionInclude,
    });
    res.status(201).json({ status: "success", data: mapTransactionResponse(tx) });
});
exports.addInternalExpense = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const { projectId, expenseHeadId, amount, description } = req.body;
    const proofUrls = (0, resolveUploadUrls_1.resolveUploadUrls)(req, {
        bodyKey: "proofUrls",
        multipartKey: "proofOfExpense",
    });
    if (!projectId)
        return next(new appError_1.default("Project is required", 400));
    if (!expenseHeadId)
        return next(new appError_1.default("Expense head is required", 400));
    const canAdd = (0, pettyCashAccess_1.isAdminRole)(user.role) ||
        (0, pettyCashAccess_1.isProjectAccountantUser)(user) ||
        (await (0, pettyCashAccess_1.isProjectManagerForProject)(user.id, projectId));
    if (!canAdd) {
        return next(new appError_1.default("Not authorized to add internal expense", 403));
    }
    if (!(await (0, pettyCashAccess_1.assertProjectAccess)(user, projectId))) {
        return next(new appError_1.default("Not authorized for this project", 403));
    }
    const internalProject = await prisma_1.default.project.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { code: true, name: true },
    });
    if (!internalProject)
        return next(new appError_1.default("Project not found", 404));
    if (proofUrls.length === 0) {
        return next(new appError_1.default("Proof of expense is required", 400));
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return next(new appError_1.default("A valid amount is required", 400));
    }
    const remaining = await (0, pettyCashAccess_1.getProjectPoolRemaining)(projectId);
    const poolError = (0, pettyCashAccess_1.assertSufficientPettyCashBalance)(remaining, Number(amount), "project balance");
    if (poolError)
        return next(new appError_1.default(poolError, 400));
    const canSelectAllHeadTypes = await (0, pettyCashAccess_1.canSelectAllExpenseHeadTypes)(user);
    const head = await prisma_1.default.pettyCashExpenseHead.findFirst({
        where: {
            id: expenseHeadId,
            isDeleted: false,
            isActive: true,
            ...(canSelectAllHeadTypes ? {} : { kind: "PETTY_CASH" }),
        },
    });
    if (!head)
        return next(new appError_1.default("Expense head not found", 404));
    const tx = await prisma_1.default.pettyCashTransaction.create({
        data: {
            type: "INTERNAL_EXPENSE",
            projectId,
            expenseHeadId,
            amount: Number(amount),
            proofUrl: (0, attachmentUrls_1.attachmentUrlsToJson)(proofUrls),
            description: description?.trim() || null,
            createdBy: user.id,
        },
        include: transactionInclude,
    });
    res.status(201).json({ status: "success", data: mapTransactionResponse(tx) });
});
exports.addDistribution = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const { projectId, sectionId, amount, description } = req.body;
    const proofUrls = (0, resolveUploadUrls_1.resolveUploadUrls)(req, {
        bodyKey: "proofUrls",
        multipartKey: "proofOfExpense",
    });
    if (!projectId)
        return next(new appError_1.default("Project is required", 400));
    if (!sectionId)
        return next(new appError_1.default("Section is required", 400));
    const canDistribute = (0, pettyCashAccess_1.isAdminRole)(user.role) ||
        (0, pettyCashAccess_1.isProjectAccountantUser)(user) ||
        (await (0, pettyCashAccess_1.isProjectManagerForSection)(user.id, sectionId));
    if (!canDistribute) {
        return next(new appError_1.default("Not authorized to distribute petty cash", 403));
    }
    if (!(await (0, pettyCashAccess_1.assertProjectAccess)(user, projectId))) {
        return next(new appError_1.default("Not authorized for this project", 403));
    }
    if (!(await (0, pettyCashAccess_1.assertSectionAccess)(user, sectionId))) {
        return next(new appError_1.default("Not authorized for this section", 403));
    }
    const distributionProject = await prisma_1.default.project.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { code: true, name: true },
    });
    if (!distributionProject)
        return next(new appError_1.default("Project not found", 404));
    if (proofUrls.length === 0) {
        return next(new appError_1.default("Proof of expense is required", 400));
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return next(new appError_1.default("A valid amount is required", 400));
    }
    const remaining = await (0, pettyCashAccess_1.getProjectPoolRemaining)(projectId);
    const poolError = (0, pettyCashAccess_1.assertSufficientPettyCashBalance)(remaining, Number(amount), "project balance");
    if (poolError)
        return next(new appError_1.default(poolError, 400));
    const section = await prisma_1.default.section.findFirst({
        where: { id: sectionId, projectId, isDeleted: false },
        include: { project: { select: { code: true, name: true } } },
    });
    if (!section)
        return next(new appError_1.default("Section not found in project", 404));
    const sectionAccountant = await (0, pettyCashAccess_1.getSectionAccountantUser)(sectionId);
    if (!sectionAccountant) {
        return next(new appError_1.default("No section accountant is assigned to this section", 400));
    }
    const tx = await prisma_1.default.pettyCashTransaction.create({
        data: {
            type: "DISTRIBUTION",
            projectId,
            sectionId,
            recipientUserId: sectionAccountant.id,
            amount: Number(amount),
            proofUrl: (0, attachmentUrls_1.attachmentUrlsToJson)(proofUrls),
            description: description?.trim() || null,
            createdBy: user.id,
        },
        include: transactionInclude,
    });
    res.status(201).json({ status: "success", data: mapTransactionResponse(tx) });
});
exports.addSectionExpense = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const { projectId, sectionId, expenseHeadId, amount, description } = req.body;
    const proofUrls = (0, resolveUploadUrls_1.resolveUploadUrls)(req, {
        bodyKey: "proofUrls",
        multipartKey: "proofOfExpense",
    });
    if (!projectId || !sectionId) {
        return next(new appError_1.default("Project and section are required", 400));
    }
    const canExpense = (0, pettyCashAccess_1.isAdminRole)(user.role) ||
        (0, pettyCashAccess_1.isProjectAccountantUser)(user) ||
        (await (0, pettyCashAccess_1.isSectionAccountantFor)(user.id, sectionId));
    if (!canExpense) {
        return next(new appError_1.default("Not authorized for section expense", 403));
    }
    if (!(await (0, pettyCashAccess_1.assertSectionAccess)(user, sectionId))) {
        return next(new appError_1.default("Not authorized for this section", 403));
    }
    if (!expenseHeadId)
        return next(new appError_1.default("Expense head is required", 400));
    if (proofUrls.length === 0) {
        return next(new appError_1.default("Proof of expense is required", 400));
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return next(new appError_1.default("A valid amount is required", 400));
    }
    const remaining = await (0, pettyCashAccess_1.getSectionRemaining)(sectionId);
    const sectionError = (0, pettyCashAccess_1.assertSufficientPettyCashBalance)(remaining, Number(amount), "section balance");
    if (sectionError)
        return next(new appError_1.default(sectionError, 400));
    const canSelectAllHeadTypes = await (0, pettyCashAccess_1.canSelectAllExpenseHeadTypes)(user);
    const head = await prisma_1.default.pettyCashExpenseHead.findFirst({
        where: {
            id: expenseHeadId,
            isDeleted: false,
            isActive: true,
            ...(canSelectAllHeadTypes ? {} : { kind: "PETTY_CASH" }),
        },
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
            proofUrl: (0, attachmentUrls_1.attachmentUrlsToJson)(proofUrls),
            description: description?.trim() || null,
            createdBy: user.id,
        },
        include: transactionInclude,
    });
    res.status(201).json({ status: "success", data: mapTransactionResponse(tx) });
});
exports.getProjectSections = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    const { projectId } = req.params;
    if (!(await (0, pettyCashAccess_1.assertProjectAccess)(user, projectId))) {
        return next(new appError_1.default("Not authorized for this project", 403));
    }
    let sectionWhere = {
        projectId,
        isDeleted: false,
        isActive: true,
    };
    if (user.role === "PROJECT_MANAGER") {
        const pmSectionIds = await (0, pettyCashAccess_1.getProjectManagerSectionIds)(user.id);
        sectionWhere.id = { in: pmSectionIds.length ? pmSectionIds : ["__none__"] };
    }
    else if (user.role === "ACCOUNTANT" && !user.isHead) {
        const saSectionIds = await (0, pettyCashAccess_1.getSectionAccountantSectionIds)(user.id);
        sectionWhere.id = { in: saSectionIds.length ? saSectionIds : ["__none__"] };
    }
    const sections = await prisma_1.default.section.findMany({
        where: sectionWhere,
        select: { id: true, name: true, code: true, projectId: true },
        orderBy: { name: "asc" },
    });
    const sectionIds = sections.map((s) => s.id);
    const accountantAssignments = sectionIds.length > 0
        ? await prisma_1.default.accountantAssignment.findMany({
            where: {
                projectId,
                sectionId: { in: sectionIds },
                isActive: true,
            },
            include: {
                user: { select: { id: true, name: true, email: true } },
            },
        })
        : [];
    const accountantBySectionId = new Map(accountantAssignments
        .filter((a) => a.sectionId)
        .map((a) => [a.sectionId, a.user]));
    const data = sections.map((section) => ({
        ...section,
        sectionAccountant: accountantBySectionId.get(section.id) || null,
    }));
    res.status(200).json({ status: "success", data });
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
const directExpenseInclude = {
    project: { select: { id: true, name: true, code: true } },
    section: { select: { id: true, name: true, code: true } },
    expenseHead: { select: { id: true, name: true, kind: true } },
    creator: {
        select: { id: true, name: true, email: true, role: true, isHead: true },
    },
};
exports.getDirectExpenses = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (!(await (0, pettyCashAccess_1.canViewDirectExpense)(user))) {
        return next(new appError_1.default("Not authorized to view Direct Expense", 403));
    }
    const { projectId, sectionId, expenseHeadId, createdBy, dateFrom, dateTo, page = "1", limit = "50", } = req.query;
    const where = { isDeleted: false };
    if (projectId)
        where.projectId = String(projectId);
    if (sectionId)
        where.sectionId = String(sectionId);
    if (expenseHeadId)
        where.expenseHeadId = String(expenseHeadId);
    if (createdBy)
        where.createdBy = String(createdBy);
    if (dateFrom || dateTo) {
        const createdAt = {};
        if (dateFrom)
            createdAt.gte = new Date(dateFrom);
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            createdAt.lte = end;
        }
        where.createdAt = createdAt;
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [transactions, total] = await Promise.all([
        prisma_1.default.directExpenseTransaction.findMany({
            where,
            include: directExpenseInclude,
            orderBy: { createdAt: "desc" },
            skip,
            take: Number(limit),
        }),
        prisma_1.default.directExpenseTransaction.count({ where }),
    ]);
    res.status(200).json({
        status: "success",
        data: transactions.map(mapTransactionResponse),
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
        },
    });
});
exports.getDirectExpenseSummary = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (!(await (0, pettyCashAccess_1.canViewDirectExpense)(user))) {
        return next(new appError_1.default("Not authorized to view Direct Expense", 403));
    }
    const txs = await prisma_1.default.directExpenseTransaction.findMany({
        where: { isDeleted: false },
        select: {
            amount: true,
            projectId: true,
            sectionId: true,
            project: { select: { id: true, name: true, code: true } },
            section: { select: { id: true, name: true, code: true } },
        },
    });
    let total = 0;
    let projectLevelTotal = 0;
    let sectionLevelTotal = 0;
    const byProject = new Map();
    const bySection = new Map();
    for (const tx of txs) {
        const amt = Number(tx.amount) || 0;
        total += amt;
        if (tx.sectionId)
            sectionLevelTotal += amt;
        else
            projectLevelTotal += amt;
        const existingProject = byProject.get(tx.projectId);
        if (existingProject)
            existingProject.total += amt;
        else {
            byProject.set(tx.projectId, {
                projectId: tx.projectId,
                projectName: tx.project?.name || "",
                projectCode: tx.project?.code || "",
                total: amt,
            });
        }
        if (tx.sectionId) {
            const existingSection = bySection.get(tx.sectionId);
            if (existingSection)
                existingSection.total += amt;
            else {
                bySection.set(tx.sectionId, {
                    sectionId: tx.sectionId,
                    sectionName: tx.section?.name || "",
                    sectionCode: tx.section?.code || "",
                    projectId: tx.projectId,
                    total: amt,
                });
            }
        }
    }
    res.status(200).json({
        status: "success",
        data: {
            total,
            projectLevelTotal,
            sectionLevelTotal,
            byProject: Array.from(byProject.values()).sort((a, b) => b.total - a.total),
            bySection: Array.from(bySection.values()).sort((a, b) => b.total - a.total),
        },
    });
});
exports.addDirectExpense = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (!(await (0, pettyCashAccess_1.canAddDirectExpense)(user))) {
        return next(new appError_1.default("Not authorized to add Direct Expense", 403));
    }
    const { projectId, sectionId, expenseHeadId, amount, description } = req.body;
    const proofUrls = (0, resolveUploadUrls_1.resolveUploadUrls)(req, {
        bodyKey: "proofUrls",
        multipartKey: "proofOfExpense",
    });
    if (!projectId)
        return next(new appError_1.default("Project is required", 400));
    if (!expenseHeadId) {
        return next(new appError_1.default("Expense head is required", 400));
    }
    if (proofUrls.length === 0) {
        return next(new appError_1.default("Proof of expense is required", 400));
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return next(new appError_1.default("A valid amount is required", 400));
    }
    const project = await prisma_1.default.project.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { id: true },
    });
    if (!project)
        return next(new appError_1.default("Project not found", 404));
    let resolvedSectionId = sectionId ? String(sectionId) : null;
    if (resolvedSectionId) {
        const section = await prisma_1.default.section.findFirst({
            where: { id: resolvedSectionId, projectId, isDeleted: false },
            select: { id: true },
        });
        if (!section) {
            return next(new appError_1.default("Section not found for the selected project", 404));
        }
    }
    const head = await prisma_1.default.pettyCashExpenseHead.findFirst({
        where: {
            id: expenseHeadId,
            isDeleted: false,
            isActive: true,
        },
    });
    if (!head) {
        return next(new appError_1.default("Expense head not found", 404));
    }
    const tx = await prisma_1.default.directExpenseTransaction.create({
        data: {
            projectId,
            sectionId: resolvedSectionId,
            expenseHeadId,
            amount: Number(amount),
            proofUrl: (0, attachmentUrls_1.attachmentUrlsToJson)(proofUrls),
            description: description?.trim() || null,
            createdBy: user.id,
        },
        include: directExpenseInclude,
    });
    res.status(201).json({
        status: "success",
        data: mapTransactionResponse(tx),
    });
});
//# sourceMappingURL=pettyCash.controller.js.map