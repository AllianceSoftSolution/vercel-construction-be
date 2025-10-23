export declare class NotificationService {
    static getTopLevelSectionUsers(sectionId: string): Promise<{
        section: null;
        users: never[];
    } | {
        section: {
            project: {
                id: string;
                name: string;
                code: string;
            };
        } & {
            id: string;
            name: string;
            code: string;
            description: string | null;
            isActive: boolean;
            isDeleted: boolean;
            createdAt: Date;
            updatedAt: Date;
            createdBy: string;
            updatedBy: string | null;
            projectId: string;
        };
        users: {
            id: string;
            name: string;
            email: string;
            role: import(".prisma/client").$Enums.UserRole;
        }[];
    }>;
    static getSectionNotificationUsers(sectionId: string): Promise<{
        section: null;
        users: never[];
    } | {
        section: {
            project: {
                id: string;
                name: string;
                code: string;
            };
        } & {
            id: string;
            name: string;
            code: string;
            description: string | null;
            isActive: boolean;
            isDeleted: boolean;
            createdAt: Date;
            updatedAt: Date;
            createdBy: string;
            updatedBy: string | null;
            projectId: string;
        };
        users: {
            id: string;
            name: string;
            email: string;
            role: import(".prisma/client").$Enums.UserRole;
        }[];
    }>;
    static getAdminUsers(): Promise<{
        id: string;
        name: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
    }[]>;
    static getHeadAccountantUsers(): Promise<{
        id: string;
        name: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        isHead: boolean;
    }[]>;
    static getAccountantUsers(): Promise<{
        id: string;
        name: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        isHead: boolean;
    }[]>;
    static sendNotificationsToUsers(userIds: string[], title: string, body: string, data?: Record<string, string>): Promise<void>;
    static notifyDemandCreated(demandId: string): Promise<void>;
    static notifyDemandApproval(demandId: string, approverId: string, status: "APPROVED" | "REJECTED"): Promise<void>;
    static notifyPOCreated(poId: string): Promise<void>;
    static notifyStoreTransaction(transactionId: string): Promise<void>;
    static notifyUserAssignment(assignmentData: {
        userId: string;
        sectionId: string;
        role: string;
        assignedBy: string;
    }): Promise<void>;
    static notifyAccountantEvent(eventData: {
        type: string;
        description: string;
        data: Record<string, string>;
    }): Promise<void>;
    static notifyVendorPayment(paymentId: string): Promise<void>;
    static notifyMaterialCap(materialCapId: string): Promise<void>;
}
