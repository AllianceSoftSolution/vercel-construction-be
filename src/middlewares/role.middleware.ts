import { Request, Response, NextFunction } from "express";
import AppError from "../utils/appError";

interface AuthRequest extends Request {
  user?: any;
}

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("Authentication required", 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError("Insufficient permissions", 403));
    }

    next();
  };
};

export const requireSiteInchargeOrAdmin = requireRole(['SITE_INCHARGE', 'ADMIN']); 