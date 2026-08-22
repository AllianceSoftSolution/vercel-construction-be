import { Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import prisma from "../utils/prisma";
import {
  assertProjectAccess,
  assertSectionAccess,
  applyPettyCashListFilters,
  buildPettyCashAccessWhere,
  aggregateOverviewTotals,
  computePettyCashOverview,
  getPettyCashOverviewViewMode,
  mapProjectBalancesForOverview,
  mapProjectBalancesForHeadOffice,
  usesSectionScopedOverview,
  computeProjectBalances,
  parsePettyCashListFilters,
  resolveFilteredProjectIds,
  computeSectionBalances,
  getAccessibleProjectIds,
  getPettyCashBalanceScope,
  getProjectManagerSectionIds,
  getProjectPoolRemaining,
  getSectionAccountantSectionIds,
  getSectionRemaining,
  getSectionAccountantUser,
  assertSufficientPettyCashBalance,
  getHeadOfficeDistributableRemaining,
  isAdminRole,
  isProjectAccountantUser,
  canAddPettyCashFunding,
  canAddPettyCashPool,
  resolveHeadOfficePettyCashProjectId,
  getPettyCashRoleScope,
  isPettyCashExpenseHeadAdmin,
  getPettyCashOperationalProjectError,
  pettyCashOperationalProjectWhere,
  isProjectManagerForProject,
  isProjectManagerForSection,
  isSectionAccountantFor,
} from "../utils/pettyCashAccess";
import {
  attachmentUrlsToJson,
  mapRecordAttachmentFields,
} from "../utils/attachmentUrls";
import { resolveUploadUrls } from "../utils/resolveUploadUrls";

const mapTransactionResponse = <T extends Record<string, unknown>>(tx: T) =>
  mapRecordAttachmentFields(tx, ["proofUrl"]);

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

// ─── Expense Heads ───────────────────────────────────────────────────────────

export const getExpenseHeads = catchAsync(async (req: Request, res: Response) => {
  const heads = await prisma.pettyCashExpenseHead.findMany({
    where: { isDeleted: false, isActive: true },
    orderBy: { name: "asc" },
  });
  res.status(200).json({ status: "success", data: heads });
});

export const createExpenseHead = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    if (!isPettyCashExpenseHeadAdmin(user)) {
      return next(new AppError("Not authorized to manage expense heads", 403));
    }
    const { name, description } = req.body;
    if (!name?.trim()) {
      return next(new AppError("Expense head name is required", 400));
    }
    const head = await prisma.pettyCashExpenseHead.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        createdBy: user.id,
      },
    });
    res.status(201).json({ status: "success", data: head });
  }
);

export const updateExpenseHead = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    if (!isPettyCashExpenseHeadAdmin(user)) {
      return next(new AppError("Not authorized to manage expense heads", 403));
    }
    const { id } = req.params;
    const { name, description, isActive } = req.body;
    const head = await prisma.pettyCashExpenseHead.update({
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
  }
);

export const deleteExpenseHead = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    if (!isPettyCashExpenseHeadAdmin(user)) {
      return next(new AppError("Not authorized to manage expense heads", 403));
    }
    const { id } = req.params;
    await prisma.pettyCashExpenseHead.update({
      where: { id },
      data: { isDeleted: true, isActive: false, updatedBy: user.id },
    });
    res.status(200).json({ status: "success", message: "Expense head deleted" });
  }
);

// ─── Summary & Balances ──────────────────────────────────────────────────────

export const getSummary = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const accessWhere = await buildPettyCashAccessWhere(user);
  const listFilters = parsePettyCashListFilters(req.query);
  const where = applyPettyCashListFilters(accessWhere, listFilters);

  const transactions = await prisma.pettyCashTransaction.findMany({
    where,
    select: { type: true, amount: true },
  });

  const overviewViewMode = getPettyCashOverviewViewMode(user);

  const {
    totalFunded,
    totalDistributed,
    totalInternalExpenses,
    totalSectionExpenses,
    totalSpent,
    poolRemaining,
  } = aggregateOverviewTotals(transactions, overviewViewMode);

  const roleScope = await getPettyCashRoleScope(user);
  const canManageHeads = isPettyCashExpenseHeadAdmin(user);
  const canAddFunding = await canAddPettyCashFunding(user);
  const canAddPettyCashPoolFunding = canAddPettyCashPool(user);
  const showPettyCashPoolRemaining =
    roleScope === "ADMIN" || roleScope === "HEAD_OFFICE_ACCOUNTANT";
  const headOfficeDistributableRemaining = showPettyCashPoolRemaining
    ? await getHeadOfficeDistributableRemaining()
    : null;
  const canDistribute =
    roleScope === "ADMIN" ||
    roleScope === "HEAD_OFFICE_ACCOUNTANT" ||
    roleScope === "PROJECT_ACCOUNTANT" ||
    roleScope === "PROJECT_MANAGER";
  const canAddInternalExpense = canDistribute;
  const canAddSectionExpense =
    roleScope === "ADMIN" ||
    roleScope === "HEAD_OFFICE_ACCOUNTANT" ||
    roleScope === "PROJECT_ACCOUNTANT" ||
    roleScope === "SECTION_ACCOUNTANT";

  const { totalCredited, totalDebited, remainingBalance } =
    computePettyCashOverview(
      {
        totalFunded,
        totalDistributed,
        totalInternalExpenses,
        totalSectionExpenses,
        totalSpent,
        poolRemaining,
      },
      overviewViewMode
    );

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
      canDistribute,
      canAddInternalExpense,
      canAddSectionExpense,
    },
  });
});

