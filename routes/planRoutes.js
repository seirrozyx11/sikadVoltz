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
import CyclingPlan from '../models/CyclingPlan.js';

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
  // NOTE: No requireCompleteProfile middleware for real-time updates during active sessions
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

// 🎯 NEW: Recovery Plan Management Endpoints

// Extend current plan by specified weeks
router.post('/extend-plan', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { extensionWeeks, reason } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!extensionWeeks || extensionWeeks <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid extension weeks. Must be a positive number.'
      });
    }

    // Find the active plan
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active plan found'
      });
    }

    // Extend the plan by adding weeks to the end date
    const lastSession = plan.dailySessions[plan.dailySessions.length - 1];
    const lastDate = new Date(lastSession.date);
    
    // Add new sessions for the extension period
    const newSessions = [];
    for (let week = 0; week < extensionWeeks; week++) {
      // Add 3 sessions per week (standard pattern)
      for (let day = 0; day < 3; day++) {
        const sessionDate = new Date(lastDate);
        sessionDate.setDate(lastDate.getDate() + (week * 7) + (day * 2) + 1);
        
        newSessions.push({
          date: sessionDate,
          plannedHours: 1.5, // Standard session duration
          completedHours: 0,
          status: 'pending',
          adjustedHours: 0,
          sessionType: 'recovery',
          notes: `Extended session - ${reason || 'Plan extension'}`
        });
      }
    }

    // Add new sessions to the plan
    plan.dailySessions.push(...newSessions);
    
    // Log the extension
    plan.adjustmentHistory = plan.adjustmentHistory || [];
    plan.adjustmentHistory.push({
      type: 'extension',
      date: new Date(),
      details: {
        extensionWeeks,
        sessionsAdded: newSessions.length,
        reason: reason || 'User requested extension'
      }
    });

    await plan.save();

    res.json({
      success: true,
      message: `Plan successfully extended by ${extensionWeeks} weeks`,
      data: {
        extensionWeeks,
        sessionsAdded: newSessions.length,
        newEndDate: newSessions[newSessions.length - 1].date,
        totalSessions: plan.dailySessions.length
      }
    });

  } catch (error) {
    console.error('Extend plan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extend plan',
      details: error.message
    });
  }
});

// Reduce plan intensity by specified percentage
router.post('/reduce-intensity', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { reductionPercentage, reason } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!reductionPercentage || reductionPercentage <= 0 || reductionPercentage > 50) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reduction percentage. Must be between 1-50%.'
      });
    }

    // Find the active plan
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active plan found'
      });
    }

    // Reduce intensity for all pending sessions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let updatedSessions = 0;
    const reductionFactor = (100 - reductionPercentage) / 100;

    plan.dailySessions.forEach(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      
      // Only reduce intensity for future pending sessions
      if (sessionDate >= today && session.status === 'pending') {
        const originalHours = session.plannedHours;
        session.plannedHours = Math.max(0.5, originalHours * reductionFactor); // Minimum 30 minutes
        session.notes = `${session.notes || ''} [Intensity reduced by ${reductionPercentage}%]`.trim();
        updatedSessions++;
      }
    });

    // Log the intensity reduction
    plan.adjustmentHistory = plan.adjustmentHistory || [];
    plan.adjustmentHistory.push({
      type: 'intensity_reduction',
      date: new Date(),
      details: {
        reductionPercentage,
        sessionsUpdated: updatedSessions,
        reason: reason || 'User requested intensity reduction'
      }
    });

    await plan.save();

    res.json({
      success: true,
      message: `Plan intensity successfully reduced by ${reductionPercentage}%`,
      data: {
        reductionPercentage,
        sessionsUpdated: updatedSessions,
        averageNewDuration: plan.dailySessions
          .filter(s => s.status === 'pending')
          .reduce((sum, s) => sum + s.plannedHours, 0) / 
          plan.dailySessions.filter(s => s.status === 'pending').length
      }
    });

  } catch (error) {
    console.error('Reduce intensity error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reduce plan intensity',
      details: error.message
    });
  }
});

// Acknowledge missed sessions (mark as resolved)
router.post('/acknowledge-missed-sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { acknowledged, acknowledgedAt, reason } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Find the active plan
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active plan found'
      });
    }

    // Mark missed sessions as acknowledged
    const today = new Date();
    let acknowledgedCount = 0;

    plan.dailySessions.forEach(session => {
      if (session.status === 'missed') {
        session.acknowledged = acknowledged || true;
        session.acknowledgedAt = acknowledgedAt || today;
        session.acknowledgmentReason = reason || 'User took recovery action';
        acknowledgedCount++;
      }
    });

    // Add acknowledgment to plan history
    plan.adjustmentHistory = plan.adjustmentHistory || [];
    plan.adjustmentHistory.push({
      type: 'missed_sessions_acknowledged',
      date: today,
      details: {
        acknowledgedCount,
        reason: reason || 'User took recovery action to address missed sessions'
      }
    });

    await plan.save();

    res.json({
      success: true,
      message: `${acknowledgedCount} missed sessions acknowledged successfully`,
      data: {
        acknowledgedCount,
        acknowledgedAt: acknowledgedAt || today,
        totalMissedSessions: plan.dailySessions.filter(s => s.status === 'missed').length
      }
    });

  } catch (error) {
    console.error('Acknowledge missed sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to acknowledge missed sessions',
      details: error.message
    });
  }
});

export default router;
