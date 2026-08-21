"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const appError_1 = __importDefault(require("./appError"));
const globalErrorHandler = (err, _req, res, _next) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
        err = new appError_1.default("File exceeds the 150MB size limit", 413);
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
exports.default = globalErrorHandler;
//# sourceMappingURL=globalErrorHandler.js.map