import express from "express";
import {
  registerUser,
  loginUser,
  changePassword,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  activateUser,
  deactivateUser,
  requestPasswordReset,
  verifyOTPAndGenerateToken,
  resetPasswordWithToken,
  saveDeviceToken,
  removeDeviceToken,
  changeUserRole,
} from "../controllers/auth.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

// Authentication routes (no protection needed)
router.post("/register", protect, registerUser);
router.post("/login", loginUser);
router.post("/request-password-reset", requestPasswordReset);
router.post("/verify-otp", verifyOTPAndGenerateToken);
router.post("/reset-password/:resetToken", resetPasswordWithToken);

// Protected routes (require authentication)
router.post("/change-password", protect, changePassword);
router.post("/device-token", protect, saveDeviceToken);
router.delete("/device-token", protect, removeDeviceToken);
router.get("/users", protect, getUsers);
router.get("/users/:id", protect, getUserById);
router.put("/users/:id", protect, updateUser);
router.delete("/users/:id", protect, deleteUser);
router.patch("/users/:id/activate", protect, activateUser);
router.patch("/users/:id/deactivate", protect, deactivateUser);
router.patch("/users/:id/change-role", protect, changeUserRole);

export default router;
