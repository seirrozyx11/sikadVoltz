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
import authenticateToken from '../middleware/authenticateToken.js';

const router = express.Router();

/**
 * User Status Routes
 * Part of the Dual-Strategy Notification System
 * 
 * These routes enable automatic detection of user online/offline status
 * for smart notification delivery (WebSocket vs Push)
 */

// User Status Management
router.post('/online', authenticateToken, setUserOnline);
router.post('/offline', authenticateToken, setUserOffline);
router.post('/heartbeat', authenticateToken, updateLastActive);
router.get('/status', authenticateToken, getUserStatus);

// FCM Token Management
router.post('/fcm-token', authenticateToken, registerFcmToken);
router.delete('/fcm-token', authenticateToken, removeFcmToken);

// Notification Preferences
router.get('/preferences', authenticateToken, getNotificationPreferences);
router.put('/preferences', authenticateToken, updateNotificationPreferences);

// System Stats (admin/monitoring)
router.get('/stats', authenticateToken, getSystemStats);

export default router;
