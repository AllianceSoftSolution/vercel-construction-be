import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import catchAsync from "../utils/catchAsync";

const prisma = new PrismaClient();

// Helper function to get user's accessible section IDs based on role
const getUserAccessibleSections = async (userId: string, userRole: string) => {
  let sectionIds: string[] = [];

  // First, get the user to check if they are a head user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isHead: true },
  });

  switch (userRole) {
    case "ADMIN":
      // Admin can see all sections
      const allSections = await prisma.section.findMany({
        where: { isDeleted: false },
        select: { id: true },
      });
      sectionIds = allSections.map((s) => s.id);
      break;

    case "SITE_INCHARGE":
      const siteInchargeAssignments =
        await prisma.siteInchargeAssignment.findMany({
          where: { userId, isActive: true },
          select: { sectionId: true },
        });
      sectionIds = siteInchargeAssignments.map((a) => a.sectionId);
      break;

    case "PROJECT_MANAGER":
      const projectManagerAssignments =
        await prisma.projectManagerAssignment.findMany({
          where: { userId, isActive: true },
          select: { sectionId: true },
        });
      sectionIds = projectManagerAssignments.map((a) => a.sectionId);
      break;

    case "CONSTRUCTION_MANAGER":
      const constructionManagerAssignments =
        await prisma.constructionManagerAssignment.findMany({
          where: { userId, isActive: true },
          select: { sectionId: true },
        });
      sectionIds = constructionManagerAssignments.map((a) => a.sectionId);
      break;

    case "STORE_INCHARGE":
      // If user is head store incharge, they can see all sections
      if (user?.isHead) {
        const allSections = await prisma.section.findMany({
          where: { isDeleted: false },
          select: { id: true },
        });
        sectionIds = allSections.map((s) => s.id);
      } else {
        // Regular store incharge - only assigned stores
        const storeInchargeAssignments =
          await prisma.storeInchargeAssignment.findMany({
            where: { userId, isActive: true },
            select: { store: { select: { sectionId: true } } },
          });
        sectionIds = storeInchargeAssignments.map((a) => a.store.sectionId);
      }
      break;

    case "ACCOUNTANT":
      // If user is head accountant, they can see all sections
      if (user?.isHead) {
        const allSections = await prisma.section.findMany({
          where: { isDeleted: false },
          select: { id: true },
        });
        sectionIds = allSections.map((s) => s.id);
      } else {
        // Regular accountant - only assigned sections
        const accountantAssignments =
          await prisma.accountantAssignment.findMany({
            where: { userId, isActive: true },
            select: { sectionId: true },
          });
        sectionIds = accountantAssignments.map((a) => a.sectionId);
      }
      break;
  }

  return sectionIds;
};

// Helper function to get user's accessible project IDs based on role
const getUserAccessibleProjects = async (userId: string, userRole: string) => {
  let projectIds: string[] = [];

  // First, get the user to check if they are a head user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isHead: true },
  });

  switch (userRole) {
    case "ADMIN":
      // Admin can see all projects
      const allProjects = await prisma.project.findMany({
        where: { isDeleted: false },
        select: { id: true },
      });
      projectIds = allProjects.map((p) => p.id);
      break;

    case "SITE_INCHARGE":
      const siteInchargeAssignments =
        await prisma.siteInchargeAssignment.findMany({
          where: { userId, isActive: true },
          select: { projectId: true },
        });
      projectIds = siteInchargeAssignments.map((a) => a.projectId);
      break;

    case "PROJECT_MANAGER":
      const projectManagerAssignments =
        await prisma.projectManagerAssignment.findMany({
          where: { userId, isActive: true },
          select: { projectId: true },
        });
      projectIds = projectManagerAssignments.map((a) => a.projectId);
      break;

    case "CONSTRUCTION_MANAGER":
      const constructionManagerAssignments =
        await prisma.constructionManagerAssignment.findMany({
          where: { userId, isActive: true },
          select: { section: { select: { projectId: true } } },
        });
      projectIds = constructionManagerAssignments.map(
        (a) => a.section.projectId
      );
      break;

    case "STORE_INCHARGE":
      // If user is head store incharge, they can see all projects
      if (user?.isHead) {
        const allProjects = await prisma.project.findMany({
          where: { isDeleted: false },
          select: { id: true },
        });
        projectIds = allProjects.map((p) => p.id);
      } else {
        // Regular store incharge - only assigned stores' projects
        const storeInchargeAssignments =
          await prisma.storeInchargeAssignment.findMany({
            where: { userId, isActive: true },
            select: {
              store: { select: { section: { select: { projectId: true } } } },
            },
          });
        projectIds = storeInchargeAssignments.map(
          (a) => a.store.section.projectId
        );
      }
      break;

    case "ACCOUNTANT":
      // If user is head accountant, they can see all projects
      if (user?.isHead) {
        const allProjects = await prisma.project.findMany({
          where: { isDeleted: false },
          select: { id: true },
        });
        projectIds = allProjects.map((p) => p.id);
      } else {
        // Regular accountant - only assigned projects
        const accountantAssignments =
          await prisma.accountantAssignment.findMany({
            where: { userId, isActive: true },
            select: { projectId: true },
          });
        projectIds = accountantAssignments.map((a) => a.projectId);
      }
      break;
  }

  return projectIds;
};

