import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';  // .ts -> .js
import BaseController from './base.controller.js';  // .ts -> .js
import DatabaseService from '../services/database.service.js';  // .ts -> .js
import ResponseService from '../services/response.service.js';  // .ts -> .js
import { logger } from '../config/logger.js';  // .ts -> .js
import { Notification, NotificationPreferences } from '../models/index.js';  // .ts -> .js

// Database-specific types that match actual schema
interface DatabaseNotification {
  id?: number; // Database uses number
  user_id: number; // Database uses number
  type_id: number; // Different field structure
  title: string;
  message: string; // Different field name
  data?: any; // Keep as any for flexibility
  read: boolean; // Different status representation
  read_at?: Date;
  created_at?: Date;
  type_name?: string; // Joined field
  type_description?: string; // Joined field
}

interface NotificationType {
  id?: number;
  name: string;
  description: string;
  created_at?: Date;
}

// Database-specific NotificationPreference type
interface DatabaseNotificationPreference {
  id?: number; // Additional field
  user_id: number; // Database uses number
  type_id: number; // Different structure
  email_enabled: boolean; // Different structure
  push_enabled: boolean; // Different structure
  sms_enabled: boolean; // Different structure
  created_at?: Date;
  updated_at?: Date;
  type_name?: string; // Joined field
  type_description?: string; // Joined field
}

interface NotificationStats {
  totalNotifications: number;
  unreadNotifications: number;
  notificationsByType: Array<{ name: string; count: number }>;
  notificationsLast30Days: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface NotificationsResponse {
  success: boolean;
  data: DatabaseNotification[];
  pagination: PaginationInfo;
}

interface NotificationResponse {
  success: boolean;
  data: DatabaseNotification;
}

interface PreferencesResponse {
  success: boolean;
  data: DatabaseNotificationPreference[];
}

interface StatsResponse {
  success: boolean;
  data: NotificationStats;
}

interface UpdatePreferenceData {
  type_id: number;
  email_enabled: boolean;
  push_enabled: boolean;
  sms_enabled: boolean;
}

export class NotificationController extends BaseController {
  private dbService: typeof DatabaseService;

  constructor() {
    super('notification');
    this.dbService = DatabaseService;
  }

  /**
   * Get user notifications
   */
  async getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 20, type, read } = req.query;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      let query = `
        SELECT n.*, nt.name as type_name, nt.description as type_description
        FROM notifications n
        JOIN notification_types nt ON n.type_id = nt.id
        WHERE n.user_id = $1
      `;
      const params: any[] = [userId];
      let paramIndex = 2;

      if (type) {
        query += ` AND nt.name = $${paramIndex}`;
        params.push(type);
        paramIndex++;
      }

      if (read !== undefined) {
        query += ` AND n.read = $${paramIndex}`;
        params.push(read === 'true');
        paramIndex++;
      }

