import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import BaseController from './base.controller.js';
import DatabaseService from '../services/database.service.js';
import ResponseService from '../services/response.service.js';
import { logger } from '../config/logger.js';

interface AIAnalysis {
  id?: number;
  user_id: number;
  analysis_type: string;
  target_type?: string;
  target_id?: number;
  results: any;
  confidence_score: number;
  created_at?: Date;
}

interface SkillGap {
  id?: number;
  user_id: number;
  skill_id: number;
  job_id?: number;
  priority: number;
  gap_analysis: any;
  recommendations: string[];
  created_at?: Date;
  skill_name?: string;
  category?: string;
  job_title?: string;
  company_name?: string;
}

interface ResumeAnalysis {
  skills: string[];
  experience_years: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

interface JobMatch {
  job_id: number;
  job_title: string;
  company_name: string;
  match_score: number;
  match_reasons: string[];
  recommended: boolean;
}

interface PerformanceTrend {
  id?: number;
  user_id: number;
  period_start: Date;
  period_end: Date;
  metrics: any;
  trends: any;
  created_at?: Date;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface AnalysisResponse {
  success: boolean;
  data: {
    analysis: AIAnalysis[];
    pagination: PaginationInfo;
  };
}

interface SkillGapsResponse {
  success: boolean;
  data: SkillGap[];
}

interface ResumeAnalysisResponse {
  success: boolean;
  data: AIAnalysis;
  message: string;
}

interface JobMatchingResponse {
  success: boolean;
  data: {
    analysis: AIAnalysis;
    matches: JobMatch[];
  };
  message: string;
}

interface PerformanceTrendsResponse {
  success: boolean;
  data: PerformanceTrend[];
}

export class AIController extends BaseController {
  private dbService: any;

  constructor() {
    super('AIController');
    this.dbService = DatabaseService;
  }

  /**
   * Get AI analysis for user
   */
  async getAnalysis(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 20, type } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      let whereConditions: string[] = [`user_id = $${1}`];
      let params: any[] = [userId];
      let paramIndex = 2;

      if (type) {
        whereConditions.push(`analysis_type = $${paramIndex}`);
        params.push(type);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM ai_analysis ${whereClause}`;
      const countResult = await this.dbService.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Get analysis
      const analysisQuery = `
        SELECT * FROM ai_analysis
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limitNum, offset);

      const analysisResult = await this.dbService.query(analysisQuery, params);

      // Calculate pagination
      const totalPages = Math.ceil(total / limitNum);
      const hasNext = pageNum < totalPages;
      const hasPrev = pageNum > 1;

      const pagination: PaginationInfo = {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext,
        hasPrev
      };

      const response: AnalysisResponse = {
        success: true,
        data: {
          analysis: analysisResult.rows,
          pagination
        }
      };

      res.json(response);
    } catch (error) {
      logger.error('Get AI analysis error:', error);
      ResponseService.error(res, 'Failed to fetch AI analysis');
    }
  }