export const getSummaryByProject = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;

    if (user.role === "ACCOUNTANT" && !user.isHead) {
      res.status(200).json({ status: "success", data: [] });
      return;
    }

    const accessibleIds = await getAccessibleProjectIds(user);
    const listFilters = parsePettyCashListFilters(req.query);
    const filteredIds = await resolveFilteredProjectIds(
      accessibleIds,
      listFilters,
      user
    );

    const projects = await prisma.project.findMany({
      where: {
        id: { in: filteredIds.length ? filteredIds : ["__none__"] },
        isDeleted: false,
        ...pettyCashOperationalProjectWhere(),
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });

    const balanceFilters = {
      ...(listFilters.sectionId && { sectionId: listFilters.sectionId }),
      ...(listFilters.type && { type: listFilters.type }),
    };
    const balanceScope = await getPettyCashBalanceScope(user);
    const sectionScopedOverview = usesSectionScopedOverview(user);

    const result = await Promise.all(
      projects.map(async (project) => {
        const balances = await computeProjectBalances(
          project.id,
          balanceFilters,
          balanceScope
        );
        if (sectionScopedOverview) {
          return {
            ...project,
            ...mapProjectBalancesForOverview(balances, true),
          };
        }
        return {
          ...project,
          ...mapProjectBalancesForHeadOffice(balances),
        };
      })
    );

    res.status(200).json({ status: "success", data: result });
  }
);

export const getSummaryBySection = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const listFilters = parsePettyCashListFilters(req.query);

    let sectionIds: string[] = [];

    if (user.role === "ACCOUNTANT" && !user.isHead) {
      sectionIds = await getSectionAccountantSectionIds(user.id);
    } else if (isAdminRole(user.role) || isProjectAccountantUser(user)) {
      const projectIds = await getAccessibleProjectIds(user);
      const sections = await prisma.section.findMany({
        where: {
          projectId: { in: projectIds.length ? projectIds : ["__none__"] },
          isDeleted: false,
          project: pettyCashOperationalProjectWhere(),
        },
        select: { id: true },
      });
      sectionIds = sections.map((s) => s.id);
    }

    if (listFilters.sectionId) {
      sectionIds = sectionIds.filter((id) => id === listFilters.sectionId);
    }

    if (listFilters.projectId) {
      const projectSections = await prisma.section.findMany({
        where: { projectId: listFilters.projectId, isDeleted: false },
        select: { id: true },
      });
      const projectSectionIds = new Set(projectSections.map((s) => s.id));
      sectionIds = sectionIds.filter((id) => projectSectionIds.has(id));
    }

    const sections = await prisma.section.findMany({
      where: {
        id: { in: sectionIds.length ? sectionIds : ["__none__"] },
        isDeleted: false,
        project: pettyCashOperationalProjectWhere(),
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: "asc" },
    });

    const balanceFilters = {
      ...(listFilters.type && { type: listFilters.type }),
    };

    const result = await Promise.all(
      sections.map(async (section) => {
        const balances = await computeSectionBalances(
          section.id,
          balanceFilters
        );
        return {
          id: section.id,
          name: section.name,
          code: section.code,
          projectId: section.projectId,
          projectName: section.project.name,
          projectCode: section.project.code,
          ...balances,
        };
      })
    );

    res.status(200).json({ status: "success", data: result });
  }
);

