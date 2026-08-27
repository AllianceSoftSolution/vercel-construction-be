import { Request, Response, NextFunction } from "express";
import {
  getCachedPrivilegedSuperAdminIds,
  getPrivilegedSuperAdminIds,
  isPrivilegedSuperAdmin,
  sanitizePrivilegedIdentities,
} from "../utils/privilegedAdmin";

/**
 * Masks privileged Super Admin identity ("System Admin") in all JSON responses
 * for non-privileged viewers. Privileged Super Admin sees unmasked data.
 */
const sanitizePrivilegedIdentityResponse = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Warm id cache in the background (email-based masking works immediately).
  void getPrivilegedSuperAdminIds().catch(() => undefined);

  const originalJson = res.json.bind(res);

  res.json = ((body?: unknown) => {
    const viewer = (req as Request & { user?: unknown }).user as
      | { email?: string; role?: string; originalRole?: string }
      | undefined;

    if (isPrivilegedSuperAdmin(viewer)) {
      return originalJson(body);
    }

    return originalJson(
      sanitizePrivilegedIdentities(body, getCachedPrivilegedSuperAdminIds()),
    );
  }) as Response["json"];

  next();
};

export default sanitizePrivilegedIdentityResponse;