// ADMIN Dashboard Analytics
export const getAdminDashboard = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (user.role !== "ADMIN") {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Admin role required.",
      });
    }

    // Get accessible sections and projects
    const accessibleSectionIds = await getUserAccessibleSections(
      user.id,
      user.role
    );
    const accessibleProjectIds = await getUserAccessibleProjects(
      user.id,
      user.role
    );

    // 1. Total Projects
    const totalProjects = await prisma.project.count({
      where: {
        isDeleted: false,
        id: { in: accessibleProjectIds },
      },
    });

    // 2. Total Amount Spent (from POs with amounts)
    const totalAmountSpent = await prisma.purchaseOrder.aggregate({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
        totalAmount: { not: null },
      },
      _sum: {
        totalAmount: true,
      },
    });

    // 3. Total Amount Pending (from vendor accounts - positive balance means we owe them)
    const totalAmountPending = await prisma.vendorAccount.aggregate({
      where: {
        balance: { gt: 0 },
      },
      _sum: {
        balance: true,
      },
    });

    // 4. Total Amount Paid (from vendor accounts - total debited)
    const totalAmountPaid = await prisma.vendorAccount.aggregate({
      _sum: {
        totalDebited: true,
      },
    });

    // 5. Total Vendors
    const totalVendors = await prisma.vendor.count({
      where: { isDeleted: false },
    });

    // 6. Total Demands
    const totalDemands = await prisma.demand.count({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
    });

    // 7. Total POs Created
    const totalPOsCreated = await prisma.purchaseOrder.count({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
    });

    // 8. Demand Breakdown for Pie Chart
    const demandBreakdown = await prisma.demand.groupBy({
      by: ["status"],
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
      _count: {
        id: true,
      },
    });

    // 9. PO Distribution by Vendor for Bar Chart
    const poDistributionByVendor = await prisma.purchaseOrder.groupBy({
      by: ["vendorId"],
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
      _count: {
        id: true,
      },
    });

    // Get vendor names for the PO distribution
    const poDistributionWithVendorNames = await Promise.all(
      poDistributionByVendor.map(async (po) => {
        const vendor = await prisma.vendor.findUnique({
          where: { id: po.vendorId },
          select: { name: true },
        });
        return {
          vendorId: po.vendorId,
          vendorName: vendor?.name || "Unknown Vendor",
          poCount: po._count.id,
        };
      })
    );

    // 10. Financial Progress per Project for Grouped Bar Chart
    const financialProgressPerProject = await Promise.all(
      accessibleProjectIds.map(async (projectId) => {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true, code: true },
        });
        // Get total amount for this project
        const projectPOs = await prisma.purchaseOrder.aggregate({
          where: {
            projectId,
            isDeleted: false,
            totalAmount: { not: null },
          },
          _sum: {
            totalAmount: true,
          },
        });
        // Calculate paid amount based on vendor accounts
        // This is a simplified calculation - you might need to adjust based on your payment tracking logic
        const paidAmount = 0; // Placeholder - implement based on your payment tracking logic
        const totalAmount = Number(projectPOs._sum.totalAmount) || 0;
        const balanceAmount = totalAmount - paidAmount;
        return {
          projectId,
          projectName: project?.name || "Unknown Project",
          projectCode: project?.code || "",
          total: totalAmount,
          paid: paidAmount,
          balance: balanceAmount,
        };
      })
    );

    // 11. Total Users by Roles for Graph
    const usersByRole = await prisma.user.groupBy({
      by: ["role"],
      where: { isDeleted: false },
      _count: {
        id: true,
      },
    });

    // 12. Amount by Vendor Breakdown for Chart
    const amountByVendor = await prisma.purchaseOrder.groupBy({
      by: ["vendorId"],
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
        totalAmount: { not: null },
      },
      _sum: {
        totalAmount: true,
      },
    });

    // Get vendor names for the amount breakdown
    const amountByVendorWithNames = await Promise.all(
      amountByVendor.map(async (vendor) => {
        const vendorInfo = await prisma.vendor.findUnique({
          where: { id: vendor.vendorId },
          select: { name: true },
        });
        return {
          vendorId: vendor.vendorId,
          vendorName: vendorInfo?.name || "Unknown Vendor",
          totalAmount: Number(vendor._sum.totalAmount) || 0,
        };
      })
    );

    res.status(200).json({
      status: "success",
      data: {
        // Summary metrics
        summary: {
          totalProjects,
          totalAmountSpent: totalAmountSpent._sum.totalAmount || 0,
          totalAmountPending: totalAmountPending._sum.balance || 0,
          totalAmountPaid: totalAmountPaid._sum.totalDebited || 0,
          totalVendors,
          totalDemands,
          totalPOsCreated,
        },

        // Charts data
        charts: {
          demandBreakdown: demandBreakdown.map((item) => ({
            status: item.status,
            count: item._count.id,
          })),

          poDistributionByVendor: poDistributionWithVendorNames,

          financialProgressPerProject,

          usersByRole: usersByRole.map((item) => ({
            role: item.role,
            count: item._count.id,
          })),

          amountByVendor: amountByVendorWithNames,
        },
      },
    });
    return;
  }
);

