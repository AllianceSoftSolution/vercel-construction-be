import express from "express";
import {
  createSiteInchargeAssignment,
  getSiteInchargeAssignments,
  createProjectManagerAssignment,
  getProjectManagerAssignments,
  createConstructionManagerAssignment,
  getConstructionManagerAssignments,
  createStoreInchargeAssignment,
  getStoreInchargeAssignments,
  createAccountantAssignment,
  getAccountantAssignments,
  deactivateAssignment,
  createAndAssignProjectManager,
  getUsersByRoleForAssignment,
  getSectionsWithSiteInchargeAssignmentStatus,
  getSectionsWithAccountantAssignmentStatus,
} from "../controllers/assignment.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

// Site Incharge Assignment routes (all protected)
router.post("/site-incharge", protect, createSiteInchargeAssignment);
router.get("/site-incharge", protect, getSiteInchargeAssignments);
router.get("/site-incharge/sections-with-status", protect, getSectionsWithSiteInchargeAssignmentStatus);

// Project Manager Assignment routes (all protected)
router.post("/project-manager", protect, createProjectManagerAssignment);
router.get("/project-manager", protect, getProjectManagerAssignments);

// Construction Manager Assignment routes (all protected)
router.post("/construction-manager", protect, createConstructionManagerAssignment);
router.get("/construction-manager", protect, getConstructionManagerAssignments);

// Store Incharge Assignment routes (all protected)
router.post("/store-incharge", protect, createStoreInchargeAssignment);
router.get("/store-incharge", protect, getStoreInchargeAssignments);

// Accountant Assignment routes (all protected)
router.post("/accountant", protect, createAccountantAssignment);
router.get("/accountant", protect, getAccountantAssignments);
router.get("/accountant/sections-with-status", protect, getSectionsWithAccountantAssignmentStatus);

// Generic deactivation route (protected)
router.patch("/:type/:id/deactivate", protect, deactivateAssignment);

// Create and assign a new Project Manager
router.post("/project-manager/create-and-assign", protect, createAndAssignProjectManager);

// List users by role for assignment (with projectId logic)
router.get("/users-by-role", protect, getUsersByRoleForAssignment);

export default router; 