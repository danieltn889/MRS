import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import BaseController from './base.controller.js';
import DatabaseService from '../services/database.service.js';
import ResponseService from '../services/response.service.js';
import { logger } from '../config/logger.js';

interface BillingPlan {
  id?: number;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'month'| 'year';
  features: any;
  active: boolean;
  created_at?: Date;
}

interface Subscription {
  id?: number;
  user_id: number;
  plan_id: number;
  status: 'active'| 'cancelled'| 'expired';
  current_period_start: Date;
  current_period_end: Date;
  payment_method_id?: number;
  cancelled_at?: Date;
  created_at?: Date;
  plan_name?: string;
  plan_description?: string;
  price?: number;
  currency?: string;
  features?: any;
}

interface Invoice {
  id?: number;
  user_id: number;
  subscription_id?: number;
  amount: number;
  currency: string;
  status: 'paid'| 'pending'| 'failed';
  due_date: Date;
  paid_at?: Date;
  created_at?: Date;
  plan_name?: string;
}

interface PaymentMethod {
  id?: number;
  user_id: number;
  type: string;
  token: string;
  last4: string;
  brand: string;
  expiry_month: number;
  expiry_year: number;
  is_default: boolean;
  created_at?: Date;
}

interface Coupon {
  id?: number;
  code: string;
  description: string;
  discount_type: 'percentage'| 'fixed';
  discount_value: number;
  max_uses?: number;
  used_count: number;
  valid_from?: Date;
  valid_until?: Date;
  active: boolean;
}

interface UsageStats {
  limits: any;
  current: {
    jobsPosted: number;
    applicationsReceived: number;
    aiAnalyses: number;
  };
}

interface BillingStats {
  totalRevenue: { total: number };
  activeSubscriptions: { count: number };
  monthlyRecurringRevenue: { total: number };
  planDistribution: Array<{ name: string; count: number }>;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface PlansResponse {
  success: boolean;
  data: BillingPlan[];
}

interface SubscriptionResponse {
  success: boolean;
  data: Subscription | null;
}

interface CreateSubscriptionResponse {
  success: boolean;
  data: {
    subscription: Subscription;
    invoice: Invoice;
  };
}

interface InvoicesResponse {
  success: boolean;
  data: Invoice[];
  pagination: PaginationInfo;
}

interface InvoiceResponse {
  success: boolean;
  data: Invoice;
}

interface PaymentMethodsResponse {
  success: boolean;
  data: PaymentMethod[];
}

interface PaymentMethodResponse {
  success: boolean;
  data: PaymentMethod;
}

interface CouponResponse {
  success: boolean;
  data: Coupon;
}

interface UsageResponse {
  success: boolean;
  data: UsageStats;
}

interface BillingStatsResponse {
  success: boolean;
  data: BillingStats;
}

export class BillingController extends BaseController {
  private dbService: typeof DatabaseService;

  constructor() {
    super('billing');
    this.dbService = DatabaseService;
  }

  /**
   * Get available billing plans
   */
  async getPlans(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.dbService.query(`
        SELECT id, name, description, price, currency, interval, features, active, created_at
        FROM billing_plans
        WHERE active = true
        ORDER BY price ASC
      `);

      const response: PlansResponse = {
        success: true,
        data: result.rows
      };

      res.json(response);
    } catch (error) {
      logger.error('Get billing plans error:', error);
      ResponseService.error(res, 'Failed to fetch billing plans');
    }
  }

