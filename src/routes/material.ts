import express from "express";
import {
  createMaterial,
  getMaterials,
  getMaterialById,
  updateMaterial,
  deleteMaterial,
  activateMaterial,
  deactivateMaterial,
} from "../controllers/material.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

// Material routes (all protected)
router.post("/", protect, createMaterial);
router.get("/", protect, getMaterials);
router.get("/:id", protect, getMaterialById);
router.put("/:id", protect, updateMaterial);
router.delete("/:id", protect, deleteMaterial);
router.patch("/:id/activate", protect, activateMaterial);
router.patch("/:id/deactivate", protect, deactivateMaterial);

export default router; 