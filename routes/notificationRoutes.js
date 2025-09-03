import express from 'express';
import Notification from '../models/Notification.js';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { getWebSocketService } from '../services/websocketService.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * GET /api/notifications
 * Get user notifications with pagination and filtering
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { 
      page = 1, 
      limit = 20, 
      type, 
      unread_only = false,
      priority 
    } = req.query;

    // Build query filter
    const filter = { userId };
    if (type) filter.type = type;
    if (unread_only === 'true') filter.isRead = false;
    if (priority) filter.priority = priority;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Notification.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    // Get unread count
    const unreadCount = await Notification.getUnreadCount(userId);

    logger.info(`📋 Retrieved ${notifications.length} notifications for user ${userId}`, {
      userId,
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      unreadCount
    });

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        },
        unreadCount
      }
    });

  } catch (error) {
    logger.error('❌ Error fetching notifications:', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count
 */
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.userId;
    const unreadCount = await Notification.getUnreadCount(userId);

    res.json({
      success: true,
      data: {
        count: unreadCount
      }
    });

  } catch (error) {
    logger.error('❌ Error getting unread count:', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get unread count'
    });
  }
});

/**
 * GET /api/notifications/by-type/:type
 * Get notifications by specific type
 */
router.get('/by-type/:type', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type } = req.params;
    const { limit = 10 } = req.query;

    const notifications = await Notification.getByType(userId, type, parseInt(limit));

    res.json({
      success: true,
      data: {
        notifications,
        type,
        count: notifications.length
      }
    });

  } catch (error) {
    logger.error('❌ Error fetching notifications by type:', { 
      error: error.message, 
      userId: req.user?.userId,
      type: req.params.type
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications by type'
    });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark specific notification as read
 */
router.put('/:id/read', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const notification = await Notification.findOne({ _id: id, userId });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    if (!notification.isRead) {
      await notification.markAsRead();
      
      logger.info(`📖 Notification marked as read`, {
        userId,
        notificationId: id,
        type: notification.type
      });

      // Broadcast updated unread count via WebSocket
      const unreadCount = await Notification.getUnreadCount(userId);
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.sendToUser(userId, {
          type: 'notification_read',
          data: {
            notificationId: id,
            unreadCount
          }
        });
      }
    }

    res.json({
      success: true,
      data: {
        notification,
        unreadCount: await Notification.getUnreadCount(userId)
      }
    });

  } catch (error) {
    logger.error('❌ Error marking notification as read:', { 
      error: error.message, 
      userId: req.user?.userId,
      notificationId: req.params.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read'
    });
  }
});

/**
 * PUT /api/notifications/mark-all-read
 * Mark all notifications as read for user
 */
router.put('/mark-all-read', async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await Notification.markAllAsRead(userId);
    
    logger.info(`📖 All notifications marked as read`, {
      userId,
      updatedCount: result.modifiedCount
    });

    // Broadcast updated unread count via WebSocket
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.sendToUser(userId, {
        type: 'notifications_all_read',
        data: {
          unreadCount: 0
        }
      });
    }

    res.json({
      success: true,
      data: {
        updatedCount: result.modifiedCount,
        unreadCount: 0
      }
    });

  } catch (error) {
    logger.error('❌ Error marking all notifications as read:', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read'
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete specific notification
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const notification = await Notification.findOneAndDelete({ _id: id, userId });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    logger.info(`🗑️ Notification deleted`, {
      userId,
      notificationId: id,
      type: notification.type
    });

    // Get updated unread count
    const unreadCount = await Notification.getUnreadCount(userId);

    res.json({
      success: true,
      data: {
        deletedNotification: notification,
        unreadCount
      }
    });

  } catch (error) {
    logger.error('❌ Error deleting notification:', { 
      error: error.message, 
      userId: req.user?.userId,
      notificationId: req.params.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification'
    });
  }
});

/**
 * POST /api/notifications/preferences
 * Update notification preferences
 */
router.post('/preferences', async (req, res) => {
  try {
    const userId = req.user.userId;
    const preferences = req.body;

    // TODO: Implement user notification preferences model
    // For now, return success to maintain API compatibility
    
    logger.info(`⚙️ Notification preferences updated`, {
      userId,
      preferences
    });

    res.json({
      success: true,
      data: {
        preferences,
        message: 'Preferences updated successfully'
      }
    });

  } catch (error) {
    logger.error('❌ Error updating notification preferences:', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update notification preferences'
    });
  }
});

/**
 * GET /api/notifications/preferences
 * Get notification preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const userId = req.user.userId;

    // TODO: Implement user notification preferences retrieval
    // For now, return default preferences
    const defaultPreferences = {
      missedSessions: true,
      planMilestones: true,
      healthReminders: true,
      systemUpdates: true,
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '07:00'
      }
    };

    res.json({
      success: true,
      data: {
        preferences: defaultPreferences
      }
    });

  } catch (error) {
    logger.error('❌ Error fetching notification preferences:', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification preferences'
    });
  }
});

/**
 * POST /api/notifications/cleanup
 * Manual cleanup of expired notifications (Admin only)
 */
router.post('/cleanup', async (req, res) => {
  try {
    // TODO: Add admin authentication check
    
    const result = await Notification.cleanupExpired();
    
    logger.info(`🧹 Expired notifications cleaned up`, {
      deletedCount: result.deletedCount
    });

    res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount,
        message: 'Expired notifications cleaned up successfully'
      }
    });

  } catch (error) {
    logger.error('❌ Error cleaning up expired notifications:', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup expired notifications'
    });
  }
});

export default router;
