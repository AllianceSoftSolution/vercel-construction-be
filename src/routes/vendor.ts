import express from "express";
import {
  createVendor,
  getVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
  activateVendor,
  deactivateVendor,
  getVendorsWithAccounts,
} from "../controllers/vendor.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

// Vendor routes (all protected)
router.post("/", protect, createVendor);
router.get("/", protect, getVendors);
router.get("/:id", protect, getVendorById);
router.put("/:id", protect, updateVendor);
router.delete("/:id", protect, deleteVendor);
router.patch("/:id/activate", protect, activateVendor);
router.patch("/:id/deactivate", protect, deactivateVendor);

// Get all vendors with their account information
router.get('/with-accounts', protect, getVendorsWithAccounts);

export default router; 