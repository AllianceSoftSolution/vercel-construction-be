import { PrismaClient } from "@prisma/client";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import { buildQueryOptions, extractQueryParams, buildPaginationMeta } from "../utils/buildQueryOptions";

const prisma = new PrismaClient();

const createMaterial = catchAsync(async (req, res, next) => {
  const {
    name,
    description,
    unit,
    category,
  } = req.body;
  const userId = req.user.id;

  if (!name || !unit || !userId) {
    return next(new AppError("Name, unit, and userId are required", 400));
  }

  // Check if material with same name already exists
  const existingMaterial = await prisma.material.findUnique({
    where: { name },
  });

  if (existingMaterial) {
    return next(new AppError("Material with this name already exists", 400));
  }

  const material = await prisma.material.create({
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
});

const getMaterials = catchAsync(async (req, res) => {
  // Extract query parameters
  const filterOptions = extractQueryParams(req);
  
  // Define searchable fields for materials
  const searchableFields = ['name', 'description', 'category'];
  
  // Build default filters
  const defaultFilters = { isDeleted: false };

  // Build query options
  const queryOptions = buildQueryOptions(filterOptions, defaultFilters, searchableFields);

  // Get total count for pagination
  const total = await prisma.material.count({
    where: queryOptions.where
  });

  // Get materials with pagination
  const materials = await prisma.material.findMany({
    ...queryOptions
  });

  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(
    total,
    filterOptions.page || 1,
    filterOptions.limit || 50
  );

  res.json({
    message: "Materials retrieved successfully",
    materials,
    ...paginationMeta
  });
});

const getMaterialById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const material = await prisma.material.findUnique({
    where: { id },
    include: {
      demands: true,
      storeInventory: true,
      purchaseOrderItems: true
    }
  });
  if (!material) {
    return next(new AppError("Material not found", 404));
  }
  res.json({
    message: "Material retrieved successfully",
    material,
  });
});

const updateMaterial = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = { ...req.body };
  const userId = req.user.id;
  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.createdAt;
  delete updates.createdBy;
  const existing = await prisma.material.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Material not found", 404));
  }
  // Check if name is being updated and if it already exists
  if (updates.name && updates.name !== existing.name) {
    const nameExists = await prisma.material.findUnique({
      where: { name: updates.name },
    });
    if (nameExists) {
      return next(new AppError("Material with this name already exists", 400));
    }
  }
  const updatedMaterial = await prisma.material.update({
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
});

const deleteMaterial = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const existing = await prisma.material.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Material not found", 404));
  }
  await prisma.material.delete({
    where: { id }
  });
  res.json({
    message: "Material deleted successfully",
  });
});

const activateMaterial = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;
  const existing = await prisma.material.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Material not found", 404));
  }
  const updatedMaterial = await prisma.material.update({
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
});

const deactivateMaterial = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;
  const existing = await prisma.material.findUnique({ where: { id } });
  if (!existing) {
    return next(new AppError("Material not found", 404));
  }
  const updatedMaterial = await prisma.material.update({
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
});

export {
  createMaterial,
  getMaterials,
  getMaterialById,
  updateMaterial,
  deleteMaterial,
  activateMaterial,
  deactivateMaterial,
}; 