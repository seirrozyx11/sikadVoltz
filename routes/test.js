import express from 'express';
import fcmService from '../services/fcmService.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Test FCM Push Notifications
 * These endpoints are for testing push notifications with real users
 */

/**
 * Send test notification to a specific user
 * POST /api/test/fcm/user/:userId
 */
router.post('/fcm/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, body, type = 'test', route = '/notifications' } = req.body;

    logger.info(`🧪 Testing FCM notification for user: ${userId}`);

    // Check if user exists and has FCM token
    const user = await User.findById(userId).select('email fcmToken platform');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'User does not have an FCM token. Please ensure the user has logged in on their mobile device and accepted notifications.',
        userEmail: user.email
      });
    }

    // Send the notification
    const notification = {
      title: title || '🧪 SikadVoltz Test Notification',
      body: body || 'This is a test push notification from your SikadVoltz backend!'
    };

    const data = {
      type,
      route,
      testId: `test-${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    const success = await fcmService.sendToUser(userId, notification, data);

    if (success) {
      res.json({
        success: true,
        message: 'Test notification sent successfully!',
        userEmail: user.email,
        platform: user.platform,
        tokenPrefix: user.fcmToken.substring(0, 20) + '...',
        notification,
        data
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send notification. Check server logs for details.'
      });
    }

  } catch (error) {
    logger.error('❌ Test FCM notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * Send test notification to all users with FCM tokens
 * POST /api/test/fcm/all-users
 */
router.post('/fcm/all-users', async (req, res) => {
  try {
    const { title, body, type = 'test', route = '/notifications', limit = 10 } = req.body;

    logger.info(`🧪 Testing FCM notification for all users (limit: ${limit})`);

    // Get users with FCM tokens
    const users = await User.find({ 
      fcmToken: { $exists: true, $ne: null } 
    })
    .select('email fcmToken platform')
    .limit(parseInt(limit));

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No users found with FCM tokens. Please ensure users have logged in on mobile devices and accepted notifications.'
      });
    }

    // Send notifications to all users
    const notification = {
      title: title || '🧪 SikadVoltz Test Broadcast',
      body: body || `Test broadcast notification sent to ${users.length} users!`
    };

    const data = {
      type,
      route,
      testId: `broadcast-${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    const userIds = users.map(user => user._id.toString());
    const results = await fcmService.sendToMultipleUsers(userIds, notification, data);

    res.json({
      success: true,
      message: 'Test broadcast completed!',
      totalUsers: users.length,
      results: {
        successful: results.success,
        failed: results.failed,
        errors: results.errors.slice(0, 5) // Limit error details
      },
      notification,
      data,
      userEmails: users.map(u => u.email)
    });

  } catch (error) {
    logger.error('❌ Test FCM broadcast error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * Send missed session test notification
 * POST /api/test/fcm/missed-session/:userId
 */
router.post('/fcm/missed-session/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { count = 1 } = req.body;

    logger.info(`🧪 Testing missed session notification for user: ${userId}`);

    const user = await User.findById(userId).select('email fcmToken');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'User does not have an FCM token',
        userEmail: user.email
      });
    }

    const success = await fcmService.sendMissedSessionNotification(userId, {
      count: parseInt(count),
      sessions: Array.from({ length: count }, (_, i) => 
        new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      )
    });

    if (success) {
      res.json({
        success: true,
        message: 'Missed session test notification sent!',
        userEmail: user.email,
        missedCount: count
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send missed session notification'
      });
    }

  } catch (error) {
    logger.error('❌ Test missed session notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * Send session reminder test notification
 * POST /api/test/fcm/session-reminder/:userId
 */
router.post('/fcm/session-reminder/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { plannedHours = 1, sessionType = 'cycling' } = req.body;

    logger.info(`🧪 Testing session reminder notification for user: ${userId}`);

    const user = await User.findById(userId).select('email fcmToken');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'User does not have an FCM token',
        userEmail: user.email
      });
    }

    const sessionTime = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now

    const success = await fcmService.sendSessionReminderNotification(userId, {
      sessionTime,
      sessionType,
      plannedHours: parseFloat(plannedHours)
    });

    if (success) {
      res.json({
        success: true,
        message: 'Session reminder test notification sent!',
        userEmail: user.email,
        sessionDetails: {
          sessionTime,
          sessionType,
          plannedHours
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send session reminder notification'
      });
    }

  } catch (error) {
    logger.error('❌ Test session reminder notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * Send daily motivation test notification
 * POST /api/test/fcm/motivation/:userId
 */
router.post('/fcm/motivation/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { streakDays = 5, completedSessions = 10, totalHours = 15.5 } = req.body;

    logger.info(`🧪 Testing daily motivation notification for user: ${userId}`);

    const user = await User.findById(userId).select('email fcmToken');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'User does not have an FCM token',
        userEmail: user.email
      });
    }

    const success = await fcmService.sendDailyMotivationNotification(userId, {
      streakDays: parseInt(streakDays),
      completedSessions: parseInt(completedSessions),
      totalHours: parseFloat(totalHours)
    });

    if (success) {
      res.json({
        success: true,
        message: 'Daily motivation test notification sent!',
        userEmail: user.email,
        stats: {
          streakDays,
          completedSessions,
          totalHours
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send daily motivation notification'
      });
    }

  } catch (error) {
    logger.error('❌ Test daily motivation notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * Get all users with FCM tokens for testing
 * GET /api/test/fcm/users
 */
router.get('/fcm/users', async (req, res) => {
  try {
    const users = await User.find({ 
      fcmToken: { $exists: true, $ne: null } 
    })
    .select('email fcmToken platform createdAt fcmTokenUpdatedAt')
    .sort({ fcmTokenUpdatedAt: -1 })
    .limit(50);

    res.json({
      success: true,
      message: `Found ${users.length} users with FCM tokens`,
      users: users.map(user => ({
        id: user._id,
        email: user.email,
        platform: user.platform,
        hasToken: !!user.fcmToken,
        tokenPrefix: user.fcmToken ? user.fcmToken.substring(0, 20) + '...' : null,
        tokenUpdated: user.fcmTokenUpdatedAt,
        userCreated: user.createdAt
      }))
    });

  } catch (error) {
    logger.error('❌ Error fetching users with FCM tokens:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

export default router;