import express, { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { query as dbQuery, getClient } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import emailService from '../../services/email.service.js';

const router: Router = express.Router();

// Every route below is System Admin only.
router.use(protect, authorize('system_admin'));

const TEAM_ROLES = ['admin', 'recruiter', 'reviewer', 'viewer'];
const USER_STATUSES = ['unverified', 'verified', 'active', 'locked', 'suspended', 'deleted'];

const genTempPassword = (): string =>
  crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 10) + 'A1!';

// ============================================================
// PLATFORM STATS
// ============================================================
// @route   GET /api/v1/admin/stats
// @desc    Platform-wide counts for the System Admin dashboard
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [companies, users, jobs, applications, candidates] = await Promise.all([
      dbQuery(`SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND verification_status = 'verified') AS verified,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND verification_status = 'pending') AS pending
        FROM companies`),
      dbQuery(`SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND user_type = 'candidate') AS candidates,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND user_type = 'recruiter') AS recruiters,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND user_type = 'company_admin') AS company_admins,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND user_type = 'system_admin') AS system_admins
        FROM users`),
      dbQuery(`SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'active') AS active
        FROM jobs`),
      dbQuery(`SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'shortlisted') AS shortlisted,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'interview') AS interview,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'offer') AS offer,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'hired') AS hired,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'rejected') AS rejected,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'withdrawn') AS withdrawn,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status IN ('submitted','under_review')) AS in_review
        FROM applications`),
      dbQuery(`SELECT COUNT(DISTINCT user_id) AS total FROM applications WHERE deleted_at IS NULL`),
    ]);

    res.json({
      success: true,
      data: {
        companies: companies.rows[0],
        users: users.rows[0],
        jobs: jobs.rows[0],
        applications: applications.rows[0],
        candidatesWhoApplied: candidates.rows[0].total,
      },
    });
  } catch (error) {
    logger.error('Admin stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to load platform stats'});
  }
});

// ============================================================
// COMPANIES
// ============================================================
// @route   GET /api/v1/admin/companies
router.get('/companies', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('q').optional().trim(),
  validateRequest,
], async (req: Request, res: Response) => {
  try {
    const page = (req.query.page as unknown as number) || 1;
    const limit = (req.query.limit as unknown as number) || 20;
    const offset = (page - 1) * limit;
    const q = (req.query.q as string) || '';

    const params: any[] = [];
    let where = 'WHERE c.deleted_at IS NULL';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND c.name ILIKE $${params.length}`;
    }

    const listParams = [...params, limit, offset];
    const result = await dbQuery(
      `SELECT c.id, c.name, c.industry, c.size, c.website, c.verification_status,
              c.created_at, c.created_by, u.email AS owner_email,
              (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id AND j.deleted_at IS NULL) AS job_count,
              (SELECT COUNT(*) FROM company_team ct WHERE ct.company_id = c.id) AS team_count
         FROM companies c
         LEFT JOIN users u ON u.id = c.created_by
         ${where}
        ORDER BY c.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );

    const countResult = await dbQuery(`SELECT COUNT(*) FROM companies c ${where}`, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: { page, limit, total: parseInt(countResult.rows[0].count, 10) },
    });
  } catch (error) {
    logger.error('Admin list companies error:', error);
    res.status(500).json({ success: false, message: 'Failed to load companies'});
  }
});

// @route   POST /api/v1/admin/companies
// @desc    Create a company (no owner yet   assign one via User Management)
router.post('/companies', [
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('industry').optional().trim().isLength({ max: 50 }),
  body('city').optional().trim().isLength({ max: 100 }),
  body('country').optional().trim().isLength({ max: 100 }),
  body('website').optional({ checkFalsy: true }).isURL(),
  body('size').optional().isIn(['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10000+']),
  validateRequest,
], async (req: Request, res: Response) => {
  try {
    const { name, description, industry, city, country, website, size } = req.body;
    const headquarters = (city || country) ? { city: city || null, country: country || null } : null;

    const result = await dbQuery(
      `INSERT INTO companies (name, description, industry, headquarters_location, website, size, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, NULL)
       RETURNING *`,
      [name, description || null, industry || null, headquarters ? JSON.stringify(headquarters) : null, website || null, size || null]
    );

    logger.info(`Company created by system admin: ${result.rows[0].id}`);
    res.status(201).json({ success: true, data: result.rows[0], message: 'Company created'});
  } catch (error) {
    logger.error('Admin create company error:', error);
    res.status(500).json({ success: false, message: 'Failed to create company'});
  }
});

