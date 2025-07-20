import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  type?: string;
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response
) => {
  const statusCode = error.statusCode || 500;
  const type = error.type || 'server_error';
  
  console.error('Error:', error);
  
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