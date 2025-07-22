import { Request, Response, NextFunction } from 'express';
import Logger from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  type?: string;
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }
  
  const statusCode = error.statusCode || 500;
  const type = error.type || 'server_error';
  
  Logger.error('Request error', { error: error.message, stack: error.stack, statusCode });
  
  res.status(statusCode).json({
    error: {
      message: error.message,
      type,
      ...(process.env.NOOTROPIC_NODE_ENV === 'development' && { stack: error.stack })
    }
  });
};

export const createError = (message: string, statusCode: number = 400, type?: string): ApiError => {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.type = type;
  return error;
};