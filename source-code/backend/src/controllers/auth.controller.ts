import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import { query, getClient } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from '../services/email.service.js';
import RecommendationSyncService from '../services/recommendation-sync.service.js';
import { User, AuthenticatedRequest } from '../types/auth.types.js';
import { User as BaseUser } from '../models/index.js';
import { finalizeIdentityDocumentFile, deleteStagedFile } from '../utils/identityDocumentStorage.js';
import { validateIdentityDocument, isDuplicateDocument, DocumentType } from '../validators/identityDocument.js';
import { isValidRwandaLocationChain } from '../utils/rwandaLocation.js';

// ============ PASSWORD VALIDATION HELPERS ============

/**
 * Validate password strength
 * Requirements: 8+ chars, uppercase, lowercase, number, special char
 * @returns { isValid: boolean, message?: string }
 */
const validatePasswordStrength = (password: string): { isValid: boolean; message?: string } => {
  const minLength = 8;
  const maxLength = 72;
  
  if (password.length < minLength || password.length > maxLength) {
    return { 
      isValid: false, 
      message: `Password must be between ${minLength} and ${maxLength} characters` 
    };
  }

  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (!hasUppercase) {
    return { isValid: false, message: 'Password must contain at least one uppercase letter'};
  }
  if (!hasLowercase) {
    return { isValid: false, message: 'Password must contain at least one lowercase letter'};
  }
  if (!hasNumber) {
    return { isValid: false, message: 'Password must contain at least one number'};
  }
  if (!hasSpecialChar) {
    return { isValid: false, message: 'Password must contain at least one special character (!@#$%^&*)'};
  }

  return { isValid: true };
};

/**
 * Check if password matches last N passwords
 * @param userId - User ID
 * @param newPassword - New password to check
 * @param lastN - Number of previous passwords to check (default 3)
 * @returns { matches: boolean; passwordAgeInDays?: number }
 */
