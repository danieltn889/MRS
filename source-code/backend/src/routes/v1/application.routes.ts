import express, { Router, Request, Response } from 'express';
import { body, query, param } from 'express-validator';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { query as dbQuery, getClient } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { AuthenticatedRequest } from '../../types/auth.types.js';
import DatabaseService from '../../services/database.service.js';
import ResponseService from '../../services/response.service.js';
import emailService from '../../services/email.service.js';
import NotificationService from '../../services/notification.service.js';
import RecommendationSyncService from '../../services/recommendation-sync.service.js';

const router: Router = express.Router();

// Human-readable labels for application statuses (used in notifications/emails).
const STATUS_LABELS: Record<string, string> = {
  submitted: 'Applied',
  under_review: 'Under Review',
  shortlisted: 'Shortlisted',
  interview: 'Interview Scheduled',
  assessment: 'Assessment Pending',
  reference_check: 'Reference Check',
  offer: 'Offer Extended',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  on_hold: 'On Hold',
};

// Statuses a candidate can no longer withdraw from (offer already accepted / final).
const NON_WITHDRAWABLE_STATUSES = ['hired', 'withdrawn', 'rejected'];

/**
 * Best-effort side effects for an application status change: an in-app notification
 * and an email to the candidate. Never throws   a notification/email failure must
 * not break the underlying status update. Call AFTER the DB transaction commits.
 */
async function notifyCandidateOfApplication(
  applicationId: string,
  opts: { title: string; status?: string; statusLabel?: string; jobId?: string; emailKind?: 'received'| 'status'| 'withdrawn' }
): Promise<void> {
  try {
    const info = await dbQuery(
      `SELECT a.user_id, a.job_id, u.email,
              COALESCE(cp.first_name, '') AS first_name,
              j.title AS job_title, c.name AS company_name
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       LEFT JOIN companies c ON c.id = j.company_id
       JOIN users u ON u.id = a.user_id
       LEFT JOIN candidate_profiles cp ON cp.user_id = a.user_id
       WHERE a.id = $1`,
      [applicationId]
    );
    const row = info.rows[0];
    if (!row) return;
    const jobTitle = row.job_title || 'the role';
    const companyName = row.company_name || 'the company';

    await NotificationService.create({
      userId: row.user_id,
      type: 'application_update',
      category: 'application',
      title: opts.title,
      content: `${jobTitle} at ${companyName}`,
      data: {
        applicationId,
        jobId: opts.jobId || row.job_id,
        status: opts.status,
        url: `/?view=application-history`,
      },
    });

    if (row.email && opts.emailKind) {
      try {
        await emailService.sendApplicationStatusEmail(row.email, {
          candidateName: row.first_name || 'there',
          jobTitle,
          companyName,
          statusLabel: opts.statusLabel || STATUS_LABELS[opts.status || ''] || opts.status || 'Updated',
          applicationId,
          kind: opts.emailKind,
        });
      } catch (emailErr) {
        logger.warn(`Application email failed for ${applicationId}: ${(emailErr as Error).message}`);
      }
    }
  } catch (err) {
    logger.warn(`notifyCandidateOfApplication failed for ${applicationId}: ${(err as Error).message}`);
  }
}

/**
 * Best-effort: notify recruiters (job creator + company team) when a new candidate
 * applies. In-app notification + email. Never throws.
 */
async function notifyRecruiterOfApplication(
  applicationId: string,
  opts: { candidateName: string; candidateEmail: string; jobTitle: string; companyId: string; appliedAt: string }
): Promise<void> {
  try {
    // All recruiter/admin users linked to the company.
    const recruiterResult = await dbQuery(
      `SELECT DISTINCT u.id, u.email,
              COALESCE(cp.first_name, '') AS first_name
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         LEFT JOIN companies c ON c.id = j.company_id
         JOIN users u ON (
           u.id IN (j.created_by, c.created_by)
           OR u.id IN (SELECT ct.user_id FROM company_team ct WHERE ct.company_id = c.id)
         )
         LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
        WHERE a.id = $1 AND u.email IS NOT NULL`,
      [applicationId]
    );

    for (const row of recruiterResult.rows) {
      try {
        await NotificationService.create({
          userId: row.id,
          type: 'new_application',
          category: 'application',
          title: 'New application received',
          content: `${opts.candidateName} applied for ${opts.jobTitle}`,
          data: { applicationId, jobTitle: opts.jobTitle, candidateName: opts.candidateName },
        });
      } catch (notifErr) {
        logger.warn(`Recruiter in-app notification failed for ${row.id}: ${(notifErr as Error).message}`);
      }

      try {
        await emailService.sendNewApplicationAlert(row.email, {
          recruiterName: row.first_name || undefined,
          candidateName: opts.candidateName,
          candidateEmail: opts.candidateEmail,
          jobTitle: opts.jobTitle,
          applicationId,
          appliedAt: opts.appliedAt,
        });
      } catch (emailErr) {
        logger.warn(`Recruiter alert email failed for ${row.email}: ${(emailErr as Error).message}`);
      }
    }
  } catch (err) {
    logger.warn(`notifyRecruiterOfApplication failed for ${applicationId}: ${(err as Error).message}`);
  }
}

// Utility function to wrap AuthenticatedRequest handlers
const withAuth = (handler: (req: AuthenticatedRequest, res: express.Response) => Promise<any>) => {
  return handler as any;
};

