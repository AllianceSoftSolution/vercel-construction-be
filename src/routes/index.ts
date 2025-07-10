import express from "express";
// import protect from "../middlewares/auth.middleware";
const router = express.Router();

import authRoutes from "./auth";
import projectRoutes from "./project";
import sectionRoutes from "./section";
import storeRoutes from "./store";
import materialRoutes from "./material";
import vendorRoutes from "./vendor";
import demandRoutes from "./demand";
import assignmentRoutes from "./assignment";
import vendorAccountRoutes from "./vendorAccount";
import purchaseOrderRoutes from "./purchaseOrder";

// Authentication and user management
router.use("/auth", authRoutes);

// Construction management routes
router.use("/projects", projectRoutes);
router.use("/sections", sectionRoutes);
router.use("/stores", storeRoutes);
router.use("/materials", materialRoutes);
router.use("/vendors", vendorRoutes);
router.use("/demands", demandRoutes);
router.use("/assignments", assignmentRoutes);
router.use("/purchase-orders", purchaseOrderRoutes);

// Finance management routes
router.use("/vendor-account", vendorAccountRoutes);

export default router;
