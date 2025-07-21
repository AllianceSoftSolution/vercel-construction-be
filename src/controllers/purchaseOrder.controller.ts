import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import { sendNotificationToUserSafe } from "../utils/notification";

const prisma = new PrismaClient();

// Helper to generate PO reference number
async function generatePOReferenceNumber(sectionId: string) {
  // Fetch section and project
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { project: true },
  });
  if (!section || !section.project) {
    throw new AppError(
      "Section or project not found for reference number generation",
      400
    );
  }
  // Example: PO-PROJCODE-SECTIONCODE-<timestamp>
  return `PO-${section.project.code}-${section.code}-${Date.now()}`;
}

// Helper to calculate total PO quantity for a demand
async function getTotalPOQuantityForDemand(demandId: string) {
  const existingPOs = await prisma.purchaseOrder.findMany({
    where: {
      demandId,
      isDeleted: false,
    },
    select: {
      quantity: true,
    },
  });

  return existingPOs.reduce((total, po) => total + Number(po.quantity), 0);
}

// Helper to update demand status based on PO quantities
async function updateDemandStatus(demandId: string) {
  const demand = await prisma.demand.findUnique({
    where: { id: demandId },
  });

  if (!demand) return;

  const totalPOQuantity = await getTotalPOQuantityForDemand(demandId);
  const demandQuantity = Number(demand.quantity);

  let newStatus = demand.status;

  if (totalPOQuantity === 0) {
    // No POs created yet
    if (demand.status === "APPROVED") {
      newStatus = "APPROVED";
    }
  } else if (totalPOQuantity < demandQuantity) {
    // Partial POs created
    newStatus = "PO_IN_PROGRESS";
  } else if (totalPOQuantity >= demandQuantity) {
    // Full or more POs created
    newStatus = "PO_CREATED";
  }

  // Update demand status if changed
  if (newStatus !== demand.status) {
    await prisma.demand.update({
      where: { id: demandId },
      data: {
        status: newStatus,
        updatedBy: demand.createdBy, // Keep the original creator
      },
    });
  }
}

// Create a new Purchase Order
export const createPurchaseOrder = catchAsync(
  async (req: Request, res: Response, next) => {
    const { demandId, materialId, vendorId, quantity, sectionId, notes } =
      req.body;

    // Check if user has permission (Site Incharge or Admin only)
    if (!["SITE_INCHARGE", "ADMIN"].includes(req.user.role)) {
      return next(
        new AppError(
          "Only Site Incharge and Admin can create Purchase Orders",
          403
        )
      );
    }

    // Validate required fields
    if (!demandId || !materialId || !vendorId || !quantity || !sectionId) {
      return next(
        new AppError(
          "demandId, materialId, vendorId, quantity, and sectionId are required",
          400
        )
      );
    }

    // Validate demand exists and is approved
    const demand = await prisma.demand.findUnique({
      where: { id: demandId },
      include: {
        section: {
          include: {
            project: true,
          },
        },
      },
    });

    if (!demand) {
      return next(new AppError("Demand not found", 404));
    }

    // Check if demand is approved
    if (demand.status !== "APPROVED" && demand.status !== "PO_IN_PROGRESS") {
      return next(
        new AppError("Demand must be approved before creating PO", 400)
      );
    }

    // Calculate existing PO quantities for this demand
    const existingPOQuantity = await getTotalPOQuantityForDemand(demandId);
    const demandQuantity = Number(demand.quantity);
    const newTotalQuantity = existingPOQuantity + Number(quantity);

    // Check if new PO quantity exceeds demand quantity
    if (newTotalQuantity > demandQuantity) {
      // Require notes when exceeding demand quantity
      if (!notes || notes.trim() === "") {
        return next(
          new AppError(
            "Notes are required when PO quantity exceeds demand quantity",
            400
          )
        );
      }
    }

    // Validate material and vendor exist
    const material = await prisma.material.findUnique({
      where: { id: materialId },
    });
    if (!material) {
      return next(
        new AppError(`Material with id ${materialId} not found`, 404)
      );
    }
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
      return next(new AppError(`Vendor with id ${vendorId} not found`, 404));
    }

    // Generate reference number
    const referenceNumber = await generatePOReferenceNumber(sectionId);

    // Create PO
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        demandId,
        projectId: demand.section.projectId,
        sectionId,
        referenceNumber,
        materialId,
        vendorId,
        quantity,
        createdBy: req.user.id,
      },
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
    });

    // Update demand status based on new PO quantities
    await updateDemandStatus(demandId);

    res.status(201).json({
      status: "success",
      message: "Purchase Order created successfully",
      data: purchaseOrder,
    });
    await sendNotificationToUserSafe({
      userId: req.user.id,
      title: "Purchase Order Created",
      body: `Purchase Order ${purchaseOrder.referenceNumber} was created successfully.`,
    });
  }
);

