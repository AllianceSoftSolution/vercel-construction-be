import prisma from "./prisma";

export type PettyCashUser = {
  id: string;
  role: string;
  isHead?: boolean;
};

export const isAdminRole = (role: string) =>
  ["ADMIN", "SUPER_ADMIN", "SUB_ADMIN"].includes(role);

/** Head office: Super Admin, Admin, Sub Admin, or Head Accountant */
export const isHeadOfficeUser = (user: PettyCashUser) =>
  isAdminRole(user.role) || (user.role === "ACCOUNTANT" && !!user.isHead);

/** Project accountant: assigned at project level (sectionId null), not head */
export const isProjectAccountant = async (userId: string, projectId: string) => {
  const assignment = await prisma.accountantAssignment.findFirst({
    where: {
      userId,
      projectId,
      sectionId: null,
      isActive: true,
    },
  });
  return !!assignment;
};

/** Section accountant: assigned to a specific section */
export const isSectionAccountantFor = async (
  userId: string,
  sectionId: string
) => {
  const assignment = await prisma.accountantAssignment.findFirst({
    where: { userId, sectionId, isActive: true },
  });
  return !!assignment;
};

export const getHeadOfficeProjectIds = async (userId: string) => {
  const assignments = await prisma.accountantAssignment.findMany({
    where: { userId, isActive: true, sectionId: null },
    select: { projectId: true },
  });
  return [...new Set(assignments.map((a) => a.projectId))];
};

export const getProjectAccountantProjectIds = async (userId: string) => {
  const assignments = await prisma.accountantAssignment.findMany({
    where: { userId, isActive: true, sectionId: null },
    select: { projectId: true },
  });
  return [...new Set(assignments.map((a) => a.projectId))];
};

export const getSectionAccountantSectionIds = async (userId: string) => {
  const assignments = await prisma.accountantAssignment.findMany({
    where: { userId, isActive: true, sectionId: { not: null } },
    select: { sectionId: true },
  });
  return assignments
    .map((a) => a.sectionId)
    .filter((id): id is string => id !== null);
};

/** Build Prisma where clause for transaction list based on role */
export const buildPettyCashAccessWhere = async (user: PettyCashUser) => {
  const base = { isDeleted: false };

  if (isAdminRole(user.role)) {
    return base;
  }

  if (user.role === "ACCOUNTANT" && user.isHead) {
    const projectIds = await getHeadOfficeProjectIds(user.id);
    return { ...base, projectId: { in: projectIds.length ? projectIds : ["__none__"] } };
  }

  if (user.role === "ACCOUNTANT") {
    const projectIds = await getProjectAccountantProjectIds(user.id);
    const sectionIds = await getSectionAccountantSectionIds(user.id);

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

export const assertProjectAccess = async (
  user: PettyCashUser,
  projectId: string
) => {
  if (isAdminRole(user.role)) return true;

  if (user.role === "ACCOUNTANT") {
    if (user.isHead) {
      const ids = await getHeadOfficeProjectIds(user.id);
      return ids.includes(projectId);
    }
    const projectIds = await getProjectAccountantProjectIds(user.id);
    if (projectIds.includes(projectId)) return true;

    const sections = await prisma.section.findMany({
      where: { projectId, isDeleted: false },
      select: { id: true },
    });
    const sectionIds = await getSectionAccountantSectionIds(user.id);
    return sections.some((s) => sectionIds.includes(s.id));
  }

  return false;
};

export const assertSectionAccess = async (
  user: PettyCashUser,
  sectionId: string
) => {
  if (isAdminRole(user.role)) return true;
  if (user.role === "ACCOUNTANT" && user.isHead) {
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { projectId: true },
    });
    if (!section) return false;
    const ids = await getHeadOfficeProjectIds(user.id);
    return ids.includes(section.projectId);
  }
  if (user.role === "ACCOUNTANT") {
    const projectIds = await getProjectAccountantProjectIds(user.id);
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { projectId: true },
    });
    if (section && projectIds.includes(section.projectId)) return true;
    return isSectionAccountantFor(user.id, sectionId);
  }
  return false;
};

export const computeProjectBalances = async (projectId: string) => {
  const txs = await prisma.pettyCashTransaction.findMany({
    where: { projectId, isDeleted: false },
    select: { type: true, amount: true, sectionId: true },
  });

  let totalFunded = 0;
  let totalDistributed = 0;
  let totalInternalExpenses = 0;
  const sectionReceived: Record<string, number> = {};
  const sectionExpenses: Record<string, number> = {};

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

  const projectPoolRemaining =
    totalFunded - totalDistributed - totalInternalExpenses;

  const sectionBalances: Record<
    string,
    { received: number; spent: number; remaining: number }
  > = {};
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

export const getProjectPoolRemaining = async (projectId: string) => {
  const b = await computeProjectBalances(projectId);
  return b.projectPoolRemaining;
};

export const getSectionRemaining = async (sectionId: string) => {
  const txs = await prisma.pettyCashTransaction.findMany({
    where: { sectionId, isDeleted: false },
    select: { type: true, amount: true },
  });
  let received = 0;
  let spent = 0;
  for (const tx of txs) {
    const amt = Number(tx.amount);
    if (tx.type === "DISTRIBUTION") received += amt;
    if (tx.type === "SECTION_EXPENSE") spent += amt;
  }
  return received - spent;
};
