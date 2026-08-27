"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const privilegedAdmin_1 = require("../utils/privilegedAdmin");
const sanitizePrivilegedIdentityResponse = (req, res, next) => {
    void (0, privilegedAdmin_1.getPrivilegedSuperAdminIds)().catch(() => undefined);
    const originalJson = res.json.bind(res);
    res.json = ((body) => {
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