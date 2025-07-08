import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';

const prisma = new PrismaClient();

// Helper to generate PO reference number
async function generatePOReferenceNumber(sectionId: string) {
  // Fetch section and project
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { project: true }
  });
  if (!section || !section.project) {
    throw new AppError('Section or project not found for reference number generation', 400);
  }
  // Example: PO-PROJCODE-SECTIONCODE-<timestamp>
  return `PO-${section.project.code}-${section.code}-${Date.now()}`;
}

// Helper to calculate total PO quantity for a demand
async function getTotalPOQuantityForDemand(demandId: string) {
  const existingPOs = await prisma.purchaseOrder.findMany({
    where: {
      demandId,
      isDeleted: false
    },
    select: {
      totalQuantity: true
    }
  });

  return existingPOs.reduce((total, po) => total + Number(po.totalQuantity), 0);
}

// Helper to update demand status based on PO quantities
async function updateDemandStatus(demandId: string) {
  const demand = await prisma.demand.findUnique({
    where: { id: demandId }
  });

  if (!demand) return;

  const totalPOQuantity = await getTotalPOQuantityForDemand(demandId);
  const demandQuantity = Number(demand.quantity);

  let newStatus = demand.status;

  if (totalPOQuantity === 0) {
    // No POs created yet
    if (demand.status === 'APPROVED') {
      newStatus = 'APPROVED';
    }
  } else if (totalPOQuantity < demandQuantity) {
    // Partial POs created
    newStatus = 'PO_IN_PROGRESS';
  } else if (totalPOQuantity >= demandQuantity) {
    // Full or more POs created
    newStatus = 'PO_CREATED';
  }

  // Update demand status if changed
  if (newStatus !== demand.status) {
    await prisma.demand.update({
      where: { id: demandId },
      data: { 
        status: newStatus,
        updatedBy: demand.createdBy // Keep the original creator
      }
    });
  }
}

// Create a new Purchase Order
export const createPurchaseOrder = catchAsync(async (req: Request, res: Response, next) => {
  const { demandId, items, totalQuantity, sectionId, notes } = req.body;

  // Check if user has permission (Site Incharge or Admin only)
  if (!['SITE_INCHARGE', 'ADMIN'].includes(req.user.role)) {
    return next(new AppError('Only Site Incharge and Admin can create Purchase Orders', 403));
  }

  // Validate required fields
  if (!demandId || !items || !totalQuantity || !sectionId) {
    return next(new AppError('demandId, items, totalQuantity, and sectionId are required', 400));
  }

  // Validate demand exists and is approved
  const demand = await prisma.demand.findUnique({
    where: { id: demandId },
    include: { 
      section: {
        include: {
          project: true
        }
      }
    }
  });

  if (!demand) {
    return next(new AppError('Demand not found', 404));
  }

  // Check if demand is approved
  if (demand.status !== 'APPROVED' && demand.status !== 'PO_IN_PROGRESS') {
    return next(new AppError('Demand must be approved before creating PO', 400));
  }

  // Calculate existing PO quantities for this demand
  const existingPOQuantity = await getTotalPOQuantityForDemand(demandId);
  const demandQuantity = Number(demand.quantity);
  const newTotalQuantity = existingPOQuantity + Number(totalQuantity);

  // Check if new PO quantity exceeds demand quantity
  if (newTotalQuantity > demandQuantity) {
    // Require notes when exceeding demand quantity
    if (!notes || notes.trim() === '') {
      return next(new AppError('Notes are required when PO quantity exceeds demand quantity', 400));
    }
  }

  // Validate items
  if (!Array.isArray(items) || items.length === 0) {
    return next(new AppError('At least one item is required', 400));
  }

  // Validate that items total quantity matches totalQuantity
  const itemsTotalQuantity = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  if (Math.abs(itemsTotalQuantity - Number(totalQuantity)) > 0.01) {
    return next(new AppError('Items total quantity must match totalQuantity', 400));
  }

  // Validate vendors and materials exist
  for (const item of items) {
    const material = await prisma.material.findUnique({
      where: { id: item.materialId }
    });
    if (!material) {
      return next(new AppError(`Material with id ${item.materialId} not found`, 404));
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: item.vendorId }
    });
    if (!vendor) {
      return next(new AppError(`Vendor with id ${item.vendorId} not found`, 404));
    }
  }

  // Generate reference number
  const referenceNumber = await generatePOReferenceNumber(sectionId);

  // Create PO with items
  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      demandId,
      projectId: demand.section.projectId,
      sectionId,
      referenceNumber,
      totalQuantity,
      createdBy: req.user.id,
      items: {
        create: items.map((item: any) => ({
          materialId: item.materialId,
          vendorId: item.vendorId,
          quantity: item.quantity
        }))
      }
    },
    include: {
      demand: {
        include: {
          section: {
            include: {
              project: true
            }
          }
        }
      },
      section: true,
      items: {
        include: {
          material: true,
          vendor: true
        }
      }
    }
  });

  // Update demand status based on new PO quantities
  await updateDemandStatus(demandId);

  res.status(201).json({
    status: 'success',
    message: 'Purchase Order created successfully',
    data: purchaseOrder
  });
});

