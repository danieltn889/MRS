import express, { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { query } from '../../config/database.js';
import { customValidators } from '../../middleware/validation.middleware.js';
const router: Router = express.Router();

// Import controllers
import {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  validateResetToken,
  verifyEmail,
  resendVerificationEmail,
  healthCheck,
  getMe,
  updateProfile,
  enableTwoFactor,
  logoutAll,
  getActiveSessions,
  getLoginHistory,
  exportLoginHistory,
  deleteAccount,
  registerCompanyComplete,
  registerCompany,
  verifyCompanyDomain,
  inviteTeamMember,
  acceptTeamInvitation,
  getTeamInvitations,
  resendTeamInvitation,
  revokeTeamInvitation,
  getTeamMembers,
  updateTeamMemberRole,
  setPasswordPolicy,
  getCompanySessions,
  deactivateUser,
  getSecurityAlerts,
  testEmail
} from '../../controllers/auth.controller.js';

// Import middleware
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.middleware.js';

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000000, // 60 minutes
  max: 100000, // limit each IP to 10 requests per windowMs
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

// @route   GET /api/v1/auth/health
// @desc    Health check
// @access  Public
router.get('/health', healthCheck);

// @route   POST /api/v1/auth/test-email
// @desc    Send test email
// @access  Public
router.post('/test-email', [
  body('email').isEmail().normalizeEmail()
], validateRequest, testEmail);

// @route   POST /api/v1/auth/register
// @desc    Register user
// @access  Public
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('userType').isIn(['candidate', 'recruiter', 'company_admin']),
  body('firstName').trim().isLength({ min: 1 }),
  body('lastName').trim().isLength({ min: 1 })
], validateRequest, register);

// @route   POST /api/v1/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists()
], validateRequest, login);

// @route   POST /api/v1/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', protect, logout as any);

// @route   POST /api/v1/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', refreshToken);

// @route   POST /api/v1/auth/forgot-password
// @desc    Forgot password
// @access  Public
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], validateRequest, forgotPassword);

// @route   POST /api/v1/auth/reset-password
// @desc    Reset password
// @access  Public
router.post('/reset-password', [
  body('token').exists(),
  body('password').isLength({ min: 8 })
], validateRequest, resetPassword);

// @route   POST /api/v1/auth/validate-reset-token
// @desc    Validate reset token
// @access  Public
router.post('/validate-reset-token', [
  body('token').exists()
], validateRequest, validateResetToken);

// @route   POST /api/v1/auth/verify-email
// @desc    Verify email
// @access  Public
router.post('/verify-email', [
  body('token').exists()
], validateRequest, verifyEmail);

// @route   POST /api/v1/auth/resend-verification-email
// @desc    Resend verification email
// @access  Public
router.post('/resend-verification-email', [
  body('email').isEmail().normalizeEmail()
], validateRequest, resendVerificationEmail);

// @route   GET /api/v1/auth/verification-token/:email
// @desc    Get verification token for testing (development only)
// @access  Public
router.get('/verification-token/:email', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.params;
    const result = await query(
      'SELECT verification_token FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        verificationToken: result.rows[0].verification_token,
        verificationUrl: `${process.env.FRONTEND_URL}/verify-email?token=${result.rows[0].verification_token}`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get verification token'
    });
  }
});

// @route   GET /api/v1/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, getMe as any);

// @route   PUT /api/v1/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, [
  body('firstName').optional().trim().isLength({ min: 1 }),
  body('lastName').optional().trim().isLength({ min: 1 }),
  body('phone').optional().isMobilePhone('any'),
  body('bio').optional().isLength({ max: 500 })
], validateRequest, updateProfile as any);

// @route   POST /api/v1/auth/2fa/enable
// @desc    Enable two-factor authentication
// @access  Private
router.post('/2fa/enable', protect, enableTwoFactor as any);

// @route   POST /api/v1/auth/logout-all
// @desc    Log out from all devices
// @access  Private
router.post('/logout-all', protect, logoutAll as any);

// @route   GET /api/v1/auth/sessions
// @desc    Get active sessions for current user
// @access  Private
router.get('/sessions', protect, getActiveSessions as any);

// @route   GET /api/v1/auth/login-history
// @desc    View login history
// @access  Private
router.get('/login-history', protect, getLoginHistory as any);

// @route   GET /api/v1/auth/login-history/export
// @desc    Export login history to CSV
// @access  Private
router.get('/login-history/export', protect, exportLoginHistory as any);

// @route   DELETE /api/v1/auth/delete-account
// @desc    Delete my account
// @access  Private
router.delete('/delete-account', protect, deleteAccount as any);

