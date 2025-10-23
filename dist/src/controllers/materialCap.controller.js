"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllMaterialCaps = exports.getProjectCaps = exports.updateSectionCaps = exports.getSectionCaps = exports.createSectionCaps = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const buildQueryOptions_1 = require("../utils/buildQueryOptions");
const notification_1 = require("../utils/notification");
const notificationService_1 = require("../utils/notificationService");
const prisma_1 = __importDefault(require("../utils/prisma"));
const createSectionCaps = (0, catchAsync_1.default)(async (req, res, next) => {
    const { sectionId } = req.params;
    const { caps } = req.body;
    const userId = req.user.id;
    if (!caps || !Array.isArray(caps) || caps.length === 0) {
        return next(new appError_1.default("Caps array is required and must not be empty", 400));
    }
    const section = await prisma_1.default.section.findUnique({
        where: { id: sectionId },
        include: { project: true },
    });
    if (!section) {
        return next(new appError_1.default("Section not found", 404));
    }
    const materialIds = caps.map((cap) => cap.materialId);
    const materials = await prisma_1.default.material.findMany({
        where: { id: { in: materialIds } },
    });
    if (materials.length !== materialIds.length) {
        return next(new appError_1.default("One or more materials not found", 404));
    }
    for (const cap of caps) {
        if (!cap.materialId || !cap.quantity || !cap.unit) {
            return next(new appError_1.default("materialId, quantity, and unit are required for each cap", 400));
        }
        if (cap.quantity <= 0) {
            return next(new appError_1.default("Quantity must be greater than 0", 400));
        }
    }
    const result = await prisma_1.default.$transaction(async (tx) => {
        const createdCaps = [];
        for (const cap of caps) {
            const material = materials.find((m) => m.id === cap.materialId);
            if (material && material.unit !== cap.unit) {
                throw new appError_1.default(`Unit mismatch for material ${material.name}. Expected: ${material.unit}, Got: ${cap.unit}`, 400);
            }
            const createdCap = await tx.materialCap.upsert({
                where: {
                    materialId_sectionId: {
                        materialId: cap.materialId,
                        sectionId: sectionId,
                    },
                },
                update: {
                    quantity: cap.quantity,
                    unit: cap.unit,
                    updatedBy: userId,
                    updatedAt: new Date(),
                },
                create: {
                    materialId: cap.materialId,
                    sectionId: sectionId,
                    projectId: section.projectId,
                    quantity: cap.quantity,
                    unit: cap.unit,
                    createdBy: userId,
                },
                include: {
                    material: {
                        select: {
                            id: true,
                            name: true,
                            unit: true,
                        },
                    },
                },
            });
            createdCaps.push(createdCap);
        }
        return createdCaps;
    });
    res.status(201).json({
        message: "Material caps created/updated successfully",
        caps: result,
    });
    for (const cap of result) {
        await notificationService_1.NotificationService.notifyMaterialCap(cap.id);
    }
});
exports.createSectionCaps = createSectionCaps;
const getSectionCaps = (0, catchAsync_1.default)(async (req, res, next) => {
    const { sectionId } = req.params;
    const section = await prisma_1.default.section.findUnique({
        where: { id: sectionId },
    });
    if (!section) {
        return next(new appError_1.default("Section not found", 404));
    }
    const caps = await prisma_1.default.materialCap.findMany({
        where: {
            sectionId: sectionId,
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
        orderBy: {
            material: {
                name: "asc",
            },
        },
    });
    res.json({
        message: "Material caps retrieved successfully",
        caps,
    });
});
exports.getSectionCaps = getSectionCaps;
const updateSectionCaps = (0, catchAsync_1.default)(async (req, res, next) => {
    const { sectionId } = req.params;
    const { caps } = req.body;
    const userId = req.user.id;
    if (!caps || !Array.isArray(caps)) {
        return next(new appError_1.default("Caps array is required", 400));
    }
    const section = await prisma_1.default.section.findUnique({
        where: { id: sectionId },
        include: { project: true },
    });
    if (!section) {
        return next(new appError_1.default("Section not found", 404));
    }
    const existingCaps = await prisma_1.default.materialCap.findMany({
        where: {
            sectionId: sectionId,
            isDeleted: false,
        },
    });
    const incomingMaterialIds = caps.map((cap) => cap.materialId);
    const capsToDelete = existingCaps.filter((cap) => !incomingMaterialIds.includes(cap.materialId));
    const materialIds = caps.map((cap) => cap.materialId);
    const materials = await prisma_1.default.material.findMany({
        where: { id: { in: materialIds } },
    });
    if (materials.length !== materialIds.length) {
        return next(new appError_1.default("One or more materials not found", 404));
    }
    for (const cap of caps) {
        if (!cap.materialId || !cap.quantity || !cap.unit) {
            return next(new appError_1.default("materialId, quantity, and unit are required for each cap", 400));
        }
        if (cap.quantity <= 0) {
            return next(new appError_1.default("Quantity must be greater than 0", 400));
        }
    }
    const result = await prisma_1.default.$transaction(async (tx) => {
        if (capsToDelete.length > 0) {
            await tx.materialCap.updateMany({
                where: {
                    id: { in: capsToDelete.map((cap) => cap.id) },
                },
                data: {
                    isDeleted: true,
                    updatedBy: userId,
                    updatedAt: new Date(),
                },
            });
        }
        const updatedCaps = [];
        for (const cap of caps) {
            const material = materials.find((m) => m.id === cap.materialId);
            if (material && material.unit !== cap.unit) {
                throw new appError_1.default(`Unit mismatch for material ${material.name}. Expected: ${material.unit}, Got: ${cap.unit}`, 400);
            }
            const updatedCap = await tx.materialCap.upsert({
                where: {
                    materialId_sectionId: {
                        materialId: cap.materialId,
                        sectionId: sectionId,
                    },
                },
                update: {
                    quantity: cap.quantity,
                    unit: cap.unit,
                    updatedBy: userId,
                    updatedAt: new Date(),
                },
                create: {
                    materialId: cap.materialId,
                    sectionId: sectionId,
                    projectId: section.projectId,
                    quantity: cap.quantity,
                    unit: cap.unit,
                    createdBy: userId,
                },
                include: {
                    material: {
                        select: {
                            id: true,
                            name: true,
                            unit: true,
                        },
                    },
                },
            });
            updatedCaps.push(updatedCap);
        }
        return {
            updatedCaps,
            deletedCaps: capsToDelete,
        };
    });
    res.json({
        message: "Material caps updated successfully",
        caps: result.updatedCaps,
        deletedCaps: result.deletedCaps,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Material Caps Updated",
        body: `${result.updatedCaps.length} material caps were updated and ${result.deletedCaps.length} were removed for section ${section.name}.`,
    });
});
exports.updateSectionCaps = updateSectionCaps;
const getProjectCaps = (0, catchAsync_1.default)(async (req, res, next) => {
    const { projectId } = req.params;
    const project = await prisma_1.default.project.findUnique({
        where: { id: projectId },
    });
    if (!project) {
        return next(new appError_1.default("Project not found", 404));
    }
    const caps = await prisma_1.default.materialCap.findMany({
        where: {
            projectId: projectId,
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
        orderBy: [
            {
                material: {
                    name: "asc",
                },
            },
            {
                section: {
                    name: "asc",
                },
            },
        ],
    });
    const aggregatedCaps = caps.reduce((acc, cap) => {
        const materialId = cap.materialId;
        const existingCap = acc.find((c) => c.materialId === materialId);
        if (existingCap) {
            existingCap.totalQuantity = existingCap.totalQuantity + cap.quantity;
            existingCap.sections.push({
                sectionId: cap.section.id,
                sectionName: cap.section.name,
                sectionCode: cap.section.code,
                quantity: cap.quantity,
            });
        }
        else {
            acc.push({
                materialId: cap.materialId,
                materialName: cap.material.name,
                materialUnit: cap.material.unit,
                materialCategory: cap.material.category,
                totalQuantity: cap.quantity,
                sections: [
                    {
                        sectionId: cap.section.id,
                        sectionName: cap.section.name,
                        sectionCode: cap.section.code,
                        quantity: cap.quantity,
                    },
                ],
            });
        }
        return acc;
    }, []);
    res.json({
        message: "Project material caps retrieved successfully",
        project: {
            id: project.id,
            name: project.name,
            code: project.code,
        },
        aggregatedCaps,
        detailedCaps: caps,
    });
});
exports.getProjectCaps = getProjectCaps;
const getAllMaterialCaps = (0, catchAsync_1.default)(async (req, res) => {
    const filterOptions = (0, buildQueryOptions_1.extractQueryParams)(req);
    const searchableFields = ["material.name", "section.name", "project.name"];
    const defaultFilters = { isDeleted: false };
    const queryOptions = (0, buildQueryOptions_1.buildQueryOptions)(filterOptions, defaultFilters, searchableFields);
    const total = await prisma_1.default.materialCap.count({
        where: queryOptions.where,
    });
    const caps = await prisma_1.default.materialCap.findMany({
        ...queryOptions,
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
            project: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                },
            },
        },
    });
    const paginationMeta = (0, buildQueryOptions_1.buildPaginationMeta)(total, filterOptions.page || 1, filterOptions.limit || 50);
    res.json({
        message: "Material caps retrieved successfully",
        caps,
        ...paginationMeta,
    });
});
exports.getAllMaterialCaps = getAllMaterialCaps;
//# sourceMappingURL=materialCap.controller.js.map