// Get all Purchase Orders with filters
export const getPurchaseOrders = catchAsync(async (req: Request, res: Response) => {
  const { 
    projectId, 
    sectionId, 
    demandId, 
    status, 
    page = 1,
    limit = 10
  } = req.query;
  const user = req.user;

  const skip = (Number(page) - 1) * Number(limit);

  let where: any = {
    isDeleted: false
  };

  if (projectId) where.projectId = projectId as string;
  if (sectionId) where.sectionId = sectionId as string;
  if (demandId) where.demandId = demandId as string;
  if (status) where.status = status as string;

  // Role-based filtering for POs
  if (user.role === 'ADMIN') {
    // No filter, see all
  } else if (user.role === 'SITE_INCHARGE') {
    const assignments = await prisma.siteInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true }
    });
    const sectionIds = assignments.map(a => a.sectionId);
    where.sectionId = { in: sectionIds };
  } else if (user.role === 'PROJECT_MANAGER') {
    const assignments = await prisma.projectManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true }
    });
    const sectionIds = assignments.map(a => a.sectionId);
    where.sectionId = { in: sectionIds };
  } else if (user.role === 'CONSTRUCTION_MANAGER') {
    const assignments = await prisma.constructionManagerAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true }
    });
    const sectionIds = assignments.map(a => a.sectionId);
    where.sectionId = { in: sectionIds };
  } else if (user.role === 'STORE_INCHARGE') {
    const assignments = await prisma.storeInchargeAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { store: { select: { sectionId: true } } }
    });
    const sectionIds = assignments.map(a => a.store.sectionId);
    where.sectionId = { in: sectionIds };
  } else if (user.role === 'ACCOUNTANT') {
    const assignments = await prisma.accountantAssignment.findMany({
      where: { userId: user.id, isActive: true },
      select: { sectionId: true }
    });
    const sectionIds = assignments.map(a => a.sectionId);
    where.sectionId = { in: sectionIds };
  }

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where,
    include: {
      demand: {
        include: {
          section: {
            include: {
              project: true
            }
          }
        }
      },
      section: true,
      items: {
        include: {
          material: true,
          vendor: true
        }
      }
    },
    skip,
    take: Number(limit),
    orderBy: { createdAt: 'desc' }
  });

  const total = await prisma.purchaseOrder.count({ where });

  res.status(200).json({
    status: 'success',
    data: purchaseOrders,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit))
    }
  });
});

// Get single Purchase Order
export const getPurchaseOrder = catchAsync(async (req: Request, res: Response, next) => {
  const { id } = req.params;

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id, isDeleted: false },
    include: {
      demand: {
        include: {
          section: {
            include: {
              project: true
            }
          },
          approvals: {
            include: {
              user: true
            }
          }
        }
      },
      section: true,
      items: {
        include: {
          material: true,
          vendor: true
        }
      }
    }
  });

  if (!purchaseOrder) {
    return next(new AppError('Purchase Order not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: purchaseOrder
  });
});

