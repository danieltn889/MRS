import express, { Router, Request, Response } from 'express';
import { query, param } from 'express-validator';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { query as dbQuery } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { AuthenticatedRequest } from '../../types/auth.types.js';

const router: Router = express.Router();

// Utility function to wrap AuthenticatedRequest handlers
const withAuth = (handler: (req: AuthenticatedRequest, res: express.Response) => Promise<any>) => {
  return (req: express.Request, res: express.Response) => handler(req as unknown as AuthenticatedRequest, res);
};

// All routes require authentication
router.use(protect);

// @route   GET /api/v1/analytics/dashboard
// @desc    Get dashboard analytics based on user type
// @access  Private
router.get('/dashboard', protect, async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    // Placeholder implementation
    res.json({
      success: true,
      data: {
        message: 'Dashboard analytics not yet implemented'
      }
    });
  } catch (error) {
    logger.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard analytics'
    });
  }
});

// @route   GET /api/v1/analytics/jobs
// @desc    Get job analytics for recruiters and company admins
// @access  Private (Recruiters and Company Admins)
router.get('/jobs', protect, [
  query('period').optional().isInt({ min: 1, max: 365 }).toInt(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    if (!['recruiter', 'company_admin'].includes(authReq.user!.user_type)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    // Placeholder implementation
    res.json({
      success: true,
      data: {
        message: 'Job analytics not yet implemented'
      }
    });
  } catch (error) {
    logger.error('Get job analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch job analytics'
    });
  }
});

// @route   GET /api/v1/analytics/candidates
// @desc    Get candidate analytics for recruiters and company admins
// @access  Private (Recruiters and Company Admins)
router.get('/candidates', protect, [
  query('period').optional().isInt({ min: 1, max: 365 }).toInt(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    if (!['recruiter', 'company_admin'].includes(authReq.user!.user_type)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    // Placeholder implementation
    res.json({
      success: true,
      data: {
        message: 'Candidate analytics not yet implemented'
      }
    });
  } catch (error) {
    logger.error('Get candidate analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch candidate analytics'
    });
  }
});

