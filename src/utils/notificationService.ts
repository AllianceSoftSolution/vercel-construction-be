import { sendNotificationToUserSafe } from "./notification";
import prisma from "./prisma";

// Notification service for hierarchy-based notifications
export class NotificationService {
  // Get top-level users for a section (Project Manager and Site Incharge only)
  static async getTopLevelSectionUsers(sectionId: string) {
    const section = await prisma.section.findUnique({
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

    if (!section) return { section: null, users: [] };

    // Get only top-level users associated with this section
    const users = await prisma.user.findMany({
      where: {
        OR: [
          // Project Manager assignments
          {
            projectManagerAssignments: {
              some: {
                sectionId,
                isActive: true,
              },
            },
          },
          // Site Incharge assignments
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

  // Get all users associated with a section (for backward compatibility)
  static async getSectionNotificationUsers(sectionId: string) {
    const section = await prisma.section.findUnique({
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

    if (!section) return { section: null, users: [] };

    // Get all users associated with this section
    const users = await prisma.user.findMany({
      where: {
        OR: [
          // Project Manager assignments
          {
            projectManagerAssignments: {
              some: {
                sectionId,
                isActive: true,
              },
            },
          },
          // Site Incharge assignments
          {
            siteInchargeAssignments: {
              some: {
                sectionId,
                isActive: true,
              },
            },
          },
          // Construction Manager assignments
          {
            constructionManagerAssignments: {
              some: {
                sectionId,
                isActive: true,
              },
            },
          },
          // Store Incharge assignments (for stores in this section)
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

  // Get admin users
  static async getAdminUsers() {
    return await prisma.user.findMany({
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

  // Get head accountant users only
  static async getHeadAccountantUsers() {
    return await prisma.user.findMany({
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

  // Get all accountant users (including head accountant) - for backward compatibility
  static async getAccountantUsers() {
    return await prisma.user.findMany({
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

  // Send notifications to multiple users
  static async sendNotificationsToUsers(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, string> = {}
  ) {
    const notifications = userIds.map((userId) =>
      sendNotificationToUserSafe({
        userId,
        title,
        body,
        data,
      })
    );

    await Promise.all(notifications);
  }

  // Demand created notification
  static async notifyDemandCreated(demandId: string) {
    const demand = await prisma.demand.findUnique({
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

    if (!demand) return;

    const { section, users } = await this.getTopLevelSectionUsers(
      demand.sectionId
    );
    const adminUsers = await this.getAdminUsers();

    // Notify Project Manager, Site Incharge, and Admin
    const usersToNotify = [
      ...users.filter((user) =>
        ["PROJECT_MANAGER", "SITE_INCHARGE"].includes(user.role)
      ),
      ...adminUsers,
    ];

    const title = "New Demand Created";
    const body = `Demand ${demand.referenceNumber} created for section ${section?.name} in project ${section?.project.name} by ${demand.creator.name}`;

    await this.sendNotificationsToUsers(
      usersToNotify.map((u) => u.id),
      title,
      body,
      {
        demandId: demand.id,
        sectionId: demand.sectionId,
        projectId: section?.project.id || "",
        type: "DEMAND_CREATED",
      }
    );
  }

  // Demand approved/rejected notification
  static async notifyDemandApproval(
    demandId: string,
    approverId: string,
    status: "APPROVED" | "REJECTED"
  ) {
    const demand = await prisma.demand.findUnique({
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

    if (!demand) return;

    const approver = demand.approvals.find(
      (a) => a.userId === approverId
    )?.user;
    const { section, users } = await this.getTopLevelSectionUsers(
      demand.sectionId
    );

    // Notify CM and top-level section users
    const usersToNotify = [
      demand.creator.id, // CM who created the demand
      ...users.map((u) => u.id), // Top-level section users only
    ];

    const title = `Demand ${status}`;
    const body = `Demand ${demand.referenceNumber} for section ${
      section?.name
    } was ${status.toLowerCase()} by ${approver?.name}`;

    await this.sendNotificationsToUsers(usersToNotify, title, body, {
      demandId: demand.id,
      sectionId: demand.sectionId,
      projectId: section?.project.id || "",
      type: "DEMAND_APPROVAL",
      status,
    });
  }

  // Purchase Order created notification
  static async notifyPOCreated(poId: string) {
    const po = await prisma.purchaseOrder.findUnique({
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

    if (!po) return;

    const { section, users } = await this.getTopLevelSectionUsers(
      po.demand.sectionId
    );
    const adminUsers = await this.getAdminUsers();

    // Notify top-level section users and admin
    const usersToNotify = [
      po.demand.creator.id, // CM who created the demand
      ...users.map((u) => u.id), // Top-level section users only
      ...adminUsers.map((u) => u.id), // Admin users
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

  // Store transaction notification
  static async notifyStoreTransaction(transactionId: string) {
    const transaction = await prisma.storeTransaction.findUnique({
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

    if (!transaction) return;

    // Get material details separately
    const material = await prisma.material.findUnique({
      where: { id: transaction.materialId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!material) return;

    const { section, users } = await this.getTopLevelSectionUsers(
      transaction.store.sectionId ?? ""
    );
    const adminUsers = await this.getAdminUsers();

    // Notify top-level section users and admin
    const usersToNotify = [
      ...users.map((u) => u.id), // Top-level section users only
      ...adminUsers.map((u) => u.id), // Admin users
    ];

    const title = "Store Transaction";
    const body = `${transaction.type} transaction for ${transaction.quantity} ${material.name} in ${transaction.store.name}`;

    await this.sendNotificationsToUsers(usersToNotify, title, body, {
      transactionId: transaction.id,
      storeId: transaction.storeId,
      sectionId: transaction.store.sectionId ?? "",
      projectId: section?.project.id || "",
      type: "STORE_TRANSACTION",
      transactionType: transaction.type,
    });
  }

  // User assignment notification - only notify top-level users
  static async notifyUserAssignment(assignmentData: {
    userId: string;
    sectionId: string;
    role: string;
    assignedBy: string;
  }) {
    const { userId, sectionId, role, assignedBy } = assignmentData;

    const [user, section, assigner] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true },
      }),
      prisma.section.findUnique({
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
      prisma.user.findUnique({
        where: { id: assignedBy },
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);

    if (!user || !section || !assigner) return;

    const { users } = await this.getTopLevelSectionUsers(sectionId);
    const adminUsers = await this.getAdminUsers();

    // Notify only top-level section users and admin
    const usersToNotify = [
      ...users.map((u) => u.id), // Top-level section users only
      ...adminUsers.map((u) => u.id), // Admin users
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

  // Accountant-related notification - only notify head accountants and admin
  static async notifyAccountantEvent(eventData: {
    type: string;
    description: string;
    data: Record<string, string>;
  }) {
    const headAccountantUsers = await this.getHeadAccountantUsers();
    const adminUsers = await this.getAdminUsers();

    const usersToNotify = [
      ...headAccountantUsers.map((u) => u.id), // Head accountants only
      ...adminUsers.map((u) => u.id), // Admin users
    ];

    const title = "Accountant Event";
    const body = eventData.description;

    await this.sendNotificationsToUsers(usersToNotify, title, body, {
      ...eventData.data,
      type: "ACCOUNTANT_EVENT",
      eventType: eventData.type,
    });
  }

  // Vendor payment notification - only notify head accountants and admin
  static async notifyVendorPayment(paymentId: string) {
    const payment = await prisma.vendorPayment.findUnique({
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

    if (!payment) return;

    const headAccountantUsers = await this.getHeadAccountantUsers();
    const adminUsers = await this.getAdminUsers();

    const usersToNotify = [
      ...headAccountantUsers.map((u) => u.id), // Head accountants only
      ...adminUsers.map((u) => u.id), // Admin users
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

  // Material cap notification
  static async notifyMaterialCap(materialCapId: string) {
    const materialCap = await prisma.materialCap.findUnique({
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

    if (!materialCap) return;

    const { section, users } = await this.getTopLevelSectionUsers(
      materialCap.sectionId
    );
    const adminUsers = await this.getAdminUsers();

    const usersToNotify = [
      ...users.map((u) => u.id), // Top-level section users only
      ...adminUsers.map((u) => u.id), // Admin users
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