// Update Purchase Order
export const updatePurchaseOrder = catchAsync(async (req: Request, res: Response, next) => {
  const { id } = req.params;
  const { status, items, totalQuantity, notes } = req.body;

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id, isDeleted: false },
    include: {
      demand: true
    }
  });

  if (!purchaseOrder) {
    return next(new AppError('Purchase Order not found', 404));
  }

  // Only allow updates if PO is in DRAFT status
  if (purchaseOrder.status !== 'DRAFT') {
    return next(new AppError('Can only update PO in DRAFT status', 400));
  }

  // If updating totalQuantity, validate against demand
  if (totalQuantity) {
    const existingPOQuantity = await getTotalPOQuantityForDemand(purchaseOrder.demandId);
    const currentPOQuantity = Number(purchaseOrder.totalQuantity);
    const newTotalQuantity = existingPOQuantity - currentPOQuantity + Number(totalQuantity);
    const demandQuantity = Number(purchaseOrder.demand.quantity);

    if (newTotalQuantity > demandQuantity && (!notes || notes.trim() === '')) {
      return next(new AppError('Notes are required when PO quantity exceeds demand quantity', 400));
    }
  }

  const updatedPO = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status,
      totalQuantity,
      updatedBy: req.user.id,
      ...(items && {
        items: {
          deleteMany: {},
          create: items.map((item: any) => ({
            materialId: item.materialId,
            vendorId: item.vendorId,
            quantity: item.quantity
          }))
        }
      })
    },
    include: {
      demand: {
        include: {
          section: {
            include: {
              project: true
            }
          }
        }
      },
      section: true,
      items: {
        include: {
          material: true,
          vendor: true
        }
      }
    }
  });

  // Update demand status if quantity changed
  if (totalQuantity) {
    await updateDemandStatus(purchaseOrder.demandId);
  }

  res.status(200).json({
    status: 'success',
    data: updatedPO
  });
});

