import express from "express";
import {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrder,
  downloadPurchaseOrderPdf,
  updatePurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrdersByVendor,
  getPurchaseOrderSummary,
  getDemandPOStatistics,
  updatePOStatus,
  addPOAmount,
  updatePOAmount,
} from "../controllers/purchaseOrder.controller";
import protect from "../middlewares/auth.middleware";
import { s3UploadMiddleware } from "../middlewares/s3UploadMiddleware";

const router = express.Router();

// Purchase Order routes (all protected)
router.post("/", protect, createPurchaseOrder);
router.get("/", protect, getPurchaseOrders);
router.get("/summary", protect, getPurchaseOrderSummary);
router.get("/vendor", protect, getPurchaseOrdersByVendor);
router.get("/demand/:demandId/statistics", protect, getDemandPOStatistics);
router.get("/:id/pdf", protect, downloadPurchaseOrderPdf);
router.get("/:id", protect, getPurchaseOrder);
router.put("/:id", protect, updatePurchaseOrder);
router.patch("/:id/status", protect, updatePOStatus);
router.patch(
  "/:id/amount",
  protect,
  s3UploadMiddleware([{ name: "proofOfBill", maxCount: 1 }]),
  addPOAmount
);
router.put(
  "/:id/amount",
  protect,
  s3UploadMiddleware([{ name: "proofOfBill", maxCount: 1 }]),
  updatePOAmount
);
router.delete("/:id", protect, deletePurchaseOrder);

export default router;
