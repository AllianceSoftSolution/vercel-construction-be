"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
router.post("/register", auth_middleware_1.default, auth_controller_1.registerUser);
router.post("/login", auth_controller_1.loginUser);
router.post("/request-password-reset", auth_controller_1.requestPasswordReset);
router.post("/verify-otp", auth_controller_1.verifyOTPAndGenerateToken);
router.post("/reset-password/:resetToken", auth_controller_1.resetPasswordWithToken);
router.post("/change-password", auth_middleware_1.default, auth_controller_1.changePassword);
router.post("/device-token", auth_middleware_1.default, auth_controller_1.saveDeviceToken);
router.delete("/device-token", auth_middleware_1.default, auth_controller_1.removeDeviceToken);
router.get("/users", auth_middleware_1.default, auth_controller_1.getUsers);
router.get("/users/:id", auth_middleware_1.default, auth_controller_1.getUserById);
router.put("/users/:id", auth_middleware_1.default, auth_controller_1.updateUser);
router.delete("/users/:id", auth_middleware_1.default, auth_controller_1.deleteUser);
router.patch("/users/:id/activate", auth_middleware_1.default, auth_controller_1.activateUser);
router.patch("/users/:id/deactivate", auth_middleware_1.default, auth_controller_1.deactivateUser);
router.patch("/users/:id/change-role", auth_middleware_1.default, auth_controller_1.changeUserRole);
exports.default = router;
//# sourceMappingURL=auth.js.map