// @route   GET /api/v1/applications
// @desc    Get user's applications (candidates) or company's applications (recruiters)
// @access  Private
router.get('/', [protect, query('page').optional().isInt({ min: 1 }).toInt(), query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), query('status').optional().isIn(['submitted', 'under_review', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { page = 1, limit = 20, status } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (authReq.user!.user_type === 'candidate') {
      // Candidates see their own applications
      whereConditions.push(`a.user_id = $${paramIndex}`);
      params.push(authReq.user!.id);
      paramIndex++;
    } else if (authReq.user!.user_type === 'recruiter'|| authReq.user!.user_type === 'company_admin') {
      // Recruiters see applications for jobs they created or their company
      let jobIdsQuery;
      let queryParams;

      if (authReq.user!.user_type === 'company_admin') {
        // Company admins see all applications for their company
        jobIdsQuery = `SELECT j.id FROM jobs j JOIN company_team ct ON j.company_id = ct.company_id WHERE ct.user_id = $1`;
        queryParams = [authReq.user!.id];
      } else {
        jobIdsQuery = `SELECT id FROM jobs WHERE created_by = $1 UNION SELECT j.id FROM jobs j JOIN company_team ct ON j.company_id = ct.company_id WHERE ct.user_id = $1`;
        queryParams = [authReq.user!.id];
      }

      const jobIdsResult = await dbQuery(jobIdsQuery, queryParams);
      const jobIds = jobIdsResult.rows.map(row => row.id);

      if (jobIds.length === 0) {
        return res.json({
          success: true,
          data: { applications: [], pagination: { page: 1, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false } }
        });
      }

      whereConditions.push(`a.job_id = ANY($${paramIndex})`);
      params.push(jobIds);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`a.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM applications a ${whereClause}`;
    const countResult = await dbQuery(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get applications with job and company info
    const applicationsQuery = `
      SELECT
        a.id, a.applied_at, a.status,
        a.submitted_data->>'coverLetter'as cover_letter,
        a.submitted_data->>'expectedSalary'as expected_salary,
        a.submitted_data->>'noticePeriod'as notice_period,
        a.submitted_data->>'portfolioUrl'as portfolio_url,
        a.submitted_data->>'linkedinUrl'as linkedin_url,
        a.submitted_data->>'githubUrl'as github_url,
        a.submitted_data->>'availability'as availability,
        a.match_score, a.application_number, a.updated_at,
        j.id as job_id, j.title as job_title,
        COALESCE(
          (SELECT string_agg(elem->>'city', ', ') FROM jsonb_array_elements(j.locations) AS elem WHERE elem->>'city'IS NOT NULL),
          'Remote'
        ) as job_location,
        j.job_type, j.experience_level, j.salary_min, j.salary_max, j.salary_currency,
        c.name as company_name, c.logo_url as company_logo,
        u.email as candidate_email,
        cp.first_name, cp.last_name, cp.phone,
        COALESCE(TRIM(CONCAT_WS(', ', cp.city, cp.country)), 'Not specified') as candidate_location,
        cp.headline, cp.profile_photo_url
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      JOIN users u ON a.user_id = u.id
      LEFT JOIN candidate_profiles cp ON a.user_id = cp.user_id
      ${whereClause}
      ORDER BY a.applied_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limitNum, offset);

    const applicationsResult = await dbQuery(applicationsQuery, params);

    // Calculate pagination
    const totalPages = Math.ceil(total / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    return res.json({
      success: true,
      data: {
        applications: applicationsResult.rows,
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
    logger.error('Get applications error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch applications'
    });
  }
});

// @route   GET /api/v1/applications/:id
// @desc    Get single application details
// @access  Private (Application owner or job creator/company admin)
router.get('/:id', [protect, param('id').isUUID(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;

    console.log('🔍 [Get Application] Starting request for application:', id);
    console.log(' Current user:', {
      id: authReq.user?.id,
      email: authReq.user?.email,
      user_type: authReq.user?.user_type
    });

    // Get application with all related data
    const applicationQuery = `
      SELECT
        a.*,
        j.id as job_id, 
        j.title as job_title,
        j.department as job_department,
        j.job_type, 
        j.experience_level, 
        j.description as job_description,
        j.requirements as job_requirements, 
        j.benefits as job_benefits,
        j.salary_min, j.salary_max, j.salary_currency,
        j.work_arrangement,
        j.created_by as job_created_by,
        COALESCE(
          (SELECT string_agg(elem->>'city', ', ') FROM jsonb_array_elements(j.locations) AS elem WHERE elem->>'city'IS NOT NULL),
          'Remote'
        ) as job_location,
        c.id as company_id,
        c.name as company_name, 
        c.logo_url as company_logo, 
        c.website as company_website,
        c.description as company_description,
        c.industry as company_industry,
        c.size as company_size,
        c.created_by as company_created_by,
        u.id as candidate_id,
        u.email as candidate_email,
        u.user_type as candidate_user_type,
        u.created_at as candidate_registered_at,
        cp.first_name, 
        cp.last_name, 
        cp.phone,
        COALESCE(TRIM(CONCAT_WS(', ', cp.city, cp.country)), 'Not specified') as candidate_location,
        cp.headline, 
        cp.profile_photo_url,
        cp.portfolio_url as candidate_portfolio, 
        cp.linkedin_url as candidate_linkedin,
        cp.github_url as candidate_github,
        cp.current_salary, 
        cp.expected_salary as candidate_expected_salary,
        cp.languages, 
        cp.availability,
        cp.summary as candidate_summary,
        (SELECT COALESCE(jsonb_agg(DISTINCT s.name), '[]'::jsonb)
         FROM user_skills us
         JOIN skills s ON us.skill_id = s.id
         WHERE us.user_id = u.id
        ) as candidate_skills,
        (SELECT jsonb_agg(
            jsonb_build_object(
              'company', we.company,
              'title', we.title,
              'start_date', we.start_date,
              'end_date', we.end_date,
              'is_current', we.is_current,
              'description', we.description
            ) ORDER BY we.start_date DESC
         )
         FROM work_experience we
         WHERE we.user_id = u.id
        ) as candidate_experience,
        (SELECT jsonb_agg(
            jsonb_build_object(
              'institution', e.institution,
              'degree', e.degree,
              'field_of_study', e.field_of_study,
              'start_date', e.start_date,
              'end_date', e.end_date,
              'is_current', e.is_current
            ) ORDER BY e.start_date DESC
         )
         FROM education e
         WHERE e.user_id = u.id
        ) as candidate_education
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      JOIN users u ON a.user_id = u.id
      LEFT JOIN candidate_profiles cp ON a.user_id = cp.user_id
      WHERE a.id = $1
    `;

    const applicationResult = await dbQuery(applicationQuery, [id]);

    if (applicationResult.rows.length === 0) {
      console.log(' Application not found:', id);
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    const application = applicationResult.rows[0];

    console.log('📋 Application found:', {
      id: application.id,
      candidate_id: application.candidate_id,
      job_id: application.job_id,
      job_created_by: application.job_created_by,
      company_id: application.company_id,
      company_created_by: application.company_created_by
    });

    // Check permissions
    let hasPermission = false;
    let permissionReason = '';

    if (authReq.user!.user_type === 'candidate') {
      // Candidates can only view their own applications
      const isOwner = application.candidate_id === authReq.user!.id;
      hasPermission = isOwner;
      permissionReason = isOwner ? 'Candidate is owner': 'Candidate is not the application owner';
      console.log(`🔐 Candidate permission check: ${permissionReason}`);

    } else if (authReq.user!.user_type === 'company_admin') {
      // Company admin can view if they own the company that posted the job
      const isCompanyOwner = application.company_created_by === authReq.user!.id;
      const isJobCreator = application.job_created_by === authReq.user!.id;
      const isCandidate = application.candidate_id === authReq.user!.id;

      hasPermission = isCompanyOwner || isJobCreator || isCandidate;
      permissionReason = `Company owner: ${isCompanyOwner}, Job creator: ${isJobCreator}, Is candidate: ${isCandidate}`;
      console.log(`🔐 Company Admin permission check: ${permissionReason}`);

    } else if (authReq.user!.user_type === 'recruiter') {
      // Check if recruiter is on the company team
      const recruiterAccessQuery = `
        SELECT 1 FROM company_team ct
        WHERE ct.company_id = $1 AND ct.user_id = $2
        UNION
        SELECT 1 FROM jobs j
        WHERE j.id = $3 AND j.created_by = $2
      `;
      const accessResult = await dbQuery(recruiterAccessQuery, [
        application.company_id,
        authReq.user!.id,
        application.job_id
      ]);

      const isOnTeam = accessResult.rows.length > 0;
      const isJobCreator = application.job_created_by === authReq.user!.id;
      const isCandidate = application.candidate_id === authReq.user!.id;

      hasPermission = isOnTeam || isJobCreator || isCandidate;
      permissionReason = `On team: ${isOnTeam}, Job creator: ${isJobCreator}, Is candidate: ${isCandidate}`;
      console.log(`🔐 Recruiter permission check: ${permissionReason}`);

    } else if (authReq.user!.user_type === 'system_admin') {
      hasPermission = true;
      permissionReason = 'System admin has full access';
      console.log(`🔐 System Admin permission check: ${permissionReason}`);
    }

    console.log(`📊 Final permission result: ${hasPermission} - ${permissionReason}`);

    if (!hasPermission) {
      console.log(' Access denied for user:', {
        userId: authReq.user!.id,
        userType: authReq.user!.user_type,
        applicationId: id,
        reason: permissionReason
      });

      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this application',
        debug: process.env.NODE_ENV === 'development'? {
          userType: authReq.user!.user_type,
          userId: authReq.user!.id,
          applicationCandidateId: application.candidate_id,
          applicationJobCreatedBy: application.job_created_by,
          applicationCompanyCreatedBy: application.company_created_by,
          reason: permissionReason
        } : undefined
      });
    }

    console.log('Permission granted, fetching timeline...');

    // Get application timeline
    const timelineQuery = `
      SELECT
        id,
        event_type,
        event_data->>'description'as event_description,
        event_data->>'old_status'as old_status,
        event_data->>'new_status'as new_status,
        created_at,
        created_by,
        metadata
      FROM application_timeline
      WHERE application_id = $1
      ORDER BY created_at DESC
    `;

    const timelineResult = await dbQuery(timelineQuery, [id]);

    // Helper function to safely parse JSON arrays and objects
    const safeParseJSON = (data: any, defaultValue: any = null) => {
      if (!data) return defaultValue;
      if (typeof data === 'object') return data;
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          return parsed;
        } catch (e) {
          console.warn('Failed to parse JSON:', data);
          return defaultValue;
        }
      }
      return defaultValue;
    };

    // Helper function to safely extract text from objects or arrays
    const extractTextFromArray = (items: any[]): string[] => {
      if (!items || !Array.isArray(items)) return [];
      return items.map(item => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object') {
          if (item.name) return item.name;
          if (item.title) return `${item.title}${item.years ? ` (${item.years} years)` : ''}`;
          if (item.description) return item.description;
          return JSON.stringify(item);
        }
        return String(item);
      }).filter(Boolean);
    };

    // Parse all JSON fields
    application.submitted_data = safeParseJSON(application.submitted_data, {});
    application.screening_answers = safeParseJSON(application.screening_answers, []);
    application.documents = safeParseJSON(application.documents, []);
    application.notes = safeParseJSON(application.notes, []);
    application.internal_notes = safeParseJSON(application.internal_notes, []);
    application.tags = safeParseJSON(application.tags, []);
    application.match_details = safeParseJSON(application.match_details, {});
    application.metadata = safeParseJSON(application.metadata, {});

    // Parse job requirements and benefits
    const jobRequirements = safeParseJSON(application.job_requirements, []);
    const jobBenefits = safeParseJSON(application.job_benefits, []);

    application.job_requirements = extractTextFromArray(jobRequirements);
    application.job_benefits = extractTextFromArray(jobBenefits);

    // Parse candidate data
    const candidateSkills = safeParseJSON(application.candidate_skills, []);
    const candidateExperience = safeParseJSON(application.candidate_experience, []);
    const candidateEducation = safeParseJSON(application.candidate_education, []);
    const candidateLanguages = safeParseJSON(application.languages, []);

    application.candidate_skills = extractTextFromArray(candidateSkills);
    application.candidate_experience = candidateExperience;
    application.candidate_education = candidateEducation;
    application.candidate_languages = extractTextFromArray(candidateLanguages);

    // Parse salary objects
    application.current_salary = safeParseJSON(application.current_salary, {});
    application.availability = safeParseJSON(application.availability, {});

    // Build the response
    const responseData = {
      application: {
        id: application.id,
        job_id: application.job_id,
        user_id: application.candidate_id,
        status: application.status,
        applied_at: application.applied_at,
        updated_at: application.updated_at,
        match_score: application.match_score,
        rating: application.rating,

        submitted_data: application.submitted_data,
        screening_answers: application.screening_answers,
        documents: application.documents,
        notes: application.notes,
        internal_notes: application.internal_notes,
        tags: application.tags,
        match_details: application.match_details,
        metadata: application.metadata,

        job: {
          id: application.job_id,
          title: application.job_title,
          department: application.job_department,
          type: application.job_type,
          work_arrangement: application.work_arrangement,
          experience_level: application.experience_level,
          location: application.job_location,
          description: application.job_description,
          requirements: application.job_requirements,
          benefits: application.job_benefits,
          salary: {
            min: parseFloat(application.salary_min),
            max: parseFloat(application.salary_max),
            currency: application.salary_currency
          }
        },

        company: {
          id: application.company_id,
          name: application.company_name,
          logo: application.company_logo,
          website: application.company_website,
          description: application.company_description,
          industry: application.company_industry,
          size: application.company_size
        },

        candidate: {
          id: application.candidate_id,
          email: application.candidate_email,
          user_type: application.candidate_user_type,
          registered_at: application.candidate_registered_at,
          first_name: application.first_name,
          last_name: application.last_name,
          full_name: `${application.first_name || ''} ${application.last_name || ''}`.trim() || application.candidate_email?.split('@')[0],
          phone: application.phone,
          location: application.candidate_location,
          headline: application.headline,
          profile_photo: application.profile_photo_url,
          portfolio_url: application.candidate_portfolio,
          linkedin_url: application.candidate_linkedin,
          github_url: application.candidate_github,
          summary: application.candidate_summary,
          skills: application.candidate_skills,
          experience: application.candidate_experience,
          education: application.candidate_education,
          languages: application.candidate_languages,
          current_salary: application.current_salary,
          expected_salary: application.candidate_expected_salary,
          availability: application.availability
        }
      },
      timeline: timelineResult.rows.map((row: any) => ({
        id: row.id,
        event_type: row.event_type,
        description: row.event_description,
        old_status: row.old_status,
        new_status: row.new_status,
        created_at: row.created_at,
        created_by: row.created_by,
        metadata: safeParseJSON(row.metadata, {})
      }))
    };

    console.log('Successfully fetched application details');

    return res.json({
      success: true,
      data: responseData
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(' Get application error:', errorMessage);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch application',
      error: process.env.NODE_ENV === 'development'? errorMessage : undefined
    });
  }
});

// @route   GET /api/v1/applications
// @desc    Get user's applications (candidates) or company's applications (recruiters)
// @access  Private
router.get('/', [protect, query('page').optional().isInt({ min: 1 }).toInt(), query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), query('status').optional().isIn(['submitted', 'under_review', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { page = 1, limit = 20, status } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (authReq.user!.user_type === 'candidate') {
      // Candidates see their own applications
      whereConditions.push(`a.user_id = $${paramIndex}`);
      params.push(authReq.user!.id);
      paramIndex++;
    } else if (authReq.user!.user_type === 'recruiter'|| authReq.user!.user_type === 'company_admin') {
      // Recruiters see applications for jobs they created or their company
      let jobIdsQuery;
      let queryParams;

      if (authReq.user!.user_type === 'company_admin') {
        // Company admins see all applications for their company
        jobIdsQuery = `SELECT j.id FROM jobs j JOIN company_team ct ON j.company_id = ct.company_id WHERE ct.user_id = $1`;
        queryParams = [authReq.user!.id];
      } else {
        jobIdsQuery = `SELECT id FROM jobs WHERE created_by = $1 UNION SELECT j.id FROM jobs j JOIN company_team ct ON j.company_id = ct.company_id WHERE ct.user_id = $1`;
        queryParams = [authReq.user!.id];
      }

      const jobIdsResult = await dbQuery(jobIdsQuery, queryParams);
      const jobIds = jobIdsResult.rows.map(row => row.id);

      if (jobIds.length === 0) {
        return res.json({
          success: true,
          data: { applications: [], pagination: { page: 1, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false } }
        });
      }

      whereConditions.push(`a.job_id = ANY($${paramIndex})`);
      params.push(jobIds);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`a.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM applications a ${whereClause}`;
    const countResult = await dbQuery(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get applications with job and company info - REMOVED cp.bio
    const applicationsQuery = `
      SELECT
        a.id, a.applied_at, a.status,
        a.submitted_data->>'coverLetter'as cover_letter,
        a.submitted_data->>'expectedSalary'as expected_salary,
        a.submitted_data->>'noticePeriod'as notice_period,
        a.submitted_data->>'portfolioUrl'as portfolio_url,
        a.submitted_data->>'linkedinUrl'as linkedin_url,
        a.submitted_data->>'githubUrl'as github_url,
        a.submitted_data->>'availability'as availability,
        a.match_score, a.application_number, a.updated_at,
        j.id as job_id, j.title as job_title,
        COALESCE(
          (SELECT string_agg(elem->>'city', ', ') FROM jsonb_array_elements(j.locations) AS elem WHERE elem->>'city'IS NOT NULL),
          'Remote'
        ) as job_location,
        j.job_type, j.experience_level, j.salary_min, j.salary_max, j.salary_currency,
        c.name as company_name, c.logo_url as company_logo,
        u.email as candidate_email,
        cp.first_name, cp.last_name, cp.phone,
        COALESCE(TRIM(CONCAT_WS(', ', cp.city, cp.country)), 'Not specified') as candidate_location,
        cp.headline, cp.profile_photo_url
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      JOIN users u ON a.user_id = u.id
      LEFT JOIN candidate_profiles cp ON a.user_id = cp.user_id
      ${whereClause}
      ORDER BY a.applied_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limitNum, offset);

    const applicationsResult = await dbQuery(applicationsQuery, params);

    // Parse JSON fields for each application
    const parsedRows = applicationsResult.rows.map(row => {
      if (row.submitted_data && typeof row.submitted_data === 'string') {
        try { row.submitted_data = JSON.parse(row.submitted_data); } catch { row.submitted_data = {}; }
      }
      return row;
    });

    // Calculate pagination
    const totalPages = Math.ceil(total / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    return res.json({
      success: true,
      data: {
        applications: parsedRows,
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
    logger.error('Get applications error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch applications'
    });
  }
});

// @route   PUT /api/v1/applications/:id
// @desc    Update application status (recruiters) or withdraw (candidates)
// @access  Private
router.put('/:id', [protect, param('id').isUUID(), body('status').optional().isIn(['submitted', 'under_review', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']), body('notes').optional().trim(), body('interviewDate').optional().isISO8601(), body('feedback').optional().trim(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { status, notes, interviewDate, feedback } = req.body;

    // Get application
    const applicationCheck = await client.query(
      'SELECT a.*, j.company_id, j.created_by FROM applications a JOIN jobs j ON a.job_id = j.id WHERE a.id = $1',
      [id]
    );

    if (applicationCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    const application = applicationCheck.rows[0];
    let hasPermission = false;
    let allowedStatuses: string[] = [];

    if (authReq.user!.user_type === 'candidate') {
      // Candidates can only withdraw their own applications
      hasPermission = application.user_id === authReq.user!.id;
      allowedStatuses = ['withdrawn'];
    } else if (authReq.user!.user_type === 'recruiter'|| authReq.user!.user_type === 'company_admin') {
      // A recruiter/company_admin may manage applications for jobs at THEIR company.
      // Accept any of the existing relationships: the user belongs to the job's
      // company (req.user.company_id, set by auth middleware), created the job,
      // is a company_team member, or created the company. Reuses existing data  
      // no new fields.
      const userCompanyId = authReq.user!.company_id ? String(authReq.user!.company_id) : null;
      const jobCompanyId = application.company_id ? String(application.company_id) : null;
      const sameCompany = !!userCompanyId && !!jobCompanyId && userCompanyId === jobCompanyId;

      const isJobCreator = application.created_by === authReq.user!.id;

      let inTeamOrOwner = false;
      if (!sameCompany && !isJobCreator) {
        const rel = await client.query(
          `SELECT 1
             FROM company_team
            WHERE company_id = $1 AND user_id = $2
           UNION
           SELECT 1
             FROM companies
            WHERE id = $1 AND created_by = $2
           LIMIT 1`,
          [application.company_id, authReq.user!.id]
        );
        inTeamOrOwner = rel.rows.length > 0;
      }

      hasPermission = sameCompany || isJobCreator || inTeamOrOwner;

      if (hasPermission) {
        allowedStatuses = ['under_review', 'shortlisted', 'interview', 'offer', 'hired', 'rejected'];
      }
    }

    if (!hasPermission) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this application'
      });
    }

    if (status && !allowedStatuses.includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `You cannot set status to ${status}`
      });
    }

    // A candidate cannot withdraw once the application is final (offer accepted /
    // hired) or already withdrawn/rejected   explain why clearly.
    if (status === 'withdrawn'&& authReq.user!.user_type === 'candidate'
        && NON_WITHDRAWABLE_STATUSES.includes(application.status)) {
      await client.query('ROLLBACK');
      const reason = application.status === 'hired'
        ? 'This application can no longer be withdrawn because an offer has already been accepted.'
        : `This application is already ${STATUS_LABELS[application.status] || application.status} and cannot be withdrawn.`;
      return res.status(409).json({ success: false, message: reason });
    }

    // Block withdrawal if the job application period has closed or the job is no longer active.
    if (status === 'withdrawn'&& authReq.user!.user_type === 'candidate') {
      const jobStatusResult = await client.query(
        `SELECT status, expires_at FROM jobs WHERE id = $1`,
        [application.job_id]
      );
      const jobRow = jobStatusResult.rows[0];
      const isJobExpired = jobRow?.expires_at && new Date(jobRow.expires_at) < new Date();
      if (!jobRow || jobRow.status !== 'active'|| isJobExpired) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Withdrawal is not allowed because the application period for this job has closed or the job is no longer active.'
        });
      }
    }

    // Update application
    const updateFields = ['updated_at = NOW()'];
    const updateValues = [];
    let paramIndex = 1;

    if (status) {
      updateFields.push(`status = $${paramIndex}`);
      updateValues.push(status);
      paramIndex++;
    }

    // Record withdrawal metadata when a candidate withdraws.
    if (status === 'withdrawn') {
      updateFields.push('withdrawn_at = NOW()');
      updateFields.push(`withdrawn_by = $${paramIndex}`);
      updateValues.push(authReq.user!.id);
      paramIndex++;
      updateFields.push(`withdrawn_reason = $${paramIndex}`);
      updateValues.push((req.body && req.body.reason) || 'Withdrawn by candidate');
      paramIndex++;
    }

    if (notes) {
      updateFields.push(`notes = $${paramIndex}`);
      updateValues.push(notes);
      paramIndex++;
    }

    if (interviewDate) {
      updateFields.push(`interview_date = $${paramIndex}`);
      updateValues.push(interviewDate);
      paramIndex++;
    }

    if (feedback) {
      updateFields.push(`feedback = $${paramIndex}`);
      updateValues.push(feedback);
      paramIndex++;
    }

    const updateQuery = `UPDATE applications SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    updateValues.push(id);

    const result = await client.query(updateQuery, updateValues);

    // Create timeline entry
    if (status && status !== application.status) {
      await client.query(
        `INSERT INTO application_timeline (
          application_id, event_type, event_data, created_by, metadata
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          'status_changed',
          JSON.stringify({
            description: `Status changed from ${application.status} to ${status}`,
            old_status: application.status,
            new_status: status
          }),
          authReq.user!.id,
          JSON.stringify({ notes, interviewDate, feedback })
        ]
      );
    }

    await client.query('COMMIT');

    logger.info(`Application updated: ${id} by user ${authReq.user!.id}`);

    // Notify the candidate (in-app + email) when their application status changes.
    if (status && status !== application.status) {
      const label = STATUS_LABELS[status] || status;
      await notifyCandidateOfApplication(id!, {
        title: `Application ${label}`,
        status,
        statusLabel: label,
        jobId: application.job_id,
        emailKind: status === 'withdrawn'? 'withdrawn': 'status',
      });

      // On withdrawal, also notify the recruiter who owns the job.
      if (status === 'withdrawn'&& application.created_by && application.created_by !== authReq.user!.id) {
        await NotificationService.create({
          userId: application.created_by,
          type: 'application_withdrawn',
          category: 'application',
          title: 'Candidate withdrew an application',
          content: 'A candidate has withdrawn their application.',
          data: { applicationId: id, jobId: application.job_id, status: 'withdrawn', url: `/?view=job-candidates&jobId=${application.job_id}` },
        });
      }
    }

    return res.json({
      success: true,
      data: result.rows[0],
      message: 'Application updated successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Update application error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update application'
    });

  } finally {
    client.release();
  }
});

