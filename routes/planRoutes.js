import express from 'express';
import {
  createPlan,
  // recordSession, // This function doesn't exist
  missedSession,
  getCurrentPlan,
  allowEditPlan,
  triggerEmergencyCatchUp,
  remindMissedGoals,
  markDayComplete,
  getMissedSessions,
  getDailySessionStatus,
  getUpcomingSessions,
  updateSessionProgress,
  updateSessionProgressRealtime, // 🚨 NEW: Add real-time update function
  completeSession,
  // 📅 Calendar Integration Functions
  getCalendarData,
  enableSessionReminders,
  disableSessionReminders,
  getReminderStatus,
  getWeeklyAnalytics,
  getMonthlyAnalytics,
  rescheduleSession,
  // 🎯 NEW: Smart Plan Adjustment Functions
  checkPlanAdjustment,
  suggestNewPlan,
  // performDailyCheck, // Need to check if this exists
  // getPlanAdjustmentHistory, // Need to check if this exists
  // 🎯 NEW: Automatic Missed Session Detection Functions
  // autoDetectMissedSessions, // Need to check if this exists
  // getMissedSessionStatus, // Need to check if this exists
  // forceMissedSessionDetection // Need to check if this exists
} from '../controllers/planController.js';

import authenticateToken from '../middleware/authenticateToken.js';
import { validateRequest, planValidation } from '../middleware/validation.js';
import { requireCompleteProfile } from '../middleware/profileValidation.js';
import { realtimeMissedSessionCheck } from '../services/missedSessionDetector.js';
import { manualMissedSessionDetection } from '../services/scheduledTasks.js';

const router = express.Router();

// Create a new cycling plan
router.post(
  '/',
  authenticateToken,
  validateRequest(planValidation.createPlan),
  createPlan
);

router.post(
  '/updateSessionProgress',
  authenticateToken,
  requireCompleteProfile,  // Add this line
  updateSessionProgress
);

// 🚨 NEW: Real-time session progress update for ESP32
router.post(
  '/update-session-progress-realtime',
  authenticateToken,
  updateSessionProgressRealtime
);

// Record a completed session
router.post(
  '/:id/sessions',
  authenticateToken,
  validateRequest(planValidation.recordSession),
  completeSession
);

// Handle missed session
router.post(
  '/:id/missed',
  authenticateToken,
  validateRequest(planValidation.missedSession),
  missedSession
);

// Get user's current plan
router.get(
  '/current',
  authenticateToken,
  getCurrentPlan
);

// Allow editing plan if missed 5 days
router.get('/:id/allow-edit', authenticateToken, allowEditPlan);

// Emergency catch-up
router.post('/:id/emergency-catchup', authenticateToken, triggerEmergencyCatchUp);

// Remind users for missed goals (admin/cron)
router.post('/remind-missed', remindMissedGoals);

// Mark current day as complete
router.post('/mark-day-complete', authenticateToken, markDayComplete);

// Get missed sessions data
router.get('/missed-sessions', authenticateToken, getMissedSessions);

// Check daily session status
router.get('/daily-status', authenticateToken, getDailySessionStatus);

// Get upcoming sessions
router.get('/upcoming-sessions', authenticateToken, getUpcomingSessions);

//Calendar Integration Endpoints
router.get('/calendar/:year/:month', authenticateToken, getCalendarData);

//Session Reminders
router.post('/session-reminders/enable', authenticateToken, enableSessionReminders);
router.post('/session-reminders/disable', authenticateToken, disableSessionReminders);
router.get('/session-reminders/status', authenticateToken, getReminderStatus);

//Session Analytics
router.get('/analytics/weekly', authenticateToken, getWeeklyAnalytics);
router.get('/analytics/monthly', authenticateToken, getMonthlyAnalytics);

//Session Rescheduling
router.post('/sessions/:sessionId/reschedule', authenticateToken, rescheduleSession);

//Smart Plan Adjustment Endpoints
router.get('/check-adjustment', authenticateToken, checkPlanAdjustment);
router.get('/suggest-reset', authenticateToken, suggestNewPlan);
// router.post('/daily-check', authenticateToken, performDailyCheck);
// router.get('/adjustment-history', authenticateToken, getPlanAdjustmentHistory);

//Automatic Missed Session Detection Endpoints
// router.get('/auto-detect-missed', authenticateToken, autoDetectMissedSessions);
// router.get('/missed-status', authenticateToken, getMissedSessionStatus);
// router.post('/force-detect-missed', authenticateToken, forceMissedSessionDetection);

// 🚨 NEW: Missed Session Detection & Alerts
router.get('/check-missed-sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const result = await realtimeMissedSessionCheck(userId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check missed sessions',
      details: error.message
    });
  }
});

// Manual trigger for missed session detection (for testing)
router.post('/manual-detect-missed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const result = await manualMissedSessionDetection(userId);
    
    res.json({
      success: true,
      message: 'Manual missed session detection completed',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to run manual detection',
      details: error.message
    });
  }
});

export default router;
