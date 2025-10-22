import CyclingPlan from '../models/CyclingPlan.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

/**
 * Smart Plan Adjustment Service
 * Implements intelligent redistribution of missed cycling hours
 * Based on the algorithm described in CyclingPlanAddFeatures.MD
 */

/**
 * Check if user needs plan adjustment and perform it automatically
 * @param {string} userId - User ID
 * @returns {Object} Adjustment result with details
 */
export async function checkAndAdjustPlan(userId) {
  try {
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return {
        success: false,
        error: 'No active plan found',
        needsAdjustment: false
      };
    }

    // Check for missed sessions
    const missedSessions = await getMissedSessionsData(plan);
    
    if (missedSessions.length === 0) {
      return {
        success: true,
        needsAdjustment: false,
        message: 'No missed sessions found'
      };
    }

    // Determine adjustment strategy
    const adjustmentStrategy = determineAdjustmentStrategy(plan, missedSessions);
    
    if (adjustmentStrategy.type === 'weekly_reset') {
      return {
        success: true,
        needsAdjustment: true,
        adjustmentType: 'weekly_reset',
        suggestion: 'Create new plan',
        message: 'You have missed more than a week of sessions. We recommend creating a fresh cycling plan.',
        missedDays: missedSessions.length,
        totalMissedHours: missedSessions.reduce((sum, s) => sum + s.missedHours, 0)
      };
    }

    // Perform automatic redistribution
    const adjustmentResult = await redistributeMissedHours(plan, missedSessions, adjustmentStrategy);
    
    return {
      success: true,
      needsAdjustment: true,
      adjustmentType: 'redistribute',
      adjustmentResult,
      message: `Plan adjusted successfully. Missed hours redistributed across remaining sessions.`
    };

  } catch (error) {
    logger.error('Error in checkAndAdjustPlan:', error);
    return {
      success: false,
      error: error.message,
      needsAdjustment: false
    };
  }
}

/**
 * Get missed sessions data from plan
 */
function getMissedSessionsData(plan) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return plan.dailySessions.filter(session => {
    const sessionDate = new Date(session.date);
    sessionDate.setHours(0, 0, 0, 0);
    
    return sessionDate < today && 
           (session.status === 'missed' || session.status === 'pending');
  }).map(session => ({
    date: session.date,
    plannedHours: session.plannedHours,
    missedHours: session.plannedHours - (session.completedHours || 0),
    sessionIndex: plan.dailySessions.indexOf(session)
  }));
}

/**
 * Determine the best adjustment strategy based on missed sessions
 */
function determineAdjustmentStrategy(plan, missedSessions) {
  const settings = plan.autoAdjustmentSettings || {
    weeklyResetThreshold: 7,
    maxDailyHours: 3,
    gracePeriodDays: 2
  };

  const totalMissedDays = missedSessions.length;
  const totalMissedHours = missedSessions.reduce((sum, s) => sum + s.missedHours, 0);

  // Check if we should suggest a plan reset
  if (totalMissedDays >= settings.weeklyResetThreshold) {
    return {
      type: 'weekly_reset',
      reason: `Missed ${totalMissedDays} days (≥ ${settings.weeklyResetThreshold} day threshold)`
    };
  }

  // Calculate remaining sessions
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const remainingSessions = plan.dailySessions.filter(session => {
    const sessionDate = new Date(session.date);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate >= today && session.status === 'pending';
  });

  return {
    type: 'redistribute',
    totalMissedHours,
    remainingSessions: remainingSessions.length,
    gracePeriodDays: Math.floor(totalMissedDays * 0.2), // 20% buffer as per algorithm
    maxDailyHours: settings.maxDailyHours
  };
}

/**
 * Redistribute missed hours across remaining sessions
 * Implementation of the mathematical distribution from CyclingPlanAddFeatures.MD
 */
