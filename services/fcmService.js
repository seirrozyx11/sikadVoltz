import admin from 'firebase-admin';
import logger from '../utils/logger.js';
import User from '../models/User.js';

/**
 * Firebase Cloud Messaging Service
 * Handles sending push notifications via FCM
 */
class FCMService {
  constructor() {
    this.isInitialized = false;
    this.init();
  }

  /**
   * Initialize Firebase Admin SDK
   */
  init() {
    try {
      if (!admin.apps.length) {
        // Initialize with service account key or default credentials
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID
          });
        } else {
          // Use default credentials (for Google Cloud deployment)
          admin.initializeApp();
        }
        
        logger.info('Firebase Admin SDK initialized');
        this.isInitialized = true;
      }
    } catch (error) {
      logger.error(' Failed to initialize Firebase Admin SDK:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Send push notification to a specific user
   * @param {string} userId - User ID
   * @param {Object} notification - Notification payload
   * @param {Object} data - Additional data payload
   * @returns {Promise<boolean>} Success status
   */
  async sendToUser(userId, notification, data = {}) {
    if (!this.isInitialized) {
      logger.warn(' FCM not initialized, skipping notification');
      return false;
    }

    try {
      // Get user's FCM token
      const user = await User.findById(userId).select('fcmToken platform notificationPreferences');
      
      if (!user || !user.fcmToken) {
        logger.warn(`No FCM token found for user ${userId}`);
        return false;
      }

      // Check if user has notifications enabled for this type
      if (!this.shouldSendNotification(user, data.type)) {
        logger.info(`🔇 Notification blocked by user preferences: ${data.type}`);
        return false;
      }

      // Prepare message
      const message = {
        token: user.fcmToken,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          ...data,
          userId: userId.toString(),
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            icon: 'ic_notification',
            color: '#6C5CE7',
            channelId: this.getChannelId(data.type),
            tag: data.type, // Prevents duplicate notifications
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: notification.title,
                body: notification.body,
              },
              badge: 1,
              sound: 'default',
              category: data.type,
            }
          }
        }
      };

      // Send message
      const response = await admin.messaging().send(message);
      
      logger.info(` FCM notification sent successfully`, {
        userId,
        type: data.type,
        messageId: response,
        platform: user.platform
      });

      return true;

    } catch (error) {
      if (error.code === 'messaging/registration-token-not-registered') {
        // Token is invalid, remove it from user
        await this.removeInvalidToken(userId);
        logger.warn(`Removed invalid FCM token for user ${userId}`);
      } else {
        logger.error(` Failed to send FCM notification to user ${userId}:`, error);
      }
      
      return false;
    }
  }

  /**
   * Send push notification to multiple users
   * @param {Array<string>} userIds - Array of user IDs
   * @param {Object} notification - Notification payload
   * @param {Object} data - Additional data payload
   * @returns {Promise<Object>} Results summary
   */
  async sendToMultipleUsers(userIds, notification, data = {}) {
    if (!this.isInitialized) {
      logger.warn(' FCM not initialized, skipping notifications');
      return { success: 0, failed: userIds.length };
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Process in batches of 500 (FCM limit)
    const batchSize = 500;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(userId => this.sendToUser(userId, notification, data))
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          results.success++;
        } else {
          results.failed++;
          if (result.status === 'rejected') {
            results.errors.push({
              userId: batch[index],
              error: result.reason?.message || 'Unknown error'
            });
          }
        }
      });
    }

    logger.info(` Batch FCM notification results:`, {
      totalUsers: userIds.length,
      successful: results.success,
      failed: results.failed
    });

    return results;
  }

  /**
   * Send notification to a topic
   * @param {string} topic - Topic name
   * @param {Object} notification - Notification payload
   * @param {Object} data - Additional data payload
   * @returns {Promise<boolean>} Success status
   */
  async sendToTopic(topic, notification, data = {}) {
    if (!this.isInitialized) {
      logger.warn(' FCM not initialized, skipping topic notification');
      return false;
    }

    try {
      const message = {
        topic: topic,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          ...data,
          timestamp: new Date().toISOString(),
        }
      };

      const response = await admin.messaging().send(message);
      
      logger.info(`FCM topic notification sent successfully`, {
        topic,
        messageId: response,
        type: data.type
      });

      return true;

    } catch (error) {
      logger.error(` Failed to send FCM topic notification to ${topic}:`, error);
      return false;
    }
  }

  /**
   * Check if notification should be sent based on user preferences
   * @param {Object} user - User object with preferences
   * @param {string} type - Notification type
   * @returns {boolean} Should send notification
   */
  shouldSendNotification(user, type) {
    const prefs = user.notificationPreferences || {};
    
    switch (type) {
      case 'missed_session':
        return prefs.missedSessions !== false;
      case 'session_reminder':
        return prefs.sessionReminders !== false;
      case 'motivation':
        return prefs.dailyMotivation !== false;
      case 'progress':
        return prefs.weeklyProgress !== false;
      default:
        return true;
    }
  }

  /**
   * Get appropriate notification channel ID
   * @param {string} type - Notification type
   * @returns {string} Channel ID
   */
  getChannelId(type) {
    switch (type) {
      case 'missed_session':
        return 'missed_sessions_fcm';
      case 'session_reminder':
        return 'session_reminders_fcm';
      case 'motivation':
        return 'motivation_fcm';
      case 'progress':
        return 'progress_updates_fcm';
      default:
        return 'default_fcm';
    }
  }

  /**
   * Remove invalid FCM token from user
   * @param {string} userId - User ID
   */
  async removeInvalidToken(userId) {
    try {
      await User.findByIdAndUpdate(userId, {
        $unset: { 
          fcmToken: 1,
          fcmTokenUpdatedAt: 1
        }
      });
      
      logger.info(`Removed invalid FCM token for user ${userId}`);
    } catch (error) {
      logger.error(` Failed to remove invalid FCM token for user ${userId}:`, error);
    }
  }

  /**
   * Send missed session notification
   * @param {string} userId - User ID
   * @param {Object} missedSessionData - Missed session details
   */
  async sendMissedSessionNotification(userId, missedSessionData) {
    const { count = 1, sessions = [] } = missedSessionData;
    
    let title, body;
    
    if (count === 1) {
      title = ' Missed Session Alert';
      body = 'You missed your cycling session yesterday. Let\'s get back on track!';
    } else if (count <= 3) {
      title = ' Multiple Missed Sessions';
      body = `You've missed ${count} sessions this week. Your goals are waiting!`;
    } else {
      title = ' Get Back on Track!';
      body = `${count} missed sessions - but champions never give up!`;
    }

    return await this.sendToUser(userId, { title, body }, {
      type: 'missed_session',
      route: '/notifications',
      count: count.toString(),
      sessions: JSON.stringify(sessions)
    });
  }

  /**
   * Send session reminder notification
   * @param {string} userId - User ID
   * @param {Object} sessionData - Session details
   */
  async sendSessionReminderNotification(userId, sessionData) {
    const { sessionTime, sessionType = 'cycling', plannedHours = 1 } = sessionData;
    
    const title = ' Session Reminder';
    const body = `Your ${plannedHours}h ${sessionType} session starts in 1 hour!`;

    return await this.sendToUser(userId, { title, body }, {
      type: 'session_reminder',
      route: '/activity-tracker',
      sessionTime: sessionTime,
      sessionType,
      plannedHours: plannedHours.toString()
    });
  }

  /**
   * Send daily motivation notification
   * @param {string} userId - User ID
   * @param {Object} motivationData - Motivation details
   */
  async sendDailyMotivationNotification(userId, motivationData) {
    const { streakDays = 0, completedSessions = 0, totalHours = 0 } = motivationData;
    
    const messages = [
      ` Every session counts! You've completed ${completedSessions} sessions.`,
      `${totalHours.toFixed(1)} hours of cycling - you're building strength!`,
      ` ${streakDays} day streak! Keep the momentum going!`,
      `Consistency is key - you're doing amazing!`,
      ` Champions train even when they don't feel like it. You're a champion!`,
    ];

    const title = 'Daily Motivation';
    const body = messages[Math.floor(Math.random() * messages.length)];

    return await this.sendToUser(userId, { title, body }, {
      type: 'motivation',
      route: '/home',
      streakDays: streakDays.toString(),
      completedSessions: completedSessions.toString(),
      totalHours: totalHours.toString()
    });
  }
}

// Create singleton instance
const fcmService = new FCMService();

export default fcmService;