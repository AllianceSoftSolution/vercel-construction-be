import express from "express";
import * as analyticsController from "../controllers/analytics.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// Generic dashboard analytics (automatically routes to role-specific dashboard)
router.get("/dashboard", analyticsController.getDashboardAnalytics);

// Role-specific dashboard endpoints
router.get("/admin/dashboard", analyticsController.getAdminDashboard);
router.get(
  "/site-incharge/dashboard",
  analyticsController.getSiteInchargeDashboard
);
router.get(
  "/project-manager/dashboard",
  analyticsController.getProjectManagerDashboard
);
router.get(
  "/construction-manager/dashboard",
  analyticsController.getConstructionManagerDashboard
);
router.get(
  "/store-incharge/dashboard",
  analyticsController.getStoreInchargeDashboard
);
router.get("/accountant/dashboard", analyticsController.getAccountantDashboard);

export default router;
