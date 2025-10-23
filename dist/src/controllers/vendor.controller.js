"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVendorsWithAccounts = exports.deactivateVendor = exports.activateVendor = exports.deleteVendor = exports.updateVendor = exports.getVendorById = exports.getVendors = exports.createVendor = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const appError_1 = __importDefault(require("../utils/appError"));
const buildQueryOptions_1 = require("../utils/buildQueryOptions");
const notification_1 = require("../utils/notification");
const notificationService_1 = require("../utils/notificationService");
const prisma_1 = __importDefault(require("../utils/prisma"));
const createVendor = (0, catchAsync_1.default)(async (req, res, next) => {
    const { name, contactPerson, email, phone, address } = req.body;
    const userId = req.user.id;
    if (!name || !userId) {
        return next(new appError_1.default("Name and userId are required", 400));
    }
    const existingVendor = await prisma_1.default.vendor.findFirst({
        where: { name },
    });
    if (existingVendor) {
        return next(new appError_1.default("Vendor with this name already exists", 400));
    }
    const vendor = await prisma_1.default.vendor.create({
        data: {
            name,
            contactPerson,
            email,
            phone,
            address,
            createdBy: userId,
        },
    });
    res.status(201).json({
        message: "Vendor created successfully",
        vendor,
    });
    await notificationService_1.NotificationService.notifyAccountantEvent({
        type: "VENDOR_CREATED",
        description: `Vendor ${vendor.name} was created successfully.`,
        data: {
            vendorId: vendor.id,
            vendorName: vendor.name,
        },
    });
});
exports.createVendor = createVendor;
const getVendors = (0, catchAsync_1.default)(async (req, res) => {
    const filterOptions = (0, buildQueryOptions_1.extractQueryParams)(req);
    const searchableFields = [
        "name",
        "contactPerson",
        "email",
        "phone",
        "address",
    ];
    const defaultFilters = { isDeleted: false };
    const queryOptions = (0, buildQueryOptions_1.buildQueryOptions)(filterOptions, defaultFilters, searchableFields);
    const total = await prisma_1.default.vendor.count({
        where: queryOptions.where,
    });
    const vendors = await prisma_1.default.vendor.findMany({
        ...queryOptions,
    });
    const paginationMeta = (0, buildQueryOptions_1.buildPaginationMeta)(total, filterOptions.page || 1, filterOptions.limit || 50);
    res.json({
        message: "Vendors retrieved successfully",
        vendors,
        ...paginationMeta,
    });
});
exports.getVendors = getVendors;
const getVendorById = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const vendor = await prisma_1.default.vendor.findUnique({
        where: { id },
    });
    if (!vendor) {
        return next(new appError_1.default("Vendor not found", 404));
    }
    res.json({
        message: "Vendor retrieved successfully",
        vendor,
    });
});
exports.getVendorById = getVendorById;
const updateVendor = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const updates = { ...req.body };
    const userId = req.user.id;
    delete updates.id;
    delete updates.createdAt;
    delete updates.createdBy;
    const existing = await prisma_1.default.vendor.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Vendor not found", 404));
    }
    if (updates.name && updates.name !== existing.name) {
        const nameExists = await prisma_1.default.vendor.findFirst({
            where: { name: updates.name },
        });
        if (nameExists) {
            return next(new appError_1.default("Vendor with this name already exists", 400));
        }
    }
    const updatedVendor = await prisma_1.default.vendor.update({
        where: { id },
        data: {
            ...updates,
            updatedBy: userId,
            updatedAt: new Date(),
        },
    });
    res.json({
        message: "Vendor updated successfully",
        vendor: updatedVendor,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Vendor Updated",
        body: `Vendor ${updatedVendor.name} was updated successfully.`,
    });
});
exports.updateVendor = updateVendor;
const deleteVendor = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const existing = await prisma_1.default.vendor.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Vendor not found", 404));
    }
    await prisma_1.default.vendor.delete({
        where: { id },
    });
    res.json({
        message: "Vendor deleted successfully",
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Vendor Deleted",
        body: `Vendor was deleted successfully.`,
    });
});
exports.deleteVendor = deleteVendor;
const activateVendor = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.vendor.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Vendor not found", 404));
    }
    const updatedVendor = await prisma_1.default.vendor.update({
        where: { id },
        data: {
            isActive: true,
            updatedBy: userId,
            updatedAt: new Date(),
        },
    });
    res.json({
        message: "Vendor activated successfully",
        vendor: updatedVendor,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Vendor Activated",
        body: `Vendor ${updatedVendor.name} was activated successfully.`,
    });
});
exports.activateVendor = activateVendor;
const deactivateVendor = (0, catchAsync_1.default)(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;
    const existing = await prisma_1.default.vendor.findUnique({ where: { id } });
    if (!existing) {
        return next(new appError_1.default("Vendor not found", 404));
    }
    const updatedVendor = await prisma_1.default.vendor.update({
        where: { id },
        data: {
            isActive: false,
            updatedBy: userId,
            updatedAt: new Date(),
        },
    });
    res.json({
        message: "Vendor deactivated successfully",
        vendor: updatedVendor,
    });
    await (0, notification_1.sendNotificationToUserSafe)({
        userId: req.user.id,
        title: "Vendor Deactivated",
        body: `Vendor ${updatedVendor.name} was deactivated successfully.`,
    });
});
exports.deactivateVendor = deactivateVendor;
const getVendorsWithAccounts = (0, catchAsync_1.default)(async (req, res) => {
    const vendors = await prisma_1.default.vendor.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            vendorAccounts: true,
        },
    });
    const result = vendors.map((vendor) => {
        const account = vendor.vendorAccounts && vendor.vendorAccounts.length > 0
            ? vendor.vendorAccounts[0]
            : null;
        return {
            id: vendor.id,
            name: vendor.name,
            contactPerson: vendor.contactPerson,
            email: vendor.email,
            phone: vendor.phone,
            address: vendor.address,
            isActive: vendor.isActive,
            createdAt: vendor.createdAt,
            totalCredited: account ? account.totalCredited : 0,
            totalDebited: account ? account.totalDebited : 0,
            balance: account ? account.balance : 0,
        };
    });
    res.json({
        message: "Vendors with account info retrieved successfully",
        vendors: result,
    });
});
exports.getVendorsWithAccounts = getVendorsWithAccounts;
//# sourceMappingURL=vendor.controller.js.map