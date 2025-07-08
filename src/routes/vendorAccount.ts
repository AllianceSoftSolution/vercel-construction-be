import express from 'express';
import * as vendorAccountController from '../controllers/vendorAccount.controller';
import protect from '../middlewares/auth.middleware';

const router = express.Router();

// Get vendor account statement
router.get('/vendors/:vendorId/statement', protect, vendorAccountController.getVendorAccountStatement);

// Add payment to vendor
router.post('/vendors/:vendorId/payments', protect, vendorAccountController.addVendorPayment);

// Get vendor payments
router.get('/vendors/payments', protect, vendorAccountController.getVendorPayments);

// Get vendor account transactions
router.get('/transactions', protect, vendorAccountController.getVendorAccountTransactions);

// Get vendor account summary
router.get('/vendors/:vendorId/summary', protect, vendorAccountController.getVendorAccountSummary);

export default router; 