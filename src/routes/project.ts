import express from "express";
import {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  activateProject,
  deactivateProject,
} from "../controllers/project.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

// Project routes (all protected)
router.post("/", protect, createProject);
router.get("/", protect, getProjects);
router.get("/:id", protect, getProjectById);
router.put("/:id", protect, updateProject);
router.delete("/:id", protect, deleteProject);
router.patch("/:id/activate", protect, activateProject);
router.patch("/:id/deactivate", protect, deactivateProject);

export default router; 