// SITE_INCHARGE Dashboard Analytics
export const getSiteInchargeDashboard = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (user.role !== "SITE_INCHARGE") {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Site Incharge role required.",
      });
    }

    // Get accessible sections
    const accessibleSectionIds = await getUserAccessibleSections(
      user.id,
      user.role
    );

    // Get analytics for assigned sections only
    const totalProjects = await prisma.project.count({
      where: {
        isDeleted: false,
        sections: {
          some: {
            id: { in: accessibleSectionIds },
          },
        },
      },
    });

    const totalAmountSpent = await prisma.purchaseOrder.aggregate({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
        totalAmount: { not: null },
      },
      _sum: {
        totalAmount: true,
      },
    });

    const totalDemands = await prisma.demand.count({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
    });

    const totalPOsCreated = await prisma.purchaseOrder.count({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
    });

    // Demand breakdown for assigned sections
    const demandBreakdown = await prisma.demand.groupBy({
      by: ["status"],
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
      _count: {
        id: true,
      },
    });

    // PO distribution by vendor for assigned sections
    const poDistributionByVendor = await prisma.purchaseOrder.groupBy({
      by: ["vendorId"],
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
      _count: {
        id: true,
      },
    });

    const poDistributionWithVendorNames = await Promise.all(
      poDistributionByVendor.map(async (po) => {
        const vendor = await prisma.vendor.findUnique({
          where: { id: po.vendorId },
          select: { name: true },
        });
        return {
          vendorId: po.vendorId,
          vendorName: vendor?.name || "Unknown Vendor",
          poCount: po._count.id,
        };
      })
    );

    // Amount by Vendor Breakdown for Site Incharge
    const amountByVendor = await prisma.purchaseOrder.groupBy({
      by: ["vendorId"],
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
        totalAmount: { not: null },
      },
      _sum: {
        totalAmount: true,
      },
    });

    const amountByVendorWithNames = await Promise.all(
      amountByVendor.map(async (vendor) => {
        const vendorInfo = await prisma.vendor.findUnique({
          where: { id: vendor.vendorId },
          select: { name: true },
        });
        return {
          vendorId: vendor.vendorId,
          vendorName: vendorInfo?.name || "Unknown Vendor",
          totalAmount: Number(vendor._sum.totalAmount) || 0,
        };
      })
    );

    res.status(200).json({
      status: "success",
      data: {
        summary: {
          totalProjects,
          totalAmountSpent: totalAmountSpent._sum.totalAmount || 0,
          totalDemands,
          totalPOsCreated,
          assignedSections: accessibleSectionIds.length,
        },
        charts: {
          demandBreakdown: demandBreakdown.map((item) => ({
            status: item.status,
            count: item._count.id,
          })),
          poDistributionByVendor: poDistributionWithVendorNames,
          amountByVendor: amountByVendorWithNames,
        },
      },
    });
    return;
  }
);

