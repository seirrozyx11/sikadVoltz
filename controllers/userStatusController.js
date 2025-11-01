import User from '../models/User.js';
import logger from '../utils/logger.js';

/**
 * User Status Controller
 * Handles user online/offline status and FCM token management
 * Part of the Dual-Strategy Notification System
 */

/**
 * Set user status to online
 * Called when app opens or user becomes active
 */
export const setUserOnline = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    await user.setOnline();
    
    logger.info(`User ${userId} set to ONLINE`, {
      userId,
      lastActive: user.lastActive,
      connectionCount: user.connectionCount
    });
    
    res.json({
      success: true,
      message: 'User status set to online',
      data: {
        isOnline: true,
        lastActive: user.lastActive,
        connectionCount: user.connectionCount
      }
    });
    
  } catch (error) {
    logger.error('Error setting user online:', { 
      error: error.message, 
      userId: req.user?._id 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error.message
    });
  }
};

/**
 * Set user status to offline
 * Called when app closes or goes to background
 */
export const setUserOffline = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    await user.setOffline();
    
    logger.info(`User ${userId} set to OFFLINE`, {
      userId,
      lastActive: user.lastActive
    });
    
    res.json({
      success: true,
      message: 'User status set to offline',
      data: {
        isOnline: false,
        lastActive: user.lastActive
      }
    });
    
  } catch (error) {
    logger.error('Error setting user offline:', { 
      error: error.message, 
      userId: req.user?._id 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error.message
    });
  }
};

/**
 * Update user's last active timestamp
 * Called periodically when user is actively using the app
 */
export const updateLastActive = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    await user.updateLastActive();
    
    res.json({
      success: true,
      message: 'Last active timestamp updated',
      data: {
        lastActive: user.lastActive,
        isOnline: user.isOnline
      }
    });
    
  } catch (error) {
    logger.error('Error updating last active:', { 
      error: error.message, 
      userId: req.user?._id 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to update last active',
      error: error.message
    });
  }
};

/**
 * Get user's current status
 */
export const getUserStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const user = await User.findById(userId).select('isOnline lastActive lastOnlineAt lastOfflineAt connectionCount');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if user is truly online (active within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isTrulyOnline = user.isOnline && user.lastActive > fiveMinutesAgo;
    
    res.json({
      success: true,
      data: {
        isOnline: isTrulyOnline,
        lastActive: user.lastActive,
        lastOnlineAt: user.lastOnlineAt,
        lastOfflineAt: user.lastOfflineAt,
        connectionCount: user.connectionCount,
        sessionDuration: user.lastOnlineAt && user.isOnline 
          ? Date.now() - new Date(user.lastOnlineAt).getTime() 
          : null
      }
    });
    
  } catch (error) {
    logger.error('Error getting user status:', { 
      error: error.message, 
      userId: req.user?._id 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get user status',
      error: error.message
    });
  }
};

/**
 * Register or update FCM token for push notifications
 */
export const registerFcmToken = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fcmToken, platform, appVersion } = req.body;
    
    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    await user.updateFcmToken(fcmToken, platform, appVersion);
    
    logger.info(`FCM token registered for user ${userId}`, {
      userId,
      platform: user.platform,
      appVersion: user.appVersion,
      tokenUpdatedAt: user.fcmTokenUpdatedAt
    });
    
    res.json({
      success: true,
      message: 'FCM token registered successfully',
      data: {
        platform: user.platform,
        appVersion: user.appVersion,
        tokenUpdatedAt: user.fcmTokenUpdatedAt
      }
    });
    
  } catch (error) {
    logger.error('Error registering FCM token:', { 
      error: error.message, 
      userId: req.user?._id 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to register FCM token',
      error: error.message
    });
  }
};

/**
 * Remove FCM token (on logout or app uninstall)
 */
export const removeFcmToken = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    user.fcmToken = null;
    user.fcmTokenUpdatedAt = new Date();
    await user.save();
    
    logger.info(`FCM token removed for user ${userId}`, { userId });
    
    res.json({
      success: true,
      message: 'FCM token removed successfully'
    });
    
  } catch (error) {
    logger.error('Error removing FCM token:', { 
      error: error.message, 
      userId: req.user?._id 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to remove FCM token',
      error: error.message
    });
  }
};

/**
 * Update notification preferences
 */
export const updateNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user._id;
    const preferences = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Update notification preferences
    user.notificationPreferences = {
      ...user.notificationPreferences,
      ...preferences
    };
    
    await user.save();
    
    logger.info(`Notification preferences updated for user ${userId}`, {
      userId,
      preferences: user.notificationPreferences
    });
    
    res.json({
      success: true,
      message: 'Notification preferences updated',
      data: {
        preferences: user.notificationPreferences
      }
    });
    
  } catch (error) {
    logger.error('Error updating notification preferences:', { 
      error: error.message, 
      userId: req.user?._id 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to update notification preferences',
      error: error.message
    });
  }
};

/**
 * Get notification preferences
 */
export const getNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const user = await User.findById(userId).select('notificationPreferences');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        preferences: user.notificationPreferences || {}
      }
    });
    
  } catch (error) {
    logger.error('Error getting notification preferences:', { 
      error: error.message, 
      userId: req.user?._id 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get notification preferences',
      error: error.message
    });
  }
};

/**
 * Get system statistics (admin only)
 */
export const getSystemStats = async (req, res) => {
  try {
    const onlineUsersCount = await User.getOnlineUsersCount();
    const totalUsers = await User.countDocuments();
    
    // Get FCM token statistics
    const usersWithFcm = await User.countDocuments({ fcmToken: { $exists: true, $ne: null } });
    
    // Get platform distribution
    const platformStats = await User.aggregate([
      { $group: { _id: '$platform', count: { $sum: 1 } } }
    ]);
    
    res.json({
      success: true,
      data: {
        totalUsers,
        onlineUsers: onlineUsersCount,
        usersWithPushNotifications: usersWithFcm,
        platformDistribution: platformStats,
        timestamp: new Date()
      }
    });
    
  } catch (error) {
    logger.error('Error getting system stats:', { error: error.message });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get system statistics',
      error: error.message
    });
  }
};
