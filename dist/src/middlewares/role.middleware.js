"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSiteInchargeOrAdmin = exports.requireRole = void 0;
const appError_1 = __importDefault(require("../utils/appError"));
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new appError_1.default("Authentication required", 401));
        }
        if (!allowedRoles.includes(req.user.role)) {
            return next(new appError_1.default("Insufficient permissions", 403));
        }
        next();
    };
};
exports.requireRole = requireRole;
exports.requireSiteInchargeOrAdmin = (0, exports.requireRole)(['SITE_INCHARGE', 'ADMIN']);
//# sourceMappingURL=role.middleware.js.map