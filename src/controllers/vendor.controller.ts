import { PrismaClient } from "@prisma/client";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import {
  buildQueryOptions,
  extractQueryParams,
  buildPaginationMeta,
} from "../utils/buildQueryOptions";
import { sendNotificationToUserSafe } from "../utils/notification";

const prisma = new PrismaClient();

const createVendor = catchAsync(async (req, res, next) => {
  const { name, contactPerson, email, phone, address } = req.body;
  const userId = req.user.id;

  if (!name || !userId) {
    return next(new AppError("Name and userId are required", 400));
  }

  // Check if vendor with same name already exists
  const existingVendor = await prisma.vendor.findFirst({
    where: { name },
  });

  if (existingVendor) {
    return next(new AppError("Vendor with this name already exists", 400));
  }

  const vendor = await prisma.vendor.create({
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
  await sendNotificationToUserSafe({
    userId: req.user.id,
    title: "Vendor Created",
    body: `Vendor ${vendor.name} was created successfully.`,
  });
});

const getVendors = catchAsync(async (req, res) => {
  // Extract query parameters
  const filterOptions = extractQueryParams(req);

  // Define searchable fields for vendors
  const searchableFields = [
    "name",
    "contactPerson",
    "email",
    "phone",
    "address",
  ];

  // Build default filters
  const defaultFilters = { isDeleted: false };

  // Build query options
  const queryOptions = buildQueryOptions(
    filterOptions,
    defaultFilters,
    searchableFields
  );

  // Get total count for pagination
  const total = await prisma.vendor.count({
    where: queryOptions.where,
  });

  // Get vendors with pagination
  const vendors = await prisma.vendor.findMany({
    ...queryOptions,
  });

  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(
    total,
    filterOptions.page || 1,
    filterOptions.limit || 50
  );

  res.json({
    message: "Vendors retrieved successfully",
    vendors,
    ...paginationMeta,
  });
});

const getVendorById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const vendor = await prisma.vendor.findUnique({
    where: { id },
  });
  if (!vendor) {
    return next(new AppError("Vendor not found", 404));
  }
  res.json({
    message: "Vendor retrieved successfully",
    vendor,
  });
});

const updateVendor = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = { ...req.body };
  const userId = req.user.id;
  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.createdAt;
  delete updates.createdBy;
  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Vendor not found", 404));
  }
  // Check if name is being updated and if it already exists
  if (updates.name && updates.name !== existing.name) {
    const nameExists = await prisma.vendor.findFirst({
      where: { name: updates.name },
    });
    if (nameExists) {
      return next(new AppError("Vendor with this name already exists", 400));
    }
  }
  const updatedVendor = await prisma.vendor.update({
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
  await sendNotificationToUserSafe({
    userId: req.user.id,
    title: "Vendor Updated",
    body: `Vendor ${updatedVendor.name} was updated successfully.`,
  });
});

const deleteVendor = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Vendor not found", 404));
  }
  await prisma.vendor.delete({
    where: { id },
  });
  res.json({
    message: "Vendor deleted successfully",
  });
  await sendNotificationToUserSafe({
    userId: req.user.id,
    title: "Vendor Deleted",
    body: `Vendor was deleted successfully.`,
  });
});

const activateVendor = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;
  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Vendor not found", 404));
  }
  const updatedVendor = await prisma.vendor.update({
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
  await sendNotificationToUserSafe({
    userId: req.user.id,
    title: "Vendor Activated",
    body: `Vendor ${updatedVendor.name} was activated successfully.`,
  });
});

const deactivateVendor = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;
  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Vendor not found", 404));
  }
  const updatedVendor = await prisma.vendor.update({
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
  await sendNotificationToUserSafe({
    userId: req.user.id,
    title: "Vendor Deactivated",
    body: `Vendor ${updatedVendor.name} was deactivated successfully.`,
  });
});

// Get all vendors with their account information
const getVendorsWithAccounts = catchAsync(async (req, res) => {
  const vendors = await prisma.vendor.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      vendorAccounts: true,
    },
  });

  // Map to include account info or zeros if no account
  const result = vendors.map((vendor) => {
    const account =
      vendor.vendorAccounts && vendor.vendorAccounts.length > 0
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

export {
  createVendor,
  getVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
  activateVendor,
  deactivateVendor,
  getVendorsWithAccounts,
};
