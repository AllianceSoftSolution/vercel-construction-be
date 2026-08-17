"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeSectionBalances = exports.assertSufficientPettyCashBalance = exports.getSectionRemaining = exports.getProjectPoolRemaining = exports.computeProjectBalances = exports.resolveFilteredProjectIds = exports.getPettyCashBalanceScope = exports.mapProjectBalancesForOverview = exports.mapProjectBalancesForHeadOffice = exports.aggregateOverviewTotals = exports.computePettyCashOverview = exports.aggregatePettyCashTotals = exports.parsePettyCashListFilters = exports.applyPettyCashListFilters = exports.assertSectionAccess = exports.assertProjectAccess = exports.buildPettyCashAccessWhere = exports.getSectionAccountantUser = exports.getSectionAccountantSectionIds = exports.getHeadOfficeProjectIds = exports.isSectionAccountantFor = exports.getProjectManagerSectionIds = exports.getProjectManagerProjectIds = exports.isProjectManagerForSection = exports.isProjectManagerForProject = exports.getPettyCashOverviewViewMode = exports.usesSectionScopedOverview = exports.isHeadOfficeUser = exports.getAccessibleProjectIds = exports.isPettyCashExpenseHeadAdmin = exports.isAdminRole = void 0;
const prisma_1 = __importDefault(require("./prisma"));
const isAdminRole = (role) => ["ADMIN", "SUPER_ADMIN", "SUB_ADMIN"].includes(role);
exports.isAdminRole = isAdminRole;
const isPettyCashExpenseHeadAdmin = (user) => user.role === "ADMIN" || user.role === "SUPER_ADMIN";
exports.isPettyCashExpenseHeadAdmin = isPettyCashExpenseHeadAdmin;
const getAccessibleProjectIds = async (user) => {
    if ((0, exports.isAdminRole)(user.role)) {
        const projects = await prisma_1.default.project.findMany({
            where: { isDeleted: false },
            select: { id: true },
        });
        return projects.map((p) => p.id);
    }
    if (user.role === "PROJECT_MANAGER") {
        return (0, exports.getProjectManagerProjectIds)(user.id);
    }
    if (user.role === "ACCOUNTANT" && user.isHead) {
        const projects = await prisma_1.default.project.findMany({
            where: { isDeleted: false },
            select: { id: true },
        });
        return projects.map((p) => p.id);
    }
    if (user.role === "ACCOUNTANT") {
        const assignments = await prisma_1.default.accountantAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { projectId: true, sectionId: true },
        });
        const projectIds = new Set(assignments.map((a) => a.projectId));
        const sectionIds = assignments
            .map((a) => a.sectionId)
            .filter((id) => id !== null);
        if (sectionIds.length > 0) {
            const sections = await prisma_1.default.section.findMany({
                where: { id: { in: sectionIds }, isDeleted: false },
                select: { projectId: true },
            });
            sections.forEach((s) => projectIds.add(s.projectId));
        }
        return [...projectIds];
    }
    return [];
};
exports.getAccessibleProjectIds = getAccessibleProjectIds;
const isHeadOfficeUser = (user) => (0, exports.isAdminRole)(user.role) || (user.role === "ACCOUNTANT" && !!user.isHead);
exports.isHeadOfficeUser = isHeadOfficeUser;
const usesSectionScopedOverview = (user) => user.role === "PROJECT_MANAGER" ||
    (user.role === "ACCOUNTANT" && !user.isHead);
