import { Request, Response, NextFunction } from "express";
import {
  getCachedPrivilegedSuperAdminIds,
  getPrivilegedSuperAdminIds,
  isPrivilegedSuperAdmin,
  sanitizePrivilegedIdentities,
} from "../utils/privilegedAdmin";

/** Routes that return the caller's own session user before auth middleware runs. */
const UNSANITIZED_AUTH_PATHS = new Set([
  "/auth/login",
  "/auth/register",
]);

const shouldSkipSanitization = (req: Request): boolean => {
  const path = req.path || "";
  if (UNSANITIZED_AUTH_PATHS.has(path)) return true;
  // Login/register when mounted under /api
  if (path.endsWith("/login") || path.endsWith("/register")) return true;
  return false;
};

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
    if (shouldSkipSanitization(req)) {
      return originalJson(body);
    }

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
