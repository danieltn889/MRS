import { Request, Response } from 'express';
import BaseController from './base.controller.js';  // Use .js, not .ts
import DatabaseService from '../services/database.service.js';  // Use .js
import ResponseService from '../services/response.service.js';  // Use .js
import RecommendationSyncService from '../services/recommendation-sync.service.js';
import { logger } from '../utils/logger.js';  // Use .js
import { AuthenticatedRequest, User as AuthUser } from '../types/auth.types.js';  // Use .js
import PaginationService from '../services/pagination.service.js';
import ValidationService from '../services/validation.service.js';


interface JobQueryParams {
  page?: string;
  limit?: string;
  search?: string;
  location?: string;
  jobType?: string;
  experienceLevel?: string;
  salaryMin?: string;
  salaryMax?: string;
  companyId?: string;
  skills?: string;
}

interface JobData {
  title: string;
  description: string;
  location?: string;
  locations?: any[];
  jobType: string;
  experienceLevel: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  requirements?: any[];
  benefits?: any[];
  companyName?: string;
  skills?: string[];
  expiresAt?: string;
  company_id?: number;
  created_by?: number;
  slug?: string;
}

class JobController extends BaseController {
  constructor() {
    super('JobController');
  }

  private normalizeEducationRequirements(educationLevel: any): any {
    if (!educationLevel) {
      return {
        minimum_degree: null,
        qualification_entries: [],        // ← ADD
        fields_of_study: [],
        is_degree_required: false,
        certifications: [],
        additional_requirements: [],
        languages: [],
        experience_requirements: [],
        age_requirement: '',
        no_experience_needed: false,
        no_languages_needed: false,
        no_certifications_needed: false,
        no_documents_needed: false
      };
    }

    if (typeof educationLevel === 'object'&& !Array.isArray(educationLevel)) {
      return {
        minimum_degree: educationLevel.minimum_degree || null,
        qualification_entries: educationLevel.qualification_entries || [],  // ← ADD
        fields_of_study: educationLevel.fields_of_study || [],
        is_degree_required: educationLevel.is_degree_required !== false,
        certifications: educationLevel.certifications || [],
        additional_requirements: educationLevel.additional_requirements || [],
        languages: educationLevel.languages || [],
        experience_requirements: educationLevel.experience_requirements || [],
        age_requirement: educationLevel.age_requirement || '',
        no_experience_needed: educationLevel.no_experience_needed || false,
        no_languages_needed: educationLevel.no_languages_needed || false,
        no_certifications_needed: educationLevel.no_certifications_needed || false,
        no_documents_needed: educationLevel.no_documents_needed || false
      };
    }

    // array / string cases   keep as-is, just add qualification_entries: []
    if (Array.isArray(educationLevel)) {
      return {
        minimum_degree: educationLevel[0] || null,
        qualification_entries: [],        // ← ADD
        fields_of_study: educationLevel.slice(1),
        is_degree_required: true,
        certifications: [],
        additional_requirements: [],
        languages: [],
        experience_requirements: [],
        age_requirement: '',
        no_experience_needed: false,
        no_languages_needed: false,
        no_certifications_needed: false,
        no_documents_needed: false
      };
    }

    if (typeof educationLevel === 'string'&& educationLevel.trim() !== '') {
      return {
        minimum_degree: educationLevel.trim(),
        qualification_entries: [],        // ← ADD
        fields_of_study: [],
        is_degree_required: true,
        certifications: [],
        additional_requirements: [],
        languages: [],
        experience_requirements: [],
        age_requirement: '',
        no_experience_needed: false,
        no_languages_needed: false,
        no_certifications_needed: false,
        no_documents_needed: false
      };
    }

    return {
      minimum_degree: null,
      qualification_entries: [],          // ← ADD
      fields_of_study: [],
      is_degree_required: false,
      certifications: [],
      additional_requirements: [],
      languages: [],
      experience_requirements: [],
      age_requirement: '',
      no_experience_needed: false,
      no_languages_needed: false,
      no_certifications_needed: false,
      no_documents_needed: false
    };
  }
  private normalizeApplicationLimit(limit: any): number | null {
    if (limit === null || limit === undefined || limit === '') {
      return null;
    }
    const num = Number(limit);
    return isNaN(num) ? null : num;
  }

