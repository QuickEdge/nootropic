"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createError = exports.errorHandler = void 0;
const errorHandler = (error, req, res) => {
    const statusCode = error.statusCode || 500;
    const type = error.type || 'server_error';
    console.error('Error:', error);
    res.status(statusCode).json({
        error: {
            message: error.message,
            type,
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        }
    });
};
exports.errorHandler = errorHandler;
const createError = (message, statusCode = 400, type) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.type = type;
    return error;
};
exports.createError = createError;
//# sourceMappingURL=error-handler.js.map