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
import {
  generateOTP,
  validateOTPFormat,
  isOTPValid,
  incrementOTPAttempts,
  setupOTPCleanup,
  storeOTP,
  markOTPAsUsed,
} from "../utils/otpUtils";
import { validatePasswordStrength } from "../utils/passwordUtils";
import { TRANSACTION_REFERENCES } from "../constants";

import prisma from "../utils/prisma";

const resolveHeadAccountantProjectIds = async (
  isHeadOffice: boolean,
  projectIds?: unknown
) => {
  if (isHeadOffice) {
    const projects = await prisma.project.findMany({
      where: { isDeleted: false, isActive: true },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }
  return Array.isArray(projectIds) ? (projectIds as string[]) : [];
};

setupOTPCleanup();

const registerUser = catchAsync(async (req, res, next) => {
  const {
    email,
    name,
    role,
    isHead = false,
    isHeadOffice = false,
    notes,
    projectIds,
  } = req.body;

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

    // Head Accountant or Head Store Incharge must be assigned to at least one project at creation time
    if (role === "ACCOUNTANT" || role === "STORE_INCHARGE") {
      const resolvedIds =
        role === "ACCOUNTANT"
          ? await resolveHeadAccountantProjectIds(!!isHeadOffice, projectIds)
          : Array.isArray(projectIds)
            ? projectIds
            : [];
      if (resolvedIds.length === 0) {
        return next(
          new AppError(
            role === "ACCOUNTANT"
              ? "Select one or more projects for a Project Accountant, or mark the user as Head Office Accountant."
              : "projectIds[] is required when creating a Head Store Incharge. Assign at least one project.",
            400
          )
        );
      }
      req.body.projectIds = resolvedIds;
    }
  }

  const assignedProjectIds: string[] = Array.isArray(req.body.projectIds)
    ? req.body.projectIds
    : [];

  // Check if user already exists by email
  const existingUser = await prisma.user.findFirst({
    where: { email },
  });

  if (existingUser) {
    // Special case: assigning an existing user as Head Accountant to new projects.
    if (isHead && role === "ACCOUNTANT" && assignedProjectIds.length > 0) {
      const updatedUser = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: existingUser.id },
          data: { role: "ACCOUNTANT", isHead: true },
          select: {
            id: true, email: true, name: true, employeeId: true,
            role: true, isHead: true, isActive: true, createdAt: true, notes: true,
          },
        });
        await tx.accountantAssignment.createMany({
          data: assignedProjectIds.map((pid: string) => ({
            userId: existingUser.id, projectId: pid, sectionId: null,
            isActive: true, createdBy: createdBy ?? existingUser.id,
          })),
          skipDuplicates: true,
        });
        return updated;
      });
      return res.status(200).json({
        message: "Existing user updated and assigned as Head Accountant successfully",
        user: updatedUser,
      });
    }

    // Special case: assigning an existing user as Head Store Incharge to new projects.
    if (isHead && role === "STORE_INCHARGE" && assignedProjectIds.length > 0) {
      const updatedUser = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: existingUser.id },
          data: { role: "STORE_INCHARGE", isHead: true },
          select: {
            id: true, email: true, name: true, employeeId: true,
            role: true, isHead: true, isActive: true, createdAt: true, notes: true,
          },
        });
        await tx.headStoreInchargeAssignment.createMany({
          data: assignedProjectIds.map((pid: string) => ({
            userId: existingUser.id, projectId: pid,
            isActive: true, createdBy: createdBy ?? existingUser.id,
          })),
          skipDuplicates: true,
        });
        return updated;
      });
      return res.status(200).json({
        message: "Existing user updated and assigned as Head Store Incharge successfully",
        user: updatedUser,
      });
    }

    return next(new AppError("User with this email already exists", 400));
  }

  // Generate employee ID automatically
  const employeeId = await generateEmployeeId(role);

  // Generate random password
  const generatedPassword = randomPassword(10);
  console.log(`Generated password for ${email}:`, generatedPassword);

  // Hash password
  const hashedPassword = await bcrypt.hash(generatedPassword, 12);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        employeeId,
        role,
        isHead,
        createdBy,
        ...(notes && { notes }),
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
        notes: true,
      },
    });

    // For Head Accountant: create project-level (sectionId = null) assignments
    if (isHead && role === "ACCOUNTANT" && assignedProjectIds.length) {
      await tx.accountantAssignment.createMany({
        data: assignedProjectIds.map((pid: string) => ({
          userId: created.id,
          projectId: pid,
          sectionId: null,
          isActive: true,
          createdBy: createdBy ?? created.id,
        })),
        skipDuplicates: true,
      });
    }

    // For Head Store Incharge: create project-level assignments
    if (isHead && role === "STORE_INCHARGE" && assignedProjectIds.length) {
      await tx.headStoreInchargeAssignment.createMany({
        data: assignedProjectIds.map((pid: string) => ({
          userId: created.id,
          projectId: pid,
          isActive: true,
          createdBy: createdBy ?? created.id,
        })),
        skipDuplicates: true,
      });
    }

    return created;
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

  // Validate new password strength
  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.isValid) {
    return next(
      new AppError(
        `Password validation failed: ${passwordValidation.errors.join(", ")}`,
        400
      )
    );
  }

  // Hash the new password
  const hashedNewPassword = await bcrypt.hash(newPassword, 12);

  // Update the user's password in the database
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedNewPassword,
      updatedAt: new Date(),
    },
  });

  // Respond with a success message
  return res.status(200).json({ message: "Password updated successfully" });
});

