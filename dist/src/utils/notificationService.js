"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const notification_1 = require("./notification");
const prisma_1 = __importDefault(require("./prisma"));
class NotificationService {
    static async getTopLevelSectionUsers(sectionId) {
        const section = await prisma_1.default.section.findUnique({
            where: { id: sectionId },
            include: {
                project: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });
        if (!section)
            return { section: null, users: [] };
        const users = await prisma_1.default.user.findMany({
            where: {
                OR: [
                    {
                        projectManagerAssignments: {
                            some: {
                                sectionId,
                                isActive: true,
                            },
                        },
                    },
                    {
                        siteInchargeAssignments: {
                            some: {
                                sectionId,
                                isActive: true,
                            },
                        },
                    },
                ],
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
            },
        });
        return { section, users };
    }
    static async getSectionNotificationUsers(sectionId) {
        const section = await prisma_1.default.section.findUnique({
            where: { id: sectionId },
            include: {
                project: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });
        if (!section)
            return { section: null, users: [] };
        const users = await prisma_1.default.user.findMany({
            where: {
                OR: [
                    {
                        projectManagerAssignments: {
                            some: {
                                sectionId,
                                isActive: true,
                            },
                        },
                    },
                    {
                        siteInchargeAssignments: {
                            some: {
                                sectionId,
                                isActive: true,
                            },
                        },
                    },
                    {
                        constructionManagerAssignments: {
                            some: {
                                sectionId,
                                isActive: true,
                            },
                        },
                    },
                    {
                        storeInchargeAssignments: {
                            some: {
                                store: {
                                    sectionId,
                                },
                                isActive: true,
                            },
                        },
                    },
                ],
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
            },
        });
        return { section, users };
    }
    static async getAdminUsers() {
        return await prisma_1.default.user.findMany({
            where: {
                role: "ADMIN",
                isActive: true,
                isDeleted: false,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
            },
        });
    }
    static async getHeadAccountantUsers() {
        return await prisma_1.default.user.findMany({
            where: {
                role: "ACCOUNTANT",
                isHead: true,
                isActive: true,
                isDeleted: false,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isHead: true,
            },
        });
    }
    static async getAccountantUsers() {
        return await prisma_1.default.user.findMany({
            where: {
                role: "ACCOUNTANT",
                isActive: true,
                isDeleted: false,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isHead: true,
            },
        });
    }
    static async sendNotificationsToUsers(userIds, title, body, data = {}) {
        const notifications = userIds.map((userId) => (0, notification_1.sendNotificationToUserSafe)({
            userId,
            title,
            body,
            data,
        }));
        await Promise.all(notifications);
    }
    static async notifyDemandCreated(demandId) {
        const demand = await prisma_1.default.demand.findUnique({
            where: { id: demandId },
            include: {
                section: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                            },
                        },
                    },
                },
                creator: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
            },
        });
        if (!demand)
            return;
        const { section, users } = await this.getTopLevelSectionUsers(demand.sectionId);
        const adminUsers = await this.getAdminUsers();
        const usersToNotify = [
            ...users.filter((user) => ["PROJECT_MANAGER", "SITE_INCHARGE"].includes(user.role)),
            ...adminUsers,
        ];
        const title = "New Demand Created";
        const body = `Demand ${demand.referenceNumber} created for section ${section?.name} in project ${section?.project.name} by ${demand.creator.name}`;
        await this.sendNotificationsToUsers(usersToNotify.map((u) => u.id), title, body, {
            demandId: demand.id,
            sectionId: demand.sectionId,
            projectId: section?.project.id || "",
            type: "DEMAND_CREATED",
        });
    }
    static async notifyDemandApproval(demandId, approverId, status) {
        const demand = await prisma_1.default.demand.findUnique({
            where: { id: demandId },
            include: {
                section: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                            },
                        },
                    },
                },
                creator: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
                approvals: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                role: true,
                            },
                        },
                    },
                },
            },
        });
        if (!demand)
            return;
        const approver = demand.approvals.find((a) => a.userId === approverId)?.user;
        const { section, users } = await this.getTopLevelSectionUsers(demand.sectionId);
        const usersToNotify = [
            demand.creator.id,
            ...users.map((u) => u.id),
        ];
        const title = `Demand ${status}`;
        const body = `Demand ${demand.referenceNumber} for section ${section?.name} was ${status.toLowerCase()} by ${approver?.name}`;
        await this.sendNotificationsToUsers(usersToNotify, title, body, {
            demandId: demand.id,
            sectionId: demand.sectionId,
            projectId: section?.project.id || "",
            type: "DEMAND_APPROVAL",
            status,
        });
    }
    static async notifyPOCreated(poId) {
        const po = await prisma_1.default.purchaseOrder.findUnique({
            where: { id: poId },
            include: {
                demand: {
                    include: {
                        section: {
                            include: {
                                project: {
                                    select: {
                                        id: true,
                                        name: true,
                                        code: true,
                                    },
                                },
                            },
                        },
                        creator: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                role: true,
                            },
                        },
                    },
                },
                vendor: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });
        if (!po)
            return;
        const { section, users } = await this.getTopLevelSectionUsers(po.demand.sectionId);
        const adminUsers = await this.getAdminUsers();
        const usersToNotify = [
            po.demand.creator.id,
            ...users.map((u) => u.id),
            ...adminUsers.map((u) => u.id),
        ];
        const title = "Purchase Order Created";
        const body = `PO ${po.referenceNumber} created for demand ${po.demand.referenceNumber} from vendor ${po.vendor.name}`;
        await this.sendNotificationsToUsers(usersToNotify, title, body, {
            poId: po.id,
            demandId: po.demandId,
            sectionId: po.demand.sectionId,
            projectId: section?.project.id || "",
            type: "PO_CREATED",
        });
    }
    static async notifyStoreTransaction(transactionId) {
        const transaction = await prisma_1.default.storeTransaction.findUnique({
            where: { id: transactionId },
            include: {
                store: {
                    include: {
                        section: {
                            include: {
                                project: {
                                    select: {
                                        id: true,
                                        name: true,
                                        code: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!transaction)
            return;
        const material = await prisma_1.default.material.findUnique({
            where: { id: transaction.materialId },
            select: {
                id: true,
                name: true,
            },
        });
        if (!material)
            return;
        const { section, users } = await this.getTopLevelSectionUsers(transaction.store.sectionId);
        const adminUsers = await this.getAdminUsers();
        const usersToNotify = [
            ...users.map((u) => u.id),
            ...adminUsers.map((u) => u.id),
        ];
        const title = "Store Transaction";
        const body = `${transaction.type} transaction for ${transaction.quantity} ${material.name} in ${transaction.store.name}`;
        await this.sendNotificationsToUsers(usersToNotify, title, body, {
            transactionId: transaction.id,
            storeId: transaction.storeId,
            sectionId: transaction.store.sectionId,
            projectId: section?.project.id || "",
            type: "STORE_TRANSACTION",
            transactionType: transaction.type,
        });
    }
    static async notifyUserAssignment(assignmentData) {
        const { userId, sectionId, role, assignedBy } = assignmentData;
        const [user, section, assigner] = await Promise.all([
            prisma_1.default.user.findUnique({
                where: { id: userId },
                select: { id: true, name: true, email: true, role: true },
            }),
            prisma_1.default.section.findUnique({
                where: { id: sectionId },
                include: {
                    project: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                        },
                    },
                },
            }),
            prisma_1.default.user.findUnique({
                where: { id: assignedBy },
                select: { id: true, name: true, email: true, role: true },
            }),
        ]);
        if (!user || !section || !assigner)
            return;
        const { users } = await this.getTopLevelSectionUsers(sectionId);
        const adminUsers = await this.getAdminUsers();
        const usersToNotify = [
            ...users.map((u) => u.id),
            ...adminUsers.map((u) => u.id),
        ];
        const title = "User Assignment";
        const body = `${user.name} (${role}) assigned to section ${section.name} by ${assigner.name}`;
        await this.sendNotificationsToUsers(usersToNotify, title, body, {
            userId: user.id,
            sectionId: section.id,
            projectId: section.project.id,
            assignedBy: assigner.id,
            type: "USER_ASSIGNMENT",
            role,
        });
    }
    static async notifyAccountantEvent(eventData) {
        const headAccountantUsers = await this.getHeadAccountantUsers();
        const adminUsers = await this.getAdminUsers();
        const usersToNotify = [
            ...headAccountantUsers.map((u) => u.id),
            ...adminUsers.map((u) => u.id),
        ];
        const title = "Accountant Event";
        const body = eventData.description;
        await this.sendNotificationsToUsers(usersToNotify, title, body, {
            ...eventData.data,
            type: "ACCOUNTANT_EVENT",
            eventType: eventData.type,
        });
    }
    static async notifyVendorPayment(paymentId) {
        const payment = await prisma_1.default.vendorPayment.findUnique({
            where: { id: paymentId },
            include: {
                vendor: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });
        if (!payment)
            return;
        const headAccountantUsers = await this.getHeadAccountantUsers();
        const adminUsers = await this.getAdminUsers();
        const usersToNotify = [
            ...headAccountantUsers.map((u) => u.id),
            ...adminUsers.map((u) => u.id),
        ];
        const title = "Vendor Payment";
        const body = `Payment of ${payment.amount} made to vendor ${payment.vendor.name}`;
        await this.sendNotificationsToUsers(usersToNotify, title, body, {
            paymentId: payment.id,
            vendorId: payment.vendorId,
            amount: payment.amount.toString(),
            type: "VENDOR_PAYMENT",
        });
    }
    static async notifyMaterialCap(materialCapId) {
        const materialCap = await prisma_1.default.materialCap.findUnique({
            where: { id: materialCapId },
            include: {
                material: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                section: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                            },
                        },
                    },
                },
            },
        });
        if (!materialCap)
            return;
        const { section, users } = await this.getTopLevelSectionUsers(materialCap.sectionId);
        const adminUsers = await this.getAdminUsers();
        const usersToNotify = [
            ...users.map((u) => u.id),
            ...adminUsers.map((u) => u.id),
        ];
        const title = "Material Cap Updated";
        const body = `Material cap for ${materialCap.material.name} in section ${section?.name} updated to ${materialCap.quantity}`;
        await this.sendNotificationsToUsers(usersToNotify, title, body, {
            materialCapId: materialCap.id,
            materialId: materialCap.materialId,
            sectionId: materialCap.sectionId,
            projectId: section?.project.id || "",
            type: "MATERIAL_CAP",
        });
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notificationService.js.map