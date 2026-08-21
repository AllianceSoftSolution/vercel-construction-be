import express from "express";
// import protect from "../middlewares/auth.middleware";
const router = express.Router();

import authRoutes from "./auth";
import projectRoutes from "./project";
import sectionRoutes from "./section";
import storeRoutes from "./store";
import materialRoutes from "./material";
import materialCapRoutes from "./materialCap";
import vendorRoutes from "./vendor";
import demandRoutes from "./demand";
import assignmentRoutes from "./assignment";
import vendorAccountRoutes from "./vendorAccount";
import purchaseOrderRoutes from "./purchaseOrder";
import analyticsRoutes from "./analytics";
import pettyCashRoutes from "./pettyCash";
import fileUploadRoutes from "./fileUpload";

// Authentication and user management
router.use("/auth", authRoutes);

// Construction management routes
router.use("/projects", projectRoutes);
router.use("/sections", sectionRoutes);
router.use("/stores", storeRoutes);
router.use("/materials", materialRoutes);
router.use("/material-caps", materialCapRoutes);
router.use("/vendors", vendorRoutes);
router.use("/demands", demandRoutes);
router.use("/assignments", assignmentRoutes);
router.use("/purchase-orders", purchaseOrderRoutes);

// Finance management routes
router.use("/vendor-account", vendorAccountRoutes);
router.use("/petty-cash", pettyCashRoutes);

// Analytics and dashboard routes
router.use("/analytics", analyticsRoutes);

// Direct S3 uploads (presigned URLs)
router.use("/files", fileUploadRoutes);

export default router;
