/**
 * Email Verification Controller - Story 2
 * Handles email verification, resend verification email, and token validation
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import { query, getClient } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from '../services/email.service.js';
import { AuthenticatedRequest } from '../types/auth.types.js';

interface VerifyEmailRequest extends Request {
  body: {
    token: string;
  };
}

interface ResendVerificationRequest extends Request {
  body: {
    email: string;
  };
}

interface VerifyManualCodeRequest extends Request {
  body: {
    email: string;
    code: string;
  };
}

// @desc    Verify email with token
// @route   POST /api/v1/auth/verify-email
// @access  Public
// Handles Story 2 acceptance criteria:
// - Token validation against database
// - Account status updated from "unverified" to "verified"
// - Verification timestamp recorded
// - Old token invalidated after use
export const verifyEmailToken = async (req: VerifyEmailRequest, res: Response): Promise<void> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { token } = req.body;

    // Validate token format
    if (!token || typeof token !== 'string'|| token.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid verification token format'
      });
      return;
    }

    // Find user with this verification token
    const userResult = await client.query(
      `SELECT id, email, status, verification_token, token_expiry 
       FROM users 
       WHERE verification_token = $1`,
      [token]
    );

    // Case 1: Invalid token
    if (userResult.rows.length === 0) {
      // Log security event for invalid attempt (optional)
      try {
        await client.query(
          `INSERT INTO security_alerts (user_id, alert_type, severity, title, description) 
           VALUES (NULL, 'invalid_verification_attempt', 'low', 'Invalid verification token used', 
                   'Attempted email verification with invalid token: ${token.substring(0, 8)}...')`
        );
      } catch (alertError) {
        // Ignore if security_alerts table doesn't exist
        logger.warn('Could not log security alert:', alertError);
      }

      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Invalid verification link. Please check the link or request a new one.',
        errorCode: 'INVALID_TOKEN'
      });
      return;
    }

    const user = userResult.rows[0];

    // Case 2: Already verified account
    if (user.status === 'verified'|| user.status === 'active') {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'This email is already verified. Please log in.',
        errorCode: 'ALREADY_VERIFIED',
        email: user.email
      });
      return;
    }

    // Case 3: Expired token (24-hour validity period)
    if (user.token_expiry && new Date() > new Date(user.token_expiry)) {
      // Generate new token for resend option
      const newToken = crypto.randomBytes(32).toString('hex');
      const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await client.query(
        `UPDATE users 
         SET verification_token = $1, token_expiry = $2 
         WHERE id = $3`,
        [newToken, newExpiry, user.id]
      );

      await client.query('ROLLBACK');

      // Send new verification email
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        await sendEmail({
          to: user.email,
          subject: 'Verify Your Email - New Link (Previous Link Expired)',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2563eb;">Verify Your Email Address</h2>
              <p>Your previous verification link has expired. Please use this new link to verify your email:</p>
              <p><a href="${frontendUrl}/verify-email?token=${newToken}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a></p>
              <p>Or copy and paste this link: ${frontendUrl}/verify-email?token=${newToken}</p>
              <p>This link will expire in 24 hours.</p>
            </div>
          `,
          text: `Your verification link has expired. Please use this new link to verify your email: ${frontendUrl}/verify-email?token=${newToken}`
        });
      } catch (emailError) {
        logger.error('Failed to send new verification email:', emailError);
      }

      res.status(400).json({
        success: false,
        message: 'Verification link has expired. A new verification email has been sent.',
        errorCode: 'EXPIRED_TOKEN'
      });
      return;
    }

    // Case 4: Token used multiple times (prevent token reuse)
    // Commented out - table may not exist
    // Check if this token-user combination was already used
    // const usageRecord = await client.query(
    //   `SELECT id FROM email_verification_history 
    //    WHERE user_id = $1 AND token = $2 AND verified = true`,
    //   [user.id, token]
    // );

    // if (usageRecord.rows.length > 0) {
    //   await client.query('ROLLBACK');
    //   res.status(400).json({
    //     success: false,
    //     message: 'This verification link has already been used.',
    //     errorCode: 'TOKEN_ALREADY_USED',
    //     email: user.email
    //   });
    //   return;
    // }

    // Happy path: Update user account to verified
    await client.query(
      `UPDATE users 
       SET status = $1, verification_token = NULL, token_expiry = NULL, updated_at = NOW() 
       WHERE id = $2`,
      [process.env.EMAIL_VERIFIED_STATUS || 'verified', user.id]
    );

    // Record verification in history (optional - if table exists)
    // await client.query(
    //   `INSERT INTO email_verification_history (user_id, token, verified, verified_at, verification_method) 
    //    VALUES ($1, $2, true, NOW(), 'token')`,
    //   [user.id, token]
    // );

    // Commit transaction first - before async operations
    await client.query('COMMIT');

    // Send welcome email after transaction is committed (don't wait for it)
    try {
      await sendEmail({
        to: user.email,
        subject: 'Welcome! Your Account is Now Active',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Welcome!</h2>
            <p>Your email has been verified successfully. You can now log in to your account.</p>
            <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Log In</a></p>
            <p>If you have any questions, please contact our support team.</p>
          </div>
        `,
        text: `Welcome! Your email has been verified successfully. You can now log in to your account.`
      });
    } catch (emailError) {
      logger.error('Failed to send welcome email:', emailError);
    }

    res.json({
      success: true,
      message: 'Email verified successfully! You can now log in.',
      data: {
        email: user.email,
        status: process.env.EMAIL_VERIFIED_STATUS || 'verified'
      }
    });

  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Rollback error:', rollbackError);
    }
    logger.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Email verification failed. Please try again later.',
      errorCode: 'VERIFICATION_ERROR'
    });
  } finally {
    // Release the client back to the pool
    client.release();
  }
};

// @desc    Resend verification email
// @route   POST /api/v1/auth/resend-verification-email
// @access  Public
// Handles Story 2 alternate path: resend verification email
export const resendVerificationEmail = async (req: ResendVerificationRequest, res: Response): Promise<void> => {
  const client = await getClient();

  try {
    const { email } = req.body;

    // Validate email
    if (!email || !isValidEmail(email)) {
      res.status(400).json({
        success: false,
        message: 'Invalid email address provided',
        errorCode: 'INVALID_EMAIL'
      });
      return;
    }

    // Find user
    const userResult = await client.query(
      `SELECT id, status, verification_token, token_expiry 
       FROM users 
       WHERE email = $1`,
      [email]
    );

    // Don't reveal if email exists for security
    if (userResult.rows.length === 0) {
      res.json({
        success: true,
        message: 'If an account with that email exists and is not verified, a new verification email has been sent.'
      });
      return;
    }

    const user = userResult.rows[0];

    // Case: Already verified
    if (user.status === 'verified'|| user.status === 'active') {
      res.json({
        success: true,
        message: 'This email is already verified. You can log in directly.'
      });
      return;
    }

    // Generate new verification token
    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update user with new token
    await client.query(
      `UPDATE users 
       SET verification_token = $1, token_expiry = $2 
       WHERE id = $3`,
      [newToken, newExpiry, user.id]
    );

    // Send verification email
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      await sendEmail({
        to: email,
        subject: 'Verify Your Email - Recruitment Platform',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Verify Your Email Address</h2>
            <p>Please click the button below to verify your email and complete your registration:</p>
            <p><a href="${frontendUrl}/verify-email?token=${newToken}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a></p>
            <p>Or copy and paste this link: ${frontendUrl}/verify-email?token=${newToken}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you did not create this account, please ignore this email.</p>
          </div>
        `,
        text: `Click here to verify your email: ${frontendUrl}/verify-email?token=${newToken}`
      });
    } catch (emailError) {
      logger.error('Failed to send verification email:', emailError);
      res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again later.',
        errorCode: 'EMAIL_SEND_FAILED'
      });
      return;
    }

    res.json({
      success: true,
      message: 'A new verification email has been sent. Please check your inbox.'
    });

  } catch (error) {
    logger.error('Resend verification email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process resend request',
      errorCode: 'RESEND_ERROR'
    });
  } finally {
    client.release();
  }
};

// @desc    Verify email with manual code (6-digit numeric)
// @route   POST /api/v1/auth/verify-email-code
// @access  Public
// Handles Story 2 alternative verification: manual code entry
export const verifyEmailCode = async (req: VerifyManualCodeRequest, res: Response): Promise<void> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { email, code } = req.body;

    // Validate inputs
    if (!email || !code) {
      res.status(400).json({
        success: false,
        message: 'Email and code are required'
      });
      return;
    }

    // Validate code format (6-digit numeric)
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({
        success: false,
        message: 'Invalid verification code format. Expected 6 digits.'
      });
      return;
    }

    // Find user with verification code
    const userResult = await client.query(
      `SELECT id, status, verification_code, token_expiry FROM users WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    const user = userResult.rows[0];

    // Already verified
    if (user.status === 'verified'|| user.status === 'active') {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'This email is already verified.'
      });
      return;
    }

    // Check if code matches
    if (user.verification_code !== code) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Invalid verification code. Please check your email and try again.',
        errorCode: 'INVALID_CODE'
      });
      return;
    }

    // Check if code has expired
    if (user.token_expiry && new Date() > new Date(user.token_expiry)) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new verification email.',
        errorCode: 'EXPIRED_CODE'
      });
      return;
    }

    // Happy path: Verify email
    await client.query(
      `UPDATE users
       SET status = $1, verification_token = NULL, verification_code = NULL, token_expiry = NULL, updated_at = NOW()
       WHERE id = $2`,
      [process.env.EMAIL_VERIFIED_STATUS || 'verified', user.id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Email verified successfully with your verification code!',
      data: {
        email: email,
        status: process.env.EMAIL_VERIFIED_STATUS || 'verified'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Email code verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Email verification failed',
      errorCode: 'VERIFICATION_ERROR'
    });
  } finally {
    client.release();
  }
};

// @desc    Check email verification status
// @route   GET /api/v1/auth/verification-status/:email
// @access  Public
export const checkVerificationStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.params;

    const result = await query(
      `SELECT id, email, status, verification_token IS NOT NULL as needs_verification 
       FROM users 
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Email not found'
      });
      return;
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        email: user.email,
        verified: user.status === 'verified'|| user.status === 'active',
        status: user.status,
        needsVerification: user.needs_verification
      }
    });

  } catch (error) {
    logger.error('Check verification status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check verification status'
    });
  }
};

// Helper functions

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function generateVerificationEmailHTML(email: string, token: string, frontendUrl: string, isRetry: boolean = false): string {
  const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;
  const manualCodeUrl = `${frontendUrl}/verify-email-manual`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .code-box { background: #ffffff; border: 2px solid #667eea; padding: 15px; text-align: center; font-size: 18px; letter-spacing: 5px; margin: 20px 0; font-weight: bold; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Verify Your Email</h1>
          <p>${isRetry ? 'Your previous link has expired. Here\'s a new one!': 'Complete your registration'}</p>
        </div>
        
        <div class="content">
          <h2>Welcome!</h2>
          <p>Thank you for signing up. To activate your account and get started, please verify your email address.</p>
          
          <p style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </p>
          
          <p style="text-align: center; color: #666;">Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px; font-size: 12px;">
            ${verificationUrl}
          </p>
          
          <hr style="margin: 30px 0;">
          
          <h3>Alternative: Enter Code Manually</h3>
          <p>If you prefer, you can also <a href="${manualCodeUrl}">enter a verification code manually</a>. A 6-digit code has been sent to your email.</p>
          
          <div class="warning">
            <strong>Security Note:</strong> This link will expire in 24 hours. If it expires, you can request a new verification email.
          </div>
          
          <p style="color: #666; font-size: 12px;">
            <strong>Didn't sign up?</strong> If you didn't create this account, you can safely ignore this email. Your email won't be activated without verifying this link.
          </p>
        </div>
        
        <div class="footer">
          <p>© 2026 Recruitment Platform. All rights reserved.</p>
          <p>This is an automated email, please don't reply directly.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateWelcomeEmailHTML(email: string): string {
  const loginUrl = 'http://localhost:3000/login';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .checkmark { font-size: 48px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="checkmark">''</div>
          <h1>Email Verified Successfully!</h1>
        </div>
        
        <div class="content">
          <h2>Welcome to the Recruitment Platform!</h2>
          
          <p>Great! Your email has been verified and your account is now active.</p>
          
          <p><strong>Email:</strong> ${email}</p>
          
          <p>You can now log in to your account and start exploring job opportunities.</p>
          
          <p style="text-align: center;">
            <a href="${loginUrl}" class="button">Go to Login</a>
          </p>
          
          <hr style="margin: 30px 0;">
          
          <h3>What's Next?</h3>
          <ul>
            <li>Complete your profile to improve job matches</li>
            <li>Browse available job positions</li>
            <li>Apply to jobs that interest you</li>
            <li>Track your applications</li>
          </ul>
          
          <p style="color: #666;">If you have any questions or need help, our support team is here to assist you.</p>
        </div>
        
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
          <p>© 2026 Recruitment Platform. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
