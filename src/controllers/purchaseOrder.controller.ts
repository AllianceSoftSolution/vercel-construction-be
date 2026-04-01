import { Request, Response, NextFunction } from "express";
import { Decimal } from "@prisma/client/runtime/library";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/appError";
import { sendNotificationToUserSafe } from "../utils/notification";
import { generatePOReferenceNumber } from "../utils/generateCode";
import { NotificationService } from "../utils/notificationService";
import prisma from "../utils/prisma";

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
    // Partial POs created - less than demand quantity
    newStatus = "PARTIALLY_PO_CREATED";
  } else if (totalPOQuantity >= demandQuantity) {
    // Full or more POs created - equal to or greater than demand quantity
    newStatus = "PO_CREATED";
  }

  // Calculate new fulfilled and remaining quantities
  const newFulfilledQuantity = totalPOQuantity;
  const newRemainingQuantity = demandQuantity - totalPOQuantity;

  // Update demand status and quantities if changed
  if (
    newStatus !== demand.status ||
    newFulfilledQuantity !== Number(demand.quantityFulfilled || 0) ||
    newRemainingQuantity !== Number(demand.quantityRemaining || demandQuantity)
  ) {
    await prisma.demand.update({
      where: { id: demandId },
      data: {
        status: newStatus,
        quantityFulfilled: newFulfilledQuantity,
        quantityRemaining: newRemainingQuantity,
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
    if (
      demand.status !== "APPROVED" &&
      demand.status !== "PO_IN_PROGRESS" &&
      demand.status !== "PARTIALLY_PO_CREATED"
    ) {
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
    const referenceNumber = await generatePOReferenceNumber(demandId);

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
        notes: notes || null, // Store notes if provided
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

    // Use the new notification service for comprehensive notifications
    await NotificationService.notifyPOCreated(purchaseOrder.id);
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
    if (user.role === "ADMIN") {
      // No filter, see all
    } else if (user.role === "ACCOUNTANT") {
      if (user.isHead) {
        // Head Accountant sees all POs — no filter
      } else {
        // Section Accountant: scope strictly to their assigned section(s)
        const assignments = await prisma.accountantAssignment.findMany({
          where: { userId: user.id, isActive: true },
          select: { sectionId: true },
        });
        const sectionIds = assignments.map((a) => a.sectionId);
        where.sectionId = { in: sectionIds };
      }
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
      where.demand = {
        ...(where.demand || {}),
        createdBy: user.id,
      };
    } else if (user.role === "STORE_INCHARGE") {
      const assignments = await prisma.storeInchargeAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { store: { select: { sectionId: true } } },
      });
      const sectionIds = assignments.map((a) => a.store.sectionId);
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
        material: true, // already included
        vendor: true, // <-- add this line to include vendor details
        amountAdder: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
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
        material: true, // <-- add this line to include material details
        vendor: true, // <-- add this line to include vendor details
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

      if (
        user.role === "CONSTRUCTION_MANAGER" &&
        purchaseOrder.demand?.createdBy !== user.id
      ) {
        return next(
          new AppError(
            "Access denied: purchase order not linked to your demands",
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
        notes: notes !== undefined ? notes || null : undefined, // Update notes if provided
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
    const user = req.user;

    const where: any = {
      isDeleted: false,
      ...(vendorId && { vendorId: vendorId as string }),
      ...(projectId && { projectId: projectId as string }),
      ...(sectionId && { sectionId: sectionId as string }),
    };

    // Apply role-based filtering
    if (user.role === "ADMIN") {
      // No additional filter
    } else if (user.role === "ACCOUNTANT") {
      // Filter by assigned projects
      const assignments = await prisma.accountantAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { projectId: true },
      });
      
      if (assignments.length > 0) {
        const projectIds = [...new Set(assignments.map((a) => a.projectId))];
        where.projectId = where.projectId 
          ? { equals: where.projectId, in: projectIds } 
          : { in: projectIds };
      } else {
        where.projectId = { in: [] }; // No assignments = no access
      }
    } else if (user.role === "SITE_INCHARGE") {
      const assignments = await prisma.siteInchargeAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);
      where.sectionId = where.sectionId
        ? { equals: where.sectionId, in: sectionIds }
        : { in: sectionIds };
    } else if (user.role === "PROJECT_MANAGER") {
      const assignments = await prisma.projectManagerAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);
      where.sectionId = where.sectionId
        ? { equals: where.sectionId, in: sectionIds }
        : { in: sectionIds };
    } else if (user.role === "CONSTRUCTION_MANAGER") {
      const assignments = await prisma.constructionManagerAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);
      where.sectionId = where.sectionId
        ? { equals: where.sectionId, in: sectionIds }
        : { in: sectionIds };
    } else if (user.role === "STORE_INCHARGE") {
      const assignments = await prisma.storeInchargeAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { store: { select: { sectionId: true } } },
      });
      const sectionIds = assignments.map((a) => a.store.sectionId);
      where.sectionId = where.sectionId
        ? { equals: where.sectionId, in: sectionIds }
        : { in: sectionIds };
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
    const user = req.user;

    const where: any = {
      isDeleted: false,
    };

    if (projectId) where.projectId = projectId as string;
    if (sectionId) where.sectionId = sectionId as string;

    // Apply role-based filtering
    if (user.role === "ADMIN") {
      // No additional filter
    } else if (user.role === "ACCOUNTANT") {
      // Filter by assigned projects
      const assignments = await prisma.accountantAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { projectId: true },
      });
      
      if (assignments.length > 0) {
        const projectIds = [...new Set(assignments.map((a) => a.projectId))];
        where.projectId = where.projectId 
          ? (projectIds.includes(where.projectId) ? where.projectId : { in: [] })
          : { in: projectIds };
      } else {
        where.projectId = { in: [] }; // No assignments = no access
      }
    } else if (user.role === "SITE_INCHARGE") {
      const assignments = await prisma.siteInchargeAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);
      if (!where.sectionId) {
        where.sectionId = { in: sectionIds };
      } else if (!sectionIds.includes(where.sectionId as string)) {
        where.sectionId = { in: [] }; // Requested section not in assignments
      }
    } else if (user.role === "PROJECT_MANAGER") {
      const assignments = await prisma.projectManagerAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);
      if (!where.sectionId) {
        where.sectionId = { in: sectionIds };
      } else if (!sectionIds.includes(where.sectionId as string)) {
        where.sectionId = { in: [] };
      }
    } else if (user.role === "CONSTRUCTION_MANAGER") {
      const assignments = await prisma.constructionManagerAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { sectionId: true },
      });
      const sectionIds = assignments.map((a) => a.sectionId);
      if (!where.sectionId) {
        where.sectionId = { in: sectionIds };
      } else if (!sectionIds.includes(where.sectionId as string)) {
        where.sectionId = { in: [] };
      }
    } else if (user.role === "STORE_INCHARGE") {
      const assignments = await prisma.storeInchargeAssignment.findMany({
        where: { userId: user.id, isActive: true },
        select: { store: { select: { sectionId: true } } },
      });
      const sectionIds = assignments.map((a) => a.store.sectionId);
      if (!where.sectionId) {
        where.sectionId = { in: sectionIds };
      } else if (!sectionIds.includes(where.sectionId as string)) {
        where.sectionId = { in: [] };
      }
    }

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