const getUsers = catchAsync(async (req, res) => {
  const user = req.user;

  // Extract query parameters
  const filterOptions = extractQueryParams(req);

  // Define searchable fields for users
  const searchableFields = ["name", "email", "employeeId"];

  // Build default filters
  const defaultFilters = { isDeleted: false };

  // Role-based filtering for users
  let userFilter: { isDeleted: boolean; id?: { in: string[] } } = {
    ...defaultFilters,
  };

  if (user.role === "ADMIN") {
    // Admin can see all users
  } else if (user.role === "SITE_INCHARGE") {
    // Site Incharge can only see users assigned to their sections
    const assignments = await prisma.siteInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);

    // Get users assigned to these sections
    const sectionUsers = await prisma.user.findMany({
      where: {
        OR: [
          {
            siteInchargeAssignments: {
              some: { sectionId: { in: sectionIds } },
            },
          },
          {
            projectManagerAssignments: {
              some: { sectionId: { in: sectionIds } },
            },
          },
          {
            constructionManagerAssignments: {
              some: { sectionId: { in: sectionIds } },
            },
          },
          {
            accountantAssignments: { some: { sectionId: { in: sectionIds } } },
          },
          {
            storeInchargeAssignments: {
              some: { store: { sectionId: { in: sectionIds } } },
            },
          },
        ],
      },
      select: { id: true },
    });

    userFilter.id = { in: sectionUsers.map((u) => u.id) };
  } else if (user.role === "PROJECT_MANAGER") {
    // Project Manager can only see Construction Managers in their sections
    const assignments = await prisma.projectManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true },
    });
    const sectionIds = assignments.map((a) => a.sectionId);

    const sectionCMs = await prisma.user.findMany({
      where: {
        role: "CONSTRUCTION_MANAGER",
        isDeleted: false,
        constructionManagerAssignments: {
          some: { sectionId: { in: sectionIds } },
        },
      },
      select: { id: true },
    });

    userFilter.id = { in: sectionCMs.map((u) => u.id) };
  } else {
    // CM, Store Incharge, Accountant cannot see other users
    return res.json({
      message: "Users retrieved successfully",
      users: [],
      userAnalytics: {
        totalUsers: 0,
        usersByRole: {},
        roleBreakdown: {},
      },
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    });
  }

  // Build query options
  const queryOptions = buildQueryOptions(
    filterOptions,
    userFilter,
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

  // Calculate user analytics by role using a simpler approach
  const usersByRole: { [key: string]: any[] } = {};
  const roleBreakdown: { [key: string]: number } = {};

  users.forEach((user) => {
    const role = user.role;
    const roleKey = typeof role === "string" ? role : String(role);
    if (!usersByRole[roleKey]) {
      usersByRole[roleKey] = [];
    }
    usersByRole[roleKey].push(user);
  });

  // Calculate role breakdown
  Object.keys(usersByRole).forEach((role) => {
    roleBreakdown[role] = usersByRole[role].length;
  });

  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(
    total,
    filterOptions.page || 1,
    filterOptions.limit || 50
  );

  return res.json({
    message: "Users retrieved successfully",
    users,
    userAnalytics: {
      totalUsers: total,
      usersByRole,
      roleBreakdown,
    },
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
      accountantAssignments: {
        where: { isActive: true },
        select: { projectId: true, sectionId: true },
      },
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

  // Only allow notes if provided
  const updateData = { ...updates };
  if (typeof updates.notes === "undefined") {
    delete updateData.notes;
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      ...updateData,
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
      notes: true,
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

  if (user.isDeleted) {
    return next(new AppError("User account has been deleted", 404));
  }

  if (!user.isActive) {
    return next(new AppError("User account is inactive", 400));
  }

  // Generate OTP (6 digits)
  const otp = generateOTP();

  // Store OTP in database with 15 minutes expiry
  await storeOTP(email, otp, 15);

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
    return next(new AppError("Failed to send OTP email", 500));
  }

  res.status(200).json({
    status: "success",
    message: `OTP sent to ${email}. Valid for 15 minutes.`,
  });
});

// Controller: Verify OTP and generate reset token
const verifyOTPAndGenerateToken = catchAsync(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return next(new AppError("Email and OTP are required", 400));
  }

  // Validate OTP format
  if (!validateOTPFormat(otp)) {
    return next(new AppError("Invalid OTP format. OTP must be 6 digits.", 400));
  }

  // Find user by email
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  if (user.isDeleted) {
    return next(new AppError("User account has been deleted", 404));
  }

  if (!user.isActive) {
    return next(new AppError("User account is inactive", 400));
  }

  // Validate OTP using database
  const isOTPValidResult = await isOTPValid(email, otp);
  if (!isOTPValidResult) {
    await incrementOTPAttempts(email);
    return next(
      new AppError(
        "Invalid OTP or OTP expired. Please try again or request a new OTP.",
        400
      )
    );
  }

  // Mark OTP as used
  await markOTPAsUsed(email);

  // Generate reset token (valid for 15 minutes)
  const resetToken = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: "15m" }
  );

  res.status(200).json({
    status: "success",
    message: "OTP verified successfully. You can now reset your password.",
    resetToken,
  });
});

