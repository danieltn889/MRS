import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import BaseController from './base.controller.js';
import DatabaseService from '../services/database.service.js';
import ResponseService from '../services/response.service.js';
import { logger } from '../config/logger.js';
import { User, Simulation, Application, Job } from '../models/index.js';

interface DashboardMetrics {
  total_users?: number;
  total_candidates?: number;
  total_recruiters?: number;
  total_companies?: number;
  total_jobs?: number;
  active_jobs?: number;
  total_applications?: number;
  total_simulations?: number;
  total_applications_candidate?: number;
  active_applications?: number;
  avg_simulation_score?: number;
  verified_credentials?: number;
  saved_jobs?: number;
  avg_candidate_score?: number;
}

interface SimulationAnalytics {
  total: number;
  completed: number;
  completion_rate: string;
  average_score: string;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
}

interface SimulationWithDetails {
  id: string;
  type: string; // Database field, not in model
  status: Simulation['status'];
  overall_score: Simulation['overall_score'];
  created_at: Simulation['created_at'];
  job_title?: Job['title'];
  candidate_name?: string;
}

interface AnalyticsData {
  period: string;
  simulations: SimulationAnalytics;
  recent_simulations: SimulationWithDetails[];
}

interface DashboardData {
  success: boolean;
  data: DashboardMetrics;
}

interface AnalyticsResponse {
  success: boolean;
  data: AnalyticsData;
}

export class AnalyticsController extends BaseController {
  private dbService: typeof DatabaseService;

  constructor() {
    super('analytics');
    this.dbService = DatabaseService;
  }

  /**
   * Get dashboard metrics based on user role
   */
  async getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const userId = parseInt(user.id, 10);
      const userType = user.user_type;

      let dashboardData: DashboardMetrics;

      switch (userType) {
        case 'candidate':
          dashboardData = await this.getCandidateDashboard(userId);
          break;
        case 'recruiter':
        case 'company_admin':
          dashboardData = await this.getRecruiterDashboard(userId);
          break;
        case 'system_admin':
          dashboardData = await this.getAdminDashboard();
          break;
        default:
          ResponseService.forbidden(res, 'Invalid user type');
          return;
      }

      const response: DashboardData = {
        success: true,
        data: dashboardData
      };

