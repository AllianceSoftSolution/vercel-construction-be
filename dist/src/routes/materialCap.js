"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const materialCap_controller_1 = require("../controllers/materialCap.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
router.post("/section/:sectionId", auth_middleware_1.default, materialCap_controller_1.createSectionCaps);
router.get("/section/:sectionId", auth_middleware_1.default, materialCap_controller_1.getSectionCaps);
router.patch("/section/:sectionId", auth_middleware_1.default, materialCap_controller_1.updateSectionCaps);
router.get("/project/:projectId", auth_middleware_1.default, materialCap_controller_1.getProjectCaps);
router.get("/", auth_middleware_1.default, materialCap_controller_1.getAllMaterialCaps);
exports.default = router;
//# sourceMappingURL=materialCap.js.map