// @route   DELETE /api/v1/applications/:id
// @desc    Delete/withdrawn application
// @access  Private (Application owner or admins)
router.delete('/:id', [protect, param('id').isUUID(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Get application
    const applicationCheck = await client.query(
      'SELECT a.*, j.company_id FROM applications a JOIN jobs j ON a.job_id = j.id WHERE a.id = $1',
      [id]
    );

    if (applicationCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    const application = applicationCheck.rows[0];
    let hasPermission = false;

    if (authReq.user!.user_type === 'candidate') {
      hasPermission = application.user_id === authReq.user!.id;
    } else if (authReq.user!.user_type === 'system_admin') {
      hasPermission = true;
    } else if (authReq.user!.user_type === 'company_admin') {
      const companyCheck = await client.query(
        'SELECT id FROM companies WHERE id = $1 AND created_by = $2',
        [application.company_id, authReq.user!.id]
      );
      hasPermission = companyCheck.rows.length > 0;
    }

    if (!hasPermission) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this application'
      });
    }

    // A candidate cannot withdraw once the application is final (e.g. an offer has
    // been accepted / hired) or already withdrawn/rejected. Explain why clearly.
    if (authReq.user!.user_type === 'candidate'&& NON_WITHDRAWABLE_STATUSES.includes(application.status)) {
      await client.query('ROLLBACK');
      const reason = application.status === 'hired'
        ? 'This application can no longer be withdrawn because an offer has already been accepted.'
        : `This application is already ${STATUS_LABELS[application.status] || application.status} and cannot be withdrawn.`;
      return res.status(409).json({ success: false, message: reason });
    }

    // Soft delete   record who withdrew, when, and why.
    await client.query(
      `UPDATE applications
         SET status = 'withdrawn', withdrawn_at = NOW(), withdrawn_by = $2,
             withdrawn_reason = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, authReq.user!.id, (req.body && req.body.reason) || 'Withdrawn by candidate']
    );

    // Update job application count
    await client.query(
      'UPDATE jobs SET application_count = application_count - 1 WHERE id = $1',
      [application.job_id]
    );

    // Create timeline entry
    await client.query(
      `INSERT INTO application_timeline (
        application_id, event_type, event_data, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        'application_withdrawn',
        JSON.stringify({
          description: 'Application withdrawn',
          old_status: application.status,
          new_status: 'withdrawn'
        }),
        authReq.user!.id,
        JSON.stringify({})
      ]
    );

    await client.query('COMMIT');

    logger.info(`Application deleted: ${id} by user ${authReq.user!.id}`);

    // Notify the recruiter assigned to the application (if any) that it was withdrawn.
    if (application.assigned_to && application.assigned_to !== authReq.user!.id) {
      await NotificationService.create({
        userId: application.assigned_to,
        type: 'application_withdrawn',
        category: 'application',
        title: 'Candidate withdrew an application',
        content: 'A candidate has withdrawn their application.',
        data: { applicationId: id, jobId: application.job_id, status: 'withdrawn', url: `/?view=job-candidates&jobId=${application.job_id}` },
      });
    }

    // Confirm the withdrawal to the candidate (in-app + email).
    await notifyCandidateOfApplication(id!, {
      title: 'Application withdrawn',
      status: 'withdrawn',
      statusLabel: 'Withdrawn',
      jobId: application.job_id,
      emailKind: 'withdrawn',
    });

    return res.json({
      success: true,
      message: 'Application withdrawn successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Delete application error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to withdraw application'
    });

  } finally {
    client.release();
  }
});