// Get all Purchase Orders with filters
export const getPurchaseOrders = catchAsync(
  async (req: Request, res: Response) => {
    const {
      projectId,
      sectionId,
      demandId,
      status,
      hasAmount,
      page = 1,
      limit = 10,
    } = req.query;
    const user = req.user;

    const skip = (Number(page) - 1) * Number(limit);

    let where: any = {
      isDeleted: false,
    };

    if (projectId) where.projectId = projectId as string;
    if (sectionId) where.sectionId = sectionId as string;
    if (demandId) where.demandId = demandId as string;
    if (status) where.status = status as string;

    // Filter by amount status
    if (hasAmount === "true") {
      where.unitPrice = { not: null };
    } else if (hasAmount === "false") {
      where.unitPrice = null;
    }

    // Role-based filtering for POs
    if (user.role === "ADMIN" || (user.role === "ACCOUNTANT" && user.isHead)) {
      // No filter, see all
    } else if (user.role === "SITE_INCHARGE") {
      const assignments = await prisma.siteInchargeAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);
      where.sectionId = { in: sectionIds };
    } else if (user.role === "PROJECT_MANAGER") {
      const assignments = await prisma.projectManagerAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);
      where.sectionId = { in: sectionIds };
    } else if (user.role === "CONSTRUCTION_MANAGER") {
      const assignments = await prisma.constructionManagerAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);
      where.sectionId = { in: sectionIds };
    } else if (user.role === "STORE_INCHARGE") {
      const assignments = await prisma.storeInchargeAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { store: { select: { sectionId: true } } },
      });
      const sectionIds = assignments.map((a) => a.store.sectionId);
      where.sectionId = { in: sectionIds };
    } else if (user.role === "ACCOUNTANT") {
      const assignments = await prisma.accountantAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);
      where.sectionId = { in: sectionIds };
    }

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
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
        material: true, // <-- Add this line to include material details
      },
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    });

    const total = await prisma.purchaseOrder.count({ where });

    res.status(200).json({
      status: "success",
      data: purchaseOrders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  }
);

// Get single Purchase Order
export const getPurchaseOrder = catchAsync(
  async (req: Request, res: Response, next) => {
    const { id } = req.params;
    const user = req.user;

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, isDeleted: false },
      include: {
        demand: {
          include: {
            section: {
              include: {
                project: true,
              },
            },
            approvals: {
              include: {
                user: true,
              },
            },
          },
        },
        section: true,
      },
    });

    if (!purchaseOrder) {
      return next(new AppError("Purchase Order not found", 404));
    }

    // Role-based access check
    if (user.role !== "ADMIN") {
      let assigned = false;
      const sectionId = purchaseOrder.sectionId;
      if (user.role === "SITE_INCHARGE") {
        const assignment = await prisma.siteInchargeAssignment.findFirst({
          where: { userId: user.id, sectionId, isActive: true },
        });
        assigned = !!assignment;
      } else if (user.role === "PROJECT_MANAGER") {
        const assignment = await prisma.projectManagerAssignment.findFirst({
          where: { userId: user.id, sectionId, isActive: true },
        });
        assigned = !!assignment;
      } else if (user.role === "CONSTRUCTION_MANAGER") {
        const assignment = await prisma.constructionManagerAssignment.findFirst(
          {
            where: { userId: user.id, sectionId, isActive: true },
          }
        );
        assigned = !!assignment;
      } else if (user.role === "STORE_INCHARGE") {
        const assignment = await prisma.storeInchargeAssignment.findFirst({
          where: { userId: user.id, isActive: true, store: { sectionId } },
        });
        assigned = !!assignment;
      } else if (user.role === "ACCOUNTANT") {
        const assignment = await prisma.accountantAssignment.findFirst({
          where: { userId: user.id, sectionId, isActive: true },
        });
        assigned = !!assignment;
      }
      if (!assigned) {
        return next(
          new AppError(
            "Access denied: not assigned to this purchase order's section",
            403
          )
        );
      }
    }

    res.status(200).json({
      status: "success",
      data: purchaseOrder,
    });
  }
);

