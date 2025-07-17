import * as Prisma from "@prisma/client";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomPassword } from "../utils/helpers";
import { Email } from "../utils/email";
import { generateEmployeeId } from "../utils/generateCode";
import {
  extractQueryParams,
  buildQueryOptions,
  buildPaginationMeta,
} from "../utils/buildQueryOptions";
import { sendNotificationToUserSafe } from "../utils/notification";

const prisma = new Prisma.PrismaClient();

const registerUser = catchAsync(async (req, res, next) => {
  const { email, name, role, isHead = false } = req.body;

  // Check if user already exists
  const userCount = await prisma.user.count();
  let createdBy = null;
  if (userCount > 0) {
    if (!req.user || !req.user.id) {
      return next(new AppError("Authentication required", 401));
    }
    createdBy = req.user.id;
  }

  if (!email || !name || !role) {
    return next(new AppError("Email, name, and role are required", 400));
  }

  // Validate isHead field
  if (isHead) {
    // Only admins can create users with isHead: true
    if (!req.user || req.user.role !== "ADMIN") {
      return next(new AppError("Only admins can create head users", 403));
    }

    // isHead can only be true for ACCOUNTANT and STORE_INCHARGE roles
    if (role !== "ACCOUNTANT" && role !== "STORE_INCHARGE") {
      return next(
        new AppError(
          "isHead can only be set for ACCOUNTANT and STORE_INCHARGE roles",
          400
        )
      );
    }
  }

  // Check if user already exists by email
  const existingUser = await prisma.user.findFirst({
    where: { email },
  });

  if (existingUser) {
    return next(new AppError("User with this email already exists", 400));
  }

  // Generate employee ID automatically
  const employeeId = await generateEmployeeId(role);

  // Generate random password
  const generatedPassword = randomPassword(10);
  console.log(`Generated password for ${email}:`, generatedPassword);

  // Hash password
  const hashedPassword = await bcrypt.hash(generatedPassword, 12);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      employeeId,
      role,
      isHead,
      createdBy,
    },
    select: {
      id: true,
      email: true,
      name: true,
      employeeId: true,
      role: true,
      isHead: true,
      isActive: true,
      createdAt: true,
    },
  });

  // Send welcome email
  try {
    const emailer = new Email();
    await emailer.send({
      to: email,
      subject: "Welcome to Construction Management System",
      template: "welcome-email",
      data: { name, email, password: generatedPassword, employeeId },
    });
  } catch (err) {
    console.error("Failed to send welcome email:", err);
  }

  res.status(201).json({
    message: "User registered successfully",
    user,
  });
  await sendNotificationToUserSafe({
    userId: user.id,
    title: "Welcome!",
    body: `Your account has been created. Employee ID: ${user.employeeId}`,
  });
});

const loginUser = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError("Email and password are required", 400));
  }

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      password: true,
      name: true,
      employeeId: true,
      role: true,
      isHead: true,
      isActive: true,
      isDeleted: true,
    },
  });

  if (!user) {
    return next(new AppError("Invalid email or password", 401));
  }

  if (user.isDeleted) {
    return next(new AppError("User account has been deleted", 401));
  }

  if (!user.isActive) {
    return next(new AppError("User account is inactive", 401));
  }

  // Check password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return next(new AppError("Invalid email or password", 401));
  }

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET as string,
    { expiresIn: "90d" }
  );

  // Remove password from response
  const { password: _, ...userWithoutPassword } = user;

  const sessionData = {
    token,
    user: userWithoutPassword,
  };

  res.json({
    message: "Login successful",
    ...sessionData,
  });
});

const changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id; // Assuming the user is authenticated, and req.user is set

  // Find the user from the database
  const user = await prisma.user.findUnique({ where: { id: userId } });

  // If the user does not exist
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Compare the current password with the stored password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Incorrect current password" });
  }

  // Hash the new password
  const hashedNewPassword = await bcrypt.hash(newPassword, 10);

  // Update the user's password in the database
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedNewPassword },
  });

  // Respond with a success message
  return res.status(200).json({ message: "Password updated successfully" });
});

