import express from "express";
import {
  createSection,
  getSections,
  getSectionById,
  updateSection,
  deleteSection,
  activateSection,
  deactivateSection,
} from "../controllers/section.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

// Section routes (all protected)
router.post("/", protect, createSection);
router.get("/", protect, getSections);
router.get("/:id", protect, getSectionById);
router.put("/:id", protect, updateSection);
router.delete("/:id", protect, deleteSection);
router.patch("/:id/activate", protect, activateSection);
router.patch("/:id/deactivate", protect, deactivateSection);

export default router; 