// Delete Purchase Order (soft delete)
export const deletePurchaseOrder = catchAsync(async (req: Request, res: Response, next) => {
  const { id } = req.params;

  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id, isDeleted: false },
    include: {
      demand: true
    }
  });

  if (!purchaseOrder) {
    return next(new AppError('Purchase Order not found', 404));
  }

  // Only allow deletion if PO is in DRAFT status
  if (purchaseOrder.status !== 'DRAFT') {
    return next(new AppError('Can only delete PO in DRAFT status', 400));
  }

  await prisma.purchaseOrder.update({
    where: { id },
    data: {
      isDeleted: true,
      updatedBy: req.user.id
    }
  });

  // Update demand status after deletion
  await updateDemandStatus(purchaseOrder.demandId);

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Get POs by vendor for accountant
export const getPurchaseOrdersByVendor = catchAsync(async (req: Request, res: Response) => {
  const { vendorId, projectId, sectionId } = req.query;

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      isDeleted: false,
      items: {
        some: {
          vendorId: vendorId as string
        }
      },
      ...(projectId && { projectId: projectId as string }),
      ...(sectionId && { sectionId: sectionId as string })
    },
    include: {
      demand: {
        include: {
          section: {
            include: {
              project: true
            }
          }
        }
      },
      section: true,
      items: {
        where: {
          vendorId: vendorId as string
        },
        include: {
          material: true,
          vendor: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.status(200).json({
    status: 'success',
    data: purchaseOrders
  });
});

// Get POs summary for project
export const getPurchaseOrderSummary = catchAsync(async (req: Request, res: Response) => {
  const { projectId, sectionId } = req.query;

  const where: any = {
    isDeleted: false
  };

  if (projectId) where.projectId = projectId as string;
  if (sectionId) where.sectionId = sectionId as string;

  const summary = await prisma.purchaseOrder.groupBy({
    by: ['status'],
    where,
    _count: {
      id: true
    },
    _sum: {
      totalQuantity: true
    }
  });

  const totalPOs = await prisma.purchaseOrder.count({ where });
  const totalAmount = await prisma.purchaseOrderItem.aggregate({
    where: {
      purchaseOrder: where
    },
    _sum: {
      quantity: true
    }
  });

  res.status(200).json({
    status: 'success',
    data: {
      summary,
      totalPOs,
      totalQuantity: totalAmount._sum.quantity || 0
    }
  });
});

// Get PO statistics for a specific demand
export const getDemandPOStatistics = catchAsync(async (req: Request, res: Response, next) => {
  const { demandId } = req.params;

  const demand = await prisma.demand.findUnique({
    where: { id: demandId }
  });

  if (!demand) {
    return next(new AppError('Demand not found', 404));
  }

  const totalPOQuantity = await getTotalPOQuantityForDemand(demandId);
  const demandQuantity = Number(demand.quantity);
  const remainingQuantity = demandQuantity - totalPOQuantity;

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      demandId,
      isDeleted: false
    },
    include: {
      items: {
        include: {
          material: true,
          vendor: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.status(200).json({
    status: 'success',
    data: {
      demand,
      totalPOQuantity,
      demandQuantity,
      remainingQuantity,
      purchaseOrders,
      isFullyCovered: totalPOQuantity >= demandQuantity,
      isPartiallyCovered: totalPOQuantity > 0 && totalPOQuantity < demandQuantity
    }
  });
});

// Accountant adds amount to a PO item
export const addPOItemAmount = catchAsync(async (req: Request, res: Response, next) => {
  const { itemId } = req.params;
  const { unitPrice, totalPrice } = req.body;
  const userId = req.user.id;

  // Only ACCOUNTANT or ADMIN can perform this action
  if (!['ACCOUNTANT', 'ADMIN'].includes(req.user.role)) {
    return next(new AppError('Only Accountant or Admin can add PO item amount', 403));
  }

  // Validate PO item exists
  const poItem = await prisma.purchaseOrderItem.findUnique({
    where: { id: itemId },
    include: { vendor: true }
  });
  if (!poItem) {
    return next(new AppError('Purchase Order Item not found', 404));
  }
  if (!poItem.vendor) {
    return next(new AppError('Vendor not found for this PO item', 404));
  }

  // Update PO item with price info
  const updatedPOItem = await prisma.purchaseOrderItem.update({
    where: { id: itemId },
    data: {
      unitPrice,
      totalPrice,
      isPaymentAdded: true,
      amountAddedBy: userId,
      amountAddedAt: new Date()
    }
  });

  // Find or create vendor account
  let vendorAccount = await prisma.vendorAccount.findUnique({ where: { vendorId: poItem.vendorId } });
  if (!vendorAccount) {
    vendorAccount = await prisma.vendorAccount.create({ data: { vendorId: poItem.vendorId } });
  }

  // Create VendorAccountTransaction (CREDIT)
  await prisma.vendorAccountTransaction.create({
    data: {
      vendorAccountId: vendorAccount.id,
      type: 'CREDIT',
      amount: totalPrice,
      purchaseOrderItemId: itemId,
      addedBy: userId
    }
  });

  // Update vendor account totals
  const allCredits = await prisma.vendorAccountTransaction.findMany({
    where: { vendorAccountId: vendorAccount.id, type: 'CREDIT' }
  });
  const totalCredited = allCredits.reduce((sum, t) => sum + Number(t.amount), 0);
  const totalDebited = vendorAccount.totalDebited;
  const balance = totalCredited - Number(totalDebited);
  await prisma.vendorAccount.update({
    where: { id: vendorAccount.id },
    data: {
      totalCredited,
      balance
    }
  });

  res.status(200).json({
    status: 'success',
    data: {
      poItem: updatedPOItem,
      vendorAccount: {
        id: vendorAccount.id,
        totalCredited,
        totalDebited,
        balance
      }
    }
  });
}); 