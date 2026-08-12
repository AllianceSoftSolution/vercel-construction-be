import { Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import prisma from "../utils/prisma";
import {
  assertProjectAccess,
  assertSectionAccess,
  buildPettyCashAccessWhere,
  computeProjectBalances,
  getProjectAccountantProjectIds,
  getProjectPoolRemaining,
  getSectionAccountantSectionIds,
  getSectionRemaining,
  isHeadOfficeUser,
  isProjectAccountant,
  isSectionAccountantFor,
} from "../utils/pettyCashAccess";

const transactionInclude = {
  project: { select: { id: true, name: true, code: true } },
  section: { select: { id: true, name: true, code: true } },
  expenseHead: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true, email: true, role: true } },
  recipient: { select: { id: true, name: true, email: true } },
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
    if (!isHeadOfficeUser(user)) {
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
    if (!isHeadOfficeUser(user)) {
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
    if (!isHeadOfficeUser(user)) {
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

  const transactions = await prisma.pettyCashTransaction.findMany({
    where: accessWhere,
    select: { type: true, amount: true },
  });

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
  const poolRemaining =
    totalFunded - totalDistributed - totalInternalExpenses;

  const headOffice = isHeadOfficeUser(user);
  let canDistribute = headOffice;
  let canAddInternalExpense = headOffice;
  let canAddSectionExpense = headOffice;

  if (user.role === "ACCOUNTANT" && !user.isHead) {
    const projectIds = await getProjectAccountantProjectIds(user.id);
    const sectionIds = await getSectionAccountantSectionIds(user.id);
    canDistribute = projectIds.length > 0;
    canAddInternalExpense = projectIds.length > 0;
    canAddSectionExpense = sectionIds.length > 0 || projectIds.length > 0;
  }

  res.status(200).json({
    status: "success",
    data: {
      totalFunded,
      totalDistributed,
      totalInternalExpenses,
      totalSectionExpenses,
      totalSpent,
      poolRemaining,
      canAddFunding: headOffice,
      canManageHeads: headOffice,
      canDistribute,
      canAddInternalExpense,
      canAddSectionExpense,
    },
  });
});

export const getSummaryByProject = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const accessWhere = await buildPettyCashAccessWhere(user);

    const projectIds = await prisma.pettyCashTransaction.findMany({
      where: accessWhere,
      select: { projectId: true },
      distinct: ["projectId"],
    });

    const projects = await prisma.project.findMany({
      where: {
        id: { in: projectIds.map((p) => p.projectId) },
        isDeleted: false,
      },
      select: { id: true, name: true, code: true },
    });

    const result = await Promise.all(
      projects.map(async (project) => {
        const balances = await computeProjectBalances(project.id);
        return { ...project, ...balances };
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

    const balances = await computeProjectBalances(projectId);

    const sections = await prisma.section.findMany({
      where: { projectId, isDeleted: false },
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
    projectId,
    sectionId,
    type,
    dateFrom,
    dateTo,
    page = "1",
    limit = "50",
  } = req.query;

  const accessWhere = await buildPettyCashAccessWhere(user);
  const where: any = { ...accessWhere };

  if (projectId) where.projectId = projectId as string;
  if (sectionId) where.sectionId = sectionId as string;
  if (type) where.type = type as string;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
    if (dateTo) {
      const end = new Date(dateTo as string);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
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
    data: transactions,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// ─── Add Funding (project pool) ──────────────────────────────────────────────

export const addFunding = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    if (!isHeadOfficeUser(user)) {
      return next(
        new AppError("Only head office users can add petty cash funding", 403)
      );
    }

    const { projectId, amount, description } = req.body;
    const filesFromS3 = (req as any).filesFromS3;
    const proofUrl = filesFromS3?.proofOfExpense || null;

    if (!projectId) return next(new AppError("Project is required", 400));
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return next(new AppError("A valid amount is required", 400));
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
    });
    if (!project) return next(new AppError("Project not found", 404));

    const tx = await prisma.pettyCashTransaction.create({
      data: {
        type: "FUNDING",
        projectId,
        amount: Number(amount),
        proofUrl,
        description: description?.trim() || null,
        createdBy: user.id,
      },
      include: transactionInclude,
    });

    res.status(201).json({ status: "success", data: tx });
  }
);

// ─── Internal Expense (project-level spend with expense head) ────────────────

export const addInternalExpense = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    const { projectId, expenseHeadId, amount, description } = req.body;
    const filesFromS3 = (req as any).filesFromS3;
    const proofUrl = filesFromS3?.proofOfExpense || null;

    if (!projectId) return next(new AppError("Project is required", 400));
    if (!expenseHeadId) return next(new AppError("Expense head is required", 400));
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return next(new AppError("A valid amount is required", 400));
    }

    const canAdd =
      isHeadOfficeUser(user) ||
      (await isProjectAccountant(user.id, projectId));
    if (!canAdd) {
      return next(new AppError("Not authorized to add internal expense", 403));
    }
    if (!(await assertProjectAccess(user, projectId))) {
      return next(new AppError("Not authorized for this project", 403));
    }

    const remaining = await getProjectPoolRemaining(projectId);
    if (Number(amount) > remaining) {
      return next(
        new AppError(
          `Insufficient project pool balance. Available: ${remaining.toFixed(2)}`,
          400
        )
      );
    }

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
        proofUrl,
        description: description?.trim() || null,
        createdBy: user.id,
      },
      include: transactionInclude,
    });

    res.status(201).json({ status: "success", data: tx });
  }
);

