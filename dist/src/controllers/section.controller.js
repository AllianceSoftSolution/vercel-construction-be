"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivateSection = exports.activateSection = exports.deleteSection = exports.updateSection = exports.getSectionById = exports.getSections = exports.createSection = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const generateCode_1 = require("../utils/generateCode");
const buildQueryOptions_1 = require("../utils/buildQueryOptions");
const notification_1 = require("../utils/notification");
const prisma_1 = __importDefault(require("../utils/prisma"));
const createSection = (0, catchAsync_1.default)(async (req, res, next) => {
    const { name, description, projectId } = req.body;
    const userId = req.user.id;
    if (!name || !projectId) {
        return next(new appError_1.default("Name and projectId are required", 400));
    }
    const project = await prisma_1.default.project.findUnique({
        where: { id: projectId },
    });
    if (!project) {
        return next(new appError_1.default("Project not found", 404));
    }
    const code = await (0, generateCode_1.generateSectionCode)(projectId);
    const createdSection = await prisma_1.default.section.create({
        data: {
            name,
            code,
            description,
            projectId,
            createdBy: userId,
        },
    });
    const section = await prisma_1.default.section.findUnique({
        where: { id: createdSection.id },
        include: {
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            stores: {
                where: { isDeleted: false },
                include: {
                    cmUser: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },
                    storeInchargeAssignments: {
                        where: { isActive: true },
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    if (!section) {
        return next(new appError_1.default("Section not found after creation", 404));
    }
    res.status(201).json({
        message: "Section created successfully",
        section,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Section Created",
        body: `Section ${section.name} was created successfully.`,
    });
});
exports.createSection = createSection;
const getSections = (0, catchAsync_1.default)(async (req, res) => {
    const user = req.user;
    const filterOptions = (0, buildQueryOptions_1.extractQueryParams)(req);
    const searchableFields = ["name", "code", "description"];
    let defaultFilters = { isDeleted: false };
    if (user.role === "ADMIN") {
    }
    else if (user.role === "SITE_INCHARGE") {
        const assignments = await prisma_1.default.siteInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        defaultFilters.id = { in: sectionIds };
    }
    else if (user.role === "PROJECT_MANAGER") {
        const assignments = await prisma_1.default.projectManagerAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        defaultFilters.id = { in: sectionIds };
    }
    else if (user.role === "CONSTRUCTION_MANAGER") {
        const assignments = await prisma_1.default.constructionManagerAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        defaultFilters.id = { in: sectionIds };
    }
    else if (user.role === "STORE_INCHARGE") {
        const assignments = await prisma_1.default.storeInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { store: { select: { sectionId: true } } },
        });
        const sectionIds = assignments.map((a) => a.store.sectionId);
        defaultFilters.id = { in: sectionIds };
    }
    else if (user.role === "ACCOUNTANT") {
        if (user.isHead) {
        }
        else {
            const assignments = await prisma_1.default.accountantAssignment.findMany({
                where: { userId: user.id, isActive: true },
                select: { sectionId: true },
            });
            const sectionIds = assignments.map((a) => a.sectionId);
            defaultFilters.id = { in: sectionIds };
        }
    }
    const queryOptions = (0, buildQueryOptions_1.buildQueryOptions)(filterOptions, defaultFilters, searchableFields);
    const total = await prisma_1.default.section.count({
        where: queryOptions.where,
    });
    const sections = await prisma_1.default.section.findMany({
        ...queryOptions,
        include: {
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            stores: {
                where: { isDeleted: false },
                include: {
                    cmUser: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },
                    storeInchargeAssignments: {
                        where: { isActive: true },
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                },
                            },
                        },
                    },
                },
            },
            _count: {
                select: {
                    stores: true,
                    demands: true,
                },
            },
        },
    });
    const sectionsWithAmounts = await Promise.all(sections.map(async (section) => {
        const sectionPOs = await prisma_1.default.purchaseOrder.aggregate({
            where: {
                sectionId: section.id,
                isDeleted: false,
                totalAmount: { not: null },
            },
            _sum: {
                totalAmount: true,
            },
        });
        return {
            ...section,
            totalAmountSpent: sectionPOs._sum.totalAmount || 0,
        };
    }));
    const paginationMeta = (0, buildQueryOptions_1.buildPaginationMeta)(total, filterOptions.page || 1, filterOptions.limit || 50);
    res.json({
        message: "Sections retrieved successfully",
        sections: sectionsWithAmounts,
        ...paginationMeta,
    });
});
exports.getSections = getSections;
const getSectionById = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const user = req.user;
    if (user.role !== "ADMIN") {
        let assigned = false;
        if (user.role === "SITE_INCHARGE") {
            const assignment = await prisma_1.default.siteInchargeAssignment.findFirst({
                where: { userId: user.id, sectionId: id, isActive: true },
            });
            assigned = !!assignment;
        }
        else if (user.role === "PROJECT_MANAGER") {
            const assignment = await prisma_1.default.projectManagerAssignment.findFirst({
                where: { userId: user.id, sectionId: id, isActive: true },
            });
            assigned = !!assignment;
        }
        else if (user.role === "CONSTRUCTION_MANAGER") {
            const assignment = await prisma_1.default.constructionManagerAssignment.findFirst({
                where: { userId: user.id, sectionId: id, isActive: true },
            });
            assigned = !!assignment;
        }
        else if (user.role === "STORE_INCHARGE") {
            const assignment = await prisma_1.default.storeInchargeAssignment.findFirst({
                where: { userId: user.id, isActive: true, store: { sectionId: id } },
            });
            assigned = !!assignment;
        }
        else if (user.role === "ACCOUNTANT") {
            if (user.isHead) {
                assigned = true;
            }
            else {
                const assignment = await prisma_1.default.accountantAssignment.findFirst({
                    where: { userId: user.id, sectionId: id, isActive: true },
                });
                assigned = !!assignment;
            }
        }
        if (!assigned) {
            return next(new appError_1.default("Access denied: not assigned to this section", 403));
        }
    }
    const section = await prisma_1.default.section.findUnique({
        where: { id },
        include: {
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            stores: {
                where: {
                    isDeleted: false,
                },
                include: {
                    cmUser: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },
                    storeInchargeAssignments: {
                        where: { isActive: true },
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                },
                            },
                        },
                    },
                },
            },
            siteInchargeAssignments: {
                where: { isActive: true },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },
                },
            },
            projectManagerAssignments: {
                where: { isActive: true },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            creator: true,
                        },
                    },
                },
            },
            constructionManagerAssignments: {
                where: { isActive: true },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            creator: true,
                        },
                    },
                },
            },
            accountantAssignments: {
                where: { isActive: true },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },
                },
            },
            demands: {
                where: { isDeleted: false },
                select: {
                    id: true,
                    referenceNumber: true,
                    status: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "desc" },
                take: 10,
            },
        },
    });
    if (!section) {
        return next(new appError_1.default("Section not found", 404));
    }
    const sectionPOs = await prisma_1.default.purchaseOrder.aggregate({
        where: {
            sectionId: section.id,
            isDeleted: false,
            totalAmount: { not: null },
        },
        _sum: {
            totalAmount: true,
        },
    });
    const materialCaps = await prisma_1.default.materialCap.findMany({
        where: {
            sectionId: section.id,
            isDeleted: false,
        },
        include: {
            material: {
                select: {
                    id: true,
                    name: true,
                    unit: true,
                    category: true,
                },
            },
        },
    });
    const sectionDemands = await prisma_1.default.demand.findMany({
        where: {
            sectionId: section.id,
            isDeleted: false,
        },
        select: {
            materialId: true,
            quantity: true,
            unit: true,
            status: true,
        },
    });
    const sectionPurchaseOrders = await prisma_1.default.purchaseOrder.findMany({
        where: {
            sectionId: section.id,
            isDeleted: false,
        },
        select: {
            materialId: true,
            quantity: true,
            status: true,
        },
    });
    const materialCapAnalytics = materialCaps.map((cap) => {
        const materialDemands = sectionDemands.filter((d) => d.materialId === cap.materialId);
        const totalDemandQuantity = materialDemands.reduce((sum, demand) => sum + Number(demand.quantity), 0);
        const materialPOs = sectionPurchaseOrders.filter((po) => po.materialId === cap.materialId);
        const totalPOQuantity = materialPOs.reduce((sum, po) => sum + Number(po.quantity), 0);
        const capQuantity = Number(cap.quantity);
        const isCapExceeded = totalDemandQuantity > capQuantity;
        const isPOExceeded = totalPOQuantity > capQuantity;
        const isInLimit = !isCapExceeded && !isPOExceeded;
        const demandUsagePercentage = capQuantity > 0 ? (totalDemandQuantity / capQuantity) * 100 : 0;
        const poUsagePercentage = capQuantity > 0 ? (totalPOQuantity / capQuantity) * 100 : 0;
        return {
            materialId: cap.materialId,
            materialName: cap.material.name,
            materialUnit: cap.material.unit,
            materialCategory: cap.material.category,
            capQuantity: capQuantity,
            capUnit: cap.unit,
            totalDemandQuantity: totalDemandQuantity,
            totalPurchaseOrderQuantity: totalPOQuantity,
            isDemandCapExceeded: isCapExceeded,
            isPurchaseOrderCapExceeded: isPOExceeded,
            isWithinLimit: isInLimit,
            demandUsagePercentage: Math.round(demandUsagePercentage * 100) / 100,
            purchaseOrderUsagePercentage: Math.round(poUsagePercentage * 100) / 100,
            remainingQuantity: capQuantity - Math.max(totalDemandQuantity, totalPOQuantity),
            status: isCapExceeded
                ? "EXCEEDED"
                : isPOExceeded
                    ? "PO_EXCEEDED"
                    : "WITHIN_LIMIT",
        };
    });
    const headStore = section.stores.find((s) => s.type === "HEAD_STORE");
    const response = {
        id: section.id,
        name: section.name,
        code: section.code,
        description: section.description,
        projectId: section.projectId,
        isActive: section.isActive,
        isDeleted: section.isDeleted,
        createdAt: section.createdAt,
        updatedAt: section.updatedAt,
        createdBy: section.createdBy,
        updatedBy: section.updatedBy,
        project: section.project,
        headStore,
        associatedProjectManager: section.projectManagerAssignments.length > 0
            ? section.projectManagerAssignments[0]
            : null,
        associatedConstructionManagers: await Promise.all(section.constructionManagerAssignments.map(async (cmAssignment) => {
            const cmStore = await prisma_1.default.store.findFirst({
                where: {
                    type: "CM_STORE",
                    cmUserId: cmAssignment.userId,
                    sectionId: section.id,
                    isDeleted: false,
                },
                select: {
                    id: true,
                    name: true,
                    type: true,
                    isActive: true,
                    isDeleted: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            return {
                ...cmAssignment,
                cmStore,
            };
        })),
        associatedSiteIncharges: section.siteInchargeAssignments,
        associatedAccountants: section.accountantAssignments,
        recentDemands: section.demands,
        totalAmountSpent: sectionPOs._sum.totalAmount || 0,
        materialCapAnalytics: materialCapAnalytics,
    };
    res.json({
        message: "Section retrieved successfully",
        section: response,
    });
});
exports.getSectionById = getSectionById;
const updateSection = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const updates = { ...req.body };
    const userId = req.user.id;
    delete updates.id;
    delete updates.createdAt;
    delete updates.createdBy;
    delete updates.projectId;
    delete updates.code;
    const existing = await prisma_1.default.section.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Section not found", 404));
    }
    const updatedSection = await prisma_1.default.section.update({
        where: { id },
        data: {
            ...updates,
            updatedBy: userId,
            updatedAt: new Date(),
        },
        include: {
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            stores: {
                where: { isDeleted: false },
                include: {
                    cmUser: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },
                    storeInchargeAssignments: {
                        where: { isActive: true },
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    res.json({
        message: "Section updated successfully",
        section: updatedSection,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Section Updated",
        body: `Section ${updatedSection.name} was updated successfully.`,
    });
});
exports.updateSection = updateSection;
const deleteSection = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.section.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Section not found", 404));
    }
    await prisma_1.default.siteInchargeAssignment.deleteMany({ where: { sectionId: id } });
    await prisma_1.default.projectManagerAssignment.deleteMany({
        where: { sectionId: id },
    });
    await prisma_1.default.constructionManagerAssignment.deleteMany({
        where: { sectionId: id },
    });
    await prisma_1.default.accountantAssignment.deleteMany({ where: { sectionId: id } });
    const stores = await prisma_1.default.store.findMany({ where: { sectionId: id } });
    for (const store of stores) {
        await prisma_1.default.storeInchargeAssignment.deleteMany({
            where: { storeId: store.id },
        });
    }
    await prisma_1.default.section.update({
        where: { id },
        data: {
            isDeleted: true,
            isActive: false,
            updatedBy: userId,
            updatedAt: new Date(),
        },
    });
    res.json({
        message: "Section deleted successfully",
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Section Deleted",
        body: `Section ${existing.name} was deleted successfully.`,
    });
});
exports.deleteSection = deleteSection;
const activateSection = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.section.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Section not found", 404));
    }
    const updatedSection = await prisma_1.default.section.update({
        where: { id },
        data: {
            isActive: true,
            updatedBy: userId,
            updatedAt: new Date(),
        },
        include: {
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            stores: {
                where: { isDeleted: false },
                include: {
                    cmUser: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },
                    storeInchargeAssignments: {
                        where: { isActive: true },
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    res.json({
        message: "Section activated successfully",
        section: updatedSection,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Section Activated",
        body: `Section ${updatedSection.name} was activated successfully.`,
    });
});
exports.activateSection = activateSection;
const deactivateSection = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.section.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Section not found", 404));
    }
    const updatedSection = await prisma_1.default.section.update({
        where: { id },
        data: {
            isActive: false,
            updatedBy: userId,
            updatedAt: new Date(),
        },
        include: {
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
            stores: {
                where: { isDeleted: false },
                include: {
                    cmUser: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },
                    storeInchargeAssignments: {
                        where: { isActive: true },
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    res.json({
        message: "Section deactivated successfully",
        section: updatedSection,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Section Deactivated",
        body: `Section ${updatedSection.name} was deactivated successfully.`,
    });
});
exports.deactivateSection = deactivateSection;
//# sourceMappingURL=section.controller.js.map