// Controller: Reset password with token
const resetPasswordWithToken = catchAsync(async (req, res, next) => {
  const { resetToken } = req.params;
  const { newPassword } = req.body;

  if (!resetToken || !newPassword) {
    return next(new AppError("Reset token and new password are required", 400));
  }

  // Validate password strength
  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.isValid) {
    return next(
      new AppError(
        `Password validation failed: ${passwordValidation.errors.join(", ")}`,
        400
      )
    );
  }

  try {
    // Verify reset token
    const decoded = jwt.verify(
      resetToken,
      process.env.JWT_SECRET as string
    ) as {
      userId: string;
      email: string;
    };

    // Find user by ID
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });
    if (!user) {
      return next(new AppError("User not found", 404));
    }

    if (user.isDeleted) {
      return next(new AppError("User account has been deleted", 404));
    }

    if (!user.isActive) {
      return next(new AppError("User account is inactive", 400));
    }

    // Verify email matches
    if (user.email !== decoded.email) {
      return next(new AppError("Invalid reset token", 400));
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });

    // Send success email
    try {
      const emailer = new Email();
      await emailer.send({
        to: user.email,
        subject: "Password Reset Successful",
        template: "password-reset-success",
        data: { name: user.name },
      });
    } catch (err) {
      console.error("Failed to send password reset success email:", err);
      // Don't fail the request if email fails
    }

    res.status(200).json({
      status: "success",
      message:
        "Password reset successfully. You can now login with your new password.",
    });
  } catch (error) {
    return next(new AppError("Invalid or expired reset token", 400));
  }
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