// @route   GET /api/v1/analytics/simulations
// @desc    Get simulation analytics for candidates and admins
// @access  Private (Candidates and Admins)
router.get('/simulations', protect, [
  query('period').optional().isInt({ min: 1, max: 365 }).toInt(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  try {
    if (!['candidate', 'system_admin'].includes(authReq.user!.user_type)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
    // Placeholder implementation
    res.json({
      success: true,
      data: {
        message: 'Simulation analytics not yet implemented'
      }
    });
  } catch (error) {
    logger.error('Get simulation analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch simulation analytics'
    });
  }
});

// @route   GET /api/v1/analytics/reports/job-performance
// @desc    Generate job performance report
// @access  Private (Recruiters and Company Admins)
router.get('/reports/job-performance', [protect, query('jobId').optional().isInt().toInt(), query('startDate').optional().isISO8601(), query('endDate').optional().isISO8601(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  if (!['recruiter', 'company_admin'].includes(authReq.user.user_type)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  try {
    const { jobId, startDate, endDate } = req.query;
    const userId = authReq.user.id;

    let query = `
      SELECT
        j.id,
        j.title,
        j.status,
        j.created_at,
        j.view_count,
        j.application_count,
        COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as hired_count,
        COUNT(CASE WHEN a.status = 'interviewed' THEN 1 END) as interviewed_count,
        AVG(EXTRACT(EPOCH FROM (a.updated_at - a.created_at))/86400) as avg_time_to_hire
      FROM jobs j
      LEFT JOIN applications a ON j.id = a.job_id
      WHERE j.created_by = $1
    `;
    const params: any[] = [userId];

    if (jobId) {
      query += ' AND j.id = $2';
      params.push(jobId as unknown as number);
    }

    if (startDate) {
      query += ` AND j.created_at >= $${params.length + 1}`;
      params.push(startDate as string);
    }

    if (endDate) {
      query += ` AND j.created_at <= $${params.length + 1}`;
      params.push(endDate as string);
    }

    query += ' GROUP BY j.id, j.title, j.status, j.created_at, j.view_count, j.application_count ORDER BY j.created_at DESC';

    const result = await dbQuery(query, params);

    res.json({
      success: true,
      data: result.rows
    });
    return;

  } catch (error) {
    logger.error('Generate job performance report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate job performance report'
    });
    return;
  }
});

// @route   GET /api/v1/analytics/reports/candidate-insights
// @desc    Generate candidate insights report
// @access  Private (Recruiters and Company Admins)
router.get('/reports/candidate-insights', [protect, query('startDate').optional().isISO8601(), query('endDate').optional().isISO8601(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  if (!['recruiter', 'company_admin'].includes(authReq.user.user_type)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  try {
    const { startDate, endDate } = req.query;
    const userId = authReq.user.id;

    let query = `
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.location,
        c.experience_years,
        COUNT(DISTINCT a.id) as total_applications,
        COUNT(DISTINCT CASE WHEN a.status = 'hired' THEN a.id END) as successful_applications,
        AVG(CASE WHEN a.status = 'hired' THEN EXTRACT(EPOCH FROM (a.updated_at - a.created_at))/86400 END) as avg_time_to_hire,
        STRING_AGG(DISTINCT s.name, ', ') as top_skills
      FROM candidates c
      LEFT JOIN applications a ON c.user_id = a.candidate_id
      LEFT JOIN candidate_skills cs ON c.user_id = cs.candidate_id
      LEFT JOIN skills s ON cs.skill_id = s.id
      WHERE a.job_id IN (
        SELECT id FROM jobs WHERE created_by = $1
      )
    `;
    const params: any[] = [userId];

    if (startDate) {
      query += ` AND a.created_at >= $${params.length + 1}`;
      params.push(startDate as string);
    }

    if (endDate) {
      query += ` AND a.created_at <= $${params.length + 1}`;
      params.push(endDate as string);
    }

    query += `
      GROUP BY c.id, c.first_name, c.last_name, c.email, c.location, c.experience_years
      ORDER BY total_applications DESC
      LIMIT 50
    `;

    const result = await dbQuery(query, params);

    res.json({
      success: true,
      data: result.rows
    });
    return;

  } catch (error) {
    logger.error('Generate candidate insights report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate candidate insights report'
    });
    return;
  }
});

// @route   GET /api/v1/analytics/reports/platform-usage
// @desc    Generate platform usage report
// @access  Private (System Admins)
router.get('/reports/platform-usage', [protect, query('startDate').optional().isISO8601(), query('endDate').optional().isISO8601(), validateRequest], async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  if (!['system_admin'].includes(authReq.user.user_type)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [];

    if (startDate) {
      dateFilter += ' AND created_at >= $1';
      params.push(startDate);
    }

    if (endDate) {
      dateFilter += ` AND created_at <= $${params.length + 1}`;
      params.push(endDate);
    }

    const queries = {
      totalUsers: `SELECT COUNT(*) as count FROM users WHERE 1=1 ${dateFilter}`,
      activeJobs: 'SELECT COUNT(*) as count FROM jobs WHERE status = \'active\'',
      totalApplications: `SELECT COUNT(*) as count FROM applications WHERE 1=1 ${dateFilter}`,
      totalCompanies: `SELECT COUNT(*) as count FROM companies WHERE 1=1 ${dateFilter}`,
      totalSimulations: `SELECT COUNT(*) as count FROM simulations WHERE 1=1 ${dateFilter}`,
      userTypeBreakdown: `SELECT user_type, COUNT(*) as count FROM users WHERE 1=1 ${dateFilter} GROUP BY user_type`
    };

    const results: { [key: string]: any } = {};
    for (const [key, query] of Object.entries(queries)) {
      const result = await dbQuery(query, params);
      results[key] = key === 'userTypeBreakdown' ? result.rows : result.rows[0].count;
    }

    res.json({
      success: true,
      data: results
    });
    return;

  } catch (error) {
    logger.error('Generate platform usage report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate platform usage report'
    });
    return;
  }
});

export default router;
