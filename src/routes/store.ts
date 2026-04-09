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
} from "../controllers/store.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

// Store routes (all protected)
router.post("/", protect, createStore);
router.get("/", protect, getStores);
router.get("/:id", protect, getStoreById);
router.put("/:id", protect, updateStore);
router.delete("/:id", protect, deleteStore);
router.patch("/:id/activate", protect, activateStore);
router.patch("/:id/deactivate", protect, deactivateStore);

// Personnel assignment routes
router.patch("/:storeId/assign", protect, assignPersonnel);
router.delete("/:storeId/assign", protect, removePersonnel);

// Stock management routes
router.post("/:storeId/stock-in", protect, stockIn);
router.post("/:storeId/stock-out", protect, stockOut);
router.get("/:storeId/inventory", protect, getStoreInventory);
router.get("/:storeId/transactions", protect, getStoreTransactions);

// Project inventory route
router.get("/project/:projectId/inventory", protect, getProjectInventory);

export default router;
