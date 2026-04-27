"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const store_controller_1 = require("../controllers/store.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== "ADMIN") {
        return res.status(403).json({
            status: "error",
            message: "Only Admin can perform this action",
        });
    }
    next();
};
router.post("/", auth_middleware_1.default, adminOnly, store_controller_1.createStore);
router.get("/", auth_middleware_1.default, store_controller_1.getStores);
router.get("/:id", auth_middleware_1.default, store_controller_1.getStoreById);
router.put("/:id", auth_middleware_1.default, adminOnly, store_controller_1.updateStore);
router.delete("/:id", auth_middleware_1.default, adminOnly, store_controller_1.deleteStore);
router.patch("/:id/activate", auth_middleware_1.default, adminOnly, store_controller_1.activateStore);
router.patch("/:id/deactivate", auth_middleware_1.default, adminOnly, store_controller_1.deactivateStore);
router.patch("/:storeId/assign", auth_middleware_1.default, adminOnly, store_controller_1.assignPersonnel);
router.delete("/:storeId/assign", auth_middleware_1.default, adminOnly, store_controller_1.removePersonnel);
router.post("/:storeId/assign-site-incharge", auth_middleware_1.default, adminOnly, store_controller_1.assignSiteIncharge);
router.post("/:storeId/assign-project-manager", auth_middleware_1.default, adminOnly, store_controller_1.assignProjectManager);
router.post("/:storeId/stock-in", auth_middleware_1.default, store_controller_1.stockIn);
router.post("/:storeId/stock-out", auth_middleware_1.default, store_controller_1.stockOut);
router.get("/:storeId/inventory", auth_middleware_1.default, store_controller_1.getStoreInventory);
router.get("/:storeId/transactions", auth_middleware_1.default, store_controller_1.getStoreTransactions);
router.get("/project/:projectId/inventory", auth_middleware_1.default, store_controller_1.getProjectInventory);
router.get("/:storeId/permissions", auth_middleware_1.default, adminOnly, store_controller_1.getStorePermissions);
router.put("/:storeId/permissions", auth_middleware_1.default, adminOnly, store_controller_1.setStorePermissions);
router.delete("/:storeId/permissions/:userId", auth_middleware_1.default, adminOnly, store_controller_1.deleteStorePermission);
exports.default = router;
//# sourceMappingURL=store.js.map