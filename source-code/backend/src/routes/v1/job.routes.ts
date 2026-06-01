import express, { Router, Request, Response } from 'express';
import { query, param, body } from 'express-validator';
import jobController from '../../controllers/job.controller.js';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { withAuth } from '../../utils/auth.utils.js';
import { AuthenticatedRequest } from '../../types/auth.types.js';

const router: Router = express.Router();

// =====================================================
// ⚠️ SAVED JOBS ROUTES - MUST BE FIRST (NO :id parameters)
// ✅ ACCESSIBLE BY ALL AUTHENTICATED USERS (no role restriction)
// =====================================================

// @route   GET /api/v1/jobs/saved
// @desc    Get saved jobs
// @access  Private (all authenticated users)
router.get('/saved', 
  protect,  // Only requires authentication, no role restriction
  (req: Request, res: Response) => {
    jobController.getSavedJobs(req as AuthenticatedRequest, res);
  }
);

// @route   POST /api/v1/jobs/saved/:jobId
// @desc    Save a job
// @access  Private (all authenticated users)
router.post('/saved/:jobId', 
  protect,
  [
    param('jobId').isUUID().withMessage('Invalid job ID format'),
    validateRequest
  ],
  (req: Request, res: Response) => {
    jobController.saveJob(req as AuthenticatedRequest, res);
  }
);

// @route   DELETE /api/v1/jobs/saved/:jobId
// @desc    Remove saved job
// @access  Private (all authenticated users)
router.delete('/saved/:jobId', 
  protect,
  [
    param('jobId').isUUID().withMessage('Invalid job ID format'),
    validateRequest
  ],
  (req: Request, res: Response) => {
    jobController.unsaveJob(req as AuthenticatedRequest, res);
  }
);

// @route   GET /api/v1/jobs/saved/:jobId/check
// @desc    Check if job is saved
// @access  Private (all authenticated users)
router.get('/saved/:jobId/check', 
  protect,
  [
    param('jobId').isUUID().withMessage('Invalid job ID format'),
    validateRequest
  ],
  (req: Request, res: Response) => {
    jobController.isJobSaved(req as AuthenticatedRequest, res);
  }
);

// ============ SPECIFIC ROUTES FIRST (BEFORE :id) ============

// @route   GET /api/v1/jobs/suggestions
// @desc    Get unique suggestions for skills, responsibilities, requirements, benefits
// @access  Private (recruiter, company_admin)
router.get('/suggestions', protect, authorize('recruiter', 'company_admin'), (req: Request, res: Response) => {
  jobController.getSuggestions(req, res);
});

// @route   GET /api/v1/jobs/templates
// @desc    Get job templates for quick job creation
// @access  Public
router.get('/templates', withAuth(jobController.getJobTemplates.bind(jobController)));

// @route   GET /api/v1/jobs/my-jobs
// @desc    Get jobs for the authenticated user's company
// @access  Private (recruiter, company_admin)
router.get('/my-jobs', protect, authorize('recruiter', 'company_admin'), (req: Request, res: Response) => {
  jobController.getMyJobs(req as any, res);
});

// @route   GET /api/v1/jobs/debug/user-company
// @desc    Debug endpoint to check user-company relationship
// @access  Private (debug only)
router.get('/debug/user-company', protect, (req: Request, res: Response) => {
  jobController.debugUserCompany(req as any, res);
});

// @route   GET /api/v1/jobs/education-requirements/:id
// @desc    Get education requirements for a specific job
// @access  Public
router.get('/education-requirements/:id', [
  param('id').isUUID().withMessage('Invalid job ID format'),
  validateRequest
], (req: Request, res: Response) => {
  jobController.getEducationRequirements(req, res);
});

// ============ POST ROUTES (Create) ============

