import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';  // .ts -> .js
import BaseController from './base.controller.js';  // .ts -> .js
import DatabaseService from '../services/database.service.js';  // .ts -> .js
import ResponseService from '../services/response.service.js';  // .ts -> .js
import { logger } from '../config/logger.js';  // .ts -> .js
import * as crypto from 'crypto';

interface ApiKey {
  id?: number;
  user_id: number;
  name: string;
  description?: string;
  key_hash: string;
  permissions: string[];
  revoked: boolean;
  created_at?: Date;
  last_used_at?: Date;
  usage_count: number;
  revoked_at?: Date;
}

interface Webhook {
  id?: number;
  user_id: number;
  url: string;
  events: string[];
  secret: string;
  description?: string;
  active: boolean;
  created_at?: Date;
  updated_at?: Date;
  last_triggered_at?: Date;
  failure_count: number;
}

interface IntegrationLog {
  id?: number;
  user_id: number;
  type: string;
  status: 'success' | 'error' | 'warning';
  details: any;
  api_key_id?: number;
  webhook_id?: number;
  created_at?: Date;
  api_key_name?: string;
  webhook_url?: string;
}

interface OAuthIntegration {
  id?: number;
  user_id: number;
  provider: string;
  access_token: string;
  refresh_token?: string;
  expires_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface ApiKeysResponse {
  success: boolean;
  data: ApiKey[];
}

interface CreateApiKeyResponse {
  success: boolean;
  data: ApiKey & { api_key: string };
}

interface WebhooksResponse {
  success: boolean;
  data: Webhook[];
}

interface CreateWebhookResponse {
  success: boolean;
  data: Webhook & { secret: string };
}

interface UpdateWebhookResponse {
  success: boolean;
  data: Webhook;
}

interface LogsResponse {
  success: boolean;
  data: IntegrationLog[];
  pagination: PaginationInfo;
}

interface OAuthResponse {
  success: boolean;
  data: OAuthIntegration;
}

interface OAuthIntegrationsResponse {
  success: boolean;
  data: OAuthIntegration[];
}

export class IntegrationController extends BaseController {
  private dbService: typeof DatabaseService;

  constructor() {
    super('integration');
    this.dbService = DatabaseService;
  }

  /**
   * Get user's API keys
   */
  async getApiKeys(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        SELECT id, name, description, permissions, created_at, last_used_at, usage_count
        FROM api_keys
        WHERE user_id = $1 AND revoked = false
        ORDER BY created_at DESC
      `, [userId]);

      const response: ApiKeysResponse = {
        success: true,
        data: result.rows
      };

      res.json(response);
    } catch (error) {
      logger.error('Get API keys error:', error);
      ResponseService.error(res, 'Failed to fetch API keys');
    }
  }

  /**
   * Create new API key
   */
  async createApiKey(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { name, description, permissions } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      if (!name) {
        ResponseService.error(res, 'API key name is required', 400);
        return;
      }

      // Generate API key
      const apiKey = crypto.randomBytes(32).toString('hex');
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      const result = await this.dbService.query(`
        INSERT INTO api_keys (user_id, name, description, key_hash, permissions, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        RETURNING id, name, description, permissions, created_at
      `, [userId, name, description, keyHash, JSON.stringify(permissions || [])]);

      const response: CreateApiKeyResponse = {
        success: true,
        data: {
          ...result.rows[0],
          api_key: apiKey // Only show the actual key once during creation
        }
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Create API key error:', error);
      ResponseService.error(res, 'Failed to create API key');
    }
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        UPDATE api_keys
        SET revoked = true, revoked_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2 AND revoked = false
        RETURNING *
      `, [id, userId]);

      if (result.rows.length === 0) {
        ResponseService.notFound(res, 'API key not found');
        return;
      }

      res.json({
        success: true,
        message: 'API key revoked successfully'
      });
    } catch (error) {
      logger.error('Revoke API key error:', error);
      ResponseService.error(res, 'Failed to revoke API key');
    }
  }

