import CyclingPlan from '../models/CyclingPlan.js';
import logger from '../utils/logger.js';
import NotificationService from './notificationService.js';

/**
 * Automatic Missed Session Detection Service
 * Compares user's actual start date (day 1) with current date to detect missed sessions
 */

/**
 * Check and automatically mark missed sessions based on actual dates
 * @param {string} userId - User ID
 * @returns {Object} Result of missed session detection
 */
export async function detectAndMarkMissedSessions(userId) {
  try {
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan || !plan.dailySessions || plan.dailySessions.length === 0) {
      return {
        success: false,
        error: 'No active plan or sessions found',
        missedSessions: []
      };
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today for comparison

    let missedSessionsDetected = [];
    let newMissedCount = 0;
    let newMissedHours = 0;

    // Check each session to see if it's past due and not completed
    for (let i = 0; i < plan.dailySessions.length; i++) {
      const session = plan.dailySessions[i];
      const sessionDate = new Date(session.date);
      sessionDate.setHours(23, 59, 59, 999); // End of session day

      // If session date is in the past and status is still pending
      if (sessionDate < today && session.status === 'pending') {
        // Mark as missed
        plan.dailySessions[i].status = 'missed';
        plan.dailySessions[i].missedHours = session.plannedHours;
        
        missedSessionsDetected.push({
          date: session.date,
          dayNumber: i + 1,
          plannedHours: session.plannedHours,
          missedHours: session.plannedHours,
          actualDate: sessionDate.toISOString().split('T')[0]
        });

        newMissedCount++;
        newMissedHours += session.plannedHours;

        logger.info(`Auto-detected missed session for user ${userId}: Day ${i + 1}, Date: ${sessionDate.toISOString().split('T')[0]}`);
      }
    }

    // Update plan totals if new missed sessions detected
    if (newMissedCount > 0) {
      plan.missedCount += newMissedCount;
      plan.totalMissedHours += newMissedHours;
      
      await plan.save();

      logger.info(`Updated plan for user ${userId}: +${newMissedCount} missed sessions, +${newMissedHours} missed hours`);
      
      // Create notification for missed sessions
      try {
        await NotificationService.createMissedSessionNotification(userId, {
          count: newMissedCount,
          sessions: missedSessionsDetected,
          planAdjusted: plan.missedCount >= (plan.autoAdjustmentSettings?.weeklyResetThreshold || 7),
          totalMissedCount: plan.missedCount,
          totalMissedHours: plan.totalMissedHours
        });
        
        logger.info(`Missed session notification created for user ${userId}`);
      } catch (notificationError) {
        logger.error('Failed to create missed session notification:', {
          userId,
          error: notificationError.message
        });
        // Don't fail the main process if notification creation fails
      }
    }

    // Get current status
    const currentStats = await getCurrentPlanStatus(plan);

    return {
      success: true,
      missedSessions: missedSessionsDetected,
      newMissedCount,
      newMissedHours,
      totalMissedCount: plan.missedCount,
      totalMissedHours: plan.totalMissedHours,
      currentStats,
      needsAdjustment: newMissedCount > 0 || plan.missedCount >= (plan.autoAdjustmentSettings?.weeklyResetThreshold || 7)
    };

  } catch (error) {
    logger.error('Error in detectAndMarkMissedSessions:', error);
    return {
      success: false,
      error: error.message,
      missedSessions: []
    };
  }
}

/**
 * Get detailed plan status including day 1 comparison
 * @param {Object} plan - Cycling plan object
 * @returns {Object} Current plan status
 */
function getCurrentPlanStatus(plan) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find day 1 (first session)
  const day1Session = plan.dailySessions[0];
  const day1Date = new Date(day1Session?.date);
  day1Date.setHours(0, 0, 0, 0);

  // Calculate days since start
  const daysSinceStart = Math.floor((today - day1Date) / (1000 * 60 * 60 * 24));
  
  // Find today's session
  const todaySession = plan.dailySessions.find(session => {
    const sessionDate = new Date(session.date);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate.getTime() === today.getTime();
  });

  // Calculate completion rate
  const completedSessions = plan.dailySessions.filter(s => s.status === 'completed').length;
  const totalExpectedByNow = Math.min(daysSinceStart + 1, plan.dailySessions.length);
  const completionRate = totalExpectedByNow > 0 ? (completedSessions / totalExpectedByNow) * 100 : 0;

  return {
    day1Date: day1Date.toISOString().split('T')[0],
    currentDate: today.toISOString().split('T')[0],
    daysSinceStart: Math.max(0, daysSinceStart),
    day1Status: day1Session?.status || 'pending',
    day1Missed: day1Session?.status === 'missed',
    todaySession: todaySession ? {
      dayNumber: plan.dailySessions.indexOf(todaySession) + 1,
      status: todaySession.status,
      plannedHours: todaySession.plannedHours,
      completedHours: todaySession.completedHours || 0
    } : null,
    completionRate: Math.round(completionRate),
    totalExpectedByNow,
    completedSessions,
    missedSessions: plan.missedCount,
    onTrack: plan.missedCount <= Math.floor(daysSinceStart * 0.1) // Allow 10% miss rate
  };
}

