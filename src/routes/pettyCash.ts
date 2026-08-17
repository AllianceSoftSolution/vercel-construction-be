import express from "express";
import * as pettyCashController from "../controllers/pettyCash.controller";
import protect from "../middlewares/auth.middleware";
import { s3UploadMiddleware } from "../middlewares/s3UploadMiddleware";

const router = express.Router();

// Summary & balances
router.get("/summary", protect, pettyCashController.getSummary);
router.get(
  "/summary/by-project",
  protect,
  pettyCashController.getSummaryByProject
);
router.get(
  "/summary/by-section",
  protect,
  pettyCashController.getSummaryBySection
);
router.get(
  "/projects/:projectId/balance",
  protect,
  pettyCashController.getProjectBalance
);

// Expense heads
router.get("/expense-heads", protect, pettyCashController.getExpenseHeads);
router.post("/expense-heads", protect, pettyCashController.createExpenseHead);
router.put(
  "/expense-heads/:id",
  protect,
  pettyCashController.updateExpenseHead
);
router.delete(
  "/expense-heads/:id",
  protect,
  pettyCashController.deleteExpenseHead
);

// Transactions
router.get("/transactions", protect, pettyCashController.getTransactions);

// Funding (head office only)
router.post(
  "/funding",
  protect,
  s3UploadMiddleware([{ name: "proofOfExpense", maxCount: 1 }]),
  pettyCashController.addFunding
);

// Internal expense at project level
router.post(
  "/internal-expense",
  protect,
  s3UploadMiddleware([{ name: "proofOfExpense", maxCount: 1 }]),
  pettyCashController.addInternalExpense
);

// Distribution to sections
router.post(
  "/distribution",
  protect,
  s3UploadMiddleware([{ name: "proofOfExpense", maxCount: 1 }]),
  pettyCashController.addDistribution
);

// Section-level expense
router.post(
  "/section-expense",
  protect,
  s3UploadMiddleware([{ name: "proofOfExpense", maxCount: 1 }]),
  pettyCashController.addSectionExpense
);

// Helpers
router.get(
  "/projects/:projectId/sections",
  protect,
  pettyCashController.getProjectSections
);
router.get(
  "/projects/:projectId/accountants",
  protect,
  pettyCashController.getProjectAccountants
);

export default router;