export const getProjectBalance = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    const { projectId } = req.params;

    if (!(await assertProjectAccess(user, projectId))) {
      return next(new AppError("Not authorized for this project", 403));
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, code: true },
    });
    if (!project) return next(new AppError("Project not found", 404));

    const listFilters = parsePettyCashListFilters(req.query);
    const balanceFilters = {
      ...(listFilters.sectionId && { sectionId: listFilters.sectionId }),
      ...(listFilters.type && { type: listFilters.type }),
    };
    const balanceScope = await getPettyCashBalanceScope(user);

    const rawBalances = await computeProjectBalances(
      projectId,
      balanceFilters,
      balanceScope
    );
    const balances = usesSectionScopedOverview(user)
      ? mapProjectBalancesForOverview(rawBalances, true)
      : mapProjectBalancesForHeadOffice(rawBalances);

    let sectionWhere: Record<string, unknown> = {
      projectId,
      isDeleted: false,
    };
    if (listFilters.sectionId) {
      sectionWhere.id = listFilters.sectionId;
    } else if (user.role === "PROJECT_MANAGER") {
      const pmSectionIds = await getProjectManagerSectionIds(user.id);
      sectionWhere.id = { in: pmSectionIds.length ? pmSectionIds : ["__none__"] };
    } else if (user.role === "ACCOUNTANT" && !user.isHead) {
      const saSectionIds = await getSectionAccountantSectionIds(user.id);
      sectionWhere.id = { in: saSectionIds.length ? saSectionIds : ["__none__"] };
    }

    const sections = await prisma.section.findMany({
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
  }
);

// ─── Transactions List ───────────────────────────────────────────────────────

export const getTransactions = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const {
    dateFrom,
    dateTo,
    page = "1",
    limit = "50",
  } = req.query;

  const accessWhere = await buildPettyCashAccessWhere(user);
  const listFilters = parsePettyCashListFilters(req.query);
  const where: Record<string, unknown> = applyPettyCashListFilters(
    accessWhere,
    listFilters
  );
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.gte = new Date(dateFrom as string);
    if (dateTo) {
      const end = new Date(dateTo as string);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    where.createdAt = createdAt;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [transactions, total] = await Promise.all([
    prisma.pettyCashTransaction.findMany({
      where,
      include: transactionInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.pettyCashTransaction.count({ where }),
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

// ─── Add Petty Cash (central HO pool — admins only) ────────────────────────

export const addPettyCashPool = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    if (!canAddPettyCashPool(user)) {
      return next(
        new AppError("Only admins can add petty cash to the head office pool", 403)
      );
    }

    const { amount, description } = req.body;
    const proofUrls = resolveUploadUrls(req, {
      bodyKey: "proofUrls",
      multipartKey: "proofOfExpense",
    });

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return next(new AppError("A valid amount is required", 400));
    }
    if (proofUrls.length === 0) {
      return next(new AppError("Proof is required", 400));
    }

    const poolProjectId = await resolveHeadOfficePettyCashProjectId(user.id);

    const tx = await prisma.pettyCashTransaction.create({
      data: {
        type: "FUNDING",
        projectId: poolProjectId,
        amount: Number(amount),
        proofUrl: attachmentUrlsToJson(proofUrls),
        description: description?.trim() || null,
        createdBy: user.id,
      },
      include: transactionInclude,
    });

    res.status(201).json({ status: "success", data: mapTransactionResponse(tx) });
  }
);

// ─── Add Funding (project pool) ──────────────────────────────────────────────

export const addFunding = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    if (!(await canAddPettyCashFunding(user))) {
      return next(
        new AppError(
          "Only admins and head office accountants can add petty cash funding",
          403
        )
      );
    }

    const { projectId, amount, description } = req.body;
    const proofUrls = resolveUploadUrls(req, {
      bodyKey: "proofUrls",
      multipartKey: "proofOfExpense",
    });

    if (!projectId) return next(new AppError("Project is required", 400));
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return next(new AppError("A valid amount is required", 400));
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
    });
    if (!project) return next(new AppError("Project not found", 404));
    const operationalError = getPettyCashOperationalProjectError(project);
    if (operationalError) return next(new AppError(operationalError, 400));
    if (!(await assertProjectAccess(user, projectId))) {
      return next(new AppError("Not authorized for this project", 403));
    }

    if (proofUrls.length === 0) {
      return next(new AppError("Proof is required", 400));
    }

    const remaining = await getHeadOfficeDistributableRemaining();
    const poolError = assertSufficientPettyCashBalance(
      remaining,
      Number(amount),
      "petty cash pool balance"
    );
    if (poolError) return next(new AppError(poolError, 400));

    const tx = await prisma.pettyCashTransaction.create({
      data: {
        type: "FUNDING",
        projectId,
        amount: Number(amount),
        proofUrl: attachmentUrlsToJson(proofUrls),
        description: description?.trim() || null,
        createdBy: user.id,
      },
      include: transactionInclude,
    });

    res.status(201).json({ status: "success", data: mapTransactionResponse(tx) });
  }
);

