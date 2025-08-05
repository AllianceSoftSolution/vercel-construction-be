import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import { NotificationService } from "../utils/notificationService";

const prisma = new PrismaClient();

// Get vendor account statement (summary + all transactions)
export const getVendorAccountStatement = catchAsync(
  async (req: Request, res: Response, next) => {
    const { vendorId } = req.params;

    const vendorAccount = await prisma.vendorAccount.findUnique({
      where: { vendorId },
      include: {
        vendor: true,
        transactions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!vendorAccount) {
      return next(new AppError("Vendor account not found", 404));
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
    const { amount, note } = req.body;
    const userId = req.user.id;

    // Get uploaded file from middleware
    const filesFromS3 = (req as any).filesFromS3;
    const proofOfPayment = filesFromS3?.proofOfPayment;

    // Validate vendor exists
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
      return next(new AppError("Vendor not found", 404));
    }

    if (!proofOfPayment) {
      return next(new AppError("Proof of payment file is required", 400));
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
        amount,
        addedBy: userId,
        proofOfPayment,
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
        addedBy: userId,
        proofOfPayment,
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
    const { page = 1, limit = 10, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

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
