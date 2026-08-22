export const ADMIN_APPROVER_ROLES = [
  "ADMIN",
  "SUPER_ADMIN",
  "SUB_ADMIN",
] as const;

export const DEMAND_APPROVER_ROLES = [
  "PROJECT_MANAGER",
  "SITE_INCHARGE",
  ...ADMIN_APPROVER_ROLES,
] as const;

export const isAdminApproverRole = (role?: string | null) =>
  !!role &&
  ADMIN_APPROVER_ROLES.includes(
    String(role).toUpperCase() as (typeof ADMIN_APPROVER_ROLES)[number]
  );