      query += ` ORDER BY n.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limitNum, offset);

      const result = await this.dbService.query(query, params);

      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) FROM notifications WHERE user_id = $1';
      const countParams: any[] = [userId];
      let countParamIndex = 2;

      if (type) {
        countQuery += ` AND type_id IN (SELECT id FROM notification_types WHERE name = $${countParamIndex})`;
        countParams.push(type);
        countParamIndex++;
      }

      if (read !== undefined) {
        countQuery += ` AND read = $${countParamIndex}`;
        countParams.push(read === 'true');
        countParamIndex++;
      }

      const countResult = await this.dbService.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      const response: NotificationsResponse = {
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
      logger.error('Get notifications error:', error);
      ResponseService.error(res, 'Failed to fetch notifications');
    }
  }

  /**
   * Get single notification
   */
  async getNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        SELECT n.*, nt.name as type_name, nt.description as type_description
        FROM notifications n
        JOIN notification_types nt ON n.type_id = nt.id
        WHERE n.id = $1 AND n.user_id = $2
      `, [id, userId]);

      if (result.rows.length === 0) {
        ResponseService.notFound(res, 'Notification not found');
        return;
      }

      const response: NotificationResponse = {
        success: true,
        data: result.rows[0]
      };

      res.json(response);
    } catch (error) {
      logger.error('Get notification error:', error);
      ResponseService.error(res, 'Failed to fetch notifications');
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        UPDATE notifications
        SET read = true, read_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `, [id, userId]);

      if (result.rows.length === 0) {
        ResponseService.notFound(res, 'Notification not found');
        return;
      }

      const response: NotificationResponse = {
        success: true,
        data: result.rows[0]
      };

      res.json(response);
    } catch (error) {
      logger.error('Mark notification as read error:', error);
      ResponseService.error(res, 'Failed to fetch notifications');
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      await this.dbService.query(`
        UPDATE notifications
        SET read = true, read_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND read = false
      `, [userId]);

      res.json({
        success: true,
        message: 'All notifications marked as read'
      });
    } catch (error) {
      logger.error('Mark all notifications as read error:', error);
      ResponseService.error(res, 'Failed to fetch notifications');
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        DELETE FROM notifications
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `, [id, userId]);

      if (result.rows.length === 0) {
        ResponseService.notFound(res, 'Notification not found');
        return;
      }

      res.json({
        success: true,
        message: 'Notification deleted successfully'
      });
    } catch (error) {
      logger.error('Delete notification error:', error);
      ResponseService.error(res, 'Failed to fetch notifications');
    }
  }

  /**
   * Get notification preferences
   */
  async getPreferences(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      const result = await this.dbService.query(`
        SELECT np.*, nt.name as type_name, nt.description as type_description
        FROM notification_preferences np
        JOIN notification_types nt ON np.type_id = nt.id
        WHERE np.user_id = $1
        ORDER BY nt.name
      `, [userId]);

      const response: PreferencesResponse = {
        success: true,
        data: result.rows
      };

      res.json(response);
    } catch (error) {
      logger.error('Get notification preferences error:', error);
      ResponseService.error(res, 'Failed to fetch notifications');
    }
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(req: AuthenticatedRequest, res: Response): Promise<void> {
    const client = await this.dbService.getClient();

    try {
      await client.query('BEGIN');
      const userId = req.user?.id;
      const { preferences } = req.body;

      if (!userId) {
        ResponseService.unauthorized(res, 'User not authenticated');
        return;
      }

      if (!preferences || !Array.isArray(preferences)) {
        ResponseService.error(res, 'Preferences array is required', 400);
        return;
      }

      // Update each preference
      for (const pref of preferences as UpdatePreferenceData[]) {
        await client.query(`
          UPDATE notification_preferences
          SET email_enabled = $1, push_enabled = $2, sms_enabled = $3, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $4 AND type_id = $5
        `, [pref.email_enabled, pref.push_enabled, pref.sms_enabled, userId, pref.type_id]);
      }

      await client.query('COMMIT');

      // Return updated preferences
      const result = await client.query(`
        SELECT np.*, nt.name as type_name, nt.description as type_description
        FROM notification_preferences np
        JOIN notification_types nt ON np.type_id = nt.id
        WHERE np.user_id = $1
        ORDER BY nt.name
      `, [userId]);

      const response: PreferencesResponse = {
        success: true,
        data: result.rows
      };

      res.json(response);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Update notification preferences error:', error);
      ResponseService.error(res, 'Failed to fetch notifications');
    } finally {
      client.release();
    }
  }

  /**
   * Send notification (Admin only)
   */
  async sendNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userType = req.user?.user_type;

      if (userType !== 'system_admin') {
        ResponseService.forbidden(res, 'Admin access required');
        return;
      }

      const { user_id, type_id, title, message, data } = req.body;

      if (!user_id || !type_id || !title || !message) {
        ResponseService.error(res, 'User ID, type ID, title, and message are required', 400);
        return;
      }

      // Insert notification
      const result = await this.dbService.query(`
        INSERT INTO notifications (user_id, type_id, title, message, data, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        RETURNING *
      `, [user_id, type_id, title, message, data || {}]);

      // TODO: Send email/SMS/push notification based on user preferences

      const response: NotificationResponse = {
        success: true,
        data: result.rows[0]
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Send notification error:', error);
      ResponseService.error(res, 'Failed to fetch notifications');
    }
  }

  /**
   * Get notification statistics
   */
  async getStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userType = req.user?.user_type;

      if (userType !== 'system_admin') {
        ResponseService.forbidden(res, 'Admin access required');
        return;
      }

      const queries = {
        totalNotifications: 'SELECT COUNT(*) as count FROM notifications',
        unreadNotifications: 'SELECT COUNT(*) as count FROM notifications WHERE read = false',
        notificationsByType: `
          SELECT nt.name, COUNT(n.id) as count
          FROM notifications n
          JOIN notification_types nt ON n.type_id = nt.id
          GROUP BY nt.name
        `,
        notificationsLast30Days: `
          SELECT COUNT(*) as count
          FROM notifications
          WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        `
      };

      const results: Partial<NotificationStats> = {};
      for (const [key, query] of Object.entries(queries)) {
        const result = await this.dbService.query(query);
        (results as any)[key] = key === 'notificationsByType'? result.rows : result.rows[0].count;
      }

      const response: StatsResponse = {
        success: true,
        data: results as NotificationStats
      };

      res.json(response);
    } catch (error) {
      logger.error('Get notification stats error:', error);
      ResponseService.error(res, 'Failed to fetch notifications');
    }
  }

  /**
   * Helper method to create notification
   */
  async createNotification(userId: number, typeId: number, title: string, message: string, data: any = {}): Promise<DatabaseNotification> {
    try {
      const result = await this.dbService.query(`
        INSERT INTO notifications (user_id, type_id, title, message, data, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        RETURNING *
      `, [userId, typeId, title, message, data]);

      // TODO: Trigger real-time notification via Socket.io
      // TODO: Send email/SMS based on user preferences

      return result.rows[0];
    } catch (error) {
      logger.error('Create notification error:', error);
      throw error;
    }
  }

  /**
   * Helper method to get notification type ID by name
   */
  async getNotificationTypeId(typeName: string): Promise<number | undefined> {
    try {
      const result = await this.dbService.query('SELECT id FROM notification_types WHERE name = $1', [typeName]);
      return result.rows[0]?.id;
    } catch (error) {
      logger.error('Get notification type ID error:', error);
      throw error;
    }
  }
}

export default new NotificationController();
