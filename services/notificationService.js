import Notification from '../models/Notification.js';
import logger from '../utils/logger.js';
import { getWebSocketService } from '../services/websocketService.js';
import fcmService from './fcmService.js';

/**
 * Notification Service
 * Handles creation, management, and broadcasting of notifications
 */
class NotificationService {
  
  /**
   * Create a missed session notification
   * @param {string} userId - User ID
   * @param {Object} missedSessionData - Missed session details
   * @returns {Promise<Notification>} Created notification
   */
  static async createMissedSessionNotification(userId, missedSessionData) {
    try {
      const { count = 1, sessions = [], planAdjusted = false } = missedSessionData;
      
      let title, message, priority, actions;
      
      if (count === 1) {
        title = 'Missed Session Alert';
        message = `You missed your cycling session today. Your plan has been ${planAdjusted ? 'adjusted' : 'updated'}.`;
        priority = 'medium';
      } else if (count <= 3) {
        title = 'Multiple Missed Sessions';
        message = `You've missed ${count} sessions this week. Let's get back on track!`;
        priority = 'high';
      } else {
        title = 'Critical: Plan Adjustment Required';
        message = `You've missed ${count} sessions. Your plan needs immediate attention.`;
        priority = 'critical';
      }

      actions = [
        {
          type: 'navigation',
          label: 'View Plan',
          data: { route: '/plan-details' },
          isPrimary: true
        },
        {
          type: 'api_call',
          label: 'Reschedule',
          data: { endpoint: '/plans/reschedule' },
          isPrimary: false
        }
      ];

      const notification = new Notification({
        userId,
        type: 'missed_session',
        title,
        message,
        priority,
        actions,
        data: {
          count,
          sessions,
          planAdjusted,
          timestamp: new Date()
        },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });

      await notification.save();
      
      // Broadcast via WebSocket (if online) or FCM (if offline)
      await this.broadcastNotification(userId, notification);
      
      // DUAL-STRATEGY: Send FCM push notification ONLY if user is offline
      const wsService = getWebSocketService();
      const isUserOnline = wsService ? wsService.isUserConnected(userId) : false;
      
      if (!isUserOnline) {
        // User is OFFLINE - Send FCM push notification
        await fcmService.sendMissedSessionNotification(userId, { count, sessions, planAdjusted });
        logger.info(`FCM push notification sent (user OFFLINE)`, {
          userId,
          notificationId: notification._id,
          count,
          priority
        });
      }
      
      logger.info(`Missed session notification created`, {
        userId,
        notificationId: notification._id,
        count,
        priority,
        delivery: isUserOnline ? 'websocket' : 'fcm'
      });

      return notification;
    } catch (error) {
      logger.error(' Error creating missed session notification:', { 
        error: error.message, 
        userId,
        missedSessionData 
      });
      throw error;
    }
  }

