"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSectionRemaining = exports.getProjectPoolRemaining = exports.computeProjectBalances = exports.assertSectionAccess = exports.assertProjectAccess = exports.buildPettyCashAccessWhere = exports.getSectionAccountantSectionIds = exports.getProjectAccountantProjectIds = exports.getHeadOfficeProjectIds = exports.isSectionAccountantFor = exports.isProjectAccountant = exports.isHeadOfficeUser = exports.isAdminRole = void 0;
const prisma_1 = __importDefault(require("./prisma"));
const isAdminRole = (role) => ["ADMIN", "SUPER_ADMIN", "SUB_ADMIN"].includes(role);
exports.isAdminRole = isAdminRole;
const isHeadOfficeUser = (user) => (0, exports.isAdminRole)(user.role) || (user.role === "ACCOUNTANT" && !!user.isHead);
exports.isHeadOfficeUser = isHeadOfficeUser;
const isProjectAccountant = async (userId, projectId) => {
    const assignment = await prisma_1.default.accountantAssignment.findFirst({
        where: {
            userId,
            projectId,
            sectionId: null,
            isActive: true,
        },
    });
    return !!assignment;
};
exports.isProjectAccountant = isProjectAccountant;
const isSectionAccountantFor = async (userId, sectionId) => {
    const assignment = await prisma_1.default.accountantAssignment.findFirst({
        where: { userId, sectionId, isActive: true },
    });
    return !!assignment;
};
exports.isSectionAccountantFor = isSectionAccountantFor;
const getHeadOfficeProjectIds = async (userId) => {
    const assignments = await prisma_1.default.accountantAssignment.findMany({
        where: { userId, isActive: true, sectionId: null },
        select: { projectId: true },
    });
    return [...new Set(assignments.map((a) => a.projectId))];
};
exports.getHeadOfficeProjectIds = getHeadOfficeProjectIds;
const getProjectAccountantProjectIds = async (userId) => {
    const assignments = await prisma_1.default.accountantAssignment.findMany({
        where: { userId, isActive: true, sectionId: null },
        select: { projectId: true },
    });
    return [...new Set(assignments.map((a) => a.projectId))];
};
exports.getProjectAccountantProjectIds = getProjectAccountantProjectIds;
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
const buildPettyCashAccessWhere = async (user) => {
    const base = { isDeleted: false };
    if ((0, exports.isAdminRole)(user.role)) {
        return base;
    }
    if (user.role === "ACCOUNTANT" && user.isHead) {
        const projectIds = await (0, exports.getHeadOfficeProjectIds)(user.id);
        return { ...base, projectId: { in: projectIds.length ? projectIds : ["__none__"] } };
    }
    if (user.role === "ACCOUNTANT") {
        const projectIds = await (0, exports.getProjectAccountantProjectIds)(user.id);
        const sectionIds = await (0, exports.getSectionAccountantSectionIds)(user.id);
        if (projectIds.length > 0) {
            return {
                ...base,
                OR: [
                    { projectId: { in: projectIds } },
                    ...(sectionIds.length ? [{ sectionId: { in: sectionIds } }] : []),
                ],
            };
        }
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
    if (user.role === "ACCOUNTANT") {
        if (user.isHead) {
            const ids = await (0, exports.getHeadOfficeProjectIds)(user.id);
            return ids.includes(projectId);
        }
        const projectIds = await (0, exports.getProjectAccountantProjectIds)(user.id);
        if (projectIds.includes(projectId))
            return true;
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
    if (user.role === "ACCOUNTANT" && user.isHead) {
        const section = await prisma_1.default.section.findUnique({
            where: { id: sectionId },
            select: { projectId: true },
        });
        if (!section)
            return false;
        const ids = await (0, exports.getHeadOfficeProjectIds)(user.id);
        return ids.includes(section.projectId);
    }
    if (user.role === "ACCOUNTANT") {
        const projectIds = await (0, exports.getProjectAccountantProjectIds)(user.id);
        const section = await prisma_1.default.section.findUnique({
            where: { id: sectionId },
            select: { projectId: true },
        });
        if (section && projectIds.includes(section.projectId))
            return true;
        return (0, exports.isSectionAccountantFor)(user.id, sectionId);
    }
    return false;
};
exports.assertSectionAccess = assertSectionAccess;
const computeProjectBalances = async (projectId) => {
    const txs = await prisma_1.default.pettyCashTransaction.findMany({
        where: { projectId, isDeleted: false },
        select: { type: true, amount: true, sectionId: true },
    });
    let totalFunded = 0;
    let totalDistributed = 0;
    let totalInternalExpenses = 0;
    const sectionReceived = {};
    const sectionExpenses = {};
    for (const tx of txs) {
        const amt = Number(tx.amount);
        switch (tx.type) {
            case "FUNDING":
                totalFunded += amt;
                break;
            case "DISTRIBUTION":
                totalDistributed += amt;
                if (tx.sectionId) {
                    sectionReceived[tx.sectionId] = (sectionReceived[tx.sectionId] || 0) + amt;
                }
                break;
            case "INTERNAL_EXPENSE":
                totalInternalExpenses += amt;
                break;
            case "SECTION_EXPENSE":
                if (tx.sectionId) {
                    sectionExpenses[tx.sectionId] =
                        (sectionExpenses[tx.sectionId] || 0) + amt;
                }
                break;
        }
    }
    const projectPoolRemaining = totalFunded - totalDistributed - totalInternalExpenses;
    const sectionBalances = {};
    const allSectionIds = new Set([
        ...Object.keys(sectionReceived),
        ...Object.keys(sectionExpenses),
    ]);
    for (const sid of allSectionIds) {
        const received = sectionReceived[sid] || 0;
        const spent = sectionExpenses[sid] || 0;
        sectionBalances[sid] = {
            received,
            spent,
            remaining: received - spent,
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
    return b.projectPoolRemaining;
};
exports.getProjectPoolRemaining = getProjectPoolRemaining;
const getSectionRemaining = async (sectionId) => {
    const txs = await prisma_1.default.pettyCashTransaction.findMany({
        where: { sectionId, isDeleted: false },
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
    return received - spent;
};
exports.getSectionRemaining = getSectionRemaining;
//# sourceMappingURL=pettyCashAccess.js.map