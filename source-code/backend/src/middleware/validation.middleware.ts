import { validationResult, ValidationError } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Middleware to handle validation errors
const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    // Log detailed errors
    console.error('=== VALIDATION FAILED ===');
    console.error('URL:', req.method, req.originalUrl);
    console.error('Body:', JSON.stringify(req.body, null, 2));
    console.error('Errors:', JSON.stringify(errors.array(), null, 2));
    logger.error('Validation errors:', JSON.stringify(errors.array(), null, 2));
    
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: (err as any).param || (err as any).path,
        message: err.msg,
        value: (err as any).value
      }))
    });
    return;
  }
  next();
};

// Custom validation rules
const customValidators = {
  isValidUUID: (value: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },

  isValidPassword: (value: string): boolean => {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(value);
  },

  isValidPhone: (value: string): boolean => {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(value);
  }
};

export {
  validateRequest,
  customValidators
};