  /**
   * Create a health screening notification
   * @param {string} userId - User ID
   * @param {Object} healthData - Health screening details
   * @returns {Promise<Notification>} Created notification
   */
  static async createHealthScreeningNotification(userId, healthData) {
    try {
      const { expiryDays = 7, isExpired = false, lastScreeningDate } = healthData;
      
      let title, message, priority, actions;
      
      if (isExpired) {
        title = 'Health Screening Expired';
        message = 'Your health screening has expired. Complete a new screening to continue training safely.';
        priority = 'high';
      } else if (expiryDays <= 3) {
        title = 'Health Screening Expiring Soon';
        message = `Your health screening expires in ${expiryDays} day${expiryDays > 1 ? 's' : ''}. Update it to avoid interruption.`;
        priority = 'medium';
      } else {
        title = 'Health Screening Reminder';
        message = `Your health screening expires in ${expiryDays} days. Consider updating it soon.`;
        priority = 'low';
      }

      actions = [
        {
          type: 'navigation',
          label: 'Quick Check',
          data: { route: '/health-screening', type: 'quick' },
          isPrimary: true
        },
        {
          type: 'navigation',
          label: 'Full Screening',
          data: { route: '/health-screening', type: 'full' },
          isPrimary: false
        }
      ];

      const notification = new Notification({
        userId,
        type: 'health_screening',
        title,
        message,
        priority,
        actions,
        data: {
          expiryDays,
          isExpired,
          lastScreeningDate,
          timestamp: new Date()
        },
        expiresAt: isExpired ? 
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : // 30 days if expired
          new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)   // 14 days if just reminder
      });

      await notification.save();
      
      // Broadcast via WebSocket
      await this.broadcastNotification(userId, notification);
      
      logger.info(` Health screening notification created`, {
        userId,
        notificationId: notification._id,
        expiryDays,
        isExpired,
        priority
      });

      return notification;
    } catch (error) {
      logger.error(' Error creating health screening notification:', { 
        error: error.message, 
        userId,
        healthData 
      });
      throw error;
    }
  }

  /**
   * Create a milestone achievement notification
   * @param {string} userId - User ID
   * @param {Object} milestoneData - Milestone details
   * @returns {Promise<Notification>} Created notification
   */
  static async createMilestoneNotification(userId, milestoneData) {
    try {
      const { 
        type = 'progress', 
        percentage = 0, 
        sessionsCompleted = 0, 
        totalSessions = 0,
        achievement = null 
      } = milestoneData;
      
      let title, message;
      
      if (type === 'progress') {
        title = `${percentage}% Complete! `;
        message = `Congratulations! You've completed ${sessionsCompleted} of ${totalSessions} sessions.`;
      } else if (type === 'streak') {
        title = `${milestoneData.streakDays} Day Streak! `;
        message = `Amazing consistency! You've maintained your training for ${milestoneData.streakDays} days straight.`;
      } else if (type === 'achievement') {
        title = `Achievement Unlocked! `;
        message = `You've earned the "${achievement}" badge for your dedication!`;
      }

      const actions = [
        {
          type: 'navigation',
          label: 'View Progress',
          data: { route: '/progress' },
          isPrimary: true
        },
        {
          type: 'external',
          label: 'Share',
          data: { action: 'share' },
          isPrimary: false
        }
      ];

      const notification = new Notification({
        userId,
        type: 'milestone_reached',
        title,
        message,
        priority: 'medium',
        actions,
        data: {
          ...milestoneData,
          timestamp: new Date()
        },
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      });

      await notification.save();
      
      // Broadcast via WebSocket
      await this.broadcastNotification(userId, notification);
      
      logger.info(` Milestone notification created`, {
        userId,
        notificationId: notification._id,
        type,
        percentage,
        achievement
      });

      return notification;
    } catch (error) {
      logger.error(' Error creating milestone notification:', { 
        error: error.message, 
        userId,
        milestoneData 
      });
      throw error;
    }
  }

  /**
   * Create a plan adjustment notification
   * @param {string} userId - User ID
   * @param {Object} adjustmentData - Plan adjustment details
   * @returns {Promise<Notification>} Created notification
   */
  static async createPlanAdjustmentNotification(userId, adjustmentData) {
    try {
      const { 
        reason = 'missed_sessions', 
        adjustmentType = 'extended',
        oldEndDate,
        newEndDate,
        addedSessions = 0 
      } = adjustmentData;
      
      let title, message;
      
      if (reason === 'missed_sessions') {
        title = 'Plan Automatically Adjusted';
        message = `Due to missed sessions, your plan has been ${adjustmentType}. `;
        if (addedSessions > 0) {
          message += `${addedSessions} sessions added to help you reach your goal.`;
        }
      } else if (reason === 'goal_change') {
        title = 'Plan Updated for New Goal';
        message = 'Your plan has been updated to match your new fitness goals.';
      }

      const actions = [
        {
          type: 'navigation',
          label: 'Review Plan',
          data: { route: '/plan-details' },
          isPrimary: true
        },
        {
          type: 'navigation',
          label: 'Modify Goals',
          data: { route: '/goals' },
          isPrimary: false
        }
      ];

      const notification = new Notification({
        userId,
        type: 'plan_adjustment',
        title,
        message,
        priority: 'medium',
        actions,
        data: {
          ...adjustmentData,
          timestamp: new Date()
        },
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
      });

      await notification.save();
      
      // Broadcast via WebSocket
      await this.broadcastNotification(userId, notification);
      
      logger.info(` Plan adjustment notification created`, {
        userId,
        notificationId: notification._id,
        reason,
        adjustmentType
      });

      return notification;
    } catch (error) {
      logger.error(' Error creating plan adjustment notification:', { 
        error: error.message, 
        userId,
        adjustmentData 
      });
      throw error;
    }
  }

  /**
   * Create a system update notification
   * @param {string} userId - User ID (or null for broadcast)
   * @param {Object} updateData - Update details
   * @returns {Promise<Notification|Notification[]>} Created notification(s)
   */
  static async createSystemUpdateNotification(userId, updateData) {
    try {
      const { 
        version = '1.0.0', 
        features = [], 
        isImportant = false,
        broadcastToAll = false 
      } = updateData;
      
      const title = isImportant ? 
        `Important Update Available (v${version})` : 
        `New Features Available (v${version})`;
        
      const message = features.length > 0 ? 
        `New features: ${features.slice(0, 2).join(', ')}${features.length > 2 ? ' and more!' : ''}` :
        'Check out the latest improvements to your SikadVoltz experience.';

      const actions = [
        {
          type: 'external',
          label: 'Update Now',
          data: { action: 'update' },
          isPrimary: true
        },
        {
          type: 'navigation',
          label: 'Release Notes',
          data: { route: '/release-notes' },
          isPrimary: false
        }
      ];

      if (broadcastToAll) {
        // TODO: Implement broadcast to all users
        // For now, return empty array
        return [];
      } else {
        const notification = new Notification({
          userId,
          type: 'system_update',
          title,
          message,
          priority: isImportant ? 'high' : 'low',
          actions,
          data: {
            ...updateData,
            timestamp: new Date()
          },
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });

        await notification.save();
        
        // Broadcast via WebSocket
        await this.broadcastNotification(userId, notification);
        
        logger.info(`System update notification created`, {
          userId,
          notificationId: notification._id,
          version,
          isImportant
        });

        return notification;
      }
    } catch (error) {
      logger.error(' Error creating system update notification:', { 
        error: error.message, 
        userId,
        updateData 
      });
      throw error;
    }
  }

  /**
   * Broadcast notification via WebSocket
   * @param {string} userId - User ID
   * @param {Notification} notification - Notification object
   */
  static async broadcastNotification(userId, notification) {
    try {
      const wsService = getWebSocketService();
      
      // DUAL-STRATEGY: Check if user is online
      const isUserOnline = wsService ? wsService.isUserConnected(userId) : false;
      
      if (isUserOnline && wsService) {
        // User is ONLINE - Send via WebSocket ONLY
        const unreadCount = await Notification.getUnreadCount(userId);
        
        wsService.sendToUser(userId, {
          type: 'new_notification',
          notification: {
            id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            createdAt: notification.createdAt,
            isRead: notification.isRead,
            priority: notification.priority,
            actions: notification.actions,
            timeAgo: notification.timeAgo,
            data: notification.data
          },
          unreadCount,
          timestamp: new Date().toISOString()
        });
        
        logger.info(`Notification sent via WebSocket (user ONLINE)`, {
          userId,
          notificationId: notification._id,
          type: notification.type,
          delivery: 'websocket'
        });
      } else {
        // User is OFFLINE - Send via FCM Push Notification ONLY
        logger.info(`User ${userId} is OFFLINE, sending via FCM push notification`, {
          notificationId: notification._id,
          type: notification.type,
          delivery: 'fcm'
        });
        
        // Send push notification via FCM
        // FCM service will handle this in the createNotification methods above
        // This is already handled in createMissedSessionNotification, etc.
      }
      
    } catch (error) {
      logger.error('Error broadcasting notification:', { 
        error: error.message, 
        userId,
        notificationId: notification._id 
      });
      // Don't throw error - notification was still created
    }
  }

  /**
   * Get notification statistics for user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Notification statistics
   */
  static async getNotificationStats(userId) {
    try {
      const stats = await Notification.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
            byType: {
              $push: {
                type: '$type',
                isRead: '$isRead',
                priority: '$priority'
              }
            }
          }
        }
      ]);

      return stats.length > 0 ? stats[0] : { total: 0, unread: 0, byType: [] };
    } catch (error) {
      logger.error(' Error getting notification stats:', { 
        error: error.message, 
        userId 
      });
      throw error;
    }
  }

  /**
   * Clean up old notifications for user
   * @param {string} userId - User ID
   * @param {number} daysOld - Days old threshold
   * @returns {Promise<Object>} Cleanup result
   */
  static async cleanupOldNotifications(userId, daysOld = 30) {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      
      const result = await Notification.deleteMany({
        userId,
        createdAt: { $lt: cutoffDate },
        isRead: true // Only delete read notifications
      });
      
      logger.info(` Old notifications cleaned up for user`, {
        userId,
        deletedCount: result.deletedCount,
        daysOld
      });

      return result;
    } catch (error) {
      logger.error(' Error cleaning up old notifications:', { 
        error: error.message, 
        userId,
        daysOld 
      });
      throw error;
    }
  }
}

export default NotificationService;
