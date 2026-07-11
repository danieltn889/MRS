import express, { Router, Request, Response } from 'express';
import { body, query, param } from 'express-validator';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { query as dbQuery, getClient } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { AuthenticatedRequest } from '../../types/auth.types.js';
import { withAuth } from '../../utils/auth.utils.js';
import {
  setWorkHoursPolicies,
  verifyCompanyRegistration,
  setupJobPostingApprovalWorkflows,
  archiveOldCompanyProfiles,
  updateCompanyProfile,
  uploadCompanyLogo,
  uploadCompanyBanner,
  getCompanyProfile,
  addCompanyLocation,
  updateCompanyLocation,
  deleteCompanyLocation,
  getCompanyLocations,
  updateCompanyCulture,
  getCompanyCulture,
  addTeamMember,
  updateTeamMember,
  deleteTeamMember,
  getCompanyTeam,
  uploadTeamMemberPhoto,
  addCompanyProject,
  updateCompanyProject,
  deleteCompanyProject,
  getCompanyProjects,
  uploadProjectMedia,
  deleteProjectMedia
} from '../../controllers/company.controller.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

// =====================================================
// FIX: Create __dirname for ES modules
// =====================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router: Router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req: any, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, path.join(__dirname, '../../../uploads/company'));
  },
  filename: (req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + '-'+ Math.round(Math.random() * 1E9);
    cb(null, `company-${(req as AuthenticatedRequest).user!.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype.startsWith('image/') ||
        file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDF files are allowed'));
    }
  }
});

// Rest of your routes remain the same...
// ... (all your route definitions)

// @route   GET /api/v1/companies
// @desc    Get all companies (public view)
// @access  Public
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('industry').optional().trim(),
  query('location').optional().trim(),
  query('q').optional().trim(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, industry, location, q } = req.query;
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Industry filter
    if (industry) {
      whereConditions.push(`c.industry = $${paramIndex}`);
      params.push(industry);
      paramIndex++;
    }

    // Location filter
    if (location) {
      whereConditions.push(`c.location ILIKE $${paramIndex}`);
      params.push(`%${location}%`);
      paramIndex++;
    }

    // Text search
    if (q) {
      whereConditions.push(`(
        c.name ILIKE $${paramIndex} OR
        c.description ILIKE $${paramIndex} OR
        c.industry ILIKE $${paramIndex}
      )`);
      params.push(`%${q}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join('AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM companies c ${whereClause}`;
    const countResult = await dbQuery(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get companies
    const companiesQuery = `
      SELECT
        c.id, c.name, c.description, c.industry, c.location, c.website,
        c.logo_url, c.company_size, c.founded_year, c.created_at,
        (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id AND j.status = 'active') as active_jobs,
        (SELECT COUNT(*) FROM company_team ct WHERE ct.company_id = c.id) as team_size
      FROM companies c
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limitNum, offset);

    const companiesResult = await dbQuery(companiesQuery, params);

    // Calculate pagination
    const totalPages = Math.ceil(total / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    res.json({
      success: true,
      data: {
        companies: companiesResult.rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNext,
          hasPrev
        }
      }
    });

  } catch (error) {
    logger.error('Get companies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch companies'
    });
  }
});

// @route   GET /api/v1/companies/profile
// @desc    Get company profile
// @access  Private (Recruiters and Company Admins)
router.get('/profile', protect, authorize('recruiter', 'company_admin'), withAuth(getCompanyProfile));

// @route   PUT /api/v1/companies/profile
// @desc    Update company profile
// @access  Private (Company Admin only)
router.put('/profile', protect, authorize('company_admin'), [
  body('name').optional().trim().isLength({ min: 1, max: 255 }),
  body('legalName').optional().trim().isLength({ max: 255 }),
  body('industry').optional().trim().isLength({ max: 255 }),
  body('industries').optional().isArray(),
  body('size').optional().isIn(['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10000+']),
  body('foundedYear').optional().isInt({ min: 1800, max: new Date().getFullYear() }),
  body('headquartersLocation').optional().isObject(),
  body('website').optional().isURL(),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('shortDescription').optional().trim().isLength({ max: 300 }),
  body('mission').optional().trim().isLength({ max: 1000 }),
  body('vision').optional().trim().isLength({ max: 1000 }),
  body('values').optional().isArray(),
  body('culture').optional().isObject(),
  body('socialLinks').optional().isObject(),
  validateRequest
], withAuth(updateCompanyProfile));

// @route   POST /api/v1/companies/profile/logo
// @desc    Upload company logo
// @access  Private (Company Admin only)
router.post('/profile/logo', protect, authorize('company_admin'), upload.single('logo'), withAuth(uploadCompanyLogo));

// @route   POST /api/v1/companies/profile/banner
// @desc    Upload company banner
// @access  Private (Company Admin only)
router.post('/profile/banner', protect, authorize('company_admin'), upload.single('banner'), withAuth(uploadCompanyBanner));

// @route   POST /api/v1/companies
// @desc    Create company profile
// @access  Private (Company Admins only)
router.post('/', protect, authorize('company_admin'), [
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('description').trim().isLength({ min: 10, max: 2000 }),
  body('industry').trim().isLength({ min: 1, max: 50 }),
  body('location').trim().isLength({ min: 1, max: 100 }),
  body('website').optional().isURL(),
  body('companySize').optional().isIn(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']),
  body('foundedYear').optional().isInt({ min: 1800, max: new Date().getFullYear() }),
  body('mission').optional().trim().isLength({ max: 500 }),
  body('vision').optional().trim().isLength({ max: 500 }),
  body('values').optional().isArray(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const {
      name, description, industry, location, website,
      companySize, foundedYear, mission, vision, values
    } = req.body;

    // Check if user already has a company
    const existingCompany = await client.query(
      'SELECT id FROM companies WHERE created_by = $1',
      [authReq.user.id]
    );

    if (existingCompany.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'You already have a company profile'
      });
    }

    const result = await client.query(
      `INSERT INTO companies (
        name, description, industry, location, website,
        company_size, founded_year, mission, vision, values, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        name, description, industry, location, website,
        companySize, foundedYear, mission, vision, values || [], authReq.user.id
      ]
    );

    await client.query('COMMIT');

    logger.info(`Company created: ${result.rows[0].id} by user ${authReq.user.id}`);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Company profile created successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Create company error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create company profile'
    });
  } finally {
    client.release();
  }
});

