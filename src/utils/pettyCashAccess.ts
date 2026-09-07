import prisma from "./prisma";
import type { PettyCashTransactionType } from "@prisma/client";

export type PettyCashUser = {
  id: string;
  role: string;
  isHead?: boolean;
  originalRole?: string;
};

export const isAdminRole = (role: string) =>
  ["ADMIN", "SUPER_ADMIN", "SUB_ADMIN"].includes(role);

/** Only Super Admin and Admin may create/update/delete petty cash expense heads */
export const isPettyCashExpenseHeadAdmin = (user: PettyCashUser) =>
  user.role === "ADMIN" || user.role === "SUPER_ADMIN";

export const isSubAdminUser = (user: PettyCashUser) =>
  user.originalRole === "SUB_ADMIN" || user.role === "SUB_ADMIN";

/** Admin/Super Admin (not Sub-Admin) or Head Office Accountant may view Direct Expense */
export const canViewDirectExpense = async (user: PettyCashUser) => {
  if (isSubAdminUser(user)) return false;
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return true;
  return isHeadOfficeAccountant(user);
};

/** Admin (not Sub-Admin) or Head Office Accountant may add Direct Expense */
export const canAddDirectExpense = async (user: PettyCashUser) => {
  if (isSubAdminUser(user)) return false;
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return true;
  return isHeadOfficeAccountant(user);
};

/** Only Admin/Super Admin may create/update/delete Direct Expense heads */
export const canManageDirectExpenseHeads = async (user: PettyCashUser) =>
  isPettyCashExpenseHeadAdmin(user);

/** Admin/Super Admin or Head Office may pick either head type in dropdowns */
export const canSelectAllExpenseHeadTypes = async (user: PettyCashUser) => {
  if (isSubAdminUser(user)) return false;
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return true;
  return isHeadOfficeAccountant(user);
};

/** Head Office Petty Cash is a normal project, not the central balance */
export const HEAD_OFFICE_PETTY_CASH_PROJECT_CODE = "HO-Petty";

export type PettyCashProjectRef = {
  code?: string | null;
  name?: string | null;
};

export const isHeadOfficePettyCashProject = (project: PettyCashProjectRef) => {
  const code = (project.code || "").trim();
  if (code === HEAD_OFFICE_PETTY_CASH_PROJECT_CODE) return true;
  return (project.name || "").trim().toLowerCase() === "head office petty cash";
};

/** All projects, including HO-Petty, are valid distribute/expense targets */
export const isPettyCashOperationalTarget = (_project: PettyCashProjectRef) =>
  true;

export const filterPettyCashOperationalTargets = <T extends PettyCashProjectRef>(
  projects: T[]
) => projects.filter(isPettyCashOperationalTarget);

/** @deprecated Use isPettyCashOperationalTarget */
export const isPettyCashSelectableProject = isPettyCashOperationalTarget;

/** @deprecated Use filterPettyCashOperationalTargets */
export const filterPettyCashSelectableProjects = filterPettyCashOperationalTargets;

export const canViewHeadOfficePettyCashProject = async (user: PettyCashUser) => {
  if (isAdminRole(user.role)) return true;
  return isHeadOfficeAccountant(user);
};

export const pettyCashProjectListWhere = async (_user?: PettyCashUser) => ({});

export const getPettyCashOperationalProjectError = (
  _project: PettyCashProjectRef
) => null;

export const getHeadOfficePettyCashProjectId = async () => {
  const project = await prisma.project.findFirst({
    where: {
      code: HEAD_OFFICE_PETTY_CASH_PROJECT_CODE,
      isDeleted: false,
    },
    select: { id: true },
  });
  return project?.id ?? null;
};

export const resolveHeadOfficePettyCashProjectId = async (createdBy: string) => {
  const existingId = await getHeadOfficePettyCashProjectId();
  if (existingId) return existingId;

  const created = await prisma.project.create({
    data: {
      name: "Head Office Petty Cash",
      code: HEAD_OFFICE_PETTY_CASH_PROJECT_CODE,
      description: "Head Office petty cash project",
      isActive: true,
      isDeleted: false,
      createdBy,
    },
    select: { id: true },
  });
  return created.id;
};

/** Admins inject petty cash into the central balance (not a project) */
export const canAddPettyCashPool = (user: PettyCashUser) =>
  isAdminRole(user.role);

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
    return getProjectAccountantProjectIds(user.id);
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

