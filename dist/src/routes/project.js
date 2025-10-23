"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const project_controller_1 = require("../controllers/project.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
router.post("/", auth_middleware_1.default, project_controller_1.createProject);
router.get("/", auth_middleware_1.default, project_controller_1.getProjects);
router.get("/:id", auth_middleware_1.default, project_controller_1.getProjectById);
router.put("/:id", auth_middleware_1.default, project_controller_1.updateProject);
router.delete("/:id", auth_middleware_1.default, project_controller_1.deleteProject);
router.patch("/:id/activate", auth_middleware_1.default, project_controller_1.activateProject);
router.patch("/:id/deactivate", auth_middleware_1.default, project_controller_1.deactivateProject);
exports.default = router;
//# sourceMappingURL=project.js.map