// @route   POST /api/v1/jobs
// @desc    Create a new job
// @access  Private (recruiter, company_admin)
router.post('/', [
  protect,
  authorize('recruiter', 'company_admin'),
  body('title').isString().trim().isLength({ min: 1, max: 255 }).withMessage('Title must be 1-255 characters'),
  body('description').isString().trim().isLength({ min: 1, max: 10000 }).withMessage('Description must be 1-10000 characters'),
  
  // Locations - array of location objects
  body('locations').optional().isArray(),
  body('locations.*.city').optional().isString(),
  body('locations.*.country').optional().isString(),
  body('locations.*.state').optional().isString(),
  body('locations.*.postal_code').optional().isString(),
  body('locations.*.is_remote').optional().isBoolean(),
  
  // Job details
  body('jobType').optional().isIn(['full-time', 'part-time', 'contract', 'internship', 'freelance', 'temporary']),
  body('workArrangement').optional().isIn(['onsite', 'remote', 'hybrid', 'flexible']),
  body('experienceLevel').optional().isIn(['entry', 'mid', 'senior', 'lead', 'executive']),
  body('department').optional().isString().trim(),
  body('team').optional().isString().trim(),
  
  // Dates
  body('publishedAt').optional().isISO8601(),
  body('expiresAt').optional().isISO8601(),
  body('postingDuration').optional().isInt({ min: 1, max: 365 }),
  
  // Salary
  body('salaryMin').optional().isFloat({ min: 0 }),
  body('salaryMax').optional().isFloat({ min: 0 }),
  body('salaryCurrency').optional().isString().isLength({ min: 3, max: 3 }),
  body('salaryPeriod').optional().isIn(['hour', 'month', 'year']),
  body('salaryVisible').optional().isBoolean(),
  
  // AI Match Score
  body('aiMatchRequiredScore').optional().isInt({ min: 0, max: 100 }).withMessage('AI match score must be between 0 and 100'),
  
  // Content arrays
  body('responsibilities').optional().isArray(),
  body('responsibilities.*').optional().isString(),
  body('requirements').optional().isArray(),
  body('requirements.*').optional().isString(),
  body('benefits').optional().isArray(),
  body('benefits.*').optional().isString(),
  body('tags').optional().isArray(),
  body('tags.*').optional().isString(),
  
  // Skills
  body('requiredSkills').optional().isArray(),
  body('requiredSkills.*.name').optional().isString(),
  body('requiredSkills.*.proficiency_level').optional().isInt({ min: 1, max: 5 }),
  body('requiredSkills.*.is_required').optional().isBoolean(),
  body('preferredSkills').optional().isArray(),
  body('preferredSkills.*.name').optional().isString(),
  body('preferredSkills.*.proficiency_level').optional().isInt({ min: 1, max: 5 }),
  body('preferredSkills.*.is_required').optional().isBoolean(),
  body('languageRequirements').optional().isArray(),
  body('experienceRequirements').optional().isArray(),
  
  // Education requirements - SUPPORTS MULTIPLE FORMATS
  body('educationLevel').optional().custom(value => {
    if (!value) return true;
    if (typeof value === 'string') return true;
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (value.minimum_degree && typeof value.minimum_degree !== 'string') {
        throw new Error('minimum_degree must be a string');
      }
      if (value.fields_of_study && !Array.isArray(value.fields_of_study)) {
        throw new Error('fields_of_study must be an array');
      }
      if (value.certifications && !Array.isArray(value.certifications)) {
        throw new Error('certifications must be an array');
      }
      return true;
    }
    if (Array.isArray(value)) {
      return value.every(item => typeof item === 'string');
    }
    throw new Error('Education level must be a string, object, or array of strings');
  }),
  
  // Screening questions
  body('screeningQuestions').optional().isArray(),
  body('screeningQuestions.*.question').optional().isString(),
  body('screeningQuestions.*.type').optional().isIn(['text', 'multiple_choice', 'yes_no', 'number', 'date']),
  body('screeningQuestions.*.required').optional().isBoolean(),
  body('screeningQuestions.*.options').optional().isArray(),
  
  // Application settings
  body('applicationLimit').optional().isInt({ min: 1 }),
  body('applicationMethod').optional().isString(),
  body('applicationInstructions').optional().isString(),
  body('requiredDocuments').optional().isArray(),
  body('visibility').optional().isIn(['public', 'internal', 'confidential', 'unlisted']),
  body('status').optional().isIn(['draft', 'active', 'paused', 'closed', 'archived']),
  
  // Custom validation
  body().custom((value) => {
    if (value.publishedAt && value.expiresAt) {
      const published = new Date(value.publishedAt);
      const expires = new Date(value.expiresAt);
      if (expires <= published) {
        throw new Error('Expiration date must be after published date');
      }
    }
    if (value.salaryMin && value.salaryMax && value.salaryMin > value.salaryMax) {
      throw new Error('Minimum salary cannot be greater than maximum salary');
    }
    if (value.salaryMin && value.salaryMin < 0) {
      throw new Error('Minimum salary cannot be negative');
    }
    if (value.salaryMax && value.salaryMax < 0) {
      throw new Error('Maximum salary cannot be negative');
    }
    return true;
  }),
  
  validateRequest
], (req: Request, res: Response) => {
  jobController.createJob(req as any, res);
});