const checkPasswordHistory = async (userId: number, newPassword: string, lastN = 3): Promise<{ matches: boolean; passwordAgeInDays?: number }> => {
  try {
    const result = await query(
      `SELECT id, password_hash, created_at FROM password_history 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, lastN]
    );

    for (const record of result.rows) {
      const passwordMatches = await bcrypt.compare(newPassword, record.password_hash);
      if (passwordMatches) {
        const ageInDays = Math.floor((Date.now() - new Date(record.created_at).getTime()) / (1000 * 60 * 60 * 24));
        return { matches: true, passwordAgeInDays: ageInDays };
      }
    }

    return { matches: false };
  } catch (error) {
    logger.error('Error checking password history:', error);
    // Don't fail the request if password history check fails
    return { matches: false };
  }
};

/**
 * Save old password to history
 */
const savePasswordToHistory = async (userId: number, oldPasswordHash: string): Promise<void> => {
  try {
    await query(
      `INSERT INTO password_history (user_id, password_hash, created_at) 
       VALUES ($1, $2, NOW())`,
      [userId, oldPasswordHash]
    );
    
    // Keep only last 10 passwords
    await query(
      `DELETE FROM password_history 
       WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10
       )`,
      [userId]
    );
  } catch (error) {
    logger.error('Error saving password to history:', error);
  }
};

/**
 * Terminate all active sessions for a user (on password reset)
 */
const terminateAllSessions = async (userId: number, excludeToken?: string): Promise<void> => {
  try {
    await query(
      `UPDATE sessions SET expires_at = NOW(), is_active = false 
       WHERE user_id = $1 AND expires_at > NOW()`,
      [userId]
    );
  } catch (error) {
    logger.error('Error terminating sessions:', error);
  }
};

// Database-specific User type that matches actual schema
type DatabaseUser = User & {
  password_hash?: string; // Keep for auth operations
};

interface RegisterRequest extends Request {
  body: {
    email: string;
    password: string;
    userType: User['user_type'];
    firstName: string;
    lastName: string;
    companyId?: number;
    // Candidate-only fields   sent as multipart/form-data, so all arrive as strings.
    gender?: string;
    dateOfBirth?: string;
    phone?: string;
    isRwandan?: string;
    province?: string;
    district?: string;
    sector?: string;
    cell?: string;
    village?: string;
    country?: string;
    city?: string;
    documentType?: DocumentType;
    documentNumber?: string;
  };
}

type IdentityDocumentFiles = {
  documentFront?: Express.Multer.File[];
  documentBack?: Express.Multer.File[];
};

interface LoginRequest extends Request {
  body: {
    email: string;
    password: string;
    rememberMe?: boolean;
    companyId?: string;
    userType?: string;
  };
}

interface ForgotPasswordRequest extends Request {
  body: {
    email: string;
  };
}

interface ResetPasswordRequest extends Request {
  body: {
    token: string;
    password: string;
  };
}

interface VerifyEmailRequest extends Request {
  body: {
    token: string;
  };
}

interface UpdateProfileRequest extends AuthenticatedRequest {
  body: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    bio?: string;
  };
}

// Generate JWT token
const generateToken = (user: any): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  return jwt.sign(
    { 
      id: user.id,
      email: user.email,
      user_type: user.user_type
    }, 
    secret, 
    {
      expiresIn: process.env.JWT_EXPIRE || '30d',
      issuer: 'recruitment-platform',
      audience: 'recruitment-users',
      jwtid: crypto.randomUUID() // unique per token → avoids sessions_token_key collision on same-second logins
    } as jwt.SignOptions
  );
};

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
const register = async (req: RegisterRequest, res: Response): Promise<void> => {
  const client = await getClient();
  const files = req.files as IdentityDocumentFiles | undefined;

  // Files land in a shared staging dir (no user id exists yet)   tracked here
  // so every early-return/catch path can clean them up and avoid orphans.
  const stagedFiles = [
    files?.documentFront?.[0],
    files?.documentBack?.[0]
  ].filter((f): f is Express.Multer.File => Boolean(f));
  const cleanupStagedFiles = (): void => {
    stagedFiles.forEach(f => deleteStagedFile(f.path));
  };

  try {
    await client.query('BEGIN');

    const { email, password, userType, firstName, lastName, companyId } = req.body;

    // Check if this specific role already exists for this email - the same
    // email can have a separate account per role (e.g. candidate + recruiter).
    const userExists = await client.query(
      'SELECT id FROM users WHERE email = $1 AND user_type = $2',
      [email, userType]
    );

    if (userExists.rows.length > 0) {
      await client.query('ROLLBACK');
      cleanupStagedFiles();
      res.status(400).json({
        success: false,
        message: 'An account with this email already exists for this role'
      });
      return;
    }

    // ============ CANDIDATE-ONLY VALIDATION ============
    // (field presence/format already checked by express-validator in
    // auth.routes.ts; this covers cross-field/DB-dependent checks that
    // can't be expressed as a simple validator chain.)
    let candidateData: {
      gender: string;
      dateOfBirth: string;
      phone: string;
      isRwandan: boolean;
      province: string | null;
      district: string | null;
      sector: string | null;
      cell: string | null;
      village: string | null;
      country: string;
      city: string | null;
      documentType: DocumentType;
      documentNumber: string;
    } | null = null;

    if (userType === 'candidate') {
      const {
        gender, dateOfBirth, phone, isRwandan: isRwandanRaw,
        province, district, sector, cell, village,
        country: countryInput, city: cityInput,
        documentType, documentNumber
      } = req.body;
      const isRwandan = isRwandanRaw === 'true';

      // Duplicate phone check
      const phoneExists = await client.query(
        'SELECT user_id FROM candidate_profiles WHERE phone = $1',
        [phone]
      );
      if (phoneExists.rows.length > 0) {
        await client.query('ROLLBACK');
        cleanupStagedFiles();
        res.status(400).json({ success: false, message: 'Phone number already in use'});
        return;
      }

      let country: string;
      let city: string | null;
      if (isRwandan) {
        const validChain = await isValidRwandaLocationChain({
          province: province || '', district: district || '', sector: sector || '',
          cell: cell || '', village: village || ''
        });
        if (!validChain) {
          await client.query('ROLLBACK');
          cleanupStagedFiles();
          res.status(400).json({ success: false, message: 'Invalid Rwanda location combination'});
          return;
        }
        country = 'Rwanda';
        city = null;
      } else {
        country = countryInput!;
        city = cityInput!;
      }

      // Identity document required for every candidate
      const frontFile = files?.documentFront?.[0];
      if (!frontFile) {
        await client.query('ROLLBACK');
        cleanupStagedFiles();
        res.status(400).json({ success: false, message: 'Identity document upload is required'});
        return;
      }

      const docValidation = validateIdentityDocument(country, documentType!, documentNumber!, dateOfBirth);
      if (!docValidation.valid) {
        await client.query('ROLLBACK');
        cleanupStagedFiles();
        res.status(400).json({ success: false, message: docValidation.error });
        return;
      }
      if (docValidation.warning) {
        logger.warn(`Identity document warning for ${email}: ${docValidation.warning}`);
      }

      if (await isDuplicateDocument(documentType!, documentNumber!)) {
        await client.query('ROLLBACK');
        cleanupStagedFiles();
        const label = documentType === 'national_id'? 'National ID': 'Passport';
        res.status(400).json({ success: false, message: `${label} already exists` });
        return;
      }

      candidateData = {
        gender: gender!, dateOfBirth: dateOfBirth!, phone: phone!, isRwandan,
        province: isRwandan ? province! : null,
        district: isRwandan ? district! : null,
        sector: isRwandan ? sector! : null,
        cell: isRwandan ? cell! : null,
        village: isRwandan ? village! : null,
        country, city,
        documentType: documentType!, documentNumber: documentNumber!
      };
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, user_type, verification_token, token_expiry, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, email, user_type, status`,
      [email, hashedPassword, userType, verificationToken, tokenExpiry]
    );

    const user = userResult.rows[0];

    // Create profile based on user type
    if (userType === 'candidate'&& candidateData) {
      await client.query(
        `INSERT INTO candidate_profiles (
           user_id, first_name, last_name, phone, gender, date_of_birth,
           is_rwandan, country, city, province, district, sector, cell, village,
           profile_completion, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 10, NOW(), NOW())`,
        [
          user.id, firstName, lastName, candidateData.phone, candidateData.gender, candidateData.dateOfBirth,
          candidateData.isRwandan, candidateData.country, candidateData.city,
          candidateData.province, candidateData.district, candidateData.sector,
          candidateData.cell, candidateData.village
        ]
      );

      const frontFile = files!.documentFront![0]!;
      const backFile = files?.documentBack?.[0];
      const frontKey = finalizeIdentityDocumentFile(frontFile.path, user.id, 'front');
      const backKey = backFile ? finalizeIdentityDocumentFile(backFile.path, user.id, 'back') : null;

      await client.query(
        `INSERT INTO candidate_documents (candidate_id, document_type, document_number, document_front, document_back)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, candidateData.documentType, candidateData.documentNumber, frontKey, backKey]
      );
    } else if (userType === 'recruiter'|| userType === 'company_admin') {
      if (!companyId) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: 'Company ID is required for recruiters and company admins'
        });
        return;
      }

      // Verify company exists
      const companyExists = await client.query(
        'SELECT id FROM companies WHERE id = $1',
        [companyId]
      );

      if (companyExists.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: 'Invalid company ID'
        });
        return;
      }

      await client.query(
        `INSERT INTO company_team (company_id, user_id, role, first_name, last_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [companyId, user.id, userType, firstName, lastName]
      );
    }

    await client.query('COMMIT');

    if (userType === 'candidate') {
      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'candidate_profiles',
        operation: 'insert',
        candidate_id: user.id,
        entity_id: user.id,
        payload: {
          user_type: userType,
          first_name: firstName,
          last_name: lastName,
          profile_completion: 10,
        },
        source: 'backend',
      });
    }

    // Send verification email (async, don't wait)
    try {
      await sendEmail({
        to: email,
        subject: 'Verify Your Email - Recruitment Platform',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb; text-align: center;">Welcome to Recruitment Platform!</h1>
            <p>Hi ${firstName},</p>
            <p>Thank you for registering! Please verify your email address to complete your registration and start using the platform.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}" 
                 style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Verify Email
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">Or copy this link:</p>
            <p style="color: #2563eb; word-break: break-all; font-size: 12px;">${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}</p>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              <strong>⏰ This link expires in 24 hours</strong>
            </p>
            <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
              If you didn't create this account, please ignore this email.
            </p>
          </div>
        `,
        text: `Welcome to Recruitment Platform!

Hi ${firstName},

Verify your email to complete registration:
${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}

This link expires in 24 hours.`
      });
    } catch (emailError) {
      logger.error('Email sending failed:', emailError);
    }

    // Generate token
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      data: {
        user,
        token
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    // No-ops for any file already moved out of staging by finalizeIdentityDocumentFile.
    cleanupStagedFiles();
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  } finally {
    client.release();
  }
};

// @desc    Login user with email/password
// @route   POST /api/v1/auth/login
// @access  Public
const login = async (req: LoginRequest, res: Response): Promise<void> => {
  try {
    const { email, password, rememberMe = false, companyId, userType } = req.body;
    const LOCKOUT_MINUTES = 15;
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCKOUT_MS = LOCKOUT_MINUTES * 60 * 1000;

    // The same email can have a separate account per role (e.g. one person who
    // is both a candidate and a recruiter) - get user with candidate profile if applicable
    const userResult = await query(
      `SELECT
        u.id,
        u.email,
        u.password_hash,
        u.user_type,
        u.status,
        u.login_attempts,
        u.locked_until,
        u.last_login_at,
        cp.first_name,
        cp.last_name
      FROM users u
      LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
      WHERE LOWER(u.email) = LOWER($1) ${userType ? 'AND u.user_type = $2': ''}
      ORDER BY u.created_at ASC`,
      userType ? [email, userType] : [email]
    );

    if (userResult.rows.length === 0) {
      logger.warn(`Login attempt with non-existent email: ${email}`);
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
      return;
    }

    let user = userResult.rows[0];

    // Ambiguous: more than one role registered under this email and the
    // caller hasn't told us which one. Try the password against each -
    // usually only one matches (different roles commonly have different
    // passwords), so most multi-role users never see a picker at all.
    if (userResult.rows.length > 1) {
      const matches = [];
      for (const row of userResult.rows) {
        // eslint-disable-next-line no-await-in-loop
        if (await bcrypt.compare(password, row.password_hash)) matches.push(row);
      }

      if (matches.length === 0) {
        logger.warn(`Failed login attempt for ${email} (multi-role, no password match)`);
        res.status(401).json({
          success: false,
          message: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS'
        });
        return;
      }

      if (matches.length > 1) {
        res.json({
          success: true,
          requiresRoleSelection: true,
          roles: matches.map((m: any) => ({ userType: m.user_type })),
          message: 'Select which account to log in as',
        });
        return;
      }

      user = matches[0];
    }

    // Check if account is locked
    if (user.locked_until) {
      const now = new Date();
      if (new Date(user.locked_until) > now) {
        const minutesRemaining = Math.ceil((new Date(user.locked_until).getTime() - now.getTime()) / 60000);
        logger.warn(`Login attempt on locked account: ${email}`);
        res.status(401).json({
          success: false,
          message: `Account is locked. Try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's': ''}.`,
          code: 'ACCOUNT_LOCKED',
          minutesRemaining
        });
        return;
      } else {
        await query(
          'UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = $1',
          [user.id]
        );
        user.login_attempts = 0;
        user.locked_until = null;
      }
    }

    if (user.status === 'unverified') {
      logger.warn(`Login attempt on unverified account: ${email}`);
      res.status(401).json({
        success: false,
        message: 'Account is not verified. Please verify your email first.',
        code: 'ACCOUNT_UNVERIFIED'
      });
      return;
    }

    if (user.status === 'suspended'|| user.status === 'deleted') {
      logger.warn(`Login attempt on ${user.status} account: ${email}`);
      res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact support.',
        code: 'ACCOUNT_INACTIVE'
      });
      return;
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordMatch) {
      const newAttempts = user.login_attempts + 1;
      let updateQuery = 'UPDATE users SET login_attempts = $1 WHERE id = $2';
      let updateParams: any[] = [newAttempts, user.id];

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        updateQuery += ', locked_until = $3';
        updateParams.push(new Date(Date.now() + LOCKOUT_MS));
      }

      await query(updateQuery, updateParams);

      const attemptsRemaining = MAX_LOGIN_ATTEMPTS - newAttempts;
      logger.warn(`Failed login attempt for ${email}. Attempts: ${newAttempts}`);

      res.status(401).json({
        success: false,
        message: attemptsRemaining > 0 
          ? `Incorrect password. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's': ''} remaining.`
          : `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
        code: 'INVALID_PASSWORD',
        attemptsRemaining: Math.max(0, attemptsRemaining)
      });
      return;
    }

    await query(
      'UPDATE users SET login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    // ── Resolve company for recruiter/company_admin before issuing a token ──
    // A user can be on more than one company's team (e.g. a recruiter working
    // with two companies). If ambiguous and no companyId was supplied, stop
    // here and ask the client to pick one instead of silently guessing.
    let companyData: any = null;
    if (user.user_type === 'recruiter'|| user.user_type === 'company_admin') {
      const companiesResult = await query(
        `SELECT c.id, c.name, c.slug, c.logo_url, c.industry, c.size, c.verification_status, ct.is_default
         FROM companies c
         JOIN company_team ct ON c.id = ct.company_id
         WHERE ct.user_id = $1
         ORDER BY ct.is_default DESC, ct.created_at ASC`,
        [user.id]
      );

      if (companiesResult.rows.length > 1 && !companyId) {
        res.json({
          success: true,
          requiresCompanySelection: true,
          companies: companiesResult.rows.map((c: any) => ({ id: c.id, name: c.name, logoUrl: c.logo_url })),
          message: 'Select which company to log in as',
        });
        return;
      }

      if (companiesResult.rows.length > 0) {
        const chosen = companyId
          ? companiesResult.rows.find((c: any) => c.id === companyId)
          : companiesResult.rows[0];

        if (!chosen) {
          res.status(400).json({ success: false, message: 'Invalid company selection'});
          return;
        }

        companyData = chosen;
        if (!chosen.is_default) {
          await query('UPDATE company_team SET is_default = false WHERE user_id = $1', [user.id]);
          await query('UPDATE company_team SET is_default = true WHERE user_id = $1 AND company_id = $2', [user.id, chosen.id]);
        }
        logger.info(`Company data found for user ${user.email}: ${companyData.name}`);
      } else {
        logger.warn(`No company found for recruiter/admin: ${user.email}`);
      }
    }

    let tokenExpiry = process.env.JWT_EXPIRE || '24h';
    if (rememberMe) {
      tokenExpiry = '30d';
    }

    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        user_type: user.user_type,
        rememberMe 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      {
        expiresIn: tokenExpiry,
        issuer: 'recruitment-platform',
        audience: 'recruitment-users',
        jwtid: crypto.randomUUID() // unique per token → avoids sessions_token_key collision on same-second logins
      } as jwt.SignOptions
    );

    const tokenExpiryDate = new Date();
    if (rememberMe) {
      tokenExpiryDate.setDate(tokenExpiryDate.getDate() + 30);
    } else {
      tokenExpiryDate.setHours(tokenExpiryDate.getHours() + 24);
    }

    await query(
      `INSERT INTO sessions (user_id, token, device_info, ip_address, location, expires_at, is_current, is_remember_me)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        user.id,
        token,
        { userAgent: req.get('User-Agent') || 'unknown', platform: 'web'},
        req.ip || 'unknown',
        { country: 'Unknown', city: 'Unknown'},
        tokenExpiryDate,
        true,
        rememberMe
      ]
    );

    await query(
      `INSERT INTO login_history (user_id, ip_address, user_agent, status, login_at) 
       VALUES ($1, $2, $3, $4, NOW())`,
      [user.id, req.ip || 'unknown', req.get('User-Agent') || 'unknown', 'success']
    );

    logger.info(`Successful login for user: ${email}`);

    // ''''''UPDATE THE RESPONSE TO INCLUDE COMPANY DATA
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          userType: user.user_type,
          user_type: user.user_type,
          status: user.status,
          lastLoginAt: user.last_login_at,
          // ''ADD COMPANY DATA TO USER OBJECT
          companyId: companyData?.id || null,
          companyName: companyData?.name || null,
          company: companyData
        },
        token,
        rememberMe
      },
      message: 'Login successful'
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      code: 'LOGIN_ERROR'
    });
  }
};

// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
const logout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (token) {
      // Expire the specific session
      await query(
        'UPDATE sessions SET expires_at = NOW() WHERE token = $1',
        [token]
      );
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh
// @access  Public
const refreshToken = async (req: Request, res: Response): Promise<void> => {
  // Implementation for refresh tokens would go here
  res.status(501).json({
    success: false,
    message: 'Refresh token functionality not implemented yet'
  });
};

// @desc    Forgot password
// @route   POST /api/v1/auth/forgot-password
// @access  Public
// @desc    Forgot password - Send reset email
// @route   POST /api/v1/auth/forgot-password
// @access  Public
// @rateLimit 10 requests per hour per email
const forgotPassword = async (req: ForgotPasswordRequest, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        message: 'Invalid email format',
        code: 'INVALID_EMAIL'
      });
      return;
    }

    const userResult = await query(
      'SELECT id, email, status FROM users WHERE email = $1',
      [email]
    );

    // Check rate limit: max 10 requests per hour
    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].id;
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const recentRequests = await query(
        `SELECT COUNT(*) as count FROM password_resets 
         WHERE user_id = $1 AND created_at > $2`,
        [userId, oneHourAgo]
      );

      if (parseInt(recentRequests.rows[0].count) >= 10) {
        res.status(429).json({
          success: false,
          message: 'Too many password reset requests. Try again in 1 hour.',
          code: 'RATE_LIMIT_EXCEEDED'
        });
        return;
      }
    }

    // Always return success message for security (don't reveal if email exists)
    if (userResult.rows.length === 0) {
      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
      return;
    }

    const user = userResult.rows[0];

    // Check account status
    if (user.status !== 'active'&& user.status !== 'unverified'&& user.status !== 'verified') {
      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
      return;
    }

    // Generate reset token (use 32 bytes for security)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await query(
      `INSERT INTO password_resets (user_id, token, expires_at, created_at) 
       VALUES ($1, $2, $3, NOW())`,
      [user.id, resetToken, resetExpires]
    );

    // Send password reset email
    try {
      logger.info(`Attempting to send password reset email to ${email} for user ${user.id}`);
      await sendEmail({
        to: email,
        subject: 'Reset Your Password - Recruitment Platform',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb; text-align: center;">Reset Your Password</h1>
            <p>Hi ${user.first_name || 'User'},</p>
            <p>We received a request to reset your password. Click the button below to create a new password.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}" 
                 style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">Or copy this link:</p>
            <p style="color: #2563eb; word-break: break-all; font-size: 12px;">${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}</p>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              <strong>⏰ This link expires in 1 hour</strong>
            </p>
            <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
              If you didn't request a password reset, please ignore this email or contact support at ${process.env.SUPPORT_EMAIL || process.env.EMAIL_REPLY_TO || process.env.SMTP_USER || 'notify@lmbtech.rw'}
            </p>
          </div>
        `,
        text: `Reset Your Password
        
Hi ${user.first_name || 'User'},

Click this link to reset your password:
${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}

This link expires in 1 hour.

If you didn't request this, please ignore this email.`
      });
      logger.info(`Password reset email sent successfully to ${email}`);
    } catch (emailError) {
      logger.error('Failed to send password reset email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });

  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password reset request failed',
      code: 'RESET_REQUEST_ERROR'
    });
  }
};

