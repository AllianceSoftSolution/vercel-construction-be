"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivateProject = exports.activateProject = exports.deleteProject = exports.updateProject = exports.getProjectById = exports.getProjects = exports.createProject = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const generateCode_1 = require("../utils/generateCode");
const buildQueryOptions_1 = require("../utils/buildQueryOptions");
const notification_1 = require("../utils/notification");
const prisma_1 = __importDefault(require("../utils/prisma"));
const createProject = (0, catchAsync_1.default)(async (req, res, next) => {
    const { name, description, startDate, endDate, code } = req.body;
    const userId = req.user.id;
    if (!name) {
        return next(new appError_1.default("Name is required", 400));
    }
    let projectCode;
    if (code) {
        const existingProject = await prisma_1.default.project.findUnique({
            where: { code },
        });
        if (existingProject) {
            return next(new appError_1.default("Project code already exists", 400));
        }
        projectCode = code;
    }
    else {
        projectCode = await (0, generateCode_1.generateProjectCode)();
    }
    const project = await prisma_1.default.project.create({
        data: {
            name,
            code: projectCode,
            description,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            createdBy: userId,
        },
        include: {
            sections: {
                where: { isDeleted: false },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    description: true,
                },
            },
        },
    });
    res.status(201).json({
        message: "Project created successfully",
        project,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Project Created",
        body: `Project ${project.name} was created successfully.`,
    });
});
exports.createProject = createProject;
const getProjects = (0, catchAsync_1.default)(async (req, res) => {
    const user = req.user;
    const filterOptions = (0, buildQueryOptions_1.extractQueryParams)(req);
    const searchableFields = ["name", "code", "description"];
    let defaultFilters = { isDeleted: false };
    let assignedSectionIds = [];
    if (user.role === "ADMIN") {
    }
    else if (user.role === "SITE_INCHARGE") {
        const assignments = await prisma_1.default.siteInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { projectId: true, sectionId: true },
        });
        const projectIds = assignments.map((a) => a.projectId);
        assignedSectionIds = assignments.map((a) => a.sectionId);
        defaultFilters.id = { in: projectIds };
    }
    else if (user.role === "PROJECT_MANAGER") {
        const assignments = await prisma_1.default.projectManagerAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { projectId: true, sectionId: true },
        });
        const projectIds = assignments.map((a) => a.projectId);
        assignedSectionIds = assignments.map((a) => a.sectionId);
        defaultFilters.id = { in: projectIds };
    }
    else if (user.role === "CONSTRUCTION_MANAGER") {
        const assignments = await prisma_1.default.constructionManagerAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { section: { select: { projectId: true, id: true } } },
        });
        const projectIds = assignments.map((a) => a.section.projectId);
        assignedSectionIds = assignments.map((a) => a.section.id);
        defaultFilters.id = { in: projectIds };
    }
    else if (user.role === "STORE_INCHARGE") {
        const assignments = await prisma_1.default.storeInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: {
                store: {
                    select: { section: { select: { projectId: true, id: true } } },
                },
            },
        });
        const projectIds = assignments
            .filter((a) => a.store.section != null)
            .map((a) => a.store.section.projectId);
        assignedSectionIds = assignments
            .filter((a) => a.store.section != null)
            .map((a) => a.store.section.id);
        defaultFilters.id = { in: projectIds };
    }
    else if (user.role === "ACCOUNTANT") {
        if (user.isHead) {
        }
        else {
            const assignments = await prisma_1.default.accountantAssignment.findMany({
                where: { userId: user.id, isActive: true },
                select: { projectId: true, sectionId: true },
            });
            const projectIds = [...new Set(assignments.map((a) => a.projectId))];
            assignedSectionIds = assignments.map((a) => a.sectionId);
            defaultFilters.id = { in: projectIds };
        }
    }
    const queryOptions = (0, buildQueryOptions_1.buildQueryOptions)(filterOptions, defaultFilters, searchableFields);
    const total = await prisma_1.default.project.count({
        where: queryOptions.where,
    });
    const projects = await prisma_1.default.project.findMany({
        ...queryOptions,
        include: {
            sections: {
                where: { isDeleted: false },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    description: true,
                },
            },
            _count: {
                select: {
                    sections: true,
                },
            },
        },
    });
    const projectsWithAmounts = await Promise.all(projects.map(async (project) => {
        const projectPOs = await prisma_1.default.purchaseOrder.aggregate({
            where: {
                projectId: project.id,
                isDeleted: false,
                totalAmount: { not: null },
            },
            _sum: {
                totalAmount: true,
            },
        });
        const sectionsWithAmounts = await Promise.all(project.sections.map(async (section) => {
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
        return {
            ...project,
            sections: sectionsWithAmounts,
            totalAmountSpent: projectPOs._sum.totalAmount || 0,
        };
    }));
    const filteredProjects = projectsWithAmounts.map((project) => {
        let filteredSections = project.sections;
        if (user.role !== "ADMIN" && Array.isArray(filteredSections)) {
            filteredSections = filteredSections
                .filter((section) => section &&
                typeof section === "object" &&
                "id" in section &&
                "name" in section &&
                "code" in section)
                .filter((section) => assignedSectionIds.includes(section.id));
        }
        return {
            ...project,
            sections: filteredSections,
        };
    });
    const paginationMeta = (0, buildQueryOptions_1.buildPaginationMeta)(total, filterOptions.page || 1, filterOptions.limit || 50);
    res.json({
        message: "Projects retrieved successfully",
        projects: filteredProjects,
        ...paginationMeta,
    });
});
exports.getProjects = getProjects;
const getProjectById = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const user = req.user;
    let assignedSectionIds = [];
    if (user.role === "ADMIN") {
    }
    else if (user.role === "SITE_INCHARGE") {
        const assignments = await prisma_1.default.siteInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true, projectId: id },
            select: { sectionId: true },
        });
        assignedSectionIds = assignments.map((a) => a.sectionId);
    }
    else if (user.role === "PROJECT_MANAGER") {
        const assignments = await prisma_1.default.projectManagerAssignment.findMany({
            where: { userId: user.id, isActive: true, projectId: id },
            select: { sectionId: true },
        });
        assignedSectionIds = assignments.map((a) => a.sectionId);
    }
    else if (user.role === "CONSTRUCTION_MANAGER") {
        const assignments = await prisma_1.default.constructionManagerAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: { section: { select: { projectId: true, id: true } } },
        });
        assignedSectionIds = assignments
            .filter((a) => a.section.projectId === id)
            .map((a) => a.section.id);
    }
    else if (user.role === "STORE_INCHARGE") {
        const assignments = await prisma_1.default.storeInchargeAssignment.findMany({
            where: { userId: user.id, isActive: true },
            select: {
                store: {
                    select: { section: { select: { projectId: true, id: true } } },
                },
            },
        });
        assignedSectionIds = assignments
            .filter((a) => a.store.section?.projectId === id)
            .map((a) => a.store.section.id);
    }
    else if (user.role === "ACCOUNTANT") {
        if (user.isHead) {
        }
        else {
            const assignments = await prisma_1.default.accountantAssignment.findMany({
                where: { userId: user.id, isActive: true, projectId: id },
                select: { sectionId: true },
            });
            assignedSectionIds = assignments.map((a) => a.sectionId);
        }
    }
    const project = await prisma_1.default.project.findUnique({
        where: { id },
        include: {
            sections: {
                where: { isDeleted: false },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    description: true,
                    isActive: true,
                    createdAt: true,
                    stores: {
                        where: { isDeleted: false },
                        select: {
                            id: true,
                            name: true,
                            type: true,
                            isActive: true,
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
                                select: {
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
                    constructionManagerAssignments: {
                        where: { isActive: true },
                        select: {
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
                    section: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
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
                    section: {
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
    if (!project) {
        return next(new appError_1.default("Project not found", 404));
    }
    const projectPOs = await prisma_1.default.purchaseOrder.aggregate({
        where: {
            projectId: project.id,
            isDeleted: false,
            totalAmount: { not: null },
        },
        _sum: {
            totalAmount: true,
        },
    });
    let sectionsWithAmounts = await Promise.all(project.sections.map(async (section) => {
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
    if (user.role !== "ADMIN" && Array.isArray(sectionsWithAmounts)) {
        if (user.role === "ACCOUNTANT" && user.isHead) {
        }
        else {
            sectionsWithAmounts = sectionsWithAmounts.filter((section) => assignedSectionIds.includes(section.id));
        }
    }
    const projectMaterialCaps = await prisma_1.default.materialCap.findMany({
        where: {
            projectId: project.id,
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
            section: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
        },
    });
    const projectDemands = await prisma_1.default.demand.findMany({
        where: {
            section: {
                projectId: project.id,
            },
            isDeleted: false,
        },
        select: {
            materialId: true,
            quantity: true,
            unit: true,
            status: true,
            sectionId: true,
        },
    });
    const projectPurchaseOrders = await prisma_1.default.purchaseOrder.findMany({
        where: {
            projectId: project.id,
            isDeleted: false,
        },
        select: {
            materialId: true,
            quantity: true,
            status: true,
            sectionId: true,
        },
    });
    const aggregatedMaterialCaps = projectMaterialCaps.reduce((acc, cap) => {
        const materialId = cap.materialId;
        const existingCap = acc.find((c) => c.materialId === materialId);
        if (existingCap) {
            existingCap.totalCapQuantity += Number(cap.quantity);
            existingCap.sections.push({
                sectionId: cap.section.id,
                sectionName: cap.section.name,
                sectionCode: cap.section.code,
                capQuantity: Number(cap.quantity),
            });
        }
        else {
            acc.push({
                materialId: cap.materialId,
                materialName: cap.material.name,
                materialUnit: cap.material.unit,
                materialCategory: cap.material.category,
                totalCapQuantity: Number(cap.quantity),
                sections: [
                    {
                        sectionId: cap.section.id,
                        sectionName: cap.section.name,
                        sectionCode: cap.section.code,
                        capQuantity: Number(cap.quantity),
                    },
                ],
            });
        }
        return acc;
    }, []);
    const materialCapAnalytics = aggregatedMaterialCaps.map((cap) => {
        const materialDemands = projectDemands.filter((d) => d.materialId === cap.materialId);
        const totalDemandQuantity = materialDemands.reduce((sum, demand) => sum + Number(demand.quantity), 0);
        const materialPOs = projectPurchaseOrders.filter((po) => po.materialId === cap.materialId);
        const totalPOQuantity = materialPOs.reduce((sum, po) => sum + Number(po.quantity), 0);
        const isCapExceeded = totalDemandQuantity > cap.totalCapQuantity;
        const isPOExceeded = totalPOQuantity > cap.totalCapQuantity;
        const isInLimit = !isCapExceeded && !isPOExceeded;
        const demandUsagePercentage = cap.totalCapQuantity > 0
            ? (totalDemandQuantity / cap.totalCapQuantity) * 100
            : 0;
        const poUsagePercentage = cap.totalCapQuantity > 0
            ? (totalPOQuantity / cap.totalCapQuantity) * 100
            : 0;
        return {
            materialId: cap.materialId,
            materialName: cap.materialName,
            materialUnit: cap.materialUnit,
            materialCategory: cap.materialCategory,
            totalCapQuantity: cap.totalCapQuantity,
            capUnit: cap.materialUnit,
            totalDemandQuantity: totalDemandQuantity,
            totalPurchaseOrderQuantity: totalPOQuantity,
            isDemandCapExceeded: isCapExceeded,
            isPurchaseOrderCapExceeded: isPOExceeded,
            isWithinLimit: isInLimit,
            demandUsagePercentage: Math.round(demandUsagePercentage * 100) / 100,
            purchaseOrderUsagePercentage: Math.round(poUsagePercentage * 100) / 100,
            remainingQuantity: cap.totalCapQuantity - Math.max(totalDemandQuantity, totalPOQuantity),
            status: isCapExceeded
                ? "EXCEEDED"
                : isPOExceeded
                    ? "PO_EXCEEDED"
                    : "WITHIN_LIMIT",
            sections: cap.sections,
        };
    });
    const allMembers = new Map();
    function addMember(user, assignment) {
        if (!allMembers.has(user.id)) {
            allMembers.set(user.id, {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                assignments: [],
            });
        }
        allMembers.get(user.id).assignments.push(assignment);
    }
    project.siteInchargeAssignments.forEach((assignment) => {
        if (user.role === "ADMIN" ||
            (user.role === "ACCOUNTANT" && user.isHead) ||
            assignedSectionIds.includes(assignment.section.id)) {
            addMember(assignment.user, {
                type: "Site Incharge",
                section: assignment.section,
            });
        }
    });
    project.projectManagerAssignments.forEach((assignment) => {
        if (user.role === "ADMIN" ||
            (user.role === "ACCOUNTANT" && user.isHead) ||
            assignedSectionIds.includes(assignment.section.id)) {
            addMember(assignment.user, {
                type: "Project Manager",
                section: assignment.section,
            });
        }
    });
    project.accountantAssignments.forEach((assignment) => {
        if (user.role === "ADMIN" ||
            (user.role === "ACCOUNTANT" && user.isHead) ||
            assignedSectionIds.includes(assignment.section.id)) {
            addMember(assignment.user, {
                type: "Accountant",
                section: assignment.section,
            });
        }
    });
    project.sections.forEach((section) => {
        if (user.role === "ADMIN" ||
            (user.role === "ACCOUNTANT" && user.isHead) ||
            assignedSectionIds.includes(section.id)) {
            section.constructionManagerAssignments.forEach((cmAssignment) => {
                addMember(cmAssignment.user, {
                    type: "Construction Manager",
                    section: { id: section.id, name: section.name, code: section.code },
                });
            });
        }
    });
    project.sections.forEach((section) => {
        if (user.role === "ADMIN" ||
            (user.role === "ACCOUNTANT" && user.isHead) ||
            assignedSectionIds.includes(section.id)) {
            section.stores.forEach((store) => {
                store.storeInchargeAssignments.forEach((siAssignment) => {
                    addMember(siAssignment.user, {
                        type: "Store Incharge",
                        store: { id: store.id, name: store.name, type: store.type },
                        section: { id: section.id, name: section.name, code: section.code },
                    });
                });
            });
        }
    });
    const associatedMembers = Array.from(allMembers.values());
    const siteInchargeMap = new Map();
    project.siteInchargeAssignments.forEach((assignment) => {
        const userId = assignment.user.id;
        if (!siteInchargeMap.has(userId)) {
            siteInchargeMap.set(userId, {
                id: assignment.user.id,
                name: assignment.user.name,
                email: assignment.user.email,
                role: assignment.user.role,
                sections: [],
            });
        }
        siteInchargeMap.get(userId).sections.push(assignment.section);
    });
    const assignedSiteIncharges = Array.from(siteInchargeMap.values());
    const accountantMap = new Map();
    project.accountantAssignments.forEach((assignment) => {
        const userId = assignment.user.id;
        if (!accountantMap.has(userId)) {
            accountantMap.set(userId, {
                id: assignment.user.id,
                name: assignment.user.name,
                email: assignment.user.email,
                role: assignment.user.role,
                sections: [],
            });
        }
        accountantMap.get(userId).sections.push(assignment.section);
    });
    const assignedAccountants = Array.from(accountantMap.values());
    const response = {
        id: project.id,
        name: project.name,
        code: project.code,
        description: project.description,
        startDate: project.startDate,
        endDate: project.endDate,
        isActive: project.isActive,
        isDeleted: project.isDeleted,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        createdBy: project.createdBy,
        updatedBy: project.updatedBy,
        sections: sectionsWithAmounts,
        assignedSiteIncharges: assignedSiteIncharges,
        assignedAccountants: assignedAccountants,
        associatedMembers: associatedMembers,
        totalAmountSpent: projectPOs._sum.totalAmount || 0,
        materialCapAnalytics: materialCapAnalytics,
    };
    res.json({
        message: "Project retrieved successfully",
        project: response,
    });
});
exports.getProjectById = getProjectById;
const updateProject = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const updates = { ...req.body };
    const userId = req.user.id;
    delete updates.id;
    delete updates.createdAt;
    delete updates.createdBy;
    const existing = await prisma_1.default.project.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Project not found", 404));
    }
    if (updates.code && updates.code !== existing.code) {
        const existingProjectWithCode = await prisma_1.default.project.findUnique({
            where: { code: updates.code },
        });
        if (existingProjectWithCode) {
            return next(new appError_1.default("Project code already exists", 400));
        }
    }
    if (updates.startDate) {
        updates.startDate = new Date(updates.startDate);
    }
    if (updates.endDate) {
        updates.endDate = new Date(updates.endDate);
    }
    const updatedProject = await prisma_1.default.project.update({
        where: { id },
        data: {
            ...updates,
            updatedBy: userId,
            updatedAt: new Date(),
        },
        include: {
            sections: {
                where: { isDeleted: false },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    description: true,
                },
            },
        },
    });
    res.json({
        message: "Project updated successfully",
        project: updatedProject,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Project Updated",
        body: `Project ${updatedProject.name} was updated successfully.`,
    });
});
exports.updateProject = updateProject;
const deleteProject = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.project.findUnique({
        where: { id },
        include: { sections: true },
    });
    if (!existing) {
        return next(new appError_1.default("Project not found", 404));
    }
    for (const section of existing.sections) {
        await prisma_1.default.siteInchargeAssignment.deleteMany({
            where: { sectionId: section.id },
        });
        await prisma_1.default.projectManagerAssignment.deleteMany({
            where: { sectionId: section.id },
        });
        await prisma_1.default.constructionManagerAssignment.deleteMany({
            where: { sectionId: section.id },
        });
        await prisma_1.default.accountantAssignment.deleteMany({
            where: { sectionId: section.id },
        });
        const stores = await prisma_1.default.store.findMany({
            where: { sectionId: section.id },
        });
        for (const store of stores) {
            await prisma_1.default.storeInchargeAssignment.deleteMany({
                where: { storeId: store.id },
            });
        }
    }
    await prisma_1.default.project.update({
        where: { id },
        data: {
            isDeleted: true,
            isActive: false,
            updatedBy: userId,
            updatedAt: new Date(),
        },
    });
    res.json({
        message: "Project deleted successfully",
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Project Deleted",
        body: `Project ${existing.name} was deleted successfully.`,
    });
});
exports.deleteProject = deleteProject;
const activateProject = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.project.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Project not found", 404));
    }
    const updatedProject = await prisma_1.default.project.update({
        where: { id },
        data: {
            isActive: true,
            updatedBy: userId,
            updatedAt: new Date(),
        },
        include: {
            sections: {
                where: { isDeleted: false },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    description: true,
                },
            },
        },
    });
    res.json({
        message: "Project activated successfully",
        project: updatedProject,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Project Activated",
        body: `Project ${updatedProject.name} was activated successfully.`,
    });
});
exports.activateProject = activateProject;
const deactivateProject = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.project.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Project not found", 404));
    }
    const updatedProject = await prisma_1.default.project.update({
        where: { id },
        data: {
            isActive: false,
            updatedBy: userId,
            updatedAt: new Date(),
        },
        include: {
            sections: {
                where: { isDeleted: false },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    description: true,
                },
            },
        },
    });
    res.json({
        message: "Project deactivated successfully",
        project: updatedProject,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId,
        title: "Project Deactivated",
        body: `Project ${updatedProject.name} was deactivated successfully.`,
    });
});
exports.deactivateProject = deactivateProject;
//# sourceMappingURL=project.controller.js.map