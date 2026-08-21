import { Request, Response, NextFunction } from "express";
import AppError from "./appError";

const globalErrorHandler = (
  err: AppError & { code?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    err = new AppError("File exceeds the 150MB size limit", 413);
  }

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