// Update Purchase Order
export const updatePurchaseOrder = catchAsync(
  async (req: Request, res: Response, next) => {
    const { id } = req.params;
    const { status, materialId, vendorId, quantity, notes } = req.body;

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, isDeleted: false },
      include: {
        demand: true,
      },
    });

    if (!purchaseOrder) {
      return next(new AppError("Purchase Order not found", 404));
    }

    // Only allow updates if PO is in CREATED or CONFIRMED status
    if (!["CREATED", "CONFIRMED"].includes(purchaseOrder.status)) {
      return next(
        new AppError("Can only update PO in CREATED or CONFIRMED status", 400)
      );
    }

    // Validate status transition
    if (
      status &&
      !["CREATED", "CONFIRMED", "ORDER_PLACED", "CANCELLED"].includes(status)
    ) {
      return next(new AppError("Invalid status transition", 400));
    }

    // If updating quantity, validate against demand
    if (quantity) {
      const existingPOQuantity = await getTotalPOQuantityForDemand(
        purchaseOrder.demandId
      );
      const currentPOQuantity = Number(purchaseOrder.quantity);
      const newTotalQuantity =
        existingPOQuantity - currentPOQuantity + Number(quantity);
      const demandQuantity = Number(purchaseOrder.demand.quantity);

      if (
        newTotalQuantity > demandQuantity &&
        (!notes || notes.trim() === "")
      ) {
        return next(
          new AppError(
            "Notes are required when PO quantity exceeds demand quantity",
            400
          )
        );
      }
    }

    // Validate material and vendor exist if updating
    if (materialId) {
      const material = await prisma.material.findUnique({
        where: { id: materialId },
      });
      if (!material) {
        return next(
          new AppError(`Material with id ${materialId} not found`, 404)
        );
      }
    }
    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
      });
      if (!vendor) {
        return next(new AppError(`Vendor with id ${vendorId} not found`, 404));
      }
    }

    const updatedPO = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status,
        materialId,
        vendorId,
        quantity,
        updatedBy: req.user.id,
      },
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
    });

    // Update demand status if quantity changed
    if (quantity) {
      await updateDemandStatus(purchaseOrder.demandId);
    }

    res.status(200).json({
      status: "success",
      data: updatedPO,
    });
    await sendNotificationToUserSafe({
      userId: req.user.id,
      title: "Purchase Order Updated",
      body: `Purchase Order ${updatedPO.referenceNumber} was updated successfully.`,
    });
  }
);

// Delete Purchase Order (soft delete)
export const deletePurchaseOrder = catchAsync(
  async (req: Request, res: Response, next) => {
    const { id } = req.params;

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, isDeleted: false },
      include: {
        demand: true,
      },
    });

    if (!purchaseOrder) {
      return next(new AppError("Purchase Order not found", 404));
    }

    // Only allow deletion if PO is in CREATED or CONFIRMED status
    if (!["CREATED", "CONFIRMED"].includes(purchaseOrder.status)) {
      return next(
        new AppError("Can only delete PO in CREATED or CONFIRMED status", 400)
      );
    }

    await prisma.purchaseOrder.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedBy: req.user.id,
      },
    });

    // Update demand status after deletion
    await updateDemandStatus(purchaseOrder.demandId);

    res.status(204).json({
      status: "success",
      data: null,
    });
    await sendNotificationToUserSafe({
      userId: req.user.id,
      title: "Purchase Order Deleted",
      body: `Purchase Order was deleted successfully.`,
    });
  }
);