// PROJECT_MANAGER Dashboard Analytics
export const getProjectManagerDashboard = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (user.role !== "PROJECT_MANAGER") {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Project Manager role required.",
      });
    }

    // Get accessible sections
    const accessibleSectionIds = await getUserAccessibleSections(
      user.id,
      user.role
    );

    // Similar analytics as Site Incharge but for PM's assigned sections
    const totalProjects = await prisma.project.count({
      where: {
        isDeleted: false,
        sections: {
          some: {
            id: { in: accessibleSectionIds },
          },
        },
      },
    });

    const totalAmountSpent = await prisma.purchaseOrder.aggregate({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
        totalAmount: { not: null },
      },
      _sum: {
        totalAmount: true,
      },
    });

    const totalDemands = await prisma.demand.count({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
    });

    const totalPOsCreated = await prisma.purchaseOrder.count({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
    });

    // Demand breakdown for assigned sections
    const demandBreakdown = await prisma.demand.groupBy({
      by: ["status"],
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
      _count: {
        id: true,
      },
    });

    // Amount by Vendor Breakdown for Project Manager
    const amountByVendor = await prisma.purchaseOrder.groupBy({
      by: ["vendorId"],
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
        totalAmount: { not: null },
      },
      _sum: {
        totalAmount: true,
      },
    });

    const amountByVendorWithNames = await Promise.all(
      amountByVendor.map(async (vendor) => {
        const vendorInfo = await prisma.vendor.findUnique({
          where: { id: vendor.vendorId },
          select: { name: true },
        });
        return {
          vendorId: vendor.vendorId,
          vendorName: vendorInfo?.name || "Unknown Vendor",
          totalAmount: Number(vendor._sum.totalAmount) || 0,
        };
      })
    );

    res.status(200).json({
      status: "success",
      data: {
        summary: {
          totalProjects,
          totalAmountSpent: totalAmountSpent._sum.totalAmount || 0,
          totalDemands,
          totalPOsCreated,
          assignedSections: accessibleSectionIds.length,
        },
        charts: {
          demandBreakdown: demandBreakdown.map((item) => ({
            status: item.status,
            count: item._count.id,
          })),
          amountByVendor: amountByVendorWithNames,
        },
      },
    });
    return;
  }
);

// CONSTRUCTION_MANAGER Dashboard Analytics
export const getConstructionManagerDashboard = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (user.role !== "CONSTRUCTION_MANAGER") {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Construction Manager role required.",
      });
    }

    // Get accessible sections
    const accessibleSectionIds = await getUserAccessibleSections(
      user.id,
      user.role
    );

    const totalDemands = await prisma.demand.count({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
    });

    const totalPOsCreated = await prisma.purchaseOrder.count({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
    });

    // Demand breakdown for assigned sections
    const demandBreakdown = await prisma.demand.groupBy({
      by: ["status"],
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
      _count: {
        id: true,
      },
    });

    res.status(200).json({
      status: "success",
      data: {
        summary: {
          totalDemands,
          totalPOsCreated,
          assignedSections: accessibleSectionIds.length,
        },
        charts: {
          demandBreakdown: demandBreakdown.map((item) => ({
            status: item.status,
            count: item._count.id,
          })),
        },
      },
    });
    return;
  }
);

// STORE_INCHARGE Dashboard Analytics
export const getStoreInchargeDashboard = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (user.role !== "STORE_INCHARGE") {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Store Incharge role required.",
      });
    }

    // Get accessible sections
    const accessibleSectionIds = await getUserAccessibleSections(
      user.id,
      user.role
    );

    const totalStores = await prisma.store.count({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
      },
    });

    const totalMaterials = await prisma.material.count({
      where: { isDeleted: false },
    });

    // Get inventory summary for assigned stores
    const inventorySummary = await prisma.storeInventory.aggregate({
      where: {
        store: {
          sectionId: { in: accessibleSectionIds },
        },
      },
      _sum: {
        stock: true,
        reserved: true,
      },
    });

    res.status(200).json({
      status: "success",
      data: {
        summary: {
          totalStores,
          totalMaterials,
          totalStock: inventorySummary._sum.stock || 0,
          totalReserved: inventorySummary._sum.reserved || 0,
          assignedSections: accessibleSectionIds.length,
        },
      },
    });
    return;
  }
);