// @desc    Reset password
// @desc    Reset password
// @route   POST /api/v1/auth/reset-password
// @access  Public
const resetPassword = async (req: ResetPasswordRequest, res: Response): Promise<void> => {
  const client = await getClient();

  try {
    const { token, password } = req.body;

    // Validate password strength
    const strengthCheck = validatePasswordStrength(password);
    if (!strengthCheck.isValid) {
      res.status(400).json({
        success: false,
        message: strengthCheck.message,
        code: 'WEAK_PASSWORD'
      });
      return;
    }

    // Check if reset token is valid and not expired
    const resetRecord = await query(
      `SELECT user_id FROM password_resets 
       WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL`,
      [token]
    );

    if (resetRecord.rows.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset link. Please request a new one.',
        code: 'INVALID_RESET_TOKEN'
      });
      return;
    }

    const userId = resetRecord.rows[0].user_id;

    // Get current user and password
    const userResult = await query(
      `SELECT u.id, u.email, u.password_hash, COALESCE(cp.first_name, '') as first_name 
       FROM users u 
       LEFT JOIN candidate_profiles cp ON u.id = cp.user_id 
       WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(400).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    const user = userResult.rows[0];

    // Check password history (cannot reuse last 3 passwords)
    const historyCheck = await checkPasswordHistory(userId, password, 3);
    if (historyCheck.matches) {
      res.status(400).json({
        success: false,
        message: `You cannot use a password you've used within the last 3 password changes. (Last used ${historyCheck.passwordAgeInDays} days ago)`,
        code: 'PASSWORD_REUSED'
      });
      return;
    }

    // Check if new password is same as current password
    const sameAsCurrentPassword = await bcrypt.compare(password, user.password_hash);
    if (sameAsCurrentPassword) {
      res.status(400).json({
        success: false,
        message: 'New password cannot be the same as your current password',
        code: 'PASSWORD_UNCHANGED'
      });
      return;
    }

    try {
      await client.query('BEGIN');

      // Save old password to history
      await savePasswordToHistory(userId, user.password_hash);

      // Hash new password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Update password
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [hashedPassword, userId]
      );

      // Mark token as used
      await client.query(
        `UPDATE password_resets SET used_at = NOW() WHERE token = $1`,
        [token]
      );

      // Terminate all active sessions (security: forces re-login on all devices)
      await terminateAllSessions(userId);

      // Reset login attempts counter
      await client.query(
        `UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = $1`,
        [userId]
      );

      await client.query('COMMIT');

      logger.info(`Password reset successfully for user ${userId}`);

      // Send security alert email
      try {
        await sendEmail({
          to: user.email,
          subject: 'Password Changed - Recruitment Platform',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #2563eb; text-align: center;">Password Changed </h1>
              <p>Hi ${user.first_name || 'User'},</p>
              <p>Your password has been successfully changed.</p>
              <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #166534;">
                  <strong> Password updated:</strong> ${new Date().toLocaleString()}
                </p>
              </div>
              <p style="color: #666; font-size: 14px; margin-top: 20px;">
                You'll need to log in again on all devices with your new password.
              </p>
              <p style="color: #dc2626; font-size: 14px; margin-top: 20px;">
                <strong>Didn't do this?</strong>
              </p>
              <p style="color: #666; font-size: 14px;">
                If you didn't change your password, please contact our support team immediately at ${process.env.SUPPORT_EMAIL || 'support@recruitment-platform.com'} or reply to this email.
              </p>
              <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                For security, never share your password with anyone. Our team will never ask for your password.
              </p>
            </div>
          `,
          text: `Password Changed Confirmation

Hi ${user.first_name || 'User'},

Your password has been successfully changed at ${new Date().toLocaleString()}.

You'll need to log in again on all devices with your new password.

If you didn't do this, contact support immediately at ${process.env.SUPPORT_EMAIL || 'support@recruitment-platform.com'}`
        });
      } catch (emailError) {
        logger.error('Failed to send password change alert:', emailError);
      }

      res.json({
        success: true,
        message: 'Password reset successfully. Please log in with your new password.',
        code: 'RESET_SUCCESS'
      });

    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    }

  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password reset failed. Please try again.',
      code: 'RESET_ERROR'
    });
  } finally {
    client.release();
  }
};

