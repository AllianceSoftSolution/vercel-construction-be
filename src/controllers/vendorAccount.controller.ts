import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';

const prisma = new PrismaClient();

// Get vendor account statement (summary + all transactions)
export const getVendorAccountStatement = catchAsync(async (req: Request, res: Response, next) => {
  const { vendorId } = req.params;
  
  const vendorAccount = await prisma.vendorAccount.findUnique({
    where: { vendorId },
    include: {
      vendor: true,
      transactions: {
        orderBy: { createdAt: 'desc' }
      }
    }
  });
  
  if (!vendorAccount) {
    return next(new AppError('Vendor account not found', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: vendorAccount
  });
});

// Add a payment to a vendor (creates VendorPayment, VendorAccountTransaction, updates VendorAccount)
export const addVendorPayment = catchAsync(async (req: Request, res: Response, next) => {
  const { vendorId } = req.params;
  const { amount, proofOfPayment, note } = req.body;
  const userId = req.user.id;

  // Validate vendor exists
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) {
    return next(new AppError('Vendor not found', 404));
  }

  // Find or create vendor account
  let vendorAccount = await prisma.vendorAccount.findUnique({ where: { vendorId } });
  if (!vendorAccount) {
    vendorAccount = await prisma.vendorAccount.create({
      data: { vendorId }
    });
  }

  // Create payment
  const payment = await prisma.vendorPayment.create({
    data: {
      vendorId,
      amount,
      addedBy: userId,
      proofOfPayment,
      note
    }
  });

  // Create account transaction (DEBIT)
  await prisma.vendorAccountTransaction.create({
    data: {
      vendorAccountId: vendorAccount.id,
      type: 'DEBIT',
      amount,
      vendorPaymentId: payment.id,
      addedBy: userId,
      proofOfPayment,
      note
    }
  });

  // Update vendor account totals
  const credited = vendorAccount.totalCredited;
  const allDebits = await prisma.vendorAccountTransaction.findMany({
    where: { vendorAccountId: vendorAccount.id, type: 'DEBIT' }
  });
  const totalDebited = allDebits.reduce((sum, t) => sum + Number(t.amount), 0);
  const balance = Number(credited) - totalDebited;
  
  await prisma.vendorAccount.update({
    where: { id: vendorAccount.id },
    data: {
      totalDebited,
      balance
    }
  });

  res.status(201).json({
    status: 'success',
    data: payment
  });
});

// Get all payments for a vendor
export const getVendorPayments = catchAsync(async (req: Request, res: Response) => {
  const { vendorId } = req.query;
  
  const payments = await prisma.vendorPayment.findMany({
    where: { vendorId: vendorId as string },
    orderBy: { createdAt: 'desc' }
  });
  
  res.status(200).json({
    status: 'success',
    data: payments
  });
});

// Get all transactions for a vendor account
export const getVendorAccountTransactions = catchAsync(async (req: Request, res: Response) => {
  const { vendorAccountId } = req.query;
  
  const transactions = await prisma.vendorAccountTransaction.findMany({
    where: { vendorAccountId: vendorAccountId as string },
    orderBy: { createdAt: 'desc' }
  });
  
  res.status(200).json({
    status: 'success',
    data: transactions
  });
});

// Get vendor account summary
export const getVendorAccountSummary = catchAsync(async (req: Request, res: Response) => {
  const { vendorId } = req.params;
  
  const vendorAccount = await prisma.vendorAccount.findUnique({
    where: { vendorId },
    include: {
      vendor: true
    }
  });
  
  if (!vendorAccount) {
    res.status(200).json({
      status: 'success',
      data: {
        vendorId,
        totalCredited: 0,
        totalDebited: 0,
        balance: 0,
        vendor: null
      }
    });
    return;
  }
  
  res.status(200).json({
    status: 'success',
    data: vendorAccount
  });
}); 