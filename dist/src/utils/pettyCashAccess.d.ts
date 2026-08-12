export type PettyCashUser = {
    id: string;
    role: string;
    isHead?: boolean;
};
export declare const isAdminRole: (role: string) => boolean;
export declare const isHeadOfficeUser: (user: PettyCashUser) => boolean;
export declare const isProjectAccountant: (userId: string, projectId: string) => Promise<boolean>;
export declare const isSectionAccountantFor: (userId: string, sectionId: string) => Promise<boolean>;
export declare const getHeadOfficeProjectIds: (userId: string) => Promise<string[]>;
export declare const getProjectAccountantProjectIds: (userId: string) => Promise<string[]>;
export declare const getSectionAccountantSectionIds: (userId: string) => Promise<string[]>;
export declare const buildPettyCashAccessWhere: (user: PettyCashUser) => Promise<{
    isDeleted: boolean;
} | {
    projectId: {
        in: string[];
    };
    isDeleted: boolean;
} | {
    OR: ({
        projectId: {
            in: string[];
        };
        sectionId?: undefined;
    } | {
        sectionId: {
            in: string[];
        };
        projectId?: undefined;
    })[];
    isDeleted: boolean;
} | {
    sectionId: {
        in: string[];
    };
    isDeleted: boolean;
}>;
export declare const assertProjectAccess: (user: PettyCashUser, projectId: string) => Promise<boolean>;
export declare const assertSectionAccess: (user: PettyCashUser, sectionId: string) => Promise<boolean>;
export declare const computeProjectBalances: (projectId: string) => Promise<{
    totalFunded: number;
    totalDistributed: number;
    totalInternalExpenses: number;
    projectPoolRemaining: number;
    sectionBalances: Record<string, {
        received: number;
        spent: number;
        remaining: number;
    }>;
}>;
export declare const getProjectPoolRemaining: (projectId: string) => Promise<number>;
export declare const getSectionRemaining: (sectionId: string) => Promise<number>;
