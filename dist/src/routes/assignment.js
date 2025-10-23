"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const assignment_controller_1 = require("../controllers/assignment.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
router.post("/site-incharge", auth_middleware_1.default, assignment_controller_1.createSiteInchargeAssignment);
router.get("/site-incharge", auth_middleware_1.default, assignment_controller_1.getSiteInchargeAssignments);
router.get("/site-incharge/sections-with-status", auth_middleware_1.default, assignment_controller_1.getSectionsWithSiteInchargeAssignmentStatus);
router.post("/project-manager", auth_middleware_1.default, assignment_controller_1.createProjectManagerAssignment);
router.get("/project-manager", auth_middleware_1.default, assignment_controller_1.getProjectManagerAssignments);
router.post("/construction-manager", auth_middleware_1.default, assignment_controller_1.createConstructionManagerAssignment);
router.get("/construction-manager", auth_middleware_1.default, assignment_controller_1.getConstructionManagerAssignments);
router.post("/store-incharge", auth_middleware_1.default, assignment_controller_1.createStoreInchargeAssignment);
router.get("/store-incharge", auth_middleware_1.default, assignment_controller_1.getStoreInchargeAssignments);
router.post("/accountant", auth_middleware_1.default, assignment_controller_1.createAccountantAssignment);
router.get("/accountant", auth_middleware_1.default, assignment_controller_1.getAccountantAssignments);
router.get("/accountant/sections-with-status", auth_middleware_1.default, assignment_controller_1.getSectionsWithAccountantAssignmentStatus);
router.patch("/:type/:id/deactivate", auth_middleware_1.default, assignment_controller_1.deactivateAssignment);
router.post("/project-manager/create-and-assign", auth_middleware_1.default, assignment_controller_1.createAndAssignProjectManager);
router.get("/users-by-role", auth_middleware_1.default, assignment_controller_1.getUsersByRoleForAssignment);
exports.default = router;
//# sourceMappingURL=assignment.js.map