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
  resetPasswordWithOTP,
} from "../controllers/auth.controller";
import protect from "../middlewares/auth.middleware";

const router = express.Router();

// Authentication routes (no protection needed)
router.post("/register", protect,registerUser);
router.post("/login", loginUser);
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password-with-otp", resetPasswordWithOTP);

// Protected routes (require authentication)
router.post("/change-password", protect, changePassword);
router.get("/users", protect, getUsers);
router.get("/users/:id", protect, getUserById);
router.put("/users/:id", protect, updateUser);
router.delete("/users/:id", protect, deleteUser);
router.patch("/users/:id/activate", protect, activateUser);
router.patch("/users/:id/deactivate", protect, deactivateUser);

export default router;
