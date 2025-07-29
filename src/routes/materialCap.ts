import express from "express";
import {
  createSectionCaps,
  getSectionCaps,
  updateSectionCaps,
  getProjectCaps,
  getAllMaterialCaps,
} from "../controllers/materialCap.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

// Material Cap routes (all protected)
router.post("/section/:sectionId", protect, createSectionCaps);
router.get("/section/:sectionId", protect, getSectionCaps);
router.patch("/section/:sectionId", protect, updateSectionCaps);
router.get("/project/:projectId", protect, getProjectCaps);
router.get("/", protect, getAllMaterialCaps);

export default router;
