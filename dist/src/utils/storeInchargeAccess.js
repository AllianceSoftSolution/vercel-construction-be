"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoreInchargeAccessibleSectionIds = getStoreInchargeAccessibleSectionIds;
const prisma_1 = __importDefault(require("./prisma"));
async function getStoreInchargeAccessibleSectionIds(user) {
    if (user.isHead) {
        const headAssignments = await prisma_1.default.headStoreInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { projectId: true },
        });
        const headProjectIds = headAssignments.map((a) => a.projectId);
        let sectionIds = [];
        if (headProjectIds.length > 0) {
            const sections = await prisma_1.default.section.findMany({
                where: { projectId: { in: headProjectIds }, isDeleted: false },
                select: { id: true },
            });
            sectionIds = sections.map((s) => s.id);
        }
        const directAssignments = await prisma_1.default.storeInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { store: { select: { sectionId: true } } },
        });
        const directSectionIds = directAssignments
            .map((a) => a.store.sectionId)
            .filter((id) => !!id);
        return Array.from(new Set([...sectionIds, ...directSectionIds]));
    }
    const assignments = await prisma_1.default.storeInchargeAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { store: { select: { sectionId: true } } },
    });
    return assignments
        .map((a) => a.store.sectionId)
        .filter((id) => !!id);
}
//# sourceMappingURL=storeInchargeAccess.js.map