// @route   PUT /api/v1/admin/companies/:id
router.put('/companies/:id', [
  param('id').isUUID(),
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('industry').optional().trim().isLength({ max: 50 }),
  body('city').optional().trim().isLength({ max: 100 }),
  body('country').optional().trim().isLength({ max: 100 }),
  body('website').optional({ checkFalsy: true }).isURL(),
  body('size').optional().isIn(['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10000+']),
  body('verificationStatus').optional().isIn(['pending', 'verified', 'rejected', 'expired']),
  validateRequest,
], async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, industry, city, country, website, size, verificationStatus } = req.body;

    const existing = await dbQuery('SELECT headquarters_location, name, verification_status FROM companies WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Company not found'});
      return;
    }
    const wasPending = existing.rows[0].verification_status === 'pending';

    const fields: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let i = 1;
    if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description = $${i++}`); values.push(description); }
    if (industry !== undefined) { fields.push(`industry = $${i++}`); values.push(industry); }
    if (website !== undefined) { fields.push(`website = $${i++}`); values.push(website); }
    if (size !== undefined) { fields.push(`size = $${i++}`); values.push(size); }
    if (verificationStatus !== undefined) {
      fields.push(`verification_status = $${i++}`);
      values.push(verificationStatus);
      if (verificationStatus === 'verified') fields.push('verification_badge = TRUE');
    }
    if (city !== undefined || country !== undefined) {
      const prev = existing.rows[0].headquarters_location || {};
      const merged = { ...prev, ...(city !== undefined ? { city } : {}), ...(country !== undefined ? { country } : {}) };
      fields.push(`headquarters_location = $${i++}`);
      values.push(JSON.stringify(merged));
    }

    values.push(id);
    const result = await dbQuery(
      `UPDATE companies SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );

    res.json({ success: true, data: result.rows[0], message: 'Company updated'});

    if (wasPending && verificationStatus === 'verified') {
      const admins = await dbQuery(
        `SELECT u.email FROM company_team ct JOIN users u ON u.id = ct.user_id
          WHERE ct.company_id = $1 AND ct.role = 'admin'`,
        [id]
      );
      const companyName = existing.rows[0].name;
      await Promise.all(admins.rows.map((a: any) =>
        emailService.sendEmail({
          to: a.email,
          subject: `${companyName} is now approved - you can log in`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #2563eb; text-align: center;">You're Approved!</h1>
              <p>Hi,</p>
              <p><strong>${companyName}</strong> has been reviewed and approved. Your account is now active and you can log in to start posting jobs and reviewing candidates.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login"
                   style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                  Log In
                </a>
              </div>
            </div>
          `,
          text: `${companyName} has been reviewed and approved. Your account is now active - log in at ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`,
        }).catch((emailError: unknown) => logger.error('Failed to send company-approved email:', emailError))
      ));
    }
  } catch (error) {
    logger.error('Admin update company error:', error);
    res.status(500).json({ success: false, message: 'Failed to update company'});
  }
});

// @route   DELETE /api/v1/admin/companies/:id
router.delete('/companies/:id', [param('id').isUUID(), validateRequest], async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await dbQuery(
      `UPDATE companies SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Company not found'});
      return;
    }
    logger.info(`Company soft-deleted by system admin: ${id}`);
    res.json({ success: true, message: 'Company deleted'});
  } catch (error) {
    logger.error('Admin delete company error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete company'});
  }
});

// ============================================================
// USERS (scoped to a company)
// ============================================================
// @route   GET /api/v1/admin/companies/:id/users
router.get('/companies/:id/users', [param('id').isUUID(), validateRequest], async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await dbQuery(
      `SELECT ct.id AS team_id, ct.name, ct.title, ct.role AS team_role, ct.email AS team_email,
              u.id AS user_id, u.email AS login_email, u.user_type, u.status, u.last_login_at, u.created_at
         FROM company_team ct
         JOIN users u ON u.id = ct.user_id
        WHERE ct.company_id = $1 AND u.deleted_at IS NULL
        ORDER BY ct.created_at ASC`,
      [id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Admin list company users error:', error);
    res.status(500).json({ success: false, message: 'Failed to load users'});
  }
});

