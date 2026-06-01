import express, { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';

// Import controllers
import {
  verifyEmailToken,
  resendVerificationEmail,
  verifyEmailCode,
  checkVerificationStatus
} from '../../controllers/email-verification.controller.js';

// Import middleware
import { validateRequest } from '../../middleware/validation.middleware.js';

const router: Router = express.Router();

// Rate limiting for email verification routes - DISABLED FOR TESTING
const emailVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Very high limit for testing - effectively disabled
  message: 'Too many verification attempts, please try again later.'
});

const resendEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Max 3 resend requests per hour
  message: 'Too many resend requests. Please try again in an hour.'
});

// @route   POST /api/v1/verify-email/token
// @desc    Verify email with token (from email link)
// @access  Public
// @rate    5 attempts per 15 minutes
router.post(
  '/token',
  emailVerificationLimiter,
  [
    body('token')
      .exists().withMessage('Verification token is required')
      .trim()
      .isLength({ min: 32 }).withMessage('Invalid token format')
  ],
  validateRequest,
  verifyEmailToken
);

// @route   POST /api/v1/verify-email/resend
// @desc    Resend verification email
// @access  Public
// @rate    3 resends per 1 hour
router.post(
  '/resend',
  resendEmailLimiter,
  [
    body('email')
      .exists().withMessage('Email is required')
      .isEmail().withMessage('Invalid email format')
      .normalizeEmail()
  ],
  validateRequest,
  resendVerificationEmail
);

// @route   POST /api/v1/verify-email/code
// @desc    Verify email with manual 6-digit code
// @access  Public
// @rate    5 attempts per 15 minutes
// Story 2: Alternative verification method (manual code entry)
router.post(
  '/code',
  emailVerificationLimiter,
  [
    body('email')
      .exists().withMessage('Email is required')
      .isEmail().withMessage('Invalid email format')
      .normalizeEmail(),
    body('code')
      .exists().withMessage('Verification code is required')
      .trim()
      .matches(/^\d{6}$/).withMessage('Code must be 6 digits')
  ],
  validateRequest,
  verifyEmailCode
);

// @route   GET /api/v1/verify-email/status/:email
// @desc    Check email verification status
// @access  Public
router.get('/status/:email', checkVerificationStatus);

export default router;