/**
 * Real-time missed session checker (called on app startup/navigation)
 * @param {string} userId - User ID
 * @returns {Object} Real-time status with missed session alerts
 */
export async function realtimeMissedSessionCheck(userId) {
  try {
    // Check if user has an active plan first
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    // NEW: Handle case when user has no active plan
    if (!plan) {
      return {
        success: true,
        alerts: [],
        stats: {
          hasActivePlan: false,
          day1Status: 'no_plan',
          day1Missed: false,
          day1Date: null,
          daysSinceStart: 0,
          completionRate: 0,
          totalSessions: 0,
          completedSessions: 0,
          missedSessions: 0
        },
        missedSessions: [],
        autoDetected: false,
        message: 'No active cycling plan found. Create a plan to start tracking sessions.'
      };
    }

    // First detect and mark any new missed sessions
    const detectionResult = await detectAndMarkMissedSessions(userId);
    
    if (!detectionResult.success) {
      // If detection failed, return default stats for existing plan
      const basicStats = await getCurrentPlanStatus(plan);
      return {
        success: true,
        alerts: [],
        stats: basicStats,
        missedSessions: [],
        autoDetected: false,
        message: detectionResult.error
      };
    }

    // Generate user-friendly alerts
    const alerts = [];
    
    // FIXED: Only show alerts for unacknowledged missed sessions
    const unacknowledgedMissedSessions = plan.dailySessions.filter(session => 
      session.status === 'missed' && !session.acknowledged
    );
    
    if (detectionResult.newMissedCount > 0 || unacknowledgedMissedSessions.length > 0) {
      const totalUnacknowledged = unacknowledgedMissedSessions.length;
      
      if (totalUnacknowledged > 0) {
        alerts.push({
          type: 'missed_detected',
          severity: 'warning',
          title: `${totalUnacknowledged} Missed Session${totalUnacknowledged > 1 ? 's' : ''} Need Attention`,
          message: `You have ${totalUnacknowledged} missed session(s) that need to be addressed. Don't worry, we can adjust your plan!`,
          action: 'adjust_plan',
          missedDays: totalUnacknowledged
        });
      }
    }

    if (detectionResult.currentStats.day1Missed) {
      // Only show day 1 alert if it's not acknowledged
      const day1Session = plan.dailySessions[0];
      if (day1Session && day1Session.status === 'missed' && !day1Session.acknowledged) {
        alerts.push({
          type: 'day1_missed',
          severity: 'info',
          title: 'Day 1 was missed',
          message: `Your cycling journey started on ${detectionResult.currentStats.day1Date} but wasn't completed.`,
          action: 'motivational'
        });
      }
    }

    if (detectionResult.needsAdjustment && unacknowledgedMissedSessions.length > 0) {
      const adjustmentType = unacknowledgedMissedSessions.length >= 7 ? 'reset' : 'redistribute';
      alerts.push({
        type: 'adjustment_needed',
        severity: adjustmentType === 'reset' ? 'error' : 'warning',
        title: adjustmentType === 'reset' ? 'Plan Reset Recommended' : 'Plan Adjustment Available',
        message: adjustmentType === 'reset' 
          ? 'You\'ve missed a week+ of sessions. A fresh start might be better!'
          : 'We can redistribute your missed hours across remaining days.',
        action: adjustmentType,
        missedDays: unacknowledgedMissedSessions.length
      });
    }

    return {
      success: true,
      alerts,
      stats: detectionResult.currentStats,
      missedSessions: detectionResult.missedSessions,
      autoDetected: detectionResult.newMissedCount > 0
    };

  } catch (error) {
    logger.error('Error in realtimeMissedSessionCheck:', error);
    return {
      success: false,
      error: error.message,
      alerts: []
    };
  }
}

/**
 * Get missed session summary for UI display
 * @param {string} userId - User ID  
 * @returns {Object} Missed session summary
 */
export async function getMissedSessionSummary(userId) {
  try {
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return {
        success: false,
        error: 'No active plan found'
      };
    }

    const missedSessions = plan.dailySessions
      .filter(session => session.status === 'missed')
      .map((session, index) => ({
        date: session.date,
        dayNumber: plan.dailySessions.indexOf(session) + 1,
        plannedHours: session.plannedHours,
        missedHours: session.missedHours || session.plannedHours,
        daysAgo: Math.floor((new Date() - new Date(session.date)) / (1000 * 60 * 60 * 24))
      }));

    const currentStats = getCurrentPlanStatus(plan);

    return {
      success: true,
      missedSessions,
      summary: {
        totalMissed: plan.missedCount,
        totalMissedHours: plan.totalMissedHours,
        day1Missed: currentStats.day1Missed,
        completionRate: currentStats.completionRate,
        onTrack: currentStats.onTrack
      }
    };

  } catch (error) {
    logger.error('Error in getMissedSessionSummary:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  detectAndMarkMissedSessions,
  realtimeMissedSessionCheck,
  getMissedSessionSummary
};