// @route   POST /api/v1/admin/companies/:id/users
// @desc    Create a user account directly under a company; emails them their
//          temporary password. This is the only "admin creates user with a
//          system-generated password" path in the app (everywhere else is
//          self-signup or invite-then-self-set-password).
router.post('/companies/:id/users', [
  param('id').isUUID(),
  body('name').trim().isLength({ min: 1, max: 255 }),
  body('email').isEmail().normalizeEmail(),
  body('title').optional().trim().isLength({ max: 255 }),
  body('teamRole').isIn(TEAM_ROLES),
  validateRequest,
], async (req: Request, res: Response) => {
  const client = await getClient();
  try {
    const { id: companyId } = req.params;
    const { name, email, title, teamRole } = req.body;

    await client.query('BEGIN');

    const companyRes = await client.query(
      'SELECT id, name, created_by FROM companies WHERE id = $1 AND deleted_at IS NULL',
      [companyId]
    );
    if (companyRes.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Company not found'});
      return;
    }
    const company = companyRes.rows[0];

    const userType = teamRole === 'admin'? 'company_admin': 'recruiter';

    // Scoped by user_type - the same email may separately have an unrelated
    // account under a different role (e.g. a candidate account).
    const dupe = await client.query('SELECT id, deleted_at FROM users WHERE email = $1 AND user_type = $2', [email, userType]);
    if (dupe.rows.length > 0 && dupe.rows[0].deleted_at === null) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        message: 'A user with this email already exists',
        code: 'USER_EXISTS',
        existingUserId: dupe.rows[0].id,
      });
      return;
    }

    const tempPassword = genTempPassword();
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(tempPassword, salt);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // email has a hard UNIQUE constraint (not scoped to non-deleted rows), so a
    // previously-deleted account with this email can't be INSERTed again   reactivate
    // the old row instead, matching what a fresh signup would give them.
    const userRes = dupe.rows.length > 0
      ? await client.query(
          `UPDATE users SET password_hash = $1, user_type = $2, status = 'unverified', deleted_at = NULL,
                            verification_token = $3, token_expiry = $4, updated_at = NOW()
           WHERE id = $5
           RETURNING id, email, user_type, status, created_at`,
          [passwordHash, userType, verificationToken, tokenExpiry, dupe.rows[0].id]
        )
      : await client.query(
          `INSERT INTO users (email, password_hash, user_type, status, verification_token, token_expiry)
           VALUES ($1, $2, $3, 'unverified', $4, $5)
           RETURNING id, email, user_type, status, created_at`,
          [email, passwordHash, userType, verificationToken, tokenExpiry]
        );
    const newUser = userRes.rows[0];

    const teamRes = await client.query(
      `INSERT INTO company_team (company_id, user_id, name, title, email, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, title, role`,
      [companyId, newUser.id, name, title || teamRole, email, teamRole]
    );

    // First admin assigned to a company with no owner yet becomes its owner,
    // so existing company_admin-gated endpoints (job posting, etc.) work for them.
    if (teamRole === 'admin'&& !company.created_by) {
      await client.query('UPDATE companies SET created_by = $1, updated_at = NOW() WHERE id = $2', [newUser.id, companyId]);
    }

    await client.query('COMMIT');

    logger.info(`User ${newUser.id} created by system admin for company ${companyId}`);

    try {
      await emailService.sendAdminCreatedAccountEmail(email, {
        name,
        email,
        tempPassword,
        roleLabel: teamRole === 'admin'? 'Company Admin': teamRole.charAt(0).toUpperCase() + teamRole.slice(1),
        companyName: company.name,
        loginUrl: `${process.env.FRONTEND_URL || ''}/login`,
        verifyUrl: `${process.env.FRONTEND_URL || ''}/verify-email?token=${verificationToken}`,
      });
    } catch (emailErr) {
      logger.warn(`Admin-created-account email failed for ${email}: ${(emailErr as Error).message}`);
    }

    res.status(201).json({
      success: true,
      data: { ...newUser, team: teamRes.rows[0] },
      message: 'User created and notified by email',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Admin create user error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user'});
  } finally {
    client.release();
  }
});

