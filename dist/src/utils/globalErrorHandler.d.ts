import { Request, Response, NextFunction } from "express";
import AppError from "./appError";
declare const globalErrorHandler: (err: AppError, _req: Request, res: Response, _next: NextFunction) => void;
export default globalErrorHandler;
