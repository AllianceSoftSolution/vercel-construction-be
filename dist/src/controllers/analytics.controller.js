"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentsByProjectAndSection = exports.getDashboardAnalytics = exports.getAccountantDashboard = exports.getStoreInchargeDashboard = exports.getConstructionManagerDashboard = exports.getProjectManagerDashboard = exports.getSiteInchargeDashboard = exports.getAdminDashboard = void 0;
const catchAsync_1 = __importDefault(require("../utils/catchAsync"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const getUserAccessibleSections = async (userId, userRole) => {
    let sectionIds = [];
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { isHead: true },
    });
    switch (userRole) {
        case "ADMIN":
            const allSections = await prisma_1.default.section.findMany({
                where: { isDeleted: false },
                select: { id: true },
            });
            sectionIds = allSections.map((s) => s.id);
            break;
        case "SITE_INCHARGE":
            const siteInchargeAssignments = await prisma_1.default.siteInchargeAssignment.findMany({
                where: { userId, isActive: true },
                select: { sectionId: true },
            });
            sectionIds = siteInchargeAssignments.map((a) => a.sectionId);
            break;
        case "PROJECT_MANAGER":
            const projectManagerAssignments = await prisma_1.default.projectManagerAssignment.findMany({
                where: { userId, isActive: true },
                select: { sectionId: true },
            });
            sectionIds = projectManagerAssignments.map((a) => a.sectionId);
            break;
        case "CONSTRUCTION_MANAGER":
            const constructionManagerAssignments = await prisma_1.default.constructionManagerAssignment.findMany({
                where: { userId, isActive: true },
                select: { sectionId: true },
            });
            sectionIds = constructionManagerAssignments.map((a) => a.sectionId);
            break;
        case "STORE_INCHARGE":
            if (user?.isHead) {
                const allSections = await prisma_1.default.section.findMany({
                    where: { isDeleted: false },
                    select: { id: true },
                });
                sectionIds = allSections.map((s) => s.id);
            }
            else {
                const storeInchargeAssignments = await prisma_1.default.storeInchargeAssignment.findMany({
                    where: { userId, isActive: true },
                    select: { store: { select: { sectionId: true } } },
                });
                sectionIds = storeInchargeAssignments
                    .map((a) => a.store.sectionId)
                    .filter((id) => id !== null);
            }
            break;
        case "ACCOUNTANT":
            if (user?.isHead) {
                const headAccountantAssignments = await prisma_1.default.accountantAssignment.findMany({
                    where: { userId, isActive: true },
                    select: { projectId: true },
                });
                const headProjectIds = Array.from(new Set(headAccountantAssignments.map((a) => a.projectId)));
                const headProjectSections = await prisma_1.default.section.findMany({
                    where: { projectId: { in: headProjectIds }, isDeleted: false },
                    select: { id: true },
                });
                sectionIds = headProjectSections.map((s) => s.id);
            }
            else {
                const accountantAssignments = await prisma_1.default.accountantAssignment.findMany({
                    where: { userId, isActive: true },
                    select: { sectionId: true },
                });
                sectionIds = accountantAssignments.map((a) => a.sectionId).filter((id) => id !== null);
            }
            break;
    }
    return sectionIds;
};
const getUserAccessibleProjects = async (userId, userRole) => {
    let projectIds = [];
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { isHead: true },
    });
    switch (userRole) {
        case "ADMIN":
            const allProjects = await prisma_1.default.project.findMany({
                where: { isDeleted: false },
                select: { id: true },
            });
            projectIds = allProjects.map((p) => p.id);
            break;
        case "SITE_INCHARGE":
            const siteInchargeAssignments = await prisma_1.default.siteInchargeAssignment.findMany({
                where: { userId, isActive: true },
                select: { projectId: true },
            });
            projectIds = siteInchargeAssignments.map((a) => a.projectId);
            break;
        case "PROJECT_MANAGER":
            const projectManagerAssignments = await prisma_1.default.projectManagerAssignment.findMany({
                where: { userId, isActive: true },
                select: { projectId: true },
            });
            projectIds = projectManagerAssignments.map((a) => a.projectId);
            break;
        case "CONSTRUCTION_MANAGER":
            const constructionManagerAssignments = await prisma_1.default.constructionManagerAssignment.findMany({
                where: { userId, isActive: true },
                select: { section: { select: { projectId: true } } },
            });
            projectIds = constructionManagerAssignments.map((a) => a.section.projectId);
            break;
        case "STORE_INCHARGE":
            if (user?.isHead) {
                const allProjects = await prisma_1.default.project.findMany({
                    where: { isDeleted: false },
                    select: { id: true },
                });
                projectIds = allProjects.map((p) => p.id);
            }
            else {
                const storeInchargeAssignments = await prisma_1.default.storeInchargeAssignment.findMany({
                    where: { userId, isActive: true },
                    select: {
                        store: { select: { section: { select: { projectId: true } } } },
                    },
                });
                projectIds = storeInchargeAssignments
                    .filter((a) => a.store.section != null)
                    .map((a) => a.store.section.projectId);
            }
            break;
        case "ACCOUNTANT": {
            const accountantProjectAssignments = await prisma_1.default.accountantAssignment.findMany({
                where: { userId, isActive: true },
                select: { projectId: true },
            });
            const uniqueProjectIds = new Set(accountantProjectAssignments.map((a) => a.projectId));
            projectIds = Array.from(uniqueProjectIds);
            break;
        }
    }
    return projectIds;
};
exports.getAdminDashboard = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (user.role !== "ADMIN") {
        return res.status(403).json({
            status: "error",
            message: "Access denied. Admin role required.",
        });
    }
    const accessibleSectionIds = await getUserAccessibleSections(user.id, user.role);
    const accessibleProjectIds = await getUserAccessibleProjects(user.id, user.role);
    const totalProjects = await prisma_1.default.project.count({
        where: {
            isDeleted: false,
            id: { in: accessibleProjectIds },
        },
    });
    const totalAmountSpent = await prisma_1.default.purchaseOrder.aggregate({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
            totalAmount: { not: null },
        },
        _sum: {
            totalAmount: true,
        },
    });
    const totalAmountPending = await prisma_1.default.vendorAccount.aggregate({
        where: {
            balance: { gt: 0 },
        },
        _sum: {
            balance: true,
        },
    });
    const totalAmountPaid = await prisma_1.default.vendorAccount.aggregate({
        _sum: {
            totalDebited: true,
        },
    });
    const totalVendors = await prisma_1.default.vendor.count({
        where: { isDeleted: false },
    });
    const totalDemands = await prisma_1.default.demand.count({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
    });
    const totalPOsCreated = await prisma_1.default.purchaseOrder.count({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
    });
    const demandBreakdown = await prisma_1.default.demand.groupBy({
        by: ["status"],
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
        _count: {
            id: true,
        },
    });
    const poDistributionByVendor = await prisma_1.default.purchaseOrder.groupBy({
        by: ["vendorId"],
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
        _count: {
            id: true,
        },
    });
    const poDistributionWithVendorNames = await Promise.all(poDistributionByVendor.map(async (po) => {
        const vendor = await prisma_1.default.vendor.findUnique({
            where: { id: po.vendorId },
            select: { name: true },
        });
        return {
            vendorId: po.vendorId,
            vendorName: vendor?.name || "Unknown Vendor",
            poCount: po._count.id,
        };
    }));
    const financialProgressPerProject = await Promise.all(accessibleProjectIds.map(async (projectId) => {
        const project = await prisma_1.default.project.findUnique({
            where: { id: projectId },
            select: { name: true, code: true },
        });
        const projectPOs = await prisma_1.default.purchaseOrder.aggregate({
            where: {
                projectId,
                isDeleted: false,
                totalAmount: { not: null },
            },
            _sum: {
                totalAmount: true,
            },
        });
        const paidAmount = 0;
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
    }));
    const usersByRole = await prisma_1.default.user.groupBy({
        by: ["role"],
        where: { isDeleted: false },
        _count: {
            id: true,
        },
    });
    const amountByVendor = await prisma_1.default.purchaseOrder.groupBy({
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
    const amountByVendorWithNames = await Promise.all(amountByVendor.map(async (vendor) => {
        const vendorInfo = await prisma_1.default.vendor.findUnique({
            where: { id: vendor.vendorId },
            select: { name: true },
        });
        return {
            vendorId: vendor.vendorId,
            vendorName: vendorInfo?.name || "Unknown Vendor",
            totalAmount: Number(vendor._sum.totalAmount) || 0,
        };
    }));
    res.status(200).json({
        status: "success",
        data: {
            summary: {
                totalProjects,
                totalAmountSpent: totalAmountSpent._sum.totalAmount || 0,
                totalAmountPending: totalAmountPending._sum.balance || 0,
                totalAmountPaid: totalAmountPaid._sum.totalDebited || 0,
                totalVendors,
                totalDemands,
                totalPOsCreated,
            },
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
});
exports.getSiteInchargeDashboard = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (user.role !== "SITE_INCHARGE") {
        return res.status(403).json({
            status: "error",
            message: "Access denied. Site Incharge role required.",
        });
    }
    const accessibleSectionIds = await getUserAccessibleSections(user.id, user.role);
    const totalProjects = await prisma_1.default.project.count({
        where: {
            isDeleted: false,
            sections: {
                some: {
                    id: { in: accessibleSectionIds },
                },
            },
        },
    });
    const totalAmountSpent = await prisma_1.default.purchaseOrder.aggregate({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
            totalAmount: { not: null },
        },
        _sum: {
            totalAmount: true,
        },
    });
    const sectionDemandWhere = {
        isDeleted: false,
        sectionId: { in: accessibleSectionIds },
    };
    const totalDemands = await prisma_1.default.demand.count({
        where: sectionDemandWhere,
    });
    const totalPOsCreated = await prisma_1.default.purchaseOrder.count({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
    });
    const demandBreakdown = await prisma_1.default.demand.groupBy({
        by: ["status"],
        where: sectionDemandWhere,
        _count: {
            id: true,
        },
    });
    const poDistributionByVendor = await prisma_1.default.purchaseOrder.groupBy({
        by: ["vendorId"],
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
        _count: {
            id: true,
        },
    });
    const poDistributionWithVendorNames = await Promise.all(poDistributionByVendor.map(async (po) => {
        const vendor = await prisma_1.default.vendor.findUnique({
            where: { id: po.vendorId },
            select: { name: true },
        });
        return {
            vendorId: po.vendorId,
            vendorName: vendor?.name || "Unknown Vendor",
            poCount: po._count.id,
        };
    }));
    const amountByVendor = await prisma_1.default.purchaseOrder.groupBy({
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
    const amountByVendorWithNames = await Promise.all(amountByVendor.map(async (vendor) => {
        const vendorInfo = await prisma_1.default.vendor.findUnique({
            where: { id: vendor.vendorId },
            select: { name: true },
        });
        return {
            vendorId: vendor.vendorId,
            vendorName: vendorInfo?.name || "Unknown Vendor",
            totalAmount: Number(vendor._sum.totalAmount) || 0,
        };
    }));
    const totalStores = await prisma_1.default.store.count({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
    });
    const inventorySummary = await prisma_1.default.storeInventory.aggregate({
        where: {
            store: {
                sectionId: { in: accessibleSectionIds },
                isDeleted: false,
            },
        },
        _sum: {
            stock: true,
            reserved: true,
            available: true,
        },
    });
    const totalMaterials = await prisma_1.default.storeInventory.groupBy({
        by: ["materialId"],
        where: {
            store: {
                sectionId: { in: accessibleSectionIds },
                isDeleted: false,
            },
            stock: { gt: 0 },
        },
    });
    res.status(200).json({
        status: "success",
        data: {
            summary: {
                totalProjects,
                totalAmountSpent: totalAmountSpent._sum.totalAmount || 0,
                totalDemands,
                totalPOsCreated,
                assignedSections: accessibleSectionIds.length,
                totalStores,
                totalStock: inventorySummary._sum.stock || 0,
                totalReserved: inventorySummary._sum.reserved || 0,
                totalAvailable: inventorySummary._sum.available || 0,
                totalMaterialsInStock: totalMaterials.length,
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
});
exports.getProjectManagerDashboard = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (user.role !== "PROJECT_MANAGER") {
        return res.status(403).json({
            status: "error",
            message: "Access denied. Project Manager role required.",
        });
    }
    const accessibleSectionIds = await getUserAccessibleSections(user.id, user.role);
    const totalProjects = await prisma_1.default.project.count({
        where: {
            isDeleted: false,
            sections: {
                some: {
                    id: { in: accessibleSectionIds },
                },
            },
        },
    });
    const totalAmountSpent = await prisma_1.default.purchaseOrder.aggregate({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
            totalAmount: { not: null },
        },
        _sum: {
            totalAmount: true,
        },
    });
    const totalDemands = await prisma_1.default.demand.count({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
    });
    const totalPOsCreated = await prisma_1.default.purchaseOrder.count({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
    });
    const demandBreakdown = await prisma_1.default.demand.groupBy({
        by: ["status"],
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
        _count: {
            id: true,
        },
    });
    const amountByVendor = await prisma_1.default.purchaseOrder.groupBy({
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
    const amountByVendorWithNames = await Promise.all(amountByVendor.map(async (vendor) => {
        const vendorInfo = await prisma_1.default.vendor.findUnique({
            where: { id: vendor.vendorId },
            select: { name: true },
        });
        return {
            vendorId: vendor.vendorId,
            vendorName: vendorInfo?.name || "Unknown Vendor",
            totalAmount: Number(vendor._sum.totalAmount) || 0,
        };
    }));
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
});
exports.getConstructionManagerDashboard = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (user.role !== "CONSTRUCTION_MANAGER") {
        return res.status(403).json({
            status: "error",
            message: "Access denied. Construction Manager role required.",
        });
    }
    const accessibleSectionIds = await getUserAccessibleSections(user.id, user.role);
    const totalDemands = await prisma_1.default.demand.count({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
    });
    const totalPOsCreated = await prisma_1.default.purchaseOrder.count({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
    });
    const demandBreakdown = await prisma_1.default.demand.groupBy({
        by: ["status"],
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
        _count: {
            id: true,
        },
    });
    const accessibleSections = await prisma_1.default.section.findMany({
        where: { id: { in: accessibleSectionIds }, isDeleted: false },
        select: { id: true, name: true },
    });
    const fulfillmentProgress = await Promise.all(accessibleSections.map(async (section) => {
        const total = await prisma_1.default.demand.count({
            where: { sectionId: section.id, isDeleted: false },
        });
        const fulfilled = await prisma_1.default.demand.count({
            where: {
                sectionId: section.id,
                isDeleted: false,
                status: { in: ["PO_CREATED", "FULFILLED_FROM_STORE", "COMPLETED", "PARTIALLY_PO_CREATED", "ORDER_PLACED", "IN_STORE"] },
            },
        });
        return {
            sectionName: section.name || "Unknown",
            progress: total > 0 ? Math.round((fulfilled / total) * 100) : 0,
        };
    }));
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
                fulfillmentProgress,
            },
        },
    });
    return;
});
exports.getStoreInchargeDashboard = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (user.role !== "STORE_INCHARGE") {
        return res.status(403).json({
            status: "error",
            message: "Access denied. Store Incharge role required.",
        });
    }
    const accessibleSectionIds = await getUserAccessibleSections(user.id, user.role);
    const totalStores = await prisma_1.default.store.count({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
    });
    const totalMaterials = await prisma_1.default.material.count({
        where: { isDeleted: false },
    });
    const inventorySummary = await prisma_1.default.storeInventory.aggregate({
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
});
exports.getAccountantDashboard = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    if (user.role !== "ACCOUNTANT") {
        return res.status(403).json({
            status: "error",
            message: "Access denied. Accountant role required.",
        });
    }
    const accessibleSectionIds = await getUserAccessibleSections(user.id, user.role);
    const totalVendors = await prisma_1.default.vendor.count({
        where: { isDeleted: false },
    });
    const totalAmountSpent = await prisma_1.default.purchaseOrder.aggregate({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
            totalAmount: { not: null },
        },
        _sum: {
            totalAmount: true,
        },
    });
    const accessiblePurchaseOrderIds = await prisma_1.default.purchaseOrder.findMany({
        where: {
            isDeleted: false,
            sectionId: { in: accessibleSectionIds },
        },
        select: { id: true },
    });
    const poIds = accessiblePurchaseOrderIds.map(po => po.id);
    const totalAmountPending = await prisma_1.default.vendorAccount.aggregate({
        where: {
            balance: { gt: 0 },
            transactions: {
                some: {
                    purchaseOrderId: { in: poIds },
                },
            },
        },
        _sum: {
            balance: true,
        },
    });
    const totalAmountPaid = await prisma_1.default.vendorAccount.aggregate({
        where: {
            transactions: {
                some: {
                    purchaseOrderId: { in: poIds },
                },
            },
        },
        _sum: {
            totalDebited: true,
        },
    });
    const demandBreakdown = await prisma_1.default.demand.groupBy({
        by: ["status"],
        where: {
            sectionId: { in: accessibleSectionIds },
            isDeleted: false,
        },
        _count: { status: true },
    });
    const vendorAccounts = await prisma_1.default.vendorAccount.findMany({
        where: {
            transactions: {
                some: {
                    purchaseOrderId: { in: poIds },
                },
            },
        },
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
            charts: {
                demandBreakdown: demandBreakdown.map((item) => ({
                    status: item.status,
                    count: item._count.status,
                })),
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
});
exports.getDashboardAnalytics = (0, catchAsync_1.default)(async (req, res, next) => {
    const user = req.user;
    switch (user.role) {
        case "ADMIN":
            return (0, exports.getAdminDashboard)(req, res, next);
        case "SITE_INCHARGE":
            return (0, exports.getSiteInchargeDashboard)(req, res, next);
        case "PROJECT_MANAGER":
            return (0, exports.getProjectManagerDashboard)(req, res, next);
        case "CONSTRUCTION_MANAGER":
            return (0, exports.getConstructionManagerDashboard)(req, res, next);
        case "STORE_INCHARGE":
            return (0, exports.getStoreInchargeDashboard)(req, res, next);
        case "ACCOUNTANT":
            return (0, exports.getAccountantDashboard)(req, res, next);
        default:
            return res.status(403).json({
                status: "error",
                message: "Invalid user role",
            });
    }
});
exports.getPaymentsByProjectAndSection = (0, catchAsync_1.default)(async (req, res) => {
    const user = req.user;
    const accessibleSectionIds = await getUserAccessibleSections(user.id, user.role);
    const accessibleProjectIds = await getUserAccessibleProjects(user.id, user.role);
    const projects = await prisma_1.default.project.findMany({
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
    const poSums = await prisma_1.default.purchaseOrder.groupBy({
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
    const chartData = [];
    for (const project of projects) {
        const projectEntry = {
            projectId: project.id,
            projectName: project.name,
            projectCode: project.code,
            sections: [],
            totalAmount: 0,
        };
        for (const section of project.sections) {
            const poSum = poSums.find((p) => p.projectId === project.id && p.sectionId === section.id);
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
//# sourceMappingURL=analytics.controller.js.map