  private normalizeArrayField(value: any): any[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter(item => {
        if (typeof item === 'string') return item.trim() !== '';
        if (typeof item === 'object') return Object.keys(item).length > 0;
        return item !== null && item !== undefined;
      });
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return value.trim() ? [value] : [];
      }
    }
    return [];
  }

  private normalizeJobType(jobType: string): string {
    const normalized = (jobType || 'full-time').toLowerCase();
    const typeMap: Record<string, string> = {
      'full_time': 'full-time',
      'fulltime': 'full-time',
      'part_time': 'part-time',
      'parttime': 'part-time',
      'contractor': 'contract',
      'intern': 'internship',
      'freelancer': 'freelance',
      'temporary': 'temporary'
    };
    return typeMap[normalized] || normalized.replace(/_/g, '-');
  }

  private normalizeWorkArrangement(workArrangement: string): string {
    const validArrangements = ['remote', 'hybrid', 'onsite', 'flexible'];
    const normalized = (workArrangement || 'onsite').toLowerCase();
    return validArrangements.includes(normalized) ? normalized : 'onsite';
  }

  private normalizeExperienceLevel(level: string): string {
    const validLevels = ['entry', 'mid', 'senior', 'lead', 'executive'];
    const normalized = (level || 'entry').toLowerCase();
    return validLevels.includes(normalized) ? normalized : 'entry';
  }

  private normalizeJobSkillEntries(requiredSkills: any[], preferredSkills: any[] = []): any[] {
    const toSkillObject = (skill: any, isRequired: boolean) => {
      const skillData = typeof skill === 'string'? { name: skill } : skill;
      return {
        ...skillData,
        is_required: isRequired,
        importance: skillData.importance || (isRequired ? 'required': 'preferred')
      };
    };

    return [
      ...requiredSkills.map(skill => toSkillObject(skill, true)),
      ...preferredSkills.map(skill => toSkillObject(skill, false))
    ];
  }

  // =====================================================
  // CORE CRUD OPERATIONS
  // =====================================================

  async getJobs(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = '1',
        limit = '20',
        search,
        location,
        jobType,
        experienceLevel,
        salaryMin,
        salaryMax,
        companyId,
        skills
      } = req.query as JobQueryParams;

      const { page: validPage, limit: validLimit } = PaginationService.validatePaginationParams(page, limit);

      let query = `
        SELECT 
          j.id, j.title, j.slug, j.description, j.job_type, j.work_arrangement,
          j.locations, j.salary_min, j.salary_max, j.salary_currency, j.experience_level,
          j.status, j.visibility, j.published_at, j.expires_at, j.view_count, j.application_count,
          j.created_at, j.updated_at, j.department, j.tags, j.education_required,
          c.id as company_id, c.name as company_name, c.logo_url, c.industry, c.size as company_size
        FROM jobs j
        LEFT JOIN companies c ON j.company_id = c.id
        WHERE j.status = 'active'
        AND (j.published_at IS NULL OR j.published_at <= NOW())
        AND (j.expires_at IS NULL OR j.expires_at > NOW())
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (search) {
        query += ` AND (
          j.title ILIKE $${paramIndex}
          OR j.description ILIKE $${paramIndex}
          OR c.name ILIKE $${paramIndex}
          OR j.work_arrangement ILIKE $${paramIndex}
          OR j.job_type ILIKE $${paramIndex}
          OR j.experience_level ILIKE $${paramIndex}
          OR COALESCE(j.tags::text, '') ILIKE $${paramIndex}
          OR COALESCE(j.locations::text, '') ILIKE $${paramIndex}
          OR COALESCE(j.requirements::text, '') ILIKE $${paramIndex}
          OR COALESCE(j.responsibilities::text, '') ILIKE $${paramIndex}
          OR EXISTS (
            SELECT 1 FROM job_skills js
            JOIN skills s ON js.skill_id = s.id
            WHERE js.job_id = j.id AND s.name ILIKE $${paramIndex}
          )
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (location) {
        query += ` AND j.locations::text ILIKE $${paramIndex}`;
        params.push(`%${location}%`);
        paramIndex++;
      }

      if (jobType) {
        query += ` AND j.job_type = $${paramIndex}`;
        params.push(this.normalizeJobType(jobType));
        paramIndex++;
      }

      if (experienceLevel) {
        query += ` AND j.experience_level = $${paramIndex}`;
        params.push(this.normalizeExperienceLevel(experienceLevel));
        paramIndex++;
      }

      if (salaryMin) {
        query += ` AND j.salary_max >= $${paramIndex}`;
        params.push(parseInt(salaryMin));
        paramIndex++;
      }

      if (salaryMax) {
        query += ` AND j.salary_min <= $${paramIndex}`;
        params.push(parseInt(salaryMax));
        paramIndex++;
      }

      if (companyId) {
        query += ` AND j.company_id = $${paramIndex}`;
        params.push(companyId);
        paramIndex++;
      }

      if (skills) {
        const skillArray = skills.split(',').map(s => s.trim());
        query += ` AND EXISTS (
          SELECT 1 FROM job_skills js 
          JOIN skills s ON js.skill_id = s.id 
          WHERE js.job_id = j.id AND s.name = ANY($${paramIndex})
        )`;
        params.push(skillArray);
        paramIndex++;
      }

      query += ` ORDER BY j.created_at DESC, j.id LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(validLimit, (validPage - 1) * validLimit);

      const result = await DatabaseService.execute(query, params);

      let countQuery = `
        SELECT COUNT(*) as total FROM jobs j
        LEFT JOIN companies c ON j.company_id = c.id
        WHERE j.status = 'active'
        AND (j.published_at IS NULL OR j.published_at <= NOW())
        AND (j.expires_at IS NULL OR j.expires_at > NOW())
      `;
      const countParams: any[] = [];
      let countIndex = 1;

      if (search) {
        countQuery += ` AND (
          j.title ILIKE $${countIndex}
          OR j.description ILIKE $${countIndex}
          OR c.name ILIKE $${countIndex}
          OR j.work_arrangement ILIKE $${countIndex}
          OR j.job_type ILIKE $${countIndex}
          OR j.experience_level ILIKE $${countIndex}
          OR COALESCE(j.tags::text, '') ILIKE $${countIndex}
          OR COALESCE(j.locations::text, '') ILIKE $${countIndex}
          OR COALESCE(j.requirements::text, '') ILIKE $${countIndex}
          OR COALESCE(j.responsibilities::text, '') ILIKE $${countIndex}
          OR EXISTS (
            SELECT 1 FROM job_skills js
            JOIN skills s ON js.skill_id = s.id
            WHERE js.job_id = j.id AND s.name ILIKE $${countIndex}
          )
        )`;
        countParams.push(`%${search}%`);
        countIndex++;
      }
      if (location) {
        countQuery += ` AND j.locations::text ILIKE $${countIndex}`;
        countParams.push(`%${location}%`);
        countIndex++;
      }
      if (jobType) {
        countQuery += ` AND j.job_type = $${countIndex}`;
        countParams.push(this.normalizeJobType(jobType));
        countIndex++;
      }
      if (experienceLevel) {
        countQuery += ` AND j.experience_level = $${countIndex}`;
        countParams.push(this.normalizeExperienceLevel(experienceLevel));
        countIndex++;
      }
      if (companyId) {
        countQuery += ` AND j.company_id = $${countIndex}`;
        countParams.push(companyId);
        countIndex++;
      }

      const countResult = await DatabaseService.execute(countQuery, countParams);
      const total = parseInt(countResult.rows[0]?.total || '0');

      const paginationMeta = PaginationService.getPaginationMeta(total, validPage, validLimit);

      this.sendSuccess(res, {
        data: result.rows,
        pagination: paginationMeta
      });
    } catch (error) {
      logger.error('Error fetching jobs:', error);
      this.sendError(res, 'Failed to fetch jobs', 500, error as Error);
    }
  }

  async getJob(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id || !ValidationService.isValidUUID(id)) {
        this.sendError(res, 'Invalid job ID format', 400);
        return;
      }

      const jobResult = await DatabaseService.execute(`
      SELECT
        j.*,
        c.name as company_name,
        c.logo_url,
        c.website,
        c.description as company_description,
        c.industry,
        c.size as company_size
      FROM jobs j
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE j.id = $1
    `, [id]);

      const job = jobResult.rows[0];

      if (!job) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      // Parse JSONB fields
      if (job.education_required && typeof job.education_required === 'string') {
        job.education_required = JSON.parse(job.education_required);
      }
      if (job.locations && typeof job.locations === 'string') {
        job.locations = JSON.parse(job.locations);
      }
      if (job.responsibilities && typeof job.responsibilities === 'string') {
        job.responsibilities = JSON.parse(job.responsibilities);
      }
      if (job.requirements && typeof job.requirements === 'string') {
        try {
          const parsed = JSON.parse(job.requirements);
          job.requirements = Array.isArray(parsed) ? parsed : (parsed.required || []);
        } catch {
          job.requirements = [];
        }
      }
      if (job.benefits && typeof job.benefits === 'string') {
        job.benefits = JSON.parse(job.benefits);
      }
      if (job.skills_required && typeof job.skills_required === 'string') {
        job.skills_required = JSON.parse(job.skills_required);
      }
      if (job.skills_preferred && typeof job.skills_preferred === 'string') {
        job.skills_preferred = JSON.parse(job.skills_preferred);
      }
      if (job.language_requirements && typeof job.language_requirements === 'string') {
        job.language_requirements = JSON.parse(job.language_requirements);
      }
      if (job.experience_requirements && typeof job.experience_requirements === 'string') {
        job.experience_requirements = JSON.parse(job.experience_requirements);
      }
      if (job.screening_questions && typeof job.screening_questions === 'string') {
        job.screening_questions = JSON.parse(job.screening_questions);
      }
      if (job.documents && typeof job.documents === 'string') {
        job.documents = JSON.parse(job.documents);
      }

      // ''CRITICAL: Map education_required to educationLevel for frontend
      job.educationLevel = job.education_required;

      // ''Ensure default structure if empty
      if (!job.education_required) {
        const defaultEducation = {
          minimum_degree: null,
          fields_of_study: [],
          certifications: [],
          languages: [],
          experience_requirements: [],
          age_requirement: '',
          no_experience_needed: false,
          no_languages_needed: false,
          no_certifications_needed: false,
          no_documents_needed: false
        };
        job.education_required = defaultEducation;
        job.educationLevel = defaultEducation;
      }

      // Map other fields to frontend expected names
      job.jobType = job.job_type;
      job.workArrangement = job.work_arrangement;
      job.experienceLevel = job.experience_level;
      job.salaryCurrency = job.salary_currency;
      job.salaryVisible = job.salary_visible;
      job.publishedAt = job.published_at;
      job.expiresAt = job.expires_at;
      job.applicationLimit = job.application_limit;
      job.screeningQuestions = job.screening_questions;
      job.applicationInstructions = job.application_instructions;
      job.requiredDocuments = job.documents;

      // Increment view count
      await DatabaseService.execute(
        'UPDATE jobs SET view_count = view_count + 1 WHERE id = $1',
        [id]
      );

      // Get skills for this job
      const skills = await DatabaseService.execute(`
      SELECT s.id, s.name, s.category, js.proficiency_level, js.is_required, js.importance
      FROM job_skills js
      JOIN skills s ON js.skill_id = s.id
      WHERE js.job_id = $1
      ORDER BY js.is_required DESC, js.importance DESC, s.name
    `, [id]);

      const storedRequiredSkills = Array.isArray(job.skills_required) ? job.skills_required : [];
      const storedPreferredSkills = Array.isArray(job.skills_preferred) ? job.skills_preferred : [];
      const joinedRequiredSkills = skills.rows.filter((s: any) => s.is_required === true);
      const joinedPreferredSkills = skills.rows.filter((s: any) => s.is_required === false);

      job.skills = skills.rows.length > 0 ? skills.rows : [...storedRequiredSkills, ...storedPreferredSkills];
      job.skills_required = joinedRequiredSkills.length > 0 ? joinedRequiredSkills : storedRequiredSkills;
      job.skills_preferred = joinedPreferredSkills.length > 0 ? joinedPreferredSkills : storedPreferredSkills;

      // Map skills fields
      job.requiredSkills = job.skills_required;
      job.preferredSkills = job.skills_preferred;

      this.sendSuccess(res, job);
    } catch (error) {
      logger.error('Error fetching job:', error);
      this.sendError(res, 'Failed to fetch job', 500, error as Error);
    }
  }

  async createJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      logger.info('========== CREATE JOB START ==========');

      const jobData = req.body;
      logger.info('Received job data:', JSON.stringify(jobData, null, 2));

      let companyId: string | null = null;
      const userId = req.user?.id;

      if (!userId) {
        this.sendError(res, 'User not authenticated', 401);
        return;
      }

      // protect middleware already resolves this respecting is_default, for
      // users on more than one company's team.
      if (req.user.user_type === 'company_admin'|| req.user.user_type === 'recruiter') {
        companyId = req.user.company_id ? String(req.user.company_id) : null;
      }

      if (!companyId) {
        this.sendError(res, 'No company found for this user', 404);
        return;
      }

      if (!jobData.title || !jobData.description) {
        this.sendError(res, 'Title and description are required', 400);
        return;
      }

      const normalizedJobType = this.normalizeJobType(jobData.jobType);
      const normalizedWorkArrangement = this.normalizeWorkArrangement(jobData.workArrangement);
      const normalizedExperienceLevel = this.normalizeExperienceLevel(jobData.experienceLevel);

      let publishedAt = null;
      let expiresAt = null;
      let postingDuration = jobData.postingDuration || 30;

      const status = jobData.status || 'draft';

      if (status === 'active') {
        publishedAt = jobData.publishedAt ? new Date(jobData.publishedAt) : new Date();
        expiresAt = jobData.expiresAt
          ? new Date(jobData.expiresAt)
          : new Date(publishedAt.getTime() + postingDuration * 24 * 60 * 60 * 1000);
      }

      const slug = this.generateSlug(jobData.title);

      const existingJob = await DatabaseService.execute(
        'SELECT id FROM jobs WHERE slug = $1',
        [slug]
      );
      const finalSlug = existingJob.rows.length > 0 ? `${slug}-${Date.now()}` : slug;

      const locations = this.normalizeArrayField(jobData.locations);
      const responsibilities = this.normalizeArrayField(jobData.responsibilities);
      const requirements = this.normalizeArrayField(jobData.requirements);
      const benefits = this.normalizeArrayField(jobData.benefits);
      const skillsRequired = this.normalizeArrayField(jobData.requiredSkills);
      const skillsPreferred = this.normalizeArrayField(jobData.preferredSkills);
      const screeningQuestions = this.normalizeArrayField(jobData.screeningQuestions);
      const documents = this.normalizeArrayField(jobData.requiredDocuments);
      const tags = this.normalizeArrayField(jobData.tags);
      const educationRequired = this.normalizeEducationRequirements(jobData.educationLevel);
      const languageRequirements = this.normalizeArrayField(
        jobData.languageRequirements ?? educationRequired.languages
      );
      const experienceRequirements = this.normalizeArrayField(
        jobData.experienceRequirements ?? educationRequired.experience_requirements
      );
      const allSkills = this.normalizeJobSkillEntries(skillsRequired, skillsPreferred);

      // Get AI match score (default to 70 if not provided)
      const aiMatchRequiredScore = jobData.aiMatchRequiredScore ?? 70;

      const job = await this.withTransaction(async (client) => {
        const jobResult = await client.query(`
        INSERT INTO jobs (
          company_id, created_by, title, slug, department, job_type, work_arrangement,
          locations, description, responsibilities, requirements, salary_min,
          salary_max, salary_currency, salary_period, salary_visible, benefits, status, visibility,
          published_at, expires_at, application_limit, screening_questions,
          application_instructions, skills_required, skills_preferred, documents,
          tags, education_required, language_requirements, experience_requirements,
          experience_level, experience_min, experience_max, ai_match_required_score,
          qualifications,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                  $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35,
                  $36,
                  NOW(), NOW())
        RETURNING *
      `, [
          companyId,
          userId,
          jobData.title,
          finalSlug,
          jobData.department || null,
          normalizedJobType,
          normalizedWorkArrangement,
          JSON.stringify(locations),
          jobData.description,
          JSON.stringify(responsibilities),
          JSON.stringify(requirements),
          jobData.salaryMin ?? null,
          jobData.salaryMax ?? null,
          jobData.salaryCurrency || 'Rwf',
          jobData.salaryPeriod || 'month',
          jobData.salaryVisible !== false,
          JSON.stringify(benefits),
          status,
          jobData.visibility || 'public',
          publishedAt,
          expiresAt,
          this.normalizeApplicationLimit(jobData.applicationLimit),
          JSON.stringify(screeningQuestions),
          JSON.stringify({
            method: jobData.applicationMethod || 'platform',
            instructions: jobData.applicationInstructions || null,
            documents: documents
          }),
          JSON.stringify(skillsRequired),
          JSON.stringify(skillsPreferred),
          JSON.stringify(documents),
          tags,
          JSON.stringify(educationRequired),
          JSON.stringify(languageRequirements),
          JSON.stringify(experienceRequirements),
          normalizedExperienceLevel,
          jobData.experienceMin ?? null,
          jobData.experienceMax ?? null,
          aiMatchRequiredScore,
          jobData.qualifications || null
        ]);

        return jobResult.rows[0];
      });

      if (allSkills.length > 0) {
        await this.insertJobSkills(job.id, allSkills);
      }

      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'jobs',
        operation: 'insert',
        entity_id: String(job.id),
        job_id: String(job.id),
        payload: {
          status,
          company_id: companyId,
          title: job.title,
        },
        source: 'backend',
      });

      logger.info('========== CREATE JOB SUCCESS ==========');

      this.sendSuccess(res, job, 'Job created successfully', 201);
    } catch (error) {
      logger.error('========== CREATE JOB ERROR ==========');
      logger.error('Error creating job:', error);
      this.sendError(res, 'Failed to create job: '+ (error as Error).message, 500, error as Error);
    }
  }

  async updateJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      const jobData = req.body;

      let publishedAt = existingJob.published_at;
      let expiresAt = existingJob.expires_at;
      let postingDuration = jobData.postingDuration || 30;

      const newStatus = jobData.status || existingJob.status;

      if (newStatus === 'active'&& existingJob.status !== 'active') {
        publishedAt = jobData.publishedAt ? new Date(jobData.publishedAt) : new Date();
        expiresAt = jobData.expiresAt
          ? new Date(jobData.expiresAt)
          : new Date((publishedAt as Date).getTime() + postingDuration * 24 * 60 * 60 * 1000);
      } else if (jobData.publishedAt) {
        publishedAt = new Date(jobData.publishedAt);
        if (jobData.expiresAt) {
          expiresAt = new Date(jobData.expiresAt);
        }
      } else if (jobData.expiresAt) {
        expiresAt = new Date(jobData.expiresAt);
      }

      const normalizedJobType = this.normalizeJobType(jobData.jobType || existingJob.job_type);
      const normalizedWorkArrangement = this.normalizeWorkArrangement(jobData.workArrangement || existingJob.work_arrangement);
      const normalizedExperienceLevel = this.normalizeExperienceLevel(jobData.experienceLevel || existingJob.experience_level);

      const locations = this.normalizeArrayField(jobData.locations || existingJob.locations);
      const responsibilities = this.normalizeArrayField(jobData.responsibilities || existingJob.responsibilities);
      const requirements = this.normalizeArrayField(jobData.requirements || existingJob.requirements);
      const benefits = this.normalizeArrayField(jobData.benefits || existingJob.benefits);
      const skillsRequired = this.normalizeArrayField(jobData.requiredSkills || existingJob.skills_required);
      const skillsPreferred = this.normalizeArrayField(jobData.preferredSkills || existingJob.skills_preferred);
      const screeningQuestions = this.normalizeArrayField(jobData.screeningQuestions || existingJob.screening_questions);
      const documents = this.normalizeArrayField(jobData.requiredDocuments || existingJob.documents);
      const tags = this.normalizeArrayField(jobData.tags || existingJob.tags);
      const educationRequired = this.normalizeEducationRequirements(jobData.educationLevel || existingJob.education_required);
      const languageRequirements = this.normalizeArrayField(
        jobData.languageRequirements ?? educationRequired.languages ?? existingJob.language_requirements
      );
      const experienceRequirements = this.normalizeArrayField(
        jobData.experienceRequirements ?? educationRequired.experience_requirements ?? existingJob.experience_requirements
      );
      const allSkills = this.normalizeJobSkillEntries(skillsRequired, skillsPreferred);

      // Get AI match score (default to existing or 70)
      const aiMatchRequiredScore = jobData.aiMatchRequiredScore !== undefined
        ? jobData.aiMatchRequiredScore
        : (existingJob.ai_match_required_score ?? 70);

      const updatedJob = await this.withTransaction(async (client) => {
        const jobResult = await client.query(`
        UPDATE jobs SET
          title = $1,
          department = $2,
          job_type = $3,
          work_arrangement = $4,
          locations = $5::jsonb,
          description = $6,
          responsibilities = $7::jsonb,
          requirements = $8::jsonb,
          salary_min = $9,
          salary_max = $10,
          salary_currency = $11,
          salary_period = $12,
          salary_visible = $13,
          benefits = $14::jsonb,
          status = $15,
          visibility = $16,
          published_at = $17,
          expires_at = $18,
          application_limit = $19,
          screening_questions = $20::jsonb,
          application_instructions = $21,
          skills_required = $22::jsonb,
          skills_preferred = $23::jsonb,
          documents = $24::jsonb,
          tags = $25,
          education_required = $26::jsonb,
          language_requirements = $27::jsonb,
          experience_requirements = $28::jsonb,
          experience_level = $29,
          experience_min = $30,
          experience_max = $31,
          ai_match_required_score = $32,
          qualifications = $33,
          updated_at = NOW()
        WHERE id = $34
        RETURNING *
      `, [
          jobData.title || existingJob.title,
          jobData.department ?? existingJob.department,
          normalizedJobType,
          normalizedWorkArrangement,
          JSON.stringify(locations),
          jobData.description || existingJob.description,
          JSON.stringify(responsibilities),
          JSON.stringify(requirements),
          jobData.salaryMin !== undefined ? jobData.salaryMin : existingJob.salary_min,
          jobData.salaryMax !== undefined ? jobData.salaryMax : existingJob.salary_max,
          jobData.salaryCurrency || existingJob.salary_currency || 'Rwf',
          jobData.salaryPeriod || existingJob.salary_period || 'month',
          jobData.salaryVisible !== undefined ? jobData.salaryVisible : existingJob.salary_visible,
          JSON.stringify(benefits),
          newStatus,
          jobData.visibility || existingJob.visibility || 'public',
          publishedAt,
          expiresAt,
          this.normalizeApplicationLimit(jobData.applicationLimit) !== undefined
            ? this.normalizeApplicationLimit(jobData.applicationLimit)
            : existingJob.application_limit,
          JSON.stringify(screeningQuestions),
          JSON.stringify({
            method: jobData.applicationMethod || 'platform',
            instructions: jobData.applicationInstructions || null,
            documents: documents
          }),
          JSON.stringify(skillsRequired),
          JSON.stringify(skillsPreferred),
          JSON.stringify(documents),
          tags,
          JSON.stringify(educationRequired),
          JSON.stringify(languageRequirements),
          JSON.stringify(experienceRequirements),
          normalizedExperienceLevel,
          jobData.experienceMin !== undefined ? jobData.experienceMin : existingJob.experience_min,
          jobData.experienceMax !== undefined ? jobData.experienceMax : existingJob.experience_max,
          aiMatchRequiredScore,
          jobData.qualifications !== undefined ? (jobData.qualifications || null) : existingJob.qualifications,
          id
        ]);

        return jobResult.rows[0];
      });

      // Update skills if needed
      if (jobData.requiredSkills !== undefined || jobData.preferredSkills !== undefined) {
        try {
          await DatabaseService.execute('DELETE FROM job_skills WHERE job_id = $1', [id]);
          if (allSkills.length > 0) {
            await this.insertJobSkills(id, allSkills);
          }
        } catch (skillsError) {
          logger.error('Error updating job skills:', skillsError);
          // Don't fail the whole update - just log the error
        }
      }

      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'jobs',
        operation: 'update',
        entity_id: String(id),
        job_id: String(id),
        payload: {
          status: newStatus,
          title: updatedJob.title,
          company_id: updatedJob.company_id,
        },
        source: 'backend',
      });

      this.sendSuccess(res, updatedJob, 'Job updated successfully');
    } catch (error) {
      logger.error('Error updating job:', error);
      this.sendError(res, 'Failed to update job: '+ (error as Error).message, 500, error as Error);
    }
  }

  async deleteJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to delete this job', 403);
        return;
      }

      // ''FIX: Use 'archived'which is a valid status in CHECK constraint
      await DatabaseService.execute(
        'UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2',
        ['archived', id]
      );

      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'jobs',
        operation: 'delete',
        entity_id: String(id),
        job_id: String(id),
        payload: {
          status: 'archived',
          title: existingJob.title,
          company_id: existingJob.company_id,
        },
        source: 'backend',
      });

      this.sendSuccess(res, null, 'Job deleted successfully');
    } catch (error) {
      logger.error('Error deleting job:', error);
      this.sendError(res, 'Failed to delete job', 500, error as Error);
    }
  }
  async duplicateJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const modifications = req.body || {};

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to duplicate this job', 403);
        return;
      }

      const duplicateTitle = modifications.title || `${existingJob.title} (Copy)`;
      const slug = this.generateSlug(duplicateTitle);
      const existingSlug = await DatabaseService.execute(
        'SELECT id FROM jobs WHERE slug = $1',
        [slug]
      );
      const duplicateSlug = existingSlug.rows.length > 0 ? `${slug}-${Date.now()}` : slug;

      const duplicateResult = await DatabaseService.execute(`
        INSERT INTO jobs (
          company_id, external_id, title, slug, department, team, job_type,
          work_arrangement, locations, description, summary, responsibilities,
          qualifications, preferred_qualifications, requirements, salary_min,
          salary_max, salary_currency, salary_period, salary_visible, benefits,
          skills_required, skills_preferred, experience_min, experience_max,
          experience_level, education_required, screening_questions,
          application_instructions, documents, department_info, tags,
          application_limit, language_requirements, experience_requirements,
          education_requirements, skill_experience_requirements, status,
          visibility, published_at, expires_at, created_by, approved_by,
          approved_at, view_count, application_count, metadata, created_at,
          updated_at
        )
        SELECT
          company_id, external_id, $2, $3, department, team, job_type,
          work_arrangement, locations, description, summary, responsibilities,
          qualifications, preferred_qualifications, requirements, salary_min,
          salary_max, salary_currency, salary_period, salary_visible, benefits,
          skills_required, skills_preferred, experience_min, experience_max,
          experience_level, education_required, screening_questions,
          application_instructions, documents, department_info, tags,
          application_limit, language_requirements, experience_requirements,
          education_requirements, skill_experience_requirements, 'draft',
          visibility, NULL, NULL, $4, approved_by, approved_at, 0, 0,
          metadata, NOW(), NOW()
        FROM jobs
        WHERE id = $1
        RETURNING *
      `, [id, duplicateTitle, duplicateSlug, req.user!.id]);

      const duplicateJob = duplicateResult.rows[0];

      const skills = await DatabaseService.execute(
        'SELECT skill_id, proficiency_level, is_required, importance FROM job_skills WHERE job_id = $1',
        [id]
      );

      if (skills.rows.length > 0) {
        for (const skill of skills.rows) {
          await DatabaseService.execute(
            `INSERT INTO job_skills (job_id, skill_id, proficiency_level, is_required, importance) 
             VALUES ($1, $2, $3, $4, $5)`,
            [duplicateJob.id, skill.skill_id, skill.proficiency_level, skill.is_required, skill.importance]
          );
        }
      }

      this.sendSuccess(res, duplicateJob, 'Job duplicated successfully', 201);
    } catch (error) {
      logger.error('Error duplicating job:', error);
      this.sendError(res, 'Failed to duplicate job', 500, error as Error);
    }
  }

  async getMyJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '20'} = req.query as { page?: string; limit?: string };
      const { page: validPage, limit: validLimit } = PaginationService.validatePaginationParams(page, limit);

      let companyId: string | null = null;

      // protect middleware already resolves this respecting is_default, for
      // users on more than one company's team.
      if (req.user.user_type === 'company_admin'|| req.user.user_type === 'recruiter') {
        companyId = req.user.company_id ? String(req.user.company_id) : null;
      }

      if (!companyId) {
        this.sendSuccess(res, {
          data: [],
          pagination: PaginationService.getPaginationMeta(0, validPage, validLimit)
        });
        return;
      }

      const offset = (validPage - 1) * validLimit;

      // ''FIX: Exclude archived jobs from the list
      const result = await DatabaseService.execute(`
      SELECT *,
        CASE
          WHEN status = 'active'AND published_at IS NOT NULL AND published_at > NOW() THEN 'scheduled'
          WHEN status = 'active'AND (expires_at IS NOT NULL AND expires_at <= NOW())  THEN 'expired'
          ELSE status
        END AS effective_status
      FROM jobs
      WHERE company_id = $1
        AND status != 'archived'
        AND status != 'deleted'
      ORDER BY
        CASE status
          WHEN 'active'THEN 1
          WHEN 'draft'THEN 2
          WHEN 'paused'THEN 3
          WHEN 'closed'THEN 4
          WHEN 'expired'THEN 5
          ELSE 6
        END,
        created_at DESC
      LIMIT $2 OFFSET $3
    `, [companyId, validLimit, offset]);

      // ''FIX: Count only non-archived jobs
      const countResult = await DatabaseService.execute(
        `SELECT COUNT(*) as total 
       FROM jobs 
       WHERE company_id = $1 
         AND status != 'archived'
         AND status != 'deleted'`,
        [companyId]
      );
      const total = parseInt(countResult.rows[0]?.total || '0');

      const paginationMeta = PaginationService.getPaginationMeta(total, validPage, validLimit);

      this.sendSuccess(res, {
        data: result.rows,
        pagination: paginationMeta
      });
    } catch (error) {
      logger.error('Error fetching my jobs:', error);
      this.sendError(res, 'Failed to fetch your jobs', 500, error as Error);
    }
  }

  async saveAsDraft(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      await DatabaseService.execute(
        `UPDATE jobs SET 
         status = 'draft', 
         published_at = NULL, 
         expires_at = NULL, 
         updated_at = NOW() 
         WHERE id = $1`,
        [id]
      );

      this.sendSuccess(res, null, 'Job saved as draft successfully');
    } catch (error) {
      logger.error('Error saving as draft:', error);
      this.sendError(res, 'Failed to save job as draft', 500, error as Error);
    }
  }

  async previewJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const job = await this.findById('jobs', id, {}, `
        j.*,
        c.name as company_name,
        c.logo_url,
        c.website,
        c.description as company_description,
        c.industry,
        c.size as company_size
      `);

      if (!job) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, job)) {
        this.sendError(res, 'Unauthorized to preview this job', 403);
        return;
      }

      const skills = await DatabaseService.execute(`
        SELECT s.id, s.name, s.category, js.proficiency_level, js.is_required, js.importance
        FROM job_skills js
        JOIN skills s ON js.skill_id = s.id
        WHERE js.job_id = $1
        ORDER BY js.is_required DESC, s.name
      `, [id]);

      job.skills = skills.rows;

      this.sendSuccess(res, { ...job, isPreview: true });
    } catch (error) {
      logger.error('Error previewing job:', error);
      this.sendError(res, 'Failed to preview job', 500, error as Error);
    }
  }

  async saveJobDraft(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!ValidationService.canCreateJob(req.user)) {
        this.sendError(res, 'Unauthorized to create jobs', 403);
        return;
      }

      const jobData = req.body;

      if (!jobData.title) {
        this.sendError(res, 'Title is required for draft', 400);
        return;
      }

      let companyId: string | null = null;

      // protect middleware already resolves this respecting is_default, for
      // users on more than one company's team.
      if (req.user.user_type === 'company_admin'|| req.user.user_type === 'recruiter') {
        companyId = req.user.company_id ? String(req.user.company_id) : null;
      }

      if (!companyId) {
        this.sendError(res, 'Company not found for this user', 404);
        return;
      }

      const slug = this.generateSlug(jobData.title);

      const existingJob = await DatabaseService.execute(
        'SELECT id FROM jobs WHERE slug = $1',
        [slug]
      );
      const finalSlug = existingJob.rows.length > 0 ? `${slug}-${Date.now()}` : slug;

      const locations = this.normalizeArrayField(jobData.locations);
      const requirements = this.normalizeArrayField(jobData.requirements);
      const educationRequired = this.normalizeEducationRequirements(jobData.educationLevel);

      const job = await this.withTransaction(async (client) => {
        const jobResult = await client.query(`
          INSERT INTO jobs (
            company_id, created_by, title, slug, department, job_type, work_arrangement,
            locations, description, requirements, salary_min, salary_max, salary_currency,
            salary_visible, status, visibility, application_limit, screening_questions,
            application_instructions, skills_required, documents, tags, education_required,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW())
          RETURNING *
        `, [
          companyId,
          req.user.id,
          jobData.title,
          finalSlug,
          jobData.department || null,
          this.normalizeJobType(jobData.jobType),
          this.normalizeWorkArrangement(jobData.workArrangement),
          JSON.stringify(locations),
          jobData.description || '',
          JSON.stringify(requirements),
          jobData.salaryMin || null,
          jobData.salaryMax || null,
          jobData.salaryCurrency || 'Rwf',
          jobData.salaryVisible !== false,
          'draft',
          jobData.visibility || 'public',
          this.normalizeApplicationLimit(jobData.applicationLimit),
          JSON.stringify(this.normalizeArrayField(jobData.screeningQuestions)),
          JSON.stringify({
            method: jobData.applicationMethod || 'platform',
            documents: this.normalizeArrayField(jobData.requiredDocuments)
          }),
          JSON.stringify(this.normalizeArrayField(jobData.requiredSkills)),
          JSON.stringify(this.normalizeArrayField(jobData.requiredDocuments)),
          this.normalizeArrayField(jobData.tags),
          JSON.stringify(educationRequired)
        ]);

        return jobResult.rows[0];
      });

      this.sendSuccess(res, job, 'Draft saved successfully', 201);
    } catch (error) {
      logger.error('Error saving draft:', error);
      this.sendError(res, 'Failed to save draft', 500, error as Error);
    }
  }

  async publishJobDraft(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        this.sendError(res, 'Draft ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Draft not found', 404);
        return;
      }

      if (existingJob.status !== 'draft') {
        this.sendError(res, 'Job is not a draft', 400);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to publish this draft', 403);
        return;
      }

      const publishedAt = new Date();
      const postingDuration = 30;
      const expiresAt = new Date(publishedAt.getTime() + postingDuration * 24 * 60 * 60 * 1000);

      await DatabaseService.execute(`
        UPDATE jobs SET
          status = 'active',
          published_at = $1,
          expires_at = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [publishedAt, expiresAt, id]);

      this.sendSuccess(res, null, 'Draft published successfully');
    } catch (error) {
      logger.error('Error publishing draft:', error);
      this.sendError(res, 'Failed to publish draft', 500, error as Error);
    }
  }

  // =====================================================
  // EDUCATION REQUIREMENTS METHODS (SPECIFIC)
  // =====================================================

  async setEducationRequirements(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { educationLevel } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      const educationRequired = this.normalizeEducationRequirements(educationLevel);

      await DatabaseService.execute(`
        UPDATE jobs SET
          education_required = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(educationRequired), id]);

      this.sendSuccess(res, {
        education_required: educationRequired
      }, 'Education requirements updated successfully');
    } catch (error) {
      logger.error('Error updating education requirements:', error);
      this.sendError(res, 'Failed to update education requirements', 500, error as Error);
    }
  }

  async getEducationRequirements(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id || !ValidationService.isValidUUID(id)) {
        this.sendError(res, 'Invalid job ID format', 400);
        return;
      }

      const result = await DatabaseService.execute(
        'SELECT education_required FROM jobs WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      let educationRequired = result.rows[0].education_required;
      if (educationRequired && typeof educationRequired === 'string') {
        educationRequired = JSON.parse(educationRequired);
      }

      this.sendSuccess(res, { education_required: educationRequired || {} });
    } catch (error) {
      logger.error('Error fetching education requirements:', error);
      this.sendError(res, 'Failed to fetch education requirements', 500, error as Error);
    }
  }

  // =====================================================
  // JOB MANAGEMENT METHODS
  // =====================================================

  async setJobExpiration(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { expiresAt, postingDuration } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      let expirationDate = expiresAt ? new Date(expiresAt) : null;
      if (postingDuration && !expirationDate) {
        const startDate = existingJob.published_at || new Date();
        expirationDate = new Date(new Date(startDate).getTime() + postingDuration * 24 * 60 * 60 * 1000);
      }

      await DatabaseService.execute(`
        UPDATE jobs SET
          expires_at = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [expirationDate, id]);

      this.sendSuccess(res, null, 'Job expiration updated successfully');
    } catch (error) {
      logger.error('Error updating job expiration:', error);
      this.sendError(res, 'Failed to update job expiration', 500, error as Error);
    }
  }

  async extendJobDeadline(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { extensionDays } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to extend this job', 403);
        return;
      }

      const currentExpiresAt = existingJob.expires_at ? new Date(existingJob.expires_at) : new Date();
      const newExpiresAt = new Date(currentExpiresAt.getTime() + extensionDays * 24 * 60 * 60 * 1000);

      await DatabaseService.execute(`
        UPDATE jobs SET
          expires_at = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [newExpiresAt, id]);

      this.sendSuccess(res, null, `Job deadline extended by ${extensionDays} days`);
    } catch (error) {
      logger.error('Error extending job deadline:', error);
      this.sendError(res, 'Failed to extend job deadline', 500, error as Error);
    }
  }

  async pauseJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { paused } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      const status = paused ? 'paused': 'active';
      const pausedAt = paused ? new Date() : null;

      await DatabaseService.execute(
        'UPDATE jobs SET status = $1, paused_at = $2, updated_at = NOW() WHERE id = $3',
        [status, pausedAt, id]
      );

      this.sendSuccess(res, null, `Job ${paused ? 'paused': 'resumed'} successfully`);
    } catch (error) {
      logger.error('Error pausing/resuming job:', error);
      this.sendError(res, 'Failed to pause/resume job', 500, error as Error);
    }
  }

  async resumeJobPosting(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (existingJob.status !== 'paused') {
        this.sendError(res, 'Job is not paused', 400);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to resume this job', 403);
        return;
      }

      await DatabaseService.execute(`
        UPDATE jobs SET
          status = 'active',
          paused_at = NULL,
          updated_at = NOW()
        WHERE id = $1
      `, [id]);

      this.sendSuccess(res, null, 'Job resumed successfully');
    } catch (error) {
      logger.error('Error resuming job:', error);
      this.sendError(res, 'Failed to resume job', 500, error as Error);
    }
  }

  async archiveJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to archive this job', 403);
        return;
      }

      // ''FIX: Use 'status'column
      await DatabaseService.execute(
        'UPDATE jobs SET status = $1, closed_at = NOW(), updated_at = NOW() WHERE id = $2',
        ['archived', id]
      );

      this.sendSuccess(res, null, 'Job archived successfully');
    } catch (error) {
      logger.error('Error archiving job:', error);
      this.sendError(res, 'Failed to archive job', 500, error as Error);
    }
  }

  /**
   * Change a job's status to any supported value and record the change in
   * job_status_history (previous status, new status, who, when, optional reason).
   * Only Active/Open jobs are visible to candidates   the public listing already
   * filters on status, so moving a job out of Active/Open hides it.
   */
  async updateJobStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status, reason } = req.body as { status?: string; reason?: string };

      const ALLOWED = [
        'draft', 'pending', 'active', 'open', 'inactive',
        'paused', 'closed', 'filled', 'archived', 'expired',
      ];

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }
      if (!status || !ALLOWED.includes(status)) {
        this.sendError(res, `Invalid status. Allowed: ${ALLOWED.join(', ')}`, 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }
      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, "Unauthorized to change this job's status", 403);
        return;
      }

      const previousStatus = existingJob.status;
      if (previousStatus === status) {
        this.sendError(res, `Job is already '${status}'`, 400);
        return;
      }

      // Keep the relevant lifecycle timestamps in sync with the new status.
      let tsSet = '';
      if (status === 'active'|| status === 'open') {
        tsSet = ', published_at = COALESCE(published_at, NOW())';
      } else if (status === 'paused') {
        tsSet = ', paused_at = NOW()';
      } else if (['closed', 'filled', 'archived', 'expired'].includes(status)) {
        tsSet = ', closed_at = NOW()';
      }

      await DatabaseService.execute(
        `UPDATE jobs SET status = $1, updated_at = NOW()${tsSet} WHERE id = $2`,
        [status, id]
      );

      // Record the change. Best-effort: if the history table isn't present yet
      // (migration not run), the status change still succeeds.
      try {
        await DatabaseService.execute(
          `INSERT INTO job_status_history (job_id, previous_status, new_status, changed_by, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, previousStatus, status, req.user.id, reason || null]
        );
      } catch (histErr) {
        logger.warn(`job_status_history insert failed (run 2026_job_status_history.sql?): ${(histErr as Error).message}`);
      }

      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'jobs',
        operation: 'update',
        entity_id: String(id),
        job_id: String(id),
        payload: {
          previous_status: previousStatus,
          status,
          reason: reason || null,
        },
        source: 'backend',
      });

      this.sendSuccess(res, { id, previous_status: previousStatus, status }, 'Job status updated successfully');
    } catch (error) {
      logger.error('Error updating job status:', error);
      this.sendError(res, 'Failed to update job status', 500, error as Error);
    }
  }

  /** Return the status-change audit trail for a job (most recent first). */
  async getJobStatusHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }
      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to view this job', 403);
        return;
      }

      let rows: any[] = [];
      try {
        const result = await DatabaseService.execute(
          `SELECT h.id, h.previous_status, h.new_status, h.reason, h.created_at,
                  h.changed_by, u.email AS changed_by_email
             FROM job_status_history h
             LEFT JOIN users u ON u.id = h.changed_by
            WHERE h.job_id = $1
            ORDER BY h.created_at DESC`,
          [id]
        );
        rows = result.rows;
      } catch (histErr) {
        logger.warn(`job_status_history read failed (run 2026_job_status_history.sql?): ${(histErr as Error).message}`);
      }

      this.sendSuccess(res, rows, 'Job status history retrieved');
    } catch (error) {
      logger.error('Error fetching job status history:', error);
      this.sendError(res, 'Failed to fetch job status history', 500, error as Error);
    }
  }

  async setJobAccessLevel(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { visibility } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      const validVisibilities = ['public', 'internal', 'confidential', 'unlisted'];
      const finalVisibility = validVisibilities.includes(visibility) ? visibility : 'public';

      await DatabaseService.execute(`
        UPDATE jobs SET
          visibility = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [finalVisibility, id]);

      this.sendSuccess(res, null, 'Job access level updated successfully');
    } catch (error) {
      logger.error('Error updating access level:', error);
      this.sendError(res, 'Failed to update access level', 500, error as Error);
    }
  }

  // =====================================================
  // FILTER METHODS
  // =====================================================

  async filterByLocation(req: Request, res: Response): Promise<void> {
    try {
      const { location, radius = 50, page = '1', limit = '20'} = req.query as any;
      const { page: validPage, limit: validLimit } = PaginationService.validatePaginationParams(page, limit);

      const offset = (validPage - 1) * validLimit;

      const query = `
        SELECT j.*, c.name as company_name, c.logo_url
        FROM jobs j
        LEFT JOIN companies c ON j.company_id = c.id
        WHERE j.status = 'active'
        AND (j.published_at IS NULL OR j.published_at <= NOW())
        AND (j.expires_at IS NULL OR j.expires_at > NOW())
        AND j.locations::text ILIKE $1
        ORDER BY j.created_at DESC, j.id
        LIMIT $2 OFFSET $3
      `;

      const result = await DatabaseService.execute(query, [`%${location}%`, validLimit, offset]);

      const countResult = await DatabaseService.execute(
        `SELECT COUNT(*) as total FROM jobs j
         WHERE j.status = 'active'
         AND (j.published_at IS NULL OR j.published_at <= NOW())
         AND (j.expires_at IS NULL OR j.expires_at > NOW())
         AND j.locations::text ILIKE $1`,
        [`%${location}%`]
      );

      const total = parseInt(countResult.rows[0]?.total || '0');
      const paginationMeta = PaginationService.getPaginationMeta(total, validPage, validLimit);

      this.sendSuccess(res, { data: result.rows, pagination: paginationMeta });
    } catch (error) {
      logger.error('Error filtering by location:', error);
      this.sendError(res, 'Failed to filter jobs by location', 500, error as Error);
    }
  }

  async filterBySalary(req: Request, res: Response): Promise<void> {
    try {
      const { min, max, currency, page = '1', limit = '20'} = req.query as any;
      const { page: validPage, limit: validLimit } = PaginationService.validatePaginationParams(page, limit);

      let query = `
        SELECT j.*, c.name as company_name, c.logo_url
        FROM jobs j
        LEFT JOIN companies c ON j.company_id = c.id
        WHERE j.status = 'active'
        AND (j.published_at IS NULL OR j.published_at <= NOW())
        AND (j.expires_at IS NULL OR j.expires_at > NOW())
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (min) {
        query += ` AND j.salary_max >= $${paramIndex}`;
        params.push(parseInt(min));
        paramIndex++;
      }
      if (max) {
        query += ` AND j.salary_min <= $${paramIndex}`;
        params.push(parseInt(max));
        paramIndex++;
      }
      if (currency) {
        query += ` AND j.salary_currency = $${paramIndex}`;
        params.push(currency);
        paramIndex++;
      }

      query += ` ORDER BY (j.salary_min + j.salary_max)/2 DESC, j.id LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(validLimit, (validPage - 1) * validLimit);

      const result = await DatabaseService.execute(query, params);

      this.sendSuccess(res, { data: result.rows, pagination: { page: validPage, limit: validLimit, total: result.rows.length } });
    } catch (error) {
      logger.error('Error filtering by salary:', error);
      this.sendError(res, 'Failed to filter jobs by salary', 500, error as Error);
    }
  }

  async filterByExperience(req: Request, res: Response): Promise<void> {
    try {
      const { level, page = '1', limit = '20'} = req.query as any;
      const { page: validPage, limit: validLimit } = PaginationService.validatePaginationParams(page, limit);

      const offset = (validPage - 1) * validLimit;

      const result = await DatabaseService.execute(`
        SELECT j.*, c.name as company_name, c.logo_url
        FROM jobs j
        LEFT JOIN companies c ON j.company_id = c.id
        WHERE j.status = 'active'
        AND (j.published_at IS NULL OR j.published_at <= NOW())
        AND (j.expires_at IS NULL OR j.expires_at > NOW())
        AND j.experience_level = $1
        ORDER BY j.created_at DESC, j.id
        LIMIT $2 OFFSET $3
      `, [this.normalizeExperienceLevel(level), validLimit, offset]);

      const countResult = await DatabaseService.execute(`
        SELECT COUNT(*) as total FROM jobs
        WHERE status = 'active'
        AND (published_at IS NULL OR published_at <= NOW())
        AND (expires_at IS NULL OR expires_at > NOW())
        AND experience_level = $1
      `, [this.normalizeExperienceLevel(level)]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const paginationMeta = PaginationService.getPaginationMeta(total, validPage, validLimit);

      this.sendSuccess(res, { data: result.rows, pagination: paginationMeta });
    } catch (error) {
      logger.error('Error filtering by experience:', error);
      this.sendError(res, 'Failed to filter jobs by experience', 500, error as Error);
    }
  }

  // =====================================================
  // SCREENING QUESTIONS & SKILLS METHODS
  // =====================================================

  async addScreeningQuestions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { questions } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      await DatabaseService.execute(`
        UPDATE jobs SET
          screening_questions = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(questions), id]);

      this.sendSuccess(res, null, 'Screening questions updated successfully');
    } catch (error) {
      logger.error('Error updating screening questions:', error);
      this.sendError(res, 'Failed to update screening questions', 500, error as Error);
    }
  }

  async setRequiredSkills(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { skills } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      await this.withTransaction(async (client) => {
        await client.query('DELETE FROM job_skills WHERE job_id = $1', [id]);
        if (skills && skills.length > 0) {
          await this.insertJobSkills(id, skills);
        }
      });

      this.sendSuccess(res, null, 'Required skills updated successfully');
    } catch (error) {
      logger.error('Error updating required skills:', error);
      this.sendError(res, 'Failed to update required skills', 500, error as Error);
    }
  }

  async setExperienceRequirements(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { minYears, maxYears, level } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      await DatabaseService.execute(`
        UPDATE jobs SET
          experience_min = $1,
          experience_max = $2,
          experience_level = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [minYears, maxYears, this.normalizeExperienceLevel(level), id]);

      this.sendSuccess(res, null, 'Experience requirements updated successfully');
    } catch (error) {
      logger.error('Error updating experience requirements:', error);
      this.sendError(res, 'Failed to update experience requirements', 500, error as Error);
    }
  }

  async setWorkArrangement(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { type, location } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      const normalizedType = this.normalizeWorkArrangement(type);
      const locations = location ? this.normalizeArrayField([location]) : existingJob.locations;

      await DatabaseService.execute(`
        UPDATE jobs SET
          work_arrangement = $1,
          locations = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [normalizedType, JSON.stringify(locations), id]);

      this.sendSuccess(res, null, 'Work arrangement updated successfully');
    } catch (error) {
      logger.error('Error updating work arrangement:', error);
      this.sendError(res, 'Failed to update work arrangement', 500, error as Error);
    }
  }

  async setSalaryAndBenefits(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { salaryMin, salaryMax, salaryCurrency, benefits } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      const normalizedBenefits = this.normalizeArrayField(benefits);

      await DatabaseService.execute(`
        UPDATE jobs SET
          salary_min = $1,
          salary_max = $2,
          salary_currency = $3,
          benefits = $4,
          updated_at = NOW()
        WHERE id = $5
      `, [salaryMin, salaryMax, salaryCurrency || 'Rwf', JSON.stringify(normalizedBenefits), id]);

      this.sendSuccess(res, null, 'Compensation updated successfully');
    } catch (error) {
      logger.error('Error updating compensation:', error);
      this.sendError(res, 'Failed to update compensation', 500, error as Error);
    }
  }

  async addApplicationInstructions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { instructions, documents } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      const normalizedDocuments = this.normalizeArrayField(documents);

      await DatabaseService.execute(`
        UPDATE jobs SET
          application_instructions = $1,
          documents = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [
        JSON.stringify({ instructions, documents: normalizedDocuments }),
        JSON.stringify(normalizedDocuments),
        id
      ]);

      this.sendSuccess(res, null, 'Application instructions updated successfully');
    } catch (error) {
      logger.error('Error updating application instructions:', error);
      this.sendError(res, 'Failed to update application instructions', 500, error as Error);
    }
  }

  async attachJobDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const files = req.files as any[];

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to attach documents to this job', 403);
        return;
      }

      const documents = files.map(file => ({
        name: file.originalname,
        url: `/uploads/jobs/${id}/${file.filename}`,
        type: file.mimetype,
        size: file.size
      }));

      const existingDocs = existingJob.documents || [];
      const allDocs = [...existingDocs, ...documents];

      await DatabaseService.execute(`
        UPDATE jobs SET
          documents = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(allDocs), id]);

      this.sendSuccess(res, documents, 'Documents attached successfully');
    } catch (error) {
      logger.error('Error attaching documents:', error);
      this.sendError(res, 'Failed to attach documents', 500, error as Error);
    }
  }

  async categorizeJobByDepartment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { department, subDepartment } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      await DatabaseService.execute(`
        UPDATE jobs SET
          department = $1,
          department_info = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [department, subDepartment, id]);

      this.sendSuccess(res, null, 'Job categorized successfully');
    } catch (error) {
      logger.error('Error categorizing job:', error);
      this.sendError(res, 'Failed to categorize job', 500, error as Error);
    }
  }

  async tagJobWithSkills(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { tags } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      const normalizedTags = this.normalizeArrayField(tags);

      await DatabaseService.execute(`
        UPDATE jobs SET
          tags = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [normalizedTags, id]);

      this.sendSuccess(res, null, 'Job tags updated successfully');
    } catch (error) {
      logger.error('Error updating job tags:', error);
      this.sendError(res, 'Failed to update job tags', 500, error as Error);
    }
  }

  async setApplicationLimits(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { applicationLimit, limitType } = req.body;

      if (!id) {
        this.sendError(res, 'Job ID is required', 400);
        return;
      }

      const existingJob = await this.findById('jobs', id);
      if (!existingJob) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      if (!this.canEditJob(req.user, existingJob)) {
        this.sendError(res, 'Unauthorized to edit this job', 403);
        return;
      }

      await DatabaseService.execute(`
        UPDATE jobs SET
          application_limit = $1,
          metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{limit_type}', $2::jsonb),
          updated_at = NOW()
        WHERE id = $3
      `, [this.normalizeApplicationLimit(applicationLimit), JSON.stringify(limitType), id]);

      this.sendSuccess(res, null, 'Application limits updated successfully');
    } catch (error) {
      logger.error('Error updating application limits:', error);
      this.sendError(res, 'Failed to update application limits', 500, error as Error);
    }
  }

  // =====================================================
  // TEMPLATE & DEBUG METHODS
  // =====================================================

  async getJobTemplates(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const templates = [
        {
          id: '1',
          title: 'Software Engineer',
          department: 'Engineering',
          team: 'Development',
          job_type: 'full-time',
          work_arrangement: 'hybrid',
          locations: [
            { city: 'San Francisco', country: 'USA', is_remote: false },
            { city: 'Remote', country: 'Remote', is_remote: true }
          ],
          description: 'We are looking for a skilled software engineer to join our team. You will be responsible for designing, developing, and maintaining high-quality software solutions.',
          summary: 'Join our engineering team to build scalable web applications.',
          responsibilities: [
            'Design and develop software applications',
            'Collaborate with cross-functional teams',
            'Write clean, maintainable code',
            'Participate in code reviews',
            'Troubleshoot and debug applications',
            'Mentor junior developers'
          ],
          qualifications: 'Bachelor\'s degree in Computer Science or related field',
          preferred_qualifications: 'Master\'s degree preferred',
          requirements: [
            '3+ years of software development experience',
            'Proficiency in JavaScript/TypeScript',
            'Experience with React and Node.js',
            'Strong problem-solving skills',
            'Experience with Git and version control'
          ],
          salary_min: 80000,
          salary_max: 120000,
          salary_currency: 'USD',
          salary_period: 'year',
          salary_visible: true,
          benefits: [
            'Health Insurance',
            '401k Matching',
            'Flexible Hours',
            'Remote Work Options',
            'Paid Time Off',
            'Professional Development Budget'
          ],
          skills_required: [
            { name: 'JavaScript', proficiency_level: 4, is_required: true, importance: 'required'},
            { name: 'React', proficiency_level: 4, is_required: true, importance: 'required'},
            { name: 'Node.js', proficiency_level: 3, is_required: true, importance: 'required'},
            { name: 'TypeScript', proficiency_level: 3, is_required: true, importance: 'required'}
          ],
          skills_preferred: [
            { name: 'Python', proficiency_level: 3, is_required: false, importance: 'preferred'},
            { name: 'AWS', proficiency_level: 2, is_required: false, importance: 'preferred'},
            { name: 'Docker', proficiency_level: 2, is_required: false, importance: 'preferred'}
          ],
          experience_min: 3,
          experience_max: 7,
          experience_level: 'senior',
          education_required: {
            minimum_degree: "Bachelor's Degree",
            fields_of_study: ["Computer Science", "Software Engineering", "Information Technology"],
            is_degree_required: true,
            certifications: ["AWS Certified Developer", "Microsoft Certified"],
            additional_requirements: ["Strong portfolio of projects"]
          },
          screening_questions: [
            { question: "Why are you interested in this position?", type: "text", required: true },
            { question: "How many years of React experience do you have?", type: "number", required: true },
            { question: "Are you legally authorized to work in this country?", type: "yes_no", required: true },
            { question: "What is your expected salary range?", type: "text", required: false }
          ],
          application_instructions: "Please submit your resume and a cover letter explaining your experience. Include links to your GitHub profile and portfolio if available.",
          documents: ["Resume", "Cover Letter", "Portfolio Links"],
          application_limit: 200,
          department_info: "Engineering Department - Frontend Team",
          tags: ["React", "JavaScript", "Frontend", "Web Development", "Full Stack"],
          visibility: 'public',
          status: 'active',
          published_at: null,
          expires_at: null,
          metadata: {
            priority: "high",
            remote_level: "hybrid",
            team_size: 10,
            reporting_to: "Engineering Manager",
            hiring_urgency: "medium"
          }
        },
        {
          id: '2',
          title: 'Product Manager',
          department: 'Product',
          team: 'Product Management',
          job_type: 'full-time',
          work_arrangement: 'remote',
          locations: [
            { city: 'Remote', country: 'Worldwide', is_remote: true }
          ],
          description: 'Join our product team to drive product strategy and execution. You will be responsible for defining product roadmap, gathering requirements, and working with engineering teams.',
          summary: 'Lead product development from ideation to launch.',
          responsibilities: [
            'Define product roadmap and strategy',
            'Work closely with engineering and design teams',
            'Conduct market research and competitive analysis',
            'Manage product launches and go-to-market strategies',
            'Gather and prioritize product requirements',
            'Analyze product metrics and user feedback'
          ],
          qualifications: 'Bachelor\'s degree in Business, Marketing, or related field',
          preferred_qualifications: 'MBA or Product Management certification',
          requirements: [
            '5+ years of product management experience',
            'Experience with agile development methodologies',
            'Strong analytical and communication skills',
            'Technical background preferred',
            'Experience with product analytics tools'
          ],
          salary_min: 100000,
          salary_max: 150000,
          salary_currency: 'USD',
          salary_period: 'year',
          salary_visible: true,
          benefits: [
            'Health Insurance',
            'Stock Options',
            'Unlimited PTO',
            'Remote Work Stipend',
            'Wellness Budget',
            'Learning & Development Allowance'
          ],
          skills_required: [
            { name: 'Product Strategy', proficiency_level: 4, is_required: true, importance: 'required'},
            { name: 'Agile Methodologies', proficiency_level: 4, is_required: true, importance: 'required'},
            { name: 'Market Research', proficiency_level: 3, is_required: true, importance: 'required'}
          ],
          skills_preferred: [
            { name: 'Data Analysis', proficiency_level: 3, is_required: false, importance: 'preferred'},
            { name: 'SQL', proficiency_level: 2, is_required: false, importance: 'preferred'},
            { name: 'UI/UX Design', proficiency_level: 2, is_required: false, importance: 'preferred'}
          ],
          experience_min: 5,
          experience_max: 10,
          experience_level: 'senior',
          education_required: {
            minimum_degree: "Bachelor's Degree",
            fields_of_study: ["Business", "Marketing", "Computer Science", "Product Management"],
            is_degree_required: true,
            certifications: ["Certified Scrum Product Owner (CSPO)", "Product Management Certification"],
            additional_requirements: ["Experience with B2B SaaS products"]
          },
          screening_questions: [
            { question: "What product are you most proud of launching?", type: "text", required: true },
            { question: "How do you prioritize features?", type: "text", required: true },
            { question: "How many years of product management experience do you have?", type: "number", required: true }
          ],
          application_instructions: "Please submit your resume and a brief description of a successful product you've launched.",
          documents: ["Resume", "Product Portfolio", "Case Study"],
          application_limit: 150,
          department_info: "Product Management Department",
          tags: ["Product", "Management", "Agile", "Strategy", "Roadmap"],
          visibility: 'public',
          status: 'active',
          published_at: null,
          expires_at: null,
          metadata: {
            priority: "high",
            remote_level: "fully_remote",
            team_size: 5,
            reporting_to: "Director of Product",
            hiring_urgency: "high"
          }
        },
        {
          id: '3',
          title: 'DevOps Engineer',
          department: 'Engineering',
          team: 'Infrastructure',
          job_type: 'full-time',
          work_arrangement: 'remote',
          locations: [
            { city: 'Remote', country: 'USA', is_remote: true }
          ],
          description: 'Join our infrastructure team to build and maintain cloud infrastructure, CI/CD pipelines, and deployment systems.',
          summary: 'Automate and optimize our cloud infrastructure.',
          responsibilities: [
            'Design and maintain CI/CD pipelines',
            'Manage cloud infrastructure (AWS/Azure/GCP)',
            'Implement monitoring and alerting systems',
            'Ensure security best practices',
            'Automate deployment processes',
            'Troubleshoot infrastructure issues'
          ],
          qualifications: 'Bachelor\'s degree in Computer Science or related field',
          preferred_qualifications: 'Cloud certifications (AWS, Azure, GCP)',
          requirements: [
            '3+ years of DevOps or SRE experience',
            'Experience with Docker and Kubernetes',
            'Proficiency with AWS or Azure',
            'Experience with CI/CD tools (Jenkins, GitLab CI, GitHub Actions)',
            'Knowledge of infrastructure as code (Terraform, CloudFormation)'
          ],
          salary_min: 90000,
          salary_max: 140000,
          salary_currency: 'USD',
          salary_period: 'year',
          salary_visible: true,
          benefits: [
            'Health Insurance',
            '401k Matching',
            'Flexible Hours',
            'Home Office Setup',
            'Cloud Certification Reimbursement',
            'On-call Bonus'
          ],
          skills_required: [
            { name: 'AWS', proficiency_level: 4, is_required: true, importance: 'required'},
            { name: 'Docker', proficiency_level: 4, is_required: true, importance: 'required'},
            { name: 'Kubernetes', proficiency_level: 3, is_required: true, importance: 'required'},
            { name: 'Terraform', proficiency_level: 3, is_required: true, importance: 'required'}
          ],
          skills_preferred: [
            { name: 'Python', proficiency_level: 3, is_required: false, importance: 'preferred'},
            { name: 'GitHub Actions', proficiency_level: 3, is_required: false, importance: 'preferred'},
            { name: 'Prometheus', proficiency_level: 2, is_required: false, importance: 'preferred'}
          ],
          experience_min: 3,
          experience_max: 8,
          experience_level: 'senior',
          education_required: {
            minimum_degree: "Bachelor's Degree",
            fields_of_study: ["Computer Science", "Information Technology", "Systems Engineering"],
            is_degree_required: true,
            certifications: ["AWS Solutions Architect", "CKA (Certified Kubernetes Administrator)"],
            additional_requirements: ["Experience with high-traffic systems"]
          },
          screening_questions: [
            { question: "What cloud platforms have you worked with?", type: "text", required: true },
            { question: "Describe your experience with CI/CD pipelines.", type: "text", required: true },
            { question: "Are you comfortable with on-call rotations?", type: "yes_no", required: true }
          ],
          application_instructions: "Please submit your resume and links to any open-source contributions or GitHub repositories.",
          documents: ["Resume", "GitHub Profile", "Certifications"],
          application_limit: 100,
          department_info: "Infrastructure Engineering Department",
          tags: ["DevOps", "Cloud", "Kubernetes", "AWS", "CI/CD"],
          visibility: 'public',
          status: 'active',
          published_at: null,
          expires_at: null,
          metadata: {
            priority: "medium",
            remote_level: "fully_remote",
            team_size: 8,
            reporting_to: "Infrastructure Manager",
            hiring_urgency: "medium",
            on_call_required: true
          }
        }
      ];

      this.sendSuccess(res, templates);
    } catch (error) {
      logger.error('Error getting job templates:', error);
      this.sendError(res, 'Failed to get job templates', 500, error as Error);
    }
  }

  async debugUserCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      const userResult = await DatabaseService.execute(
        'SELECT id, email, user_type FROM users WHERE id = $1',
        [userId]
      );

      const teamResult = await DatabaseService.execute(
        'SELECT * FROM company_team WHERE user_id = $1',
        [userId]
      );

      let companyResult = null;
      if (userResult.rows[0]?.user_type === 'company_admin') {
        companyResult = await DatabaseService.execute(
          'SELECT id, name, created_by FROM companies WHERE created_by = $1',
          [userId]
        );
      } else if (teamResult.rows[0]?.company_id) {
        companyResult = await DatabaseService.execute(
          'SELECT id, name FROM companies WHERE id = $1',
          [teamResult.rows[0].company_id]
        );
      }

      let jobsResult = null;
      if (companyResult?.rows[0]?.id) {
        jobsResult = await DatabaseService.execute(
          'SELECT id, title, company_id, status, created_at, education_required FROM jobs WHERE company_id = $1 ORDER BY created_at DESC LIMIT 10',
          [companyResult.rows[0].id]
        );
      }

      this.sendSuccess(res, {
        user: userResult.rows[0],
        team: teamResult.rows,
        company: companyResult?.rows[0] || null,
        jobs: jobsResult?.rows || []
      });
    } catch (error) {
      logger.error('Debug error:', error);
      this.sendError(res, 'Debug failed', 500, error as Error);
    }
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 100);
  }

  private sanitizeJobData(data: JobData): JobData {
    return data as JobData;
  }

  private validateJobData(data: JobData, isCreate: boolean = true): { isValid: boolean; error?: string } {
    if (isCreate && !data.title) {
      return { isValid: false, error: 'Title is required'};
    }
    if (isCreate && !data.description) {
      return { isValid: false, error: 'Description is required'};
    }
    return { isValid: true };
  }

  private async canEditJob(user: AuthUser, job: any): Promise<boolean> {
    if (!user) return false;

    // System admin can edit any job
    if (user.user_type === 'system_admin') return true;

    // User who created the job can edit it
    if (user.id === job.created_by) return true;

    // Company admin or recruiter can edit jobs for their company
    if (user.user_type === 'company_admin'|| user.user_type === 'recruiter') {
      // ''FIX: Use 'company_id'instead of 'companyId'
      if (job.company_id && user.company_id === job.company_id) {
        return true;
      }

      // Additional check: verify team membership and permissions
      try {
        const teamResult = await DatabaseService.execute(
          `SELECT id, role, permissions 
         FROM company_team 
         WHERE user_id = $1 AND company_id = $2`,
          [user.id, job.company_id]
        );

        if (teamResult.rows.length > 0) {
          const teamMember = teamResult.rows[0];

          // Admin role has full access
          if (teamMember.role === 'admin') return true;

          // Recruiter role can edit jobs
          if (teamMember.role === 'recruiter') return true;

          // Check permissions JSONB for can_post_jobs
          if (teamMember.permissions && teamMember.permissions.can_post_jobs === true) {
            return true;
          }
        }
      } catch (error) {
        logger.error('Error checking team permissions:', error);
      }
    }

    return false;
  }

  private async insertJobSkills(jobId: string, skills: any[]): Promise<void> {
    for (const skill of skills) {
      let skillId = skill.skill_id || skill.id;

      if (!skillId && skill.name) {
        const skillResult = await DatabaseService.execute(
          `INSERT INTO skills (name, category, skill_type) 
           VALUES ($1, $2, $3) 
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name 
           RETURNING id`,
          [skill.name, skill.category || 'General', skill.skill_type || 'technical']
        );
        skillId = skillResult.rows[0].id;
      }

      if (skillId) {
        await DatabaseService.execute(
          `INSERT INTO job_skills (job_id, skill_id, proficiency_level, is_required, importance) 
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (job_id, skill_id) DO NOTHING`,
          [jobId, skillId, skill.proficiency_level || 3, skill.is_required !== false, skill.importance || 'required']
        );
      }
    }
  }

  private async getJobsBySkills(skillNames: string[]): Promise<string[]> {
    const result = await DatabaseService.execute(`
      SELECT DISTINCT js.job_id
      FROM job_skills js
      JOIN skills s ON js.skill_id = s.id
      WHERE s.name = ANY($1)
    `, [skillNames]);

    return result.rows.map((row: any) => row.job_id);
  }

  // =====================================================
  // CANDIDATE JOB BROWSING METHODS
  // =====================================================

  async getJobsForCandidates(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const validPage = Math.max(1, page);
      const validLimit = Math.min(100, Math.max(1, limit));
      const validOffset = (validPage - 1) * validLimit;

      const {
        search,
        location,
        jobType,
        workArrangement,
        experienceLevel,
        salaryMin,
        salaryMax,
        industry,
        skills,
        sortBy = 'recent'
      } = req.query;

      // ============================================
      // COMPLETE JOB FIELDS FROM SCHEMA
      // ============================================
      let sql = `
      SELECT 
        -- Job basic info
        j.id,
        j.external_id,
        j.title,
        j.slug,
        j.department,
        j.team,
        j.job_type,
        j.work_arrangement,
        j.locations,
        j.description,
        j.summary,
        j.responsibilities,
        j.qualifications,
        j.preferred_qualifications,
        j.requirements,
        
        -- Salary info
        j.salary_min,
        j.salary_max,
        j.salary_currency,
        j.salary_period,
        j.salary_visible,
        j.education_required,
        
        -- Benefits & Skills
        j.benefits,
        j.skills_required,
        j.skills_preferred,
        
        -- Experience & Education
        j.experience_min,
        j.experience_max,
        j.experience_level,
        j.education_required,
        
        -- Application settings
        j.screening_questions,
        j.application_instructions,
        j.documents,
        j.department_info,
        j.tags,
        j.application_limit,
        j.language_requirements,
        j.experience_requirements,
        j.education_requirements,
        j.skill_experience_requirements,
        
        -- Status & Dates
        j.status,
        j.visibility,
        j.published_at,
        j.expires_at,
        j.paused_at,
        j.closed_at,
        j.created_at,
        j.updated_at,
        j.created_by,
        j.approved_by,
        j.approved_at,
        
        -- Counts & Metadata
        j.view_count,
        j.application_count,
        j.metadata,
        j.deleted_at,
        
        -- Company info
        c.id as company_id,
        c.name as company_name,
        c.legal_name as company_legal_name,
        c.slug as company_slug,
        c.industry as company_industry,
        c.industries as company_industries,
        c.size as company_size,
        c.founded_year as company_founded_year,
        c.headquarters_location as company_headquarters_location,
        c.website as company_website,
        c.description as company_description,
        c.short_description as company_short_description,
        c.mission as company_mission,
        c.vision as company_vision,
        c.values as company_values,
        c.culture as company_culture,
        c.logo_url as company_logo_url,
        c.logo_key as company_logo_key,
        c.banner_url as company_banner_url,
        c.banner_key as company_banner_key,
        c.social_links as company_social_links,
        c.verification_status as company_verification_status,
        c.verification_badge as company_verified,
        c.verification_level as company_verification_level,
        c.verified_at as company_verified_at,
        c.domain as company_domain,
        c.tax_id as company_tax_id,
        c.registration_number as company_registration_number
        
      FROM jobs j
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE j.status = 'active'
        AND j.deleted_at IS NULL
        AND (j.published_at IS NULL OR j.published_at <= NOW())
        AND (j.expires_at IS NULL OR j.expires_at > NOW())
        AND j.visibility IN ('public', 'unlisted')
    `;

      const params: any[] = [];
      let paramIndex = 1;

      // ============================================
      // FILTERS - MATCHING YOUR SCHEMA
      // ============================================

      // Search filter (title, description, company name)
      if (search) {
        sql += ` AND (j.title ILIKE $${paramIndex} 
                 OR j.description ILIKE $${paramIndex} 
                 OR COALESCE(c.name, '') ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Location filter (using locations JSONB)
      if (location) {
        sql += ` AND (j.locations::text ILIKE $${paramIndex} 
                 OR EXISTS (SELECT 1 FROM jsonb_array_elements(j.locations) AS loc 
                           WHERE loc->>'city'ILIKE $${paramIndex}
                           OR loc->>'country'ILIKE $${paramIndex}))`;
        params.push(`%${location}%`);
        paramIndex++;
      }

      // Job type filter (full-time, part-time, contract, etc.)
      if (jobType) {
        const jobTypes = (jobType as string).split(',');
        sql += ` AND j.job_type = ANY($${paramIndex})`;
        params.push(jobTypes);
        paramIndex++;
      }

      // Work arrangement filter (remote, hybrid, onsite, flexible)
      if (workArrangement) {
        const arrangements = (workArrangement as string).split(',');
        sql += ` AND j.work_arrangement = ANY($${paramIndex})`;
        params.push(arrangements);
        paramIndex++;
      }

      // Experience level filter (entry, mid, senior, lead, executive)
      if (experienceLevel) {
        const levels = (experienceLevel as string).split(',');
        sql += ` AND j.experience_level = ANY($${paramIndex})`;
        params.push(levels);
        paramIndex++;
      }

      // Salary range filters
      if (salaryMin) {
        sql += ` AND j.salary_max >= $${paramIndex}`;
        params.push(parseFloat(salaryMin as string));
        paramIndex++;
      }

      if (salaryMax) {
        sql += ` AND j.salary_min <= $${paramIndex}`;
        params.push(parseFloat(salaryMax as string));
        paramIndex++;
      }

      // Industry filter
      if (industry) {
        const industries = (industry as string).split(',');
        sql += ` AND (c.industry = ANY($${paramIndex}) 
                 OR c.industries && $${paramIndex})`;
        params.push(industries);
        paramIndex++;
      }

      // Skills filter using job_skills table
      if (skills) {
        const skillArray = (skills as string).split(',').map(s => s.trim().toLowerCase());
        sql += ` AND EXISTS (
        SELECT 1 FROM job_skills js 
        JOIN skills s ON js.skill_id = s.id 
        WHERE js.job_id = j.id 
          AND LOWER(s.name) = ANY($${paramIndex})
      )`;
        params.push(skillArray);
        paramIndex++;
      }

      // ============================================
      // SORTING OPTIONS
      // ============================================
      // j.id as the final tiebreaker on every branch- published_at/created_at
      // are frequently tied (bulk-generated data, many jobs sharing the same
      // day-granularity timestamp: some pairs have 14+ rows), and a non-unique
      // ORDER BY makes OFFSET pagination non-deterministic across separate
      // queries- a tied row can land on neither page (or both) depending on
      // how Postgres breaks the tie that particular execution. This is how a
      // real, active, visible job silently never appeared in the Matcher's
      // paginated backend.get_jobs() fetch while the Hybrid engine (a single
      // unpaginated query) still saw it- "matcher_breakdown": null for a job
      // the candidate should have gotten a real 4-factor score for.
      if (sortBy === 'salary_high') {
        sql += ` ORDER BY j.salary_max DESC NULLS LAST, j.id`;
      } else if (sortBy === 'salary_low') {
        sql += ` ORDER BY j.salary_min ASC NULLS LAST, j.id`;
      } else if (sortBy === 'recent') {
        sql += ` ORDER BY j.published_at DESC NULLS LAST, j.created_at DESC, j.id`;
      } else if (sortBy === 'applications') {
        sql += ` ORDER BY j.application_count DESC NULLS LAST, j.id`;
      } else if (sortBy === 'expiring_soon') {
        sql += ` ORDER BY j.expires_at ASC NULLS LAST, j.id`;
      } else {
        sql += ` ORDER BY j.published_at DESC NULLS LAST, j.created_at DESC, j.id`;
      }

      // ============================================
      // PAGINATION
      // ============================================
      sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(validLimit, validOffset);

      const result = await DatabaseService.execute(sql, params);

      // ============================================
      // PARSE JSON FIELDS - MATCHING SCHEMA
      // ============================================
      const jobsWithParsedFields = result.rows.map((job: any) => {
        // Parse job JSON fields
        if (job.locations && typeof job.locations === 'string') {
          try { job.locations = JSON.parse(job.locations); } catch { job.locations = []; }
        }
        if (job.responsibilities && typeof job.responsibilities === 'string') {
          try { job.responsibilities = JSON.parse(job.responsibilities); } catch { job.responsibilities = []; }
        }
        if (job.requirements && typeof job.requirements === 'string') {
          try { job.requirements = JSON.parse(job.requirements); } catch { job.requirements = []; }
        }
        if (job.benefits && typeof job.benefits === 'string') {
          try { job.benefits = JSON.parse(job.benefits); } catch { job.benefits = []; }
        }
        if (job.skills_required && typeof job.skills_required === 'string') {
          try { job.skills_required = JSON.parse(job.skills_required); } catch { job.skills_required = []; }
        }
        if (job.skills_preferred && typeof job.skills_preferred === 'string') {
          try { job.skills_preferred = JSON.parse(job.skills_preferred); } catch { job.skills_preferred = []; }
        }
        if (job.education_required && typeof job.education_required === 'string') {
          try { job.education_required = JSON.parse(job.education_required); } catch { job.education_required = {}; }
        }
        if (job.screening_questions && typeof job.screening_questions === 'string') {
          try { job.screening_questions = JSON.parse(job.screening_questions); } catch { job.screening_questions = []; }
        }
        if (job.documents && typeof job.documents === 'string') {
          try { job.documents = JSON.parse(job.documents); } catch { job.documents = []; }
        }
        if (job.tags && typeof job.tags === 'string') {
          try { job.tags = JSON.parse(job.tags); } catch { job.tags = []; }
        }
        if (job.metadata && typeof job.metadata === 'string') {
          try { job.metadata = JSON.parse(job.metadata); } catch { job.metadata = {}; }
        }
        if (job.language_requirements && typeof job.language_requirements === 'string') {
          try { job.language_requirements = JSON.parse(job.language_requirements); } catch { job.language_requirements = []; }
        }
        if (job.experience_requirements && typeof job.experience_requirements === 'string') {
          try { job.experience_requirements = JSON.parse(job.experience_requirements); } catch { job.experience_requirements = {}; }
        }
        if (job.education_requirements && typeof job.education_requirements === 'string') {
          try { job.education_requirements = JSON.parse(job.education_requirements); } catch { job.education_requirements = {}; }
        }
        if (job.skill_experience_requirements && typeof job.skill_experience_requirements === 'string') {
          try { job.skill_experience_requirements = JSON.parse(job.skill_experience_requirements); } catch { job.skill_experience_requirements = {}; }
        }

        // Parse company JSON fields
        if (job.company_headquarters_location && typeof job.company_headquarters_location === 'string') {
          try { job.company_headquarters_location = JSON.parse(job.company_headquarters_location); } catch { job.company_headquarters_location = {}; }
        }
        if (job.company_culture && typeof job.company_culture === 'string') {
          try { job.company_culture = JSON.parse(job.company_culture); } catch { job.company_culture = {}; }
        }
        if (job.company_social_links && typeof job.company_social_links === 'string') {
          try { job.company_social_links = JSON.parse(job.company_social_links); } catch { job.company_social_links = {}; }
        }
        if (job.company_values && typeof job.company_values === 'string') {
          try { job.company_values = JSON.parse(job.company_values); } catch { job.company_values = []; }
        }
        if (job.company_industries && typeof job.company_industries === 'string') {
          try { job.company_industries = JSON.parse(job.company_industries); } catch { job.company_industries = []; }
        }

        return job;
      });

      // ============================================
      // COUNT QUERY FOR PAGINATION
      // ============================================
      let countSql = `
      SELECT COUNT(*) as total
      FROM jobs j
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE j.status = 'active'
        AND j.deleted_at IS NULL
        AND (j.published_at IS NULL OR j.published_at <= NOW())
        AND (j.expires_at IS NULL OR j.expires_at > NOW())
        AND j.visibility IN ('public', 'unlisted')
    `;

      const countParams: any[] = [];
      let countIndex = 1;

      if (search) {
        countSql += ` AND (j.title ILIKE $${countIndex} OR j.description ILIKE $${countIndex} OR COALESCE(c.name, '') ILIKE $${countIndex})`;
        countParams.push(`%${search}%`);
        countIndex++;
      }
      if (location) {
        countSql += ` AND j.locations::text ILIKE $${countIndex}`;
        countParams.push(`%${location}%`);
        countIndex++;
      }
      if (jobType) {
        const jobTypes = (jobType as string).split(',');
        countSql += ` AND j.job_type = ANY($${countIndex})`;
        countParams.push(jobTypes);
        countIndex++;
      }
      if (workArrangement) {
        const arrangements = (workArrangement as string).split(',');
        countSql += ` AND j.work_arrangement = ANY($${countIndex})`;
        countParams.push(arrangements);
        countIndex++;
      }
      if (experienceLevel) {
        const levels = (experienceLevel as string).split(',');
        countSql += ` AND j.experience_level = ANY($${countIndex})`;
        countParams.push(levels);
        countIndex++;
      }
      if (skills) {
        const skillArray = (skills as string).split(',').map(s => s.trim().toLowerCase());
        countSql += ` AND EXISTS (
        SELECT 1 FROM job_skills js 
        JOIN skills s ON js.skill_id = s.id 
        WHERE js.job_id = j.id AND LOWER(s.name) = ANY($${countIndex})
      )`;
        countParams.push(skillArray);
        countIndex++;
      }

      const countResult = await DatabaseService.execute(countSql, countParams);
      const total = parseInt(countResult.rows[0]?.total || '0');

      const totalPages = Math.ceil(total / validLimit);
      const hasNextPage = validPage < totalPages;
      const hasPrevPage = validPage > 1;

      // ============================================
      // RESPONSE WITH ALL FIELDS
      // ============================================
      this.sendSuccess(res, {
        data: jobsWithParsedFields,
        pagination: {
          current_page: validPage,
          per_page: validLimit,
          total_items: total,
          total_pages: totalPages,
          has_next_page: hasNextPage,
          has_prev_page: hasPrevPage,
          next_page: hasNextPage ? validPage + 1 : null,
          prev_page: hasPrevPage ? validPage - 1 : null,
          from: validOffset + 1,
          to: Math.min(validOffset + validLimit, total)
        },
        filters: {
          search: search || null,
          location: location || null,
          job_type: jobType || null,
          work_arrangement: workArrangement || null,
          experience_level: experienceLevel || null,
          salary_min: salaryMin || null,
          salary_max: salaryMax || null,
          industry: industry || null,
          skills: skills || null,
          sort_by: sortBy
        }
      });
    } catch (error) {
      logger.error('Error fetching jobs for candidates:', error);
      this.sendError(res, 'Failed to fetch jobs', 500, error as Error);
    }
  }

  async getJobForCandidate(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id || !ValidationService.isValidUUID(id)) {
        this.sendError(res, 'Invalid job ID format', 400);
        return;
      }

      // Increment view count
      await DatabaseService.execute(
        'UPDATE jobs SET view_count = view_count + 1 WHERE id = $1',
        [id]
      );

      // ''COMPLETE SELECT WITH ALL 70+ JOB FIELDS FROM YOUR SCHEMA
      const jobResult = await DatabaseService.execute(`
      SELECT 
        -- Job basic info (13 fields)
        j.id,
        j.external_id,
        j.title,
        j.slug,
        j.department,
        j.team,
        j.job_type,
        j.work_arrangement,
        j.locations,
        j.description,
        j.summary,
        
        -- Requirements & Responsibilities (5 fields)
        j.responsibilities,
        j.qualifications,
        j.preferred_qualifications,
        j.requirements,
        
        -- Salary info (7 fields)
        j.salary_min,
        j.salary_max,
        j.salary_currency,
        j.salary_period,
        j.salary_visible,
        j.benefits,
        j.skills_required,
        j.skills_preferred,
        
        -- Experience & Education (8 fields)
        j.experience_min,
        j.experience_max,
        j.experience_level,
        j.education_required,
        j.language_requirements,
        j.experience_requirements,
        j.education_requirements,
        j.skill_experience_requirements,
        
        -- Application settings (6 fields)
        j.screening_questions,
        j.application_instructions,
        j.documents,
        j.department_info,
        j.tags,
        j.application_limit,
        
        -- AI & Matching (2 fields)
        j.ai_match_required_score,
        
        -- Status & Dates (12 fields)
        j.status,
        j.visibility,
        j.published_at,
        j.expires_at,
        j.paused_at,
        j.closed_at,
        j.created_at,
        j.updated_at,
        j.created_by,
        j.approved_by,
        j.approved_at,
        
        -- Counts & Metadata (4 fields)
        j.view_count,
        j.application_count,
        j.metadata,
        j.deleted_at,
        
        -- Company info (22 fields)
        c.id as company_id,
        c.name as company_name,
        c.legal_name as company_legal_name,
        c.slug as company_slug,
        c.industry as company_industry,
        c.industries as company_industries,
        c.size as company_size,
        c.founded_year as company_founded_year,
        c.headquarters_location as company_headquarters_location,
        c.website as company_website,
        c.description as company_description,
        c.short_description as company_short_description,
        c.mission as company_mission,
        c.vision as company_vision,
        c.values as company_values,
        c.culture as company_culture,
        c.logo_url as company_logo_url,
        c.logo_key as company_logo_key,
        c.banner_url as company_banner_url,
        c.banner_key as company_banner_key,
        c.social_links as company_social_links,
        c.verification_badge as company_verified,
        c.verification_status as company_verification_status,
        c.verification_level as company_verification_level,
        c.verified_at as company_verified_at,
        c.domain as company_domain
        
      FROM jobs j
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE j.id = $1 
        AND j.status = 'active'
        AND j.deleted_at IS NULL
        AND j.visibility IN ('public', 'unlisted')
    `, [id]);

      if (jobResult.rows.length === 0) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      const job = jobResult.rows[0];
      const now = new Date();

      // ''CHECK IF JOB IS AVAILABLE FOR APPLICATION
      const publishedAt = job.published_at ? new Date(job.published_at) : null;
      const expiresAt = job.expires_at ? new Date(job.expires_at) : null;

      // Application availability flags
      const isPublished = publishedAt !== null && publishedAt <= now;
      const isNotPublishedYet = publishedAt !== null && publishedAt > now;
      const isExpired = expiresAt !== null && expiresAt < now;
      const isNotExpiredYet = expiresAt === null || expiresAt > now;
      const isActive = job.status === 'active';
      const isPaused = job.status === 'paused';
      const isClosed = job.status === 'closed';
      const isArchived = job.status === 'archived';

      // ''MAIN FLAG: Can user apply?
      const canApply = isActive && isPublished && !isExpired && !isPaused && !isClosed && !isArchived;

      // ''Detailed status messages
      let applicationStatus: 'available'| 'not_published'| 'expired'| 'paused'| 'closed'| 'archived'| 'unavailable'= 'available';
      let applicationStatusMessage: string = 'You can apply for this position';

      if (!isActive) {
        applicationStatus = 'unavailable';
        applicationStatusMessage = 'This position is currently unavailable';
      } else if (isNotPublishedYet) {
        applicationStatus = 'not_published';
        const publishDate = publishedAt?.toLocaleDateString();
        applicationStatusMessage = `Applications open on ${publishDate}`;
      } else if (isExpired) {
        applicationStatus = 'expired';
        applicationStatusMessage = 'Application deadline has passed';
      } else if (isPaused) {
        applicationStatus = 'paused';
        applicationStatusMessage = 'This job posting is temporarily paused';
      } else if (isClosed) {
        applicationStatus = 'closed';
        applicationStatusMessage = 'This position has been closed';
      } else if (isArchived) {
        applicationStatus = 'archived';
        applicationStatusMessage = 'This job has been archived';
      }

      // ''Calculate days until publish (if not published yet)
      let daysUntilPublish: number | null = null;
      if (isNotPublishedYet && publishedAt) {
        daysUntilPublish = Math.ceil((publishedAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }

      // ''Calculate days remaining (if not expired)
      let daysRemaining: number | null = null;
      if (!isExpired && expiresAt) {
        daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }

      // ''Check application limit
      const applicationLimit = job.application_limit;
      let hasReachedApplicationLimit = false;
      if (applicationLimit && applicationLimit > 0) {
        const currentApplicationCount = job.application_count || 0;
        hasReachedApplicationLimit = currentApplicationCount >= applicationLimit;
      }

      // ''PARSE ALL JOB JSONB FIELDS
      const jobJsonFields = [
        'locations', 'responsibilities', 'qualifications', 'preferred_qualifications',
        'requirements', 'benefits', 'skills_required', 'skills_preferred',
        'education_required', 'screening_questions', 'documents', 'tags',
        'metadata', 'language_requirements', 'experience_requirements',
        'education_requirements', 'skill_experience_requirements'
      ];

      for (const field of jobJsonFields) {
        if (job[field]) {
          if (typeof job[field] === 'string') {
            try {
              job[field] = JSON.parse(job[field]);
            } catch {
              job[field] = field === 'tags'|| field === 'locations'? [] : {};
            }
          }
        } else {
          if (field === 'tags'|| field === 'locations'|| field === 'responsibilities'||
            field === 'requirements'|| field === 'benefits'|| field === 'screening_questions'||
            field === 'documents'|| field === 'skills_required'|| field === 'skills_preferred'||
            field === 'language_requirements'|| field === 'experience_requirements') {
            job[field] = [];
          } else {
            job[field] = {};
          }
        }
      }

      // ''PARSE COMPANY JSON FIELDS
      const companyJsonFields = [
        'company_headquarters_location', 'company_culture', 'company_values',
        'company_industries', 'company_social_links'
      ];

      for (const field of companyJsonFields) {
        if (job[field] && typeof job[field] === 'string') {
          try {
            job[field] = JSON.parse(job[field]);
          } catch {
            job[field] = {};
          }
        } else if (!job[field]) {
          job[field] = {};
        }
      }

      // ''MAP TO FRONTEND-FRIENDLY FIELD NAMES
      job.jobType = job.job_type;
      job.workArrangement = job.work_arrangement;
      job.experienceLevel = job.experience_level;
      job.salaryCurrency = job.salary_currency;
      job.salaryPeriod = job.salary_period;
      job.salaryVisible = job.salary_visible;
      job.publishedAt = job.published_at;
      job.expiresAt = job.expires_at;
      job.pausedAt = job.paused_at;
      job.closedAt = job.closed_at;
      job.createdAt = job.created_at;
      job.updatedAt = job.updated_at;
      job.deletedAt = job.deleted_at;
      job.applicationLimit = job.application_limit;
      job.screeningQuestions = job.screening_questions;
      job.applicationInstructions = job.application_instructions;
      job.requiredDocuments = job.documents;
      job.aiMatchRequiredScore = job.ai_match_required_score;

      // ''MAP EDUCATION REQUIREMENTS
      if (job.education_required && Object.keys(job.education_required).length > 0) {
        job.educationLevel = {
          minimum_degree: job.education_required.minimum_degree || null,
          fields_of_study: job.education_required.fields_of_study || [],
          certifications: job.education_required.certifications || [],
          languages: job.education_required.languages || [],
          experience_requirements: job.education_required.experience_requirements || [],
          age_requirement: job.education_required.age_requirement || '',
          is_degree_required: job.education_required.is_degree_required !== false,
          no_experience_needed: job.education_required.no_experience_needed || false,
          no_languages_needed: job.education_required.no_languages_needed || false,
          no_certifications_needed: job.education_required.no_certifications_needed || false,
          no_documents_needed: job.education_required.no_documents_needed || false
        };
      } else {
        job.educationLevel = {
          minimum_degree: null,
          fields_of_study: [],
          certifications: [],
          languages: [],
          experience_requirements: [],
          age_requirement: '',
          is_degree_required: false,
          no_experience_needed: false,
          no_languages_needed: false,
          no_certifications_needed: false,
          no_documents_needed: false
        };
      }

      // ''MAP SKILLS FIELDS
      job.requiredSkills = Array.isArray(job.skills_required) ? job.skills_required : [];
      job.preferredSkills = Array.isArray(job.skills_preferred) ? job.skills_preferred : [];

      // ''GET SKILLS FROM JOB_SKILLS TABLE
      const skills = await DatabaseService.execute(`
      SELECT 
        s.id as skill_id,
        s.name as skill_name,
        s.category,
        s.skill_type,
        s.is_verified as skill_verified,
        js.proficiency_level,
        js.is_required,
        js.importance,
        js.created_at as skill_added_at
      FROM job_skills js
      JOIN skills s ON js.skill_id = s.id
      WHERE js.job_id = $1
      ORDER BY js.is_required DESC, js.importance DESC, s.name
    `, [id]);

      if (skills.rows.length > 0) {
        job.skills = skills.rows;
        job.skills_required = skills.rows.filter((s: any) => s.is_required === true);
        job.skills_preferred = skills.rows.filter((s: any) => s.is_required === false);
        job.requiredSkills = job.skills_required;
        job.preferredSkills = job.skills_preferred;
      } else {
        job.skills = [...(job.requiredSkills || []), ...(job.preferredSkills || [])];
      }

      // ''ENSURE ALL ARRAY FIELDS ARE PROPERLY INITIALIZED
      if (!job.locations) job.locations = [];
      if (!job.responsibilities) job.responsibilities = [];
      if (!job.requirements) job.requirements = [];
      if (!job.benefits) job.benefits = [];
      if (!job.tags) job.tags = [];
      if (!job.screening_questions) job.screening_questions = [];
      if (!job.documents) job.documents = [];
      if (!job.language_requirements) job.language_requirements = [];
      if (!job.experience_requirements) job.experience_requirements = [];

      // ''ENSURE ALL OBJECT FIELDS ARE PROPERLY INITIALIZED
      if (!job.metadata) job.metadata = {};
      if (!job.education_required) job.education_required = {};
      if (!job.education_requirements) job.education_requirements = {};
      if (!job.skill_experience_requirements) job.skill_experience_requirements = {};

      // ''ADD COMPANY VERIFICATION STATUS FLAGS
      job.companyIsVerified = job.company_verification_status === 'verified'|| job.company_verified === true;
      job.companyVerificationLevel = job.company_verification_level || 'basic';

      // ''ADD JOB STATUS FLAGS FOR FRONTEND
      job.isActive = isActive;
      job.isPublished = isPublished;
      job.isNotPublishedYet = isNotPublishedYet;
      job.isExpired = isExpired;
      job.isPaused = isPaused;
      job.isClosed = isClosed;
      job.isArchived = isArchived;
      job.isRemote = job.work_arrangement === 'remote';
      job.isHybrid = job.work_arrangement === 'hybrid';
      job.isOnsite = job.work_arrangement === 'onsite';

      // ''ADD APPLICATION AVAILABILITY FLAGS
      job.canApply = canApply;
      job.applicationStatus = applicationStatus;
      job.applicationStatusMessage = applicationStatusMessage;
      job.daysUntilPublish = daysUntilPublish;
      job.daysRemaining = daysRemaining;
      job.hasReachedApplicationLimit = hasReachedApplicationLimit;
      job.currentApplicationCount = job.application_count || 0;

      // ''ADD PUBLISH DATE DISPLAY
      if (isNotPublishedYet && publishedAt) {
        job.publishDateDisplay = `Opens on ${publishedAt.toLocaleDateString()}`;
      } else if (isPublished) {
        job.publishDateDisplay = `Posted on ${publishedAt?.toLocaleDateString() || 'Recently'}`;
      } else {
        job.publishDateDisplay = 'Not yet published';
      }

      // ''ADD EXPIRY DATE DISPLAY
      if (isExpired) {
        job.expiryDateDisplay = `Closed on ${expiresAt?.toLocaleDateString()}`;
      } else if (expiresAt) {
        job.expiryDateDisplay = `Closes in ${daysRemaining} day${daysRemaining !== 1 ? 's': ''} (${expiresAt.toLocaleDateString()})`;
      } else {
        job.expiryDateDisplay = 'No deadline';
      }

      // ''ADD SALARY DISPLAY FIELD
      if (job.salary_min && job.salary_max) {
        job.salaryDisplay = `${job.salary_currency || 'Rwf'} ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()} ${job.salary_period === 'year'? '/year': job.salary_period === 'month'? '/month': ''}`;
      } else if (job.salary_min) {
        job.salaryDisplay = `${job.salary_currency || 'Rwf'} ${job.salary_min.toLocaleString()}+ ${job.salary_period === 'year'? '/year': job.salary_period === 'month'? '/month': ''}`;
      } else {
        job.salaryDisplay = 'Salary not specified';
      }

      // ''ADD EXPERIENCE DISPLAY FIELD
      if (job.experience_min && job.experience_max) {
        job.experienceDisplay = `${job.experience_min}-${job.experience_max} years`;
      } else if (job.experience_min) {
        job.experienceDisplay = `${job.experience_min}+ years`;
      } else if (job.experience_max) {
        job.experienceDisplay = `Up to ${job.experience_max} years`;
      } else {
        job.experienceDisplay = 'Experience not specified';
      }

      // ''ADD LOCATION DISPLAY FIELD
      if (job.locations && job.locations.length > 0) {
        const locationNames = job.locations.map((loc: any) => {
          if (typeof loc === 'string') return loc;
          if (loc.city && loc.country) return `${loc.city}, ${loc.country}`;
          if (loc.city) return loc.city;
          if (loc.country) return loc.country;
          return null;
        }).filter(Boolean);
        job.locationDisplay = locationNames.join(', ');
      } else {
        job.locationDisplay = 'Location not specified';
      }

      // ''ADD APPLICATION BUTTON LABEL AND STYLES
      if (!canApply) {
        if (isNotPublishedYet) {
          job.applyButtonLabel = `Opens in ${daysUntilPublish} day${daysUntilPublish !== 1 ? 's': ''}`;
          job.applyButtonDisabled = true;
          job.applyButtonVariant = 'gray';
        } else if (isExpired) {
          job.applyButtonLabel = 'Expired';
          job.applyButtonDisabled = true;
          job.applyButtonVariant = 'gray';
        } else if (isPaused) {
          job.applyButtonLabel = 'Temporarily Paused';
          job.applyButtonDisabled = true;
          job.applyButtonVariant = 'gray';
        } else if (isClosed || isArchived) {
          job.applyButtonLabel = 'Closed';
          job.applyButtonDisabled = true;
          job.applyButtonVariant = 'gray';
        } else if (hasReachedApplicationLimit) {
          job.applyButtonLabel = 'Application Limit Reached';
          job.applyButtonDisabled = true;
          job.applyButtonVariant = 'gray';
        } else {
          job.applyButtonLabel = 'Apply Now';
          job.applyButtonDisabled = true;
          job.applyButtonVariant = 'gray';
        }
      } else {
        job.applyButtonLabel = 'Apply Now';
        job.applyButtonDisabled = false;
        job.applyButtonVariant = 'green';
      }

      // ''ADD COUNTS
      job.responsibilitiesCount = job.responsibilities?.length || 0;
      job.benefitsCount = job.benefits?.length || 0;
      job.screeningQuestionsCount = job.screening_questions?.length || 0;
      job.requiredSkillsCount = job.requiredSkills?.length || 0;
      job.preferredSkillsCount = job.preferredSkills?.length || 0;

      this.sendSuccess(res, job);
    } catch (error) {
      logger.error('Error fetching job for candidate:', error);
      this.sendError(res, 'Failed to fetch job details', 500, error as Error);
    }
  }

  // =====================================================
  // GET JOB CANDIDATES WITH AI MATCH SCORES
  // =====================================================

  async getJobCandidatesWithMatches(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const { page = '1', limit = '20', sortBy = 'match_score', sortOrder = 'DESC'} = req.query;

      if (!jobId || !ValidationService.isValidUUID(jobId)) {
        this.sendError(res, 'Invalid job ID format', 400);
        return;
      }

      // Check if job exists and get job details
      const jobCheck = await DatabaseService.execute(`
      SELECT 
        j.id, j.company_id, j.title, j.created_by, j.description,
        j.department, j.job_type, j.work_arrangement, j.locations,
        j.salary_min, j.salary_max, j.salary_currency, j.benefits,
        j.experience_min, j.experience_max, j.experience_level,
        j.skills_required, j.skills_preferred, j.education_required,
        j.status, j.visibility, j.published_at, j.expires_at,
        j.ai_match_required_score,
        c.name as company_name, c.logo_url, c.industry
      FROM jobs j
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE j.id = $1
    `, [jobId]);

      if (jobCheck.rows.length === 0) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      const job = jobCheck.rows[0];

      const parseJson = (field: any, fallback: any = null) => {
        if (field === null || field === undefined) return fallback;
        if (typeof field === 'string') {
          try { return JSON.parse(field); } catch { return fallback; }
        }
        return field;
      };

      job.locations = parseJson(job.locations, []);
      job.benefits = parseJson(job.benefits, []);
      job.skills_required = parseJson(job.skills_required, []);
      job.skills_preferred = parseJson(job.skills_preferred, []);
      job.education_required = parseJson(job.education_required, {});

      // Check permissions
      const userCompanyId = await this.getUserCompanyId(req.user.id, req.user.user_type);
      const isOwner = job.created_by === req.user.id;
      const isCompanyUser = job.company_id === userCompanyId;
      const isAdmin = req.user.user_type === 'system_admin';

      if (!isOwner && !isCompanyUser && !isAdmin) {
        this.sendError(res, 'Access denied', 403);
        return;
      }

      const validPage = Math.max(1, parseInt(page as string));
      const validLimit = Math.min(100, parseInt(limit as string));
      const offset = (validPage - 1) * validLimit;
      const order = (sortOrder as string).toUpperCase() === 'ASC'? 'ASC': 'DESC';

      // Validate sort column
      let orderByClause = '';
      if (sortBy === 'match_score') {
        orderByClause = `ORDER BY a.match_score ${order} NULLS LAST`;
      } else if (sortBy === 'applied_at') {
        orderByClause = `ORDER BY a.applied_at ${order} NULLS LAST`;
      } else if (sortBy === 'status') {
        orderByClause = `ORDER BY a.status ${order} NULLS LAST`;
      } else {
        orderByClause = `ORDER BY a.match_score DESC NULLS LAST`;
      }

      // ============================================
      // STEP 1: Get basic application + candidate data
      // ============================================
      const result = await DatabaseService.execute(`
      SELECT
        a.id as application_id,
        a.application_number,
        a.status as application_status,
        a.current_stage,
        a.applied_at,
        a.updated_at as application_updated_at,
        a.match_score as ai_match_score,
        a.match_details,
        a.rating as recruiter_rating,
        a.ai_score,
        a.screening_answers,
        a.notes,
        a.internal_notes,
        a.tags as application_tags,
        a.interview_date,
        a.feedback,
        a.withdrawn_at,
        a.withdrawn_reason,
        a.rejection_reason,
        a.source,
        u.id as candidate_id,
        u.email as candidate_email,
        u.user_type,
        u.status as user_status,
        u.created_at as user_created_at,
        u.last_login_at,
        cp.first_name,
        cp.last_name,
        CONCAT(cp.first_name, '', cp.last_name) as full_name,
        cp.phone,
        cp.country,
        cp.city,
        cp.timezone,
        cp.profile_photo_url,
        cp.headline,
        cp.summary,
        cp.linkedin_url,
        cp.github_url,
        cp.portfolio_url,
        cp.website_url,
        cp.profile_completion,
        cp.willing_to_relocate,
        cp.willing_to_travel,
        cp.notice_period_days,
        cp.current_salary,
        cp.expected_salary,
        cp.languages,
        cp.availability,
        cp.job_preferences,
        cp.privacy_settings
      FROM applications a
      INNER JOIN users u ON a.user_id = u.id
      LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
      WHERE a.job_id = $1
        AND a.deleted_at IS NULL
      ${orderByClause}
      LIMIT $2 OFFSET $3
    `, [jobId, validLimit, offset]);

      const countResult = await DatabaseService.execute(`
      SELECT COUNT(*) as total
      FROM applications a
      WHERE a.job_id = $1 AND a.deleted_at IS NULL
    `, [jobId]);

      const total = parseInt(countResult.rows[0]?.total || '0');

      const statsResult = await DatabaseService.execute(`
      SELECT 
        COUNT(*) as total_applications,
        COALESCE(ROUND(AVG(a.match_score)), 0) as avg_match_score,
        COALESCE(MAX(a.match_score), 0) as max_match_score,
        COALESCE(MIN(a.match_score), 0) as min_match_score,
        COUNT(CASE WHEN a.match_score >= 80 THEN 1 END) as high_match_count,
        COUNT(CASE WHEN a.match_score >= 60 AND a.match_score < 80 THEN 1 END) as medium_match_count,
        COUNT(CASE WHEN a.match_score < 60 THEN 1 END) as low_match_count,
        COUNT(CASE WHEN a.status = 'submitted'THEN 1 END) as submitted_count,
        COUNT(CASE WHEN a.status = 'under_review'THEN 1 END) as under_review_count,
        COUNT(CASE WHEN a.status = 'shortlisted'THEN 1 END) as shortlisted_count,
        COUNT(CASE WHEN a.status = 'interview'THEN 1 END) as interview_count,
        COUNT(CASE WHEN a.status = 'assessment'THEN 1 END) as assessment_count,
        COUNT(CASE WHEN a.status = 'offer'THEN 1 END) as offer_count,
        COUNT(CASE WHEN a.status = 'hired'THEN 1 END) as hired_count,
        COUNT(CASE WHEN a.status = 'rejected'THEN 1 END) as rejected_count
      FROM applications a
      WHERE a.job_id = $1 AND a.deleted_at IS NULL
    `, [jobId]);

      // ============================================
      // STEP 2: Enrich each candidate with ALL data
      // ============================================
      const candidates = await Promise.all(result.rows.map(async (row: any) => {
        const candidateId = row.candidate_id;
        const applicationId = row.application_id;

        // Parse flat JSON fields
        row.match_details = parseJson(row.match_details, {});
        row.ai_score = parseJson(row.ai_score, {});
        row.screening_answers = parseJson(row.screening_answers, []);
        row.notes = parseJson(row.notes, []);
        row.internal_notes = parseJson(row.internal_notes, []);
        row.application_tags = parseJson(row.application_tags, []);
        row.current_salary = parseJson(row.current_salary, null);
        row.expected_salary = parseJson(row.expected_salary, null);
        row.languages = parseJson(row.languages, []);
        row.availability = parseJson(row.availability, {});
        row.job_preferences = parseJson(row.job_preferences, {});
        row.privacy_settings = parseJson(row.privacy_settings, {});

        // Work experience
        try {
          const weResult = await DatabaseService.execute(`
          SELECT id, company, title, employment_type, location, location_type,
            to_char(start_date, 'YYYY-MM-DD') as start_date,
            to_char(end_date, 'YYYY-MM-DD') as end_date,
            is_current, description, achievements, skills, industry, team_size,
            reason_for_leaving, verified
          FROM work_experience
          WHERE user_id = $1
          ORDER BY start_date DESC
        `, [candidateId]);
          row.work_experience = weResult.rows;
          row.current_experience = weResult.rows.filter((e: any) => e.is_current === true);
        } catch (e) {
          logger.error('work_experience query failed:', e);
          row.work_experience = [];
          row.current_experience = [];
        }

        // Education
        try {
          const eduResult = await DatabaseService.execute(`
          SELECT id, institution, degree, field_of_study,
            to_char(start_date, 'YYYY-MM-DD') as start_date,
            to_char(end_date, 'YYYY-MM-DD') as end_date,
            is_current, grade, grade_scale, description, activities, skills, verified
          FROM education
          WHERE user_id = $1
          ORDER BY end_date DESC NULLS LAST
        `, [candidateId]);
          row.education = eduResult.rows;
        } catch (e) {
          logger.error('education query failed:', e);
          row.education = [];
        }

        // Skills
        try {
          const skillsResult = await DatabaseService.execute(`
          SELECT s.id as skill_id, s.name as skill_name, s.category, s.skill_type,
            us.proficiency_level, us.proficiency_label, us.years_experience,
            us.is_primary, us.endorsement_count, us.verified
          FROM user_skills us
          JOIN skills s ON us.skill_id = s.id
          WHERE us.user_id = $1
          ORDER BY us.proficiency_level DESC, us.years_experience DESC NULLS LAST
        `, [candidateId]);
          row.candidate_skills = skillsResult.rows;
        } catch (e) {
          logger.error('user_skills query failed:', e);
          row.candidate_skills = [];
        }

        // Certifications
        try {
          const certResult = await DatabaseService.execute(`
          SELECT id, name, issuer, credential_id, credential_url,
            to_char(issue_date, 'YYYY-MM-DD') as issue_date,
            to_char(expiry_date, 'YYYY-MM-DD') as expiry_date,
            description, skills, verified
          FROM certifications
          WHERE user_id = $1 AND verified = true
          ORDER BY issue_date DESC NULLS LAST
        `, [candidateId]);
          row.certifications = certResult.rows;
        } catch (e) {
          logger.error('certifications query failed:', e);
          row.certifications = [];
        }

        // Resumes
        try {
          const resumeResult = await DatabaseService.execute(`
          SELECT id, file_name, file_url, file_size, mime_type, is_primary,
            parsed_data, parsing_confidence, skills_extracted
          FROM resumes
          WHERE user_id = $1
          ORDER BY is_primary DESC, created_at DESC
          LIMIT 5
        `, [candidateId]);
          row.primary_resume = resumeResult.rows.filter((r: any) => r.is_primary === true);
          row.all_resumes = resumeResult.rows;
        } catch (e) {
          logger.error('resumes query failed:', e);
          row.primary_resume = [];
          row.all_resumes = [];
        }

        // Portfolio links
        try {
          const portfolioResult = await DatabaseService.execute(`
          SELECT id, platform, url, title, description, is_verified
          FROM portfolio_links
          WHERE user_id = $1
          ORDER BY display_order ASC
        `, [candidateId]);
          row.portfolio_links = portfolioResult.rows;
        } catch (e) {
          logger.error('portfolio_links query failed:', e);
          row.portfolio_links = [];
        }

        // AI analysis
        try {
          const aiResult = await DatabaseService.execute(`
          SELECT id, analysis_type, scores, insights, recommendations,
            model_version, processing_time, created_at
          FROM ai_analysis
          WHERE application_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `, [applicationId]);
          row.ai_analysis = aiResult.rows[0] || null;
          if (row.ai_analysis) {
            row.ai_analysis.scores = parseJson(row.ai_analysis.scores, {});
            row.ai_analysis.insights = parseJson(row.ai_analysis.insights, []);
            row.ai_analysis.recommendations = parseJson(row.ai_analysis.recommendations, []);
          }
        } catch (e) {
          logger.error('ai_analysis query failed:', e);
          row.ai_analysis = null;
        }


        // Application timeline
        try {
          const timelineResult = await DatabaseService.execute(`
          SELECT atl.id, atl.event_type, atl.event_data, atl.created_at,
            atl.ip_address, u2.email as created_by_email
          FROM application_timeline atl
          LEFT JOIN users u2 ON atl.created_by = u2.id
          WHERE atl.application_id = $1
          ORDER BY atl.created_at DESC
          LIMIT 20
        `, [applicationId]);
          row.application_timeline = timelineResult.rows.map((t: any) => ({
            ...t,
            event_data: parseJson(t.event_data, {})
          }));
        } catch (e) {
          logger.error('application_timeline query failed:', e);
          row.application_timeline = [];
        }

        // Upcoming interviews
        try {
          const interviewResult = await DatabaseService.execute(`
          SELECT id, reminder_type, title, description, reminder_time, status, sent_at
          FROM application_reminders
          WHERE application_id = $1 AND status = 'pending'
          ORDER BY reminder_time ASC
        `, [applicationId]);
          row.upcoming_interviews = interviewResult.rows;
        } catch (e) {
          logger.error('application_reminders query failed:', e);
          row.upcoming_interviews = [];
        }

        // Assignments
        try {
          const assignResult = await DatabaseService.execute(`
          SELECT asgn.assignee_id, asgn.assigned_by, asgn.assigned_at, asgn.role, asgn.notes,
            u2.email as assignee_email,
            CONCAT(cp2.first_name, '', cp2.last_name) as assignee_name
          FROM application_assignments asgn
          LEFT JOIN users u2 ON asgn.assignee_id = u2.id
          LEFT JOIN candidate_profiles cp2 ON u2.id = cp2.user_id
          WHERE asgn.application_id = $1 AND asgn.status = 'active'
        `, [applicationId]);
          row.assigned_to = assignResult.rows;
        } catch (e) {
          logger.error('application_assignments query failed:', e);
          row.assigned_to = [];
        }

        return row;
      }));

      const stats = statsResult.rows[0] || {};

      this.sendSuccess(res, {
        job: {
          id: job.id,
          title: job.title,
          company_id: job.company_id,
          company_name: job.company_name,
          logo_url: job.logo_url,
          description: job.description,
          department: job.department,
          job_type: job.job_type,
          work_arrangement: job.work_arrangement,
          locations: job.locations,
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          salary_currency: job.salary_currency,
          benefits: job.benefits,
          experience_min: job.experience_min,
          experience_max: job.experience_max,
          experience_level: job.experience_level,
          skills_required: job.skills_required,
          skills_preferred: job.skills_preferred,
          education_required: job.education_required,
          status: job.status,
          published_at: job.published_at,
          expires_at: job.expires_at,
          ai_match_required_score: job.ai_match_required_score
        },
        candidates,
        stats: {
          total_applications: parseInt(stats.total_applications || 0),
          avg_match_score: Math.round(parseFloat(stats.avg_match_score || 0)),
          max_match_score: parseInt(stats.max_match_score || 0),
          min_match_score: parseInt(stats.min_match_score || 0),
          high_match_count: parseInt(stats.high_match_count || 0),
          medium_match_count: parseInt(stats.medium_match_count || 0),
          low_match_count: parseInt(stats.low_match_count || 0),
          by_status: {
            submitted: parseInt(stats.submitted_count || 0),
            under_review: parseInt(stats.under_review_count || 0),
            shortlisted: parseInt(stats.shortlisted_count || 0),
            interview: parseInt(stats.interview_count || 0),
            assessment: parseInt(stats.assessment_count || 0),
            offer: parseInt(stats.offer_count || 0),
            hired: parseInt(stats.hired_count || 0),
            rejected: parseInt(stats.rejected_count || 0)
          }
        },
        pagination: {
          current_page: validPage,
          per_page: validLimit,
          total_items: total,
          total_pages: Math.ceil(total / validLimit),
          has_next_page: validPage * validLimit < total,
          has_prev_page: validPage > 1
        },
        filters: {
          sort_by: sortBy,
          sort_order: order
        }
      });

    } catch (error) {
      logger.error('Error getting job candidates with matches:', error);
      this.sendError(res, 'Failed to fetch job candidates', 500, error as Error);
    }
  }
  private async getUserCompanyId(userId: string, userType: string): Promise<string | null> {
    if (userType !== 'company_admin'&& userType !== 'recruiter') {
      return null;
    }

    const teamResult = await DatabaseService.execute(
      'SELECT company_id FROM company_team WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC LIMIT 1',
      [userId]
    );

    return teamResult.rows[0]?.company_id || null;
  }

  // =====================================================
  // SAVED JOBS METHODS
  // =====================================================

  /**
   * Save a job for the current user
   * @route POST /api/v1/jobs/saved/:jobId
   * @access Private (all authenticated users)
   */
  async saveJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const userId = req.user.id;

      if (!jobId || !ValidationService.isValidUUID(jobId)) {
        this.sendError(res, 'Invalid job ID format', 400);
        return;
      }

      // Check if job exists
      const jobCheck = await DatabaseService.execute(
        `SELECT id, status FROM jobs WHERE id = $1 AND deleted_at IS NULL`,
        [jobId]
      );

      if (jobCheck.rows.length === 0) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      // Check if already saved
      const existingSave = await DatabaseService.execute(
        `SELECT 1 FROM saved_jobs WHERE user_id = $1 AND job_id = $2`,
        [userId, jobId]
      );

      if (existingSave.rows.length > 0) {
        this.sendError(res, 'Job already saved', 400);
        return;
      }

      // Save the job, capturing the AI match score the candidate saw (if provided)
      const savedMatchScore = req.body?.match_score ?? req.body?.matchScore ?? null;
      await DatabaseService.execute(
        `INSERT INTO saved_jobs (user_id, job_id, saved_at, match_score)
       VALUES ($1, $2, NOW(), $3)`,
        [userId, jobId, savedMatchScore]
      );

      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'saved_jobs',
        operation: 'insert',
        candidate_id: userId,
        job_id: jobId,
        payload: { match_score: savedMatchScore },
        source: 'backend',
      });

      this.sendSuccess(res, { jobId, saved: true }, 'Job saved successfully');
    } catch (error) {
      logger.error('Error saving job:', error);
      this.sendError(res, 'Failed to save job', 500, error as Error);
    }
  }

  /**
   * Unsave a job (remove from saved)
   * @route DELETE /api/v1/jobs/saved/:jobId
   * @access Private (all authenticated users)
   */
  async unsaveJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const userId = req.user.id;

      if (!jobId || !ValidationService.isValidUUID(jobId)) {
        this.sendError(res, 'Invalid job ID format', 400);
        return;
      }

      const result = await DatabaseService.execute(
        `DELETE FROM saved_jobs WHERE user_id = $1 AND job_id = $2 RETURNING 1`,
        [userId, jobId]
      );

      if (result.rows.length === 0) {
        this.sendError(res, 'Job not found in saved list', 404);
        return;
      }

      RecommendationSyncService.queueEvent({
        event_type: 'recommendation_update',
        entity_type: 'saved_jobs',
        operation: 'delete',
        candidate_id: userId,
        job_id: jobId,
        payload: {},
        source: 'backend',
      });

      this.sendSuccess(res, { jobId, saved: false }, 'Job removed from saved');
    } catch (error) {
      logger.error('Error unsaving job:', error);
      this.sendError(res, 'Failed to unsave job', 500, error as Error);
    }
  }

  /**
   * Get all saved jobs for the current user
   * @route GET /api/v1/jobs/saved
   * @access Private (all authenticated users)
   */
  async getSavedJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const { page = '1', limit = '20'} = req.query;

      const validPage = Math.max(1, parseInt(page as string));
      const validLimit = Math.min(100, parseInt(limit as string));
      const offset = (validPage - 1) * validLimit;

      const result = await DatabaseService.execute(`
      SELECT 
        j.*,
        c.name as company_name,
        c.logo_url as company_logo,
        sj.saved_at,
        sj.notes,
        sj.tags,
        sj.priority,
        sj.folder,
        sj.match_score
      FROM saved_jobs sj
      JOIN jobs j ON sj.job_id = j.id
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE sj.user_id = $1
        AND j.deleted_at IS NULL
      ORDER BY sj.saved_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, validLimit, offset]);

      const countResult = await DatabaseService.execute(
        `SELECT COUNT(*) as total FROM saved_jobs WHERE user_id = $1`,
        [userId]
      );

      const total = parseInt(countResult.rows[0]?.total || '0');

      this.sendSuccess(res, {
        data: result.rows,
        pagination: {
          current_page: validPage,
          per_page: validLimit,
          total_items: total,
          total_pages: Math.ceil(total / validLimit),
          has_next_page: validPage * validLimit < total,
          has_prev_page: validPage > 1
        }
      });
    } catch (error) {
      logger.error('Error getting saved jobs:', error);
      this.sendError(res, 'Failed to get saved jobs', 500, error as Error);
    }
  }

  /**
   * Check if a job is saved by the current user
   * @route GET /api/v1/jobs/saved/:jobId/check
   * @access Private (all authenticated users)
   */
  async isJobSaved(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const userId = req.user.id;

      if (!jobId || !ValidationService.isValidUUID(jobId)) {
        this.sendError(res, 'Invalid job ID format', 400);
        return;
      }

      // Check if job exists
      const jobCheck = await DatabaseService.execute(
        `SELECT id FROM jobs WHERE id = $1 AND deleted_at IS NULL`,
        [jobId]
      );

      if (jobCheck.rows.length === 0) {
        this.sendError(res, 'Job not found', 404);
        return;
      }

      // Check if saved
      const result = await DatabaseService.execute(
        `SELECT 1 FROM saved_jobs WHERE user_id = $1 AND job_id = $2`,
        [userId, jobId]
      );

      this.sendSuccess(res, {
        saved: result.rows.length > 0,
        isSaved: result.rows.length > 0,
        jobId
      });
    } catch (error) {
      logger.error('Error checking saved job:', error);
      this.sendError(res, 'Failed to check saved status', 500, error as Error);
    }
  }

  // =====================================================
  // SUGGESTIONS   unique values from DB for autocomplete
  // =====================================================

  async getSuggestions(req: Request, res: Response): Promise<void> {
    try {
      // Skills: from the dedicated skills table
      const skillsResult = await DatabaseService.execute(
        `SELECT DISTINCT name FROM skills
       WHERE name IS NOT NULL AND trim(name) <> ''
       ORDER BY name LIMIT 300`,
        []
      );

      // Helper to safely unnest JSONB arrays that may be plain arrays or {required:[]} objects
      const unnestQuery = (col: string) => `
      SELECT DISTINCT item FROM (
        SELECT jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(${col}) = 'array'THEN ${col}
            WHEN jsonb_typeof(${col}) = 'object'AND ${col} ? 'required'THEN ${col}->'required'
            ELSE '[]'::jsonb
          END
        ) AS item
        FROM jobs
        WHERE ${col} IS NOT NULL
          AND ${col}::text NOT IN ('[]','null','{}')
          AND deleted_at IS NULL
      ) t
      WHERE trim(item) <> ''
      ORDER BY item
      LIMIT 150
    `;

      const [respResult, reqResult, benefitsResult] = await Promise.all([
        DatabaseService.execute(unnestQuery('responsibilities'), []),
        DatabaseService.execute(unnestQuery('requirements'), []),
        DatabaseService.execute(unnestQuery('benefits'), []),
      ]);

      // Degree types from structured qualification entries. Older jobs may have
      // a combined display string in minimum_degree, so keep only clean degree names.
      const degreeTypesResult = await DatabaseService.execute(`
      SELECT DISTINCT item FROM (
        SELECT entry->>'degree'AS item
        FROM jobs
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(education_required->'qualification_entries') = 'array'
              THEN education_required->'qualification_entries'
            ELSE '[]'::jsonb
          END
        ) AS entry
        WHERE education_required IS NOT NULL
          AND jsonb_typeof(education_required) = 'object'
          AND deleted_at IS NULL
        UNION
        SELECT education_required->>'minimum_degree'AS item
        FROM jobs
        WHERE education_required IS NOT NULL
          AND jsonb_typeof(education_required) = 'object'
          AND deleted_at IS NULL
      ) t
      WHERE trim(COALESCE(item,'')) <> ''
        AND item !~* '[[:space:]]+(in|or)[[:space:]]+'
        AND length(item) <= 60
      ORDER BY item LIMIT 50
    `, []);

      // Fields of study from structured qualification entries and legacy fields_of_study
      const fieldsOfStudyResult = await DatabaseService.execute(`
      SELECT DISTINCT item FROM (
        SELECT jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(entry->'fields') = 'array'
               THEN entry->'fields'
               ELSE '[]'::jsonb END
        ) AS item
        FROM jobs
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(education_required->'qualification_entries') = 'array'
              THEN education_required->'qualification_entries'
            ELSE '[]'::jsonb
          END
        ) AS entry
        WHERE education_required IS NOT NULL AND deleted_at IS NULL
        UNION
        SELECT jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(education_required->'fields_of_study') = 'array'
               THEN education_required->'fields_of_study'
               ELSE '[]'::jsonb END
        ) AS item
        FROM jobs
        WHERE education_required IS NOT NULL AND deleted_at IS NULL
      ) t
      WHERE trim(COALESCE(item,'')) <> ''
      ORDER BY item LIMIT 150
    `, []);

      this.sendSuccess(res, {
        skills: skillsResult.rows.map((r: any) => r.name).filter(Boolean),
        responsibilities: respResult.rows.map((r: any) => r.item).filter(Boolean),
        requirements: reqResult.rows.map((r: any) => r.item).filter(Boolean),
        benefits: benefitsResult.rows.map((r: any) => r.item).filter(Boolean),
        degreeTypes: degreeTypesResult.rows.map((r: any) => r.item).filter(Boolean),
        fieldsOfStudy: fieldsOfStudyResult.rows.map((r: any) => r.item).filter(Boolean),
      });
    } catch (error) {
      logger.error('Error fetching suggestions:', error);
      this.sendError(res, 'Failed to fetch suggestions', 500, error as Error);
    }
  }


  async getCompanyDashboardStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Get company ID from the authenticated user
      let companyId: string | null = null;
      console.log('========== GET COMPANY DASHBOARD STATS CALLED ==========');
      console.log('User:', {
        id: req.user.id,
        type: req.user.user_type,
        company_id: req.user.company_id
      });
      console.log('Headers:', req.headers.authorization?.substring(0, 50) + '...');

      if (req.user.user_type === 'company_admin'|| req.user.user_type === 'recruiter') {
        companyId = req.user.company_id ? String(req.user.company_id) : null;
      }

      if (!companyId) {
        this.sendError(res, 'Company not found for this user', 404);
        return;
      }

      // Get Active Jobs count
      const activeJobsResult = await DatabaseService.execute(`
      SELECT COUNT(*) as count
      FROM jobs
      WHERE company_id = $1 
        AND status = 'active'
        AND deleted_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
    `, [companyId]);

      // Get Total Applications count
      const totalApplicationsResult = await DatabaseService.execute(`
      SELECT COUNT(*) as count
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      WHERE j.company_id = $1
        AND a.deleted_at IS NULL
    `, [companyId]);

      // Get Qualified Candidates count (match_score >= 70)
      const qualifiedCandidatesResult = await DatabaseService.execute(`
      SELECT COUNT(DISTINCT a.user_id) as count
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      WHERE j.company_id = $1
        AND a.deleted_at IS NULL
        AND a.match_score >= 70
    `, [companyId]);

      // Get Interviews Scheduled count
      const interviewsScheduledResult = await DatabaseService.execute(`
      SELECT COUNT(*) as count
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      WHERE j.company_id = $1
        AND a.deleted_at IS NULL
        AND a.status = 'interview'
    `, [companyId]);

      // Optional: Get additional stats for more insights
      const additionalStats = await DatabaseService.execute(`
      SELECT 
        COUNT(CASE WHEN j.status = 'active'THEN 1 END) as active_jobs,
        COUNT(CASE WHEN j.status = 'draft'THEN 1 END) as draft_jobs,
        COUNT(CASE WHEN j.status = 'paused'THEN 1 END) as paused_jobs,
        COUNT(CASE WHEN j.status = 'closed'THEN 1 END) as closed_jobs,
        COUNT(CASE WHEN j.status = 'expired'THEN 1 END) as expired_jobs,
        COUNT(CASE WHEN a.status = 'submitted'THEN 1 END) as pending_applications,
        COUNT(CASE WHEN a.status = 'under_review'THEN 1 END) as under_review,
        COUNT(CASE WHEN a.status = 'shortlisted'THEN 1 END) as shortlisted,
        COUNT(CASE WHEN a.status = 'interview'THEN 1 END) as interviews,
        COUNT(CASE WHEN a.status = 'offer'THEN 1 END) as offers,
        COUNT(CASE WHEN a.status = 'hired'THEN 1 END) as hired,
        COUNT(CASE WHEN a.status = 'rejected'THEN 1 END) as rejected
      FROM jobs j
      LEFT JOIN applications a ON j.id = a.job_id AND a.deleted_at IS NULL
      WHERE j.company_id = $1 AND j.deleted_at IS NULL
    `, [companyId]);

      this.sendSuccess(res, {
        active_jobs: parseInt(activeJobsResult.rows[0]?.count || '0'),
        total_applications: parseInt(totalApplicationsResult.rows[0]?.count || '0'),
        qualified_candidates: parseInt(qualifiedCandidatesResult.rows[0]?.count || '0'),
        interviews_scheduled: parseInt(interviewsScheduledResult.rows[0]?.count || '0'),
        additional: additionalStats.rows[0] || {}
      });
    } catch (error) {
      logger.error('Error getting company dashboard stats:', error);
      this.sendError(res, 'Failed to fetch dashboard statistics', 500, error as Error);
    }
  }



}

export default new JobController();
