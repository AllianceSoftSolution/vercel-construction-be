import prisma from "./prisma";
import type { PettyCashTransactionType } from "@prisma/client";

export type PettyCashUser = {
  id: string;
  role: string;
  isHead?: boolean;
};

export const isAdminRole = (role: string) =>
  ["ADMIN", "SUPER_ADMIN", "SUB_ADMIN"].includes(role);

/** Only Super Admin and Admin may create/update/delete petty cash expense heads */
export const isPettyCashExpenseHeadAdmin = (user: PettyCashUser) =>
  user.role === "ADMIN" || user.role === "SUPER_ADMIN";

/** All project IDs the user may view in petty cash */
export const getAccessibleProjectIds = async (user: PettyCashUser) => {
  if (isAdminRole(user.role)) {
    const projects = await prisma.project.findMany({
      where: { isDeleted: false },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }

  if (user.role === "PROJECT_MANAGER") {
    return getProjectManagerProjectIds(user.id);
  }

  if (user.role === "ACCOUNTANT" && user.isHead) {
    const projects = await prisma.project.findMany({
      where: { isDeleted: false },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }

  if (user.role === "ACCOUNTANT") {
    const assignments = await prisma.accountantAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { projectId: true, sectionId: true },
    });
    const projectIds = new Set(assignments.map((a) => a.projectId));
    const sectionIds = assignments
      .map((a) => a.sectionId)
      .filter((id): id is string => id !== null);
    if (sectionIds.length > 0) {
      const sections = await prisma.section.findMany({
        where: { id: { in: sectionIds }, isDeleted: false },
        select: { projectId: true },
      });
      sections.forEach((s) => projectIds.add(s.projectId));
    }
    return [...projectIds];
  }

  return [];
};

/** Head office: Super Admin, Admin, Sub Admin, or Head Accountant */
export const isHeadOfficeUser = (user: PettyCashUser) =>
  isAdminRole(user.role) || (user.role === "ACCOUNTANT" && !!user.isHead);

/** PM & section accountant: overview/cards use assigned-section totals only */
export const usesSectionScopedOverview = (user: PettyCashUser) =>
  user.role === "PROJECT_MANAGER" ||
  (user.role === "ACCOUNTANT" && !user.isHead);

export const getPettyCashOverviewViewMode = (
  user: PettyCashUser
): "section" | "project" =>
  usesSectionScopedOverview(user) ? "section" : "project";

/** Project manager: assigned to at least one section in the project */
export const isProjectManagerForProject = async (
  userId: string,
  projectId: string
) => {
  const assignment = await prisma.projectManagerAssignment.findFirst({
    where: { userId, projectId, isActive: true },
  });
  return !!assignment;
};

/** Project manager: assigned to a specific section */
export const isProjectManagerForSection = async (
  userId: string,
  sectionId: string
) => {
  const assignment = await prisma.projectManagerAssignment.findFirst({
    where: { userId, sectionId, isActive: true },
  });
  return !!assignment;
};

export const getProjectManagerProjectIds = async (userId: string) => {
  const assignments = await prisma.projectManagerAssignment.findMany({
    where: { userId, isActive: true },
    select: { projectId: true },
  });
  return [...new Set(assignments.map((a) => a.projectId))];
};

export const getProjectManagerSectionIds = async (userId: string) => {
  const assignments = await prisma.projectManagerAssignment.findMany({
    where: { userId, isActive: true },
    select: { sectionId: true },
  });
  return assignments.map((a) => a.sectionId);
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

export const getHeadOfficeProjectIds = async (_userId?: string) => {
  const projects = await prisma.project.findMany({
    where: { isDeleted: false },
    select: { id: true },
  });
  return projects.map((p) => p.id);
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

/** Active section accountant assigned to a section (for petty cash distribution) */
export const getSectionAccountantUser = async (sectionId: string) => {
  const assignment = await prisma.accountantAssignment.findFirst({
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

/** Build Prisma where clause for transaction list based on role */
export const buildPettyCashAccessWhere = async (user: PettyCashUser) => {
  const base = { isDeleted: false };

  if (isAdminRole(user.role)) {
    return base;
  }

  if (user.role === "PROJECT_MANAGER") {
    const projectIds = await getProjectManagerProjectIds(user.id);
    const sectionIds = await getProjectManagerSectionIds(user.id);
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
    const sectionIds = await getSectionAccountantSectionIds(user.id);

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

  if (user.role === "PROJECT_MANAGER") {
    const ids = await getProjectManagerProjectIds(user.id);
    return ids.includes(projectId);
  }

  if (user.role === "ACCOUNTANT") {
    if (user.isHead) {
      return true;
    }

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

  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { projectId: true },
  });
  if (!section) return false;

  if (user.role === "PROJECT_MANAGER") {
    return isProjectManagerForSection(user.id, sectionId);
  }

  if (user.role === "ACCOUNTANT" && user.isHead) {
    return true;
  }

  if (user.role === "ACCOUNTANT") {
    return isSectionAccountantFor(user.id, sectionId);
  }

  return false;
};

export type PettyCashListFilters = {
  projectId?: string;
  sectionId?: string;
  type?: PettyCashTransactionType;
};

export const applyPettyCashListFilters = (
  where: Record<string, unknown>,
  filters: PettyCashListFilters
) => {
  const next = { ...where };
  if (filters.projectId) next.projectId = filters.projectId;
  if (filters.sectionId) next.sectionId = filters.sectionId;
  if (filters.type) next.type = filters.type;
  return next;
};

export const parsePettyCashListFilters = (query: {
  projectId?: string;
  sectionId?: string;
  type?: string;
}): PettyCashListFilters => ({
  ...(query.projectId && { projectId: String(query.projectId) }),
  ...(query.sectionId && { sectionId: String(query.sectionId) }),
  ...(query.type && { type: String(query.type) as PettyCashTransactionType }),
});

export const aggregatePettyCashTotals = (
  transactions: { type: string; amount: unknown }[]
) => {
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
  const poolRemaining = Math.max(
    0,
    totalFunded - totalDistributed - totalInternalExpenses
  );

  return {
    totalFunded,
    totalDistributed,
    totalInternalExpenses,
    totalSectionExpenses,
    totalSpent,
    poolRemaining,
  };
};

export const computePettyCashOverview = (
  totals: ReturnType<typeof aggregatePettyCashTotals>,
  viewMode: "section" | "project"
) => {
  if (viewMode === "section") {
    const totalCredited = totals.totalDistributed;
    const totalDebited = totals.totalSectionExpenses;
    const remainingBalance = Math.max(0, totalCredited - totalDebited);
    return { totalCredited, totalDebited, remainingBalance };
  }

  const totalCredited = totals.totalFunded;
  const totalDebited =
    totals.totalDistributed + totals.totalInternalExpenses;
  const remainingBalance = Math.max(0, totals.poolRemaining);
  return { totalCredited, totalDebited, remainingBalance };
};

export const aggregateOverviewTotals = (
  transactions: { type: string; amount: unknown }[],
  viewMode: "section" | "project"
) => {
  const scoped =
    viewMode === "section"
      ? transactions.filter(
          (tx) => tx.type === "DISTRIBUTION" || tx.type === "SECTION_EXPENSE"
        )
      : transactions;
  return aggregatePettyCashTotals(scoped);
};

export const mapProjectBalancesForHeadOffice = (
  balances: Awaited<ReturnType<typeof computeProjectBalances>>
) => ({
  ...balances,
  totalCredited: balances.totalFunded,
  totalDebited: balances.totalDistributed + balances.totalInternalExpenses,
  remainingBalance: balances.projectPoolRemaining,
});

export const mapProjectBalancesForOverview = (
  balances: Awaited<ReturnType<typeof computeProjectBalances>>,
  sectionScoped: boolean
) => {
  if (!sectionScoped) return balances;

  const totalSectionExpenses = Object.values(
    balances.sectionBalances || {}
  ).reduce((sum, section) => sum + section.spent, 0);

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

export type PettyCashBalanceScope = {
  /** When set, section-level txs are limited to these sections (PM symmetry) */
  pmSectionIds?: string[];
};

export const getPettyCashBalanceScope = async (
  user: PettyCashUser
): Promise<PettyCashBalanceScope> => {
  if (user.role === "PROJECT_MANAGER") {
    const pmSectionIds = await getProjectManagerSectionIds(user.id);
    return { pmSectionIds };
  }
  return {};
};

export const resolveFilteredProjectIds = async (
  accessibleIds: string[],
  filters: PettyCashListFilters,
  user?: PettyCashUser
): Promise<string[]> => {
  let ids = [...accessibleIds];

  if (filters.projectId) {
    ids = ids.filter((id) => id === filters.projectId);
  }

  if (filters.sectionId) {
    const section = await prisma.section.findFirst({
      where: { id: filters.sectionId, isDeleted: false },
      select: { projectId: true },
    });
    if (!section) return [];

    if (user?.role === "PROJECT_MANAGER") {
      const pmSectionIds = await getProjectManagerSectionIds(user.id);
      if (!pmSectionIds.includes(filters.sectionId)) return [];
    } else if (user?.role === "ACCOUNTANT" && !user.isHead) {
      const saSectionIds = await getSectionAccountantSectionIds(user.id);
      if (!saSectionIds.includes(filters.sectionId)) return [];
    }

    ids = ids.filter((id) => id === section.projectId);
  }

  if (filters.type) {
    const matches = await prisma.pettyCashTransaction.findMany({
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
      .filter((id): id is string => !!id && ids.includes(id));
  }

  return ids;
};

const isSectionInPmScope = (
  sectionId: string | null,
  pmSectionIds?: string[]
) => {
  if (!pmSectionIds) return true;
  if (!sectionId) return false;
  return pmSectionIds.includes(sectionId);
};

export const computeProjectBalances = async (
  projectId: string,
  filters: PettyCashListFilters = {},
  scope: PettyCashBalanceScope = {}
) => {
  const where: Record<string, unknown> = {
    projectId,
    isDeleted: false,
  };
  if (filters.sectionId) where.sectionId = filters.sectionId;
  if (filters.type) where.type = filters.type;

  const txs = await prisma.pettyCashTransaction.findMany({
    where,
    select: { type: true, amount: true, sectionId: true },
  });

  const { pmSectionIds } = scope;

  let totalFunded = 0;
  let totalDistributed = 0;
  let totalInternalExpenses = 0;
  const sectionReceived: Record<string, number> = {};
  const sectionExpenses: Record<string, number> = {};

  for (const tx of txs) {
    const amt = Number(tx.amount);
    switch (tx.type) {
      case "FUNDING":
        if (!pmSectionIds) totalFunded += amt;
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
        if (!pmSectionIds) totalInternalExpenses += amt;
        break;
      case "SECTION_EXPENSE":
        if (tx.sectionId && isSectionInPmScope(tx.sectionId, pmSectionIds)) {
          sectionExpenses[tx.sectionId] =
            (sectionExpenses[tx.sectionId] || 0) + amt;
        }
        break;
    }
  }

  const allProjectTxs = await prisma.pettyCashTransaction.findMany({
    where: { projectId, isDeleted: false },
    select: { type: true, amount: true },
  });
  let poolFunded = 0;
  let poolDistributed = 0;
  let poolInternal = 0;
  for (const tx of allProjectTxs) {
    const amt = Number(tx.amount);
    if (tx.type === "FUNDING") poolFunded += amt;
    if (tx.type === "DISTRIBUTION") poolDistributed += amt;
    if (tx.type === "INTERNAL_EXPENSE") poolInternal += amt;
  }
  const projectPoolRemaining = Math.max(
    0,
    poolFunded - poolDistributed - poolInternal
  );

  const sectionBalances: Record<
    string,
    { received: number; spent: number; remaining: number }
  > = {};
  const allSectionIds = new Set([
    ...Object.keys(sectionReceived),
    ...Object.keys(sectionExpenses),
    ...(pmSectionIds || []),
  ]);
  for (const sid of allSectionIds) {
    if (pmSectionIds && !pmSectionIds.includes(sid)) continue;
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

export const getProjectPoolRemaining = async (projectId: string) => {
  const b = await computeProjectBalances(projectId);
  return Math.max(0, b.projectPoolRemaining);
};

export const getSectionRemaining = async (sectionId: string) => {
  const b = await computeSectionBalances(sectionId);
  return Math.max(0, b.remaining);
};

/** Reject spends that would exceed available petty cash balance */
export const assertSufficientPettyCashBalance = (
  available: number,
  amount: number,
  balanceLabel: string
): string | null => {
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

export const computeSectionBalances = async (
  sectionId: string,
  filters: PettyCashListFilters = {}
) => {
  const where: Record<string, unknown> = {
    sectionId,
    isDeleted: false,
  };
  if (filters.type) where.type = filters.type;

  const txs = await prisma.pettyCashTransaction.findMany({
    where,
    select: { type: true, amount: true },
  });

  let received = 0;
  let spent = 0;
  for (const tx of txs) {
    const amt = Number(tx.amount);
    if (tx.type === "DISTRIBUTION") received += amt;
    if (tx.type === "SECTION_EXPENSE") spent += amt;
  }

  const remaining = Math.max(0, received - spent);

  return {
    received,
    spent,
    remaining,
    transactionCount: txs.length,
  };
};
