import { Request, Response, NextFunction } from "express";
interface AuthRequest extends Request {
    user?: any;
}
export declare const requireRole: (allowedRoles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const requireSiteInchargeOrAdmin: (req: AuthRequest, res: Response, next: NextFunction) => void;
export {};