// ACCOUNTANT Dashboard Analytics
export const getAccountantDashboard = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (user.role !== "ACCOUNTANT") {
      return res.status(403).json({
        status: "error",
        message: "Access denied. Accountant role required.",
      });
    }

    // Get accessible sections
    const accessibleSectionIds = await getUserAccessibleSections(
      user.id,
      user.role
    );

    const totalVendors = await prisma.vendor.count({
      where: { isDeleted: false },
    });

    const totalAmountSpent = await prisma.purchaseOrder.aggregate({
      where: {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
        totalAmount: { not: null },
      },
      _sum: {
        totalAmount: true,
      },
    });

    const totalAmountPending = await prisma.vendorAccount.aggregate({
      where: {
        balance: { gt: 0 },
      },
      _sum: {
        balance: true,
      },
    });

    const totalAmountPaid = await prisma.vendorAccount.aggregate({
      _sum: {
        totalDebited: true,
      },
    });

    // Vendor account summary
    const vendorAccounts = await prisma.vendorAccount.findMany({
      include: {
        vendor: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        balance: "desc",
      },
      take: 10,
    });

    res.status(200).json({
      status: "success",
      data: {
        summary: {
          totalVendors,
          totalAmountSpent: totalAmountSpent._sum.totalAmount || 0,
          totalAmountPending: totalAmountPending._sum.balance || 0,
          totalAmountPaid: totalAmountPaid._sum.totalDebited || 0,
          assignedSections: accessibleSectionIds.length,
        },
        topVendorAccounts: vendorAccounts.map((account) => ({
          vendorId: account.vendorId,
          vendorName: account.vendor.name,
          balance: account.balance,
          totalCredited: account.totalCredited,
          totalDebited: account.totalDebited,
        })),
      },
    });
    return;
  }
);

// Generic Dashboard Analytics (for any role)
export const getDashboardAnalytics = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    switch (user.role) {
      case "ADMIN":
        return getAdminDashboard(req, res, next);
      case "SITE_INCHARGE":
        return getSiteInchargeDashboard(req, res, next);
      case "PROJECT_MANAGER":
        return getProjectManagerDashboard(req, res, next);
      case "CONSTRUCTION_MANAGER":
        return getConstructionManagerDashboard(req, res, next);
      case "STORE_INCHARGE":
        return getStoreInchargeDashboard(req, res, next);
      case "ACCOUNTANT":
        return getAccountantDashboard(req, res, next);
      default:
        return res.status(403).json({
          status: "error",
          message: "Invalid user role",
        });
    }
  }
);

// Payments grouped by project and section for charting
export const getPaymentsByProjectAndSection = catchAsync(async (req, res) => {
  // Get accessible projects and sections for the user
  const user = req.user;
  const accessibleSectionIds = await getUserAccessibleSections(
    user.id,
    user.role
  );
  const accessibleProjectIds = await getUserAccessibleProjects(
    user.id,
    user.role
  );

  // Get all projects and their sections
  const projects = await prisma.project.findMany({
    where: { isDeleted: false, id: { in: accessibleProjectIds } },
    select: {
      id: true,
      name: true,
      code: true,
      sections: {
        where: { isDeleted: false, id: { in: accessibleSectionIds } },
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  // Get PO sums grouped by project and section
  const poSums = await prisma.purchaseOrder.groupBy({
    by: ["projectId", "sectionId"],
    where: {
      isDeleted: false,
      totalAmount: { not: null },
      projectId: { in: accessibleProjectIds },
      sectionId: { in: accessibleSectionIds },
    },
    _sum: {
      totalAmount: true,
    },
  });

  // Build chart data structure
  const chartData: any[] = [];
  for (const project of projects) {
    const projectEntry = {
      projectId: project.id,
      projectName: project.name,
      projectCode: project.code,
      sections: [] as any[],
      totalAmount: 0,
    };
    for (const section of project.sections) {
      const poSum = poSums.find(
        (p) => p.projectId === project.id && p.sectionId === section.id
      );
      const amount = poSum?._sum.totalAmount
        ? Number(poSum._sum.totalAmount)
        : 0;
      projectEntry.sections.push({
        sectionId: section.id,
        sectionName: section.name,
        sectionCode: section.code,
        amount,
      });
      projectEntry.totalAmount += amount;
    }
    chartData.push(projectEntry);
  }

  res.json({
    message: "Payments grouped by project and section",
    data: chartData,
  });
});