// Fix getPurchaseOrdersByVendor
export const getPurchaseOrdersByVendor = catchAsync(
  async (req: Request, res: Response) => {
    const { vendorId, projectId, sectionId } = req.query;

    const where: any = {
      isDeleted: false,
      ...(vendorId && { vendorId: vendorId as string }),
      ...(projectId && { projectId: projectId as string }),
      ...(sectionId && { sectionId: sectionId as string }),
    };

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
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
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      status: "success",
      data: purchaseOrders,
    });
  }
);

// Fix getPurchaseOrderSummary
export const getPurchaseOrderSummary = catchAsync(
  async (req: Request, res: Response) => {
    const { projectId, sectionId } = req.query;

    const where: any = {
      isDeleted: false,
    };

    if (projectId) where.projectId = projectId as string;
    if (sectionId) where.sectionId = sectionId as string;

    const summary = await prisma.purchaseOrder.groupBy({
      by: ["status"],
      where,
      _count: {
        id: true,
      },
      _sum: {
        quantity: true,
      },
    });

    const totalPOs = await prisma.purchaseOrder.count({ where });
    const totalAmount = await prisma.purchaseOrder.aggregate({
      where,
      _sum: {
        quantity: true,
      },
    });

    res.status(200).json({
      status: "success",
      data: {
        summary,
        totalPOs,
        totalQuantity: totalAmount._sum.quantity || 0,
      },
    });
  }
);

// Fix getDemandPOStatistics
export const getDemandPOStatistics = catchAsync(
  async (req: Request, res: Response, next) => {
    const { demandId } = req.params;

    const demand = await prisma.demand.findUnique({
      where: { id: demandId },
    });

    if (!demand) {
      return next(new AppError("Demand not found", 404));
    }

    const totalPOQuantity = await getTotalPOQuantityForDemand(demandId);
    const demandQuantity = Number(demand.quantity);
    const remainingQuantity = demandQuantity - totalPOQuantity;

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        demandId,
        isDeleted: false,
      },
      include: {
        material: true,
        vendor: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      status: "success",
      data: {
        demand,
        totalPOQuantity,
        demandQuantity,
        remainingQuantity,
        purchaseOrders,
        isFullyCovered: totalPOQuantity >= demandQuantity,
        isPartiallyCovered:
          totalPOQuantity > 0 && totalPOQuantity < demandQuantity,
      },
    });
  }
);

// Update PO Status (dedicated endpoint for status transitions)
export const updatePOStatus = catchAsync(
  async (req: Request, res: Response, next) => {
    const { id } = req.params;
    const { status } = req.body;

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, isDeleted: false },
      include: {
        demand: true,
        material: true,
        vendor: true,
      },
    });

    if (!purchaseOrder) {
      return next(new AppError("Purchase Order not found", 404));
    }

    // Define valid status transitions
    const validTransitions: Record<string, string[]> = {
      CREATED: ["CONFIRMED", "ORDER_PLACED", "CANCELLED"],
      CONFIRMED: ["ORDER_PLACED", "CANCELLED"],
      ORDER_PLACED: ["IN_TRANSIT", "CANCELLED"],
      IN_TRANSIT: ["IN_STORE", "CANCELLED"],
      IN_STORE: ["COMPLETED"],
      COMPLETED: [], // Final state
      CANCELLED: [], // Final state
    };

    const currentStatus = purchaseOrder.status;
    const allowedTransitions = validTransitions[currentStatus] || [];

    if (!allowedTransitions.includes(status)) {
      return next(
        new AppError(
          `Invalid status transition from ${currentStatus} to ${status}. Allowed transitions: ${allowedTransitions.join(
            ", "
          )}`,
          400
        )
      );
    }

    // Additional validation for specific transitions
    if (status === "ORDER_PLACED") {
      // Validate that PO has required fields
      if (
        !purchaseOrder.materialId ||
        !purchaseOrder.vendorId ||
        !purchaseOrder.quantity
      ) {
        return next(
          new AppError(
            "PO must have material, vendor, and quantity before placing order",
            400
          )
        );
      }
    }

    const updatedPO = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status,
        updatedBy: req.user.id,
      },
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
    });

    res.status(200).json({
      status: "success",
      message: `Purchase Order status updated to ${status}`,
      data: updatedPO,
    });
    await sendNotificationToUserSafe({
      userId: req.user.id,
      title: "Purchase Order Status Updated",
      body: `Purchase Order ${updatedPO.referenceNumber} status changed to ${status}.`,
    });
  }
);