const getUsers = catchAsync(async (req, res) => {
  // Extract query parameters
  const filterOptions = extractQueryParams(req);

  // Define searchable fields for users
  const searchableFields = ["name", "email", "employeeId"];

  // Build default filters
  const defaultFilters = { isDeleted: false };

  // Build query options
  const queryOptions = buildQueryOptions(
    filterOptions,
    defaultFilters,
    searchableFields
  );

  // Get total count for pagination
  const total = await prisma.user.count({
    where: queryOptions.where,
  });

  // Get users with pagination
  const users = await prisma.user.findMany({
    ...queryOptions,
    select: {
      id: true,
      email: true,
      name: true,
      employeeId: true,
      role: true,
      isHead: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(
    total,
    filterOptions.page || 1,
    filterOptions.limit || 50
  );

  res.json({
    message: "Users retrieved successfully",
    users,
    ...paginationMeta,
  });
});

const getUserById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      employeeId: true,
      role: true,
      isHead: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      createdUsers: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  res.json({
    message: "User retrieved successfully",
    user,
  });
});

const updateUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = { ...req.body };
  const userId = req.user.id;

  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.createdAt;
  delete updates.createdBy;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("User not found", 404));
  }

  // Hash password if it's being updated
  if (updates.password) {
    updates.password = await bcrypt.hash(updates.password, 12);
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      ...updates,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      name: true,
      employeeId: true,
      role: true,
      isHead: true,
      isActive: true,
      updatedAt: true,
    },
  });

  res.json({
    message: "User updated successfully",
    user: updatedUser,
  });
  await sendNotificationToUserSafe({
    userId: updatedUser.id,
    title: "Profile Updated",
    body: `Your profile was updated successfully.`,
  });
});

const deleteUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("User not found", 404));
  }

  await prisma.user.update({
    where: { id },
    data: {
      isDeleted: true,
      isActive: false,
      updatedBy: userId,
      updatedAt: new Date(),
    },
  });

  res.json({
    message: "User deleted successfully",
  });
  await sendNotificationToUserSafe({
    userId: id,
    title: "Account Deleted",
    body: `Your account has been deleted.`,
  });
});

const activateUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("User not found", 404));
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      isActive: true,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      name: true,
      employeeId: true,
      role: true,
      isHead: true,
      isActive: true,
      updatedAt: true,
    },
  });

  res.json({
    message: "User activated successfully",
    user: updatedUser,
  });
  await sendNotificationToUserSafe({
    userId: updatedUser.id,
    title: "Account Activated",
    body: `Your account has been activated.`,
  });
});

const deactivateUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("User not found", 404));
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      isActive: false,
      updatedBy: userId,
      updatedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      name: true,
      employeeId: true,
      role: true,
      isHead: true,
      isActive: true,
      updatedAt: true,
    },
  });

  res.json({
    message: "User deactivated successfully",
    user: updatedUser,
  });
  await sendNotificationToUserSafe({
    userId: updatedUser.id,
    title: "Account Deactivated",
    body: `Your account has been deactivated.`,
  });
});

// Controller: Request password reset (send OTP to email)
const requestPasswordReset = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  if (!email) {
    return next(new AppError("Email is required", 400));
  }
  // Find user by email
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return next(new AppError("User not found", 404));
  }
  // Generate OTP (6 digits)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  // TODO: Store OTP in DB or cache with expiry (for now, just log it)
  console.log(`Generated OTP for ${email}:`, otp);
  // Send OTP email
  try {
    const emailer = new Email();
    await emailer.send({
      to: email,
      subject: "Password Reset OTP",
      template: "password-reset-otp",
      data: { name: user.name, otp },
    });
  } catch (err) {
    console.error("Failed to send OTP email:", err);
  }
  res.status(200).json({
    message: `OTP sent to ${email} (stub, implement email sending and OTP storage)`,
  });
});

// Controller: Reset password with OTP
const resetPasswordWithOTP = catchAsync(async (req, res, next) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return next(new AppError("Email, OTP, and new password are required", 400));
  }
  // TODO: Validate OTP for the email, then update password if valid
  // For now, just return a stub response and send success email
  // Find user by email
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    try {
      const emailer = new Email();
      await emailer.send({
        to: email,
        subject: "Password Reset Successful",
        template: "password-reset-success",
        data: { name: user.name },
      });
    } catch (err) {
      console.error("Failed to send password reset success email:", err);
    }
  }
  res.status(200).json({
    message: `Password reset for ${email} (stub, implement OTP validation and password update)`,
  });
});

// Save device token for notifications
export const saveDeviceToken = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const { token, platform } = req.body;
  if (!token || !platform) {
    return next(new AppError("Token and platform are required", 400));
  }
  // Upsert device token
  await prisma.deviceToken.upsert({
    where: { token },
    update: { platform, userId },
    create: { token, platform, userId },
  });
  res.json({ message: "Device token saved" });
});

// Remove device token (e.g., on logout)
export const removeDeviceToken = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const { token } = req.body;
  if (!token) {
    return next(new AppError("Token is required", 400));
  }
  await prisma.deviceToken.deleteMany({ where: { token, userId } });
  res.json({ message: "Device token removed" });
});

export {
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
};