// @route   POST /api/v1/admin/users/:userId/resend-credentials
// @desc    Regenerate the temp password and resend the "account created" email
//          for a user that already exists   the escape hatch for the 409 a
//          system admin hits when POST /companies/:id/users targets an email
//          that was already created (e.g. the original email never arrived).
router.post('/users/:userId/resend-credentials', [
  param('userId').isUUID(),
  validateRequest,
], async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const userRes = await dbQuery(
      `SELECT u.id, u.email, u.user_type, u.status,
              ct.name, ct.title, ct.role AS team_role, c.name AS company_name
       FROM users u
       LEFT JOIN company_team ct ON ct.user_id = u.id
       LEFT JOIN companies c ON c.id = ct.company_id
       WHERE u.id = $1 AND u.deleted_at IS NULL
       LIMIT 1`,
      [userId]
    );
    if (userRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found'});
      return;
    }
    const user = userRes.rows[0];

    const tempPassword = genTempPassword();
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(tempPassword, salt);

    // Still unverified   the old link may have expired, so mint a fresh one alongside
    // the new password rather than resending a token that might no longer work.
    let verifyUrl: string | undefined;
    if (user.status === 'unverified') {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await dbQuery(
        'UPDATE users SET password_hash = $1, verification_token = $2, token_expiry = $3, updated_at = NOW() WHERE id = $4',
        [passwordHash, verificationToken, tokenExpiry, userId]
      );
      verifyUrl = `${process.env.FRONTEND_URL || ''}/verify-email?token=${verificationToken}`;
    } else {
      await dbQuery('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, userId]);
    }

    await emailService.sendAdminCreatedAccountEmail(user.email, {
      name: user.name || user.email,
      email: user.email,
      tempPassword,
      roleLabel: user.team_role
        ? (user.team_role === 'admin'? 'Company Admin': user.team_role.charAt(0).toUpperCase() + user.team_role.slice(1))
        : user.user_type,
      companyName: user.company_name,
      loginUrl: `${process.env.FRONTEND_URL || ''}/login`,
      ...(verifyUrl ? { verifyUrl } : {}),
    });

    logger.info(`Credentials resent by system admin for user ${userId}`);
    res.json({ success: true, message: `New login details emailed to ${user.email}`});
  } catch (error) {
    logger.error('Admin resend credentials error:', error);
    res.status(500).json({ success: false, message: 'Failed to resend credentials'});
  }
});

// @route   PUT /api/v1/admin/users/:id
// @desc    Update a user's status / team role+title (System Admin only)
router.put('/users/:id', [
  param('id').isUUID(),
  body('status').optional().isIn(USER_STATUSES),
  body('teamRole').optional().isIn(TEAM_ROLES),
  body('title').optional().trim().isLength({ max: 255 }),
  validateRequest,
], async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, teamRole, title } = req.body;

    if (status) {
      const result = await dbQuery(
        `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING id`,
        [status, id]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, message: 'User not found'});
        return;
      }
    }

    if (teamRole || title) {
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;
      if (teamRole) { fields.push(`role = $${i++}`); values.push(teamRole); }
      if (title) { fields.push(`title = $${i++}`); values.push(title); }
      values.push(id);
      await dbQuery(`UPDATE company_team SET ${fields.join(', ')} WHERE user_id = $${i}`, values);

      if (teamRole) {
        await dbQuery(
          `UPDATE users SET user_type = $1, updated_at = NOW() WHERE id = $2 AND user_type IN ('company_admin','recruiter')`,
          [teamRole === 'admin'? 'company_admin': 'recruiter', id]
        );
      }
    }

    res.json({ success: true, message: 'User updated'});
  } catch (error) {
    logger.error('Admin update user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user'});
  }
});

// @route   DELETE /api/v1/admin/users/:id
// @desc    Soft-delete a user and remove their company_team membership
router.delete('/users/:id', [param('id').isUUID(), validateRequest], async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await dbQuery(
      `UPDATE users SET status = 'deleted', deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found'});
      return;
    }
    await dbQuery('DELETE FROM company_team WHERE user_id = $1', [id]);
    await dbQuery('UPDATE companies SET created_by = NULL WHERE created_by = $1', [id]);

    logger.info(`User soft-deleted by system admin: ${id}`);
    res.json({ success: true, message: 'User deleted'});
  } catch (error) {
    logger.error('Admin delete user error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user'});
  }
});

export default router;