      res.json(response);
    } catch (error) {
      logger.error('Get dashboard error:', error);
      ResponseService.error(res, 'Failed to fetch dashboard data');
    }
  }

  /**
   * Get simulation analytics for recruiters
   */
  async getSimulationAnalytics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const userType = req.user?.user_type;
      const { days = 30 } = req.query;

      if (!userId || !userType) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      // Only recruiters and admins can view analytics
      if (!['recruiter', 'company_admin', 'admin'].includes(userType)) {
        ResponseService.forbidden(res, 'Access denied');
        return;
      }

      const daysNum = parseInt(days as string, 10);
      if (isNaN(daysNum) || daysNum <= 0 || daysNum > 365) {
        ResponseService.error(res, 'Invalid days parameter', 400);
        return;
      }

      let simulationsQuery: string;
      let params: any[];

      if (userType === 'system_admin') {
        // Admin can see all simulations
        simulationsQuery = `
          SELECT s.id, s.type, s.status, s.overall_score, s.created_at,
                 j.title as job_title, u.name as candidate_name
          FROM simulations s
          LEFT JOIN applications a ON s.application_id = a.id
          LEFT JOIN jobs j ON a.job_id = j.id
          LEFT JOIN users u ON a.user_id = u.id
          WHERE s.created_at >= NOW() - INTERVAL '${daysNum} days'
          ORDER BY s.created_at DESC
        `;
        params = [];
      } else {
        // Recruiters see only their own jobs' simulations
        simulationsQuery = `
          SELECT s.id, s.type, s.status, s.overall_score, s.created_at,
                 j.title as job_title, u.name as candidate_name
          FROM simulations s
          LEFT JOIN applications a ON s.application_id = a.id
          LEFT JOIN jobs j ON a.job_id = j.id
          LEFT JOIN users u ON a.user_id = u.id
          WHERE j.created_by = $1 AND s.created_at >= NOW() - INTERVAL '${daysNum} days'
          ORDER BY s.created_at DESC
        `;
        params = [userId];
      }

      const simulationsResult = await this.dbService.query(simulationsQuery, params);

      // Calculate metrics
      const totalSimulations = simulationsResult.rows.length;
      const completedSimulations = simulationsResult.rows.filter((s: any) => s.status === 'completed').length;
      const scores = simulationsResult.rows
        .filter((s: any) => s.overall_score)
        .map((s: any) => s.overall_score);
      const averageScore = scores.length > 0
        ? scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length
        : 0;

      const simulationsByType: Record<string, number> = {};
      const simulationsByStatus: Record<string, number> = {};

      simulationsResult.rows.forEach((sim: SimulationWithDetails) => {
        simulationsByType[sim.type] = (simulationsByType[sim.type] || 0) + 1;
        simulationsByStatus[sim.status] = (simulationsByStatus[sim.status] || 0) + 1;
      });

      const analyticsData: AnalyticsData = {
        period: `${daysNum} days`,
        simulations: {
          total: totalSimulations,
          completed: completedSimulations,
          completion_rate: totalSimulations > 0 ? (completedSimulations / totalSimulations * 100).toFixed(2) : '0',
          average_score: averageScore.toFixed(2),
          by_type: simulationsByType,
          by_status: simulationsByStatus
        },
        recent_simulations: simulationsResult.rows.slice(0, 10)
      };

      const response: AnalyticsResponse = {
        success: true,
        data: analyticsData
      };

      res.json(response);
    } catch (error) {
      logger.error('Get simulation analytics error:', error);
      ResponseService.error(res, 'Failed to fetch simulation analytics');
    }
  }

  /**
   * Get job analytics for recruiters and company admins
   */
  async getJobAnalytics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Placeholder implementation
      res.json({
        success: true,
        data: {
          message: 'Job analytics not yet implemented'
        }
      });
    } catch (error) {
      logger.error('Get job analytics error:', error);
      ResponseService.error(res, 'Failed to fetch job analytics');
    }
  }

  /**
   * Get candidate analytics for recruiters and company admins
   */
  async getCandidateAnalytics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Placeholder implementation
      res.json({
        success: true,
        data: {
          message: 'Candidate analytics not yet implemented'
        }
      });
    } catch (error) {
      logger.error('Get candidate analytics error:', error);
      ResponseService.error(res, 'Failed to fetch candidate analytics');
    }
  }

  /**
   * Helper method for candidate dashboard
   */
  private async getCandidateDashboard(userId: number): Promise<DashboardMetrics> {
    const dashboardQuery = `
      SELECT
        COUNT(DISTINCT a.id) as total_applications,
        COUNT(DISTINCT CASE WHEN a.status IN ('shortlisted', 'interview', 'offer', 'hired') THEN a.id END) as active_applications,
        COUNT(DISTINCT s.id) as total_simulations,
        AVG(s.overall_score) as avg_simulation_score,
        COUNT(DISTINCT bc.id) as verified_credentials,
        COUNT(DISTINCT sa.job_id) as saved_jobs
      FROM users u
      LEFT JOIN applications a ON u.id = a.user_id
      LEFT JOIN simulations s ON u.id = s.user_id
      LEFT JOIN blockchain_credentials bc ON u.id = bc.user_id AND bc.status = 'verified'
      LEFT JOIN saved_jobs sa ON u.id = sa.user_id
      WHERE u.id = $1
    `;

    const result = await this.dbService.query(dashboardQuery, [userId]);
    return result.rows[0] as DashboardMetrics;
  }

  /**
   * Helper method for recruiter dashboard
   */
  private async getRecruiterDashboard(userId: number): Promise<DashboardMetrics> {
    const dashboardQuery = `
      SELECT
        COUNT(DISTINCT j.id) as total_jobs,
        COUNT(DISTINCT CASE WHEN j.status = 'active' THEN j.id END) as active_jobs,
        COUNT(DISTINCT a.id) as total_applications,
        COUNT(DISTINCT s.id) as total_simulations,
        AVG(s.overall_score) as avg_candidate_score
      FROM users u
      LEFT JOIN jobs j ON u.id = j.created_by
      LEFT JOIN applications a ON j.id = a.job_id
      LEFT JOIN simulations s ON a.id = s.application_id
      WHERE u.id = $1
    `;

    const result = await this.dbService.query(dashboardQuery, [userId]);
    return result.rows[0] as DashboardMetrics;
  }

  /**
   * Helper method for admin dashboard
   */
  private async getAdminDashboard(): Promise<DashboardMetrics> {
    const dashboardQuery = `
      SELECT
        COUNT(DISTINCT u.id) as total_users,
        COUNT(DISTINCT CASE WHEN u.user_type = 'candidate' THEN u.id END) as total_candidates,
        COUNT(DISTINCT CASE WHEN u.user_type IN ('recruiter', 'company_admin') THEN u.id END) as total_recruiters,
        COUNT(DISTINCT c.id) as total_companies,
        COUNT(DISTINCT j.id) as total_jobs,
        COUNT(DISTINCT CASE WHEN j.status = 'active' THEN j.id END) as active_jobs,
        COUNT(DISTINCT a.id) as total_applications,
        COUNT(DISTINCT s.id) as total_simulations
      FROM users u
      LEFT JOIN companies c ON u.id = c.created_by
      LEFT JOIN jobs j ON u.id = j.created_by
      LEFT JOIN applications a ON j.id = a.job_id
      LEFT JOIN simulations s ON a.id = s.application_id
    `;

    const result = await this.dbService.query(dashboardQuery);
    return result.rows[0] as DashboardMetrics;
  }
}

export default new AnalyticsController();