  /**
   * Get current user's subscription
   */
  async getSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        SELECT s.*, bp.name as plan_name, bp.description as plan_description,
               bp.price, bp.currency, bp.interval, bp.features
        FROM subscriptions s
        JOIN billing_plans bp ON s.plan_id = bp.id
        WHERE s.user_id = $1 AND s.status = 'active'
        ORDER BY s.created_at DESC
        LIMIT 1
      `, [userId]);

      const response: SubscriptionResponse = {
        success: true,
        data: result.rows.length > 0 ? result.rows[0] : null
      };

      res.json(response);
    } catch (error) {
      logger.error('Get subscription error:', error);
      ResponseService.error(res, 'Failed to fetch subscription');
    }
  }

  /**
   * Create or update subscription
   */
  async createSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
    const client = await this.dbService.getClient();

    try {
      await client.query('BEGIN');
      const { plan_id, payment_method_id } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      if (!plan_id) {
        ResponseService.error(res, 'Plan ID is required', 400);
        return;
      }

      // Check if plan exists and is active
      const planResult = await client.query(`
        SELECT * FROM billing_plans WHERE id = $1 AND active = true
      `, [plan_id]);

      if (planResult.rows.length === 0) {
        await client.query('ROLLBACK');
        ResponseService.notFound(res, 'Billing plan not found');
        return;
      }

      const plan = planResult.rows[0];

      // Cancel any existing active subscription
      await client.query(`
        UPDATE subscriptions
        SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND status = 'active'
      `, [userId]);

      // Calculate next billing date
      const nextBillingDate = new Date();
      if (plan.interval === 'month') {
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      } else if (plan.interval === 'year') {
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
      }

      // Create new subscription
      const subscriptionResult = await client.query(`
        INSERT INTO subscriptions (
          user_id, plan_id, status, current_period_start, current_period_end,
          payment_method_id, created_at
        )
        VALUES ($1, $2, 'active', CURRENT_TIMESTAMP, $3, $4, CURRENT_TIMESTAMP)
        RETURNING *
      `, [userId, plan_id, nextBillingDate, payment_method_id]);

      // Create initial invoice
      const invoiceResult = await client.query(`
        INSERT INTO invoices (
          user_id, subscription_id, amount, currency, status, due_date, created_at
        )
        VALUES ($1, $2, $3, $4, 'paid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `, [userId, subscriptionResult.rows[0].id, plan.price, plan.currency]);

      await client.query('COMMIT');

      const response: CreateSubscriptionResponse = {
        success: true,
        data: {
          subscription: subscriptionResult.rows[0],
          invoice: invoiceResult.rows[0]
        }
      };

      res.status(201).json(response);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Create subscription error:', error);
      ResponseService.error(res, 'Failed to create subscription');
    } finally {
      client.release();
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        UPDATE subscriptions
        SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND status = 'active'
        RETURNING *
      `, [userId]);

      if (result.rows.length === 0) {
        ResponseService.notFound(res, 'Active subscription not found');
        return;
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Cancel subscription error:', error);
      ResponseService.error(res, 'Failed to cancel subscription');
    }
  }

  /**
   * Get user's invoices
   */
  async getInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 20 } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      const result = await this.dbService.query(`
        SELECT i.*, bp.name as plan_name
        FROM invoices i
        LEFT JOIN subscriptions s ON i.subscription_id = s.id
        LEFT JOIN billing_plans bp ON s.plan_id = bp.id
        WHERE i.user_id = $1
        ORDER BY i.created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limitNum, offset]);

      // Get total count
      const countResult = await this.dbService.query(`
        SELECT COUNT(*) FROM invoices WHERE user_id = $1
      `, [userId]);
      const total = parseInt(countResult.rows[0].count);

      const response: InvoicesResponse = {
        success: true,
        data: result.rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      };

      res.json(response);
    } catch (error) {
      logger.error('Get invoices error:', error);
      ResponseService.error(res, 'Failed to fetch invoices');
    }
  }

  /**
   * Get single invoice
   */
  async getInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        SELECT i.*, bp.name as plan_name, s.current_period_start, s.current_period_end
        FROM invoices i
        LEFT JOIN subscriptions s ON i.subscription_id = s.id
        LEFT JOIN billing_plans bp ON s.plan_id = bp.id
        WHERE i.id = $1 AND i.user_id = $2
      `, [id, userId]);

      if (result.rows.length === 0) {
        ResponseService.notFound(res, 'Invoice not found');
        return;
      }

      const response: InvoiceResponse = {
        success: true,
        data: result.rows[0]
      };

      res.json(response);
    } catch (error) {
      logger.error('Get invoice error:', error);
      ResponseService.error(res, 'Failed to fetch invoice');
    }
  }

  /**
   * Get user's payment methods
   */
  async getPaymentMethods(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        SELECT id, type, last4, brand, expiry_month, expiry_year, is_default, created_at
        FROM payment_methods
        WHERE user_id = $1
        ORDER BY is_default DESC, created_at DESC
      `, [userId]);

      const response: PaymentMethodsResponse = {
        success: true,
        data: result.rows
      };

      res.json(response);
    } catch (error) {
      logger.error('Get payment methods error:', error);
      ResponseService.error(res, 'Failed to fetch payment methods');
    }
  }

  /**
   * Add payment method
   */
  async addPaymentMethod(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { type, token, is_default } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      if (!type || !token) {
        ResponseService.error(res, 'Payment method type and token are required', 400);
        return;
      }

      // TODO: Integrate with payment processor (Stripe, PayPal, etc.)
      // This is a placeholder for payment method creation

      // If setting as default, unset other default methods
      if (is_default) {
        await this.dbService.query(`
          UPDATE payment_methods
          SET is_default = false
          WHERE user_id = $1
        `, [userId]);
      }

      const result = await this.dbService.query(`
        INSERT INTO payment_methods (
          user_id, type, token, last4, brand, expiry_month, expiry_year, is_default, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        RETURNING id, type, last4, brand, expiry_month, expiry_year, is_default, created_at
      `, [userId, type, token, '4242', 'visa', 12, 2025, is_default || false]);

      const response: PaymentMethodResponse = {
        success: true,
        data: result.rows[0]
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Add payment method error:', error);
      ResponseService.error(res, 'Failed to add payment method');
    }
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        DELETE FROM payment_methods
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `, [id, userId]);

      if (result.rows.length === 0) {
        ResponseService.notFound(res, 'Payment method not found');
        return;
      }

      res.json({
        success: true,
        message: 'Payment method deleted successfully'
      });
    } catch (error) {
      logger.error('Delete payment method error:', error);
      ResponseService.error(res, 'Failed to delete payment method');
    }
  }

  /**
   * Validate coupon code
   */
  async validateCoupon(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { code } = req.params;

      if (!code) {
        ResponseService.error(res, 'Coupon code is required', 400);
        return;
      }

      const result = await this.dbService.query(`
        SELECT id, code, description, discount_type, discount_value,
               max_uses, used_count, valid_from, valid_until, active
        FROM coupons
        WHERE code = $1 AND active = true
          AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)
          AND (max_uses IS NULL OR used_count < max_uses)
      `, [code]);

      if (result.rows.length === 0) {
        ResponseService.notFound(res, 'Invalid or expired coupon code');
        return;
      }

      const response: CouponResponse = {
        success: true,
        data: result.rows[0]
      };

      res.json(response);
    } catch (error) {
      logger.error('Validate coupon error:', error);
      ResponseService.error(res, 'Failed to validate coupon');
    }
  }

  /**
   * Get current usage statistics
   */
  async getUsage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      // Get current subscription limits
      const subscriptionResult = await this.dbService.query(`
        SELECT bp.features
        FROM subscriptions s
        JOIN billing_plans bp ON s.plan_id = bp.id
        WHERE s.user_id = $1 AND s.status = 'active'
        LIMIT 1
      `, [userId]);

      const planFeatures = subscriptionResult.rows[0]?.features || {};

      // Get current usage counts
      const usageQueries = {
        jobsPosted: 'SELECT COUNT(*) FROM jobs WHERE created_by = $1 AND created_at >= CURRENT_DATE - INTERVAL \'30 days\'',
        applicationsReceived: `
          SELECT COUNT(*) FROM applications a
          JOIN jobs j ON a.job_id = j.id
          WHERE j.created_by = $1 AND a.created_at >= CURRENT_DATE - INTERVAL '30 days'
        `,
        aiAnalyses: 'SELECT COUNT(*) FROM ai_analysis WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL \'30 days\''
      };

      const usage: { [key: string]: number } = {};
      for (const [key, query] of Object.entries(usageQueries)) {
        const result = await this.dbService.query(query, [userId]);
        usage[key] = parseInt(result.rows[0].count);
      }

      const response: UsageResponse = {
        success: true,
        data: {
          limits: planFeatures,
          current: usage as UsageStats['current']
        }
      };

      res.json(response);
    } catch (error) {
      logger.error('Get usage error:', error);
      ResponseService.error(res, 'Failed to fetch usage statistics');
    }
  }

  /**
   * Create billing plan (Admin only)
   */
  async createPlan(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userType = req.user?.user_type;

      if (userType !== 'system_admin') {
        ResponseService.forbidden(res, 'Admin access required');
        return;
      }

      const { name, description, price, currency, interval, features } = req.body;

      if (!name || !price || !currency || !interval) {
        ResponseService.error(res, 'Name, price, currency, and interval are required', 400);
        return;
      }

      const result = await this.dbService.query(`
        INSERT INTO billing_plans (name, description, price, currency, interval, features, active, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_TIMESTAMP)
        RETURNING *
      `, [name, description, price, currency, interval, JSON.stringify(features || [])]);

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Create billing plan error:', error);
      ResponseService.error(res, 'Failed to create billing plan');
    }
  }

  /**
   * Get billing statistics (Admin only)
   */
  async getBillingStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userType = req.user?.user_type;

      if (userType !== 'system_admin') {
        ResponseService.forbidden(res, 'Admin access required');
        return;
      }

      const queries = {
        totalRevenue: 'SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE status = \'paid\'',
        activeSubscriptions: 'SELECT COUNT(*) as count FROM subscriptions WHERE status = \'active\'',
        monthlyRecurringRevenue: `
          SELECT COALESCE(SUM(bp.price), 0) as total
          FROM subscriptions s
          JOIN billing_plans bp ON s.plan_id = bp.id
          WHERE s.status = 'active'AND bp.interval = 'month'
        `,
        planDistribution: `
          SELECT bp.name, COUNT(s.id) as count
          FROM subscriptions s
          JOIN billing_plans bp ON s.plan_id = bp.id
          WHERE s.status = 'active'
          GROUP BY bp.name
        `
      };

      const results: Partial<BillingStats> = {};
      for (const [key, query] of Object.entries(queries)) {
        const result = await this.dbService.query(query);
        (results as any)[key] = key === 'planDistribution'? result.rows : result.rows[0];
      }

      const response: BillingStatsResponse = {
        success: true,
        data: results as BillingStats
      };

      res.json(response);
    } catch (error) {
      logger.error('Get billing stats error:', error);
      ResponseService.error(res, 'Failed to fetch billing statistics');
    }
  }
}

export default new BillingController();
