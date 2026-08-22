"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const purchaseOrder_controller_1 = require("../controllers/purchaseOrder.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const s3UploadMiddleware_1 = require("../middlewares/s3UploadMiddleware");
const router = express_1.default.Router();
router.post("/", auth_middleware_1.default, purchaseOrder_controller_1.createPurchaseOrder);
router.get("/", auth_middleware_1.default, purchaseOrder_controller_1.getPurchaseOrders);
router.get("/summary", auth_middleware_1.default, purchaseOrder_controller_1.getPurchaseOrderSummary);
router.get("/vendor", auth_middleware_1.default, purchaseOrder_controller_1.getPurchaseOrdersByVendor);
router.get("/demand/:demandId/statistics", auth_middleware_1.default, purchaseOrder_controller_1.getDemandPOStatistics);
router.get("/:id/pdf", auth_middleware_1.default, purchaseOrder_controller_1.downloadPurchaseOrderPdf);
router.get("/:id", auth_middleware_1.default, purchaseOrder_controller_1.getPurchaseOrder);
router.put("/:id", auth_middleware_1.default, purchaseOrder_controller_1.updatePurchaseOrder);
router.patch("/:id/status", auth_middleware_1.default, purchaseOrder_controller_1.updatePOStatus);
router.patch("/:id/amount", auth_middleware_1.default, (0, s3UploadMiddleware_1.s3UploadMiddleware)([{ name: "proofOfBill", maxCount: 1 }]), purchaseOrder_controller_1.addPOAmount);
router.put("/:id/amount", auth_middleware_1.default, (0, s3UploadMiddleware_1.s3UploadMiddleware)([{ name: "proofOfBill", maxCount: 1 }]), purchaseOrder_controller_1.updatePOAmount);
router.delete("/:id", auth_middleware_1.default, purchaseOrder_controller_1.deletePurchaseOrder);
exports.default = router;
//# sourceMappingURL=purchaseOrder.js.map