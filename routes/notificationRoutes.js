import express from 'express';
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import NotificationService from '../services/notificationService.js';
import authenticateToken from '../middleware/authenticateToken.js';
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
      unreadOnly = false,
      priority 
    } = req.query;

    // Build query filter
    const filter = { userId };
    if (type && type !== 'all') filter.type = type;
    if (unreadOnly === 'true') filter.isRead = false;
    if (priority) filter.priority = priority;

    // Add expiration filter
    filter.$or = [
      { expiresAt: { $gt: new Date() } },
      { expiresAt: null }
    ];

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

    // **ENHANCED**: Add timeAgo to each notification for frontend
    const notificationsWithTimeAgo = notifications.map(notification => ({
      ...notification,
      timeAgo: getTimeAgo(notification.createdAt)
    }));

    logger.info(` Retrieved ${notifications.length} notifications for user ${userId}`, {
      userId,
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      unreadCount
    });

    res.json({
      success: true,
      data: {
        notifications: notificationsWithTimeAgo,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount: total,
          hasMore: total > page * limit
        },
        unreadCount
      }
    });

  } catch (error) {
    logger.error(' Error fetching notifications:', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
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
    logger.error(' Error getting unread count:', { 
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
    logger.error(' Error fetching notifications by type:', { 
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
router.patch('/:id/read', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const notification = await Notification.findOne({ _id: id, userId });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    if (!notification.isRead) {
      await notification.markAsRead();
      
      logger.info(`📖 Notification marked as read`, {
        userId,
        notificationId: id,
        type: notification.type
      });

      // **REAL-TIME**: Broadcast updated unread count via WebSocket
      const unreadCount = await Notification.getUnreadCount(userId);
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.sendToUser(userId, {
          type: 'notification_read',
          notificationId: id,
          unreadCount,
          timestamp: new Date().toISOString()
        });
      }
    }

    res.json({
      success: true,
      data: { 
        notification: {
          ...notification.toJSON(),
          timeAgo: getTimeAgo(notification.createdAt)
        }
      }
    });

  } catch (error) {
    logger.error(' Error marking notification as read:', { 
      error: error.message, 
      userId: req.user?.userId,
      notificationId: req.params.id
    });
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
});

/**
 * PUT /api/notifications/mark-all-read
 * Mark all notifications as read for user
 */
router.patch('/read-all', async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await Notification.markAllAsRead(userId);
    
    logger.info(`📖 All notifications marked as read`, {
      userId,
      updatedCount: result.modifiedCount
    });

    // **REAL-TIME**: Broadcast updated unread count via WebSocket
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.sendToUser(userId, {
        type: 'all_notifications_read',
        unreadCount: 0,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });

  } catch (error) {
    logger.error(' Error marking all notifications as read:', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read'
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

    logger.info(`Notification deleted`, {
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
    logger.error(' Error deleting notification:', { 
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
    
    logger.info(` Notification preferences updated`, {
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
    logger.error(' Error updating notification preferences:', { 
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
    logger.error(' Error fetching notification preferences:', { 
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
    
    logger.info(` Expired notifications cleaned up`, {
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
    logger.error(' Error cleaning up expired notifications:', { 
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup expired notifications'
    });
  }
});

/**
 * POST /api/notifications/test
 * Create test notification (for development)
 */
router.post('/test', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const notification = await NotificationService.createMissedSessionNotification(
      userId,
      {
        count: 1,
        sessions: [{ date: new Date() }],
        planAdjusted: false,
        consecutiveMissedDays: 1,
        suggestedAction: 'start_session'
      }
    );

    res.status(201).json({
      success: true,
      data: { notification },
      message: 'Test notification created and sent'
    });
  } catch (error) {
    logger.error(' Error creating test notification:', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    res.status(500).json({
      success: false,
      message: 'Failed to create test notification'
    });
  }
});

/**
 * POST /api/notifications/trigger-missed-check
 * Manually trigger missed session check for current user (IMMEDIATE)
 */
router.post('/trigger-missed-check', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Import the CyclingPlan model
    const CyclingPlan = mongoose.model('CyclingPlan');
    
    // Get user's active plan
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'No active plan found'
      });
    }

    // Calculate total missed sessions by checking past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let totalMissedCount = 0;
    for (const session of plan.dailySessions) {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      
      // If session is in the past and not completed
      if (sessionDate < today && session.status !== 'completed' && session.status !== 'done') {
        totalMissedCount++;
      }
    }

    // Create appropriate notification based on total missed count
    const notification = await NotificationService.createMissedSessionNotification(
      userId,
      {
        count: totalMissedCount,
        sessions: [],
        planAdjusted: totalMissedCount >= 7,
        consecutiveMissedDays: 0,
        totalMissedCount: totalMissedCount,
        suggestedAction: totalMissedCount >= 7 ? 'reset_plan' : 'redistribute'
      }
    );

    res.status(201).json({
      success: true,
      data: { 
        notification,
        totalMissedCount,
        notificationType: totalMissedCount >= 7 ? 'plan_reset_required' : 'missed_session'
      },
      message: `✅ Notification created for ${totalMissedCount} missed sessions`
    });
  } catch (error) {
    logger.error('❌ Error triggering missed check:', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    res.status(500).json({
      success: false,
      message: 'Failed to trigger missed session check'
    });
  }
});

// **NEW**: Helper function for timeAgo calculation
function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return `${diffMonths}mo ago`;
}

export default router;