// ─── Internal Expense (project-level spend with expense head) ────────────────

export const addInternalExpense = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    const { projectId, expenseHeadId, amount, description } = req.body;
    const proofUrls = resolveUploadUrls(req, {
      bodyKey: "proofUrls",
      multipartKey: "proofOfExpense",
    });

    if (!projectId) return next(new AppError("Project is required", 400));
    if (!expenseHeadId) return next(new AppError("Expense head is required", 400));

    const canAdd =
      isAdminRole(user.role) ||
      isProjectAccountantUser(user) ||
      (await isProjectManagerForProject(user.id, projectId));
    if (!canAdd) {
      return next(new AppError("Not authorized to add internal expense", 403));
    }
    if (!(await assertProjectAccess(user, projectId))) {
      return next(new AppError("Not authorized for this project", 403));
    }

    const internalProject = await prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: { code: true, name: true },
    });
    if (!internalProject) return next(new AppError("Project not found", 404));
    const internalProjectError =
      getPettyCashOperationalProjectError(internalProject);
    if (internalProjectError) {
      return next(new AppError(internalProjectError, 400));
    }

    if (proofUrls.length === 0) {
      return next(new AppError("Proof of expense is required", 400));
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return next(new AppError("A valid amount is required", 400));
    }

    const remaining = await getProjectPoolRemaining(projectId);
    const poolError = assertSufficientPettyCashBalance(
      remaining,
      Number(amount),
      "project balance"
    );
    if (poolError) return next(new AppError(poolError, 400));

    const head = await prisma.pettyCashExpenseHead.findFirst({
      where: { id: expenseHeadId, isDeleted: false, isActive: true },
    });
    if (!head) return next(new AppError("Expense head not found", 404));

    const tx = await prisma.pettyCashTransaction.create({
      data: {
        type: "INTERNAL_EXPENSE",
        projectId,
        expenseHeadId,
        amount: Number(amount),
        proofUrl: attachmentUrlsToJson(proofUrls),
        description: description?.trim() || null,
        createdBy: user.id,
      },
      include: transactionInclude,
    });

    res.status(201).json({ status: "success", data: mapTransactionResponse(tx) });
  }
);

// ─── Distribution (project manager → section) ───────────────────────────────

export const addDistribution = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    const { projectId, sectionId, amount, description } = req.body;
    const proofUrls = resolveUploadUrls(req, {
      bodyKey: "proofUrls",
      multipartKey: "proofOfExpense",
    });

    if (!projectId) return next(new AppError("Project is required", 400));
    if (!sectionId) return next(new AppError("Section is required", 400));

    const canDistribute =
      isAdminRole(user.role) ||
      isProjectAccountantUser(user) ||
      (await isProjectManagerForSection(user.id, sectionId));
    if (!canDistribute) {
      return next(new AppError("Not authorized to distribute petty cash", 403));
    }
    if (!(await assertProjectAccess(user, projectId))) {
      return next(new AppError("Not authorized for this project", 403));
    }
    if (!(await assertSectionAccess(user, sectionId))) {
      return next(new AppError("Not authorized for this section", 403));
    }

    const distributionProject = await prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: { code: true, name: true },
    });
    if (!distributionProject) return next(new AppError("Project not found", 404));
    const distributionProjectError =
      getPettyCashOperationalProjectError(distributionProject);
    if (distributionProjectError) {
      return next(new AppError(distributionProjectError, 400));
    }

    if (proofUrls.length === 0) {
      return next(new AppError("Proof of expense is required", 400));
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return next(new AppError("A valid amount is required", 400));
    }

    const remaining = await getProjectPoolRemaining(projectId);
    const poolError = assertSufficientPettyCashBalance(
      remaining,
      Number(amount),
      "project balance"
    );
    if (poolError) return next(new AppError(poolError, 400));

    const section = await prisma.section.findFirst({
      where: { id: sectionId, projectId, isDeleted: false },
      include: { project: { select: { code: true, name: true } } },
    });
    if (!section) return next(new AppError("Section not found in project", 404));
    const distributionSectionProjectError = getPettyCashOperationalProjectError(
      section.project
    );
    if (distributionSectionProjectError) {
      return next(new AppError(distributionSectionProjectError, 400));
    }

    const sectionAccountant = await getSectionAccountantUser(sectionId);
    if (!sectionAccountant) {
      return next(
        new AppError(
          "No section accountant is assigned to this section",
          400
        )
      );
    }

    const tx = await prisma.pettyCashTransaction.create({
      data: {
        type: "DISTRIBUTION",
        projectId,
        sectionId,
        recipientUserId: sectionAccountant.id,
        amount: Number(amount),
        proofUrl: attachmentUrlsToJson(proofUrls),
        description: description?.trim() || null,
        createdBy: user.id,
      },
      include: transactionInclude,
    });

    res.status(201).json({ status: "success", data: mapTransactionResponse(tx) });
  }
);

