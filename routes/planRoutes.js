import express from 'express';
import {
  createPlan,
  recordSession,
  missedSession,
  getCurrentPlan,
  allowEditPlan,
  triggerEmergencyCatchUp,
  remindMissedGoals,
  markDayComplete,
  getMissedSessions,
  getDailySessionStatus,
  getUpcomingSessions,
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
  performDailyCheck,
  getPlanAdjustmentHistory,
  // 🎯 NEW: Automatic Missed Session Detection Functions
  autoDetectMissedSessions,
  getMissedSessionStatus,
  forceMissedSessionDetection
} from '../controllers/planController.js';

import authenticateToken from '../middleware/authenticateToken.js';
import { validateRequest, planValidation } from '../middleware/validation.js';

const router = express.Router();

// Create a new cycling plan
router.post(
  '/',
  authenticateToken,
  validateRequest(planValidation.createPlan),
  createPlan
);

// Record a completed session
router.post(
  '/:id/sessions',
  authenticateToken,
  validateRequest(planValidation.recordSession),
  recordSession
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

// 📅 Calendar Integration Endpoints
router.get('/calendar/:year/:month', authenticateToken, getCalendarData);

// 📅 Session Reminders
router.post('/session-reminders/enable', authenticateToken, enableSessionReminders);
router.post('/session-reminders/disable', authenticateToken, disableSessionReminders);
router.get('/session-reminders/status', authenticateToken, getReminderStatus);

// 📅 Session Analytics
router.get('/analytics/weekly', authenticateToken, getWeeklyAnalytics);
router.get('/analytics/monthly', authenticateToken, getMonthlyAnalytics);

// 📅 Session Rescheduling
router.post('/sessions/:sessionId/reschedule', authenticateToken, rescheduleSession);

// 🎯 NEW: Smart Plan Adjustment Endpoints
router.get('/check-adjustment', authenticateToken, checkPlanAdjustment);
router.get('/suggest-reset', authenticateToken, suggestNewPlan);
router.post('/daily-check', authenticateToken, performDailyCheck);
router.get('/adjustment-history', authenticateToken, getPlanAdjustmentHistory);

// 🎯 NEW: Automatic Missed Session Detection Endpoints
router.get('/auto-detect-missed', authenticateToken, autoDetectMissedSessions);
router.get('/missed-status', authenticateToken, getMissedSessionStatus);
router.post('/force-detect-missed', authenticateToken, forceMissedSessionDetection);

export default router;
