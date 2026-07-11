import express, { Router, Request, Response } from 'express';
import { query as vQuery, param, body } from 'express-validator';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { query as dbQuery } from '../../config/database.js';
import NotificationService from '../../services/notification.service.js';
import { logger } from '../../utils/logger.js';

const router: Router = express.Router();

// All routes require authentication
router.use(protect);

// @route   GET /api/v1/notifications
// @desc    Get the authenticated user's notifications (paginated, filterable)
// @access  Private
router.get('/', [
  vQuery('page').optional().isInt({ min: 1 }).toInt(),
  vQuery('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  vQuery('category').optional().isString().trim(),
  vQuery('read').optional().isIn(['true', 'false']),
  validateRequest,
], async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { page, limit, category } = req.query as any;
    const unreadOnly = (req.query.read as string) === 'false';

    const result = await NotificationService.list(userId, {
      page,
      limit,
      category: category || undefined,
      unreadOnly,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications'});
  }
});

// @route   GET /api/v1/notifications/unread-count
// @desc    Get the number of unread notifications
// @access  Private
router.get('/unread-count', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const count = await NotificationService.unreadCount(userId);
    res.json({ success: true, data: { count } });
  } catch (error) {
    logger.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch unread count'});
  }
});

// @route   GET /api/v1/notifications/preferences
// @desc    Get notification preferences
// @access  Private
router.get('/preferences', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const result = await dbQuery(
      'SELECT * FROM notification_preferences WHERE user_id = $1',
      [userId]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    logger.error('Error fetching notification preferences:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch preferences'});
  }
});

// @route   PUT /api/v1/notifications/preferences
// @desc    Update notification preferences
// @access  Private
router.put('/preferences', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { email, sms, push, in_app, quiet_hours } = req.body || {};

    const result = await dbQuery(
      `INSERT INTO notification_preferences (user_id, email, sms, push, in_app, quiet_hours)
       VALUES ($1,
               COALESCE($2, '{"application_updates": true, "simulation_reminders": true, "messages": true, "security": true, "billing": true, "promotional": false}'::jsonb),
               COALESCE($3, '{}'::jsonb), COALESCE($4, '{}'::jsonb), COALESCE($5, '{"all": true}'::jsonb), COALESCE($6, '{}'::jsonb))
       ON CONFLICT (user_id) DO UPDATE SET
         email = COALESCE($2, notification_preferences.email),
         sms = COALESCE($3, notification_preferences.sms),
         push = COALESCE($4, notification_preferences.push),
         in_app = COALESCE($5, notification_preferences.in_app),
         quiet_hours = COALESCE($6, notification_preferences.quiet_hours),
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        email ? JSON.stringify(email) : null,
        sms ? JSON.stringify(sms) : null,
        push ? JSON.stringify(push) : null,
        in_app ? JSON.stringify(in_app) : null,
        quiet_hours ? JSON.stringify(quiet_hours) : null,
      ]
    );

    res.json({ success: true, data: result.rows[0], message: 'Preferences updated'});
  } catch (error) {
    logger.error('Error updating notification preferences:', error);
    res.status(500).json({ success: false, message: 'Failed to update preferences'});
  }
});

// @route   GET /api/v1/notifications/stats
// @desc    Notification statistics (Admin only)
// @access  Private (System Admins)
router.get('/stats', [authorize('system_admin')], async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await dbQuery(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status <> 'read')::int AS unread,
              COUNT(*) FILTER (WHERE status = 'read')::int AS read
       FROM notifications`,
      []
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching notification stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats'});
  }
});

// @route   PUT /api/v1/notifications/mark-all-read
// @desc    Mark all of the user's notifications as read
// @access  Private
router.put('/mark-all-read', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const updated = await NotificationService.markAllRead(userId);
    res.json({ success: true, data: { updated } });
  } catch (error) {
    logger.error('Error marking all notifications read:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all as read'});
  }
});

// @route   PUT /api/v1/notifications/:id/read
// @desc    Mark a single notification as read
// @access  Private
router.put('/:id/read', [
  param('id').isUUID().withMessage('Invalid notification id'),
  validateRequest,
], async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const notification = await NotificationService.markRead(userId, String(req.params.id));
    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification not found'});
      return;
    }
    res.json({ success: true, data: notification });
  } catch (error) {
    logger.error('Error marking notification read:', error);
    res.status(500).json({ success: false, message: 'Failed to mark as read'});
  }
});

// @route   DELETE /api/v1/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete('/:id', [
  param('id').isUUID().withMessage('Invalid notification id'),
  validateRequest,
], async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const removed = await NotificationService.remove(userId, String(req.params.id));
    if (!removed) {
      res.status(404).json({ success: false, message: 'Notification not found'});
      return;
    }
    res.json({ success: true, message: 'Notification deleted'});
  } catch (error) {
    logger.error('Error deleting notification:', error);
    res.status(500).json({ success: false, message: 'Failed to delete notification'});
  }
});

// @route   POST /api/v1/notifications/send
// @desc    Send a notification to a user (Admin only)
// @access  Private (System Admins)
router.post('/send', [
  authorize('system_admin'),
  body('user_id').isUUID().withMessage('Valid user_id is required'),
  body('title').isString().trim().notEmpty().withMessage('Title is required'),
  body('content').optional().isString(),
  body('category').optional().isString(),
  body('data').optional().isObject(),
  validateRequest,
], async (req: Request, res: Response): Promise<void> => {
  try {
    const { user_id, title, content, category, data, type } = req.body;
    const notification = await NotificationService.create({
      userId: user_id,
      type: type || 'admin_message',
      category: category || 'system',
      title,
      content,
      data: data || {},
    });
    res.json({ success: true, data: notification });
  } catch (error) {
    logger.error('Error sending notification:', error);
    res.status(500).json({ success: false, message: 'Failed to send notification'});
  }
});

export default router;