// @desc    Validate reset token
// @route   POST /api/v1/auth/validate-reset-token
// @access  Public
const validateResetToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Token is required',
        code: 'NO_TOKEN'
      });
      return;
    }

    const resetRecord = await query(
      `SELECT pr.user_id, pr.expires_at, pr.used_at, u.email 
       FROM password_resets pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.token = $1`,
      [token]
    );

    if (resetRecord.rows.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid reset token',
        code: 'INVALID_TOKEN'
      });
      return;
    }

    const record = resetRecord.rows[0];

    // Check if token is used
    if (record.used_at) {
      res.status(400).json({
        success: false,
        message: 'This password reset link has already been used. Please request a new one.',
        code: 'TOKEN_ALREADY_USED'
      });
      return;
    }

    // Check if token is expired
    if (new Date(record.expires_at) < new Date()) {
      res.status(400).json({
        success: false,
        message: 'Password reset link has expired. Please request a new one.',
        code: 'TOKEN_EXPIRED'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Reset token is valid',
      email: record.email
    });

  } catch (error) {
    logger.error('Token validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate token',
      code: 'VALIDATION_ERROR'
    });
  }
};

// @desc    Verify email
// @route   POST /api/v1/auth/verify-email
// @access  Public
const verifyEmail = async (req: VerifyEmailRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    const result = await query(
      'UPDATE users SET status = $1, verification_token = NULL, updated_at = NOW() WHERE verification_token = $2 RETURNING id',
      ['active', token]
    );

    if (result.rows.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid verification token'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    logger.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Email verification failed'
    });
  }
};

// @desc    Health check
// @route   GET /api/v1/auth/health
// @access  Public
const healthCheck = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
};

// @desc    Get current user
// @route   GET /api/v1/auth/me
// @access  Private
const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    let userQuery = `
      SELECT u.id, u.email, u.user_type, u.status, u.created_at
    `;
    let joinClause = '';
    let selectFields = '';

    if (req.user.user_type === 'candidate') {
      joinClause = 'LEFT JOIN candidate_profiles cp ON u.id = cp.user_id';
      selectFields = ', cp.first_name, cp.last_name';
    } else if (req.user.user_type === 'recruiter'|| req.user.user_type === 'company_admin') {
      joinClause = 'LEFT JOIN company_team ct ON u.id = ct.user_id';
      selectFields = ', ct.first_name, ct.last_name';
    }

    userQuery += ` ${joinClause} FROM users u WHERE u.id = $1`;

    const user = await query(userQuery + selectFields, [req.user.id]);

    if (user.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    const userData = user.rows[0];
    userData.firstName = userData.first_name || userData.firstName;
    userData.lastName = userData.last_name || userData.lastName;
    userData.userType = userData.user_type;

    // ''ADD COMPANY DATA FOR RECRUITERS/ADMINS
    if (userData.user_type === 'recruiter'|| userData.user_type === 'company_admin') {
      const companyResult = await query(
        `SELECT c.id, c.name, c.slug, c.logo_url, c.industry, c.size
         FROM companies c
         JOIN company_team ct ON c.id = ct.company_id
         WHERE ct.user_id = $1
         LIMIT 1`,
        [req.user.id]
      );
      
      if (companyResult.rows.length > 0) {
        userData.companyId = companyResult.rows[0].id;
        userData.companyName = companyResult.rows[0].name;
        userData.company = companyResult.rows[0];
      }
    }

    res.json({
      success: true,
      data: userData
    });
  } catch (error) {
    logger.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user data'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/v1/auth/profile
// @access  Private
const updateProfile = async (req: UpdateProfileRequest, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, phone, bio } = req.body;

    // Update based on user type
    if (req.user.user_type === 'candidate') {
      await query(
        `UPDATE candidate_profiles 
         SET first_name = $1, last_name = $2, phone = $3, bio = $4, updated_at = NOW() 
         WHERE user_id = $5`,
        [firstName, lastName, phone, bio, req.user.id]
      );
    } else if (req.user.user_type === 'recruiter'|| req.user.user_type === 'company_admin') {
      // For company_team table, we need to combine first_name and last_name into a single 'name'field
      const fullName = `${firstName || ''} ${lastName || ''}`.trim();
      
      await query(
        `UPDATE company_team 
         SET name = $1, phone = $2, bio = $3, updated_at = NOW() 
         WHERE user_id = $4`,
        [fullName, phone, bio, req.user.id]
      );
    }

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Profile update failed'
    });
  }
};

// @desc    Enable two-factor authentication
// @route   POST /api/v1/auth/2fa/enable
// @access  Private
const enableTwoFactor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Generate TOTP secret (placeholder - in real implementation, use speakeasy or similar)
    const secret = crypto.randomBytes(32).toString('hex');

    // Update user with 2FA secret
    await query(
      'UPDATE users SET two_factor_enabled = $1, two_factor_secret = $2, updated_at = NOW() WHERE id = $3',
      [true, secret, req.user.id]
    );

    // In a real implementation, you'd generate a QR code here
    res.json({
      success: true,
      message: 'Two-factor authentication enabled',
      data: {
        secret: secret,
        qrCodeUrl: `otpauth://totp/RecruitmentPlatform:${req.user.email}?secret=${secret}&issuer=RecruitmentPlatform`
      }
    });
  } catch (error) {
    logger.error('Enable 2FA error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enable two-factor authentication'
    });
  }
};

// @desc    Log out from all devices
// @route   POST /api/v1/auth/logout-all
// @access  Private
const logoutAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { password } = req.body;

    // Verify password
    const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, userResult.rows[0].password_hash);
    if (!isValidPassword) {
      res.status(400).json({
        success: false,
        message: 'Incorrect password',
        code: 'INVALID_PASSWORD'
      });
      return;
    }

    // Get current session token from request
    const currentToken = req.headers.authorization?.replace('Bearer ', '');

    // Expire all active sessions except current one
    const expireResult = await query(
      'UPDATE sessions SET expires_at = NOW() WHERE user_id = $1 AND expires_at > NOW() AND token != $2',
      [req.user.id, currentToken]
    );

    const terminatedCount = expireResult.rowCount || 0;

    // Log security event
    await query(
      'INSERT INTO security_alerts (user_id, alert_type, severity, title, description) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'logout_all', 'medium', 'Logged out from all devices', `User initiated logout from ${terminatedCount} devices`]
    );

    // Send email notification
    try {
      await sendEmail({
        to: req.user.email,
        subject: 'Security Alert: Logged out from all devices',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Security Alert</h2>
            <p>You have successfully logged out from all your devices.</p>
            <p><strong>Devices terminated:</strong> ${terminatedCount}</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>IP Address:</strong> ${req.ip}</p>
            <p>If this wasn't you, please contact support immediately and change your password.</p>
            <hr style="margin: 20px 0;">
            <p style="color: #6b7280; font-size: 14px;">
              This is an automated security notification. Please do not reply to this email.
            </p>
          </div>
        `
      });
    } catch (emailError) {
      logger.error('Failed to send logout notification email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: `Logged out from ${terminatedCount} device${terminatedCount !== 1 ? 's': ''} successfully`,
      terminatedCount
    });
  } catch (error) {
    logger.error('Logout all error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to logout from all devices'
    });
  }
};

// @desc    Get active sessions for current user
// @route   GET /api/v1/auth/sessions
// @access  Private
const getActiveSessions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const sessionsResult = await query(
      `SELECT
        id,
        device_info,
        ip_address,
        location,
        created_at,
        last_activity_at,
        is_current,
        is_remember_me,
        CASE
          WHEN is_current THEN 'Current Session'
          ELSE 'Active'
        END as status
       FROM sessions
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      sessions: sessionsResult.rows,
      total: sessionsResult.rows.length
    });
  } catch (error) {
    logger.error('Get active sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve active sessions'
    });
  }
};

// @desc    View login history
// @route   GET /api/v1/auth/login-history
// @access  Private
const getLoginHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Date range filtering
    const dateRange = req.query.dateRange as string || 'all';
    let dateFilter = '';
    let dateParams: any[] = [];

    if (dateRange === '7days') {
      dateFilter = 'AND login_at >= NOW() - INTERVAL \'7 days\'';
    } else if (dateRange === '30days') {
      dateFilter = 'AND login_at >= NOW() - INTERVAL \'30 days\'';
    } else if (dateRange === '90days') {
      dateFilter = 'AND login_at >= NOW() - INTERVAL \'90 days\'';
    } else if (dateRange === 'custom'&& req.query.startDate && req.query.endDate) {
      dateFilter = 'AND login_at >= $1 AND login_at <= $2';
      dateParams = [req.query.startDate, req.query.endDate];
    }

    // Status filtering
    const status = req.query.status as string;
    let statusFilter = '';
    if (status && ['success', 'failed'].includes(status)) {
      statusFilter = 'AND status = $'+ (dateParams.length + 1);
      dateParams.push(status);
    }

    const historyResult = await query(
      `SELECT
        id,
        login_at,
        ip_address,
        user_agent,
        device_type,
        device_model,
        os,
        browser,
        location,
        status,
        failure_reason,
        CASE
          WHEN status = 'success'THEN 'success'
          WHEN status = 'failed'THEN 'failed'
          ELSE 'unknown'
        END as status_type
       FROM login_history
       WHERE user_id = $${dateParams.length + 1} ${dateFilter} ${statusFilter}
       ORDER BY login_at DESC
       LIMIT $${dateParams.length + 2}
       OFFSET $${dateParams.length + 3}`,
      [...dateParams, req.user.id, limit, offset]
    );

    const totalResult = await query(
      `SELECT COUNT(*) as total FROM login_history WHERE user_id = $1 ${dateFilter} ${statusFilter}`,
      [req.user.id, ...dateParams]
    );

    // Format the response data
    const formattedHistory = historyResult.rows.map((row: any) => ({
      id: row.id,
      created_at: row.login_at,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      device_type: row.device_type,
      device_model: row.device_model,
      os: row.os,
      browser: row.browser,
      location: row.location ? `${row.location.city || ''}, ${row.location.country || ''}`.replace(/^, |, $/, '') : 'Unknown Location',
      status: row.status,
      failure_reason: row.failure_reason,
      status_type: row.status_type,
      // Additional computed fields
      device_info: `${row.browser || 'Unknown'} on ${row.os || 'Unknown OS'}`,
      location_display: row.location ? `${row.location.city || ''}, ${row.location.country || ''}`.replace(/^, |, $/, '') : 'Unknown Location'
    }));

    res.json({
      success: true,
      data: {
        history: formattedHistory,
        pagination: {
          page,
          limit,
          total: parseInt(totalResult.rows[0].total),
          pages: Math.ceil(parseInt(totalResult.rows[0].total) / limit)
        },
        filters: {
          dateRange,
          status: status || 'all'
        }
      }
    });
  } catch (error) {
    logger.error('Get login history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve login history'
    });
  }
};

