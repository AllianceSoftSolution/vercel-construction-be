import { Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import { NotificationService } from "../utils/notificationService";
import prisma from "../utils/prisma";

// Get vendor account statement (summary + all transactions)
export const getVendorAccountStatement = catchAsync(
  async (req: Request, res: Response, next) => {
    const { vendorId } = req.params;
    const { projectId } = req.query;

    // Build a project-scoped transaction filter when projectId is provided
    let transactionWhere: any = {};
    if (projectId) {
      const projectPOs = await prisma.purchaseOrder.findMany({
        where: { projectId: projectId as string, isDeleted: false },
        select: { id: true },
      });
      const projectPOIds = projectPOs.map((po) => po.id);

      transactionWhere = {
        OR: [
          // DEBIT payment transactions explicitly attributed to this project
          { projectId: projectId as string },
          // CREDIT transactions linked to a PO that belongs to this project
          { purchaseOrderId: { in: projectPOIds } },
        ],
      };
    }

    const vendorAccount = await prisma.vendorAccount.findUnique({
      where: { vendorId },
      include: {
        vendor: true,
        transactions: {
          where: transactionWhere,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!vendorAccount) {
      return next(new AppError("Vendor account not found", 404));
    }

    // Fetch purchase orders for transactions that have purchaseOrderId
    if (vendorAccount.transactions && vendorAccount.transactions.length > 0) {
      const purchaseOrderIds = vendorAccount.transactions
        .map((t) => t.purchaseOrderId)
        .filter((id): id is string => id !== null);

      if (purchaseOrderIds.length > 0) {
        const purchaseOrders = await prisma.purchaseOrder.findMany({
          where: { id: { in: purchaseOrderIds } },
          select: {
            id: true,
            referenceNumber: true,
            section: {
              select: {
                id: true,
                name: true,
                code: true,
                project: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                  },
                },
              },
            },
          },
        });

        // Map purchase orders to transactions
        const purchaseOrderMap = new Map(
          purchaseOrders.map((po) => [po.id, po])
        );

        vendorAccount.transactions = vendorAccount.transactions.map((transaction) => ({
          ...transaction,
          purchaseOrder: transaction.purchaseOrderId
            ? purchaseOrderMap.get(transaction.purchaseOrderId) || null
            : null,
        })) as any;
      }
    }

    res.status(200).json({
      status: "success",
      data: vendorAccount,
    });
  }
);

// Add a payment to a vendor (creates VendorPayment, VendorAccountTransaction, updates VendorAccount)
export const addVendorPayment = catchAsync(
  async (req: Request, res: Response, next) => {
    const { vendorId } = req.params;
    const { amount, note, projectId, sectionId } = req.body;
    const userId = req.user.id;

    // Get uploaded file from middleware
    const filesFromS3 = (req as any).filesFromS3;
    const proofOfPayment = filesFromS3?.proofOfPayment;

    // Validate vendor exists
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
      return next(new AppError("Vendor not found", 404));
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return next(new AppError("A valid payment amount is required", 400));
    }

    if (!note || !note.trim()) {
      return next(new AppError("Payment note is required", 400));
    }

    // Find or create vendor account
    let vendorAccount = await prisma.vendorAccount.findUnique({
      where: { vendorId },
    });
    if (!vendorAccount) {
      vendorAccount = await prisma.vendorAccount.create({
        data: { vendorId },
      });
    }

    // Create payment
    const payment = await prisma.vendorPayment.create({
      data: {
        vendorId,
        projectId: projectId || null,
        sectionId: sectionId || null,
        amount,
        addedBy: userId,
        proofOfPayment: proofOfPayment || null,
        note,
      },
    });

    // Create account transaction (DEBIT)
    await prisma.vendorAccountTransaction.create({
      data: {
        vendorAccountId: vendorAccount.id,
        type: "DEBIT",
        amount,
        vendorPaymentId: payment.id,
        projectId: projectId || null,
        sectionId: sectionId || null,
        addedBy: userId,
        proofOfPayment: proofOfPayment || null,
        note,
      },
    });

    // Update vendor account totals
    const credited = vendorAccount.totalCredited;
    const allDebits = await prisma.vendorAccountTransaction.findMany({
      where: { vendorAccountId: vendorAccount.id, type: "DEBIT" },
    });
    const totalDebited = allDebits.reduce(
      (sum, t) => sum + Number(t.amount),
      0
    );
    const balance = Number(credited) - totalDebited;

    await prisma.vendorAccount.update({
      where: { id: vendorAccount.id },
      data: {
        totalDebited,
        balance,
      },
    });

    res.status(201).json({
      status: "success",
      data: payment,
    });

    // Use the new notification service for vendor payment notifications
    await NotificationService.notifyVendorPayment(payment.id);
  }
);

// Get all payments for a vendor
export const getVendorPayments = catchAsync(
  async (req: Request, res: Response) => {
    const { vendorId } = req.query;

    const payments = await prisma.vendorPayment.findMany({
      where: { vendorId: vendorId as string },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      status: "success",
      data: payments,
    });
  }
);

// Get all transactions for a vendor account
export const getVendorAccountTransactions = catchAsync(
  async (req: Request, res: Response) => {
    const { vendorAccountId } = req.query;

    const transactions = await prisma.vendorAccountTransaction.findMany({
      where: { vendorAccountId: vendorAccountId as string },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      status: "success",
      data: transactions,
    });
  }
);

// Get vendor account summary
export const getVendorAccountSummary = catchAsync(
  async (req: Request, res: Response) => {
    const { vendorId } = req.params;

    const vendorAccount = await prisma.vendorAccount.findUnique({
      where: { vendorId },
      include: {
        vendor: true,
      },
    });

    if (!vendorAccount) {
      res.status(200).json({
        status: "success",
        data: {
          vendorId,
          totalCredited: 0,
          totalDebited: 0,
          balance: 0,
          vendor: null,
        },
      });
      return;
    }

    res.status(200).json({
      status: "success",
      data: vendorAccount,
    });
  }
);

// Get all vendor accounts overview
export const getAllVendorAccounts = catchAsync(
  async (req: Request, res: Response) => {
    const { page = 1, limit = 10, search, projectId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const user = req.user;

    // Detect section accountant and pre-load their assigned sections
    let userSectionIds: string[] | null = null;
    if (user?.role === "ACCOUNTANT" && !user?.isHead) {
      const assignments = await prisma.accountantAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      userSectionIds = assignments.map((a) => a.sectionId);
    }

    let where: any = {};

    // Add search filter if provided
    if (search) {
      where.vendor = {
        OR: [
          { name: { contains: search as string, mode: "insensitive" } },
          {
            contactPerson: { contains: search as string, mode: "insensitive" },
          },
          { email: { contains: search as string, mode: "insensitive" } },
        ],
      };
    }

    // Build scoped transaction filter helper
    const buildScopedTransactionFilter = async (
      pId: string | null,
      sectionIds: string[] | null
    ) => {
      // Get PO IDs scoped to project and/or sections
      const poWhere: any = { isDeleted: false };
      if (pId) poWhere.projectId = pId;
      if (sectionIds) poWhere.sectionId = { in: sectionIds };

      const scopedPOs = await prisma.purchaseOrder.findMany({
        where: poWhere,
        select: { id: true },
      });
      const scopedPOIds = scopedPOs.map((po) => po.id);

      const filter: any = {
        OR: [
          { purchaseOrderId: { in: scopedPOIds } }, // CREDIT: PO-linked
        ],
      };

      // DEBIT: payment transactions — filter by sectionId if available, else by projectId
      if (sectionIds) {
        filter.OR.push({ sectionId: { in: sectionIds } });
      } else if (pId) {
        filter.OR.push({ projectId: pId as string });
      }

      return filter;
    };

    // Resolve the transaction filter based on role + query params
    const isSectionScoped = userSectionIds !== null;
    const hasProjectFilter = Boolean(projectId);

    if (hasProjectFilter || isSectionScoped) {
      // Build section/project scoped transaction filter
      const transactionFilter = await buildScopedTransactionFilter(
        hasProjectFilter ? (projectId as string) : null,
        userSectionIds
      );

      // Get PO IDs again for vendor filtering (same logic, reuse filter)
      const poWhere: any = { isDeleted: false };
      if (hasProjectFilter) poWhere.projectId = projectId as string;
      if (isSectionScoped) poWhere.sectionId = { in: userSectionIds };
      const scopedPOs = await prisma.purchaseOrder.findMany({
        where: poWhere,
        select: { id: true },
      });
      const scopedPOIds = scopedPOs.map((po) => po.id);

      // Build the vendor-level filter matching the transaction filter
      const vendorTransactionSome: any = {
        OR: [
          { purchaseOrderId: { in: scopedPOIds } },
        ],
      };
      if (isSectionScoped) {
        vendorTransactionSome.OR.push({ sectionId: { in: userSectionIds! } });
      } else if (hasProjectFilter) {
        vendorTransactionSome.OR.push({ projectId: projectId as string });
      }

      // Get all vendor accounts that have scoped transactions
      const vendorAccountsWithProjectTransactions =
        await prisma.vendorAccount.findMany({
          where: {
            ...where,
            transactions: { some: vendorTransactionSome },
          },
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                contactPerson: true,
                email: true,
                phone: true,
                address: true,
                isActive: true,
              },
            },
            transactions: {
              where: transactionFilter,
              orderBy: { createdAt: "desc" },
            },
          },
          skip,
          take: Number(limit),
          orderBy: { lastUpdated: "desc" },
        });

      // Calculate project-specific metrics for each vendor account
      const vendorAccountsWithMetrics =
        vendorAccountsWithProjectTransactions.map((account) => {
          // Calculate project-specific totals
          const projectCredited = account.transactions
            .filter((t) => t.type === "CREDIT")
            .reduce((sum, t) => sum + Number(t.amount), 0);

          const projectDebited = account.transactions
            .filter((t) => t.type === "DEBIT")
            .reduce((sum, t) => sum + Number(t.amount), 0);

          const projectBalance = projectCredited - projectDebited;

          // Calculate paid amount (total debited for this project)
          const paidAmount = projectDebited;

          // Calculate remaining amount (balance - if positive, it's what we owe them for this project)
          const remainingAmount = projectBalance;

          // Calculate overdue amount (if balance is positive, it's overdue for this project)
          const overdueAmount = projectBalance > 0 ? projectBalance : 0;

          // Calculate advance amount (if balance is negative, it's advance for this project)
          const advanceAmount =
            projectBalance < 0 ? Math.abs(projectBalance) : 0;

          return {
            id: account.id,
            vendorId: account.vendorId,
            vendor: account.vendor,
            totalCredited: projectCredited,
            totalDebited: projectDebited,
            balance: projectBalance,
            paidAmount,
            remainingAmount,
            overdueAmount,
            advanceAmount,
            lastUpdated: account.lastUpdated,
            recentTransactions: account.transactions.slice(0, 5), // Get last 5 transactions
            // Status indicators
            hasOverdueAmount: overdueAmount > 0,
            hasAdvanceAmount: advanceAmount > 0,
            isBalanced: projectBalance === 0,
          };
        });

      // Filter out vendors with no project transactions
      const vendorsWithProjectActivity = vendorAccountsWithMetrics.filter(
        (account) => account.totalCredited > 0 || account.totalDebited > 0
      );

      const total = await prisma.vendorAccount.count({
        where: {
          ...where,
          transactions: { some: vendorTransactionSome },
        },
      });

      res.status(200).json({
        status: "success",
        data: vendorsWithProjectActivity,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
        summary: {
          totalVendors: total,
          totalCredited: vendorsWithProjectActivity.reduce(
            (sum, acc) => sum + acc.totalCredited,
            0
          ),
          totalDebited: vendorsWithProjectActivity.reduce(
            (sum, acc) => sum + acc.totalDebited,
            0
          ),
          totalBalance: vendorsWithProjectActivity.reduce(
            (sum, acc) => sum + acc.balance,
            0
          ),
          vendorsWithOverdue: vendorsWithProjectActivity.filter(
            (acc) => acc.hasOverdueAmount
          ).length,
          vendorsWithAdvance: vendorsWithProjectActivity.filter(
            (acc) => acc.hasAdvanceAmount
          ).length,
        },
      });

      return;
    }

    // Original logic for when no projectId is provided
    const vendorAccounts = await prisma.vendorAccount.findMany({
      where,
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            contactPerson: true,
            email: true,
            phone: true,
            address: true,
            isActive: true,
          },
        },
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 5, // Get last 5 transactions for overview
        },
      },
      skip,
      take: Number(limit),
      orderBy: { lastUpdated: "desc" },
    });

    // Calculate additional metrics for each vendor account
    const vendorAccountsWithMetrics = vendorAccounts.map((account) => {
      const totalCredited = Number(account.totalCredited);
      const totalDebited = Number(account.totalDebited);
      const balance = Number(account.balance);

      // Calculate paid amount (total debited)
      const paidAmount = totalDebited;

      // Calculate remaining amount (balance - if positive, it's what we owe them)
      const remainingAmount = balance;

      // Calculate overdue amount (if balance is positive, it's overdue)
      const overdueAmount = balance > 0 ? balance : 0;

      // Calculate advance amount (if balance is negative, it's advance)
      const advanceAmount = balance < 0 ? Math.abs(balance) : 0;

      return {
        id: account.id,
        vendorId: account.vendorId,
        vendor: account.vendor,
        totalCredited,
        totalDebited,
        balance,
        paidAmount,
        remainingAmount,
        overdueAmount,
        advanceAmount,
        lastUpdated: account.lastUpdated,
        recentTransactions: account.transactions,
        // Status indicators
        hasOverdueAmount: overdueAmount > 0,
        hasAdvanceAmount: advanceAmount > 0,
        isBalanced: balance === 0,
      };
    });

    const total = await prisma.vendorAccount.count({ where });

    res.status(200).json({
      status: "success",
      data: vendorAccountsWithMetrics,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
      summary: {
        totalVendors: total,
        totalCredited: vendorAccounts.reduce(
          (sum, acc) => sum + Number(acc.totalCredited),
          0
        ),
        totalDebited: vendorAccounts.reduce(
          (sum, acc) => sum + Number(acc.totalDebited),
          0
        ),
        totalBalance: vendorAccounts.reduce(
          (sum, acc) => sum + Number(acc.balance),
          0
        ),
        vendorsWithOverdue: vendorAccountsWithMetrics.filter(
          (acc) => acc.hasOverdueAmount
        ).length,
        vendorsWithAdvance: vendorAccountsWithMetrics.filter(
          (acc) => acc.hasAdvanceAmount
        ).length,
      },
    });
  }
);
