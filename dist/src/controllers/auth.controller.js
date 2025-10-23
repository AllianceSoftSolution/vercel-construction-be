"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeUserRole = exports.resetPasswordWithToken = exports.verifyOTPAndGenerateToken = exports.requestPasswordReset = exports.deactivateUser = exports.activateUser = exports.deleteUser = exports.updateUser = exports.getUserById = exports.getUsers = exports.changePassword = exports.loginUser = exports.registerUser = exports.removeDeviceToken = exports.saveDeviceToken = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const helpers_1 = require("../utils/helpers");
const email_1 = require("../utils/email");
const generateCode_1 = require("../utils/generateCode");
const buildQueryOptions_1 = require("../utils/buildQueryOptions");
const notification_1 = require("../utils/notification");
const otpUtils_1 = require("../utils/otpUtils");
const passwordUtils_1 = require("../utils/passwordUtils");
const constants_1 = require("../constants");
const prisma_1 = __importDefault(require("../utils/prisma"));
(0, otpUtils_1.setupOTPCleanup)();
const registerUser = (0, catchAsync_1.default)(async (req, res, next) => {
    const { email, name, role, isHead = false, notes } = req.body;
    const userCount = await prisma_1.default.user.count();
    let createdBy = null;
    if (userCount > 0) {
        if (!req.user || !req.user.id) {
            return next(new appError_1.default("Authentication required", 401));
        }
        createdBy = req.user.id;
    }
    if (!email || !name || !role) {
        return next(new appError_1.default("Email, name, and role are required", 400));
    }
    if (isHead) {
        if (!req.user || req.user.role !== "ADMIN") {
            return next(new appError_1.default("Only admins can create head users", 403));
        }
        if (role !== "ACCOUNTANT" && role !== "STORE_INCHARGE") {
            return next(new appError_1.default("isHead can only be set for ACCOUNTANT and STORE_INCHARGE roles", 400));
        }
    }
    const existingUser = await prisma_1.default.user.findFirst({
        where: { email },
    });
    if (existingUser) {
        return next(new appError_1.default("User with this email already exists", 400));
    }
    const employeeId = await (0, generateCode_1.generateEmployeeId)(role);
    const generatedPassword = (0, helpers_1.randomPassword)(10);
    console.log(`Generated password for ${email}:`, generatedPassword);
    const hashedPassword = await bcryptjs_1.default.hash(generatedPassword, 12);
    const user = await prisma_1.default.user.create({
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
    try {
        const emailer = new email_1.Email();
        await emailer.send({
            to: email,
            subject: "Welcome to Construction Management System",
            template: "welcome-email",
            data: { name, email, password: generatedPassword, employeeId },
        });
    }
    catch (err) {
        console.error("Failed to send welcome email:", err);
    }
    res.status(201).json({
        message: "User registered successfully",
        user,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: user.id,
        title: "Welcome!",
        body: `Your account has been created. Employee ID: ${user.employeeId}`,
    });
});
exports.registerUser = registerUser;
const loginUser = (0, catchAsync_1.default)(async (req, res, next) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return next(new appError_1.default("Email and password are required", 400));
    }
    const user = await prisma_1.default.user.findUnique({
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
        return next(new appError_1.default("Invalid email or password", 401));
    }
    if (user.isDeleted) {
        return next(new appError_1.default("User account has been deleted", 401));
    }
    if (!user.isActive) {
        return next(new appError_1.default("User account is inactive", 401));
    }
    const isPasswordValid = await bcryptjs_1.default.compare(password, user.password);
    if (!isPasswordValid) {
        return next(new appError_1.default("Invalid email or password", 401));
    }
    const token = jsonwebtoken_1.default.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "90d" });
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
exports.loginUser = loginUser;
const changePassword = (0, catchAsync_1.default)(async (req, res, next) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    const user = await prisma_1.default.user.findUnique({ where: { id: userId } });
    if (!user) {
        return next(new appError_1.default("User not found", 404));
    }
    const isPasswordValid = await bcryptjs_1.default.compare(currentPassword, user.password);
    if (!isPasswordValid) {
        return res.status(401).json({ error: "Incorrect current password" });
    }
    const passwordValidation = (0, passwordUtils_1.validatePasswordStrength)(newPassword);
    if (!passwordValidation.isValid) {
        return next(new appError_1.default(`Password validation failed: ${passwordValidation.errors.join(", ")}`, 400));
    }
    const hashedNewPassword = await bcryptjs_1.default.hash(newPassword, 12);
    await prisma_1.default.user.update({
        where: { id: userId },
        data: {
            password: hashedNewPassword,
            updatedAt: new Date(),
        },
    });
    return res.status(200).json({ message: "Password updated successfully" });
});
exports.changePassword = changePassword;
const getUsers = (0, catchAsync_1.default)(async (req, res) => {
    const user = req.user;
    const filterOptions = (0, buildQueryOptions_1.extractQueryParams)(req);
    const searchableFields = ["name", "email", "employeeId"];
    const defaultFilters = { isDeleted: false };
    let userFilter = {
        ...defaultFilters,
    };
    if (user.role === "ADMIN") {
    }
    else if (user.role === "SITE_INCHARGE") {
        const assignments = await prisma_1.default.siteInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        const sectionUsers = await prisma_1.default.user.findMany({
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
    }
    else if (user.role === "PROJECT_MANAGER") {
        const assignments = await prisma_1.default.projectManagerAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        const sectionUsers = await prisma_1.default.user.findMany({
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
    }
    else {
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
    const queryOptions = (0, buildQueryOptions_1.buildQueryOptions)(filterOptions, userFilter, searchableFields);
    const total = await prisma_1.default.user.count({
        where: queryOptions.where,
    });
    const users = await prisma_1.default.user.findMany({
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
    const usersByRole = {};
    const roleBreakdown = {};
    users.forEach((user) => {
        const role = user.role;
        const roleKey = typeof role === "string" ? role : String(role);
        if (!usersByRole[roleKey]) {
            usersByRole[roleKey] = [];
        }
        usersByRole[roleKey].push(user);
    });
    Object.keys(usersByRole).forEach((role) => {
        roleBreakdown[role] = usersByRole[role].length;
    });
    const paginationMeta = (0, buildQueryOptions_1.buildPaginationMeta)(total, filterOptions.page || 1, filterOptions.limit || 50);
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
exports.getUsers = getUsers;
const getUserById = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const user = await prisma_1.default.user.findUnique({
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
        return next(new appError_1.default("User not found", 404));
    }
    res.json({
        message: "User retrieved successfully",
        user,
    });
});
exports.getUserById = getUserById;
const updateUser = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const updates = { ...req.body };
    const userId = req.user.id;
    delete updates.id;
    delete updates.createdAt;
    delete updates.createdBy;
    const existing = await prisma_1.default.user.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("User not found", 404));
    }
    if (updates.password) {
        updates.password = await bcryptjs_1.default.hash(updates.password, 12);
    }
    const updateData = { ...updates };
    if (typeof updates.notes === "undefined") {
        delete updateData.notes;
    }
    const updatedUser = await prisma_1.default.user.update({
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
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: updatedUser.id,
        title: "Profile Updated",
        body: `Your profile was updated successfully.`,
    });
});
exports.updateUser = updateUser;
const deleteUser = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.user.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("User not found", 404));
    }
    await prisma_1.default.user.update({
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
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: id,
        title: "Account Deleted",
        body: `Your account has been deleted.`,
    });
});
exports.deleteUser = deleteUser;
const activateUser = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.user.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("User not found", 404));
    }
    const updatedUser = await prisma_1.default.user.update({
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
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: updatedUser.id,
        title: "Account Activated",
        body: `Your account has been activated.`,
    });
});
exports.activateUser = activateUser;
const deactivateUser = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.user.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("User not found", 404));
    }
    const updatedUser = await prisma_1.default.user.update({
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
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: updatedUser.id,
        title: "Account Deactivated",
        body: `Your account has been deactivated.`,
    });
});
exports.deactivateUser = deactivateUser;
const requestPasswordReset = (0, catchAsync_1.default)(async (req, res, next) => {
    const { email } = req.body;
    if (!email) {
        return next(new appError_1.default("Email is required", 400));
    }
    const user = await prisma_1.default.user.findUnique({ where: { email } });
    if (!user) {
        return next(new appError_1.default("User not found", 404));
    }
    if (user.isDeleted) {
        return next(new appError_1.default("User account has been deleted", 404));
    }
    if (!user.isActive) {
        return next(new appError_1.default("User account is inactive", 400));
    }
    const otp = (0, otpUtils_1.generateOTP)();
    await (0, otpUtils_1.storeOTP)(email, otp, 15);
    try {
        const emailer = new email_1.Email();
        await emailer.send({
            to: email,
            subject: "Password Reset OTP",
            template: "password-reset-otp",
            data: { name: user.name, otp },
        });
    }
    catch (err) {
        console.error("Failed to send OTP email:", err);
        return next(new appError_1.default("Failed to send OTP email", 500));
    }
    res.status(200).json({
        status: "success",
        message: `OTP sent to ${email}. Valid for 15 minutes.`,
    });
});
exports.requestPasswordReset = requestPasswordReset;
const verifyOTPAndGenerateToken = (0, catchAsync_1.default)(async (req, res, next) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        return next(new appError_1.default("Email and OTP are required", 400));
    }
    if (!(0, otpUtils_1.validateOTPFormat)(otp)) {
        return next(new appError_1.default("Invalid OTP format. OTP must be 6 digits.", 400));
    }
    const user = await prisma_1.default.user.findUnique({ where: { email } });
    if (!user) {
        return next(new appError_1.default("User not found", 404));
    }
    if (user.isDeleted) {
        return next(new appError_1.default("User account has been deleted", 404));
    }
    if (!user.isActive) {
        return next(new appError_1.default("User account is inactive", 400));
    }
    const isOTPValidResult = await (0, otpUtils_1.isOTPValid)(email, otp);
    if (!isOTPValidResult) {
        await (0, otpUtils_1.incrementOTPAttempts)(email);
        return next(new appError_1.default("Invalid OTP or OTP expired. Please try again or request a new OTP.", 400));
    }
    await (0, otpUtils_1.markOTPAsUsed)(email);
    const resetToken = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "15m" });
    res.status(200).json({
        status: "success",
        message: "OTP verified successfully. You can now reset your password.",
        resetToken,
    });
});
exports.verifyOTPAndGenerateToken = verifyOTPAndGenerateToken;
const resetPasswordWithToken = (0, catchAsync_1.default)(async (req, res, next) => {
    const { resetToken } = req.params;
    const { newPassword } = req.body;
    if (!resetToken || !newPassword) {
        return next(new appError_1.default("Reset token and new password are required", 400));
    }
    const passwordValidation = (0, passwordUtils_1.validatePasswordStrength)(newPassword);
    if (!passwordValidation.isValid) {
        return next(new appError_1.default(`Password validation failed: ${passwordValidation.errors.join(", ")}`, 400));
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(resetToken, process.env.JWT_SECRET);
        const user = await prisma_1.default.user.findUnique({
            where: { id: decoded.userId },
        });
        if (!user) {
            return next(new appError_1.default("User not found", 404));
        }
        if (user.isDeleted) {
            return next(new appError_1.default("User account has been deleted", 404));
        }
        if (!user.isActive) {
            return next(new appError_1.default("User account is inactive", 400));
        }
        if (user.email !== decoded.email) {
            return next(new appError_1.default("Invalid reset token", 400));
        }
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 12);
        await prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                updatedAt: new Date(),
            },
        });
        try {
            const emailer = new email_1.Email();
            await emailer.send({
                to: user.email,
                subject: "Password Reset Successful",
                template: "password-reset-success",
                data: { name: user.name },
            });
        }
        catch (err) {
            console.error("Failed to send password reset success email:", err);
        }
        res.status(200).json({
            status: "success",
            message: "Password reset successfully. You can now login with your new password.",
        });
    }
    catch (error) {
        return next(new appError_1.default("Invalid or expired reset token", 400));
    }
});
exports.resetPasswordWithToken = resetPasswordWithToken;
exports.saveDeviceToken = (0, catchAsync_1.default)(async (req, res, next) => {
    const userId = req.user.id;
    const { token, platform } = req.body;
    if (!token || !platform) {
        return next(new appError_1.default("Token and platform are required", 400));
    }
    await prisma_1.default.deviceToken.upsert({
        where: { token },
        update: { platform, userId },
        create: { token, platform, userId },
    });
    res.json({ message: "Device token saved" });
});
exports.removeDeviceToken = (0, catchAsync_1.default)(async (req, res, next) => {
    const userId = req.user.id;
    const { token } = req.body;
    if (!token) {
        return next(new appError_1.default("Token is required", 400));
    }
    await prisma_1.default.deviceToken.deleteMany({ where: { token, userId } });
    res.json({ message: "Device token removed" });
});
const changeUserRole = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const { newRole, isHead = false } = req.body;
    const adminId = req.user.id;
    if (req.user.role !== "ADMIN") {
        return next(new appError_1.default("Only admins can change user roles", 403));
    }
    if (!newRole) {
        return next(new appError_1.default("New role is required", 400));
    }
    const validRoles = [
        "ADMIN",
        "SITE_INCHARGE",
        "PROJECT_MANAGER",
        "CONSTRUCTION_MANAGER",
        "STORE_INCHARGE",
        "ACCOUNTANT",
    ];
    if (!validRoles.includes(newRole)) {
        return next(new appError_1.default("Invalid role", 400));
    }
    if (isHead) {
        if (newRole !== "ACCOUNTANT" && newRole !== "STORE_INCHARGE") {
            return next(new appError_1.default("isHead can only be set for ACCOUNTANT and STORE_INCHARGE roles", 400));
        }
    }
    const user = await prisma_1.default.user.findUnique({
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
        return next(new appError_1.default("User not found", 404));
    }
    if (user.isDeleted) {
        return next(new appError_1.default("Cannot change role of deleted user", 400));
    }
    if (!user.isActive) {
        return next(new appError_1.default("Cannot change role of inactive user", 400));
    }
    if (user.id === adminId) {
        return next(new appError_1.default("Cannot change your own role", 400));
    }
    if (user.role === newRole) {
        if (user.isHead !== isHead) {
            const updatedUser = await prisma_1.default.user.update({
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
            return res.json({
                message: "User isHead status updated successfully",
                user: updatedUser,
            });
        }
        else {
            return res.json({
                message: "No changes needed",
                user,
            });
        }
    }
    const result = await prisma_1.default.$transaction(async (tx) => {
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
        await tx.accountantAssignment.updateMany({
            where: { userId: id, isActive: true },
            data: { isActive: false },
        });
        let cmStores = [];
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
                const headStore = await tx.store.findFirst({
                    where: {
                        type: "HEAD_STORE",
                        sectionId: cmStore.sectionId,
                        isDeleted: false,
                        isActive: true,
                    },
                });
                if (cmStore.inventory && cmStore.inventory.length > 0 && headStore) {
                    for (const inventoryItem of cmStore.inventory) {
                        if (Number(inventoryItem.stock) > 0) {
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
                            await tx.storeTransaction.create({
                                data: {
                                    storeId: headStore.id,
                                    materialId: inventoryItem.materialId,
                                    type: "IN",
                                    quantity: inventoryItem.stock,
                                    reference: constants_1.TRANSACTION_REFERENCES.ROLE_CHANGE_TRANSFER,
                                    notes: `Stock transferred from CM store (${cmStore.name}) due to role change`,
                                    createdBy: adminId,
                                },
                            });
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
        const updatedUser = await tx.user.update({
            where: { id },
            data: {
                role: newRole,
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
        return { updatedUser, cmStores };
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: id,
        title: "Role Changed",
        body: `Your role has been changed to ${newRole}${isHead ? " (Head)" : ""}.`,
    });
    res.json({
        message: "User role changed successfully. All previous assignments have been removed.",
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
exports.changeUserRole = changeUserRole;
//# sourceMappingURL=auth.controller.js.map