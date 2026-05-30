import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import jwt from 'jsonwebtoken';

/**
 * Utility function to wrap AuthenticatedRequest handlers
 * This ensures proper typing for routes that require authentication
 * AND actually sets the user from the JWT token
 */
export const withAuth = (handler: (req: AuthenticatedRequest, res: Response) => Promise<any>) => {
  return async (req: Request, res: Response) => {
    try {
      // Get token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(' ')[1];
      
      if (!token) {
        return res.status(401).json({ 
          success: false, 
          message: 'No authentication token provided' 
        });
      }
      
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      // Attach user to request
      (req as AuthenticatedRequest).user = decoded as any;
      
      // Call the handler with the authenticated request
      return handler(req as AuthenticatedRequest, res);
    } catch (error) {
      console.error('Auth error:', error);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired token' 
      });
    }
  };
};