// ─── Section Expense ─────────────────────────────────────────────────────────

export const addSectionExpense = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    const { projectId, sectionId, expenseHeadId, amount, description } =
      req.body;
    const proofUrls = resolveUploadUrls(req, {
      bodyKey: "proofUrls",
      multipartKey: "proofOfExpense",
    });

    if (!projectId || !sectionId) {
      return next(new AppError("Project and section are required", 400));
    }

    const canExpense =
      isAdminRole(user.role) ||
      isProjectAccountantUser(user) ||
      (await isSectionAccountantFor(user.id, sectionId));
    if (!canExpense) {
      return next(new AppError("Not authorized for section expense", 403));
    }
    if (!(await assertSectionAccess(user, sectionId))) {
      return next(new AppError("Not authorized for this section", 403));
    }

    if (!expenseHeadId) return next(new AppError("Expense head is required", 400));
    if (proofUrls.length === 0) {
      return next(new AppError("Proof of expense is required", 400));
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return next(new AppError("A valid amount is required", 400));
    }

    const remaining = await getSectionRemaining(sectionId);
    const sectionError = assertSufficientPettyCashBalance(
      remaining,
      Number(amount),
      "section balance"
    );
    if (sectionError) return next(new AppError(sectionError, 400));

    const head = await prisma.pettyCashExpenseHead.findFirst({
      where: { id: expenseHeadId, isDeleted: false, isActive: true },
    });
    if (!head) return next(new AppError("Expense head not found", 404));

    const tx = await prisma.pettyCashTransaction.create({
      data: {
        type: "SECTION_EXPENSE",
        projectId,
        sectionId,
        expenseHeadId,
        amount: Number(amount),
        proofUrl: attachmentUrlsToJson(proofUrls),
        description: description?.trim() || null,
        createdBy: user.id,
      },
      include: transactionInclude,
    });

    res.status(201).json({ status: "success", data: mapTransactionResponse(tx) });
  }
);

export const getProjectSections = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    const { projectId } = req.params;

    if (!(await assertProjectAccess(user, projectId))) {
      return next(new AppError("Not authorized for this project", 403));
    }

    let sectionWhere: Record<string, unknown> = {
      projectId,
      isDeleted: false,
      isActive: true,
    };
    if (user.role === "PROJECT_MANAGER") {
      const pmSectionIds = await getProjectManagerSectionIds(user.id);
      sectionWhere.id = { in: pmSectionIds.length ? pmSectionIds : ["__none__"] };
    } else if (user.role === "ACCOUNTANT" && !user.isHead) {
      const saSectionIds = await getSectionAccountantSectionIds(user.id);
      sectionWhere.id = { in: saSectionIds.length ? saSectionIds : ["__none__"] };
    }

    const sections = await prisma.section.findMany({
      where: sectionWhere,
      select: { id: true, name: true, code: true, projectId: true },
      orderBy: { name: "asc" },
    });

    const sectionIds = sections.map((s) => s.id);
    const accountantAssignments =
      sectionIds.length > 0
        ? await prisma.accountantAssignment.findMany({
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

    const accountantBySectionId = new Map(
      accountantAssignments
        .filter((a) => a.sectionId)
        .map((a) => [a.sectionId as string, a.user])
    );

    const data = sections.map((section) => ({
      ...section,
      sectionAccountant: accountantBySectionId.get(section.id) || null,
    }));

    res.status(200).json({ status: "success", data });
  }
);

// ─── Section accountants for distribution dropdown ─────────────────────────────

export const getProjectAccountants = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    const { projectId } = req.params;

    if (!(await assertProjectAccess(user, projectId))) {
      return next(new AppError("Not authorized for this project", 403));
    }

    const assignments = await prisma.accountantAssignment.findMany({
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
  }
);