  /**
   * Get skill gap analysis
   */
  async getSkillGaps(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const skillGapsQuery = `
        SELECT sg.*, s.name as skill_name, s.category,
               j.title as job_title, c.name as company_name
        FROM skill_gaps sg
        JOIN skills s ON sg.skill_id = s.id
        LEFT JOIN jobs j ON sg.job_id = j.id
        LEFT JOIN companies c ON j.company_id = c.id
        WHERE sg.user_id = $1
        ORDER BY sg.priority DESC, sg.created_at DESC
      `;

      const skillGapsResult = await this.dbService.query(skillGapsQuery, [userId]);

      const response: SkillGapsResponse = {
        success: true,
        data: skillGapsResult.rows
      };

      res.json(response);
    } catch (error) {
      logger.error('Get skill gaps error:', error);
      ResponseService.error(res, 'Failed to fetch skill gaps');
    }
  }

  /**
   * Analyze resume with AI
   */
  async analyzeResume(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { resumeId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      if (!resumeId) {
        ResponseService.error(res, 'Resume ID is required', 400);
        return;
      }

      // Get resume
      const resumeQuery = `
        SELECT r.*, cp.first_name, cp.last_name
        FROM resumes r
        JOIN candidate_profiles cp ON r.user_id = cp.user_id
        WHERE r.id = $1 AND r.user_id = $2
      `;

      const resumeResult = await this.dbService.query(resumeQuery, [resumeId, userId]);

      if (resumeResult.rows.length === 0) {
        ResponseService.notFound(res, 'Resume not found');
        return;
      }

      const resume = resumeResult.rows[0];

      // Simulate AI analysis (in real implementation, this would call an AI service)
      const analysis: ResumeAnalysis = {
        skills: ['JavaScript', 'React', 'Node.js'],
        experience_years: 3,
        strengths: ['Frontend development', 'API integration'],
        weaknesses: ['Testing', 'DevOps'],
        recommendations: ['Learn testing frameworks', 'Get AWS certification']
      };

      // Store analysis
      const analysisResult = await this.dbService.query(
        `INSERT INTO ai_analysis (
          user_id, analysis_type, target_type, target_id, results, confidence_score
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          userId,
          'resume_analysis',
          'resume',
          resumeId,
          analysis,
          0.85
        ]
      );

      logger.info(`Resume analyzed for user ${userId}: ${analysisResult.rows[0].id}`);

      const response: ResumeAnalysisResponse = {
        success: true,
        data: analysisResult.rows[0],
        message: 'Resume analysis completed'
      };

      res.json(response);
    } catch (error) {
      logger.error('Analyze resume error:', error);
      ResponseService.error(res, 'Failed to analyze resume');
    }
  }

  /**
   * Match candidate with jobs using AI
   */
  async matchJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobIds } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
        ResponseService.error(res, 'Valid job IDs array is required', 400);
        return;
      }

      // Get candidate profile and skills
      const candidateQuery = `
        SELECT cp.*, array_agg(s.name) as skills
        FROM candidate_profiles cp
        LEFT JOIN user_skills us ON cp.user_id = us.user_id
        LEFT JOIN skills s ON us.skill_id = s.id
        WHERE cp.user_id = $1
        GROUP BY cp.user_id, cp.first_name, cp.last_name, cp.headline, cp.years_experience
      `;

      const candidateResult = await this.dbService.query(candidateQuery, [userId]);

      if (candidateResult.rows.length === 0) {
        ResponseService.notFound(res, 'Candidate profile not found');
        return;
      }

      const candidate = candidateResult.rows[0];

      // Get jobs
      const jobsQuery = `
        SELECT j.id, j.title, j.description, j.requirements, j.skills_required,
               c.name as company_name
        FROM jobs j
        JOIN companies c ON j.company_id = c.id
        WHERE j.id = ANY($1) AND j.status = 'active'
      `;

      const jobsResult = await this.dbService.query(jobsQuery, [jobIds]);

      // Simulate AI matching (in real implementation, this would use ML models)
      const matches: JobMatch[] = jobsResult.rows.map((job: any) => {
        const matchScore = Math.floor(Math.random() * 40) + 60; // 60-100 score
        const reasons = [
          'Skills match',
          'Experience level appropriate',
          'Location preference'
        ];

        return {
          job_id: job.id,
          job_title: job.title,
          company_name: job.company_name,
          match_score: matchScore,
          match_reasons: reasons,
          recommended: matchScore > 80
        };
      });

      // Store analysis
      const analysisResult = await this.dbService.query(
        `INSERT INTO ai_analysis (
          user_id, analysis_type, target_type, target_id, results, confidence_score
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          userId,
          'job_matching',
          'jobs',
          null,
          { matches, candidate_skills: candidate.skills },
          0.78
        ]
      );

      const response: JobMatchingResponse = {
        success: true,
        data: {
          analysis: analysisResult.rows[0],
          matches: matches.sort((a, b) => b.match_score - a.match_score)
        },
        message: 'Job matching analysis completed'
      };

      res.json(response);
    } catch (error) {
      logger.error('Match jobs error:', error);
      ResponseService.error(res, 'Failed to match jobs');
    }
  }

  /**
   * Get performance trends
   */
  async getPerformanceTrends(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const trendsQuery = `
        SELECT * FROM performance_trends
        WHERE user_id = $1
        ORDER BY period_start DESC
        LIMIT 12
      `;

      const trendsResult = await this.dbService.query(trendsQuery, [userId]);

      const response: PerformanceTrendsResponse = {
        success: true,
        data: trendsResult.rows
      };

      res.json(response);
    } catch (error) {
      logger.error('Get performance trends error:', error);
      ResponseService.error(res, 'Failed to fetch performance trends');
    }
  }
  
  /**
   * Get AI-powered job matches for a candidate
   * This matches the frontend expectation: GET /api/v1/ai/job-matches/:candidateId
   */
  async getJobMatchesForCandidate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { candidateId } = req.params;
      const { limit = 20, minScore = 0 } = req.query;
      const userId = req.user?.id;
      const userType = req.user?.user_type;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      // Check permission: candidate can only view their own matches, recruiters can view any candidate
      if (userType === 'candidate'&& userId !== candidateId) {
        ResponseService.forbidden(res, 'Access denied: You can only view your own job matches');
        return;
      }

      const limitNum = parseInt(limit as string, 10);
      const minScoreNum = parseInt(minScore as string, 10);

      // Get candidate profile
      const candidateQuery = `
      SELECT 
        cp.user_id as id,
        cp.first_name,
        cp.last_name,
        CONCAT(cp.first_name, '', cp.last_name) as name,
        cp.headline,
        cp.summary,
        cp.city,
        cp.country,
        u.email,
        (
          SELECT json_agg(DISTINCT jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'category', s.category,
            'proficiency_level', us.proficiency_level
          ))
          FROM user_skills us
          JOIN skills s ON us.skill_id = s.id
          WHERE us.user_id = cp.user_id
        ) as skills,
        (
          SELECT json_agg(DISTINCT jsonb_build_object(
            'id', e.id,
            'institution', e.institution,
            'degree', e.degree,
            'field_of_study', e.field_of_study,
            'start_date', e.start_date,
            'end_date', e.end_date
          ))
          FROM education e
          WHERE e.user_id = cp.user_id
        ) as education,
        (
          SELECT json_agg(DISTINCT jsonb_build_object(
            'id', we.id,
            'company', we.company,
            'title', we.title,
            'start_date', we.start_date,
            'end_date', we.end_date,
            'is_current', we.is_current
          ))
          FROM work_experience we
          WHERE we.user_id = cp.user_id
        ) as work_experience
      FROM candidate_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.user_id = $1
    `;

      const candidateResult = await this.dbService.query(candidateQuery, [candidateId]);

      if (candidateResult.rows.length === 0) {
        ResponseService.notFound(res, 'Candidate profile not found');
        return;
      }

      const candidate = candidateResult.rows[0];

      // Calculate total experience years
      let totalExperienceYears = 0;
      if (candidate.work_experience) {
        for (const exp of candidate.work_experience) {
          const start = new Date(exp.start_date);
          const end = exp.end_date ? new Date(exp.end_date) : new Date();
          const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
          totalExperienceYears += years;
        }
      }

      // Get active jobs
      const jobsQuery = `
      SELECT 
        j.*,
        c.id as company_id,
        c.name as company_name,
        c.logo_url,
        c.industry
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      WHERE j.status = 'active'
        AND j.deleted_at IS NULL
        AND (j.expires_at IS NULL OR j.expires_at > NOW())
        AND j.visibility IN ('public', 'unlisted')
      ORDER BY j.created_at DESC
      LIMIT $1
    `;

      const jobsResult = await this.dbService.query(jobsQuery, [limitNum * 2]);

      // Prepare response
      const response = {
        success: true,
        candidate: {
          id: candidate.id,
          name: candidate.name || `${candidate.first_name} ${candidate.last_name}`.trim(),
          email: candidate.email,
          level: totalExperienceYears >= 5 ? 'Senior': totalExperienceYears >= 3 ? 'Mid-Level': 'Entry-Level',
          total_experience_years: Math.round(totalExperienceYears * 10) / 10,
          skills: candidate.skills?.map((s: any) => s.name) || [],
          complete_profile: candidate
        },
        total_jobs_matched: jobsResult.rows.length,
        matches: jobsResult.rows.map((job: any) => ({
          match_score: Math.floor(Math.random() * 30) + 70, // Placeholder score
          match_level: 'Good Match',
          job: {
            id: job.id,
            title: job.title,
            company: {
              id: job.company_id,
              name: job.company_name,
              logo_url: job.logo_url,
              industry: job.industry
            },
            location: job.locations?.[0]?.city || 'Location not specified',
            type: job.job_type,
            workArrangement: job.work_arrangement,
            description: job.description,
            expires_at: job.expires_at,
            published_at: job.published_at
          }
        })),
        timestamp: new Date().toISOString(),
        performance: {
          total_ms: 0,
          jobs_processed: jobsResult.rows.length,
          matches_found: jobsResult.rows.length
        }
      };

      res.json(response);

    } catch (error: any) {
      logger.error('Get job matches for candidate error:', error);
      ResponseService.error(res, error.message || 'Failed to get job matches', 500);
    }
  }
}




export default new AIController();