// @route   GET /api/v1/applications/requirements/:jobId
// @desc    See application requirements
// @access  Private (Candidates)
router.get('/requirements/:jobId', [protect, authorize('candidate'), param('jobId').isUUID(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { jobId } = req.params;

    const jobResult = await dbQuery(
      'SELECT title, description, requirements, screening_questions, application_instructions, documents FROM jobs WHERE id = $1 AND status = $2',
      [jobId, 'active']
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job not found or not accepting applications'
      });
    }

    return res.json({
      success: true,
      data: jobResult.rows[0]
    });

  } catch (error) {
    logger.error('Get application requirements error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve application requirements'
    });
  }
});

// @route   POST /api/v1/applications
// @desc    Submit a new job application
// @access  Private (Candidates only)
router.post(
  '/',
  [
    protect,
    authorize('candidate'),
    body('jobId').isUUID(),
    body('additionalInfo').optional(),
    validateRequest
  ],
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const client = await getClient();

    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(' [APPLICATION SUBMISSION] Starting...');
      console.log(` User ID: ${authReq.user!.id}`);
      console.log(`📧 User Email: ${authReq.user!.email}`);
      console.log(`📋 Job ID: ${req.body.jobId}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      await client.query('BEGIN');

      const { jobId, additionalInfo } = req.body;

      console.log('🔍 [STEP 1] Checking if job exists and is active...');

      // Check if job exists and is active
      const jobResult = await client.query(
        `SELECT
          j.id,
          j.title,
          j.company_id
        FROM jobs j
        WHERE j.id = $1 AND j.status = $2 AND j.deleted_at IS NULL`,
        [jobId, 'active']
      );

      if (jobResult.rows.length === 0) {
        console.log(' Job not found or not active');
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Job not found or not accepting applications'
        });
      }

      const job = jobResult.rows[0];

      console.log(`''Job found: "${job.title}" (ID: ${job.id})`);

      console.log('🔍 [STEP 3] Checking if user already applied...');

      // Check if user already applied
      const existingApplication = await client.query(
        'SELECT id, status FROM applications WHERE job_id = $1 AND user_id = $2 AND deleted_at IS NULL',
        [jobId, authReq.user!.id]
      );

      let applicationId: string;
      let isNewApplication = false;
      // isNewApplication tracks INSERT vs UPDATE (for the audit operation type and
      // the 201-vs-200 HTTP status). A resubmission after withdrawal/rejection is
      // an UPDATE, but it's still a genuinely new application EVENT the candidate
      // and recruiter should be notified about - gate notifications on this instead.
      let shouldNotify = false;

      if (existingApplication.rows.length > 0) {
        const existingApp = existingApplication.rows[0];
        console.log(`📋 Existing application found: ${existingApp.id} (status: ${existingApp.status})`);

        if (existingApp.status !== 'withdrawn'&& existingApp.status !== 'rejected') {
          console.log(' User already applied with active status');
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'You have already applied for this job'
          });
        } else {
          console.log(`🔄 Updating existing ${existingApp.status} application...`);

          // Update the withdrawn/rejected application
          const updateResult = await client.query(
            `UPDATE applications SET
              status = 'submitted',
              screening_answers = $1,
              documents = $2,
              match_score = $3,
              submitted_data = $4,
              updated_at = NOW(),
              withdrawn_at = NULL,
              withdrawn_reason = NULL,
              rejection_reason = NULL
             WHERE id = $5
             RETURNING id`,
            [
              JSON.stringify(additionalInfo?.screeningAnswers || {}),
              JSON.stringify(additionalInfo?.documents || []),
              additionalInfo?.matchScore || null,
              JSON.stringify(additionalInfo || {}),
              existingApp.id
            ]
          );
          applicationId = updateResult.rows[0].id;
          isNewApplication = false;
          shouldNotify = true;
          console.log(`''Application updated successfully: ${applicationId}`);
        }
      } else {
        console.log(' Creating new application...');

        // Create new application
        const applicationResult = await client.query(
          `INSERT INTO applications (
            job_id, user_id, status, screening_answers, documents, match_score, submitted_data,
            applied_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          RETURNING id`,
          [
            jobId,
            authReq.user!.id,
            'submitted',
            JSON.stringify(additionalInfo?.screeningAnswers || {}),
            JSON.stringify(additionalInfo?.documents || []),
            additionalInfo?.matchScore || null,
            JSON.stringify(additionalInfo || {})
          ]
        );
        applicationId = applicationResult.rows[0].id;
        isNewApplication = true;
        shouldNotify = true;
        console.log(`''New application created successfully: ${applicationId}`);
      }

      await client.query('COMMIT');
      console.log('💾 Database transaction committed successfully');

      // Tell the hybrid recommender an application happened   a strong positive
      // signal for both the behavior model (recency-weighted interest profile)
      // and collaborative filtering (this candidate x job interaction).
      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'applications',
        operation: isNewApplication ? 'insert': 'update',
        candidate_id: authReq.user!.id,
        job_id: jobId,
        entity_id: applicationId,
        payload: {},
        source: 'backend',
      });

      // Best-effort side effects for a new application EVENT (fresh insert, or a
      // resubmission after withdrawal/rejection): a submission timeline entry, an
      // in-app notification, and a confirmation email. None of these may break the
      // application response if they fail.
      if (shouldNotify) {
        try {
          await dbQuery(
            `INSERT INTO application_timeline (application_id, event_type, event_data, created_by)
             VALUES ($1, 'application_submitted', $2, $3)`,
            [
              applicationId,
              JSON.stringify({ description: 'Application submitted', new_status: 'submitted'}),
              authReq.user!.id,
            ]
          );
        } catch (timelineErr) {
          logger.warn(`application_submitted timeline failed: ${(timelineErr as Error).message}`);
        }

        await notifyCandidateOfApplication(applicationId, {
          title: 'Application received',
          status: 'submitted',
          statusLabel: 'Applied',
          jobId,
          emailKind: 'received',
        });

        const candidateName = authReq.user!.name || authReq.user!.email.split('@')[0] || 'Candidate';
        await notifyRecruiterOfApplication(applicationId, {
          candidateName,
          candidateEmail: authReq.user!.email,
          jobTitle: job.title,
          companyId: job.company_id,
          appliedAt: new Date().toLocaleString(),
        });
      }

      const responseData = {
        applicationId,
        isNewApplication,
        jobId,
        jobTitle: job.title,
        message: 'Application submitted successfully!'
      };

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`''Application submission completed successfully`);
      console.log(`📋 Application ID: ${applicationId}`);
      console.log(`🆕 New application: ${isNewApplication}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return res.status(isNewApplication ? 201 : 200).json({
        success: true,
        data: responseData
      });

    } catch (error) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(' [ERROR] Application submission failed');
      console.error(' Error details:', error);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      await client.query('ROLLBACK');
      logger.error('Submit application error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to submit application'
      });
    } finally {
      client.release();
    }
  }
);


