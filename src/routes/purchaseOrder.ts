import express from "express";
import {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrdersByVendor,
  getPurchaseOrderSummary,
  getDemandPOStatistics,
  updatePOStatus,
  addPOAmount,
} from "../controllers/purchaseOrder.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

// Purchase Order routes (all protected)
router.post("/", protect, createPurchaseOrder);
router.get("/", protect, getPurchaseOrders);
router.get("/summary", protect, getPurchaseOrderSummary);
router.get("/vendor", protect, getPurchaseOrdersByVendor);
router.get("/demand/:demandId/statistics", protect, getDemandPOStatistics);
router.get("/:id", protect, getPurchaseOrder);
router.put("/:id", protect, updatePurchaseOrder);
router.patch("/:id/status", protect, updatePOStatus);
router.patch("/:id/amount", protect, addPOAmount);
router.delete("/:id", protect, deletePurchaseOrder);

export default router;
