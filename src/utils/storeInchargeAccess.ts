import prisma from "./prisma";

// Head store incharges see all sections in their assigned projects;
// section store incharges only see data for their directly assigned store(s).
export async function getStoreInchargeAccessibleSectionIds(user: {
  id: string;
  isHead?: boolean;
}) {
  if (user.isHead) {
    const headAssignments = await prisma.headStoreInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { projectId: true },
    });
    const headProjectIds = headAssignments.map((a) => a.projectId);

    let sectionIds: string[] = [];
    if (headProjectIds.length > 0) {
      const sections = await prisma.section.findMany({
        where: { projectId: { in: headProjectIds }, isDeleted: false },
        select: { id: true },
      });
      sectionIds = sections.map((s) => s.id);
    }

    const directAssignments = await prisma.storeInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { store: { select: { sectionId: true } } },
    });
    const directSectionIds = directAssignments
      .map((a) => a.store.sectionId)
      .filter((id): id is string => !!id);

    return Array.from(new Set([...sectionIds, ...directSectionIds]));
  }

  const assignments = await prisma.storeInchargeAssignment.findMany({
    where: { userId: user.id, isActive: true },
    select: { store: { select: { sectionId: true } } },
  });
  return assignments
    .map((a) => a.store.sectionId)
    .filter((id): id is string => !!id);
}