// Change user role (Admin only)
const changeUserRole = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { newRole, isHead = false, isHeadOffice = false, projectIds } = req.body;
  const adminId = req.user.id;

  // Check if current user is admin
  if (req.user.role !== "ADMIN") {
    return next(new AppError("Only admins can change user roles", 403));
  }

  if (!newRole) {
    return next(new AppError("New role is required", 400));
  }

  // Validate role
  const validRoles = [
    "SUPER_ADMIN",
    "ADMIN",
    "SUB_ADMIN",
    "SITE_INCHARGE",
    "PROJECT_MANAGER",
    "CONSTRUCTION_MANAGER",
    "STORE_INCHARGE",
    "ACCOUNTANT",
  ];
  if (!validRoles.includes(newRole)) {
    return next(new AppError("Invalid role", 400));
  }

  // Validate isHead field
  if (isHead) {
    // isHead can only be true for ACCOUNTANT and STORE_INCHARGE roles
    if (newRole !== "ACCOUNTANT" && newRole !== "STORE_INCHARGE") {
      return next(
        new AppError(
          "isHead can only be set for ACCOUNTANT and STORE_INCHARGE roles",
          400
        )
      );
    }

    // Head Accountant or Head Store Incharge must be assigned to at least one project
    if (newRole === "ACCOUNTANT" || newRole === "STORE_INCHARGE") {
      const resolvedIds =
        newRole === "ACCOUNTANT"
          ? await resolveHeadAccountantProjectIds(!!isHeadOffice, projectIds)
          : Array.isArray(projectIds)
            ? projectIds
            : [];
      if (resolvedIds.length === 0) {
        return next(
          new AppError(
            newRole === "ACCOUNTANT"
              ? "Select one or more projects for a Project Accountant, or mark the user as Head Office Accountant."
              : "projectIds[] is required when setting isHead: true for a Store Incharge. Assign at least one project.",
            400
          )
        );
      }
      req.body.projectIds = resolvedIds;
    }
  }

  const assignedProjectIds: string[] = Array.isArray(req.body.projectIds)
    ? req.body.projectIds
    : [];

  // Find the user to be updated
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isHead: true,
      isActive: true,
      isDeleted: true,
    },
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  if (user.isDeleted) {
    return next(new AppError("Cannot change role of deleted user", 400));
  }

  if (!user.isActive) {
    return next(new AppError("Cannot change role of inactive user", 400));
  }

  // Prevent admin from changing their own role
  if (user.id === adminId) {
    return next(new AppError("Cannot change your own role", 400));
  }

  // If role is not changing, just update isHead if needed
  if (user.role === newRole) {
    if (user.isHead !== isHead || isHead) {
      const updatedUser = await prisma.$transaction(async (tx) => {
        // Deactivate all existing assignments first when toggling isHead
        if (newRole === "ACCOUNTANT") {
          await tx.accountantAssignment.updateMany({
            where: { userId: id, isActive: true },
            data: { isActive: false },
          });
          if (isHead && assignedProjectIds.length) {
            await tx.accountantAssignment.createMany({
              data: assignedProjectIds.map((pid: string) => ({
                userId: id, projectId: pid, sectionId: null,
                isActive: true, createdBy: adminId,
              })),
              skipDuplicates: true,
            });
          }
        }

        if (newRole === "STORE_INCHARGE") {
          await tx.headStoreInchargeAssignment.updateMany({
            where: { userId: id, isActive: true },
            data: { isActive: false },
          });
          if (isHead && assignedProjectIds.length) {
            await tx.headStoreInchargeAssignment.createMany({
              data: assignedProjectIds.map((pid: string) => ({
                userId: id, projectId: pid,
                isActive: true, createdBy: adminId,
              })),
              skipDuplicates: true,
            });
          }
        }

        return tx.user.update({
          where: { id },
          data: {
            isHead,
            updatedBy: adminId,
            updatedAt: new Date(),
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isHead: true,
            isActive: true,
            updatedAt: true,
          },
        });
      });

      return res.json({
        message: "User isHead status updated successfully",
        user: updatedUser,
      });
    } else {
      return res.json({
        message: "No changes needed",
        user,
      });
    }
  }

  // If role is changing, remove all existing assignments and update role
  const result = await prisma.$transaction(async (tx) => {
    // Remove all existing assignments
    await tx.siteInchargeAssignment.updateMany({
      where: { userId: id, isActive: true },
      data: { isActive: false },
    });

    await tx.projectManagerAssignment.updateMany({
      where: { userId: id, isActive: true },
      data: { isActive: false },
    });

    await tx.constructionManagerAssignment.updateMany({
      where: { userId: id, isActive: true },
      data: { isActive: false },
    });

    await tx.storeInchargeAssignment.updateMany({
      where: { userId: id, isActive: true },
      data: { isActive: false },
    });

    await tx.headStoreInchargeAssignment.updateMany({
      where: { userId: id, isActive: true },
      data: { isActive: false },
    });

    await tx.accountantAssignment.updateMany({
      where: { userId: id, isActive: true },
      data: { isActive: false },
    });

    // Handle CM store cleanup if user was a Construction Manager
    let cmStores: any[] = [];
    if (user.role === "CONSTRUCTION_MANAGER") {
      cmStores = await tx.store.findMany({
        where: {
          cmUserId: id,
          type: "CM_STORE",
          isDeleted: false,
        },
        include: {
          inventory: {
            include: {
              material: {
                select: {
                  id: true,
                  name: true,
                  unit: true,
                },
              },
            },
          },
        },
      });

      for (const cmStore of cmStores) {
        // Find the head store in the same section
        const headStore = await tx.store.findFirst({
          where: {
            type: "HEAD_STORE",
            sectionId: cmStore.sectionId,
            isDeleted: false,
            isActive: true,
          },
        });

        // Transfer stock from CM store to head store if there's stock
        if (cmStore.inventory && cmStore.inventory.length > 0 && headStore) {
          for (const inventoryItem of cmStore.inventory) {
            if (Number(inventoryItem.stock) > 0) {
              // Transfer stock to head store
              await tx.storeInventory.upsert({
                where: {
                  storeId_materialId: {
                    storeId: headStore.id,
                    materialId: inventoryItem.materialId,
                  },
                },
                update: {
                  stock: {
                    increment: inventoryItem.stock,
                  },
                  available: {
                    increment: inventoryItem.stock,
                  },
                },
                create: {
                  storeId: headStore.id,
                  materialId: inventoryItem.materialId,
                  stock: inventoryItem.stock,
                  available: inventoryItem.stock,
                  reserved: 0,
                },
              });

              // Create transaction record for the transfer
              await tx.storeTransaction.create({
                data: {
                  storeId: headStore.id,
                  materialId: inventoryItem.materialId,
                  type: "IN",
                  quantity: inventoryItem.stock,
                  reference: TRANSACTION_REFERENCES.ROLE_CHANGE_TRANSFER,
                  notes: `Stock transferred from CM store (${cmStore.name}) due to role change`,
                  createdBy: adminId,
                },
              });

              // Clear the CM store inventory
              await tx.storeInventory.update({
                where: {
                  storeId_materialId: {
                    storeId: cmStore.id,
                    materialId: inventoryItem.materialId,
                  },
                },
                data: {
                  stock: 0,
                  available: 0,
                  reserved: 0,
                },
              });
            }
          }
        }

        // Deactivate the CM store
        await tx.store.update({
          where: { id: cmStore.id },
          data: {
            isActive: false,
            isDeleted: true,
            updatedBy: adminId,
            updatedAt: new Date(),
          },
        });
      }
    }

    // Update user role and isHead
    const updatedUser = await tx.user.update({
      where: { id },
      data: {
        role: newRole as any, // Type assertion for Prisma enum
        isHead,
        updatedBy: adminId,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isHead: true,
        isActive: true,
        updatedAt: true,
      },
    });

    // For Head Accountant: create project-level assignments
    if (isHead && newRole === "ACCOUNTANT" && assignedProjectIds.length) {
      await tx.accountantAssignment.createMany({
        data: assignedProjectIds.map((pid: string) => ({
          userId: id,
          projectId: pid,
          sectionId: null,
          isActive: true,
          createdBy: adminId,
        })),
        skipDuplicates: true,
      });
    }

    // For Head Store Incharge: create project-level assignments
    if (isHead && newRole === "STORE_INCHARGE" && assignedProjectIds.length) {
      await tx.headStoreInchargeAssignment.createMany({
        data: assignedProjectIds.map((pid: string) => ({
          userId: id,
          projectId: pid,
          isActive: true,
          createdBy: adminId,
        })),
        skipDuplicates: true,
      });
    }

    return { updatedUser, cmStores };
  });

  // Send notification to user about role change
  await sendNotificationToUserSafe({
    userId: id,
    title: "Role Changed",
    body: `Your role has been changed to ${newRole}${isHead ? " (Head)" : ""}.`,
  });

  res.json({
    message:
      "User role changed successfully. All previous assignments have been removed.",
    user: result.updatedUser,
    removedAssignments: {
      siteIncharge: true,
      projectManager: true,
      constructionManager: true,
      storeIncharge: true,
      accountant: true,
    },
    ...(result.cmStores.length > 0 && {
      cmStoresDeactivated: result.cmStores.length,
      stockTransferred: true,
    }),
  });
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
  verifyOTPAndGenerateToken,
  resetPasswordWithToken,
  changeUserRole,
};