// ============ DRAFT ROUTES ============

// @route   POST /api/v1/jobs/draft
// @desc    Save job as draft (without publishing)
// @access  Private (recruiter, company_admin)
router.post('/draft', [
  protect,
  authorize('recruiter', 'company_admin'),
  body('title').isString().trim().isLength({ min: 1, max: 255 }).withMessage('Title must be 1-255 characters'),
  body('description').optional().isString(),
  body('locations').optional().isArray(),
  body('jobType').optional().isString(),
  body('workArrangement').optional().isString(),
  body('department').optional().isString(),
  body('salaryMin').optional().isFloat({ min: 0 }),
  body('salaryMax').optional().isFloat({ min: 0 }),
  body('salaryCurrency').optional().isString(),
  body('requiredSkills').optional().isArray(),
  body('educationLevel').optional(),
  validateRequest
], (req: Request, res: Response) => {
  jobController.saveJobDraft(req as any, res);
});

// @route   POST /api/v1/jobs/draft/:id/publish
// @desc    Publish a draft job
// @access  Private (recruiter, company_admin)
router.post('/draft/:id/publish', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid draft ID format'),
  validateRequest
], (req: Request, res: Response) => {
  jobController.publishJobDraft(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/draft
// @desc    Convert active job back to draft
// @access  Private (recruiter, company_admin)
router.put('/:id/draft', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  validateRequest
], (req: Request, res: Response) => {
  jobController.saveAsDraft(req as any, res);
});

// ============ CANDIDATE JOB BROWSING ROUTES ============

// @route   GET /api/v1/jobs/candidate/list
// @desc    Get all active jobs for candidates with pagination
// @access  Public
router.get('/candidate/list', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  query('location').optional().isString(),
  query('jobType').optional().isString(),
  query('workArrangement').optional().isString(),
  query('experienceLevel').optional().isString(),
  query('salaryMin').optional().isInt({ min: 0 }),
  query('salaryMax').optional().isInt({ min: 0 }),
  query('industry').optional().isString(),
  query('skills').optional().isString(),
  query('sortBy').optional().isIn(['recent', 'salary_high', 'salary_low']),
  validateRequest
], jobController.getJobsForCandidates.bind(jobController));

// @route   GET /api/v1/jobs/candidate/:id
// @desc    Get a single job for candidates
// @access  Public
router.get('/candidate/:id', [
  param('id').isUUID().withMessage('Invalid job ID format'),
  validateRequest
], jobController.getJobForCandidate.bind(jobController));

// ============ DYNAMIC ROUTES (with :id - MUST COME AFTER SPECIFIC PATHS) ============

// @route   GET /api/v1/jobs
// @desc    Get all jobs with filtering
// @access  Public
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  query('location').optional().isString(),
  query('jobType').optional().isString(),
  query('experienceLevel').optional().isString(),
  query('salaryMin').optional().isInt({ min: 0 }),
  query('salaryMax').optional().isInt({ min: 0 }),
  query('companyId').optional().isUUID(),
  query('skills').optional().isString(),
  validateRequest
], (req: Request, res: Response) => {
  jobController.getJobs(req, res);
});

// @route   GET /api/v1/jobs/:id
// @desc    Get a single job by ID
// @access  Public
router.get('/:id', [
  param('id').isUUID().withMessage('Invalid job ID format'),
  validateRequest
], (req: Request, res: Response) => {
  jobController.getJob(req, res);
});

