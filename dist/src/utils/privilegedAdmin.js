"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterUsersByRoleForDashboard = exports.getHiddenRolesForDashboard = exports.sanitizePrivilegedIdentities = exports.maskPrivilegedIdentity = exports.isPrivilegedIdentity = exports.invalidatePrivilegedSuperAdminIdCache = exports.getPrivilegedSuperAdminIds = exports.getCachedPrivilegedSuperAdminIds = exports.isPrivilegedSuperAdmin = exports.isPrivilegedSuperAdminEmail = exports.SYSTEM_ADMIN_DISPLAY_NAME = exports.PRIVILEGED_SUPER_ADMIN_EMAIL = void 0;
const prisma_1 = __importDefault(require("./prisma"));
exports.PRIVILEGED_SUPER_ADMIN_EMAIL = "allianceadmin@gmail.com";
exports.SYSTEM_ADMIN_DISPLAY_NAME = "System Admin";
const isPrivilegedSuperAdminEmail = (email) => String(email || "")
    .trim()
    .toLowerCase() === exports.PRIVILEGED_SUPER_ADMIN_EMAIL;
exports.isPrivilegedSuperAdminEmail = isPrivilegedSuperAdminEmail;
const isPrivilegedSuperAdmin = (user) => {
    if (!user?.email)
        return false;
    if (!(0, exports.isPrivilegedSuperAdminEmail)(user.email))
        return false;
    const role = user.originalRole || user.role;
    return role === "SUPER_ADMIN" || role === "ADMIN";
};
exports.isPrivilegedSuperAdmin = isPrivilegedSuperAdmin;
let privilegedIdCache = null;
let privilegedIdCacheAt = 0;
const PRIVILEGED_ID_CACHE_MS = 60_000;
const getCachedPrivilegedSuperAdminIds = () => privilegedIdCache ?? new Set();
exports.getCachedPrivilegedSuperAdminIds = getCachedPrivilegedSuperAdminIds;
const getPrivilegedSuperAdminIds = async () => {
    const now = Date.now();
    if (privilegedIdCache && now - privilegedIdCacheAt < PRIVILEGED_ID_CACHE_MS) {
        return privilegedIdCache;
    }
    const rows = await prisma_1.default.user.findMany({
        where: {
            email: {
                equals: exports.PRIVILEGED_SUPER_ADMIN_EMAIL,
                mode: "insensitive",
            },
        },
        select: { id: true },
    });
    privilegedIdCache = new Set(rows.map((row) => row.id));
    privilegedIdCacheAt = now;
    return privilegedIdCache;
};
exports.getPrivilegedSuperAdminIds = getPrivilegedSuperAdminIds;
const invalidatePrivilegedSuperAdminIdCache = () => {
    privilegedIdCache = null;
    privilegedIdCacheAt = 0;
};
exports.invalidatePrivilegedSuperAdminIdCache = invalidatePrivilegedSuperAdminIdCache;
const isPrivilegedIdentity = (person, privilegedIds) => {
    if (!person)
        return false;
    if ((0, exports.isPrivilegedSuperAdminEmail)(person.email))
        return true;
    if (person.id && privilegedIds?.has(person.id))
        return true;
    return false;
};
exports.isPrivilegedIdentity = isPrivilegedIdentity;
const maskPrivilegedIdentity = (person, privilegedIds) => {
    if (!person || !(0, exports.isPrivilegedIdentity)(person, privilegedIds))
        return person;
    return {
        ...person,
        name: exports.SYSTEM_ADMIN_DISPLAY_NAME,
        email: null,
    };
};
exports.maskPrivilegedIdentity = maskPrivilegedIdentity;
const USERISH_KEYS = new Set([
    "creator",
    "createdByUser",
    "updatedByUser",
    "amountAdder",
    "addedByUser",
    "user",
    "recipient",
    "changedByUser",
    "actor",
    "approver",
    "assignedByUser",
]);
const sanitizePrivilegedIdentities = (value, privilegedIds) => {
    if (value == null)
        return value;
    if (Array.isArray(value)) {
        return value.map((item) => (0, exports.sanitizePrivilegedIdentities)(item, privilegedIds));
    }
    if (typeof value !== "object") {
        if (typeof value === "string" &&
            (0, exports.isPrivilegedSuperAdminEmail)(value)) {
            return exports.SYSTEM_ADMIN_DISPLAY_NAME;
        }
        return value;
    }
    const input = value;
    let next = { ...input };
    if ((0, exports.isPrivilegedIdentity)({
        id: typeof next.id === "string" ? next.id : null,
        email: typeof next.email === "string" ? next.email : null,
        name: typeof next.name === "string" ? next.name : null,
    }, privilegedIds)) {
        next = {
            ...next,
            name: exports.SYSTEM_ADMIN_DISPLAY_NAME,
            email: null,
        };
    }
    for (const [key, child] of Object.entries(next)) {
        if (USERISH_KEYS.has(key) && child && typeof child === "object") {
            next[key] = (0, exports.maskPrivilegedIdentity)(child, privilegedIds);
            next[key] = (0, exports.sanitizePrivilegedIdentities)(next[key], privilegedIds);
            continue;
        }
        next[key] = (0, exports.sanitizePrivilegedIdentities)(child, privilegedIds);
    }
    return next;
};
exports.sanitizePrivilegedIdentities = sanitizePrivilegedIdentities;
const getHiddenRolesForDashboard = (viewerRole) => {
    const role = String(viewerRole || "").toUpperCase();
    if (role === "SUPER_ADMIN")
        return ["SUPER_ADMIN"];
    if (role === "ADMIN" || role === "SUB_ADMIN") {
        return ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"];
    }
    return [];
};
exports.getHiddenRolesForDashboard = getHiddenRolesForDashboard;
const filterUsersByRoleForDashboard = (entries = [], viewerRole) => {
    const hidden = new Set((0, exports.getHiddenRolesForDashboard)(viewerRole));
    if (hidden.size === 0)
        return entries;
    return entries.filter((entry) => !hidden.has(String(entry.role || "").toUpperCase()));
};
exports.filterUsersByRoleForDashboard = filterUsersByRoleForDashboard;
//# sourceMappingURL=privilegedAdmin.js.map