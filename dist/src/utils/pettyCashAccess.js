"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeSectionBalances = exports.assertSufficientPettyCashBalance = exports.getSectionRemaining = exports.getProjectPoolRemaining = exports.computeProjectBalances = exports.resolveFilteredProjectIds = exports.getPettyCashBalanceScope = exports.mapProjectBalancesForOverview = exports.mapProjectBalancesForHeadOffice = exports.aggregateOverviewTotals = exports.computePettyCashOverview = exports.aggregatePettyCashTotals = exports.parsePettyCashListFilters = exports.applyPettyCashListFilters = exports.assertSectionAccess = exports.assertProjectAccess = exports.buildPettyCashAccessWhere = exports.getSectionAccountantUser = exports.getSectionAccountantSectionIds = exports.getHeadOfficeProjectIds = exports.isSectionAccountantFor = exports.getProjectManagerSectionIds = exports.getProjectManagerProjectIds = exports.isProjectManagerForSection = exports.isProjectManagerForProject = exports.getPettyCashOverviewViewMode = exports.usesSectionScopedOverview = exports.assignHeadOfficeAccountantsToProject = exports.getPettyCashRoleScope = exports.canAddPettyCashFunding = exports.getHeadOfficeDistributableRemaining = exports.isHeadOfficeAccountant = exports.syncHeadOfficeAccountantProjectAssignments = exports.isHeadOfficeUser = exports.isProjectAccountantUser = exports.getProjectAccountantProjectIds = exports.getAccessibleProjectIds = exports.canAddPettyCashPool = exports.resolveHeadOfficePettyCashProjectId = exports.getHeadOfficePettyCashProjectId = exports.getPettyCashOperationalProjectError = exports.pettyCashOperationalProjectWhere = exports.filterPettyCashSelectableProjects = exports.isPettyCashSelectableProject = exports.PETTY_CASH_UI_EXCLUDED_PROJECT_CODES = exports.HEAD_OFFICE_PETTY_CASH_PROJECT_CODE = exports.isPettyCashExpenseHeadAdmin = exports.isAdminRole = void 0;
const prisma_1 = __importDefault(require("./prisma"));
const isAdminRole = (role) => ["ADMIN", "SUPER_ADMIN", "SUB_ADMIN"].includes(role);
exports.isAdminRole = isAdminRole;
const isPettyCashExpenseHeadAdmin = (user) => user.role === "ADMIN" || user.role === "SUPER_ADMIN";
exports.isPettyCashExpenseHeadAdmin = isPettyCashExpenseHeadAdmin;
exports.HEAD_OFFICE_PETTY_CASH_PROJECT_CODE = "HO-Petty";
exports.PETTY_CASH_UI_EXCLUDED_PROJECT_CODES = [
    exports.HEAD_OFFICE_PETTY_CASH_PROJECT_CODE,
];
const isPettyCashSelectableProject = (project) => {
    const code = (project.code || "").trim();
    if (exports.PETTY_CASH_UI_EXCLUDED_PROJECT_CODES.includes(code)) {
        return false;
    }
    const name = (project.name || "").trim().toLowerCase();
    return name !== "head office petty cash";
};
exports.isPettyCashSelectableProject = isPettyCashSelectableProject;
const filterPettyCashSelectableProjects = (projects) => projects.filter(exports.isPettyCashSelectableProject);
exports.filterPettyCashSelectableProjects = filterPettyCashSelectableProjects;
const pettyCashOperationalProjectWhere = () => ({
    code: { notIn: [...exports.PETTY_CASH_UI_EXCLUDED_PROJECT_CODES] },
});
exports.pettyCashOperationalProjectWhere = pettyCashOperationalProjectWhere;
const getPettyCashOperationalProjectError = (project) => {
    if ((0, exports.isPettyCashSelectableProject)(project))
        return null;
    return "Head Office Petty Cash cannot be selected for petty cash operations. Choose an operational project.";
};
exports.getPettyCashOperationalProjectError = getPettyCashOperationalProjectError;
const getHeadOfficePettyCashProjectId = async () => {
    const project = await prisma_1.default.project.findFirst({
        where: {
            code: exports.HEAD_OFFICE_PETTY_CASH_PROJECT_CODE,
            isDeleted: false,
        },
        select: { id: true },
    });
    return project?.id ?? null;
};
exports.getHeadOfficePettyCashProjectId = getHeadOfficePettyCashProjectId;
const resolveHeadOfficePettyCashProjectId = async (createdBy) => {
    const existingId = await (0, exports.getHeadOfficePettyCashProjectId)();
    if (existingId)
        return existingId;
    const created = await prisma_1.default.project.create({
        data: {
            name: "Head Office Petty Cash",
            code: exports.HEAD_OFFICE_PETTY_CASH_PROJECT_CODE,
            description: "Central petty cash pool funded by admins",
            isActive: true,
            isDeleted: false,
            createdBy,
        },
        select: { id: true },
    });
    return created.id;
};
exports.resolveHeadOfficePettyCashProjectId = resolveHeadOfficePettyCashProjectId;
const canAddPettyCashPool = (user) => (0, exports.isAdminRole)(user.role);
exports.canAddPettyCashPool = canAddPettyCashPool;
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
        return (0, exports.getProjectAccountantProjectIds)(user.id);
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
const getProjectAccountantProjectIds = async (userId) => {
    const assignments = await prisma_1.default.accountantAssignment.findMany({
        where: { userId, isActive: true, sectionId: null },
        select: { projectId: true },
    });
    return [...new Set(assignments.map((a) => a.projectId))];
};
exports.getProjectAccountantProjectIds = getProjectAccountantProjectIds;
const isProjectAccountantUser = (user) => user.role === "ACCOUNTANT" && !!user.isHead;
exports.isProjectAccountantUser = isProjectAccountantUser;
const isHeadOfficeUser = (user) => (0, exports.isAdminRole)(user.role) || (0, exports.isProjectAccountantUser)(user);
exports.isHeadOfficeUser = isHeadOfficeUser;
const syncHeadOfficeAccountantProjectAssignments = async (userId, createdBy = "system") => {
    const user = await prisma_1.default.user.findFirst({
        where: {
            id: userId,
            role: "ACCOUNTANT",
            isHead: true,
            isDeleted: false,
            isActive: true,
        },
        select: { id: true },
    });
    if (!user)
        return;
    const projectLevelCount = await prisma_1.default.accountantAssignment.count({
        where: { userId, isActive: true, sectionId: null },
    });
    if (projectLevelCount === 0)
        return;
    const allIds = await (0, exports.getHeadOfficeProjectIds)();
    if (allIds.length === 0)
        return;
    let assigned = new Set(await (0, exports.getProjectAccountantProjectIds)(userId));
    let missing = allIds.filter((id) => !assigned.has(id));
    const likelyHeadOffice = projectLevelCount >= 3 &&
        missing.length > 0 &&
        projectLevelCount + missing.length === allIds.length;
    if (likelyHeadOffice) {
        for (const projectId of missing) {
            await prisma_1.default.accountantAssignment.create({
                data: {
                    userId,
                    projectId,
                    sectionId: null,
                    isActive: true,
                    createdBy,
                },
            });
            assigned.add(projectId);
        }
        return;
    }
    for (const projectId of missing) {
        const otherIds = allIds.filter((id) => id !== projectId);
        const coversAllOthers = otherIds.every((id) => assigned.has(id));
        if (!coversAllOthers)
            continue;
        await prisma_1.default.accountantAssignment.create({
            data: {
                userId,
                projectId,
                sectionId: null,
                isActive: true,
                createdBy,
            },
        });
        assigned.add(projectId);
    }
};
exports.syncHeadOfficeAccountantProjectAssignments = syncHeadOfficeAccountantProjectAssignments;
const isHeadOfficeAccountant = async (user) => {
    if (!(0, exports.isProjectAccountantUser)(user))
        return false;
    await (0, exports.syncHeadOfficeAccountantProjectAssignments)(user.id);
    const assigned = await (0, exports.getProjectAccountantProjectIds)(user.id);
    const all = await (0, exports.getHeadOfficeProjectIds)();
    if (all.length === 0)
        return false;
    return all.every((id) => assigned.includes(id));
};
exports.isHeadOfficeAccountant = isHeadOfficeAccountant;
const getHeadOfficeDistributableRemaining = async () => {
    const poolProjectId = await (0, exports.getHeadOfficePettyCashProjectId)();
    if (!poolProjectId)
        return 0;
    const firstPoolAdd = await prisma_1.default.pettyCashTransaction.findFirst({
        where: {
            isDeleted: false,
            type: "FUNDING",
            projectId: poolProjectId,
            creator: { role: { in: ["ADMIN", "SUPER_ADMIN", "SUB_ADMIN"] } },
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
    });
    if (!firstPoolAdd)
        return 0;
    const poolEpoch = firstPoolAdd.createdAt;
    const txs = await prisma_1.default.pettyCashTransaction.findMany({
        where: { isDeleted: false, type: "FUNDING" },
        select: {
            amount: true,
            projectId: true,
            createdAt: true,
            creator: { select: { role: true, isHead: true } },
        },
    });
    let poolAdded = 0;
    let poolDistributed = 0;
    for (const tx of txs) {
        const amt = Number(tx.amount);
        const creator = tx.creator;
        if (!creator)
            continue;
        if (tx.projectId === poolProjectId && (0, exports.isAdminRole)(creator.role)) {
            poolAdded += amt;
            continue;
        }
        if (tx.projectId !== poolProjectId &&
            tx.createdAt >= poolEpoch) {
            const distributedByHo = creator.role === "ACCOUNTANT" && creator.isHead;
            const distributedByAdmin = (0, exports.isAdminRole)(creator.role);
            if (distributedByHo || distributedByAdmin) {
                poolDistributed += amt;
            }
        }
    }
    return Math.max(0, poolAdded - poolDistributed);
};
exports.getHeadOfficeDistributableRemaining = getHeadOfficeDistributableRemaining;
const canAddPettyCashFunding = async (user) => (0, exports.isAdminRole)(user.role) || (await (0, exports.isHeadOfficeAccountant)(user));
exports.canAddPettyCashFunding = canAddPettyCashFunding;
const getPettyCashRoleScope = async (user) => {
    if ((0, exports.isAdminRole)(user.role))
        return "ADMIN";
    if (user.role === "PROJECT_MANAGER")
        return "PROJECT_MANAGER";
    if (user.role === "ACCOUNTANT" && !user.isHead)
        return "SECTION_ACCOUNTANT";
    if ((0, exports.isProjectAccountantUser)(user)) {
        return (await (0, exports.isHeadOfficeAccountant)(user))
            ? "HEAD_OFFICE_ACCOUNTANT"
            : "PROJECT_ACCOUNTANT";
    }
    return "NONE";
};
exports.getPettyCashRoleScope = getPettyCashRoleScope;
const assignHeadOfficeAccountantsToProject = async (projectId, createdBy) => {
    const otherProjects = await prisma_1.default.project.findMany({
        where: { isDeleted: false, isActive: true, id: { not: projectId } },
        select: { id: true },
    });
    const otherIds = otherProjects.map((p) => p.id);
    if (otherIds.length === 0)
        return;
    const headAccountants = await prisma_1.default.user.findMany({
        where: {
            role: "ACCOUNTANT",
            isHead: true,
            isDeleted: false,
            isActive: true,
        },
        select: {
            id: true,
            accountantAssignments: {
                where: { isActive: true, sectionId: null },
                select: { projectId: true },
            },
        },
    });
    for (const accountant of headAccountants) {
        const assigned = new Set(accountant.accountantAssignments.map((a) => a.projectId));
        const coversAllOthers = otherIds.every((id) => assigned.has(id));
        if (!coversAllOthers || assigned.has(projectId))
            continue;
        await prisma_1.default.accountantAssignment.create({
            data: {
                userId: accountant.id,
                projectId,
                sectionId: null,
                isActive: true,
                createdBy,
            },
        });
    }
};
exports.assignHeadOfficeAccountantsToProject = assignHeadOfficeAccountantsToProject;
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
        where: {
            isDeleted: false,
            isActive: true,
            ...(0, exports.pettyCashOperationalProjectWhere)(),
        },
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
        const projectIds = await (0, exports.getProjectAccountantProjectIds)(user.id);
        return {
            ...base,
            projectId: { in: projectIds.length ? projectIds : ["__none__"] },
        };
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
            const ids = await (0, exports.getProjectAccountantProjectIds)(user.id);
            return ids.includes(projectId);
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
        const ids = await (0, exports.getProjectAccountantProjectIds)(user.id);
        return ids.includes(section.projectId);
    }
    if (user.role === "ACCOUNTANT") {
        return (0, exports.isSectionAccountantFor)(user.id, sectionId);
    }
    return false;
};
exports.assertSectionAccess = assertSectionAccess;
const constrainIdFilter = (existing, requested) => {
    if (!existing)
        return requested;
    if (typeof existing === "string") {
        return existing === requested ? requested : "__none__";
    }
    if (typeof existing === "object" &&
        existing !== null &&
        "in" in existing &&
        Array.isArray(existing.in)) {
        const ids = existing.in;
        return ids.includes(requested) ? requested : "__none__";
    }
    return "__none__";
};
const applyPettyCashListFilters = (where, filters) => {
    const next = { ...where };
    if (filters.projectId) {
        next.projectId = constrainIdFilter(where.projectId, filters.projectId);
    }
    if (filters.sectionId) {
        next.sectionId = constrainIdFilter(where.sectionId, filters.sectionId);
    }
    if (filters.type)
        next.type = filters.type;
    if (filters.expenseHeadId)
        next.expenseHeadId = filters.expenseHeadId;
    return next;
};
exports.applyPettyCashListFilters = applyPettyCashListFilters;
const parsePettyCashListFilters = (query) => ({
    ...(query.projectId && { projectId: String(query.projectId) }),
    ...(query.sectionId && { sectionId: String(query.sectionId) }),
    ...(query.type && { type: String(query.type) }),
    ...(query.expenseHeadId && { expenseHeadId: String(query.expenseHeadId) }),
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
        else if (user?.role === "ACCOUNTANT" && user.isHead) {
            const paProjectIds = await (0, exports.getProjectAccountantProjectIds)(user.id);
            if (!paProjectIds.includes(section.projectId))
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