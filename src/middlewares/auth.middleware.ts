import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import AppError from "../utils/appError";
import prisma from "../utils/prisma";

interface AuthRequest extends Request {
  user?: any; // Extend Request to include `user` property
}

const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new AppError("Unauthorized: No token provided", 401));
    }

    const token = authHeader.split(" ")[1]; // Extract token

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string };

    // Find user in DB
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    // SUB_ADMIN: read-only — block all mutating HTTP methods
    if (user.role === "SUB_ADMIN" && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next(new AppError("Sub-admin users have read-only access and cannot perform this action", 403));
    }

    // Normalise role for access-control throughout the app:
    // SUPER_ADMIN → treated as ADMIN (full access)
    // SUB_ADMIN   → treated as ADMIN for read (sees all data), blocked above for writes
    if (user.role === "SUPER_ADMIN" || user.role === "SUB_ADMIN") {
      req.user = { ...user, role: "ADMIN" };
    } else {
      req.user = user;
    }

    next(); // Proceed to the next middleware
  } catch (error) {
    return next(new AppError("Invalid or expired token", 401));
  }
};

export default protect;
