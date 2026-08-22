"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fulfillDemand = exports.rejectDemand = exports.approveDemand = exports.updateDemandStatus = exports.deleteDemand = exports.updateDemand = exports.getDemandById = exports.getDemands = exports.createDemand = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const generateCode_1 = require("../utils/generateCode");
const buildQueryOptions_1 = require("../utils/buildQueryOptions");
const notification_1 = require("../utils/notification");
const notificationService_1 = require("../utils/notificationService");
const prisma_1 = __importDefault(require("../utils/prisma"));
const storeInchargeAccess_1 = require("../utils/storeInchargeAccess");
const adminRoles_1 = require("../utils/adminRoles");
const createDemand = (0, catchAsync_1.default)(async (req, res, next) => {
    const { materialId, quantity, unit, sectionId, notes } = req.body;
    const userId = req.user.id;
    if (!sectionId || !materialId || !quantity || !unit) {
        return next(new appError_1.default("sectionId, materialId, quantity, and unit are required", 400));
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        return next(new appError_1.default("User not found", 404));
    }
    if (user.role !== "CONSTRUCTION_MANAGER") {
        return next(new appError_1.default("Only Construction Managers can create demands", 403));
    }
    const section = await prisma_1.default.section.findUnique({
        where: { id: sectionId },
        include: {
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
        },
    });
    if (!section) {
        return next(new appError_1.default("Section not found", 404));
    }
    const material = await prisma_1.default.material.findUnique({
        where: { id: materialId },
    });
    if (!material) {
        return next(new appError_1.default("Material not found", 404));
    }
    const referenceNumber = await (0, generateCode_1.generateDemandCode)(section.projectId);
    const demand = await prisma_1.default.demand.create({
        data: {
            materialId,
            quantity,
            unit,
            sectionId,
            notes,
            status: "REQUEST_SENT",
            createdBy: userId,
            referenceNumber,
            quantityRemaining: quantity,
        },
        include: {
            section: {
                include: {
                    project: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        },
                    },
                },
            },
            material: true,
            creator: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
            },
        },
    });
    res.status(201).json({
        message: "Demand created successfully",
        demand,
    });
    await notificationService_1.NotificationService.notifyDemandCreated(demand.id);
});
exports.createDemand = createDemand;
const getDemands = (0, catchAsync_1.default)(async (req, res) => {
    const user = req.user;
    const filterOptions = (0, buildQueryOptions_1.extractQueryParams)(req);
    const searchableFields = ["referenceNumber", "notes", "activity"];
    let defaultFilters = { isDeleted: false };
    if (user.role === "ADMIN") {
    }
    else if (user.role === "ACCOUNTANT") {
        if (user.isHead) {
            const assignments = await prisma_1.default.accountantAssignment.findMany({
                where: { userId: user.id, isActive: true },
                select: { projectId: true },
            });
            const projectIds = Array.from(new Set(assignments.map((a) => a.projectId)));
            const projectSections = await prisma_1.default.section.findMany({
                where: { projectId: { in: projectIds }, isDeleted: false },
                select: { id: true },
            });
            const sectionIds = projectSections.map((s) => s.id);
            defaultFilters.sectionId = { in: sectionIds };
        }
        else {
            const assignments = await prisma_1.default.accountantAssignment.findMany({
                where: { userId: user.id, isActive: true },
                select: { sectionId: true },
            });
            const sectionIds = assignments
                .map((a) => a.sectionId)
                .filter((id) => !!id);
            defaultFilters.sectionId = { in: sectionIds };
        }
    }
    else if (user.role === "SITE_INCHARGE") {
        const assignments = await prisma_1.default.siteInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        defaultFilters.sectionId = { in: sectionIds };
    }
    else if (user.role === "PROJECT_MANAGER") {
        const assignments = await prisma_1.default.projectManagerAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        defaultFilters.sectionId = { in: sectionIds };
    }
    else if (user.role === "CONSTRUCTION_MANAGER") {
        const assignments = await prisma_1.default.constructionManagerAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        defaultFilters.sectionId = { in: sectionIds };
        defaultFilters.createdBy = user.id;
    }
    else if (user.role === "STORE_INCHARGE") {
        const sectionIds = await (0, storeInchargeAccess_1.getStoreInchargeAccessibleSectionIds)(user);
        defaultFilters.sectionId = { in: sectionIds };
    }
    const queryOptions = (0, buildQueryOptions_1.buildQueryOptions)(filterOptions, defaultFilters, searchableFields);
    const total = await prisma_1.default.demand.count({
        where: queryOptions.where,
    });
    const demands = await prisma_1.default.demand.findMany({
        ...queryOptions,
        include: {
            section: {
                include: {
                    project: {
                        select: { name: true },
                    },
                },
            },
            material: true,
            creator: true,
            updater: true,
            approvals: true,
            fulfillments: true,
            purchaseOrders: true,
        },
    });
    const demandsWithProjectName = demands.map((demand) => {
        if (demand.section &&
            typeof demand.section === "object" &&
            "project" in demand.section &&
            demand.section.project &&
            typeof demand.section.project === "object" &&
            "name" in demand.section.project) {
            demand.section.projectName = demand.section.project.name;
            delete demand.section.project;
        }
        return demand;
    });
    const paginationMeta = (0, buildQueryOptions_1.buildPaginationMeta)(total, filterOptions.page || 1, filterOptions.limit || 50);
    res.json({
        message: "Demands retrieved successfully",
        demands: demandsWithProjectName,
        ...paginationMeta,
    });
});
exports.getDemands = getDemands;
const getDemandById = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const user = req.user;
    const demand = await prisma_1.default.demand.findUnique({
        where: { id },
        include: {
            section: {
                include: {
                    project: {
                        select: { name: true },
                    },
                },
            },
            material: true,
            creator: true,
            updater: true,
            approvals: {
                include: {
                    user: {
                        select: {
                            name: true,
                            role: true,
                        },
                    },
                },
            },
            fulfillments: true,
            purchaseOrders: {
                include: {
                    demand: {
                        include: {
                            section: {
                                include: {
                                    project: true,
                                },
                            },
                        },
                    },
                    section: true,
                    material: true,
                    vendor: true,
                },
            },
        },
    });
    if (!demand) {
        return next(new appError_1.default("Demand not found", 404));
    }
    if (user.role !== "ADMIN") {
        let assigned = false;
        const sectionId = demand.sectionId;
        if (user.role === "SITE_INCHARGE") {
            const assignment = await prisma_1.default.siteInchargeAssignment.findFirst({
                where: { userId: user.id, sectionId, isActive: true },
            });
            assigned = !!assignment;
        }
        else if (user.role === "PROJECT_MANAGER") {
            const assignment = await prisma_1.default.projectManagerAssignment.findFirst({
                where: { userId: user.id, sectionId, isActive: true },
            });
            assigned = !!assignment;
        }
        else if (user.role === "CONSTRUCTION_MANAGER") {
            const assignment = await prisma_1.default.constructionManagerAssignment.findFirst({
                where: { userId: user.id, sectionId, isActive: true },
            });
            assigned = !!assignment;
        }
        else if (user.role === "STORE_INCHARGE") {
            const accessibleSectionIds = await (0, storeInchargeAccess_1.getStoreInchargeAccessibleSectionIds)(user);
            assigned = accessibleSectionIds.includes(sectionId);
        }
        else if (user.role === "ACCOUNTANT") {
            if (user.isHead) {
                const demandSection = await prisma_1.default.section.findUnique({
                    where: { id: sectionId },
                    select: { projectId: true },
                });
                if (demandSection) {
                    const projectAssignment = await prisma_1.default.accountantAssignment.findFirst({
                        where: { userId: user.id, projectId: demandSection.projectId, isActive: true },
                    });
                    assigned = !!projectAssignment;
                }
            }
            else {
                const assignment = await prisma_1.default.accountantAssignment.findFirst({
                    where: { userId: user.id, sectionId, isActive: true },
                });
                assigned = !!assignment;
            }
        }
        if (!assigned) {
            return next(new appError_1.default("Access denied: not assigned to this demand's section", 403));
        }
    }
    if (demand.section &&
        typeof demand.section === "object" &&
        "project" in demand.section &&
        demand.section.project &&
        typeof demand.section.project === "object" &&
        "name" in demand.section.project) {
        demand.section.projectName = demand.section.project.name;
        delete demand.section.project;
    }
    let cmStoreQty = 0;
    let headStoreQty = 0;
    let cmStoreId = null;
    let headStoreId = null;
    try {
        const demandProjectId = demand.section && typeof demand.section === "object"
            ? demand.section.projectId
            : null;
        const [cmStoreExact, sectionStoreFallback, headStore] = await Promise.all([
            prisma_1.default.store.findFirst({
                where: {
                    sectionId: demand.sectionId,
                    type: "CM_STORE",
                    isActive: true,
                    isDeleted: false,
                },
            }),
            prisma_1.default.store.findFirst({
                where: {
                    sectionId: demand.sectionId,
                    type: "SECTION_STORE",
                    isActive: true,
                    isDeleted: false,
                },
            }),
            prisma_1.default.store.findFirst({
                where: {
                    projectId: demandProjectId || undefined,
                    type: "HEAD_STORE",
                    isActive: true,
                    isDeleted: false,
                },
            }),
        ]);
        const cmStore = cmStoreExact || sectionStoreFallback;
        if (cmStore) {
            cmStoreId = cmStore.id;
            const cmInv = await prisma_1.default.storeInventory.findUnique({
                where: {
                    storeId_materialId: {
                        storeId: cmStore.id,
                        materialId: demand.materialId,
                    },
                },
            });
            cmStoreQty = cmInv ? Number(cmInv.available) : 0;
        }
        if (headStore) {
            headStoreId = headStore.id;
            const headInv = await prisma_1.default.storeInventory.findUnique({
                where: {
                    storeId_materialId: {
                        storeId: headStore.id,
                        materialId: demand.materialId,
                    },
                },
            });
            headStoreQty = headInv ? Number(headInv.available) : 0;
        }
    }
    catch (e) {
    }
    res.json({
        message: "Demand retrieved successfully",
        demand: {
            ...demand,
            cmStoreQty,
            headStoreQty,
            cmStoreId,
            headStoreId,
            approvals: Array.isArray(demand.approvals)
                ? demand.approvals.map((a) => ({
                    ...a,
                    userName: a.user && a.user.name ? a.user.name : null,
                    userRole: a.user && a.user.role ? a.user.role : null,
                    timestamp: a.createdAt,
                }))
                : demand.approvals,
        },
    });
});
exports.getDemandById = getDemandById;
const updateDemand = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const updates = { ...req.body };
    const userId = req.user.id;
    delete updates.id;
    delete updates.createdAt;
    delete updates.createdBy;
    delete updates.sectionId;
    delete updates.referenceNumber;
    const existing = await prisma_1.default.demand.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Demand not found", 404));
    }
    const updatedDemand = await prisma_1.default.demand.update({
        where: { id },
        data: {
            ...updates,
            updatedBy: userId,
            updatedAt: new Date(),
        },
        include: {
            section: true,
            material: true,
            creator: true,
            updater: true,
            approvals: {
                include: {
                    user: {
                        select: {
                            name: true,
                            role: true,
                        },
                    },
                },
            },
            fulfillments: true,
            purchaseOrders: true,
        },
    });
    res.json({
        message: "Demand updated successfully",
        demand: {
            ...updatedDemand,
            approvals: Array.isArray(updatedDemand.approvals)
                ? updatedDemand.approvals.map((a) => ({
                    ...a,
                    userName: a.user && a.user.name ? a.user.name : null,
                    userRole: a.user && a.user.role ? a.user.role : null,
                    timestamp: a.createdAt,
                }))
                : updatedDemand.approvals,
        },
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: updatedDemand.updatedBy ?? userId,
        title: "Demand Updated",
        body: `Demand (${updatedDemand.referenceNumber}) was updated successfully.`,
    });
});
exports.updateDemand = updateDemand;
const deleteDemand = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const existing = await prisma_1.default.demand.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Demand not found", 404));
    }
    await prisma_1.default.demand.delete({
        where: { id },
    });
    res.json({
        message: "Demand deleted successfully",
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: existing.createdBy,
        title: "Demand Deleted",
        body: `Your demand (${existing.referenceNumber}) was deleted.`,
    });
});
exports.deleteDemand = deleteDemand;
const updateDemandStatus = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.id;
    if (!status) {
        return next(new appError_1.default("Status is required", 400));
    }
    const existing = await prisma_1.default.demand.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Demand not found", 404));
    }
    const updatedDemand = await prisma_1.default.demand.update({
        where: { id },
        data: {
            status,
            updatedBy: userId,
            updatedAt: new Date(),
        },
        include: {
            section: true,
            material: true,
            creator: true,
            updater: true,
            approvals: {
                include: {
                    user: {
                        select: {
                            name: true,
                            role: true,
                        },
                    },
                },
            },
            fulfillments: true,
            purchaseOrders: true,
        },
    });
    res.json({
        message: "Demand status updated successfully",
        demand: {
            ...updatedDemand,
            approvals: Array.isArray(updatedDemand.approvals)
                ? updatedDemand.approvals.map((a) => ({
                    ...a,
                    userName: a.user && a.user.name ? a.user.name : null,
                    userRole: a.user && a.user.role ? a.user.role : null,
                    timestamp: a.createdAt,
                }))
                : updatedDemand.approvals,
        },
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: updatedDemand.updatedBy ?? userId,
        title: "Demand Status Updated",
        body: `Demand (${updatedDemand.referenceNumber}) status changed to ${updatedDemand.status}.`,
    });
});
exports.updateDemandStatus = updateDemandStatus;
const approveDemand = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const { remarks } = req.body;
    const userId = req.user.id;
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        return next(new appError_1.default("User not found", 404));
    }
    if (!adminRoles_1.DEMAND_APPROVER_ROLES.includes(user.role)) {
        return next(new appError_1.default("Only Project Managers, Site Incharges, or Admins can approve demands", 403));
    }
    const demand = await prisma_1.default.demand.findUnique({
        where: { id },
        include: {
            approvals: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            role: true,
                        },
                    },
                },
            },
        },
    });
    if (!demand) {
        return next(new appError_1.default("Demand not found", 404));
    }
    if (demand.isDeleted) {
        return next(new appError_1.default("Demand is deleted", 400));
    }
    const existingApproval = demand.approvals.find((approval) => approval.userId === userId);
    if (existingApproval) {
        return next(new appError_1.default("You have already provided feedback for this demand", 400));
    }
    const hasRejection = demand.approvals.some((approval) => approval.status === "REJECTED");
    if (hasRejection) {
        return next(new appError_1.default("Demand is already rejected", 400));
    }
    const approvalCount = demand.approvals.filter((approval) => approval.status === "APPROVED").length;
    if (approvalCount >= 2) {
        return next(new appError_1.default("Demand is already fully approved", 400));
    }
    const result = await prisma_1.default.$transaction(async (tx) => {
        const approval = await tx.demandApproval.create({
            data: {
                demandId: id,
                userId,
                status: "APPROVED",
                remarks: remarks || "Approved",
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        role: true,
                    },
                },
            },
        });
        const updatedDemand = await tx.demand.findUnique({
            where: { id },
            include: {
                approvals: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                role: true,
                            },
                        },
                    },
                },
            },
        });
        const newApprovalCount = updatedDemand.approvals.filter((a) => a.status === "APPROVED").length;
        const hasRejection = updatedDemand.approvals.some((a) => a.status === "REJECTED");
        let newStatus = "REQUEST_SENT";
        if (hasRejection) {
            newStatus = "REJECTED";
        }
        else if (newApprovalCount >= 2) {
            newStatus = "APPROVED";
        }
        else if (newApprovalCount === 1) {
            newStatus = "PARTIALLY_APPROVED";
        }
        const finalDemand = await tx.demand.update({
            where: { id },
            data: {
                status: newStatus,
                updatedBy: userId,
                updatedAt: new Date(),
            },
            include: {
                section: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                            },
                        },
                    },
                },
                material: true,
                creator: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
                approvals: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                role: true,
                            },
                        },
                    },
                    orderBy: { createdAt: "asc" },
                },
            },
        });
        return { approval, demand: finalDemand };
    });
    res.json({
        message: "Demand approved successfully",
        data: {
            approval: {
                ...result.approval,
                userName: result.approval.user?.name || null,
                userRole: result.approval.user?.role || null,
                timestamp: result.approval.createdAt,
            },
            demand: {
                ...result.demand,
                approvals: Array.isArray(result.demand.approvals)
                    ? result.demand.approvals.map((a) => ({
                        ...a,
                        userName: a.user && a.user.name ? a.user.name : null,
                        userRole: a.user && a.user.role ? a.user.role : null,
                        timestamp: a.createdAt,
                    }))
                    : result.demand.approvals,
            },
            newStatus: result.demand.status,
        },
    });
    await notificationService_1.NotificationService.notifyDemandApproval(id, userId, "APPROVED");
});
exports.approveDemand = approveDemand;
const rejectDemand = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const { remarks } = req.body;
    const userId = req.user.id;
    if (!remarks) {
        return next(new appError_1.default("Rejection remarks are required", 400));
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        return next(new appError_1.default("User not found", 404));
    }
    if (!adminRoles_1.DEMAND_APPROVER_ROLES.includes(user.role)) {
        return next(new appError_1.default("Only Project Managers, Site Incharges, or Admins can reject demands", 403));
    }
    const demand = await prisma_1.default.demand.findUnique({
        where: { id },
        include: {
            approvals: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            role: true,
                        },
                    },
                },
            },
        },
    });
    if (!demand) {
        return next(new appError_1.default("Demand not found", 404));
    }
    if (demand.isDeleted) {
        return next(new appError_1.default("Demand is deleted", 400));
    }
    const existingApproval = demand.approvals.find((approval) => approval.userId === userId);
    if (existingApproval) {
        return next(new appError_1.default("You have already provided feedback for this demand", 400));
    }
    const hasRejection = demand.approvals.some((approval) => approval.status === "REJECTED");
    if (hasRejection) {
        return next(new appError_1.default("Demand is already rejected", 400));
    }
    const result = await prisma_1.default.$transaction(async (tx) => {
        const approval = await tx.demandApproval.create({
            data: {
                demandId: id,
                userId,
                status: "REJECTED",
                remarks,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        role: true,
                    },
                },
            },
        });
        const updatedDemand = await tx.demand.update({
            where: { id },
            data: {
                status: "REJECTED",
                updatedBy: userId,
                updatedAt: new Date(),
            },
            include: {
                section: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                            },
                        },
                    },
                },
                material: true,
                creator: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
                approvals: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                role: true,
                            },
                        },
                    },
                    orderBy: { createdAt: "asc" },
                },
            },
        });
        return { approval, demand: updatedDemand };
    });
    res.json({
        message: "Demand rejected successfully",
        data: {
            approval: {
                ...result.approval,
                userName: result.approval.user?.name || null,
                userRole: result.approval.user?.role || null,
                timestamp: result.approval.createdAt,
            },
            demand: {
                ...result.demand,
                approvals: Array.isArray(result.demand.approvals)
                    ? result.demand.approvals.map((a) => ({
                        ...a,
                        userName: a.user && a.user.name ? a.user.name : null,
                        userRole: a.user && a.user.role ? a.user.role : null,
                        timestamp: a.createdAt,
                    }))
                    : result.demand.approvals,
            },
        },
    });
    await notificationService_1.NotificationService.notifyDemandApproval(id, userId, "REJECTED");
});
exports.rejectDemand = rejectDemand;
const fulfillDemand = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const { fromStoreId, toStoreId, quantity, notes, } = req.body;
    const userId = req.user.id;
    if (!fromStoreId || !toStoreId || !quantity) {
        return next(new appError_1.default("fromStoreId, toStoreId, and quantity are required", 400));
    }
    if (quantity <= 0) {
        return next(new appError_1.default("Quantity must be greater than 0", 400));
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        return next(new appError_1.default("User not found", 404));
    }
    const allowedRoles = ["PROJECT_MANAGER", "SITE_INCHARGE"];
    if (!allowedRoles.includes(user.role)) {
        return next(new appError_1.default("Only Project Managers or Site Incharges can fulfill demands", 403));
    }
    const demand = await prisma_1.default.demand.findUnique({
        where: { id },
        include: {
            section: {
                include: {
                    project: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        },
                    },
                },
            },
            material: true,
            fulfillments: true,
        },
    });
    if (!demand) {
        return next(new appError_1.default("Demand not found", 404));
    }
    if (demand.isDeleted) {
        return next(new appError_1.default("Demand is deleted", 400));
    }
    if (demand.status !== "APPROVED") {
        return next(new appError_1.default("Only approved demands can be fulfilled", 400));
    }
    const remainingQuantity = demand.quantityRemaining || demand.quantity;
    if (quantity > remainingQuantity) {
        return next(new appError_1.default(`Quantity exceeds remaining demand. Remaining: ${remainingQuantity}, Requested: ${quantity}`, 400));
    }
    const [fromStore, toStore] = await Promise.all([
        prisma_1.default.store.findUnique({
            where: { id: fromStoreId },
            include: { section: true },
        }),
        prisma_1.default.store.findUnique({
            where: { id: toStoreId },
            include: { section: true },
        }),
    ]);
    if (!fromStore || !toStore) {
        return next(new appError_1.default("One or both stores not found", 404));
    }
    if (fromStore.type !== "HEAD_STORE") {
        return next(new appError_1.default("From store must be a head store", 400));
    }
    if (!["CM_STORE", "SECTION_STORE"].includes(toStore.type)) {
        return next(new appError_1.default("To store must be a section-level store", 400));
    }
    const demandProjectId = demand.section?.projectId;
    if (fromStore.projectId !== demandProjectId ||
        toStore.sectionId !== demand.sectionId) {
        return next(new appError_1.default("Source and destination stores are not valid for this demand's project/section", 400));
    }
    const headStoreInventory = await prisma_1.default.storeInventory.findUnique({
        where: {
            storeId_materialId: {
                storeId: fromStoreId,
                materialId: demand.materialId,
            },
        },
    });
    if (!headStoreInventory || headStoreInventory.available < quantity) {
        return next(new appError_1.default(`Insufficient stock in head store. Available: ${headStoreInventory?.available || 0}, Requested: ${quantity}`, 400));
    }
    const result = await prisma_1.default.$transaction(async (tx) => {
        const fulfillment = await tx.demandFulfillment.create({
            data: {
                demandId: id,
                fromStoreId,
                toStoreId,
                quantity,
                fulfilledBy: userId,
            },
            include: {
                fromStore: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                    },
                },
                toStore: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                    },
                },
            },
        });
        await tx.storeInventory.update({
            where: {
                storeId_materialId: {
                    storeId: fromStoreId,
                    materialId: demand.materialId,
                },
            },
            data: {
                stock: {
                    decrement: quantity,
                },
                available: {
                    decrement: quantity,
                },
            },
        });
        await tx.storeInventory.upsert({
            where: {
                storeId_materialId: {
                    storeId: toStoreId,
                    materialId: demand.materialId,
                },
            },
            update: {
                stock: {
                    increment: quantity,
                },
                available: {
                    increment: quantity,
                },
            },
            create: {
                storeId: toStoreId,
                materialId: demand.materialId,
                stock: quantity,
                available: quantity,
                reserved: 0,
            },
        });
        await Promise.all([
            tx.storeTransaction.create({
                data: {
                    storeId: fromStoreId,
                    materialId: demand.materialId,
                    type: "OUT",
                    quantity,
                    reference: demand.referenceNumber,
                    notes: notes || `Fulfilled demand ${demand.referenceNumber}`,
                    createdBy: userId,
                    toStoreId: toStoreId,
                },
            }),
            tx.storeTransaction.create({
                data: {
                    storeId: toStoreId,
                    materialId: demand.materialId,
                    type: "IN",
                    quantity,
                    reference: demand.referenceNumber,
                    notes: notes ||
                        `Received from demand fulfillment ${demand.referenceNumber}`,
                    createdBy: userId,
                    fromStoreId: fromStoreId,
                },
            }),
        ]);
        const newRemainingQuantity = Number(remainingQuantity) - Number(quantity);
        const newFulfilledQuantity = Number(demand.quantityFulfilled || 0) + Number(quantity);
        const updatedDemand = await tx.demand.update({
            where: { id },
            data: {
                quantityRemaining: newRemainingQuantity,
                quantityFulfilled: newFulfilledQuantity,
                status: newRemainingQuantity <= 0 ? "COMPLETED" : "FULFILLED_FROM_STORE",
                updatedBy: userId,
                updatedAt: new Date(),
            },
            include: {
                section: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                            },
                        },
                    },
                },
                material: true,
                creator: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
                fulfillments: {
                    include: {
                        fromStore: {
                            select: {
                                id: true,
                                name: true,
                                type: true,
                            },
                        },
                        toStore: {
                            select: {
                                id: true,
                                name: true,
                                type: true,
                            },
                        },
                    },
                    orderBy: { fulfilledAt: "asc" },
                },
            },
        });
        return { fulfillment, demand: updatedDemand };
    });
    res.json({
        message: "Demand fulfilled successfully",
        data: {
            fulfillment: result.fulfillment,
            demand: result.demand,
            remainingQuantity: result.demand.quantityRemaining,
        },
    });
});
exports.fulfillDemand = fulfillDemand;
//# sourceMappingURL=demand.controller.js.map