// ─── Distribution (project accountant → section / self) ─────────────────────

export const addDistribution = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    const { projectId, sectionId, recipientUserId, amount, description } =
      req.body;

    if (!projectId) return next(new AppError("Project is required", 400));
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return next(new AppError("A valid amount is required", 400));
    }

    const canDistribute =
      isHeadOfficeUser(user) ||
      (await isProjectAccountant(user.id, projectId));
    if (!canDistribute) {
      return next(new AppError("Not authorized to distribute petty cash", 403));
    }
    if (!(await assertProjectAccess(user, projectId))) {
      return next(new AppError("Not authorized for this project", 403));
    }

    const remaining = await getProjectPoolRemaining(projectId);
    if (Number(amount) > remaining) {
      return next(
        new AppError(
          `Insufficient project pool. Available: ${remaining.toFixed(2)}`,
          400
        )
      );
    }

    if (sectionId) {
      const section = await prisma.section.findFirst({
        where: { id: sectionId, projectId, isDeleted: false },
      });
      if (!section) return next(new AppError("Section not found in project", 404));
    }

    if (recipientUserId) {
      const recipient = await prisma.user.findFirst({
        where: { id: recipientUserId, isDeleted: false, isActive: true },
      });
      if (!recipient) return next(new AppError("Recipient not found", 404));
    }

    const tx = await prisma.pettyCashTransaction.create({
      data: {
        type: "DISTRIBUTION",
        projectId,
        sectionId: sectionId || null,
        recipientUserId: recipientUserId || user.id,
        amount: Number(amount),
        description: description?.trim() || null,
        createdBy: user.id,
      },
      include: transactionInclude,
    });

    res.status(201).json({ status: "success", data: tx });
  }
);

// ─── Section Expense ─────────────────────────────────────────────────────────

export const addSectionExpense = catchAsync(
  async (req: Request, res: Response, next) => {
    const user = req.user;
    const { projectId, sectionId, expenseHeadId, amount, description } =
      req.body;
    const filesFromS3 = (req as any).filesFromS3;
    const proofUrl = filesFromS3?.proofOfExpense || null;

    if (!projectId || !sectionId) {
      return next(new AppError("Project and section are required", 400));
    }
    if (!expenseHeadId) return next(new AppError("Expense head is required", 400));
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return next(new AppError("A valid amount is required", 400));
    }

    const canExpense =
      isHeadOfficeUser(user) ||
      (await isProjectAccountant(user.id, projectId)) ||
      (await isSectionAccountantFor(user.id, sectionId));
    if (!canExpense) {
      return next(new AppError("Not authorized for section expense", 403));
    }
    if (!(await assertSectionAccess(user, sectionId))) {
      return next(new AppError("Not authorized for this section", 403));
    }

    const remaining = await getSectionRemaining(sectionId);
    if (Number(amount) > remaining) {
      return next(
        new AppError(
          `Insufficient section balance. Available: ${remaining.toFixed(2)}`,
          400
        )
      );
    }

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
        proofUrl,
        description: description?.trim() || null,
        createdBy: user.id,
      },
      include: transactionInclude,
    });

    res.status(201).json({ status: "success", data: tx });
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