// @desc    Export login history to CSV
// @route   GET /api/v1/auth/login-history/export
// @access  Private
const exportLoginHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Date range filtering (same as getLoginHistory)
    const dateRange = req.query.dateRange as string || 'all';
    let dateFilter = '';
    let dateParams: any[] = [];

    if (dateRange === '7days') {
      dateFilter = 'AND login_at >= NOW() - INTERVAL \'7 days\'';
    } else if (dateRange === '30days') {
      dateFilter = 'AND login_at >= NOW() - INTERVAL \'30 days\'';
    } else if (dateRange === '90days') {
      dateFilter = 'AND login_at >= NOW() - INTERVAL \'90 days\'';
    } else if (dateRange === 'custom'&& req.query.startDate && req.query.endDate) {
      dateFilter = 'AND login_at >= $1 AND login_at <= $2';
      dateParams = [req.query.startDate, req.query.endDate];
    }

    // Status filtering
    const status = req.query.status as string;
    let statusFilter = '';
    if (status && ['success', 'failed'].includes(status)) {
      statusFilter = 'AND status = $'+ (dateParams.length + 1);
      dateParams.push(status);
    }

    const historyResult = await query(
      `SELECT
        login_at,
        ip_address,
        device_type,
        device_model,
        os,
        browser,
        location,
        status,
        failure_reason
       FROM login_history
       WHERE user_id = $${dateParams.length + 1} ${dateFilter} ${statusFilter}
       ORDER BY login_at DESC`,
      [...dateParams, req.user.id]
    );

    // Generate CSV content
    const csvHeaders = [
      'Date & Time',
      'IP Address',
      'Device Type',
      'Device Model',
      'Operating System',
      'Browser',
      'Location',
      'Status',
      'Failure Reason'
    ];

    const csvRows = historyResult.rows.map((row: any) => [
      new Date(row.login_at).toISOString(),
      row.ip_address || '',
      row.device_type || '',
      row.device_model || '',
      row.os || '',
      row.browser || '',
      row.location ? `${row.location.city || ''}, ${row.location.country || ''}`.replace(/^, |, $/, '') : '',
      row.status || '',
      row.failure_reason || ''
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    // Set response headers for CSV download
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `login-history-${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

  } catch (error) {
    logger.error('Export login history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export login history'
    });
  }
};

// @desc    Delete user account
// @route   DELETE /api/v1/auth/delete-account
// @access  Private
const deleteAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Soft delete user account
    await client.query(
      'UPDATE users SET status = $1, deleted_at = NOW(), updated_at = NOW() WHERE id = $2',
      ['deleted', req.user.id]
    );

    // Expire all sessions
    await client.query(
      'UPDATE sessions SET expires_at = NOW() WHERE user_id = $1',
      [req.user.id]
    );

    // Log security event
    await client.query(
      'INSERT INTO security_alerts (user_id, alert_type, severity, title, description) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'account_deleted', 'high', 'Account Deleted', 'User initiated account deletion']
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  } finally {
    client.release();
  }
};

// @desc    Complete company registration with admin account creation
// @route   POST /api/v1/auth/company/register-complete
// @access  Public
const registerCompanyComplete = async (req: Request, res: Response): Promise<void> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const {
      // Company information
      companyName,
      industry,
      size,
      website,
      domain,
      // Admin information
      firstName,
      lastName,
      email,
      password,
      phone
    } = req.body;

    // Validate required fields
    if (!companyName || !domain || !firstName || !lastName || !email || !password) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Missing required fields',
        code: 'MISSING_REQUIRED_FIELDS'
      });
      return;
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: passwordValidation.message,
        code: 'INVALID_PASSWORD'
      });
      return;
    }

    // Validate email domain matches company domain
    const emailDomain = email.split('@')[1];
    if (emailDomain !== domain) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Admin email domain must match company domain',
        code: 'DOMAIN_MISMATCH'
      });
      return;
    }

    // Check if company domain already exists
    const existingCompany = await client.query(
      'SELECT id FROM companies WHERE domain = $1',
      [domain]
    );

    let company;
    if (existingCompany.rows.length > 0) {
      // Allow updating existing company instead of rejecting
      const companyId = existingCompany.rows[0].id;

      // Update existing company
      const updateResult = await client.query(
        `UPDATE companies SET
          name = $1, industry = $2, size = $3, website = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING id, name, industry, size, website, domain, verification_status`,
        [companyName, industry, size, website, companyId]
      );

      company = updateResult.rows[0];
    }

    // Check if a company_admin account already exists for this email - the
    // same email may separately have a candidate/recruiter account, which
    // shouldn't be reused here.
    const existingUser = await client.query(
      "SELECT id FROM users WHERE email = $1 AND user_type = 'company_admin'",
      [email]
    );

    let user;
    let verificationToken, verificationCode, tokenExpiry;

    if (existingUser.rows.length > 0) {
      // Use existing user
      user = existingUser.rows[0];
      // Generate new verification token for existing user
      verificationToken = crypto.randomBytes(32).toString('hex');
      verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
      tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      // Update existing user with new verification details
      await client.query(
        'UPDATE users SET verification_token = $1, verification_code = $2, token_expiry = $3, updated_at = NOW() WHERE id = $4',
        [verificationToken, verificationCode, tokenExpiry, user.id]
      );
    } else {
      // Hash password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Generate verification token and code
      verificationToken = crypto.randomBytes(32).toString('hex');
      verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
      tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      // Create new admin user with both token and code
      const userResult = await client.query(
        `INSERT INTO users (
          email, password_hash, user_type, verification_token, verification_code, token_expiry,
          status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, email, user_type, status`,
        [email, hashedPassword, 'company_admin', verificationToken, verificationCode, tokenExpiry, 'unverified']
      );
      user = userResult.rows[0];
    }

    // Create company if it doesn't exist
    if (existingCompany.rows.length === 0) {
      // Create company
      const companyResult = await client.query(
        `INSERT INTO companies (
          name, industry, size, website, domain, verification_status,
          verification_badge, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING id, name, industry, size, website, domain, verification_status`,
        [companyName, industry, size, website, domain, 'pending', false, user.id]
      );

      company = companyResult.rows[0];
    }

    // Check if user is already in company team
    const existingTeamMember = await client.query(
      'SELECT id FROM company_team WHERE company_id = $1 AND user_id = $2',
      [company.id, user.id]
    );

    if (existingTeamMember.rows.length === 0) {
      // Create company team entry for admin if not already exists
      await client.query(
        `INSERT INTO company_team (
          company_id, user_id, name, title, email, phone, role,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [company.id, user.id, `${firstName} ${lastName}`, 'Company Admin', email, phone, 'admin']
      );
    } else {
      // Update existing team member info
      await client.query(
        'UPDATE company_team SET name = $1, phone = $2, updated_at = NOW() WHERE id = $3',
        [`${firstName} ${lastName}`, phone, existingTeamMember.rows[0].id]
      );
    }

    await client.query('COMMIT');

    // Send verification email asynchronously (don't wait for it)
    sendEmail({
      to: email,
      subject: 'Verify Your Email - Complete Company Registration',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb; text-align: center;">Welcome to Recruitment Platform!</h1>
          <h2 style="color: #374151; text-align: center;">${companyName} Registration</h2>
          <p>Hi ${firstName},</p>
          <p>Thank you for registering ${companyName}! Your company account has been created and is pending verification.</p>
          <p>Please verify your email address to complete the registration process and activate your company account.</p>

          <div style="background-color: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <h3 style="color: #0c4a6e; margin-top: 0;">Your Verification Code</h3>
            <div style="font-size: 32px; font-weight: bold; color: #0ea5e9; letter-spacing: 4px; font-family: 'Courier New', monospace;">
              ${verificationCode}
            </div>
            <p style="color: #374151; margin-bottom: 0; font-size: 14px;">Use this code to verify your email address</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}"
               style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              Verify Email & Activate Account
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">Or copy this link:</p>
          <p style="color: #2563eb; word-break: break-all; font-size: 12px;">${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}</p>
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            <strong>⏰ This link expires in 24 hours</strong>
          </p>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #374151; margin-top: 0;">Next Steps:</h3>
            <ol style="color: #4b5563;">
              <li>Verify your email address using the code above or the link</li>
              <li>Complete domain verification for ${domain}</li>
              <li>Set up your company profile and team</li>
              <li>Start posting jobs and finding candidates</li>
            </ol>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            If you didn't create this account, please ignore this email.
          </p>
        </div>
      `,
      text: `Welcome to Recruitment Platform!

${companyName} Registration

Hi ${firstName},

Thank you for registering ${companyName}! Your company account has been created and is pending verification.

Please verify your email address to complete the registration process and activate your company account.

Your Verification Code: ${verificationCode}

Or verify using this link:
${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}

This link expires in 24 hours.

Next Steps:
1. Verify your email address using the code above or the link
2. Complete domain verification for ${domain}
3. Set up your company profile and team
4. Start posting jobs and finding candidates

If you didn't create this account, please ignore this email.`
    }).catch((emailError) => {
      logger.error('Failed to send verification email:', emailError);
      // Email failure doesn't affect registration success
    });

    res.status(201).json({
      success: true,
      data: {
        company: {
          id: company.id,
          name: company.name,
          industry: company.industry,
          size: company.size,
          website: company.website,
          domain: company.domain,
          verification_status: company.verification_status
        },
        user: {
          id: user.id,
          email: user.email,
          user_type: user.user_type,
          status: user.status
        }
      },
      message: 'Company registration initiated successfully. Please check your email to verify your account.',
      code: 'REGISTRATION_PENDING_VERIFICATION'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Complete company registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register company',
      code: 'REGISTRATION_FAILED'
    });
  } finally {
    client.release();
  }
};

