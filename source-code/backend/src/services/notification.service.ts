import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * NotificationService
 * --------------------
 * Persists in-app notifications to the `notifications` table and pushes them in
 * real time over Socket.IO (via the global `sendToUser` helper installed in
 * server.ts). Used to notify candidates AND recruiters/admins/mentors when
 * something happens in a simulation (new message, simulation started/expired,
 * task assigned, submission reviewed, feedback available, repo changes).
 */

export type NotificationCategory =
  | 'application'
  | 'simulation'
  | 'message'
  | 'security'
  | 'billing'
  | 'system'
  | 'promotional';

export interface CreateNotificationInput {
  userId: string;
  type: string;                 // e.g. 'chat_message', 'simulation_started'
  category?: NotificationCategory;
  title: string;
  content?: string;
  data?: Record<string, any>;   // e.g. { sessionId, simulationId, url }
  priority?: 'low'| 'normal'| 'high'| 'urgent';
}

const VALID_CATEGORIES: NotificationCategory[] = [
  'application', 'simulation', 'message', 'security', 'billing', 'system', 'promotional',
];

/**
 * Push a real-time event to a user. Prefers emitting to the `user:{id}` room
 * (every client joins it, whether it authenticated via handshake or via a
 * `join_user` event), and falls back to the direct socket helper.
 */
const pushToUser = (userId: string, event: string, payload: any): void => {
  try {
    const io = (global as any).io;
    if (io && typeof io.to === 'function') {
      io.to(`user:${userId}`).emit(event, payload);
      return;
    }
    const sendToUser = (global as any).sendToUser;
    if (typeof sendToUser === 'function') {
      sendToUser(userId, event, payload);
    }
  } catch (err) {
    logger.warn(`Failed to push '${event}'to user ${userId}: ${(err as Error).message}`);
  }
};

class NotificationService {
  /**
   * Create a single notification, persist it, and push it to the recipient.
   * Never throws   notification failures must not break the triggering action.
   */
  static async create(input: CreateNotificationInput): Promise<any | null> {
    const {
      userId,
      type,
      title,
      content = null,
      data = {},
      priority = 'normal',
    } = input;

    if (!userId || !type || !title) {
      logger.warn('NotificationService.create called with missing userId/type/title');
      return null;
    }

    const category: NotificationCategory =
      input.category && VALID_CATEGORIES.includes(input.category) ? input.category : 'system';

    try {
      const result = await query(
        `INSERT INTO notifications (user_id, type, category, title, content, data, priority, channels, status, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, ARRAY['in_app'], 'sent', NOW())
         RETURNING *`,
        [userId, type, category, title, content, JSON.stringify(data), priority]
      );

      const notification = result.rows[0];

      // Real-time push (best effort) + refreshed unread count.
      pushToUser(userId, 'notification', notification);
      const unread = await NotificationService.unreadCount(userId);
      pushToUser(userId, 'notification_unread_count', { count: unread });

      return notification;
    } catch (err) {
      logger.error(`NotificationService.create failed for user ${userId}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Create the same notification for many users (e.g. all recruiters on a job). */
  static async createForUsers(
    userIds: string[],
    input: Omit<CreateNotificationInput, 'userId'>
  ): Promise<void> {
    const unique = Array.from(new Set((userIds || []).filter(Boolean)));
    await Promise.all(unique.map((userId) => NotificationService.create({ ...input, userId })));
  }

  static async list(
    userId: string,
    opts: { page?: number; limit?: number; category?: string; unreadOnly?: boolean } = {}
  ): Promise<{ notifications: any[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = ['user_id = $1'];
    const params: any[] = [userId];

    if (opts.category) {
      params.push(opts.category);
      conditions.push(`category = $${params.length}`);
    }
    if (opts.unreadOnly) {
      conditions.push(`status <> 'read'`);
    }

    const where = conditions.join('AND ');

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM notifications WHERE ${where}`,
      params
    );

    const listResult = await query(
      `SELECT * FROM notifications
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return {
      notifications: listResult.rows,
      total: countResult.rows[0]?.total || 0,
      page,
      limit,
    };
  }

  static async unreadCount(userId: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND status <> 'read'`,
      [userId]
    );
    return result.rows[0]?.count || 0;
  }

  static async markRead(userId: string, id: string): Promise<any | null> {
    const result = await query(
      `UPDATE notifications
       SET status = 'read', read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    if (result.rows[0]) {
      const unread = await NotificationService.unreadCount(userId);
      pushToUser(userId, 'notification_unread_count', { count: unread });
    }
    return result.rows[0] || null;
  }

  static async markAllRead(userId: string): Promise<number> {
    const result = await query(
      `UPDATE notifications
       SET status = 'read', read_at = NOW()
       WHERE user_id = $1 AND status <> 'read'`,
      [userId]
    );
    pushToUser(userId, 'notification_unread_count', { count: 0 });
    return result.rowCount || 0;
  }

  static async remove(userId: string, id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return (result.rowCount || 0) > 0;
  }
}

export default NotificationService;
