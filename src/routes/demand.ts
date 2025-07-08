import express from "express";
import {
  createDemand,
  getDemands,
  getDemandById,
  updateDemand,
  deleteDemand,
  updateDemandStatus,
  approveDemand,
  rejectDemand,
  fulfillDemand,
} from "../controllers/demand.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

// Demand routes (all protected)
router.post("/", protect, createDemand);
router.get("/", protect, getDemands);
router.get("/:id", protect, getDemandById);
router.put("/:id", protect, updateDemand);
router.delete("/:id", protect, deleteDemand);
router.patch("/:id/status", protect, updateDemandStatus);

// Demand approval and fulfillment routes
router.post("/:id/approve", protect, approveDemand);
router.post("/:id/reject", protect, rejectDemand);
router.post("/:id/fulfill", protect, fulfillDemand);

export default router; 