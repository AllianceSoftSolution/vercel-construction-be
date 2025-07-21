import express from "express";
import * as vendorAccountController from "../controllers/vendorAccount.controller";
import protect from "../middlewares/auth.middleware";
import { s3UploadMiddleware } from "../middlewares/s3UploadMiddleware";

const router = express.Router();

// Get all vendor accounts overview
router.get("/vendors", protect, vendorAccountController.getAllVendorAccounts);

// Get vendor account statement
router.get(
  "/vendors/:vendorId/statement",
  protect,
  vendorAccountController.getVendorAccountStatement
);

// Add payment to vendor
router.post(
  "/vendors/:vendorId/payments",
  protect,
  s3UploadMiddleware([{ name: "proofOfPayment", maxCount: 1 }]),
  vendorAccountController.addVendorPayment
);

// Get vendor payments
router.get(
  "/vendors/payments",
  protect,
  vendorAccountController.getVendorPayments
);

// Get vendor account transactions
router.get(
  "/transactions",
  protect,
  vendorAccountController.getVendorAccountTransactions
);

// Get vendor account summary
router.get(
  "/vendors/:vendorId/summary",
  protect,
  vendorAccountController.getVendorAccountSummary
);

export default router;