  /**
   * Get user's webhooks
   */
  async getWebhooks(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        SELECT id, url, events, secret, active, created_at, last_triggered_at, failure_count
        FROM webhooks
        WHERE user_id = $1
        ORDER BY created_at DESC
      `, [userId]);

      const response: WebhooksResponse = {
        success: true,
        data: result.rows
      };

      res.json(response);
    } catch (error) {
      logger.error('Get webhooks error:', error);
      ResponseService.error(res, 'Failed to fetch API keys');
    }
  }

  /**
   * Create webhook
   */
  async createWebhook(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { url, events, description } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      if (!url || !events || !Array.isArray(events)) {
        ResponseService.error(res, 'URL and events array are required', 400);
        return;
      }

      // Generate webhook secret
      const secret = crypto.randomBytes(32).toString('hex');

      const result = await this.dbService.query(`
        INSERT INTO webhooks (user_id, url, events, secret, description, active, created_at)
        VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
        RETURNING id, url, events, description, active, created_at
      `, [userId, url, JSON.stringify(events), secret, description]);

      const response: CreateWebhookResponse = {
        success: true,
        data: {
          ...result.rows[0],
          secret // Only show secret once during creation
        }
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Create webhook error:', error);
      ResponseService.error(res, 'Failed to fetch API keys');
    }
  }

  /**
   * Update webhook
   */
  async updateWebhook(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { url, events, active, description } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        UPDATE webhooks
        SET url = $1, events = $2, active = $3, description = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $5 AND user_id = $6
        RETURNING id, url, events, description, active, updated_at
      `, [url, JSON.stringify(events || []), active, description, id, userId]);

      if (result.rows.length === 0) {
        ResponseService.notFound(res, 'Webhook not found');
        return;
      }

      const response: UpdateWebhookResponse = {
        success: true,
        data: result.rows[0]
      };

