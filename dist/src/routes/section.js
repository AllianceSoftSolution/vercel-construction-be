"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const section_controller_1 = require("../controllers/section.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
router.post("/", auth_middleware_1.default, section_controller_1.createSection);
router.get("/", auth_middleware_1.default, section_controller_1.getSections);
router.get("/:id", auth_middleware_1.default, section_controller_1.getSectionById);
router.put("/:id", auth_middleware_1.default, section_controller_1.updateSection);
router.delete("/:id", auth_middleware_1.default, section_controller_1.deleteSection);
router.patch("/:id/activate", auth_middleware_1.default, section_controller_1.activateSection);
router.patch("/:id/deactivate", auth_middleware_1.default, section_controller_1.deactivateSection);
exports.default = router;
//# sourceMappingURL=section.js.map