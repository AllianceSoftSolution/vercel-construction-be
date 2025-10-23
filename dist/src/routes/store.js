"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const store_controller_1 = require("../controllers/store.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
router.post("/", auth_middleware_1.default, store_controller_1.createStore);
router.get("/", auth_middleware_1.default, store_controller_1.getStores);
router.get("/:id", auth_middleware_1.default, store_controller_1.getStoreById);
router.put("/:id", auth_middleware_1.default, store_controller_1.updateStore);
router.delete("/:id", auth_middleware_1.default, store_controller_1.deleteStore);
router.patch("/:id/activate", auth_middleware_1.default, store_controller_1.activateStore);
router.patch("/:id/deactivate", auth_middleware_1.default, store_controller_1.deactivateStore);
router.post("/:storeId/stock-in", auth_middleware_1.default, store_controller_1.stockIn);
router.post("/:storeId/stock-out", auth_middleware_1.default, store_controller_1.stockOut);
router.get("/:storeId/inventory", auth_middleware_1.default, store_controller_1.getStoreInventory);
router.get("/:storeId/transactions", auth_middleware_1.default, store_controller_1.getStoreTransactions);
router.get("/project/:projectId/inventory", auth_middleware_1.default, store_controller_1.getProjectInventory);
exports.default = router;
//# sourceMappingURL=store.js.map