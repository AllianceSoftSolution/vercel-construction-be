"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const vendor_controller_1 = require("../controllers/vendor.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
router.post("/", auth_middleware_1.default, vendor_controller_1.createVendor);
router.get("/", auth_middleware_1.default, vendor_controller_1.getVendors);
router.get("/:id", auth_middleware_1.default, vendor_controller_1.getVendorById);
router.put("/:id", auth_middleware_1.default, vendor_controller_1.updateVendor);
router.delete("/:id", auth_middleware_1.default, vendor_controller_1.deleteVendor);
router.patch("/:id/activate", auth_middleware_1.default, vendor_controller_1.activateVendor);
router.patch("/:id/deactivate", auth_middleware_1.default, vendor_controller_1.deactivateVendor);
router.get('/with-accounts', auth_middleware_1.default, vendor_controller_1.getVendorsWithAccounts);
exports.default = router;
//# sourceMappingURL=vendor.js.map