// @route   GET /api/v1/applications/:id/rejection-reason
// @desc    See why I was rejected
// @access  Private (Candidates)
router.get('/:id/rejection-reason', [protect, authorize('candidate'), param('id').isUUID(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;

    const applicationResult = await dbQuery(
      'SELECT status, rejection_reason FROM applications WHERE id = $1 AND user_id = $2',
      [id, authReq.user.id]
    );

    if (applicationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    const application = applicationResult.rows[0];

    if (application.status !== 'rejected') {
      return res.status(400).json({
        success: false,
        message: 'Application was not rejected'
      });
    }

    return res.json({
      success: true,
      data: {
        rejection_reason: application.rejection_reason
      }
    });
  } catch (error) {
    logger.error('Get rejection reason error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve rejection reason'
    });
  }
});

// @route   POST /api/v1/applications/apply-with-profile/:jobId
// @desc    Apply with saved profile data
// @access  Private (Candidates)
router.post('/apply-with-profile/:jobId', [protect, authorize('candidate'), param('jobId').isUUID(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { jobId } = req.params;

    // Check if job exists and is active
    const jobResult = await client.query(
      'SELECT id, title FROM jobs WHERE id = $1 AND status = $2',
      [jobId, 'active']
    );

    if (jobResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Job not found or not accepting applications'
      });
    }

    // Get user's profile data
    const profileResult = await client.query(
      'SELECT * FROM candidate_profiles WHERE user_id = $1',
      [authReq.user.id]
    );

    if (profileResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Please complete your profile before applying'
      });
    }

    // Check if user already applied
    const existingApplication = await client.query(
      'SELECT id, status FROM applications WHERE job_id = $1 AND user_id = $2',
      [jobId, authReq.user.id]
    );

    if (existingApplication.rows.length > 0) {
      const existingApp = existingApplication.rows[0];
      if (existingApp.status !== 'withdrawn') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'You have already applied for this job'
        });
      } else {
        // Update the withdrawn application
        const updateResult = await client.query(
          `UPDATE applications SET
            status = 'submitted',
            profile_data = $1,
            updated_at = NOW()
           WHERE id = $2
           RETURNING id`,
          [JSON.stringify(profileResult.rows[0]), existingApp.id]
        );

        await client.query('COMMIT');

        RecommendationSyncService.queueEvent({
          event_type: 'recommendation_update',
          entity_type: 'applications',
          operation: 'update',
          candidate_id: authReq.user.id,
          job_id: jobId!,
          entity_id: updateResult.rows[0].id,
          payload: {},
          source: 'backend',
        });

        return res.status(200).json({
          success: true,
          message: 'Application submitted successfully',
          data: {
            applicationId: updateResult.rows[0].id,
            status: 'submitted'
          }
        });
      }
    }

    // Create new application
    const applicationResult = await client.query(
      `INSERT INTO applications (job_id, user_id, status, profile_data, applied_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      [jobId, authReq.user.id, 'submitted', JSON.stringify(profileResult.rows[0])]
    );

    await client.query('COMMIT');

    RecommendationSyncService.queueEvent({
      event_type: 'recommendation_update',
      entity_type: 'applications',
      operation: 'insert',
      candidate_id: authReq.user.id,
      job_id: jobId!,
      entity_id: applicationResult.rows[0].id,
      payload: {},
      source: 'backend',
    });

    return res.status(201).json({
      success: true,
      data: {
        applicationId: applicationResult.rows[0].id
      },
      message: 'Application submitted successfully with profile data'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Apply with profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit application'
    });
  } finally {
    client.release();
  }
});

// @route   POST /api/v1/applications/:id/documents
// @desc    Upload additional documents
// @access  Private (Candidates)
router.post('/:id/documents', [protect, authorize('candidate'), param('id').isUUID(), body('name').isString().trim().isLength({ min: 1, max: 100 }), body('url').isString().trim().isURL(), body('type').isIn(['resume', 'cover_letter', 'portfolio', 'certificate']), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;
    const { name, url, type } = req.body;

    // Verify application belongs to user
    const applicationResult = await dbQuery(
      'SELECT id, documents FROM applications WHERE id = $1 AND user_id = $2',
      [id, authReq.user.id]
    );

    if (applicationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // Get existing documents or initialize empty array
    let existingDocs = applicationResult.rows[0].documents || [];
    if (typeof existingDocs === 'string') {
      existingDocs = JSON.parse(existingDocs);
    }

    // Add new document
    const newDoc = {
      name,
      url,
      type,
      uploaded_at: new Date().toISOString()
    };
    existingDocs.push(newDoc);

    // Update applications.documents JSONB
    await dbQuery(
      'UPDATE applications SET documents = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(existingDocs), id]
    );

    return res.status(201).json({
      success: true,
      message: 'Document uploaded successfully'
    });
  } catch (error) {
    logger.error('Upload document error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload document'
    });
  }
});

// @route   POST /api/v1/applications/:id/questions
// @desc    Answer job-specific questions
// @access  Private (Candidates)
router.post('/:id/questions', [protect, authorize('candidate'), param('id').isUUID(), body('answers').isArray(), body('answers.*.questionId').isInt(), body('answers.*.answer').isString().trim(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;
    const { answers } = req.body;

    // Verify application belongs to user
    const applicationResult = await dbQuery(
      'SELECT id FROM applications WHERE id = $1 AND user_id = $2',
      [id, authReq.user.id]
    );

    if (applicationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // Store answers in application_answers table
    for (const answer of answers) {
      await dbQuery(
        'INSERT INTO application_answers (application_id, question_id, answer, answered_at) VALUES ($1, $2, $3, NOW())',
        [id, answer.questionId, answer.answer]
      );
    }

    return res.json({
      success: true,
      message: 'Answers submitted successfully'
    });
  } catch (error) {
    logger.error('Submit answers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit answers'
    });
  }
});

// @route   GET /api/v1/applications/history
// @desc    See application history
// @access  Private (Candidates)
router.get('/history', [protect, authorize('candidate'), query('page').optional().isInt({ min: 1 }).toInt(), query('limit').optional().isInt({ min: 1, max: 100 }).toInt(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    const applicationsResult = await dbQuery(
      `SELECT a.*, j.title as job_title, c.name as company_name
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       JOIN companies c ON j.company_id = c.id
       WHERE a.user_id = $1
       ORDER BY a.applied_at DESC
       LIMIT $2 OFFSET $3`,
      [authReq.user.id, limitNum, offset]
    );

    const totalResult = await dbQuery(
      'SELECT COUNT(*) as total FROM applications WHERE user_id = $1',
      [authReq.user.id]
    );

    return res.json({
      success: true,
      data: {
        applications: applicationsResult.rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: parseInt(totalResult.rows[0].total),
          pages: Math.ceil(parseInt(totalResult.rows[0].total) / limitNum)
        }
      }
    });
  } catch (error) {
    logger.error('Get application history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve application history'
    });
  }
});

// @route   GET /api/v1/applications/recruiter/feed
// @desc    See new applications in real-time
// @access  Private (Recruiters, Company Admins)
router.get('/recruiter/feed', [protect, authorize('recruiter', 'company_admin'), query('since').optional().isISO8601(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { since } = req.query;

    let whereConditions = ['a.applied_at > $1'];
    let params: any[] = [since || new Date(Date.now() - 24 * 60 * 60 * 1000)];
    let paramIndex = 2;

    if (authReq.user.user_type === 'company_admin') {
      whereConditions.push(`j.company_id IN (SELECT id FROM companies WHERE created_by = $${paramIndex})`);
      params.push(authReq.user.id);
      paramIndex++;
    } else {
      whereConditions.push(`j.created_by = $${paramIndex}`);
      params.push(authReq.user.id);
      paramIndex++;
    }

    const applicationsResult = await dbQuery(
      `SELECT a.*, j.title as job_title, u.email as candidate_email
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       JOIN users u ON a.user_id = u.id
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY a.applied_at DESC`,
      params
    );

    return res.json({
      success: true,
      data: applicationsResult.rows
    });
  } catch (error) {
    logger.error('Get applications feed error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve applications feed'
    });
  }
});

// @route   POST /api/v1/applications/recruiter/bulk
// @desc    Bulk-process applications
// @access  Private (Recruiters, Company Admins)
router.post('/recruiter/bulk', [protect, authorize('recruiter', 'company_admin'), body('applicationIds').isArray(), body('applicationIds.*').isUUID(), body('action').isIn(['shortlist', 'reject', 'move_to_interview']), body('rejectionReason').optional().isString().trim(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { applicationIds, action, rejectionReason } = req.body;

    // Verify user has access to these applications
    for (const appId of applicationIds) {
      const appResult = await client.query(
        `SELECT a.id FROM applications a
         JOIN jobs j ON a.job_id = j.id
         WHERE a.id = $1 AND (
           j.created_by = $2 OR
           j.company_id IN (SELECT id FROM companies WHERE created_by = $2)
         )`,
        [appId, authReq.user.id]
      );

      if (appResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: `No access to application ${appId}`
        });
      }
    }

    let newStatus;
    switch (action) {
      case 'shortlist':
        newStatus = 'shortlisted';
        break;
      case 'reject':
        newStatus = 'rejected';
        break;
      case 'move_to_interview':
        newStatus = 'interview';
        break;
    }

    for (const appId of applicationIds) {
      await client.query(
        'UPDATE applications SET status = $1, rejection_reason = $2, updated_at = NOW() WHERE id = $3',
        [newStatus, action === 'reject'? rejectionReason : null, appId]
      );
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `Successfully processed ${applicationIds.length} applications`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Bulk process applications error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process applications'
    });
  } finally {
    client.release();
  }
});

// @route   POST /api/v1/applications/recruiter/auto-reject
// @desc    Setup auto-reject rules
// @access  Private (Recruiters, Company Admins)
router.post('/recruiter/auto-reject', [protect, authorize('recruiter', 'company_admin'), body('jobId').isUUID(), body('rules').isArray(), body('rules.*.condition').isString(), body('rules.*.value').exists(), body('rules.*.rejectionReason').isString().trim(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { jobId, rules } = req.body;

    // Verify user owns the job
    const jobResult = await dbQuery(
      `SELECT id FROM jobs WHERE id = $1 AND (
        created_by = $2 OR
        company_id IN (SELECT id FROM companies WHERE created_by = $2)
      )`,
      [jobId, authReq.user.id]
    );

    if (jobResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No access to this job'
      });
    }

    // Store auto-reject rules
    await dbQuery('DELETE FROM auto_reject_rules WHERE job_id = $1', [jobId]);

    for (const rule of rules) {
      await dbQuery(
        'INSERT INTO auto_reject_rules (job_id, condition, value, rejection_reason) VALUES ($1, $2, $3, $4)',
        [jobId, rule.condition, rule.value, rule.rejectionReason]
      );
    }

    return res.json({
      success: true,
      message: 'Auto-reject rules configured successfully'
    });
  } catch (error) {
    logger.error('Setup auto-reject rules error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to setup auto-reject rules'
    });
  }
});

// @route   POST /api/v1/applications/recruiter/move-stage
// @desc    Move candidates between hiring stages
// @access  Private (Recruiters, Company Admins)
router.post('/recruiter/move-stage', [protect, authorize('recruiter', 'company_admin'), body('applicationId').isUUID(), body('newStatus').isIn(['under_review', 'shortlisted', 'interview', 'offer', 'hired', 'rejected']), body('notes').optional().isString().trim(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { applicationId, newStatus, notes } = req.body;

    // Verify user has access to this application
    const appResult = await dbQuery(
      `SELECT a.id FROM applications a
       JOIN jobs j ON a.job_id = j.id
       WHERE a.id = $1 AND (
         j.created_by = $2 OR
         j.company_id IN (SELECT id FROM companies WHERE created_by = $2)
       )`,
      [applicationId, authReq.user.id]
    );

    if (appResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No access to this application'
      });
    }

    await dbQuery(
      'UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, applicationId]
    );

    if (notes) {
      await dbQuery(
        'INSERT INTO application_notes (application_id, user_id, notes, created_at) VALUES ($1, $2, $3, NOW())',
        [applicationId, authReq.user.id, notes]
      );
    }

    return res.json({
      success: true,
      message: 'Application moved to new stage successfully'
    });
  } catch (error) {
    logger.error('Move application stage error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to move application stage'
    });
  }
});

// @route   POST /api/v1/applications/recruiter/notes
// @desc    Add internal notes to applications
// @access  Private (Recruiters, Company Admins)
router.post('/recruiter/notes', [protect, authorize('recruiter', 'company_admin'), body('applicationId').isUUID(), body('notes').isString().trim().isLength({ min: 1, max: 1000 }), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { applicationId, notes } = req.body;

    // Verify user has access to this application
    const appResult = await dbQuery(
      `SELECT a.id FROM applications a
       JOIN jobs j ON a.job_id = j.id
       WHERE a.id = $1 AND (
         j.created_by = $2 OR
         j.company_id IN (SELECT id FROM companies WHERE created_by = $2)
       )`,
      [applicationId, authReq.user.id]
    );

    if (appResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No access to this application'
      });
    }

    await dbQuery(
      'INSERT INTO application_notes (application_id, user_id, notes, created_at) VALUES ($1, $2, $3, NOW())',
      [applicationId, authReq.user.id, notes]
    );

    return res.status(201).json({
      success: true,
      message: 'Notes added successfully'
    });
  } catch (error) {
    logger.error('Add application notes error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add notes'
    });
  }
});

// @route   POST /api/v1/applications/recruiter/assign
// @desc    Assign applications to team members
// @access  Private (Recruiters, Company Admins)
router.post('/recruiter/assign', [protect, authorize('recruiter', 'company_admin'), body('applicationId').isUUID(), body('assigneeId').isUUID(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { applicationId, assigneeId } = req.body;

    // Verify user has access to this application and assignee is in same company
    const accessResult = await dbQuery(
      `SELECT a.id FROM applications a
       JOIN jobs j ON a.job_id = j.id
       LEFT JOIN company_team ct ON ct.company_id = j.company_id AND ct.user_id = $3
       WHERE a.id = $1 AND (
         j.created_by = $2 OR
         j.company_id IN (SELECT id FROM companies WHERE created_by = $2)
       ) AND (ct.user_id IS NOT NULL OR $3 = $2)`,
      [applicationId, authReq.user.id, assigneeId]
    );

    if (accessResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No access to assign this application'
      });
    }

    await dbQuery(
      'UPDATE applications SET assigned_to = $1, updated_at = NOW() WHERE id = $2',
      [assigneeId, applicationId]
    );

    return res.json({
      success: true,
      message: 'Application assigned successfully'
    });
  } catch (error) {
    logger.error('Assign application error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign application'
    });
  }
});

// @route   POST /api/v1/applications/recruiter/reminders
// @desc    Set reminders for following up
// @access  Private (Recruiters, Company Admins)
router.post('/recruiter/reminders', [protect, authorize('recruiter', 'company_admin'), body('applicationId').isUUID(), body('reminderDate').isISO8601(), body('message').isString().trim().isLength({ min: 1, max: 500 }), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { applicationId, reminderDate, message } = req.body;

    // Verify user has access to this application
    const appResult = await dbQuery(
      `SELECT a.id FROM applications a
       JOIN jobs j ON a.job_id = j.id
       WHERE a.id = $1 AND (
         j.created_by = $2 OR
         j.company_id IN (SELECT id FROM companies WHERE created_by = $2)
       )`,
      [applicationId, authReq.user.id]
    );

    if (appResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No access to this application'
      });
    }

    await dbQuery(
      'INSERT INTO application_reminders (application_id, user_id, reminder_time, title, description, reminder_time, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [applicationId, authReq.user.id, reminderDate, 'Follow-up', message, reminderDate, authReq.user.id]
    );

    return res.status(201).json({
      success: true,
      message: 'Reminder set successfully'
    });
  } catch (error) {
    logger.error('Set reminder error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to set reminder'
    });
  }
});

// @route   GET /api/v1/applications/recruiter/export
// @desc    Export applications to Excel/CSV
// @access  Private (Recruiters, Company Admins)
router.get('/recruiter/export', [protect, authorize('recruiter', 'company_admin'), query('jobId').optional().isUUID(), query('format').isIn(['csv', 'excel']), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { jobId, format } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (jobId) {
      whereConditions.push(`a.job_id = $${paramIndex}`);
      params.push(jobId);
      paramIndex++;
    }

    if (authReq.user.user_type === 'company_admin') {
      whereConditions.push(`j.company_id IN (SELECT id FROM companies WHERE created_by = $${paramIndex})`);
      params.push(authReq.user.id);
      paramIndex++;
    } else {
      whereConditions.push(`j.created_by = $${paramIndex}`);
      params.push(authReq.user.id);
      paramIndex++;
    }

    const applicationsResult = await dbQuery(
      `SELECT a.*, j.title as job_title, c.name as company_name, u.email as candidate_email
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       JOIN companies c ON j.company_id = c.id
       JOIN users u ON a.user_id = u.id
       WHERE ${whereConditions.join(' AND ')}
       ORDER BY a.applied_at DESC`,
      params
    );

    return res.json({
      success: true,
      data: applicationsResult.rows,
      message: `Data ready for ${format} export`
    });
  } catch (error) {
    logger.error('Export applications error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export applications'
    });
  }
});

// @route   GET /api/v1/applications/recruiter/sources
// @desc    See application sources
// @access  Private (Recruiters, Company Admins)
router.get('/recruiter/sources', [protect, authorize('recruiter', 'company_admin'), query('jobId').optional().isUUID(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { jobId } = req.query;

    let whereConditions = ['1=1'];
    let params = [];
    let paramIndex = 1;

    if (jobId) {
      whereConditions.push(`a.job_id = $${paramIndex}`);
      params.push(jobId);
      paramIndex++;
    }

    if (authReq.user.user_type === 'company_admin') {
      whereConditions.push(`j.company_id IN (SELECT id FROM companies WHERE created_by = $${paramIndex})`);
      params.push(authReq.user.id);
      paramIndex++;
    } else {
      whereConditions.push(`j.created_by = $${paramIndex}`);
      params.push(authReq.user.id);
      paramIndex++;
    }

    const sourcesResult = await dbQuery(
      `SELECT a.source, COUNT(*) as count
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       WHERE ${whereConditions.join(' AND ')}
       GROUP BY a.source
       ORDER BY count DESC`,
      params
    );

    return res.json({
      success: true,
      data: sourcesResult.rows
    });
  } catch (error) {
    logger.error('Get application sources error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve application sources'
    });
  }
});

// @route   POST /api/v1/applications/recruiter/blacklist
// @desc    Blacklist candidates who misbehave
// @access  Private (Recruiters, Company Admins)
router.post('/recruiter/blacklist', [protect, authorize('recruiter', 'company_admin'), body('candidateId').isUUID(), body('reason').isString().trim().isLength({ min: 1, max: 500 }), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { candidateId, reason } = req.body;

    // protect middleware already resolves this respecting is_default, for
    // users on more than one company's team.
    let companyId = null;
    if (authReq.user.user_type === 'company_admin'|| authReq.user.user_type === 'recruiter') {
      companyId = authReq.user.company_id ? String(authReq.user.company_id) : null;
    }

    if (!companyId) {
      return res.status(403).json({
        success: false,
        message: 'No company associated with your account'
      });
    }

    // Check if candidate is already blacklisted
    const existingBlacklist = await dbQuery(
      'SELECT id FROM blacklisted_candidates WHERE company_id = $1 AND user_id = $2',
      [companyId, candidateId]
    );

    if (existingBlacklist.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Candidate is already blacklisted'
      });
    }

    await dbQuery(
      `INSERT INTO blacklisted_candidates (company_id, user_id, reason, blacklisted_by, blacklisted_at, level, reason_category)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6)`,
      [companyId, candidateId, reason, authReq.user.id, 'temporary', 'other']
    );

    return res.status(201).json({
      success: true,
      message: 'Candidate blacklisted successfully'
    });
  } catch (error) {
    logger.error('Blacklist candidate error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to blacklist candidate'
    });
  }
});

export default router;