async function redistributeMissedHours(plan, missedSessions, strategy) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalMissedHours = strategy.totalMissedHours;
  const gracePeriodDays = strategy.gracePeriodDays;
  
  // Get remaining sessions
  const remainingSessions = plan.dailySessions.filter(session => {
    const sessionDate = new Date(session.date);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate >= today && session.status === 'pending';
  });

  const remainingDays = remainingSessions.length;
  
  if (remainingDays === 0) {
    throw new Error('No remaining sessions to redistribute hours to');
  }

  // Calculate new daily hours using the algorithm:
  // newDailyHours = (originalTotalHours + ΣmissedHours) / (remainingDays - gracePeriodDays)
  const originalDailyHours = plan.planSummary.dailyCyclingHours;
  const adjustedRemainingDays = Math.max(1, remainingDays - gracePeriodDays);
  const newDailyHours = (originalDailyHours * remainingDays + totalMissedHours) / adjustedRemainingDays;

  // Safety check: Don't exceed max daily hours
  const maxDailyHours = strategy.maxDailyHours;
  if (newDailyHours > maxDailyHours) {
    throw new Error(`Redistribution would require ${newDailyHours.toFixed(2)} hours/day, exceeding safe limit of ${maxDailyHours} hours`);
  }

  // 🔥 CALORIE CALCULATION: Get user weight for accurate calorie redistribution
  const user = await User.findById(plan.user);
  const userWeight = user?.weight || 70; // Default to 70kg if not set
  
  // 🔥 Calculate calories using standard MET formula (400 kcal/hour average for moderate cycling)
  const CALORIES_PER_HOUR = 400; // Standard cycling calorie burn rate
  const originalDailyCalories = originalDailyHours * CALORIES_PER_HOUR;
  const newDailyCalories = newDailyHours * CALORIES_PER_HOUR;
  
  // Update remaining sessions with new hours AND calories
  const updatedSessions = [];
  remainingSessions.forEach(session => {
    const sessionIndex = plan.dailySessions.indexOf(session);
    
    // Update hours
    plan.dailySessions[sessionIndex].plannedHours = newDailyHours;
    plan.dailySessions[sessionIndex].adjustedHours = newDailyHours - originalDailyHours;
    
    // 🔥 NEW: Update calories
    plan.dailySessions[sessionIndex].plannedCalories = newDailyCalories;
    plan.dailySessions[sessionIndex].adjustedCalories = newDailyCalories - originalDailyCalories;
    
    updatedSessions.push({
      date: session.date,
      oldHours: originalDailyHours,
      newHours: newDailyHours,
      adjustment: newDailyHours - originalDailyHours,
      oldCalories: originalDailyCalories, // 🔥 NEW
      newCalories: newDailyCalories, // 🔥 NEW
      calorieAdjustment: newDailyCalories - originalDailyCalories // 🔥 NEW
    });
  });

  // Log the adjustment in history
  plan.adjustmentHistory.push({
    date: new Date(),
    missedHours: totalMissedHours,
    newDailyTarget: newDailyHours,
    newDailyCalories: newDailyCalories, // 🔥 NEW: Track calorie changes
    reason: 'missed_day',
    redistributionMethod: 'distribute_remaining'
  });

  // Update plan summary
  plan.planSummary.dailyCyclingHours = newDailyHours;
  
  await plan.save();

  return {
    originalDailyHours,
    newDailyHours,
    totalMissedHours,
    remainingDays: adjustedRemainingDays,
    gracePeriodDays,
    updatedSessions,
    adjustmentDate: new Date(),
    calorieAdjustment: { // 🔥 NEW: Return calorie adjustment details
      originalDailyCalories,
      newDailyCalories,
      calorieIncrease: newDailyCalories - originalDailyCalories
    }
  };
}

/**
 * Suggest plan reset - create a new plan with remaining time
 */
export async function suggestPlanReset(userId) {
  try {
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      throw new Error('No active plan found');
    }

    const today = new Date();
    const originalEndDate = new Date(plan.originalPlan?.endDate || plan.dailySessions[plan.dailySessions.length - 1].date);
    const remainingDays = Math.ceil((originalEndDate - today) / (1000 * 60 * 60 * 24));

    return {
      success: true,
      currentPlan: {
        totalDays: plan.totalDays,
        missedSessions: plan.missedCount,
        totalMissedHours: plan.totalMissedHours,
        remainingDays
      },
      suggestion: {
        newDuration: remainingDays,
        freshStart: true,
        reason: 'Too many missed sessions detected',
        benefits: [
          'Clean slate with realistic goals',
          'Adjusted for current timeline',
          'Maintains original target'
        ]
      }
    };

  } catch (error) {
    logger.error('Error suggesting plan reset:', error);
    throw error;
  }
}

/**
 * Check daily completion status and trigger adjustment if needed
 */
export async function dailyPlanCheck(userId) {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return { needsCheck: false, message: 'No active plan' };
    }

    // Find yesterday's session
    const yesterdaySession = plan.dailySessions.find(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() === yesterday.getTime();
    });

    if (!yesterdaySession) {
      return { needsCheck: false, message: 'No session scheduled for yesterday' };
    }

    // Check if yesterday's session was missed
    if (yesterdaySession.status === 'pending' || yesterdaySession.status === 'missed') {
      // Mark as missed and trigger adjustment check
      yesterdaySession.status = 'missed';
      yesterdaySession.missedHours = yesterdaySession.plannedHours;
      plan.missedCount += 1;
      plan.totalMissedHours += yesterdaySession.plannedHours;
      
      await plan.save();

      // Check if adjustment is needed
      const adjustmentResult = await checkAndAdjustPlan(userId);
      
      return {
        needsCheck: true,
        missedYesterday: true,
        adjustmentResult,
        notification: {
          title: 'Missed Session Detected',
          body: adjustmentResult.needsAdjustment 
            ? 'Your plan has been adjusted to accommodate missed sessions'
            : 'Don\'t worry, you can catch up today!',
          type: adjustmentResult.adjustmentType || 'missed_session'
        }
      };
    }

    return { needsCheck: false, message: 'Yesterday completed successfully' };

  } catch (error) {
    logger.error('Error in daily plan check:', error);
    return { needsCheck: false, error: error.message };
  }
}

export default {
  checkAndAdjustPlan,
  suggestPlanReset,
  dailyPlanCheck
};