// @route   POST /api/v1/auth/company/register-complete
// @desc    Complete company registration with admin account creation
// @access  Public
router.post('/company/register-complete', [
  body('companyName').trim().isLength({ min: 1, max: 100 }),
  body('industry').optional().trim().isLength({ max: 50 }),
  body('size').optional().isIn(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']),
  body('website').optional().isURL(),
  body('domain').isFQDN(),
  body('firstName').trim().isLength({ min: 1, max: 50 }),
  body('lastName').trim().isLength({ min: 1, max: 50 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('phone').optional().custom(customValidators.isValidPhone).withMessage('Invalid phone number format')
], validateRequest, registerCompanyComplete as any);

// @route   POST /api/v1/auth/company/register
// @desc    Register my company
// @access  Private
router.post('/company/register', protect, [
  body('name').trim().isLength({ min: 1 }),
  body('industry').optional().trim(),
  body('size').optional().isIn(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']),
  body('website').optional().isURL(),
  body('domain').isFQDN()
], validateRequest, registerCompany as any);

// @route   POST /api/v1/auth/company/verify-domain
// @desc    Verify company email domain
// @access  Private
router.post('/company/verify-domain', protect, [
  body('domain').isFQDN()
], validateRequest, verifyCompanyDomain as any);

// @route   POST /api/v1/auth/company/invite
// @desc    Invite team members
// @access  Private
router.post('/company/invite', protect, [
  body('emails').isArray({ min: 1 }),
  body('emails.*').isString().trim().isLength({ min: 1 }),
  body('role').isIn(['admin', 'recruiter', 'reviewer', 'viewer']),
  body('firstName').optional().trim().isLength({ min: 1 }),
  body('lastName').optional().trim().isLength({ min: 1 }),
  body('personalMessage').optional().trim()
], validateRequest, inviteTeamMember as any);

// @route   POST /api/v1/auth/team/accept-invitation
// @desc    Accept team invitation and join company
// @access  Public
router.post('/team/accept-invitation', [
  body('token').exists().trim(),
  body('password').optional().isLength({ min: 8 }),
  body('firstName').optional().trim().isLength({ min: 1, max: 50 }),
  body('lastName').optional().trim().isLength({ min: 1, max: 50 }),
  body('phone').optional().isMobilePhone('any')
], validateRequest, acceptTeamInvitation as any);

// @route   GET /api/v1/auth/team/invitations
// @desc    Get team invitations for company
// @access  Private (Company Admin)
router.get('/team/invitations', protect, authorize('company_admin'), getTeamInvitations as any);

// @route   POST /api/v1/auth/team/resend-invitation
// @desc    Resend team invitation
// @access  Private (Company Admin)
router.post('/team/resend-invitation', protect, authorize('company_admin'), [
  body('invitationId').isUUID()
], validateRequest, resendTeamInvitation as any);

// @route   POST /api/v1/auth/team/revoke-invitation
// @desc    Revoke team invitation
// @access  Private (Company Admin)
router.post('/team/revoke-invitation', protect, authorize('company_admin'), [
  body('invitationId').isUUID()
], validateRequest, revokeTeamInvitation as any);

// @route   GET /api/v1/auth/team/members
// @desc    Get company team members
// @access  Private (Company Members)
router.get('/team/members', protect, getTeamMembers as any);

// @route   POST /api/v1/auth/team/update-role
// @desc    Update team member role
// @access  Private (Company Admin)
router.post('/team/update-role', protect, authorize('company_admin'), [
  body('memberId').isUUID(),
  body('newRole').isIn(['admin', 'recruiter', 'reviewer', 'viewer'])
], validateRequest, updateTeamMemberRole as any);

// @route   POST /api/v1/auth/company/password-policy
// @desc    Set company password policies
// @access  Private
router.post('/company/password-policy', protect, [
  body('minLength').optional().isInt({ min: 8, max: 128 }),
  body('requireUppercase').optional().isBoolean(),
  body('requireLowercase').optional().isBoolean(),
  body('requireNumbers').optional().isBoolean(),
  body('requireSpecialChars').optional().isBoolean(),
  body('expiryDays').optional().isInt({ min: 30, max: 365 })
], validateRequest, setPasswordPolicy as any);

// @route   GET /api/v1/auth/company/sessions
// @desc    View active company sessions
// @access  Private
router.get('/company/sessions', protect, getCompanySessions as any);

// @route   POST /api/v1/auth/company/deactivate-user
// @desc    Deactivate former employee accounts
// @access  Private
router.post('/company/deactivate-user', protect, [
  body('userId').isInt({ min: 1 })
], validateRequest, deactivateUser as any);

// @route   GET /api/v1/auth/security-alerts
// @desc    Receive security alerts
// @access  Private
router.get('/security-alerts', protect, getSecurityAlerts as any);

export default router;