// Update PO amount within 24 hours
export const updatePOAmount = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { unitPrice, notes } = req.body;
    const filesFromS3 = (req as any).filesFromS3;
    const proofOfBill = filesFromS3?.proofOfBill;

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, isDeleted: false },
      include: {
        demand: true,
        material: true,
        vendor: true,
        amountAdder: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!purchaseOrder) {
      return next(new AppError("Purchase Order not found", 404));
    }

    // Check if amount was added
    if (!purchaseOrder.amountAddedAt) {
      return next(
        new AppError("No amount has been added to this PO yet", 400)
      );
    }

    // Check if within 24 hours
    const now = new Date();
    const amountAddedAt = new Date(purchaseOrder.amountAddedAt);
    const hoursDiff = (now.getTime() - amountAddedAt.getTime()) / (1000 * 60 * 60);

    if (hoursDiff > 24) {
      return next(
        new AppError(
          "Cannot edit: 24-hour edit window has expired",
          400
        )
      );
    }

    // Check if user is the one who added the amount (or is admin/head accountant)
    const user = req.user;
    if (
      purchaseOrder.amountAddedBy !== user.id &&
      user.role !== "ADMIN" &&
      !(user.role === "ACCOUNTANT" && user.isHead)
    ) {
      return next(
        new AppError(
          "Only the user who added the amount can edit it (or admin/head accountant)",
          403
        )
      );
    }

    if (!unitPrice || unitPrice <= 0) {
      return next(new AppError("Unit price must be greater than 0", 400));
    }

    const oldTotalAmount = Number(purchaseOrder.totalAmount || 0);
    const newTotalAmount = Number(purchaseOrder.quantity) * Number(unitPrice);
    const amountDifference = newTotalAmount - oldTotalAmount;

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Update PO with new amount details
      const updateData: any = {
        unitPrice: new Decimal(unitPrice),
        totalAmount: new Decimal(newTotalAmount),
        updatedBy: user.id,
      };

      if (notes) {
        updateData.notes = notes;
      }

      if (proofOfBill) {
        updateData.proofOfBill = proofOfBill;
      }

      const updatedPO = await tx.purchaseOrder.update({
        where: { id },
        data: updateData,
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
          amountAdder: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Get vendor account
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

      // Find the existing transaction for this PO
      const existingTransaction = await tx.vendorAccountTransaction.findFirst({
        where: {
          vendorAccountId: vendorAccount.id,
          purchaseOrderId: purchaseOrder.id,
          type: "CREDIT",
        },
      });

      if (existingTransaction) {
        // Update existing transaction
        await tx.vendorAccountTransaction.update({
          where: { id: existingTransaction.id },
          data: {
            amount: new Decimal(newTotalAmount),
            note: notes || existingTransaction.note || `Credit for PO ${purchaseOrder.referenceNumber}`,
            ...(proofOfBill && { proofOfPayment: proofOfBill }),
          },
        });
      } else {
        // Create new transaction if it doesn't exist
        await tx.vendorAccountTransaction.create({
          data: {
            vendorAccountId: vendorAccount.id,
            type: "CREDIT",
            amount: new Decimal(newTotalAmount),
            purchaseOrderId: purchaseOrder.id,
            addedBy: user.id,
            proofOfPayment: proofOfBill || purchaseOrder.proofOfBill,
            note: notes || `Credit for PO ${purchaseOrder.referenceNumber}`,
          },
        });
      }

      // Update vendor account balance
      const newTotalCredited = vendorAccount.totalCredited
        .sub(new Decimal(oldTotalAmount))
        .add(new Decimal(newTotalAmount));

      await tx.vendorAccount.update({
        where: { id: vendorAccount.id },
        data: {
          totalCredited: newTotalCredited,
          balance: vendorAccount.balance
            .sub(new Decimal(oldTotalAmount))
            .add(new Decimal(newTotalAmount)),
        },
      });

      return updatedPO;
    });

    res.status(200).json({
      status: "success",
      message: `PO amount updated successfully. Amount difference: ${amountDifference >= 0 ? '+' : ''}${amountDifference}`,
      data: result,
    });
  }
);