// Change from isObject() to allow both array and object
router.put('/culture', protect, authorize('company_admin'), [
  body('attributes').optional().custom((value) => {
    // Allow both object and array
    if (value === undefined || value === null) return true;
    if (typeof value === 'object') return true;
    return false;
  }),
  body('values').optional().isArray(),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('workEnvironment').optional().trim().isLength({ max: 1000 }),
  body('teamDynamics').optional().trim().isLength({ max: 1000 }),
  body('communicationStyle').optional().trim().isLength({ max: 500 }),
  body('decisionMaking').optional().trim().isLength({ max: 500 }),
  body('workLifeBalance').optional().trim().isLength({ max: 500 }),
  body('diversityInclusion').optional().trim().isLength({ max: 500 }),
  body('employeeTestimonials').optional().isArray(),
  validateRequest
], withAuth(updateCompanyCulture));

// @route   PUT /api/v1/companies/:id
// @desc    Update company profile
// @access  Private (Company Admin only)
router.put('/:id', protect, authorize('company_admin'), [
  param('id').isUUID(),
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ min: 10, max: 2000 }),
  body('industry').optional().trim().isLength({ min: 1, max: 50 }),
  body('location').optional().trim().isLength({ min: 1, max: 100 }),
  body('website').optional().isURL(),
  body('companySize').optional().isIn(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']),
  body('foundedYear').optional().isInt({ min: 1800, max: new Date().getFullYear() }),
  body('mission').optional().trim().isLength({ max: 500 }),
  body('vision').optional().trim().isLength({ max: 500 }),
  body('values').optional().isArray(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;
    const {
      name, description, industry, location, website,
      companySize, foundedYear, mission, vision, values
    } = req.body;

    // Check ownership
    const ownershipCheck = await dbQuery(
      'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
      [id, authReq.user.id]
    );

    if (ownershipCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to update this company'
      });
    }

    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex}`);
      updateValues.push(name);
      paramIndex++;
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex}`);
      updateValues.push(description);
      paramIndex++;
    }
    if (industry !== undefined) {
      updateFields.push(`industry = $${paramIndex}`);
      updateValues.push(industry);
      paramIndex++;
    }
    if (location !== undefined) {
      updateFields.push(`location = $${paramIndex}`);
      updateValues.push(location);
      paramIndex++;
    }
    if (website !== undefined) {
      updateFields.push(`website = $${paramIndex}`);
      updateValues.push(website);
      paramIndex++;
    }
    if (companySize !== undefined) {
      updateFields.push(`company_size = $${paramIndex}`);
      updateValues.push(companySize);
      paramIndex++;
    }
    if (foundedYear !== undefined) {
      updateFields.push(`founded_year = $${paramIndex}`);
      updateValues.push(foundedYear);
      paramIndex++;
    }
    if (mission !== undefined) {
      updateFields.push(`mission = $${paramIndex}`);
      updateValues.push(mission);
      paramIndex++;
    }
    if (vision !== undefined) {
      updateFields.push(`vision = $${paramIndex}`);
      updateValues.push(vision);
      paramIndex++;
    }
    if (values !== undefined) {
      updateFields.push(`values = $${paramIndex}`);
      updateValues.push(values);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    const updateQuery = `UPDATE companies SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;
    updateValues.push(id);

    const result = await dbQuery(updateQuery, updateValues);

    logger.info(`Company updated: ${id} by user ${authReq.user.id}`);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Company profile updated successfully'
    });

  } catch (error) {
    logger.error('Update company error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update company profile'
    });
  }
});

// @route   POST /api/v1/companies/:id/logo
// @desc    Upload company logo
// @access  Private (Company Admin only)
router.post('/:id/logo', protect, authorize('company_admin'), upload.single('logo'), [
  param('id').isUUID(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;

    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'No logo file provided'
      });
      return;
    }

    // Check ownership
    const ownershipCheck = await dbQuery(
      'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
      [id, authReq.user.id]
    );

    if (ownershipCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to update this company'
      });
    }

    const logoUrl = `/uploads/company/${req.file.filename}`;

    await dbQuery(
      'UPDATE companies SET logo_url = $1, updated_at = NOW() WHERE id = $2',
      [logoUrl, id]
    );

    logger.info(`Company logo uploaded for company ${id} by user ${authReq.user.id}`);

    res.json({
      success: true,
      data: { logoUrl },
      message: 'Company logo uploaded successfully'
    });

  } catch (error) {
    logger.error('Upload company logo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload company logo'
    });
  }
});

// @route   GET /api/v1/companies/:id/team
// @desc    Get company team members
// @access  Private (Company Admin and Team Members)
router.get('/:id/team', protect, [
  param('id').isUUID(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;

    // Check if user has access to this company
    let hasAccess = false;
    if (authReq.user.user_type === 'company_admin') {
      const companyCheck = await dbQuery(
        'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
        [id, authReq.user.id]
      );
      hasAccess = companyCheck.rows.length > 0;
    } else if (authReq.user.user_type === 'recruiter') {
      const teamCheck = await dbQuery(
        'SELECT id FROM company_team WHERE company_id = $1 AND user_id = $2',
        [id, authReq.user.id]
      );
      hasAccess = teamCheck.rows.length > 0;
    }

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to view this company team'
      });
    }

    const teamQuery = `
      SELECT
        ct.id, ct.role, ct.permissions, ct.joined_at,
        u.email, u.user_type,
        COALESCE(cp.first_name, '') as first_name,
        COALESCE(cp.last_name, '') as last_name,
        cp.profile_photo_url
      FROM company_team ct
      JOIN users u ON ct.user_id = u.id
      LEFT JOIN candidate_profiles cp ON ct.user_id = cp.user_id
      WHERE ct.company_id = $1
      ORDER BY ct.joined_at DESC
    `;

    const teamResult = await dbQuery(teamQuery, [id]);

    res.json({
      success: true,
      data: teamResult.rows
    });

  } catch (error) {
    logger.error('Get company team error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch company team'
    });
  }
});

// @route   POST /api/v1/companies/:id/team
// @desc    Add team member
// @access  Private (Company Admin only)
router.post('/:id/team', protect, authorize('company_admin'), [
  param('id').isUUID(),
  body('userId').isUUID(),
  body('role').trim().isLength({ min: 1, max: 50 }),
  body('permissions').optional().isArray(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { userId, role, permissions } = req.body;

    // Check company ownership
    const companyCheck = await client.query(
      'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
      [id, authReq.user.id]
    );

    if (companyCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this company'
      });
    }

    // Check if user exists
    const userCheck = await client.query(
      'SELECT id, user_type FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is already in team
    const existingMember = await client.query(
      'SELECT id FROM company_team WHERE company_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingMember.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: 'User is already a team member'
      });
    }

    // Add team member
    const result = await client.query(
      `INSERT INTO company_team (company_id, user_id, role, permissions)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, userId, role, permissions || []]
    );

    // Update user type if necessary
    if (userCheck.rows[0].user_type === 'candidate') {
      await client.query(
        'UPDATE users SET user_type = $1 WHERE id = $2',
        ['recruiter', userId]
      );
    }

    await client.query('COMMIT');

    logger.info(`Team member added: user ${userId} to company ${id} by ${authReq.user.id}`);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Team member added successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Add team member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add team member'
    });
  } finally {
    client.release();
  }
});

