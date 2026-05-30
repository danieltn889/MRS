import { logger } from '../utils/logger';
import { Request, Response, NextFunction } from 'express';

interface ErrorWithStatus {
  message: string;
  statusCode?: number;
  name?: string;
}

const errorHandler = (err: ErrorWithStatus, req: Request, res: Response, next: NextFunction): void => {
  let error: ErrorWithStatus = { ...err };
  error.message = err.message;

  // Log error
  logger.error(error.message);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if ((err as any).code === 11000) {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values((err as any).errors).map((val: any) => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: (err as any).stack })
  });
};

export {
  errorHandler
};