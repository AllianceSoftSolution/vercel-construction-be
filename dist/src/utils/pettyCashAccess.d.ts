import type { PettyCashTransactionType } from "@prisma/client";
export type PettyCashUser = {
    id: string;
    role: string;
    isHead?: boolean;
};
export declare const isAdminRole: (role: string) => boolean;
export declare const isPettyCashExpenseHeadAdmin: (user: PettyCashUser) => boolean;
export declare const HEAD_OFFICE_PETTY_CASH_PROJECT_CODE = "HO-Petty";
export declare const PETTY_CASH_UI_EXCLUDED_PROJECT_CODES: readonly ["HO-Petty"];
export type PettyCashProjectRef = {
    code?: string | null;
    name?: string | null;
};
export declare const isPettyCashSelectableProject: (project: PettyCashProjectRef) => boolean;
export declare const filterPettyCashSelectableProjects: <T extends PettyCashProjectRef>(projects: T[]) => T[];
export declare const pettyCashOperationalProjectWhere: () => {
    code: {
        notIn: "HO-Petty"[];
    };
};
export declare const getPettyCashOperationalProjectError: (project: PettyCashProjectRef) => "Head Office Petty Cash cannot be selected for petty cash operations. Choose an operational project." | null;
export declare const getHeadOfficePettyCashProjectId: () => Promise<string | null>;
export declare const resolveHeadOfficePettyCashProjectId: (createdBy: string) => Promise<string>;
export declare const canAddPettyCashPool: (user: PettyCashUser) => boolean;
export declare const getAccessibleProjectIds: (user: PettyCashUser) => Promise<string[]>;
export declare const getProjectAccountantProjectIds: (userId: string) => Promise<string[]>;
export declare const isProjectAccountantUser: (user: PettyCashUser) => boolean;
export declare const isHeadOfficeUser: (user: PettyCashUser) => boolean;
export declare const syncHeadOfficeAccountantProjectAssignments: (userId: string, createdBy?: string) => Promise<void>;
export declare const isHeadOfficeAccountant: (user: PettyCashUser) => Promise<boolean>;
export declare const getHeadOfficeDistributableRemaining: () => Promise<number>;
export declare const canAddPettyCashFunding: (user: PettyCashUser) => Promise<boolean>;
export type PettyCashRoleScope = "ADMIN" | "HEAD_OFFICE_ACCOUNTANT" | "PROJECT_ACCOUNTANT" | "PROJECT_MANAGER" | "SECTION_ACCOUNTANT" | "NONE";
export declare const getPettyCashRoleScope: (user: PettyCashUser) => Promise<PettyCashRoleScope>;
export declare const assignHeadOfficeAccountantsToProject: (projectId: string, createdBy: string) => Promise<void>;
export declare const usesSectionScopedOverview: (user: PettyCashUser) => boolean;
export declare const getPettyCashOverviewViewMode: (user: PettyCashUser) => "section" | "project";
export declare const isProjectManagerForProject: (userId: string, projectId: string) => Promise<boolean>;
export declare const isProjectManagerForSection: (userId: string, sectionId: string) => Promise<boolean>;
export declare const getProjectManagerProjectIds: (userId: string) => Promise<string[]>;
export declare const getProjectManagerSectionIds: (userId: string) => Promise<string[]>;
export declare const isSectionAccountantFor: (userId: string, sectionId: string) => Promise<boolean>;
export declare const getHeadOfficeProjectIds: (_userId?: string) => Promise<string[]>;
export declare const getSectionAccountantSectionIds: (userId: string) => Promise<string[]>;
export declare const getSectionAccountantUser: (sectionId: string) => Promise<{
    id: string;
    name: string;
    email: string;
} | null>;
export declare const buildPettyCashAccessWhere: (user: PettyCashUser) => Promise<{
    isDeleted: boolean;
} | {
    OR: ({
        projectId: {
            in: string[];
        };
        type: {
            in: string[];
        };
        sectionId?: undefined;
    } | {
        sectionId: {
            in: string[];
        };
        projectId?: undefined;
        type?: undefined;
    })[];
    isDeleted: boolean;
} | {
    projectId: {
        in: string[];
    };
    isDeleted: boolean;
} | {
    sectionId: {
        in: string[];
    };
    isDeleted: boolean;
}>;
export declare const assertProjectAccess: (user: PettyCashUser, projectId: string) => Promise<boolean>;
export declare const assertSectionAccess: (user: PettyCashUser, sectionId: string) => Promise<boolean>;
export type PettyCashListFilters = {
    projectId?: string;
    sectionId?: string;
    type?: PettyCashTransactionType;
    expenseHeadId?: string;
};
export declare const applyPettyCashListFilters: (where: Record<string, unknown>, filters: PettyCashListFilters) => {
    [x: string]: unknown;
};
export declare const parsePettyCashListFilters: (query: {
    projectId?: string;
    sectionId?: string;
    type?: string;
    expenseHeadId?: string;
}) => PettyCashListFilters;
export declare const aggregatePettyCashTotals: (transactions: {
    type: string;
    amount: unknown;
}[]) => {
    totalFunded: number;
    totalDistributed: number;
    totalInternalExpenses: number;
    totalSectionExpenses: number;
    totalSpent: number;
    poolRemaining: number;
};
export declare const computePettyCashOverview: (totals: ReturnType<typeof aggregatePettyCashTotals>, viewMode: "section" | "project") => {
    totalCredited: number;
    totalDebited: number;
    remainingBalance: number;
};
export declare const aggregateOverviewTotals: (transactions: {
    type: string;
    amount: unknown;
}[], viewMode: "section" | "project") => {
    totalFunded: number;
    totalDistributed: number;
    totalInternalExpenses: number;
    totalSectionExpenses: number;
    totalSpent: number;
    poolRemaining: number;
};
export declare const mapProjectBalancesForHeadOffice: (balances: Awaited<ReturnType<typeof computeProjectBalances>>) => {
    totalCredited: number;
    totalDebited: number;
    remainingBalance: number;
    totalFunded: number;
    totalDistributed: number;
    totalInternalExpenses: number;
    projectPoolRemaining: number;
    sectionBalances: Record<string, {
        received: number;
        spent: number;
        remaining: number;
    }>;
};
export declare const mapProjectBalancesForOverview: (balances: Awaited<ReturnType<typeof computeProjectBalances>>, sectionScoped: boolean) => {
    totalFunded: number;
    totalDistributed: number;
    totalInternalExpenses: number;
    projectPoolRemaining: number;
    sectionBalances: Record<string, {
        received: number;
        spent: number;
        remaining: number;
    }>;
} | {
    totalFunded: number;
    totalInternalExpenses: number;
    totalSectionExpenses: number;
    totalCredited: number;
    totalDebited: number;
    remainingBalance: number;
    totalDistributed: number;
    projectPoolRemaining: number;
    sectionBalances: Record<string, {
        received: number;
        spent: number;
        remaining: number;
    }>;
};
export type PettyCashBalanceScope = {
    pmSectionIds?: string[];
};
export declare const getPettyCashBalanceScope: (user: PettyCashUser) => Promise<PettyCashBalanceScope>;
export declare const resolveFilteredProjectIds: (accessibleIds: string[], filters: PettyCashListFilters, user?: PettyCashUser) => Promise<string[]>;
export declare const computeProjectBalances: (projectId: string, filters?: PettyCashListFilters, scope?: PettyCashBalanceScope) => Promise<{
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
export declare const assertSufficientPettyCashBalance: (available: number, amount: number, balanceLabel: string) => string | null;
export declare const computeSectionBalances: (sectionId: string, filters?: PettyCashListFilters) => Promise<{
    received: number;
    spent: number;
    remaining: number;
    transactionCount: number;
}>;