// @route   DELETE /api/v1/companies/:id/team/:userId
// @desc    Remove team member
// @access  Private (Company Admin only)
router.delete('/:id/team/:userId', protect, authorize('company_admin'), [
  param('id').isUUID(),
  param('userId').isUUID(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id, userId } = req.params;

    // Check company ownership
    const companyCheck = await dbQuery(
      'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
      [id, authReq.user.id]
    );

    if (companyCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this company'
      });
    }

    const result = await dbQuery(
      'DELETE FROM company_team WHERE company_id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    logger.info(`Team member removed: user ${userId} from company ${id} by ${authReq.user.id}`);

    res.json({
      success: true,
      message: 'Team member removed successfully'
    });

  } catch (error) {
    logger.error('Remove team member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove team member'
    });
  }
});

// @route   POST /api/v1/companies/:id/culture
// @desc    Add company culture/perk
// @access  Private (Company Admin only)
router.post('/:id/culture', protect, authorize('company_admin'), [
  param('id').isUUID(),
  body('title').trim().isLength({ min: 1, max: 100 }),
  body('description').trim().isLength({ min: 1, max: 500 }),
  body('category').isIn(['benefit', 'perk', 'value', 'culture', 'facility']),
  body('icon').optional().trim().isLength({ max: 50 }),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const { title, description, category, icon } = req.body;

    // Check company ownership
    const companyCheck = await dbQuery(
      'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
      [id, authReq.user.id]
    );

    if (companyCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this company'
      });
    }

    const result = await dbQuery(
      `INSERT INTO company_culture (company_id, title, description, category, icon)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, title, description, category, icon]
    );

    logger.info(`Company culture added: ${result.rows[0].id} for company ${id}`);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Company culture item added successfully'
    });

  } catch (error) {
    logger.error('Add company culture error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add company culture item'
    });
  }
});

// @route   DELETE /api/v1/companies/:id/culture/:cultureId
// @desc    Remove company culture/perk
// @access  Private (Company Admin only)
router.delete('/:id/culture/:cultureId', protect, authorize('company_admin'), [
  param('id').isUUID(),
  param('cultureId').isUUID(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id, cultureId } = req.params;

    // Check company ownership
    const companyCheck = await dbQuery(
      'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
      [id, authReq.user.id]
    );

    if (companyCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this company'
      });
    }

    const result = await dbQuery(
      'DELETE FROM company_culture WHERE id = $1 AND company_id = $2 RETURNING *',
      [cultureId, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Culture item not found'
      });
    }

    res.json({
      success: true,
      message: 'Culture item removed successfully'
    });

  } catch (error) {
    logger.error('Remove company culture error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove culture item'
    });
  }
});

// @route   POST /api/v1/companies/:id/locations
// @desc    Add company locations
// @access  Private (Company Admin only)
router.post('/:id/locations', protect, authorize('company_admin'), [
  param('id').isUUID(),
  body('locations').isArray().withMessage('Locations must be an array'),
  body('locations.*.address').trim().isLength({ min: 1, max: 200 }),
  body('locations.*.city').trim().isLength({ min: 1, max: 100 }),
  body('locations.*.country').trim().isLength({ min: 1, max: 100 }),
  body('locations.*.isHeadquarters').optional().isBoolean(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;

    // Check company ownership
    const companyCheck = await dbQuery(
      'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
      [id, authReq.user!.id]
    );

    if (companyCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this company'
      });
    }

    // Placeholder implementation
    res.json({
      success: true,
      message: 'Company locations added successfully'
    });

  } catch (error) {
    logger.error('Add company locations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add company locations'
    });
  }
});

// @route   POST /api/v1/companies/:id/projects
// @desc    Showcase company projects
// @access  Private (Company Admin only)
router.post('/:id/projects', protect, authorize('company_admin'), [
  param('id').isUUID(),
  body('projects').isArray().withMessage('Projects must be an array'),
  body('projects.*.title').trim().isLength({ min: 1, max: 200 }),
  body('projects.*.description').trim().isLength({ min: 1, max: 1000 }),
  body('projects.*.url').optional().isURL(),
  body('projects.*.technologies').optional().isArray(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;

    // Check company ownership
    const companyCheck = await dbQuery(
      'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
      [id, authReq.user!.id]
    );

    if (companyCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this company'
      });
    }

    // Placeholder implementation
    res.json({
      success: true,
      message: 'Company projects added successfully'
    });

  } catch (error) {
    logger.error('Showcase company projects error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add company projects'
    });
  }
});

// @route   PUT /api/v1/companies/:id/policies
// @desc    Set work hours/policies
// @access  Private (Company Admin only)
router.put('/:id/policies', protect, authorize('company_admin'), [
  param('id').isUUID(),
  body('workHours').optional().isObject(),
  body('policies').optional().isArray(),
  body('benefits').optional().isArray(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;

    // Check company ownership
    const companyCheck = await dbQuery(
      'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
      [id, authReq.user!.id]
    );

    if (companyCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this company'
      });
    }

    // Placeholder implementation
    res.json({
      success: true,
      message: 'Work hours and policies updated successfully'
    });

  } catch (error) {
    logger.error('Set work hours/policies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update work hours and policies'
    });
  }
});

// @route   PUT /api/v1/companies/:id/verify
// @desc    Verify company registration
// @access  Private (Company Admin only)
router.put('/:id/verify', protect, authorize('company_admin'), [
  param('id').isUUID(),
  body('verificationDocuments').optional().isArray(),
  body('businessLicense').optional().trim(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;

    // Check company ownership
    const companyCheck = await dbQuery(
      'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
      [id, authReq.user!.id]
    );

    if (companyCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this company'
      });
    }

    // Placeholder implementation
    res.json({
      success: true,
      message: 'Company registration verification submitted successfully'
    });

  } catch (error) {
    logger.error('Verify company registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify company registration'
    });
  }
});

// @route   PUT /api/v1/companies/:id/approval-workflows
// @desc    Setup job posting approval workflows
// @access  Private (Company Admin only)
router.put('/:id/approval-workflows', protect, authorize('company_admin'), [
  param('id').isUUID(),
  body('workflows').isArray().withMessage('Workflows must be an array'),
  body('workflows.*.name').trim().isLength({ min: 1, max: 100 }),
  body('workflows.*.steps').isArray(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;

    // Check company ownership
    const companyCheck = await dbQuery(
      'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
      [id, authReq.user!.id]
    );

    if (companyCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this company'
      });
    }

    // Placeholder implementation
    res.json({
      success: true,
      message: 'Job posting approval workflows updated successfully'
    });

  } catch (error) {
    logger.error('Setup approval workflows error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to setup approval workflows'
    });
  }
});

// @route   PUT /api/v1/companies/:id/archive
// @desc    Archive old company profiles
// @access  Private (Company Admin only)
router.put('/:id/archive', protect, authorize('company_admin'), [
  param('id').isUUID(),
  body('archive').isBoolean(),
  body('reason').optional().trim().isLength({ max: 500 }),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;

    // Check company ownership
    const companyCheck = await dbQuery(
      'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
      [id, authReq.user!.id]
    );

    if (companyCheck.rows.length === 0) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to manage this company'
      });
    }

    // Placeholder implementation
    res.json({
      success: true,
      message: 'Company profile archived successfully'
    });

  } catch (error) {
    logger.error('Archive company profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to archive company profile'
    });
  }
});

// @route   PUT /api/v1/companies/policies
// @desc    Set work hours/policies
// @access  Private (Companies only)
router.put('/policies', protect, authorize('company_admin'), [
  body('workHours').optional().isObject().withMessage('Work hours must be an object'),
  body('policies').optional().isArray().withMessage('Policies must be an array'),
  body('benefits').optional().isArray().withMessage('Benefits must be an array'),
  validateRequest
], withAuth(setWorkHoursPolicies));

// @route   POST /api/v1/companies/verify
// @desc    Verify company registration
// @access  Private (Companies only)
router.post('/verify', protect, authorize('company_admin'), [
  body('registrationNumber').isString().withMessage('Registration number must be a string'),
  body('taxId').optional().isString().withMessage('Tax ID must be a string'),
  body('documents').optional().isArray().withMessage('Documents must be an array'),
  validateRequest
], withAuth(verifyCompanyRegistration));

// @route   POST /api/v1/companies/approval-workflows
// @desc    Setup job posting approval workflows
// @access  Private (Companies only)
router.post('/approval-workflows', protect, authorize('company_admin'), [
  body('workflows').isArray().withMessage('Workflows must be an array'),
  body('workflows.*.name').isString().withMessage('Workflow name must be a string'),
  body('workflows.*.steps').isArray().withMessage('Steps must be an array'),
  validateRequest
], withAuth(setupJobPostingApprovalWorkflows));

// @route   POST /api/v1/companies/archive
// @desc    Archive old company profiles
// @access  Private (Companies only)
router.post('/archive', protect, authorize('company_admin'), [
  body('profileIds').isArray().withMessage('Profile IDs must be an array'),
  body('profileIds.*').isInt().withMessage('Each profile ID must be an integer'),
  validateRequest
], withAuth(archiveOldCompanyProfiles));

// Company Profile Management (Story 26)

// Company Locations Management (Story 27)

// @route   POST /api/v1/companies/locations
// @desc    Add company location
// @access  Private (Company Admin only)
router.post('/locations', protect, authorize('company_admin'), [
  body('name').optional().trim().isLength({ max: 255 }),
  body('type').isIn(['headquarters', 'branch', 'remote_hub', 'coworking', 'office']),
  body('addressLine1').trim().isLength({ min: 1, max: 255 }),
  body('addressLine2').optional().trim().isLength({ max: 255 }),
  body('city').trim().isLength({ min: 1, max: 100 }),
  body('state').optional().trim().isLength({ max: 100 }),
  body('postalCode').optional().trim().isLength({ max: 20 }),
  body('country').trim().isLength({ min: 1, max: 100 }),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().isEmail(),
  body('hours').optional().isObject(),
  body('amenities').optional().isArray(),
  body('isHiring').optional().isBoolean(),
  body('employeeCount').optional().isInt({ min: 0 }),
  validateRequest
], withAuth(addCompanyLocation));

// @route   PUT /api/v1/companies/locations/:id
// @desc    Update company location
// @access  Private (Company Admin only)
// In your companies.routes.ts - Update the PUT route
router.put('/locations/:id', protect, authorize('company_admin'), [
  param('id').isUUID().withMessage('Invalid location ID'),
  body('name').optional(),
  body('type').optional().isIn(['headquarters', 'branch', 'remote_hub', 'coworking', 'office']),
  body('addressLine1').optional(),
  body('addressLine2').optional(),
  body('city').optional(),
  body('state').optional(),
  body('postalCode').optional(),
  body('country').optional(),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('phone').optional(),
  body('email').optional().isEmail(),
  body('hours').optional(),
  body('amenities').optional(),
  body('isHiring').optional().isBoolean(),
  // 🔧 FIX: Make employeeCount optional and handle string conversion
  body('employeeCount').optional().custom((value) => {
    if (value === undefined || value === null || value === '') return true;
    const num = typeof value === 'string'? parseInt(value, 10) : value;
    return !isNaN(num) && num >= 0;
  }).withMessage('Employee count must be a non-negative number'),
  validateRequest
], withAuth(updateCompanyLocation));

// @route   DELETE /api/v1/companies/locations/:id
// @desc    Delete company location
// @access  Private (Company Admin only)
router.delete('/locations/:id', protect, authorize('company_admin'), [
  param('id').isUUID(),
  validateRequest
], withAuth(deleteCompanyLocation));

// @route   GET /api/v1/companies/locations
// @desc    Get company locations
// @access  Private (Company Admin only)
router.get('/locations', protect, authorize('company_admin'), withAuth(getCompanyLocations));

// Company Culture Management (Story 28)

// @route   GET /api/v1/companies/culture
// @desc    Get company culture
// @access  Private (Company Admin only)
router.get('/culture', protect, authorize('company_admin'), withAuth(getCompanyCulture));

// Company Team Management (Story 29)

// @route   POST /api/v1/companies/team
// @desc    Add team member
// @access  Private (Company Admin only)
router.post('/team', protect, authorize('company_admin'), [
  body('name').trim().isLength({ min: 1, max: 255 }),
  body('title').trim().isLength({ min: 1, max: 255 }),
  body('department').optional().trim().isLength({ max: 255 }),
  body('email').optional().custom((value) => !value || value === ''|| /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('bio').optional().trim().isLength({ max: 1000 }),
  body('expertise').optional().isArray(),
  body('linkedinUrl').optional().custom((value) => !value || value === ''|| /^https?:\/\/.+/.test(value)),
  body('role').optional().isIn(['admin', 'recruiter', 'reviewer', 'viewer']),
  body('displayOnProfile').optional().isBoolean(),
  body('isLeadership').optional().isBoolean(),
  body('displayOrder').optional().isInt({ min: 0 }),
  validateRequest
], withAuth(addTeamMember));

// @route   PUT /api/v1/companies/team/:id
// @desc    Update team member
// @access  Private (Company Admin only)
router.put('/team/:id', protect, authorize('company_admin'), [
  param('id').isUUID(),
  body('name').optional().trim().isLength({ min: 1, max: 255 }),
  body('title').optional().trim().isLength({ min: 1, max: 255 }),
  body('department').optional().trim().isLength({ max: 255 }),
  body('email').optional().custom((value) => !value || value === ''|| /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('bio').optional().trim().isLength({ max: 1000 }),
  body('expertise').optional().isArray(),
  body('linkedinUrl').optional().custom((value) => !value || value === ''|| /^https?:\/\/.+/.test(value)),
  body('role').optional().isIn(['admin', 'recruiter', 'reviewer', 'viewer']),
  body('displayOnProfile').optional().isBoolean(),
  body('isLeadership').optional().isBoolean(),
  body('displayOrder').optional().isInt({ min: 0 }),
  validateRequest
], withAuth(updateTeamMember));

// @route   DELETE /api/v1/companies/team/:id
// @desc    Delete team member
// @access  Private (Company Admin only)
router.delete('/team/:id', protect, authorize('company_admin'), [
  param('id').isUUID(),
  validateRequest
], withAuth(deleteTeamMember));

// @route   GET /api/v1/companies/team
// @desc    Get company team
// @access  Private (Company Admin only)
router.get('/team', protect, authorize('company_admin'), withAuth(getCompanyTeam));

// @route   POST /api/v1/companies/team/:id/photo
// @desc    Upload team member photo
// @access  Private (Company Admin only)
router.post('/team/:id/photo', protect, authorize('company_admin'), upload.single('photo'), [
  param('id').isUUID(),
  validateRequest
], withAuth(uploadTeamMemberPhoto));

// @route   GET /api/v1/companies/projects
// @desc    Get company projects
// @access  Private (Company Admin only)
router.get('/projects', protect, authorize('company_admin'), withAuth(getCompanyProjects));

// @route   POST /api/v1/companies/projects
// @desc    Add company project
// @access  Private (Company Admin only)
router.post('/projects', protect, authorize('company_admin'), [
  body('name')
    .notEmpty().withMessage('Project name is required')
    .trim()
    .isLength({ min: 2, max: 150 }).withMessage('Project name must be 2–150 characters'),

  body('description')
    .notEmpty().withMessage('Project description is required')
    .trim()
    .isLength({ min: 10, max: 3000 }).withMessage('Description must be 10–3 000 characters'),

  body('startDate')
    .notEmpty().withMessage('Start date is required')
    .isISO8601().withMessage('Start date must be a valid date (YYYY-MM-DD)'),

  body('endDate')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage('End date must be a valid date (YYYY-MM-DD)')
    .custom((value, { req }) => {
      if (value && req.body.startDate && value < req.body.startDate) {
        throw new Error('End date must be on or after start date');
      }
      return true;
    }),

  body('projectType')
    .notEmpty().withMessage('Project type is required')
    .isIn(['internal', 'client', 'open_source', 'research', 'product'])
    .withMessage('Project type must be one of: internal, client, open_source, research, product'),

  body('client')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Client name must be 255 characters or less'),

  body('industry')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['', 'Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing',
           'Retail', 'Consulting', 'Media', 'Real Estate', 'Transportation',
           'Energy', 'Agriculture', 'Construction', 'Hospitality', 'Other'])
    .withMessage('Invalid industry value'),

  body('teamSize')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1, max: 100000 }).withMessage('Team size must be a positive integer (max 100 000)'),

  body('technologies')
    .optional()
    .isArray({ max: 50 }).withMessage('Technologies must be an array of up to 50 items')
    .custom((arr: any[]) => {
      if (!Array.isArray(arr)) return true;
      for (const item of arr) {
        if (typeof item !== 'string') throw new Error('Each technology must be a string');
        if (item.trim().length === 0) throw new Error('Technology names cannot be empty');
        if (item.length > 100) throw new Error('Each technology name must be 100 characters or less');
      }
      return true;
    }),

  body('results')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 600 }).withMessage('Results must be 600 characters or less'),

  body('impact')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 600 }).withMessage('Impact must be 600 characters or less'),

  body('awards')
    .optional()
    .isArray({ max: 20 }).withMessage('Awards must be an array of up to 20 items')
    .custom((arr: any[]) => {
      if (!Array.isArray(arr)) return true;
      for (const item of arr) {
        if (typeof item !== 'string') throw new Error('Each award must be a string');
        if (item.trim().length === 0) throw new Error('Award names cannot be empty');
        if (item.length > 255) throw new Error('Each award must be 255 characters or less');
      }
      return true;
    }),

  body('websiteUrl')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isURL({ protocols: ['http', 'https'], require_protocol: false })
    .withMessage('Website URL must be a valid URL (e.g. https://project.com)'),

  body('githubUrl')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isURL({ protocols: ['http', 'https'], require_protocol: false })
    .withMessage('GitHub URL must be a valid URL (e.g. https://github.com/org/repo)'),

  body('featured')
    .optional()
    .isBoolean().withMessage('Featured must be true or false'),

  body('displayOrder')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0, max: 999 }).withMessage('Display order must be between 0 and 999'),

  validateRequest
], withAuth(addCompanyProject));

// @route   PUT /api/v1/companies/projects/:id
// @desc    Update company project
// @access  Private (Company Admin only)
router.put('/projects/:id', protect, authorize('company_admin'), [
  param('id')
    .isUUID().withMessage('Invalid project ID'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 150 }).withMessage('Project name must be 2–150 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 3000 }).withMessage('Description must be 10–3 000 characters'),

  body('startDate')
    .optional()
    .isISO8601().withMessage('Start date must be a valid date (YYYY-MM-DD)'),

  body('endDate')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage('End date must be a valid date (YYYY-MM-DD)')
    .custom((value, { req }) => {
      if (value && req.body.startDate && value < req.body.startDate) {
        throw new Error('End date must be on or after start date');
      }
      return true;
    }),

  body('projectType')
    .optional()
    .isIn(['internal', 'client', 'open_source', 'research', 'product'])
    .withMessage('Project type must be one of: internal, client, open_source, research, product'),

  body('client')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Client name must be 255 characters or less'),

  body('industry')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['', 'Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing',
           'Retail', 'Consulting', 'Media', 'Real Estate', 'Transportation',
           'Energy', 'Agriculture', 'Construction', 'Hospitality', 'Other'])
    .withMessage('Invalid industry value'),

  body('teamSize')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1, max: 100000 }).withMessage('Team size must be a positive integer (max 100 000)'),

  body('technologies')
    .optional()
    .isArray({ max: 50 }).withMessage('Technologies must be an array of up to 50 items')
    .custom((arr: any[]) => {
      if (!Array.isArray(arr)) return true;
      for (const item of arr) {
        if (typeof item !== 'string') throw new Error('Each technology must be a string');
        if (item.trim().length === 0) throw new Error('Technology names cannot be empty');
        if (item.length > 100) throw new Error('Each technology name must be 100 characters or less');
      }
      return true;
    }),

  body('results')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 600 }).withMessage('Results must be 600 characters or less'),

  body('impact')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 600 }).withMessage('Impact must be 600 characters or less'),

  body('awards')
    .optional()
    .isArray({ max: 20 }).withMessage('Awards must be an array of up to 20 items')
    .custom((arr: any[]) => {
      if (!Array.isArray(arr)) return true;
      for (const item of arr) {
        if (typeof item !== 'string') throw new Error('Each award must be a string');
        if (item.trim().length === 0) throw new Error('Award names cannot be empty');
        if (item.length > 255) throw new Error('Each award must be 255 characters or less');
      }
      return true;
    }),

  body('websiteUrl')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isURL({ protocols: ['http', 'https'], require_protocol: false })
    .withMessage('Website URL must be a valid URL'),

  body('githubUrl')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isURL({ protocols: ['http', 'https'], require_protocol: false })
    .withMessage('GitHub URL must be a valid URL'),

  body('featured')
    .optional()
    .isBoolean().withMessage('Featured must be true or false'),

  body('displayOrder')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0, max: 999 }).withMessage('Display order must be between 0 and 999'),

  validateRequest
], withAuth(updateCompanyProject));

// @route   DELETE /api/v1/companies/projects/:id
// @desc    Delete company project
// @access  Private (Company Admin only)
router.delete('/projects/:id', protect, authorize('company_admin'), [
  param('id').isUUID(),
  validateRequest
], withAuth(deleteCompanyProject));

// @route   POST /api/v1/companies/projects/:id/media
// @desc    Upload project media
// @access  Private (Company Admin only)
router.post('/projects/:id/media', protect, authorize('company_admin'), upload.single('media'), [
  param('id').isUUID(),
  validateRequest
], withAuth(uploadProjectMedia));

// @route   DELETE /api/v1/companies/projects/:id/media/:mediaKey
// @desc    Delete project media
// @access  Private (Company Admin only)
router.delete('/projects/:id/media/:mediaKey', protect, authorize('company_admin'), [
  param('id').isUUID(),
  param('mediaKey').trim().isLength({ min: 1 }),
  validateRequest
], withAuth(deleteProjectMedia));

// @route   GET /api/v1/companies/jobs
// @desc    Get jobs for the user's company
// @access  Private (Recruiters and Company Admins)
router.get('/jobs', protect, authorize('recruiter', 'company_admin'), [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().custom((value) => {
    if (!value) return true;
    const statuses = value.split(',');
    const validStatuses = ['draft', 'active', 'paused', 'closed', 'archived', 'published'];
    return statuses.every((status: string) => validStatuses.includes(status.trim()));
  }).withMessage('Invalid status value(s). Must be comma-separated list of: draft, active, paused, closed, archived, published'),
  query('search').optional().isString().trim(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { page = 1, limit = 20, status, search } = req.query as {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    };

    const offset = (page - 1) * limit;

    // Get user's company ID - prioritize company_team lookup
    let companyId: string | null = null;

    console.log('Getting company jobs for user:', {
      userId: authReq.user.id,
      userType: authReq.user.user_type,
      companyId: authReq.user.company_id
    });

    if (authReq.user.user_type === 'company_admin'|| authReq.user.user_type === 'recruiter') {
      // Always lookup from company_team table first to ensure correct company
      const teamResult = await dbQuery(
        'SELECT company_id FROM company_team WHERE user_id = $1',
        [authReq.user.id]
      );
      console.log('Company team lookup result:', teamResult.rows);

      if (teamResult.rows.length > 0) {
        companyId = teamResult.rows[0].company_id;
        console.log('Found company_id from company_team:', companyId);
      } else {
        // Fallback to token company_id if not found in company_team
        companyId = authReq.user.company_id ? String(authReq.user.company_id) : null;
        console.log('Using fallback company_id from token:', companyId);
      }
    }

    if (!companyId) {
      console.log('No company found for user, returning 404');
      res.status(404).json({
        success: false,
        message: 'Company not found for this user'
      });
      return;
    }

    // Build query
    let whereConditions = ['j.company_id = $1'];
    let params: (string | number)[] = [companyId];
    let paramIndex = 2;

    if (status) {
      const statusList = status.split(',').map((s: string) => s.trim());
      const placeholders = statusList.map((_, index) => `$${paramIndex + index}`).join(', ');
      whereConditions.push(`j.status IN (${placeholders})`);
      params.push(...statusList);
      paramIndex += statusList.length;
    } else {
      whereConditions.push(`j.status NOT IN ('archived', 'deleted')`);
    }

    if (search) {
      whereConditions.push(`(j.title ILIKE $${paramIndex} OR j.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.join('AND ');

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM jobs j WHERE ${whereClause}`;
    const countResult = await dbQuery(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get jobs
    const jobsQuery = `
      SELECT
        j.id, j.title, j.department, j.job_type, j.work_arrangement,
        j.locations, j.description, j.requirements, j.salary_min,
        j.salary_max, j.salary_currency, j.salary_visible, j.status,
        j.visibility, j.created_at, j.updated_at,
        j.published_at, j.expires_at,
        COUNT(a.id) as applications_count,
        (SELECT COUNT(DISTINCT s2.user_id) FROM simulations s2
           WHERE s2.job_id = j.id AND s2.status = 'completed') as results_count
      FROM jobs j
      LEFT JOIN applications a ON j.id = a.job_id
      WHERE ${whereClause}
      GROUP BY j.id
      ORDER BY j.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const jobsResult = await dbQuery(jobsQuery, params);

    // Calculate pagination
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    res.json({
      success: true,
      data: {
        jobs: jobsResult.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev
        }
      }
    });

  } catch (error) {
    logger.error('Get company jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch company jobs'
    });
  }
});