// @route   GET /api/v1/jobs/:id/preview
// @desc    Preview a job (for owners before publishing)
// @access  Private (job owner)
router.get('/:id/preview', [
  protect,
  param('id').isUUID().withMessage('Invalid job ID format'),
  validateRequest
], (req: Request, res: Response) => {
  jobController.previewJob(req as any, res);
});

// @route   GET /api/v1/jobs/:jobId/candidates
// @desc    Get all candidates who applied to a job with AI match scores
// @access  Private (recruiter, company_admin)
router.get('/:jobId/candidates',
  protect,
  authorize('recruiter', 'company_admin'),
  [
    param('jobId').isUUID().withMessage('Invalid job ID format'),
    validateRequest
  ],
  (req: Request, res: Response) => {
    jobController.getJobCandidatesWithMatches(req as AuthenticatedRequest, res);
  }
);

// @route   GET /api/v1/jobs/:id/education
// @desc    Get education requirements for a job
// @access  Public
router.get('/:id/education', [
  param('id').isUUID().withMessage('Invalid job ID format'),
  validateRequest
], (req: Request, res: Response) => {
  jobController.getEducationRequirements(req, res);
});

// @route   PUT /api/v1/jobs/:id
// @desc    Update an existing job
// @access  Private (recruiter, company_admin)
router.put('/:id', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('title').optional().isString().trim().isLength({ min: 1, max: 255 }),
  body('description').optional().isString(),
  body('locations').optional().isArray(),
  body('jobType').optional().isIn(['full-time', 'part-time', 'contract', 'internship', 'freelance', 'temporary']),
  body('workArrangement').optional().isIn(['onsite', 'remote', 'hybrid', 'flexible']),
  body('experienceLevel').optional().isIn(['entry', 'mid', 'senior', 'lead', 'executive']),
  body('department').optional().isString(),
  body('salaryMin').optional().isFloat({ min: 0 }),
  body('salaryMax').optional().isFloat({ min: 0 }),
  body('salaryCurrency').optional().isString().isLength({ min: 3, max: 3 }),
  body('salaryVisible').optional().isBoolean(),
  body('responsibilities').optional().isArray(),
  body('requirements').optional().isArray(),
  body('benefits').optional().isArray(),
  body('requiredSkills').optional().isArray(),
  body('preferredSkills').optional().isArray(),
  body('languageRequirements').optional().isArray(),
  body('experienceRequirements').optional().isArray(),
  body('tags').optional().isArray(),
  body('visibility').optional().isIn(['public', 'internal', 'confidential', 'unlisted']),
  body('status').optional().isIn(['draft', 'active', 'paused', 'closed', 'archived']),
  body('expiresAt').optional().isISO8601(),
  body('publishedAt').optional().isISO8601(),
  body('educationLevel').optional().custom(value => {
    if (!value) return true;
    if (typeof value === 'string') return true;
    if (typeof value === 'object') return true;
    if (Array.isArray(value)) return true;
    throw new Error('Invalid education level format');
  }),
  body().custom((value) => {
    if (value.salaryMin && value.salaryMax && value.salaryMin > value.salaryMax) {
      throw new Error('Minimum salary cannot be greater than maximum salary');
    }
    if (value.publishedAt && value.expiresAt) {
      const published = new Date(value.publishedAt);
      const expires = new Date(value.expiresAt);
      if (expires <= published) {
        throw new Error('Expiration date must be after published date');
      }
    }
    return true;
  }),
  validateRequest
], (req: Request, res: Response) => {
  jobController.updateJob(req as any, res);
});

// @route   DELETE /api/v1/jobs/:id
// @desc    Delete a job (soft delete)
// @access  Private (recruiter, company_admin)
router.delete('/:id', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  validateRequest
], (req: Request, res: Response) => {
  jobController.deleteJob(req as any, res);
});