// @desc    Register company
// @route   POST /api/v1/auth/company/register
// @access  Private
const registerCompany = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { name, industry, size, website, domain } = req.body;

    // Check if user already has a company
    const existingCompany = await client.query(
      'SELECT id FROM companies WHERE created_by = $1',
      [req.user.id]
    );

    if (existingCompany.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'User already has a company registered'
      });
      return;
    }

    // Create company
    const companyResult = await client.query(
      `INSERT INTO companies (name, industry, size, website, domain, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, name, industry, size, website, domain`,
      [name, industry, size, website, domain, req.user.id]
    );

    const company = companyResult.rows[0];

    // Update user to company_admin
    await client.query(
      'UPDATE users SET user_type = $1, updated_at = NOW() WHERE id = $2',
      ['company_admin', req.user.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: company,
      message: 'Company registered successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Register company error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register company'
    });
  } finally {
    client.release();
  }
};

// @desc    Verify company email domain
// @route   POST /api/v1/auth/company/verify-domain
// @access  Private
const verifyCompanyDomain = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { domain } = req.body;

    // Get user's company
    const companyResult = await query(
      'SELECT id, domain FROM companies WHERE created_by = $1',
      [req.user.id]
    );

    if (companyResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Company not found'
      });
      return;
    }

    const company = companyResult.rows[0];

    // Check if domain matches
    if (company.domain !== domain) {
      res.status(400).json({
        success: false,
        message: 'Domain does not match company domain'
      });
      return;
    }

    // In a real implementation, you'd send a verification email to admin@domain
    // For now, just mark as verified
    await query(
      'UPDATE companies SET verification_status = $1, verified_at = NOW(), updated_at = NOW() WHERE id = $2',
      ['verified', company.id]
    );

    res.json({
      success: true,
      message: 'Domain verification initiated. Please check your email for verification instructions.'
    });
  } catch (error) {
    logger.error('Verify domain error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify domain'
    });
  }
};