exports.usesSectionScopedOverview = usesSectionScopedOverview;
const getPettyCashOverviewViewMode = (user) => (0, exports.usesSectionScopedOverview)(user) ? "section" : "project";
exports.getPettyCashOverviewViewMode = getPettyCashOverviewViewMode;
const isProjectManagerForProject = async (userId, projectId) => {
    const assignment = await prisma_1.default.projectManagerAssignment.findFirst({
        where: { userId, projectId, isActive: true },
    });
    return !!assignment;
};
exports.isProjectManagerForProject = isProjectManagerForProject;
const isProjectManagerForSection = async (userId, sectionId) => {
    const assignment = await prisma_1.default.projectManagerAssignment.findFirst({
        where: { userId, sectionId, isActive: true },
    });
    return !!assignment;
};
exports.isProjectManagerForSection = isProjectManagerForSection;
const getProjectManagerProjectIds = async (userId) => {
    const assignments = await prisma_1.default.projectManagerAssignment.findMany({
        where: { userId, isActive: true },
        select: { projectId: true },
    });
    return [...new Set(assignments.map((a) => a.projectId))];
};
exports.getProjectManagerProjectIds = getProjectManagerProjectIds;
const getProjectManagerSectionIds = async (userId) => {
    const assignments = await prisma_1.default.projectManagerAssignment.findMany({
        where: { userId, isActive: true },
        select: { sectionId: true },
    });
    return assignments.map((a) => a.sectionId);
};
exports.getProjectManagerSectionIds = getProjectManagerSectionIds;
const isSectionAccountantFor = async (userId, sectionId) => {
    const assignment = await prisma_1.default.accountantAssignment.findFirst({
        where: { userId, sectionId, isActive: true },
    });
    return !!assignment;
};
exports.isSectionAccountantFor = isSectionAccountantFor;
const getHeadOfficeProjectIds = async (_userId) => {
    const projects = await prisma_1.default.project.findMany({
        where: { isDeleted: false },
        select: { id: true },
    });
    return projects.map((p) => p.id);
};
exports.getHeadOfficeProjectIds = getHeadOfficeProjectIds;
const getSectionAccountantSectionIds = async (userId) => {
    const assignments = await prisma_1.default.accountantAssignment.findMany({
        where: { userId, isActive: true, sectionId: { not: null } },
        select: { sectionId: true },
    });
    return assignments
        .map((a) => a.sectionId)
        .filter((id) => id !== null);
};
exports.getSectionAccountantSectionIds = getSectionAccountantSectionIds;
const getSectionAccountantUser = async (sectionId) => {
    const assignment = await prisma_1.default.accountantAssignment.findFirst({
        where: {
            sectionId,
            isActive: true,
            user: {
                role: "ACCOUNTANT",
                isDeleted: false,
                isActive: true,
            },
        },
        include: {
            user: { select: { id: true, name: true, email: true } },
        },
    });
    return assignment?.user ?? null;
};
exports.getSectionAccountantUser = getSectionAccountantUser;
const buildPettyCashAccessWhere = async (user) => {
    const base = { isDeleted: false };
    if ((0, exports.isAdminRole)(user.role)) {
        return base;
    }
    if (user.role === "PROJECT_MANAGER") {
        const projectIds = await (0, exports.getProjectManagerProjectIds)(user.id);
        const sectionIds = await (0, exports.getProjectManagerSectionIds)(user.id);
        const none = ["__none__"];
        return {
            ...base,
            OR: [
                {
                    projectId: { in: projectIds.length ? projectIds : none },
                    type: { in: ["FUNDING", "INTERNAL_EXPENSE"] },
                },
                {
                    sectionId: { in: sectionIds.length ? sectionIds : none },
                },
            ],
        };
    }
    if (user.role === "ACCOUNTANT" && user.isHead) {
        return base;
    }
    if (user.role === "ACCOUNTANT") {
        const sectionIds = await (0, exports.getSectionAccountantSectionIds)(user.id);
        if (sectionIds.length > 0) {
            return { ...base, sectionId: { in: sectionIds } };
        }
        return { ...base, projectId: { in: ["__none__"] } };
    }
    return { ...base, projectId: { in: ["__none__"] } };
};
exports.buildPettyCashAccessWhere = buildPettyCashAccessWhere;
const assertProjectAccess = async (user, projectId) => {
    if ((0, exports.isAdminRole)(user.role))
        return true;
    if (user.role === "PROJECT_MANAGER") {
        const ids = await (0, exports.getProjectManagerProjectIds)(user.id);
        return ids.includes(projectId);
    }
    if (user.role === "ACCOUNTANT") {
        if (user.isHead) {
            return true;
        }
        const sections = await prisma_1.default.section.findMany({
            where: { projectId, isDeleted: false },
            select: { id: true },
        });
        const sectionIds = await (0, exports.getSectionAccountantSectionIds)(user.id);
        return sections.some((s) => sectionIds.includes(s.id));
    }
    return false;
};
exports.assertProjectAccess = assertProjectAccess;
const assertSectionAccess = async (user, sectionId) => {
    if ((0, exports.isAdminRole)(user.role))
        return true;
    const section = await prisma_1.default.section.findUnique({
        where: { id: sectionId },
        select: { projectId: true },
    });
    if (!section)
        return false;
    if (user.role === "PROJECT_MANAGER") {
        return (0, exports.isProjectManagerForSection)(user.id, sectionId);
    }
    if (user.role === "ACCOUNTANT" && user.isHead) {
        return true;
    }
    if (user.role === "ACCOUNTANT") {
        return (0, exports.isSectionAccountantFor)(user.id, sectionId);
    }
    return false;
};
exports.assertSectionAccess = assertSectionAccess;
const applyPettyCashListFilters = (where, filters) => {
    const next = { ...where };
    if (filters.projectId)
        next.projectId = filters.projectId;
    if (filters.sectionId)
        next.sectionId = filters.sectionId;
    if (filters.type)
        next.type = filters.type;
    return next;
};
exports.applyPettyCashListFilters = applyPettyCashListFilters;
const parsePettyCashListFilters = (query) => ({
    ...(query.projectId && { projectId: String(query.projectId) }),
    ...(query.sectionId && { sectionId: String(query.sectionId) }),
    ...(query.type && { type: String(query.type) }),
});
exports.parsePettyCashListFilters = parsePettyCashListFilters;
const aggregatePettyCashTotals = (transactions) => {
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
    const poolRemaining = Math.max(0, totalFunded - totalDistributed - totalInternalExpenses);
    return {
        totalFunded,
        totalDistributed,
        totalInternalExpenses,
        totalSectionExpenses,
        totalSpent,
        poolRemaining,
    };
};
exports.aggregatePettyCashTotals = aggregatePettyCashTotals;
const computePettyCashOverview = (totals, viewMode) => {
    if (viewMode === "section") {
        const totalCredited = totals.totalDistributed;
        const totalDebited = totals.totalSectionExpenses;
        const remainingBalance = Math.max(0, totalCredited - totalDebited);
        return { totalCredited, totalDebited, remainingBalance };
    }
    const totalCredited = totals.totalFunded;
    const totalDebited = totals.totalDistributed + totals.totalInternalExpenses;
    const remainingBalance = Math.max(0, totals.poolRemaining);
    return { totalCredited, totalDebited, remainingBalance };
};
exports.computePettyCashOverview = computePettyCashOverview;
const aggregateOverviewTotals = (transactions, viewMode) => {
    const scoped = viewMode === "section"
        ? transactions.filter((tx) => tx.type === "DISTRIBUTION" || tx.type === "SECTION_EXPENSE")
        : transactions;
    return (0, exports.aggregatePettyCashTotals)(scoped);
};
exports.aggregateOverviewTotals = aggregateOverviewTotals;
const mapProjectBalancesForHeadOffice = (balances) => ({
    ...balances,
    totalCredited: balances.totalFunded,
    totalDebited: balances.totalDistributed + balances.totalInternalExpenses,
    remainingBalance: balances.projectPoolRemaining,
});
exports.mapProjectBalancesForHeadOffice = mapProjectBalancesForHeadOffice;
const mapProjectBalancesForOverview = (balances, sectionScoped) => {
    if (!sectionScoped)
        return balances;
    const totalSectionExpenses = Object.values(balances.sectionBalances || {}).reduce((sum, section) => sum + section.spent, 0);
    const totalCredited = balances.totalDistributed;
    const totalDebited = totalSectionExpenses;
    const remainingBalance = Math.max(0, totalCredited - totalDebited);
    return {
        ...balances,
        totalFunded: 0,
        totalInternalExpenses: 0,
        totalSectionExpenses,
        totalCredited,
        totalDebited,
        remainingBalance,
    };
};
exports.mapProjectBalancesForOverview = mapProjectBalancesForOverview;
const getPettyCashBalanceScope = async (user) => {
    if (user.role === "PROJECT_MANAGER") {
        const pmSectionIds = await (0, exports.getProjectManagerSectionIds)(user.id);
        return { pmSectionIds };
    }
    return {};
};
exports.getPettyCashBalanceScope = getPettyCashBalanceScope;
const resolveFilteredProjectIds = async (accessibleIds, filters, user) => {
    let ids = [...accessibleIds];
    if (filters.projectId) {
        ids = ids.filter((id) => id === filters.projectId);
    }
    if (filters.sectionId) {
        const section = await prisma_1.default.section.findFirst({
            where: { id: filters.sectionId, isDeleted: false },
            select: { projectId: true },
        });
        if (!section)
            return [];
        if (user?.role === "PROJECT_MANAGER") {
            const pmSectionIds = await (0, exports.getProjectManagerSectionIds)(user.id);
            if (!pmSectionIds.includes(filters.sectionId))
                return [];
        }
        else if (user?.role === "ACCOUNTANT" && !user.isHead) {
            const saSectionIds = await (0, exports.getSectionAccountantSectionIds)(user.id);
            if (!saSectionIds.includes(filters.sectionId))
                return [];
        }
        ids = ids.filter((id) => id === section.projectId);
    }
    if (filters.type) {
        const matches = await prisma_1.default.pettyCashTransaction.findMany({
            where: {
                isDeleted: false,
                type: filters.type,
                projectId: { in: ids.length ? ids : ["__none__"] },
            },
            select: { projectId: true },
            distinct: ["projectId"],
        });
        ids = matches
            .map((m) => m.projectId)
            .filter((id) => !!id && ids.includes(id));
    }
    return ids;
};
exports.resolveFilteredProjectIds = resolveFilteredProjectIds;
const isSectionInPmScope = (sectionId, pmSectionIds) => {
    if (!pmSectionIds)
        return true;
    if (!sectionId)
        return false;
    return pmSectionIds.includes(sectionId);
};
const computeProjectBalances = async (projectId, filters = {}, scope = {}) => {
    const where = {
        projectId,
        isDeleted: false,
    };
    if (filters.sectionId)
        where.sectionId = filters.sectionId;
    if (filters.type)
        where.type = filters.type;
    const txs = await prisma_1.default.pettyCashTransaction.findMany({
        where,
        select: { type: true, amount: true, sectionId: true },
    });
    const { pmSectionIds } = scope;
    let totalFunded = 0;
    let totalDistributed = 0;
    let totalInternalExpenses = 0;
    const sectionReceived = {};
    const sectionExpenses = {};
    for (const tx of txs) {
        const amt = Number(tx.amount);
        switch (tx.type) {
            case "FUNDING":
                if (!pmSectionIds)
                    totalFunded += amt;
                break;
            case "DISTRIBUTION":
                if (isSectionInPmScope(tx.sectionId, pmSectionIds)) {
                    totalDistributed += amt;
                    if (tx.sectionId) {
                        sectionReceived[tx.sectionId] =
                            (sectionReceived[tx.sectionId] || 0) + amt;
                    }
                }
                break;
            case "INTERNAL_EXPENSE":
                if (!pmSectionIds)
                    totalInternalExpenses += amt;
                break;
            case "SECTION_EXPENSE":
                if (tx.sectionId && isSectionInPmScope(tx.sectionId, pmSectionIds)) {
                    sectionExpenses[tx.sectionId] =
                        (sectionExpenses[tx.sectionId] || 0) + amt;
                }
                break;
        }
    }
    const allProjectTxs = await prisma_1.default.pettyCashTransaction.findMany({
        where: { projectId, isDeleted: false },
        select: { type: true, amount: true },
    });
    let poolFunded = 0;
    let poolDistributed = 0;
    let poolInternal = 0;
    for (const tx of allProjectTxs) {
        const amt = Number(tx.amount);
        if (tx.type === "FUNDING")
            poolFunded += amt;
        if (tx.type === "DISTRIBUTION")
            poolDistributed += amt;
        if (tx.type === "INTERNAL_EXPENSE")
            poolInternal += amt;
    }
    const projectPoolRemaining = Math.max(0, poolFunded - poolDistributed - poolInternal);
    const sectionBalances = {};
    const allSectionIds = new Set([
        ...Object.keys(sectionReceived),
        ...Object.keys(sectionExpenses),
        ...(pmSectionIds || []),
    ]);
    for (const sid of allSectionIds) {
        if (pmSectionIds && !pmSectionIds.includes(sid))
            continue;
        const received = sectionReceived[sid] || 0;
        const spent = sectionExpenses[sid] || 0;
        sectionBalances[sid] = {
            received,
            spent,
            remaining: Math.max(0, received - spent),
        };
    }
    return {
        totalFunded,
        totalDistributed,
        totalInternalExpenses,
        projectPoolRemaining,
        sectionBalances,
    };
};
exports.computeProjectBalances = computeProjectBalances;
const getProjectPoolRemaining = async (projectId) => {
    const b = await (0, exports.computeProjectBalances)(projectId);
    return Math.max(0, b.projectPoolRemaining);
};
exports.getProjectPoolRemaining = getProjectPoolRemaining;
const getSectionRemaining = async (sectionId) => {
    const b = await (0, exports.computeSectionBalances)(sectionId);
    return Math.max(0, b.remaining);
};
exports.getSectionRemaining = getSectionRemaining;
const assertSufficientPettyCashBalance = (available, amount, balanceLabel) => {
    const normalizedAvailable = Math.max(0, Number(available) || 0);
    const normalizedAmount = Number(amount);
    if (normalizedAvailable <= 0) {
        return `No ${balanceLabel} available. You cannot spend more than the remaining balance.`;
    }
    if (normalizedAmount > normalizedAvailable) {
        return `Insufficient ${balanceLabel}. Available: ${normalizedAvailable.toFixed(2)}. You cannot consume more than what is remaining.`;
    }
    return null;
};
exports.assertSufficientPettyCashBalance = assertSufficientPettyCashBalance;
const computeSectionBalances = async (sectionId, filters = {}) => {
    const where = {
        sectionId,
        isDeleted: false,
    };
    if (filters.type)
        where.type = filters.type;
    const txs = await prisma_1.default.pettyCashTransaction.findMany({
        where,
        select: { type: true, amount: true },
    });
    let received = 0;
    let spent = 0;
    for (const tx of txs) {
        const amt = Number(tx.amount);
        if (tx.type === "DISTRIBUTION")
            received += amt;
        if (tx.type === "SECTION_EXPENSE")
            spent += amt;
    }
    const remaining = Math.max(0, received - spent);
    return {
        received,
        spent,
        remaining,
        transactionCount: txs.length,
    };
};
exports.computeSectionBalances = computeSectionBalances;
//# sourceMappingURL=pettyCashAccess.js.map