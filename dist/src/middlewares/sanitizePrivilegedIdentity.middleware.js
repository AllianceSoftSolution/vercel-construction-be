"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const privilegedAdmin_1 = require("../utils/privilegedAdmin");
const UNSANITIZED_AUTH_PATHS = new Set([
    "/auth/login",
    "/auth/register",
]);
const shouldSkipSanitization = (req) => {
    const path = req.path || "";
    if (UNSANITIZED_AUTH_PATHS.has(path))
        return true;
    if (path.endsWith("/login") || path.endsWith("/register"))
        return true;
    return false;
};
const sanitizePrivilegedIdentityResponse = (req, res, next) => {
    void (0, privilegedAdmin_1.getPrivilegedSuperAdminIds)().catch(() => undefined);
    const originalJson = res.json.bind(res);
    res.json = ((body) => {
        if (shouldSkipSanitization(req)) {
            return originalJson(body);
        }
        const viewer = req.user;
        if ((0, privilegedAdmin_1.isPrivilegedSuperAdmin)(viewer)) {
            return originalJson(body);
        }
        return originalJson((0, privilegedAdmin_1.sanitizePrivilegedIdentities)(body, (0, privilegedAdmin_1.getCachedPrivilegedSuperAdminIds)()));
    });
    next();
};
exports.default = sanitizePrivilegedIdentityResponse;
//# sourceMappingURL=sanitizePrivilegedIdentity.middleware.js.map