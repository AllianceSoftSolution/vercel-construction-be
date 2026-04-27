import express from "express";
import {
  createStore,
  getStores,
  getStoreById,
  updateStore,
  deleteStore,
  activateStore,
  deactivateStore,
  stockIn,
  stockOut,
  getStoreInventory,
  getStoreTransactions,
  getProjectInventory,
  assignPersonnel,
  removePersonnel,
  assignSiteIncharge,
  assignProjectManager,
  getStorePermissions,
  setStorePermissions,
  deleteStorePermission,
  cleanupEmptySectionStores,
} from "../controllers/store.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

const adminOnly = (req: any, res: any, next: any) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({
      status: "error",
      message: "Only Admin can perform this action",
    });
  }
  next();
};

// Store routes (all protected)
router.post("/", protect, adminOnly, createStore);
router.get("/", protect, getStores);
router.get("/:id", protect, getStoreById);
router.put("/:id", protect, adminOnly, updateStore);
router.delete("/:id", protect, adminOnly, deleteStore);
router.patch("/:id/activate", protect, adminOnly, activateStore);
router.patch("/:id/deactivate", protect, adminOnly, deactivateStore);

// Personnel assignment routes
router.patch("/:storeId/assign", protect, adminOnly, assignPersonnel);
router.delete("/:storeId/assign", protect, adminOnly, removePersonnel);
router.post("/:storeId/assign-site-incharge", protect, adminOnly, assignSiteIncharge);
router.post("/:storeId/assign-project-manager", protect, adminOnly, assignProjectManager);

// Stock management routes
router.post("/:storeId/stock-in", protect, stockIn);
router.post("/:storeId/stock-out", protect, stockOut);
router.get("/:storeId/inventory", protect, getStoreInventory);
router.get("/:storeId/transactions", protect, getStoreTransactions);

// Project inventory route
router.get("/project/:projectId/inventory", protect, getProjectInventory);

// Store permissions routes
router.get("/:storeId/permissions", protect, adminOnly, getStorePermissions);
router.put("/:storeId/permissions", protect, adminOnly, setStorePermissions);
router.delete("/:storeId/permissions/:userId", protect, adminOnly, deleteStorePermission);

// One-time cleanup: delete empty auto-created section stores
router.delete("/cleanup/empty-section-stores", protect, adminOnly, cleanupEmptySectionStores);

export default router;
