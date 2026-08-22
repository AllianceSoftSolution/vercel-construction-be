"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdminApproverRole = exports.DEMAND_APPROVER_ROLES = exports.ADMIN_APPROVER_ROLES = void 0;
exports.ADMIN_APPROVER_ROLES = [
    "ADMIN",
    "SUPER_ADMIN",
    "SUB_ADMIN",
];
exports.DEMAND_APPROVER_ROLES = [
    "PROJECT_MANAGER",
    "SITE_INCHARGE",
    ...exports.ADMIN_APPROVER_ROLES,
];
const isAdminApproverRole = (role) => !!role &&
    exports.ADMIN_APPROVER_ROLES.includes(String(role).toUpperCase());
exports.isAdminApproverRole = isAdminApproverRole;
//# sourceMappingURL=adminRoles.js.map