import express, { Router, Request, Response } from 'express';
import { body, query, param } from 'express-validator';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { query as dbQuery, getClient } from '../../config/database.js';
import { getFullFileUrl } from '../../utils/fileUrl.js';
import { logger } from '../../utils/logger.js';
import { AuthenticatedRequest } from '../../types/auth.types.js';
import { withAuth } from '../../utils/auth.utils.js';
import {
  addPortfolioLink,
  addPortfolioLinks,
  setAvailabilityStatus,
  controlProfilePrivacy,
  downloadProfileData,
  addEducation,
  updateEducation,
  deleteEducation,
  addWorkExperience,
  updateWorkExperience,
  deleteWorkExperience,
  addSkill,
  updateSkill,
  deleteSkill,
  updatePortfolioLink,
  deletePortfolioLink,
  uploadResume,
  deleteResume,
  downloadResume,
  getProfile,
  updatePreferences,
  updateAvailability,
  updatePrivacySettings,
  completeProfile,
  getProfileCompletionStatus,
  getSkillsList,
  updateProfile,
  setPrimaryResume,
  getFullCandidateProfileById
} from '../../controllers/candidate.controller.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// =====================================================
// FIX: Create __dirname for ES modules
// =====================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router: Router = express.Router();

// =====================================================
// CREATE UPLOAD DIRECTORIES
// =====================================================
const uploadDir = path.join(__dirname, '../../../uploads');
const resumesDir = path.join(uploadDir, 'resumes');
const photosDir = path.join(uploadDir, 'photos');

