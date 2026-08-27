export declare const PRIVILEGED_SUPER_ADMIN_EMAIL = "allianceadmin@gmail.com";
export declare const SYSTEM_ADMIN_DISPLAY_NAME = "System Admin";
export declare const isPrivilegedSuperAdminEmail: (email?: string | null) => boolean;
export declare const isPrivilegedSuperAdmin: (user?: {
    email?: string | null;
    originalRole?: string | null;
    role?: string | null;
} | null) => boolean;
export declare const getCachedPrivilegedSuperAdminIds: () => Set<string>;
export declare const getPrivilegedSuperAdminIds: () => Promise<Set<string>>;
export declare const invalidatePrivilegedSuperAdminIdCache: () => void;
export declare const isPrivilegedIdentity: (person?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
} | null, privilegedIds?: Set<string>) => boolean;
export declare const maskPrivilegedIdentity: <T extends {
    id?: string | null;
    email?: string | null;
    name?: string | null;
}>(person: T | null | undefined, privilegedIds?: Set<string>) => T | null | undefined;
export declare const sanitizePrivilegedIdentities: (value: unknown, privilegedIds?: Set<string>) => unknown;
export declare const getHiddenRolesForDashboard: (viewerRole?: string | null) => string[];
export declare const filterUsersByRoleForDashboard: <T extends {
    role?: string | null;
}>(entries?: T[], viewerRole?: string | null) => T[];
