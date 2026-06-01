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
}

export default new AIController();