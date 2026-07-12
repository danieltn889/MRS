import jwt from 'jsonwebtoken';
import { query } from '../config/database.ts';
import { logger } from '../utils/logger.ts';
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, User } from '../types/auth.types.ts';

// Protect routes - require authentication
const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token: string | undefined;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check for token in cookies
    else if (req.cookies && (req.cookies as any).token) {
      token = (req.cookies as any).token;
    }

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
      return;
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };

      // Get user from database
      const result = await query(
        'SELECT id, email, user_type, status FROM users WHERE id = $1',
        [decoded.id]
      );

      if (result.rows.length === 0) {
        res.status(401).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      let user = result.rows[0] as User;

      // For company_admin/recruiter, resolve which company they're operating as.
      // A user can be on more than one company's team; is_default (set at login,
      // see auth.controller.ts) picks the one they're currently working with.
      if (user.user_type === 'company_admin'|| user.user_type === 'recruiter') {
        const companyResult = await query(
          'SELECT company_id FROM company_team WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC LIMIT 1',
          [user.id]
        );
        if (companyResult.rows.length > 0) {
          user.company_id = companyResult.rows[0].company_id;
        }
      }

      if (user.status !== 'active'&& user.status !== 'verified') {
        res.status(401).json({
          success: false,
          message: 'Account is not verified'
        });
        return;
      }

      (req as AuthenticatedRequest).user = user;
      next();
    } catch (err) {
      logger.error('JWT verification error:', err);
      res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
      return;
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
    return;
  }
};

// Grant access to specific roles
const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!roles.includes(authReq.user.user_type)) {
      res.status(403).json({
        success: false,
        message: `User role ${authReq.user.user_type} is not authorized to access this route`
      });
      return;
    }
    next();
  };
};

// Check if user owns resource or is admin
const ownerOrAdmin = (resourceUserIdField: string = 'user_id') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user.user_type === 'system_admin'|| authReq.user.user_type === 'company_admin') {
      next();
      return;
    }

    if (req.params[resourceUserIdField] !== authReq.user.id.toString()) {
      res.status(403).json({
        success: false,
        message: 'Not authorized to access this resource'
      });
      return;
    }

    next();
  };
};

export {
  protect,
  authorize,
  ownerOrAdmin
};