// @route   POST /api/v1/jobs/:id/duplicate
// @desc    Duplicate an existing job
// @access  Private (recruiter, company_admin)
router.post('/:id/duplicate', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('title').optional().isString().trim(),
  body('status').optional().isIn(['active', 'draft']),
  validateRequest
], (req: Request, res: Response) => {
  jobController.duplicateJob(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/expiration
// @desc    Set or update job expiration date
// @access  Private (recruiter, company_admin)
router.put('/:id/expiration', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('expiresAt').optional().isISO8601(),
  body('postingDuration').optional().isInt({ min: 1, max: 365 }),
  validateRequest
], (req: Request, res: Response) => {
  jobController.setJobExpiration(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/extend
// @desc    Extend job deadline by specified days
// @access  Private (recruiter, company_admin)
router.put('/:id/extend', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('extensionDays').isInt({ min: 1, max: 180 }).withMessage('Extension must be 1-180 days'),
  validateRequest
], (req: Request, res: Response) => {
  jobController.extendJobDeadline(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/pause
// @desc    Pause or resume a job posting
// @access  Private (recruiter, company_admin)
router.put('/:id/pause', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('paused').optional().isBoolean(),
  validateRequest
], (req: Request, res: Response) => {
  jobController.pauseJob(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/resume
// @desc    Resume a paused job posting
// @access  Private (recruiter, company_admin)
router.put('/:id/resume', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  validateRequest
], (req: Request, res: Response) => {
  jobController.resumeJobPosting(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/archive
// @desc    Archive a job (no longer active)
// @access  Private (recruiter, company_admin)
router.put('/:id/archive', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  validateRequest
], (req: Request, res: Response) => {
  jobController.archiveJob(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/access
// @desc    Update job visibility/access level
// @access  Private (recruiter, company_admin)
router.put('/:id/access', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('visibility').isIn(['public', 'internal', 'confidential', 'unlisted']).withMessage('Invalid visibility level'),
  validateRequest
], (req: Request, res: Response) => {
  jobController.setJobAccessLevel(req as any, res);
});

// @route   POST /api/v1/jobs/:id/screening
// @desc    Add screening questions to a job
// @access  Private (recruiter, company_admin)
router.post('/:id/screening', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('questions').isArray().withMessage('Questions must be an array'),
  body('questions.*.question').isString().withMessage('Each question must have text'),
  body('questions.*.type').isIn(['text', 'multiple_choice', 'yes_no', 'number', 'date']),
  body('questions.*.required').optional().isBoolean(),
  body('questions.*.options').optional().isArray(),
  validateRequest
], (req: Request, res: Response) => {
  jobController.addScreeningQuestions(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/skills
// @desc    Set required skills for a job
// @access  Private (recruiter, company_admin)
router.put('/:id/skills', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('skills').isArray().withMessage('Skills must be an array'),
  body('skills.*.name').optional().isString(),
  body('skills.*.skill_id').optional().isUUID(),
  body('skills.*.proficiency_level').optional().isInt({ min: 1, max: 5 }),
  body('skills.*.is_required').optional().isBoolean(),
  body('skills.*.importance').optional().isIn(['nice-to-have', 'preferred', 'required']),
  validateRequest
], (req: Request, res: Response) => {
  jobController.setRequiredSkills(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/experience
// @desc    Set experience requirements for a job
// @access  Private (recruiter, company_admin)
router.put('/:id/experience', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('minYears').optional().isInt({ min: 0 }),
  body('maxYears').optional().isInt({ min: 0 }),
  body('level').optional().isIn(['entry', 'mid', 'senior', 'lead', 'executive']),
  validateRequest
], (req: Request, res: Response) => {
  jobController.setExperienceRequirements(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/education
// @desc    Set education requirements for a job
// @access  Private (recruiter, company_admin)
router.put('/:id/education', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('educationLevel').custom(value => {
    if (!value) return true;
    if (typeof value === 'string') return true;
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (value.minimum_degree && typeof value.minimum_degree !== 'string') {
        throw new Error('minimum_degree must be a string');
      }
      if (value.fields_of_study && !Array.isArray(value.fields_of_study)) {
        throw new Error('fields_of_study must be an array');
      }
      if (value.certifications && !Array.isArray(value.certifications)) {
        throw new Error('certifications must be an array');
      }
      return true;
    }
    if (Array.isArray(value)) {
      return value.every(item => typeof item === 'string');
    }
    throw new Error('Invalid education level format');
  }),
  validateRequest
], (req: Request, res: Response) => {
  jobController.setEducationRequirements(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/arrangement
// @desc    Update work arrangement (remote/hybrid/onsite)
// @access  Private (recruiter, company_admin)
router.put('/:id/arrangement', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('type').isIn(['onsite', 'remote', 'hybrid', 'flexible']).withMessage('Invalid work arrangement'),
  body('location').optional().isString(),
  validateRequest
], (req: Request, res: Response) => {
  jobController.setWorkArrangement(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/compensation
// @desc    Update salary and benefits
// @access  Private (recruiter, company_admin)
router.put('/:id/compensation', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('salaryMin').optional().isFloat({ min: 0 }),
  body('salaryMax').optional().isFloat({ min: 0 }),
  body('salaryCurrency').optional().isString().isLength({ min: 3, max: 3 }),
  body('benefits').optional().isArray(),
  body('benefits.*').optional().isString(),
  body().custom((value) => {
    if (value.salaryMin && value.salaryMax && value.salaryMin > value.salaryMax) {
      throw new Error('Minimum salary cannot be greater than maximum salary');
    }
    return true;
  }),
  validateRequest
], (req: Request, res: Response) => {
  jobController.setSalaryAndBenefits(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/instructions
// @desc    Update application instructions
// @access  Private (recruiter, company_admin)
router.put('/:id/instructions', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('instructions').optional().isString(),
  body('documents').optional().isArray(),
  validateRequest
], (req: Request, res: Response) => {
  jobController.addApplicationInstructions(req as any, res);
});

// @route   POST /api/v1/jobs/:id/documents
// @desc    Attach documents to a job
// @access  Private (recruiter, company_admin)
router.post('/:id/documents', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  validateRequest
], (req: Request, res: Response) => {
  jobController.attachJobDocuments(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/category
// @desc    Categorize job by department
// @access  Private (recruiter, company_admin)
router.put('/:id/category', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('department').isString().trim().isLength({ min: 1 }).withMessage('Department is required'),
  body('subDepartment').optional().isString(),
  validateRequest
], (req: Request, res: Response) => {
  jobController.categorizeJobByDepartment(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/tags
// @desc    Update job tags
// @access  Private (recruiter, company_admin)
router.put('/:id/tags', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('tags').isArray().withMessage('Tags must be an array'),
  body('tags.*').isString(),
  validateRequest
], (req: Request, res: Response) => {
  jobController.tagJobWithSkills(req as any, res);
});

// @route   PUT /api/v1/jobs/:id/limits
// @desc    Set application limits for a job
// @access  Private (recruiter, company_admin)
router.put('/:id/limits', [
  protect,
  authorize('recruiter', 'company_admin'),
  param('id').isUUID().withMessage('Invalid job ID format'),
  body('applicationLimit').optional().custom(value => {
    if (value === null || value === undefined || value === '') return true;
    const num = Number(value);
    return !isNaN(num) && num >= 1 && Number.isInteger(num);
  }),
  body('limitType').optional().isIn(['total', 'daily', 'monthly']),
  validateRequest
], (req: Request, res: Response) => {
  jobController.setApplicationLimits(req as any, res);
});

// ============ FILTER ROUTES ============

// @route   GET /api/v1/jobs/filter/location
// @desc    Filter jobs by location
// @access  Public
router.get('/filter/location', [
  query('location').isString().withMessage('Location is required'),
  query('radius').optional().isInt({ min: 1, max: 500 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validateRequest
], (req: Request, res: Response) => {
  jobController.filterByLocation(req, res);
});

// @route   GET /api/v1/jobs/filter/salary
// @desc    Filter jobs by salary range
// @access  Public
router.get('/filter/salary', [
  query('min').optional().isInt({ min: 0 }),
  query('max').optional().isInt({ min: 0 }),
  query('currency').optional().isString().isLength({ min: 3, max: 3 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validateRequest
], (req: Request, res: Response) => {
  jobController.filterBySalary(req, res);
});

// @route   GET /api/v1/jobs/filter/experience
// @desc    Filter jobs by experience level
// @access  Public
router.get('/filter/experience', [
  query('level').isString().withMessage('Experience level is required'),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validateRequest
], (req: Request, res: Response) => {
  jobController.filterByExperience(req, res);
});

export default router;