// Add Amount to PO and Credit Vendor Account
export const addPOAmount = catchAsync(
  async (req: Request, res: Response, next) => {
    const { id } = req.params;
    const { unitPrice, notes } = req.body;

    // Get uploaded file from middleware
    const filesFromS3 = (req as any).filesFromS3;
    const proofOfBill = filesFromS3?.proofOfBill;

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, isDeleted: false },
      include: {
        demand: true,
        material: true,
        vendor: true,
      },
    });

    if (!purchaseOrder) {
      return next(new AppError("Purchase Order not found", 404));
    }

    // Only allow adding amounts if PO is in CREATED status
    if (purchaseOrder.status !== "CREATED") {
      return next(
        new AppError("Can only add amounts to PO in CREATED status", 400)
      );
    }

    if (!unitPrice || unitPrice <= 0) {
      return next(new AppError("Unit price must be greater than 0", 400));
    }

    if (!proofOfBill) {
      return next(new AppError("Proof of bill/invoice file is required", 400));
    }

    const totalAmount = Number(purchaseOrder.quantity) * Number(unitPrice);

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Update PO with amount details and automatically change status to CONFIRMED
      const updatedPO = await tx.purchaseOrder.update({
        where: { id },
        data: {
          unitPrice: new Decimal(unitPrice),
          totalAmount: new Decimal(totalAmount),
          proofOfBill,
          amountAddedBy: req.user.id,
          amountAddedAt: new Date(),
          status: "CONFIRMED", // Automatically change status to CONFIRMED
          updatedBy: req.user.id,
        },
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
      });

      // Get or create vendor account
      let vendorAccount = await tx.vendorAccount.findUnique({
        where: { vendorId: purchaseOrder.vendorId },
      });

      if (!vendorAccount) {
        vendorAccount = await tx.vendorAccount.create({
          data: {
            vendorId: purchaseOrder.vendorId,
            totalCredited: new Decimal(0),
            totalDebited: new Decimal(0),
            balance: new Decimal(0),
          },
        });
      }

      // Create vendor account transaction (CREDIT)
      await tx.vendorAccountTransaction.create({
        data: {
          vendorAccountId: vendorAccount.id,
          type: "CREDIT",
          amount: new Decimal(totalAmount),
          purchaseOrderId: purchaseOrder.id,
          addedBy: req.user.id,
          proofOfPayment: proofOfBill,
          note: notes || `Credit for PO ${purchaseOrder.referenceNumber}`,
        },
      });

      // Update vendor account balance
      await tx.vendorAccount.update({
        where: { id: vendorAccount.id },
        data: {
          totalCredited: vendorAccount.totalCredited.add(
            new Decimal(totalAmount)
          ),
          balance: vendorAccount.balance.add(new Decimal(totalAmount)),
        },
      });

      return updatedPO;
    });

    res.status(200).json({
      status: "success",
      message: `Amount added to PO, status changed to CONFIRMED, and vendor account credited with ${totalAmount}`,
      data: result,
    });
  }
);
