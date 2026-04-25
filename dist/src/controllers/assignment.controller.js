"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSectionsWithAccountantAssignmentStatus = exports.getSectionsWithSiteInchargeAssignmentStatus = exports.getUsersByRoleForAssignment = exports.createAndAssignProjectManager = exports.deactivateAssignment = exports.getAccountantAssignments = exports.createAccountantAssignment = exports.getStoreInchargeAssignments = exports.createStoreInchargeAssignment = exports.getConstructionManagerAssignments = exports.createConstructionManagerAssignment = exports.getProjectManagerAssignments = exports.createProjectManagerAssignment = exports.getSiteInchargeAssignments = exports.createSiteInchargeAssignment = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const generateCode_1 = require("../utils/generateCode");
const constants_1 = require("../constants");
const notificationService_1 = require("../utils/notificationService");
const prisma_1 = __importDefault(require("../utils/prisma"));
const crypto = require("crypto");
const createSiteInchargeAssignment = (0, catchAsync_1.default)(async (req, res, next) => {
    const { userId, projectId, sectionIds } = req.body;
    const currentUserId = req.user.id;
    if (!userId || !projectId || !Array.isArray(sectionIds)) {
        return next(new appError_1.default("userId, projectId, and sectionIds (array) are required", 400));
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        return next(new appError_1.default("User not found", 404));
    }
    if (user.role !== "SITE_INCHARGE") {
        return next(new appError_1.default("User must have SITE_INCHARGE role", 400));
    }
    const project = await prisma_1.default.project.findUnique({
        where: { id: projectId },
    });
    if (!project) {
        return next(new appError_1.default("Project not found", 404));
    }
    const validSections = await prisma_1.default.section.findMany({
        where: { projectId, id: { in: sectionIds }, isDeleted: false },
        select: { id: true },
    });
    const validSectionIds = validSections.map((s) => s.id);
    if (validSectionIds.length !== sectionIds.length) {
        return next(new appError_1.default("One or more sectionIds are invalid for this project", 400));
    }
    const currentAssignments = await prisma_1.default.siteInchargeAssignment.findMany({
        where: { userId, projectId, isActive: true },
        select: { id: true, sectionId: true },
    });
    const currentSectionIds = currentAssignments.map((a) => a.sectionId);
    const toAssign = validSectionIds.filter((id) => !currentSectionIds.includes(id));
    const toUnassign = currentAssignments.filter((a) => !validSectionIds.includes(a.sectionId));
    const createdAssignments = await Promise.all(toAssign.map((sectionId) => prisma_1.default.siteInchargeAssignment.create({
        data: {
            userId,
            projectId,
            sectionId,
            createdBy: currentUserId,
        },
        include: {
            user: { select: { id: true, name: true, email: true, role: true } },
            project: { select: { id: true, name: true, code: true } },
            section: { select: { id: true, name: true, code: true } },
        },
    })));
    await Promise.all(toUnassign.map((a) => prisma_1.default.siteInchargeAssignment.update({
        where: { id: a.id },
        data: { isActive: false },
    })));
    res.status(201).json({
        message: "Site Incharge assignments updated successfully",
        assignedSectionIds: validSectionIds,
        createdAssignments,
        unassignedSectionIds: toUnassign.map((a) => a.sectionId),
    });
});
exports.createSiteInchargeAssignment = createSiteInchargeAssignment;
const getSiteInchargeAssignments = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, projectId, sectionId, isActive } = req.query;
    const where = {};
    if (userId) {
        where.userId = userId;
    }
    if (projectId) {
        where.projectId = projectId;
    }
    if (sectionId) {
        where.sectionId = sectionId;
    }
    if (isActive !== undefined) {
        where.isActive = isActive === "true";
    }
    const assignments = await prisma_1.default.siteInchargeAssignment.findMany({
        where,
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
            },
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            section: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });
    res.json({
        message: "Site Incharge assignments retrieved successfully",
        assignments,
    });
});
exports.getSiteInchargeAssignments = getSiteInchargeAssignments;
const createProjectManagerAssignment = (0, catchAsync_1.default)(async (req, res, next) => {
    const { userId, projectId, sectionId } = req.body;
    const currentUserId = req.user.id;
    if (!userId || !projectId || !sectionId) {
        return next(new appError_1.default("UserId, projectId, and sectionId are required", 400));
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        return next(new appError_1.default("User not found", 404));
    }
    if (user.role !== "PROJECT_MANAGER") {
        return next(new appError_1.default("User must have PROJECT_MANAGER role", 400));
    }
    const project = await prisma_1.default.project.findUnique({
        where: { id: projectId },
    });
    if (!project) {
        return next(new appError_1.default("Project not found", 404));
    }
    const section = await prisma_1.default.section.findFirst({
        where: {
            id: sectionId,
            projectId,
        },
    });
    if (!section) {
        return next(new appError_1.default("Section not found or does not belong to the project", 404));
    }
    const existingAssignment = await prisma_1.default.projectManagerAssignment.findFirst({
        where: {
            userId,
            sectionId,
            isActive: true,
        },
    });
    if (existingAssignment) {
        return next(new appError_1.default("User is already assigned to this section", 400));
    }
    const assignment = await prisma_1.default.projectManagerAssignment.create({
        data: {
            userId,
            projectId,
            sectionId,
            createdBy: currentUserId,
        },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
            },
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            section: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
        },
    });
    res.status(201).json({
        message: "Project Manager assignment created successfully",
        assignment,
    });
});
exports.createProjectManagerAssignment = createProjectManagerAssignment;
const getProjectManagerAssignments = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, projectId, sectionId, isActive } = req.query;
    const where = {};
    if (userId) {
        where.userId = userId;
    }
    if (projectId) {
        where.projectId = projectId;
    }
    if (sectionId) {
        where.sectionId = sectionId;
    }
    if (isActive !== undefined) {
        where.isActive = isActive === "true";
    }
    const assignments = await prisma_1.default.projectManagerAssignment.findMany({
        where,
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
            },
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            section: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });
    res.json({
        message: "Project Manager assignments retrieved successfully",
        assignments,
    });
});
exports.getProjectManagerAssignments = getProjectManagerAssignments;
const createConstructionManagerAssignment = (0, catchAsync_1.default)(async (req, res, next) => {
    const { userId, sectionId, storeIds } = req.body;
    const currentUserId = req.user.id;
    if (!userId || !sectionId) {
        return next(new appError_1.default("UserId and sectionId are required", 400));
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        return next(new appError_1.default("User not found", 404));
    }
    if (user.role !== "CONSTRUCTION_MANAGER") {
        return next(new appError_1.default("User must have CONSTRUCTION_MANAGER role", 400));
    }
    const section = await prisma_1.default.section.findUnique({
        where: { id: sectionId },
    });
    if (!section) {
        return next(new appError_1.default("Section not found", 404));
    }
    const existingAssignment = await prisma_1.default.constructionManagerAssignment.findFirst({
        where: {
            userId,
            sectionId,
            isActive: true,
        },
    });
    if (existingAssignment) {
        return next(new appError_1.default("User is already assigned to this section", 400));
    }
    const existingSectionStore = await prisma_1.default.store.findFirst({
        where: {
            type: "SECTION_STORE",
            sectionId,
            isDeleted: false,
        },
    });
    const result = await prisma_1.default.$transaction(async (tx) => {
        const assignment = await tx.constructionManagerAssignment.create({
            data: {
                userId,
                sectionId,
                createdBy: currentUserId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
                section: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        project: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                            },
                        },
                    },
                },
            },
        });
        let sectionStore = existingSectionStore;
        if (!sectionStore) {
            sectionStore = await tx.store.create({
                data: {
                    name: `Section Store - ${section.code}`,
                    type: "SECTION_STORE",
                    sectionId,
                    createdBy: currentUserId,
                },
                include: {
                    section: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        },
                    },
                },
            });
        }
        if (Array.isArray(storeIds) && storeIds.length > 0) {
            await tx.store.updateMany({
                where: {
                    id: { in: storeIds },
                    sectionId,
                },
                data: { cmUserId: userId },
            });
        }
        return { assignment, sectionStore };
    });
    res.status(201).json({
        message: "Construction Manager assignment and section store ensured successfully",
        assignment: result.assignment,
        sectionStore: result.sectionStore,
    });
});
exports.createConstructionManagerAssignment = createConstructionManagerAssignment;
const getConstructionManagerAssignments = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, sectionId, isActive } = req.query;
    const where = {};
    if (userId) {
        where.userId = userId;
    }
    if (sectionId) {
        where.sectionId = sectionId;
    }
    if (isActive !== undefined) {
        where.isActive = isActive === "true";
    }
    const assignments = await prisma_1.default.constructionManagerAssignment.findMany({
        where,
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
            },
            section: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                    project: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        },
                    },
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });
    res.json({
        message: "Construction Manager assignments retrieved successfully",
        assignments,
    });
});
exports.getConstructionManagerAssignments = getConstructionManagerAssignments;
const createStoreInchargeAssignment = (0, catchAsync_1.default)(async (req, res, next) => {
    const { userId, storeId } = req.body;
    const currentUserId = req.user.id;
    if (!userId || !storeId) {
        return next(new appError_1.default("UserId and storeId are required", 400));
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        return next(new appError_1.default("User not found", 404));
    }
    if (user.role !== "STORE_INCHARGE") {
        return next(new appError_1.default("User must have STORE_INCHARGE role", 400));
    }
    const store = await prisma_1.default.store.findUnique({
        where: { id: storeId },
    });
    if (!store) {
        return next(new appError_1.default("Store not found", 404));
    }
    const existingAssignment = await prisma_1.default.storeInchargeAssignment.findFirst({
        where: {
            userId,
            storeId,
            isActive: true,
        },
    });
    if (existingAssignment) {
        return next(new appError_1.default("User is already assigned to this store", 400));
    }
    const assignment = await prisma_1.default.storeInchargeAssignment.create({
        data: {
            userId,
            storeId,
            createdBy: currentUserId,
        },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
            },
            store: {
                select: {
                    id: true,
                    name: true,
                    type: true,
                    section: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                            project: {
                                select: {
                                    id: true,
                                    name: true,
                                    code: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    res.status(201).json({
        message: "Store Incharge assignment created successfully",
        assignment,
    });
    await notificationService_1.NotificationService.notifyUserAssignment({
        userId: assignment.userId,
        sectionId: assignment.store.section?.id ?? "",
        role: "STORE_INCHARGE",
        assignedBy: currentUserId,
    });
});
exports.createStoreInchargeAssignment = createStoreInchargeAssignment;
const getStoreInchargeAssignments = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, storeId, isActive } = req.query;
    const where = {};
    if (userId) {
        where.userId = userId;
    }
    if (storeId) {
        where.storeId = storeId;
    }
    if (isActive !== undefined) {
        where.isActive = isActive === "true";
    }
    const assignments = await prisma_1.default.storeInchargeAssignment.findMany({
        where,
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
            },
            store: {
                select: {
                    id: true,
                    name: true,
                    type: true,
                    section: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                            project: {
                                select: {
                                    id: true,
                                    name: true,
                                    code: true,
                                },
                            },
                        },
                    },
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });
    res.json({
        message: "Store Incharge assignments retrieved successfully",
        assignments,
    });
});
exports.getStoreInchargeAssignments = getStoreInchargeAssignments;
const createAccountantAssignment = (0, catchAsync_1.default)(async (req, res, next) => {
    const { userId, projectId, sectionIds } = req.body;
    const currentUserId = req.user.id;
    if (!userId || !projectId || !Array.isArray(sectionIds)) {
        return next(new appError_1.default("userId, projectId, and sectionIds (array) are required", 400));
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        return next(new appError_1.default("User not found", 404));
    }
    if (user.role !== "ACCOUNTANT") {
        return next(new appError_1.default("User must have ACCOUNTANT role", 400));
    }
    const project = await prisma_1.default.project.findUnique({
        where: { id: projectId },
    });
    if (!project) {
        return next(new appError_1.default("Project not found", 404));
    }
    const validSections = await prisma_1.default.section.findMany({
        where: { projectId, id: { in: sectionIds }, isDeleted: false },
        select: { id: true },
    });
    const validSectionIds = validSections.map((s) => s.id);
    if (validSectionIds.length !== sectionIds.length) {
        return next(new appError_1.default("One or more sectionIds are invalid for this project", 400));
    }
    const currentAssignments = await prisma_1.default.accountantAssignment.findMany({
        where: { userId, projectId, isActive: true },
        select: { id: true, sectionId: true },
    });
    const currentSectionIds = currentAssignments.map((a) => a.sectionId);
    const toAssign = validSectionIds.filter((id) => !currentSectionIds.includes(id));
    const toUnassign = currentAssignments.filter((a) => !validSectionIds.includes(a.sectionId));
    const createdAssignments = await Promise.all(toAssign.map((sectionId) => prisma_1.default.accountantAssignment.create({
        data: {
            userId,
            projectId,
            sectionId,
            createdBy: currentUserId,
        },
        include: {
            user: { select: { id: true, name: true, email: true, role: true } },
            project: { select: { id: true, name: true, code: true } },
            section: { select: { id: true, name: true, code: true } },
        },
    })));
    await Promise.all(toUnassign.map((a) => prisma_1.default.accountantAssignment.update({
        where: { id: a.id },
        data: { isActive: false },
    })));
    res.status(201).json({
        message: "Accountant assignments updated successfully",
        assignedSectionIds: validSectionIds,
        createdAssignments,
        unassignedSectionIds: toUnassign.map((a) => a.sectionId),
    });
});
exports.createAccountantAssignment = createAccountantAssignment;
const getAccountantAssignments = (0, catchAsync_1.default)(async (req, res) => {
    const { userId, projectId, sectionId, isActive } = req.query;
    const where = {};
    if (userId) {
        where.userId = userId;
    }
    if (projectId) {
        where.projectId = projectId;
    }
    if (sectionId) {
        where.sectionId = sectionId;
    }
    if (isActive !== undefined) {
        where.isActive = isActive === "true";
    }
    const assignments = await prisma_1.default.accountantAssignment.findMany({
        where,
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
            },
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            section: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });
    res.json({
        message: "Accountant assignments retrieved successfully",
        assignments,
    });
});
exports.getAccountantAssignments = getAccountantAssignments;
const deactivateAssignment = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id, type } = req.params;
    const currentUserId = req.user.id;
    if (!type) {
        return next(new appError_1.default("Assignment type is required", 400));
    }
    let assignment;
    let model;
    switch (type) {
        case "site-incharge":
            model = prisma_1.default.siteInchargeAssignment;
            break;
        case "project-manager":
            model = prisma_1.default.projectManagerAssignment;
            break;
        case "construction-manager":
            model = prisma_1.default.constructionManagerAssignment;
            break;
        case "store-incharge":
            model = prisma_1.default.storeInchargeAssignment;
            break;
        case "accountant":
            model = prisma_1.default.accountantAssignment;
            break;
        default:
            return next(new appError_1.default("Invalid assignment type", 400));
    }
    const existing = await model.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Assignment not found", 404));
    }
    if (type === "construction-manager") {
        const result = await prisma_1.default.$transaction(async (tx) => {
            const updatedAssignment = await tx.constructionManagerAssignment.update({
                where: { id },
                data: {
                    isActive: false,
                },
            });
            const cmStore = await tx.store.findFirst({
                where: {
                    type: "CM_STORE",
                    cmUserId: existing.userId,
                    sectionId: existing.sectionId,
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
            if (cmStore) {
                const headStore = await tx.store.findFirst({
                    where: {
                        type: "HEAD_STORE",
                        sectionId: existing.sectionId,
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
                                    reference: constants_1.TRANSACTION_REFERENCES.CM_DEACTIVATION_TRANSFER,
                                    notes: `Stock transferred from deactivated CM store (${cmStore.name})`,
                                    createdBy: currentUserId,
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
                        updatedBy: currentUserId,
                        updatedAt: new Date(),
                    },
                });
            }
            return { assignment: updatedAssignment, cmStore };
        });
        res.json({
            message: "Construction Manager assignment and CM store deactivated successfully. Any remaining stock has been transferred to the head store.",
            assignment: result.assignment,
            cmStore: result.cmStore,
        });
    }
    else {
        assignment = await model.update({
            where: { id },
            data: {
                isActive: false,
                updatedBy: currentUserId,
            },
        });
        res.json({
            message: "Assignment deactivated successfully",
            assignment,
        });
    }
});
exports.deactivateAssignment = deactivateAssignment;
const createAndAssignProjectManager = (0, catchAsync_1.default)(async (req, res, next) => {
    const { name, email, projectId, sectionId } = req.body;
    const currentUserId = req.user.id;
    if (!name || !email || !projectId || !sectionId) {
        return next(new appError_1.default("All fields are required", 400));
    }
    const existingUser = await prisma_1.default.user.findFirst({
        where: { email },
    });
    if (existingUser) {
        return next(new appError_1.default("User with this email already exists", 400));
    }
    const employeeId = await (0, generateCode_1.generateEmployeeId)("PROJECT_MANAGER");
    const plainPassword = crypto.randomBytes(8).toString("base64");
    console.log(`Generated password for user ${email}: ${plainPassword}`);
    const hashedPassword = require("bcryptjs").hashSync(plainPassword, 10);
    const user = await prisma_1.default.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
            employeeId,
            role: "PROJECT_MANAGER",
            createdBy: currentUserId,
        },
    });
    const assignment = await prisma_1.default.projectManagerAssignment.create({
        data: {
            userId: user.id,
            projectId,
            sectionId,
            createdBy: currentUserId,
        },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    employeeId: true,
                },
            },
            project: { select: { id: true, name: true, code: true } },
            section: { select: { id: true, name: true, code: true } },
        },
    });
    res.status(201).json({
        message: "Project Manager created and assigned successfully",
        user,
        assignment,
    });
});
exports.createAndAssignProjectManager = createAndAssignProjectManager;
const getUsersByRoleForAssignment = (0, catchAsync_1.default)(async (req, res, next) => {
    const { role, projectId } = req.query;
    if (!role) {
        return next(new appError_1.default("Role is required", 400));
    }
    let users = await prisma_1.default.user.findMany({
        where: { role: role, isActive: true, isDeleted: false },
        select: { id: true, name: true, email: true, employeeId: true },
    });
    if (role === "PROJECT_MANAGER" || role === "CONSTRUCTION_MANAGER") {
        if (projectId) {
            const assigned = await prisma_1.default.projectManagerAssignment.findMany({
                where: { projectId: projectId, isActive: true },
                select: { userId: true },
            });
            const assignedIds = new Set(assigned.map((a) => a.userId));
            const neverAssigned = users.filter(async (u) => {
                const count = await prisma_1.default.projectManagerAssignment.count({
                    where: { userId: u.id, isActive: true },
                });
                return count === 0;
            });
            const assignedToThisProject = users.filter((u) => assignedIds.has(u.id));
            users = [
                ...assignedToThisProject,
                ...neverAssigned.filter((u) => !assignedIds.has(u.id)),
            ];
        }
        else {
            users = await Promise.all(users.filter(async (u) => {
                const count = await prisma_1.default.projectManagerAssignment.count({
                    where: { userId: u.id, isActive: true },
                });
                return count === 0;
            }));
        }
    }
    else if (role === "STORE_INCHARGE" || role === "ACCOUNTANT") {
    }
    res.json({
        message: "Users retrieved successfully",
        users,
    });
});
exports.getUsersByRoleForAssignment = getUsersByRoleForAssignment;
const getSectionsWithSiteInchargeAssignmentStatus = (0, catchAsync_1.default)(async (req, res, next) => {
    const { projectId, userId } = req.query;
    if (!projectId || !userId) {
        return next(new appError_1.default("projectId and userId are required", 400));
    }
    const sections = await prisma_1.default.section.findMany({
        where: { projectId: projectId, isDeleted: false },
        select: { id: true, name: true, code: true, description: true },
    });
    const userAssignments = await prisma_1.default.siteInchargeAssignment.findMany({
        where: {
            userId: userId,
            projectId: projectId,
            isActive: true,
        },
        select: { sectionId: true },
    });
    const assignedSectionIds = new Set(userAssignments.map((a) => a.sectionId));
    const otherAssignments = await prisma_1.default.siteInchargeAssignment.findMany({
        where: {
            projectId: projectId,
            isActive: true,
            NOT: { userId: userId },
        },
        select: { sectionId: true },
    });
    const otherAssignedSectionIds = new Set(otherAssignments.map((a) => a.sectionId));
    const result = sections.map((section) => ({
        ...section,
        isAssigned: assignedSectionIds.has(section.id),
        assignedToCurrentUser: assignedSectionIds.has(section.id),
        assignedToOther: otherAssignedSectionIds.has(section.id),
    }));
    res.json({
        message: "Sections with assignment status retrieved successfully",
        sections: result,
    });
});
exports.getSectionsWithSiteInchargeAssignmentStatus = getSectionsWithSiteInchargeAssignmentStatus;
const getSectionsWithAccountantAssignmentStatus = (0, catchAsync_1.default)(async (req, res, next) => {
    const { projectId, userId } = req.query;
    if (!projectId || !userId) {
        return next(new appError_1.default("projectId and userId are required", 400));
    }
    const sections = await prisma_1.default.section.findMany({
        where: { projectId: projectId, isDeleted: false },
        select: { id: true, name: true, code: true, description: true },
    });
    const userAssignments = await prisma_1.default.accountantAssignment.findMany({
        where: {
            userId: userId,
            projectId: projectId,
            isActive: true,
        },
        select: { sectionId: true },
    });
    const assignedSectionIds = new Set(userAssignments.map((a) => a.sectionId));
    const otherAssignments = await prisma_1.default.accountantAssignment.findMany({
        where: {
            projectId: projectId,
            isActive: true,
            NOT: { userId: userId },
        },
        select: { sectionId: true },
    });
    const otherAssignedSectionIds = new Set(otherAssignments.map((a) => a.sectionId));
    const result = sections.map((section) => ({
        ...section,
        assignedToCurrentUser: assignedSectionIds.has(section.id),
        assignedToOther: otherAssignedSectionIds.has(section.id),
    }));
    res.json({
        message: "Sections with assignment status retrieved successfully",
        sections: result,
    });
});
exports.getSectionsWithAccountantAssignmentStatus = getSectionsWithAccountantAssignmentStatus;
//# sourceMappingURL=assignment.controller.js.map