      res.json(response);
    } catch (error) {
      logger.error('Update webhook error:', error);
      ResponseService.error(res, 'Failed to fetch API keys');
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        DELETE FROM webhooks
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `, [id, userId]);

      if (result.rows.length === 0) {
        ResponseService.notFound(res, 'Webhook not found');
        return;
      }

      res.json({
        success: true,
        message: 'Webhook deleted successfully'
      });
    } catch (error) {
      logger.error('Delete webhook error:', error);
      ResponseService.error(res, 'Failed to fetch API keys');
    }
  }

  /**
   * Get integration logs
   */
  async getLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 50, type, status } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      let query = `
        SELECT il.*, COALESCE(ak.name, 'System') as api_key_name, w.url as webhook_url
        FROM integration_logs il
        LEFT JOIN api_keys ak ON il.api_key_id = ak.id
        LEFT JOIN webhooks w ON il.webhook_id = w.id
        WHERE il.user_id = $1
      `;
      const params: any[] = [userId];
      let paramIndex = 2;

      if (type) {
        query += ` AND il.type = $${paramIndex}`;
        params.push(type);
        paramIndex++;
      }

      if (status) {
        query += ` AND il.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY il.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limitNum, offset);

      const result = await this.dbService.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM integration_logs WHERE user_id = $1';
      const countParams: any[] = [userId];
      let countParamIndex = 2;

      if (type) {
        countQuery += ` AND type = $${countParamIndex}`;
        countParams.push(type);
        countParamIndex++;
      }

      if (status) {
        countQuery += ` AND status = $${countParamIndex}`;
        countParams.push(status);
        countParamIndex++;
      }

      const countResult = await this.dbService.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      const response: LogsResponse = {
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
      logger.error('Get integration logs error:', error);
      ResponseService.error(res, 'Failed to fetch API keys');
    }
  }

  /**
   * Connect OAuth integration
   */
  async connectOAuth(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { provider, code, state } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      if (!provider) {
        ResponseService.error(res, 'OAuth provider is required', 400);
        return;
      }

      // TODO: Implement OAuth flow for different providers (LinkedIn, GitHub, etc.)
      // This is a placeholder for the OAuth connection logic

      const result = await this.dbService.query(`
        INSERT INTO oauth_integrations (user_id, provider, access_token, refresh_token, expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, provider) DO UPDATE SET
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [userId, provider, 'placeholder_token', 'placeholder_refresh', new Date(Date.now() + 3600000)]);

      const response: OAuthResponse = {
        success: true,
        data: result.rows[0]
      };

      res.json(response);
    } catch (error) {
      logger.error('Connect OAuth error:', error);
      ResponseService.error(res, 'Failed to fetch API keys');
    }
  }

  /**
   * Disconnect OAuth integration
   */
  async disconnectOAuth(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { provider } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        DELETE FROM oauth_integrations
        WHERE user_id = $1 AND provider = $2
        RETURNING *
      `, [userId, provider]);

      if (result.rows.length === 0) {
        ResponseService.notFound(res, 'OAuth integration not found');
        return;
      }

      res.json({
        success: true,
        message: `${provider} integration disconnected successfully`
      });
    } catch (error) {
      logger.error('Disconnect OAuth error:', error);
      ResponseService.error(res, 'Failed to fetch API keys');
    }
  }

  /**
   * Get connected OAuth integrations
   */
  async getOAuthIntegrations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        SELECT provider, created_at, updated_at, expires_at
        FROM oauth_integrations
        WHERE user_id = $1
        ORDER BY created_at DESC
      `, [userId]);

      const response: OAuthIntegrationsResponse = {
        success: true,
        data: result.rows
      };

      res.json(response);
    } catch (error) {
      logger.error('Get OAuth integrations error:', error);
      ResponseService.error(res, 'Failed to fetch API keys');
    }
  }

  /**
   * Helper method to log integration activity
   */
  async logActivity(userId: number, type: string, status: 'success' | 'error' | 'warning', details: any = {}, apiKeyId?: number, webhookId?: number): Promise<void> {
    try {
      await this.dbService.query(`
        INSERT INTO integration_logs (user_id, type, status, details, api_key_id, webhook_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      `, [userId, type, status, JSON.stringify(details), apiKeyId, webhookId]);
    } catch (error) {
      logger.error('Log integration activity error:', error);
    }
  }

  /**
   * Helper method to validate API key
   */
  async validateApiKey(apiKey: string): Promise<{ user_id: number; permissions: string[] } | null> {
    try {
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      const result = await this.dbService.query(`
        UPDATE api_keys
        SET last_used_at = CURRENT_TIMESTAMP, usage_count = usage_count + 1
        WHERE key_hash = $1 AND revoked = false
        RETURNING user_id, permissions
      `, [keyHash]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Validate API key error:', error);
      return null;
    }
  }

  /**
   * Helper method to trigger webhook
   */
  async triggerWebhook(webhookId: number, event: string, data: any): Promise<void> {
    try {
      const webhook = await this.dbService.query(`
        SELECT url, secret, events
        FROM webhooks
        WHERE id = $1 AND active = true
      `, [webhookId]);

      if (webhook.rows.length === 0) {
        return;
      }

      const { url, secret, events } = webhook.rows[0];

      // Check if webhook is subscribed to this event
      if (!events.includes(event)) {
        return;
      }

      // TODO: Implement actual webhook triggering with signature verification
      // This is a placeholder for webhook triggering logic

      await this.dbService.query(`
        UPDATE webhooks
        SET last_triggered_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [webhookId]);

    } catch (error) {
      logger.error('Trigger webhook error:', error);
      // Increment failure count
      await this.dbService.query(`
        UPDATE webhooks
        SET failure_count = failure_count + 1
        WHERE id = $1
      `, [webhookId]);
    }
  }
}

export default new IntegrationController();