/** Project-level accountant assignments (sectionId = null) */
export const getProjectAccountantProjectIds = async (userId: string) => {
  const assignments = await prisma.accountantAssignment.findMany({
    where: { userId, isActive: true, sectionId: null },
    select: { projectId: true },
  });
  return [...new Set(assignments.map((a) => a.projectId))];
};

/** Accountant created with isHead=true and assigned project(s) */
export const isProjectAccountantUser = (user: PettyCashUser) =>
  user.role === "ACCOUNTANT" && !!user.isHead;

/** Admin / Super Admin / Sub Admin, or any project-level accountant */
export const isHeadOfficeUser = (user: PettyCashUser) =>
  isAdminRole(user.role) || isProjectAccountantUser(user);

/**
 * When new projects are created, HO accountants who already cover every other
 * active project receive the missing assignment (same rule as project create).
 * Section-level assignments do not block sync when the user also has project-level
 * head accountant assignments (HO may work at both project and section scope).
 */
export const syncHeadOfficeAccountantProjectAssignments = async (
  userId: string,
  createdBy = "system"
) => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      role: "ACCOUNTANT",
      isHead: true,
      isDeleted: false,
      isActive: true,
    },
    select: { id: true },
  });
  if (!user) return;

  const projectLevelCount = await prisma.accountantAssignment.count({
    where: { userId, isActive: true, sectionId: null },
  });
  if (projectLevelCount === 0) return;

  const allIds = await getHeadOfficeProjectIds();
  if (allIds.length === 0) return;

  let assigned = new Set(await getProjectAccountantProjectIds(userId));
  let missing = allIds.filter((id) => !assigned.has(id));

  // Head office accountants cover many projects; project accountants cover one (or two).
  const likelyHeadOffice =
    projectLevelCount >= 3 &&
    missing.length > 0 &&
    projectLevelCount + missing.length === allIds.length;

  if (likelyHeadOffice) {
    for (const projectId of missing) {
      await prisma.accountantAssignment.create({
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
    if (!coversAllOthers) continue;

    await prisma.accountantAssignment.create({
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

/** True HO accountant: assigned to every active project */
export const isHeadOfficeAccountant = async (user: PettyCashUser) => {
  if (!isProjectAccountantUser(user)) return false;
  await syncHeadOfficeAccountantProjectAssignments(user.id);
  const assigned = await getProjectAccountantProjectIds(user.id);
  const all = await getHeadOfficeProjectIds();
  if (all.length === 0) return false;
  return all.every((id) => assigned.includes(id));
};

const isCentralPoolCredit = (
  tx: { projectId: string | null; creator: { role: string } | null }
) => tx.projectId == null && tx.creator != null && isAdminRole(tx.creator.role);

const isCentralPoolDebit = (
  tx: {
    projectId: string | null;
    creator: { role: string; isHead?: boolean | null } | null;
  }
) => {
  if (tx.projectId == null || !tx.creator) return false;
  return (
    isAdminRole(tx.creator.role) ||
    (tx.creator.role === "ACCOUNTANT" && !!tx.creator.isHead)
  );
};

const computeHeadOfficeCentralBalanceTotals = async () => {
  const txs = await prisma.pettyCashTransaction.findMany({
    where: { isDeleted: false, type: "FUNDING" },
    select: {
      amount: true,
      projectId: true,
      createdAt: true,
      creator: { select: { role: true, isHead: true } },
    },
  });

  let totalAdded = 0;
  const creditDates: Date[] = [];

  for (const tx of txs) {
    if (!isCentralPoolCredit(tx)) continue;
    totalAdded += Number(tx.amount);
    creditDates.push(tx.createdAt);
  }

  if (creditDates.length === 0) {
    return { totalAdded: 0, totalDistributed: 0, remaining: 0 };
  }

  const poolEpoch = creditDates.reduce((min, d) => (d < min ? d : min));

  let totalDistributed = 0;
  for (const tx of txs) {
    if (!isCentralPoolDebit(tx)) continue;
    if (tx.createdAt < poolEpoch) continue;
    totalDistributed += Number(tx.amount);
  }

  const remaining = Math.max(0, totalAdded - totalDistributed);
  return { totalAdded, totalDistributed, remaining };
};

/**
 * Central petty cash balance: admin Add Petty Cash (no project) minus
 * Distribute to Project by admins or head office accountants.
 */
export const getHeadOfficeDistributableRemaining = async () => {
  const { remaining } = await computeHeadOfficeCentralBalanceTotals();
  return remaining;
};

export type AdminPettyCashAuditEntry = {
  id: string;
  createdAt: Date;
  direction: "CREDIT" | "DEBIT";
  type: "FUNDING";
  label: string;
  amount: number;
  projectId: string | null;
  projectName: string;
  projectCode: string | null;
  description: string | null;
  proofUrl: unknown;
  creator: {
    id: string;
    name: string;
    email: string | null;
    role: string;
  } | null;
};

export const getAdminPettyCashAuditLog = async () => {
  const { totalAdded, totalDistributed, remaining } =
    await computeHeadOfficeCentralBalanceTotals();

  const firstPoolAdd = await prisma.pettyCashTransaction.findFirst({
    where: {
      isDeleted: false,
      type: "FUNDING",
      projectId: null,
      creator: { role: { in: ["ADMIN", "SUPER_ADMIN", "SUB_ADMIN"] } },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (!firstPoolAdd) {
    return {
      summary: {
        totalCredited: 0,
        totalDebited: 0,
        remainingBalance: 0,
      },
      entries: [] as AdminPettyCashAuditEntry[],
    };
  }

  const poolEpoch = firstPoolAdd.createdAt;

  const txs = await prisma.pettyCashTransaction.findMany({
    where: {
      isDeleted: false,
      type: "FUNDING",
      OR: [
        {
          projectId: null,
          creator: { role: { in: ["ADMIN", "SUPER_ADMIN", "SUB_ADMIN"] } },
        },
        {
          projectId: { not: null },
          createdAt: { gte: poolEpoch },
          OR: [
            { creator: { role: { in: ["ADMIN", "SUPER_ADMIN", "SUB_ADMIN"] } } },
            { creator: { role: "ACCOUNTANT", isHead: true } },
          ],
        },
      ],
    },
    include: {
      project: { select: { id: true, name: true, code: true } },
      creator: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const entries: AdminPettyCashAuditEntry[] = txs.map((tx) => {
    const isCredit = isCentralPoolCredit(tx);

    return {
      id: tx.id,
      createdAt: tx.createdAt,
      direction: isCredit ? "CREDIT" : "DEBIT",
      type: "FUNDING",
      label: isCredit ? "Petty Cash Added" : "Distribute to Project",
      amount: Number(tx.amount),
      projectId: tx.project?.id ?? null,
      projectName: isCredit
        ? "Central Petty Cash"
        : tx.project?.name ?? "-",
      projectCode: tx.project?.code ?? null,
      description: tx.description,
      proofUrl: tx.proofUrl,
      creator: tx.creator,
    };
  });

  return {
    summary: {
      totalCredited: totalAdded,
      totalDebited: totalDistributed,
      remainingBalance: remaining,
    },
    entries,
  };
};

/** Can inject funding into project pools (admins + true HO accountant only) */
export const canAddPettyCashFunding = async (user: PettyCashUser) =>
  isAdminRole(user.role) || (await isHeadOfficeAccountant(user));

export type PettyCashRoleScope =
  | "ADMIN"
  | "HEAD_OFFICE_ACCOUNTANT"
  | "PROJECT_ACCOUNTANT"
  | "PROJECT_MANAGER"
  | "SECTION_ACCOUNTANT"
  | "NONE";

export const getPettyCashRoleScope = async (
  user: PettyCashUser
): Promise<PettyCashRoleScope> => {
  if (isAdminRole(user.role)) return "ADMIN";
  if (user.role === "PROJECT_MANAGER") return "PROJECT_MANAGER";
  if (user.role === "ACCOUNTANT" && !user.isHead) return "SECTION_ACCOUNTANT";
  if (isProjectAccountantUser(user)) {
    return (await isHeadOfficeAccountant(user))
      ? "HEAD_OFFICE_ACCOUNTANT"
      : "PROJECT_ACCOUNTANT";
  }
  return "NONE";
};

/** Keep HO accountants assigned when a new project is created */
export const assignHeadOfficeAccountantsToProject = async (
  projectId: string,
  createdBy: string
) => {
  const otherProjects = await prisma.project.findMany({
    where: { isDeleted: false, isActive: true, id: { not: projectId } },
    select: { id: true },
  });
  const otherIds = otherProjects.map((p) => p.id);
  if (otherIds.length === 0) return;

  const headAccountants = await prisma.user.findMany({
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
    const assigned = new Set(
      accountant.accountantAssignments.map((a) => a.projectId)
    );
    const coversAllOthers = otherIds.every((id) => assigned.has(id));
    if (!coversAllOthers || assigned.has(projectId)) continue;

    await prisma.accountantAssignment.create({
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
    where: {
      isDeleted: false,
      isActive: true,
    },
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
  const base = { isDeleted: false, projectId: { not: null } };

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
    const projectIds = await getProjectAccountantProjectIds(user.id);
    return {
      ...base,
      projectId: { in: projectIds.length ? projectIds : ["__none__"] },
    };
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
      const ids = await getProjectAccountantProjectIds(user.id);
      return ids.includes(projectId);
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
    const ids = await getProjectAccountantProjectIds(user.id);
    return ids.includes(section.projectId);
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
  expenseHeadId?: string;
};

const constrainIdFilter = (existing: unknown, requested: string) => {
  if (!existing) return requested;
  if (typeof existing === "string") {
    return existing === requested ? requested : "__none__";
  }
  if (typeof existing === "object" && existing !== null) {
    if (
      "not" in existing &&
      (existing as { not: unknown }).not === null
    ) {
      return requested;
    }
    if ("in" in existing && Array.isArray((existing as { in: unknown }).in)) {
      const ids = (existing as { in: string[] }).in;
      return ids.includes(requested) ? requested : "__none__";
    }
  }
  return "__none__";
};

export const applyPettyCashListFilters = (
  where: Record<string, unknown>,
  filters: PettyCashListFilters
) => {
  const next = { ...where };
  if (filters.projectId) {
    next.projectId = constrainIdFilter(where.projectId, filters.projectId);
  }
  if (filters.sectionId) {
    next.sectionId = constrainIdFilter(where.sectionId, filters.sectionId);
  }
  if (filters.type) next.type = filters.type;
  if (filters.expenseHeadId) next.expenseHeadId = filters.expenseHeadId;
  return next;
};

export const parsePettyCashListFilters = (query: {
  projectId?: string;
  sectionId?: string;
  type?: string;
  expenseHeadId?: string;
}): PettyCashListFilters => ({
  ...(query.projectId && { projectId: String(query.projectId) }),
  ...(query.sectionId && { sectionId: String(query.sectionId) }),
  ...(query.type && { type: String(query.type) as PettyCashTransactionType }),
  ...(query.expenseHeadId && { expenseHeadId: String(query.expenseHeadId) }),
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
    } else if (user?.role === "ACCOUNTANT" && user.isHead) {
      const paProjectIds = await getProjectAccountantProjectIds(user.id);
      if (!paProjectIds.includes(section.projectId)) return [];
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

const toMoney = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const sumDirectExpenseByProjectIds = async (projectIds: string[]) => {
  const totals = new Map<string, number>();
  if (projectIds.length === 0) return totals;

  const grouped = await prisma.directExpenseTransaction.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds }, isDeleted: false },
    _sum: { amount: true },
  });

  for (const row of grouped) {
    totals.set(row.projectId, toMoney(row._sum.amount));
  }
  return totals;
};

export const sumDirectExpenseBySectionIds = async (sectionIds: string[]) => {
  const totals = new Map<string, number>();
  if (sectionIds.length === 0) return totals;

  const grouped = await prisma.directExpenseTransaction.groupBy({
    by: ["sectionId"],
    where: {
      sectionId: { in: sectionIds },
      isDeleted: false,
    },
    _sum: { amount: true },
  });

  for (const row of grouped) {
    if (row.sectionId) totals.set(row.sectionId, toMoney(row._sum.amount));
  }
  return totals;
};

export const getProjectDirectExpenseTotal = async (projectId: string) => {
  const result = await prisma.directExpenseTransaction.aggregate({
    where: { projectId, isDeleted: false },
    _sum: { amount: true },
  });
  return toMoney(result._sum.amount);
};

export const getSectionDirectExpenseTotal = async (sectionId: string) => {
  const result = await prisma.directExpenseTransaction.aggregate({
    where: { sectionId, isDeleted: false },
    _sum: { amount: true },
  });
  return toMoney(result._sum.amount);
};
