"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globalErrorHandler = (err, _req, res, _next) => {
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