// @desc    Invite team members
// @route   POST /api/v1/auth/company/invite
// @access  Private
const inviteTeamMember = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { emails, role, personalMessage, firstName, lastName } = req.body;

    console.log('📨 Invite request received:', {
      userId: req.user?.id,
      userType: req.user?.user_type,
      emails,
      role,
      firstName,
      lastName
    });

    // Validate required fields
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({
        success: false,
        message: 'At least one email address is required'
      });
      return;
    }

    if (!role || !['admin', 'recruiter', 'reviewer', 'viewer'].includes(role)) {
      res.status(400).json({
        success: false,
        message: 'Valid role is required (admin, recruiter, reviewer, or viewer)'
      });
      return;
    }

    // ''FIX: Get user's company through company_team (NOT created_by)
    const companyResult = await client.query(
      `SELECT c.id, c.name, ct.role as user_role
       FROM companies c
       JOIN company_team ct ON c.id = ct.company_id
       WHERE ct.user_id = $1`,
      [req.user!.id]
    );

    console.log('Company lookup result:', companyResult.rows);

    if (companyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: 'Company not found. Please create a company profile first.'
      });
      return;
    }

    const company = companyResult.rows[0];

    // Check if user has admin permission
    if (company.user_role !== 'admin') {
      await client.query('ROLLBACK');
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Only company admins can invite team members.'
      });
      return;
    }

    const results = [];
    const errors = [];

    // Process each email
    for (const email of emails) {
      let trimmedEmail = '';

      try {
        if (!email || typeof email !== 'string'|| email.trim().length === 0) {
          errors.push({ email, error: 'Email is required'});
          continue;
        }

        trimmedEmail = email.trim().toLowerCase();

        // Check if user is already a team member
        const existingMember = await client.query(
          'SELECT id, role FROM company_team WHERE company_id = $1 AND email = $2',
          [company.id, trimmedEmail]
        );

        if (existingMember.rows.length > 0) {
          errors.push({ email: trimmedEmail, error: 'User is already a team member', currentRole: existingMember.rows[0].role });
          continue;
        }

        // Check for pending invitations
        const pendingInvitation = await client.query(
          'SELECT id, status FROM team_invitations WHERE company_id = $1 AND email = $2 AND status = $3',
          [company.id, trimmedEmail, 'pending']
        );

        if (pendingInvitation.rows.length > 0) {
          errors.push({ email: trimmedEmail, error: 'Pending invitation already exists'});
          continue;
        }

        // Generate invitation token
        const invitationToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Create invitation record
        const invitationResult = await client.query(
          `INSERT INTO team_invitations (
            company_id, invited_by, email, role, invitation_token, expires_at,
            first_name, last_name, personal_message
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
          [company.id, req.user!.id, trimmedEmail, role, invitationToken, expiresAt, firstName, lastName, personalMessage]
        );

        // Send invitation email
        try {
          await sendEmail({
            to: trimmedEmail,
            subject: `Invitation to join ${company.name} team`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #2563eb; text-align: center;">You're Invited to Join Our Team!</h1>
                <h2 style="color: #374151; text-align: center;">${company.name}</h2>
                <p>Hi${firstName ? ` ${firstName}` : ''},</p>
                <p>You've been invited to join <strong>${company.name}</strong> as a <strong>${role}</strong>.</p>
                ${personalMessage ? `<p><em>"${personalMessage}"</em></p>` : ''}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invitation?token=${invitationToken}"
                     style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                    Accept Invitation & Register
                  </a>
                </div>
                <p style="color: #666; font-size: 14px;">Or copy this link:</p>
                <p style="color: #2563eb; word-break: break-all; font-size: 12px;">${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invitation?token=${invitationToken}</p>
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 5px; margin: 20px 0;">
                  <h3 style="color: #374151; margin-top: 0;">Your Role: ${role.charAt(0).toUpperCase() + role.slice(1)}</h3>
                  <ul style="color: #4b5563;">
                    ${role === 'admin'? '<li>Full access to company settings and team management</li><li>Post and manage jobs</li><li>Review candidates</li>':
                      role === 'recruiter'? '<li>Post and manage jobs</li><li>Review and manage candidates</li>':
                      role === 'reviewer'? '<li>Review and assess candidates</li><li>Provide feedback on applications</li>':
                      '<li>View company dashboard and candidates</li><li>Read-only access</li>'}
                  </ul>
                </div>
                <p style="color: #666; font-size: 14px; margin-top: 20px;">
                  <strong>⏰ This invitation expires in 7 days</strong>
                </p>
                <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                  If you didn't expect this invitation, you can ignore this email.
                </p>
              </div>
            `,
            text: `You're Invited to Join ${company.name}!

Hi${firstName ? ` ${firstName}` : ''},

You've been invited to join ${company.name} as a ${role}.

${personalMessage ? `"${personalMessage}"` : ''}

Accept the invitation and register here:
${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invitation?token=${invitationToken}

Your Role: ${role.charAt(0).toUpperCase() + role.slice(1)}
${role === 'admin'? '- Full access to company settings and team management\n- Post and manage jobs\n- Review candidates':
  role === 'recruiter'? '- Post and manage jobs\n- Review and manage candidates':
  role === 'reviewer'? '- Review and assess candidates\n- Provide feedback on applications':
  '- View company dashboard and candidates\n- Read-only access'}

This invitation expires in 7 days.`
          });

          results.push({ email: trimmedEmail, status: 'sent', invitationId: invitationResult.rows[0].id });

        } catch (emailError) {
          logger.error('Team invitation email failed:', emailError);
          await client.query('DELETE FROM team_invitations WHERE id = $1', [invitationResult.rows[0].id]);
          errors.push({ email: trimmedEmail, error: 'Failed to send invitation email'});
        }

      } catch (err) {
        errors.push({ email: trimmedEmail, error: 'Failed to process invitation'});
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Invitations processed: ${results.length} sent, ${errors.length} failed`,
      data: {
        sent: results,
        errors: errors
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Invite team member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send invitations'
    });
  } finally {
    client.release();
  }
};

// @desc    Set company password policies
// @route   POST /api/v1/auth/company/password-policy
// @access  Private
const setPasswordPolicy = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { minLength, requireUppercase, requireLowercase, requireNumbers, requireSpecialChars, expiryDays } = req.body;

    // Get user's company
    const companyResult = await query(
      'SELECT id FROM companies WHERE created_by = $1',
      [req.user.id]
    );

    if (companyResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Company not found'
      });
      return;
    }

    const company = companyResult.rows[0];

    // Store password policy (in a real implementation, you'd have a company_settings table)
    // For now, store in company metadata
    const policy = {
      minLength: minLength || 8,
      requireUppercase: requireUppercase || true,
      requireLowercase: requireLowercase || true,
      requireNumbers: requireNumbers || true,
      requireSpecialChars: requireSpecialChars || false,
      expiryDays: expiryDays || 90
    };

    await query(
      'UPDATE companies SET metadata = metadata || $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify({ passwordPolicy: policy }), company.id]
    );

    res.json({
      success: true,
      message: 'Password policy updated successfully',
      data: policy
    });
  } catch (error) {
    logger.error('Set password policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update password policy'
    });
  }
};

// @desc    View active company sessions
// @route   GET /api/v1/auth/company/sessions
// @access  Private
const getCompanySessions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Get user's company
    const companyResult = await query(
      'SELECT id FROM companies WHERE created_by = $1',
      [req.user.id]
    );

    if (companyResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Company not found'
      });
      return;
    }

    const company = companyResult.rows[0];

    // Get all active sessions for company team members
    const sessionsResult = await query(
      `SELECT s.id, s.user_id, s.device_info, s.ip_address, s.created_at, s.last_activity_at, u.email
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       JOIN company_team ct ON u.id = ct.user_id
       WHERE ct.company_id = $1 AND s.expires_at > NOW()
       ORDER BY s.last_activity_at DESC`,
      [company.id]
    );

    res.json({
      success: true,
      data: sessionsResult.rows
    });
  } catch (error) {
    logger.error('Get company sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve company sessions'
    });
  }
};

// @desc    Deactivate former employee accounts
// @route   POST /api/v1/auth/company/deactivate-user
// @access  Private
const deactivateUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;

    // Get user's company
    const companyResult = await query(
      'SELECT id FROM companies WHERE created_by = $1',
      [req.user.id]
    );

    if (companyResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Company not found'
      });
      return;
    }

    const company = companyResult.rows[0];

    // Check if user is part of the company
    const userCheck = await query(
      'SELECT id FROM company_team WHERE company_id = $1 AND user_id = $2',
      [company.id, userId]
    );

    if (userCheck.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'User is not a member of this company'
      });
      return;
    }

    // Deactivate user account
    await query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      ['inactive', userId]
    );

    // Expire all sessions for this user
    await query(
      'UPDATE sessions SET expires_at = NOW() WHERE user_id = $1',
      [userId]
    );

    // Log security event
    await query(
      'INSERT INTO security_alerts (user_id, alert_type, severity, title, description, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, 'account_deactivated', 'high', 'Account Deactivated', 'Account deactivated by company admin', JSON.stringify({ deactivatedBy: req.user.id, companyId: company.id })]
    );

    res.json({
      success: true,
      message: 'User account deactivated successfully'
    });
  } catch (error) {
    logger.error('Deactivate user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate user account'
    });
  }
};

// @desc    Receive security alerts
// @route   GET /api/v1/auth/security-alerts
// @access  Private
const getSecurityAlerts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const alertsResult = await query(
      'SELECT id, alert_type, severity, title, description, metadata, acknowledged, created_at FROM security_alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [req.user.id, limit, offset]
    );

    const totalResult = await query(
      'SELECT COUNT(*) as total FROM security_alerts WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        alerts: alertsResult.rows,
        pagination: {
          page,
          limit,
          total: parseInt(totalResult.rows[0].total),
          pages: Math.ceil(parseInt(totalResult.rows[0].total) / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Get security alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve security alerts'
    });
  }
};

// @desc    Resend verification email
// @route   POST /api/v1/auth/resend-verification-email
// @access  Public
const resendVerificationEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Email is required'
      });
      return;
    }

    // Get user
    const userResult = await query(
      'SELECT id, email, verification_token, status FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal if email exists for security
      res.json({
        success: true,
        message: 'If an account with that email exists, a verification email has been sent.'
      });
      return;
    }

    const user = userResult.rows[0];

    // If already verified, don't resend
    if (user.status === 'active') {
      res.json({
        success: true,
        message: 'This account is already verified. You can log in now.'
      });
      return;
    }

    // Generate new verification token if expired
    let verificationToken = user.verification_token;
    if (!verificationToken) {
      verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      await query(
        'UPDATE users SET verification_token = $1, token_expiry = $2 WHERE id = $3',
        [verificationToken, tokenExpiry, user.id]
      );
    } else {
      // Update token_expiry to extend it by 24 hours
      const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await query(
        'UPDATE users SET token_expiry = $1 WHERE id = $2',
        [tokenExpiry, user.id]
      );
    }

    // Send verification email
    try {
      await sendEmail({
        to: email,
        subject: 'Verify Your Email - SVWR-CFE Platform',
        html: `
          <h2>Welcome to SVWR-CFE!</h2>
          <p>Please verify your email address to complete your registration.</p>
          <p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}" 
               style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email
            </a>
          </p>
          <p>Or copy this link: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}</p>
          <p>This verification link expires in 24 hours.</p>
        `,
        text: `Verify your email at: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`
      });
      logger.info(`Verification email resent to ${email}`);
    } catch (emailError) {
      logger.error('Failed to resend verification email:', emailError);
    }

    res.json({
      success: true,
      message: 'Verification email sent! Please check your inbox and spam folder.'
    });
  } catch (error) {
    logger.error('Resend verification email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification email'
    });
  }
};

// @desc    Send test email
// @route   POST /api/v1/auth/test-email
// @access  Public (for testing)
const testEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Email is required'
      });
      return;
    }

    // Send test email
    await sendEmail({
      to: email,
      subject: 'Test Email from SVWR-CFE',
      html: `
        <h2>Test Email Successful!</h2>
        <p>This is a test email from SVWR-CFE.</p>
        <p>If you received this, your email configuration is working correctly.</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      `,
      text: 'Test Email Successful! This is a test email from SVWR-CFE.'
    });

    logger.info(`Test email sent to: ${email}`);

    res.json({
      success: true,
      message: `Test email sent to ${email}`
    });
  } catch (error) {
    logger.error('Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: (error as any).message
    });
  }
};

// @desc    Accept team invitation
// @route   POST /api/v1/auth/team/accept-invitation
// @access  Public
const acceptTeamInvitation = async (req: Request, res: Response): Promise<void> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { token: invitationToken, password, firstName, lastName, phone } = req.body;

    if (!invitationToken) {
      res.status(400).json({
        success: false,
        message: 'Invitation token is required'
      });
      return;
    }

    // Find invitation
    const invitationResult = await client.query(
      `SELECT ti.*, c.name as company_name, u.email as inviter_email
       FROM team_invitations ti
       JOIN companies c ON ti.company_id = c.id
       LEFT JOIN users u ON ti.invited_by = u.id
       WHERE ti.invitation_token = $1 AND ti.status = 'pending'`,
      [invitationToken]
    );

    if (invitationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Invalid or expired invitation token'
      });
      return;
    }

    const invitation = invitationResult.rows[0];

    // Check if invitation has expired
    if (new Date() > new Date(invitation.expires_at)) {
      await client.query(
        'UPDATE team_invitations SET status = $1, updated_at = NOW() WHERE id = $2',
        ['expired', invitation.id]
      );
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Invitation has expired'
      });
      return;
    }

    // Check if a recruiter account already exists for this email - the same
    // email may separately have a candidate/company_admin account elsewhere.
    let userId;
    const existingUser = await client.query(
      "SELECT id, user_type FROM users WHERE email = $1 AND user_type = 'recruiter'",
      [invitation.email]
    );

    if (existingUser.rows.length > 0) {
      // Existing user - just add to team
      userId = existingUser.rows[0].id;

      // Check if already a member of this company
      const existingMember = await client.query(
        'SELECT id FROM company_team WHERE company_id = $1 AND user_id = $2',
        [invitation.company_id, userId]
      );

      if (existingMember.rows.length > 0) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: 'You are already a member of this company'
        });
        return;
      }
    } else {
      // New user - create account
      if (!password) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: 'Password is required for new accounts'
        });
        return;
      }

      // Validate password
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: passwordValidation.message
        });
        return;
      }

      // Hash password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user account
      const userResult = await client.query(
        `INSERT INTO users (
          email, password_hash, user_type, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id`,
        [invitation.email, hashedPassword, 'recruiter', 'verified']
      );

      userId = userResult.rows[0].id;

      // Create candidate profile for the new user
      await client.query(
        `INSERT INTO candidate_profiles (user_id, first_name, last_name, phone, profile_completion, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 10, NOW(), NOW())`,
        [userId, firstName || invitation.first_name, lastName || invitation.last_name, phone]
      );
    }

    // Determine role and permissions
    const role = invitation.role || 'recruiter';
    const permissions = role === 'admin'
      ? '{"can_post_jobs": true, "can_view_candidates": true, "can_manage_team": true, "can_edit_company": true}'
      : role === 'recruiter'
      ? '{"can_post_jobs": true, "can_view_candidates": true, "can_manage_team": false, "can_edit_company": false}'
      : role === 'reviewer'
      ? '{"can_post_jobs": false, "can_view_candidates": true, "can_manage_team": false, "can_edit_company": false}'
      : '{"can_post_jobs": false, "can_view_candidates": true, "can_manage_team": false, "can_edit_company": false}';

    // Add user to company team
    await client.query(
      `INSERT INTO company_team (
        company_id, user_id, invitation_id, name, title, email, phone, role, permissions, joined_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), NOW())`,
      [
        invitation.company_id,
        userId,
        invitation.id,
        `${firstName || invitation.first_name || ''} ${lastName || invitation.last_name || ''}`.trim() || 'Team Member',
        `${role.charAt(0).toUpperCase() + role.slice(1)} Team Member`,
        invitation.email,
        phone || null,
        role,
        permissions
      ]
    );

    // Update invitation status
    await client.query(
      'UPDATE team_invitations SET status = $1, accepted_at = NOW(), accepted_by = $2, updated_at = NOW() WHERE id = $3',
      ['accepted', userId, invitation.id]
    );

    await client.query('COMMIT');

    RecommendationSyncService.queueEvent({
      event_type: 'recommendation_update',
      entity_type: 'candidate_profiles',
      operation: 'insert',
      candidate_id: userId,
      entity_id: userId,
      payload: {
        user_type: 'recruiter',
        first_name: firstName || invitation.first_name,
        last_name: lastName || invitation.last_name,
        profile_completion: 10,
      },
      source: 'backend',
    });

    // Generate JWT token for the new user - use a different variable name
    const authToken = generateToken({ id: userId, email: invitation.email, user_type: 'recruiter'});

    res.json({
      success: true,
      message: `Successfully joined ${invitation.company_name} as ${role}`,
      data: {
        company: {
          id: invitation.company_id,
          name: invitation.company_name
        },
        role: role,
        isNewUser: !existingUser.rows.length,
        token: authToken  // Use the new variable name here
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Accept team invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept invitation'
    });
  } finally {
    client.release();
  }
};
// @desc    Get team invitations for company
// @route   GET /api/v1/auth/team/invitations
// @access  Private (Company Admin)
const getTeamInvitations = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Get user's company
    const companyResult = await query(
      `SELECT c.id, ct.role
       FROM companies c
       JOIN company_team ct ON c.id = ct.company_id
       WHERE ct.user_id = $1 AND ct.role = 'admin'`,
      [req.user.id]
    );

    if (companyResult.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Company admin required.'
      });
      return;
    }

    const companyId = companyResult.rows[0].id;

    // Get invitations
    const invitations = await query(
      `SELECT ti.*, u.email as inviter_email,
              CASE WHEN ti.expires_at < NOW() THEN 'expired'ELSE ti.status END as current_status
       FROM team_invitations ti
       LEFT JOIN users u ON ti.invited_by = u.id
       WHERE ti.company_id = $1
       ORDER BY ti.created_at DESC`,
      [companyId]
    );

    res.json({
      success: true,
      data: invitations.rows
    });

  } catch (error) {
    logger.error('Get team invitations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invitations'
    });
  }
};

// @desc    Resend team invitation
// @route   POST /api/v1/auth/team/resend-invitation
// @access  Private (Company Admin)
const resendTeamInvitation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { invitationId } = req.body;

    if (!invitationId) {
      res.status(400).json({
        success: false,
        message: 'Invitation ID is required'
      });
      return;
    }

    // Get invitation and verify admin access
    const invitationResult = await client.query(
      `SELECT ti.*, c.name as company_name, u.email as inviter_email
       FROM team_invitations ti
       JOIN companies c ON ti.company_id = c.id
       LEFT JOIN users u ON ti.invited_by = u.id
       JOIN company_team ct ON c.id = ct.company_id
       WHERE ti.id = $1 AND ct.user_id = $2 AND ct.role = 'admin'`,
      [invitationId, req.user.id]
    );

    if (invitationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({
        success: false,
        message: 'Access denied or invitation not found'
      });
      return;
    }

    const invitation = invitationResult.rows[0];

    if (invitation.status !== 'pending') {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'Can only resend pending invitations'
      });
      return;
    }

    // Update expiration and resend
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await client.query(
      'UPDATE team_invitations SET expires_at = $1, updated_at = NOW() WHERE id = $2',
      [newExpiresAt, invitationId]
    );

    // Resend email
    try {
      await sendEmail({
        to: invitation.email,
        subject: `Invitation to join ${invitation.company_name} team (Resent)`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb; text-align: center;">You're Invited to Join Our Team!</h1>
            <h2 style="color: #374151; text-align: center;">${invitation.company_name}</h2>
            <p>Hi${invitation.first_name ? ` ${invitation.first_name}` : ''},</p>
            <p>This is a reminder invitation to join <strong>${invitation.company_name}</strong> as a <strong>${invitation.role}</strong>.</p>
            ${invitation.personal_message ? `<p><em>"${invitation.personal_message}"</em></p>` : ''}
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invitation?token=${invitation.invitation_token}"
                 style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">Or copy this link:</p>
            <p style="color: #2563eb; word-break: break-all; font-size: 12px;">${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invitation?token=${invitation.invitation_token}</p>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              <strong>⏰ This invitation expires in 7 days</strong>
            </p>
          </div>
        `,
        text: `Reminder: You're Invited to Join ${invitation.company_name}!

Hi${invitation.first_name ? ` ${invitation.first_name}` : ''},

This is a reminder invitation to join ${invitation.company_name} as a ${invitation.role}.

Accept the invitation here:
${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invitation?token=${invitation.invitation_token}

This invitation expires in 7 days.`
      });

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Invitation resent successfully'
      });

    } catch (emailError) {
      await client.query('ROLLBACK');
      logger.error('Resend team invitation email failed:', emailError);
      res.status(500).json({
        success: false,
        message: 'Failed to resend invitation email'
      });
    }

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Resend team invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend invitation'
    });
  } finally {
    client.release();
  }
};