// @route   GET /api/v1/companies/:id
// @desc    Get company details
// @access  Public
router.get('/:id', [
  param('id').isUUID(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const companyQuery = `
      SELECT
        c.*,
        (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id AND j.status = 'active') as active_jobs,
        (SELECT COUNT(*) FROM company_team ct WHERE ct.company_id = c.id) as team_size,
        (SELECT COUNT(*) FROM applications a JOIN jobs j ON a.job_id = j.id WHERE j.company_id = c.id) as total_applications
      FROM companies c
      WHERE c.id = $1
    `;

    const companyResult = await dbQuery(companyQuery, [id]);

    if (companyResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Company not found'
      });
      return;
    }

    const company = companyResult.rows[0];

    // Get company culture/perks
    const cultureQuery = `
      SELECT * FROM company_culture
      WHERE company_id = $1
      ORDER BY created_at DESC
    `;
    const cultureResult = await dbQuery(cultureQuery, [id]);

    // Get recent jobs
    const jobsQuery = `
      SELECT id, title, location, job_type, experience_level, salary_min, salary_max, currency, created_at
      FROM jobs
      WHERE company_id = $1 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 5
    `;
    const jobsResult = await dbQuery(jobsQuery, [id]);

    res.json({
      success: true,
      data: {
        company,
        culture: cultureResult.rows,
        recentJobs: jobsResult.rows
      }
    });

  } catch (error) {
    logger.error('Get company error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch company'
    });
  }
});

export default router;


