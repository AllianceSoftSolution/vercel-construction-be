"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const material_controller_1 = require("../controllers/material.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
router.post("/", auth_middleware_1.default, material_controller_1.createMaterial);
router.get("/", auth_middleware_1.default, material_controller_1.getMaterials);
router.get("/:id", auth_middleware_1.default, material_controller_1.getMaterialById);
router.put("/:id", auth_middleware_1.default, material_controller_1.updateMaterial);
router.delete("/:id", auth_middleware_1.default, material_controller_1.deleteMaterial);
router.patch("/:id/activate", auth_middleware_1.default, material_controller_1.activateMaterial);
router.patch("/:id/deactivate", auth_middleware_1.default, material_controller_1.deactivateMaterial);
exports.default = router;
//# sourceMappingURL=material.js.map