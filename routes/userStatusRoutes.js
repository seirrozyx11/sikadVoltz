import express from 'express';
import { 
  setUserOnline, 
  setUserOffline, 
  updateLastActive,
  getUserStatus,
  registerFcmToken,
  removeFcmToken,
  updateNotificationPreferences,
  getNotificationPreferences,
  getSystemStats
} from '../controllers/userStatusController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * User Status Routes
 * Part of the Dual-Strategy Notification System
 * 
 * These routes enable automatic detection of user online/offline status
 * for smart notification delivery (WebSocket vs Push)
 */

// User Status Management
router.post('/online', authMiddleware, setUserOnline);
router.post('/offline', authMiddleware, setUserOffline);
router.post('/heartbeat', authMiddleware, updateLastActive);
router.get('/status', authMiddleware, getUserStatus);

// FCM Token Management
router.post('/fcm-token', authMiddleware, registerFcmToken);
router.delete('/fcm-token', authMiddleware, removeFcmToken);

// Notification Preferences
router.get('/preferences', authMiddleware, getNotificationPreferences);
router.put('/preferences', authMiddleware, updateNotificationPreferences);

// System Statistics (optional - for monitoring)
router.get('/stats', authMiddleware, getSystemStats);

export default router;
