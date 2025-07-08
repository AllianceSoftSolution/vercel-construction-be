import { Request, Response, NextFunction } from "express";
import AppError from "./appError";

const globalErrorHandler = (
    err: AppError,
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    // Set default values
    const statusCode = err.statusCode || 500;
    const status = err.status || "error";

    res.status(statusCode).json({
        status,
        message: err.message,
        ...(process.env.NODE_ENV === "development" && {
            error: err,
            stack: err.stack,
        }),
    });
};

export default globalErrorHandler;