[uploadDir, resumesDir, photosDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// =====================================================
// MULTER CONFIGURATION
// =====================================================
const resumeStorage = multer.diskStorage({
  destination: (req: any, file, cb) => cb(null, resumesDir),
  filename: (req: any, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `resume-${(req as AuthenticatedRequest).user?.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const photoStorage = multer.diskStorage({
  destination: (req: any, file, cb) => cb(null, photosDir),
  filename: (req: any, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `photo-${(req as AuthenticatedRequest).user?.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const resumeUpload = multer({
  storage: resumeStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    cb(null, allowed.includes(file.mimetype));
  }
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

// =====================================================
// PROFILE ROUTES
// =====================================================

router.get('/profile', protect, authorize('candidate'), withAuth(getProfile));
router.get('/profile/:userId', protect, withAuth(getProfile));
router.put('/profile', protect, authorize('candidate'), withAuth(updateProfile));

router.post('/profile/photo', protect, authorize('candidate'), photoUpload.single('photo'), async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No photo file provided' });
      return;
    }
    const photoKey = `photos/${req.file.filename}`;
    const photoUrl = getFullFileUrl(photoKey);
    await dbQuery(
      `UPDATE candidate_profiles SET profile_photo_url = $1, profile_photo_key = $2, updated_at = NOW() WHERE user_id = $3`,
      [photoUrl, photoKey, authReq.user!.id]
    );
    res.json({ success: true, data: { photoUrl, photoKey }, message: 'Profile photo uploaded successfully' });
  } catch (error) {
    logger.error('Upload profile photo error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload profile photo' });
  }
});

// =====================================================
// PROFILE COMPLETION ROUTES
// =====================================================

router.post('/complete-profile', protect, authorize('candidate'), withAuth(completeProfile));
router.get('/profile-completion-status', protect, authorize('candidate'), withAuth(getProfileCompletionStatus));

// =====================================================
// PREFERENCES & SETTINGS ROUTES
// =====================================================

router.put('/preferences', protect, authorize('candidate'), withAuth(updatePreferences));
router.put('/availability', protect, authorize('candidate'), withAuth(updateAvailability));
router.put('/privacy', protect, authorize('candidate'), withAuth(updatePrivacySettings));

// Legacy routes
router.put('/profile/preferences', protect, authorize('candidate'), withAuth(updatePreferences));
router.put('/profile/availability', protect, authorize('candidate'), withAuth(setAvailabilityStatus));
router.put('/profile/privacy', protect, authorize('candidate'), withAuth(controlProfilePrivacy));
router.get('/profile/export', protect, authorize('candidate'), withAuth(downloadProfileData));
router.get('/export', protect, authorize('candidate'), withAuth(downloadProfileData));

// =====================================================
// EDUCATION ROUTES (ONCE - USING CONTROLLER)
// =====================================================

router.post('/education', protect, authorize('candidate'), [
  body('institution').trim().notEmpty(),
  body('degree').trim().notEmpty(),
  body('fieldOfStudy').trim().notEmpty(),
  body('startDate').isISO8601(),
  body('endDate').optional().isISO8601(),
  body('isCurrent').optional().isBoolean(),
  validateRequest
], withAuth(addEducation));

router.put('/education/:id', protect, authorize('candidate'), [
  param('id').isUUID(),
  validateRequest
], withAuth(updateEducation));

router.delete('/education/:id', protect, authorize('candidate'), [
  param('id').isUUID(),
  validateRequest
], withAuth(deleteEducation));

// =====================================================
// WORK EXPERIENCE ROUTES (ONCE - USING CONTROLLER)
// =====================================================

router.post('/experience', protect, authorize('candidate'), [
  body('company').trim().notEmpty(),
  body('title').trim().notEmpty(),
  body('employmentType').isIn(['full-time', 'part-time', 'contract', 'internship', 'freelance', 'self-employed']),
  body('startDate').isISO8601(),
  body('endDate').optional().isISO8601(),
  body('isCurrent').optional().isBoolean(),
  validateRequest
], withAuth(addWorkExperience));

router.put('/experience/:id', protect, authorize('candidate'), [
  param('id').isUUID(),
  validateRequest
], withAuth(updateWorkExperience));

router.delete('/experience/:id', protect, authorize('candidate'), [
  param('id').isUUID(),
  validateRequest
], withAuth(deleteWorkExperience));

// =====================================================
// SKILLS ROUTES (ONCE - USING CONTROLLER)
// =====================================================

router.get('/skills-list', getSkillsList);

router.post('/skills', protect, authorize('candidate'), [
  body('skillId').optional().isUUID(),
  body('skillName').optional().trim().notEmpty(),
  body('proficiencyLevel').optional().isInt({ min: 1, max: 5 }),
  body('yearsExperience').optional().isFloat({ min: 0, max: 50 }),
  body('isPrimary').optional().isBoolean(),
  validateRequest
], withAuth(addSkill));

router.put('/skills/:skillId', protect, authorize('candidate'), [
  param('skillId').isUUID(),
  body('proficiencyLevel').optional().isInt({ min: 1, max: 5 }),
  body('yearsExperience').optional().isFloat({ min: 0, max: 50 }),
  body('isPrimary').optional().isBoolean(),
  validateRequest
], withAuth(updateSkill));

router.delete('/skills/:skillId', protect, authorize('candidate'), [
  param('skillId').isUUID(),
  validateRequest
], withAuth(deleteSkill));

// =====================================================
// PORTFOLIO LINKS ROUTES
// =====================================================

router.post('/portfolio', protect, authorize('candidate'), [
  body('platform').isIn(['personal', 'github', 'linkedin', 'professional', 'portfolio', 'behance', 'dribbble', 'medium', 'other']),
  body('url').isURL(),
  body('title').optional().isString(),
  body('description').optional().isString(),
  body('displayOrder').optional().isInt({ min: 0 }),
  validateRequest
], withAuth(addPortfolioLink));

router.post('/portfolio/batch', protect, authorize('candidate'), [
  body('links').isArray(),
  validateRequest
], withAuth(addPortfolioLinks));

router.put('/portfolio/:id', protect, authorize('candidate'), [
  param('id').isUUID(),
  validateRequest
], withAuth(updatePortfolioLink));

router.delete('/portfolio/:id', protect, authorize('candidate'), [
  param('id').isUUID(),
  validateRequest
], withAuth(deletePortfolioLink));

// =====================================================
// RESUME ROUTES
// =====================================================

router.post('/resume', protect, authorize('candidate'), resumeUpload.single('resume'), withAuth(uploadResume));

router.get('/resume/:id/download', protect, authorize('candidate'), [
  param('id').isUUID(),
  validateRequest
], withAuth(downloadResume));

router.delete('/resume/:id', protect, authorize('candidate'), [
  param('id').isUUID(),
  validateRequest
], withAuth(deleteResume));

router.put('/resume/:id/primary', protect, authorize('candidate'), [
  param('id').isUUID(),
  validateRequest
], withAuth(setPrimaryResume));

// =====================================================
// SEARCH ROUTES
// =====================================================

router.get('/search', protect, authorize('recruiter', 'company_admin'), [
  query('q').optional().isString(),
  query('location').optional().isString(),
  query('skills').optional().isString(),
  query('minSalary').optional().isInt({ min: 0 }),
  query('maxSalary').optional().isInt({ min: 0 }),
  query('availability').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    let whereConditions: string[] = ['cp.user_id IS NOT NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    const { q, location, skills, minSalary, maxSalary, availability } = req.query;

    if (q) {
      whereConditions.push(`(cp.first_name ILIKE $${paramIndex} OR cp.last_name ILIKE $${paramIndex} OR cp.headline ILIKE $${paramIndex} OR cp.summary ILIKE $${paramIndex})`);
      params.push(`%${q}%`);
      paramIndex++;
    }

    if (location) {
      whereConditions.push(`(cp.city ILIKE $${paramIndex} OR cp.country ILIKE $${paramIndex})`);
      params.push(`%${location}%`);
      paramIndex++;
    }

    if (minSalary) {
      whereConditions.push(`(cp.expected_salary->>'amount')::numeric >= $${paramIndex}`);
      params.push(minSalary);
      paramIndex++;
    }

    if (maxSalary) {
      whereConditions.push(`(cp.expected_salary->>'amount')::numeric <= $${paramIndex}`);
      params.push(maxSalary);
      paramIndex++;
    }

    if (availability) {
      whereConditions.push(`cp.availability->>'status' = $${paramIndex}`);
      params.push(availability);
      paramIndex++;
    }

    if (skills) {
      const skillArray = (skills as string).split(',').map(s => s.trim());
      whereConditions.push(`cp.user_id IN (
        SELECT us.user_id FROM user_skills us
        JOIN skills s ON us.skill_id = s.id
        WHERE s.name = ANY($${paramIndex})
        GROUP BY us.user_id
        HAVING COUNT(DISTINCT us.skill_id) = $${paramIndex + 1}
      )`);
      params.push(skillArray, skillArray.length);
      paramIndex += 2;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) as total FROM candidate_profiles cp ${whereClause}`;
    const countResult = await dbQuery(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || '0');

    const candidatesQuery = `
      SELECT 
        cp.*,
        u.email,
        (SELECT json_agg(json_build_object('name', s.name, 'proficiency_level', us.proficiency_level)) 
         FROM user_skills us 
         JOIN skills s ON us.skill_id = s.id 
         WHERE us.user_id = cp.user_id) as skills
      FROM candidate_profiles cp
      JOIN users u ON cp.user_id = u.id
      ${whereClause}
      ORDER BY cp.updated_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);
    const candidatesResult = await dbQuery(candidatesQuery, params);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        candidates: candidatesResult.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    logger.error('Search candidates error:', error);
    res.status(500).json({ success: false, message: 'Failed to search candidates' });
  }
});

// =====================================================
// FULL CANDIDATE PROFILE BY ID
// =====================================================

// @route   GET /api/v1/candidates/full-profile/:userId
// @desc    Get complete candidate profile with all sections by user ID
// @access  Private (Recruiters, Company Admins, or own profile)
router.get('/full-profile/:userId', protect, withAuth(getFullCandidateProfileById));

export default router;