// @desc    Revoke team invitation
// @route   POST /api/v1/auth/team/revoke-invitation
// @access  Private (Company Admin)
const revokeTeamInvitation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { invitationId } = req.body;

    if (!invitationId) {
      res.status(400).json({
        success: false,
        message: 'Invitation ID is required'
      });
      return;
    }

    // Get invitation and verify admin access
    const invitationResult = await client.query(
      `SELECT ti.id
       FROM team_invitations ti
       JOIN companies c ON ti.company_id = c.id
       JOIN company_team ct ON c.id = ct.company_id
       WHERE ti.id = $1 AND ct.user_id = $2 AND ct.role = 'admin'`,
      [invitationId, req.user.id]
    );

    if (invitationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({
        success: false,
        message: 'Access denied or invitation not found'
      });
      return;
    }

    // Update invitation status
    await client.query(
      'UPDATE team_invitations SET status = $1, updated_at = NOW() WHERE id = $2',
      ['revoked', invitationId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Invitation revoked successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Revoke team invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke invitation'
    });
  } finally {
    client.release();
  }
};

// @desc    Get company team members
// @route   GET /api/v1/auth/team/members
// @access  Private (Company Members)
const getTeamMembers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Get user's company
    const companyResult = await query(
      `SELECT c.id, c.name, ct.role as user_role
       FROM companies c
       JOIN company_team ct ON c.id = ct.company_id
       WHERE ct.user_id = $1`,
      [req.user.id]
    );

    if (companyResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Company not found'
      });
      return;
    }

    const company = companyResult.rows[0];

    // Get team members
    const members = await query(
      `SELECT ct.*, u.status as user_status, u.last_login_at,
              CASE WHEN ct.user_id IS NULL THEN 'pending'ELSE 'active'END as member_status
       FROM company_team ct
       LEFT JOIN users u ON ct.user_id = u.id
       WHERE ct.company_id = $1
       ORDER BY ct.joined_at DESC`,
      [company.id]
    );

    res.json({
      success: true,
      data: {
        company: {
          id: company.id,
          name: company.name
        },
        userRole: company.user_role,
        members: members.rows
      }
    });

  } catch (error) {
    logger.error('Get team members error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team members'
    });
  }
};

// @desc    Update team member role
// @route   POST /api/v1/auth/team/update-role
// @access  Private (Company Admin)
const updateTeamMemberRole = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { memberId, newRole } = req.body;

    if (!memberId || !newRole || !['admin', 'recruiter', 'reviewer', 'viewer'].includes(newRole)) {
      res.status(400).json({
        success: false,
        message: 'Valid member ID and role are required'
      });
      return;
    }

    // Verify admin access and get company
    const companyResult = await client.query(
      `SELECT c.id
       FROM companies c
       JOIN company_team ct ON c.id = ct.company_id
       WHERE ct.user_id = $1 AND ct.role = 'admin'`,
      [req.user.id]
    );

    if (companyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({
        success: false,
        message: 'Access denied. Company admin required.'
      });
      return;
    }

    const companyId = companyResult.rows[0].id;

    // Update member role and permissions
    const permissions = newRole === 'admin'
      ? '{"can_post_jobs": true, "can_view_candidates": true, "can_manage_team": true, "can_edit_company": true}'
      : newRole === 'recruiter'
      ? '{"can_post_jobs": true, "can_view_candidates": true, "can_manage_team": false, "can_edit_company": false}'
      : newRole === 'reviewer'
      ? '{"can_post_jobs": false, "can_view_candidates": true, "can_manage_team": false, "can_edit_company": false}'
      : '{"can_post_jobs": false, "can_view_candidates": true, "can_manage_team": false, "can_edit_company": false}';

    await client.query(
      'UPDATE company_team SET role = $1, permissions = $2, updated_at = NOW() WHERE id = $3 AND company_id = $4',
      [newRole, permissions, memberId, companyId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Team member role updated successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Update team member role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update team member role'
    });
  } finally {
    client.release();
  }
};

export {
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
};