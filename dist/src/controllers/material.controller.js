"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivateMaterial = exports.activateMaterial = exports.deleteMaterial = exports.updateMaterial = exports.getMaterialById = exports.getMaterials = exports.createMaterial = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const buildQueryOptions_1 = require("../utils/buildQueryOptions");
const notification_1 = require("../utils/notification");
const prisma_1 = __importDefault(require("../utils/prisma"));
const createMaterial = (0, catchAsync_1.default)(async (req, res, next) => {
    const { name, description, unit, category } = req.body;
    const userId = req.user.id;
    if (!name || !unit || !userId) {
        return next(new appError_1.default("Name, unit, and userId are required", 400));
    }
    const existingMaterial = await prisma_1.default.material.findUnique({
        where: { name },
    });
    if (existingMaterial) {
        return next(new appError_1.default("Material with this name already exists", 400));
    }
    const material = await prisma_1.default.material.create({
        data: {
            name,
            description,
            unit,
            category,
            createdBy: userId,
        },
    });
    res.status(201).json({
        message: "Material created successfully",
        material,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Material Created",
        body: `Material ${material.name} was created successfully.`,
    });
});
exports.createMaterial = createMaterial;
const getMaterials = (0, catchAsync_1.default)(async (req, res) => {
    const filterOptions = (0, buildQueryOptions_1.extractQueryParams)(req);
    const searchableFields = ["name", "description", "category"];
    const defaultFilters = { isDeleted: false };
    const queryOptions = (0, buildQueryOptions_1.buildQueryOptions)(filterOptions, defaultFilters, searchableFields);
    const total = await prisma_1.default.material.count({
        where: queryOptions.where,
    });
    const materials = await prisma_1.default.material.findMany({
        ...queryOptions,
    });
    const paginationMeta = (0, buildQueryOptions_1.buildPaginationMeta)(total, filterOptions.page || 1, filterOptions.limit || 50);
    res.json({
        message: "Materials retrieved successfully",
        materials,
        ...paginationMeta,
    });
});
exports.getMaterials = getMaterials;
const getMaterialById = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const material = await prisma_1.default.material.findUnique({
        where: { id },
        include: {
            demands: true,
            storeInventory: true,
        },
    });
    if (!material) {
        return next(new appError_1.default("Material not found", 404));
    }
    res.json({
        message: "Material retrieved successfully",
        material,
    });
});
exports.getMaterialById = getMaterialById;
const updateMaterial = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const updates = { ...req.body };
    const userId = req.user.id;
    delete updates.id;
    delete updates.createdAt;
    delete updates.createdBy;
    const existing = await prisma_1.default.material.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Material not found", 404));
    }
    if (updates.name && updates.name !== existing.name) {
        const nameExists = await prisma_1.default.material.findUnique({
            where: { name: updates.name },
        });
        if (nameExists) {
            return next(new appError_1.default("Material with this name already exists", 400));
        }
    }
    const updatedMaterial = await prisma_1.default.material.update({
        where: { id },
        data: {
            ...updates,
            updatedBy: userId,
            updatedAt: new Date(),
        },
    });
    res.json({
        message: "Material updated successfully",
        material: updatedMaterial,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Material Updated",
        body: `Material ${updatedMaterial.name} was updated successfully.`,
    });
});
exports.updateMaterial = updateMaterial;
const deleteMaterial = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const existing = await prisma_1.default.material.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Material not found", 404));
    }
    await prisma_1.default.material.delete({
        where: { id },
    });
    res.json({
        message: "Material deleted successfully",
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Material Deleted",
        body: `Material was deleted successfully.`,
    });
});
exports.deleteMaterial = deleteMaterial;
const activateMaterial = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.material.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Material not found", 404));
    }
    const updatedMaterial = await prisma_1.default.material.update({
        where: { id },
        data: {
            isActive: true,
            updatedBy: userId,
            updatedAt: new Date(),
        },
    });
    res.json({
        message: "Material activated successfully",
        material: updatedMaterial,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Material Activated",
        body: `Material ${updatedMaterial.name} was activated successfully.`,
    });
});
exports.activateMaterial = activateMaterial;
const deactivateMaterial = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.material.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Material not found", 404));
    }
    const updatedMaterial = await prisma_1.default.material.update({
        where: { id },
        data: {
            isActive: false,
            updatedBy: userId,
            updatedAt: new Date(),
        },
    });
    res.json({
        message: "Material deactivated successfully",
        material: updatedMaterial,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Material Deactivated",
        body: `Material ${updatedMaterial.name} was deactivated successfully.`,
    });
});
exports.deactivateMaterial = deactivateMaterial;
//# sourceMappingURL=material.controller.js.map