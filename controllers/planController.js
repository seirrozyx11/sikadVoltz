import {
  generateCyclingPlan,
  logSession as recordSessionService,
  updateSessionProgressLegacy as updateSessionProgressService,
  emergencyCatchUp
} from '../services/calorieService.js';
import { 
  checkAndAdjustPlan, 
  suggestPlanReset, 
  dailyPlanCheck 
} from '../services/smartPlanAdjustment.js';
import {
  detectAndMarkMissedSessions,
  realtimeMissedSessionCheck,
  getMissedSessionSummary
} from '../services/missedSessionDetector.js';
import CyclingPlan from '../models/CyclingPlan.js';
import User from '../models/User.js'; // 🚨 ADD: User model import for profile access
import SessionTrackerService from '../services/session_tracker_service.js';
import logger from '../utils/logger.js'; // 🚨 ADD: Logger import for real-time session updates

// Helper function for consistent error responses
const errorResponse = (res, status, message, details = null) => {
  return res.status(status).json({
    success: false,
    error: message,
    ...(details && { details })
  });
};

// Create a new cycling plan
export const createPlan = async (req, res) => {
  try {
    const { goalId } = req.body;
    const userId = req.user?.userId; // Fixed: use userId instead of _id

    if (!goalId) {
      return errorResponse(res, 400, 'Missing required field: goalId');
    }
    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const planData = await generateCyclingPlan(userId, goalId);
    
    const cyclingPlan = new CyclingPlan({
      ...planData,
      planSummary: planData.planSummary
    });
    
    await cyclingPlan.save();

    res.status(201).json({
      success: true,
      data: cyclingPlan
    });
  } catch (error) {
    console.error('Error creating plan:', error);
    errorResponse(res, 500, 'Failed to create plan', error.message);
  }
};

// Record a completed session
/**
 * Update session progress in real-time during cycling
 * Enhanced with better error handling and validation
 */
// In planController.js
export const updateSessionProgress = async (req, res) => {
  try {
    const { sessionId, completedHours, planId, intensity = 'moderate' } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    // Get user to access profile data
    const user = await User.findById(userId);
    if (!user || !user.profile) {
      return errorResponse(res, 400, 'User profile not complete');
    }

    // Calculate calories using profile data
    const calcResult = await calculateCyclingCalories(
      userId,
      completedHours,
      intensity // Use intensity from request or default to 'moderate'
    );

    if (!calcResult.success) {
      return errorResponse(res, 400, calcResult.error);
    }

    // Update session with calculated calories
    const result = await SessionTrackerService.updateSessionProgress(userId, {
      sessionId,
      completedHours,
      caloriesBurned: calcResult.caloriesBurned,
      planId
    });

    if (result.success) {
      res.json({
        success: true,
        data: {
          ...result.data,
          calculationDetails: calcResult.details
        }
      });
    } else {
      errorResponse(res, 400, result.error);
    }
  } catch (error) {
    console.error('Error updating session progress:', error);
    errorResponse(res, 500, 'Failed to update session progress', error.message);
  }
};

// 🚨 NEW: Real-time session progress update for ESP32 telemetry
export const updateSessionProgressRealtime = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { distance, speed, sessionTime, watts, voltage, intensity = 2, sessionActive = false } = req.body;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // 🚨 NEW: Only update session progress if session is actively started
    if (!sessionActive && sessionTime === 0) {
      return res.json({
        success: true,
        message: 'ESP32 data received but no active session',
        data: {
          dataReceived: true,
          sessionActive: false,
          intensity: intensity,
          message: 'Distance tracking only during active sessions'
        }
      });
    }
    
    // Find user's active plan
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active cycling plan found'
      });
    }
    
    // Find today's session
    const today = new Date().toISOString().split('T')[0];
    const todaySession = plan.dailySessions.find(session => 
      session.date.toISOString().split('T')[0] === today
    );
    
    if (!todaySession) {
      return res.status(404).json({
        success: false,
        error: 'No cycling session scheduled for today'
      });
    }
    
    // 🚨 FIXED: Only update distance and metrics during active sessions
    // Store the previous distance to calculate incremental distance for this active session
    const previousDistance = todaySession.currentDistance || 0;
    
    // Update session with real-time data only if session is active
    if (sessionActive || sessionTime > 0) {
      todaySession.currentDistance = distance || 0;
      todaySession.currentSpeed = speed || 0;
      todaySession.sessionTime = sessionTime || 0;
      todaySession.currentWatts = watts || 0;
      todaySession.voltage = voltage || 0;
      todaySession.intensity = intensity || 2; // Store current intensity level
      
      // Calculate real-time calories using intensity-based calculation
      const sessionTimeHours = (sessionTime || 0) / 3600; // Convert seconds to hours
      
      // Get user weight from profile if available, otherwise use default
      let userWeight = 75; // Default weight
      try {
        const user = await User.findById(userId);
        if (user?.profile?.weight) {
          userWeight = user.profile.weight;
        }
      } catch (error) {
        logger.warn(`Could not load user profile for calorie calculation, using default weight: ${error.message}`);
      }
      
      // Enhanced calorie calculation: either from watts or intensity-based estimation
      let caloriesPerHour;
      if (watts && watts > 0) {
        // Power-based calculation (most accurate)
        caloriesPerHour = (watts * 3.6) / 4.184; // Watts to calories/hour conversion
      } else {
        // Intensity-based calculation using MET values from ESP32
        const metValues = {
          0: 0.0,   // Stopped
          1: 2.0,   // Coasting
          2: 4.0,   // Light/Casual
          3: 8.0,   // Moderate
          4: 12.0   // Vigorous/Rapid
        };
        const met = metValues[intensity] || 8.0; // Default to moderate
        caloriesPerHour = met * userWeight; // MET * weight = calories/hour
      }
      
      todaySession.caloriesBurned = sessionTimeHours * caloriesPerHour;
      
      // Update session status
      if (sessionTime > 0) {
        todaySession.status = 'progress'; // ✅ FIXED: Match frontend calendar expectations
      }
      
      // Save the updated plan
      await plan.save();
      
      logger.info(`✅ Real-time session update for user ${userId}`, {
        distance,
        speed,
        sessionTime,
        intensity,
        calories: todaySession.caloriesBurned,
        status: todaySession.status,
        sessionActive
      });
      
      res.json({
        success: true,
        message: 'Session progress updated successfully',
        data: {
          sessionId: todaySession._id,
          distance: todaySession.currentDistance,
          speed: todaySession.currentSpeed,
          sessionTime: todaySession.sessionTime,
          intensity: todaySession.intensity,
          calories: Math.round(todaySession.caloriesBurned),
          watts: todaySession.currentWatts,
          voltage: todaySession.voltage,
          status: todaySession.status,
          dayNumber: plan.dailySessions.indexOf(todaySession) + 1,
          sessionActive: true
        }
      });
    } else {
      // Session not active, just acknowledge the data but don't update session progress
      res.json({
        success: true,
        message: 'ESP32 data received but session not active',
        data: {
          dataReceived: true,
          sessionActive: false,
          currentSpeed: speed || 0,
          currentWatts: watts || 0,
          message: 'Start your workout session to begin tracking distance and calories'
        }
      });
    }
    
  } catch (error) {
    logger.error('❌ Error updating real-time session progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update session progress',
      details: error.message
    });
  }
};

/**
 * Complete a session and finalize the progress
 * Enhanced with better validation and error handling
 */
export const completeSession = async (req, res) => {
  try {
    const { sessionId, finalCalories, finalHours } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const result = await SessionTrackerService.completeSession(userId, {
      sessionId,
      finalCalories,
      finalHours
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Session completed successfully',
        data: result.data
      });
    } else {
      return errorResponse(res, 400, result.error);
    }

  } catch (error) {
    console.error('Error completing session:', error);
    errorResponse(res, 500, 'Failed to complete session', error.message);
  }
};

// Helper function to record calorie activity
async function recordCalorieActivity(userId, activityData) {
  try {
    const User = (await import('../models/User.js')).default;
    
    const user = await User.findById(userId);
    if (!user) return;

    if (!user.activityLog) {
      user.activityLog = [];
    }

    const activity = {
      type: activityData.type || 'cycling',
      duration: activityData.duration || 0,
      calories: activityData.calories || 0,
      sessionId: activityData.sessionId,
      date: activityData.timestamp || new Date(),
      metadata: {
        source: 'session_tracker',
        planId: activityData.planId
      }
    };

    user.activityLog.push(activity);
    await user.save();
    
    console.log(`Logged ${activity.calories} calories for user ${userId}`);
  } catch (error) {
    throw new Error(`Failed to record calorie activity: ${error.message}`);
  }
}

// Handle missed session
export const missedSession = async (req, res) => {
  try {
    const { date } = req.body;
    const { id: planId } = req.params;

    if (!planId || !date) {
      return errorResponse(res, 400, 'Missing required fields: planId and date');
    }

    const missedDate = new Date(date);
    if (isNaN(missedDate.getTime())) {
      return errorResponse(res, 400, 'Invalid date format');
    }

    // Find the plan and mark session as missed
    const plan = await CyclingPlan.findById(planId);
    if (!plan) {
      return errorResponse(res, 404, 'Plan not found');
    }

    // Find the session for the missed date
    const sessionIndex = plan.dailySessions.findIndex(session => 
      session.date.toDateString() === missedDate.toDateString()
    );

    if (sessionIndex === -1) {
      return errorResponse(res, 404, 'Session not found for the specified date');
    }

    const session = plan.dailySessions[sessionIndex];
    session.status = 'missed';
    session.missedHours = session.plannedHours;
    plan.missedCount += 1;
    plan.totalMissedHours += session.plannedHours;

    // Carry over missed hours to next available session
    for (let i = sessionIndex + 1; i < plan.dailySessions.length; i++) {
      const nextSession = plan.dailySessions[i];
      if (nextSession.status === 'pending') {
        nextSession.adjustedHours += session.plannedHours;
        break;
      }
    }

    // Auto-pause plan after 3 missed days
    if (plan.missedCount >= 3) {
      plan.isActive = false;
    }

    await plan.save();

    res.json({
      success: true,
      data: plan
    });
  } catch (error) {
    console.error('Error handling missed session:', error);
    errorResponse(res, 500, 'Failed to handle missed session', error.message);
  }
};

// Get user's current plan
export const getCurrentPlan = async (req, res) => {
  try {
    const userId = req.user?.userId; // Fixed: use userId instead of _id

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const plan = await CyclingPlan.findOne({ user: userId })
      .sort({ createdAt: -1 }) // Get the most recent plan
      .populate('goal');

    if (!plan) {
      return errorResponse(res, 404, 'No active plan found');
    }

    // Calculate real-time totals including active sessions
    const activeSessionCalories = plan.activeSessions
      ?.filter(s => s.isActive)
      ?.reduce((sum, s) => sum + s.caloriesBurned, 0) || 0;

    const activeSessionHours = plan.activeSessions
      ?.filter(s => s.isActive)
      ?.reduce((sum, s) => sum + s.completedHours, 0) || 0;

    // Get today's session with progress
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySession = plan.dailySessions.find(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() === today.getTime();
    });

    const responseData = {
      ...plan.toObject(),
      realtimeStats: {
        totalCompletedHours: (plan.completedHours || 0) + activeSessionHours,
        totalCaloriesBurned: activeSessionCalories,
        activeSessionCount: plan.activeSessions?.filter(s => s.isActive)?.length || 0
      },
      todaySession: todaySession ? {
        ...todaySession,
        realtimeProgress: {
          calories: todaySession.progressCalories || 0,
          hours: todaySession.progressHours || 0
        }
      } : null
    };

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error getting current plan:', error);
    errorResponse(res, 500, 'Failed to retrieve plan', error.message);
  }
};

// Allow user to edit plan if missed 5 days
export const allowEditPlan = async (req, res) => {
  try {
    const { id: planId } = req.params;
    
    const plan = await CyclingPlan.findById(planId);
    if (!plan) {
      return errorResponse(res, 404, 'Plan not found');
    }
    
    // Allow editing if user missed 5 or more days
    const canEdit = plan.missedCount >= 5;
    
    res.json({ success: true, canEdit: canEdit });
  } catch (error) {
    errorResponse(res, 500, 'Failed to check edit permission', error.message);
  }
};

// Emergency catch-up endpoint
export const triggerEmergencyCatchUp = async (req, res) => {
  try {
    const { id: planId } = req.params;
    const plan = await emergencyCatchUp(planId);
    res.json({ success: true, plan });
  } catch (error) {
    errorResponse(res, 500, 'Failed to trigger emergency catch-up', error.message);
  }
};

// Reminder endpoint (for admin/cron)
export const remindMissedGoals = async (req, res) => {
  try {
    // Find all users with active plans that have missed sessions
    const plansWithMissedSessions = await CyclingPlan.find({
      isActive: true,
      missedCount: { $gt: 0 }
    }).populate('user');
    
    // In a real implementation, you would send emails/notifications here
    // For now, just return the count of users that need reminders
    const usersToRemind = plansWithMissedSessions.length;
    
    res.json({ 
      success: true, 
      message: `Reminders would be sent to ${usersToRemind} users`,
      usersToRemind: usersToRemind
    });
  } catch (error) {
    errorResponse(res, 500, 'Failed to send reminders', error.message);
  }
};

// Mark current day as complete
export const markDayComplete = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { completedDate } = req.body;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    // Find the active plan for the user
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return errorResponse(res, 404, 'No active plan found');
    }

    const targetDate = completedDate ? new Date(completedDate) : new Date();
    
    // Find today's session
    const today = new Date(targetDate);
    today.setHours(0, 0, 0, 0);

    const sessionIndex = plan.dailySessions.findIndex(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() === today.getTime();
    });

    if (sessionIndex === -1) {
      return errorResponse(res, 404, 'No session found for today');
    }

    const session = plan.dailySessions[sessionIndex];
    
    if (session.status === 'completed') {
      return res.json({
        success: true,
        message: 'Day already marked as complete',
        data: plan
      });
    }

    // Mark session as completed
    session.status = 'completed';
    session.completedHours = session.plannedHours + (session.adjustedHours || 0);
    session.completedAt = new Date();

    // Update plan statistics
    plan.completedDays = (plan.completedDays || 0) + 1;
    plan.completedHours = (plan.completedHours || 0) + session.completedHours;

    await plan.save();

    res.json({
      success: true,
      message: `Day ${plan.completedDays} completed successfully!`,
      data: {
        completedDays: plan.completedDays,
        totalDays: plan.planSummary.totalPlanDays,
        completedHours: plan.completedHours,
        totalHours: plan.planSummary.totalCyclingHours
      }
    });

  } catch (error) {
    console.error('Error marking day as complete:', error);
    errorResponse(res, 500, 'Failed to mark day as complete', error.message);
  }
};

// Get missed sessions for current user
export const getMissedSessions = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    // Find the active plan for the user
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    // NEW: Handle case when user has no active plan yet
    if (!plan) {
      return res.json({
        success: true,
        data: {
          missedSessions: [],
          todaySession: null,
          totalMissedCount: 0,
          totalMissedHours: 0,
          hasActivePlan: false,
          message: 'No active cycling plan found. Create a plan to start tracking sessions.'
        }
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get missed sessions (past due dates with status 'missed' or 'pending')
    const missedSessions = plan.dailySessions.filter(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      
      return sessionDate < today && 
             (session.status === 'missed' || session.status === 'pending');
    });

    // Get today's session
    const todaySession = plan.dailySessions.find(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() === today.getTime();
    });

    res.json({
      success: true,
      data: {
        missedSessions: missedSessions.map(session => ({
          date: session.date,
          dateFormatted: new Date(session.date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short', 
            day: 'numeric'
          }),
          plannedHours: session.plannedHours,
          status: session.status,
          dayNumber: plan.dailySessions.indexOf(session) + 1,
          planName: plan.planName || 'Cycling Session'
        })),
        todaySession: todaySession ? {
          date: todaySession.date,
          plannedHours: todaySession.plannedHours,
          completedHours: todaySession.completedHours,
          status: todaySession.status,
          dayNumber: plan.dailySessions.indexOf(todaySession) + 1
        } : null,
        totalMissedCount: plan.missedCount || 0,
        totalMissedHours: plan.totalMissedHours || 0,
        hasActivePlan: true,
        planStartDate: plan.dailySessions.length > 0 ? plan.dailySessions[0].date : null,
        planName: plan.planName
      }
    });

  } catch (error) {
    console.error('Error getting missed sessions:', error);
    return errorResponse(res, 500, 'Failed to get missed sessions', error.message);
  }
};

// Check daily session status
export const getDailySessionStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    // Find the active plan for the user
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.json({
        success: true,
        data: {
          hasActivePlan: false,
          todaySession: null,
          recommendation: 'Create a cycling plan to start tracking your progress!'
        }
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check missed sessions count for today
    const missedCount = plan.dailySessions.filter(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate < today && 
             (session.status === 'missed' || session.status === 'pending');
    }).length;

    // Get today's session
    const todaySession = plan.dailySessions.find(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() === today.getTime();
    });

    let recommendation = '';
    if (todaySession) {
      if (todaySession.status === 'completed') {
        recommendation = 'Great job! You completed today\'s session. Keep up the good work!';
      } else if (todaySession.status === 'pending') {
        recommendation = `Time to cycle! You have ${todaySession.plannedHours} hours planned for today.`;
      }
    } else {
      recommendation = 'No session planned for today. Rest day or catch up on missed sessions!';
    }

    if (missedCount > 0) {
      recommendation += ` You have ${missedCount} missed session${missedCount > 1 ? 's' : ''} to catch up on.`;
    }

    res.json({
      success: true,
      data: {
        hasActivePlan: true,
        todaySession: todaySession ? {
          date: todaySession.date,
          plannedHours: todaySession.plannedHours,
          completedHours: todaySession.completedHours,
          status: todaySession.status,
          dayNumber: plan.dailySessions.indexOf(todaySession) + 1
        } : null,
        missedCount,
        totalMissedHours: plan.totalMissedHours,
        recommendation,
        streakData: {
          currentStreak: calculateCurrentStreak(plan.dailySessions),
          longestStreak: calculateLongestStreak(plan.dailySessions)
        }
      }
    });

  } catch (error) {
    console.error('Error checking daily session status:', error);
    errorResponse(res, 500, 'Failed to check session status', error.message);
  }
};

// Get upcoming sessions (next 7 days)
export const getUpcomingSessions = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    // Find the active plan for the user
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.json({
        success: true,
        data: {
          upcomingSessions: [],
          hasActivePlan: false
        }
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    // Get sessions for the next 7 days
    const upcomingSessions = plan.dailySessions.filter(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      
      return sessionDate >= today && sessionDate < nextWeek;
    }).map(session => ({
      date: session.date,
      plannedHours: session.plannedHours,
      completedHours: session.completedHours,
      status: session.status,
      dayNumber: plan.dailySessions.indexOf(session) + 1,
      isToday: session.date.toDateString() === today.toDateString()
    }));

    res.json({
      success: true,
      data: {
        upcomingSessions,
        hasActivePlan: true,
        planSummary: plan.planSummary
      }
    });

  } catch (error) {
    console.error('Error getting upcoming sessions:', error);
    errorResponse(res, 500, 'Failed to get upcoming sessions', error.message);
  }
};

// Helper function to calculate current streak
function calculateCurrentStreak(sessions) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let streak = 0;
  const reversedSessions = [...sessions].reverse();
  
  for (const session of reversedSessions) {
    const sessionDate = new Date(session.date);
    sessionDate.setHours(0, 0, 0, 0);
    
    if (sessionDate >= today) continue; // Skip future sessions
    
    if (session.status === 'completed') {
      streak++;
    } else {
      break;
    }
  }
  
  return streak;
}

// Helper function to calculate longest streak
function calculateLongestStreak(sessions) {
  let maxStreak = 0;
  let currentStreak = 0;
  
  for (const session of sessions) {
    if (session.status === 'completed') {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  
  return maxStreak;
}

// 📅 NEW FEATURE: Calendar Integration
export const getCalendarData = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { year, month } = req.params;
    
    const targetYear = parseInt(year);
    const targetMonth = parseInt(month) - 1; // JavaScript months are 0-indexed
    
    // Find active plan
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active cycling plan found'
      });
    }

    // Get sessions for the specific month
    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0);
    
    const monthSessions = plan.dailySessions.filter(session => {
      const sessionDate = new Date(session.date);
      return sessionDate >= startDate && sessionDate <= endDate;
    });

    // Format calendar data
    const calendarData = monthSessions.map(session => {
      // ✅ FIXED: Map backend status to frontend calendar expectations
      let calendarStatus = session.status;
      if (calendarStatus === 'pending') {
        calendarStatus = 'scheduled'; // Map 'pending' to 'scheduled' for frontend calendar
      }
      
      return {
        date: session.date.toISOString().split('T')[0],
        plannedHours: session.plannedHours,
        completedHours: session.completedHours,
        status: calendarStatus, // Use mapped status
        caloriesBurned: session.caloriesBurned,
        missedHours: session.missedHours,
        adjustedHours: session.adjustedHours,
        isToday: new Date(session.date).toDateString() === new Date().toDateString()
      };
    });

    // Calculate month statistics
    const monthStats = {
      totalSessions: monthSessions.length,
      completedSessions: monthSessions.filter(s => s.status === 'completed').length,
      missedSessions: monthSessions.filter(s => s.status === 'missed').length,
      totalPlannedHours: monthSessions.reduce((sum, s) => sum + s.plannedHours, 0),
      totalCompletedHours: monthSessions.reduce((sum, s) => sum + s.completedHours, 0),
      totalCaloriesBurned: monthSessions.reduce((sum, s) => sum + s.caloriesBurned, 0)
    };

    res.json({
      success: true,
      data: {
        year: targetYear,
        month: targetMonth + 1,
        sessions: calendarData,
        statistics: monthStats
      }
    });

  } catch (error) {
    console.error('Calendar data fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch calendar data'
    });
  }
};

// 📅 NEW FEATURE: Enable Session Reminders
export const enableSessionReminders = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { reminderTime, daysBeforeReminder = 1 } = req.body;

    // Update user preferences for reminders (we'd need to add this to User model)
    // For now, we'll store in the cycling plan
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active cycling plan found'
      });
    }

    // Add reminder settings to plan (would be better in User model)
    plan.reminderSettings = {
      enabled: true,
      reminderTime: reminderTime || '18:00', // Default 6 PM
      daysBeforeReminder: daysBeforeReminder,
      lastUpdated: new Date()
    };

    await plan.save();

    res.json({
      success: true,
      message: 'Session reminders enabled',
      data: plan.reminderSettings
    });

  } catch (error) {
    console.error('Enable reminders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable session reminders'
    });
  }
};

// 📅 NEW FEATURE: Disable Session Reminders
export const disableSessionReminders = async (req, res) => {
  try {
    const userId = req.user?.userId;

    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active cycling plan found'
      });
    }

    if (plan.reminderSettings) {
      plan.reminderSettings.enabled = false;
      plan.reminderSettings.lastUpdated = new Date();
      await plan.save();
    }

    res.json({
      success: true,
      message: 'Session reminders disabled'
    });

  } catch (error) {
    console.error('Disable reminders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable session reminders'
    });
  }
};

// 📅 NEW FEATURE: Get Reminder Status
export const getReminderStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;

    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active cycling plan found'
      });
    }

    const reminderSettings = plan.reminderSettings || {
      enabled: false,
      reminderTime: '18:00',
      daysBeforeReminder: 1
    };

    res.json({
      success: true,
      data: reminderSettings
    });

  } catch (error) {
    console.error('Get reminder status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get reminder status'
    });
  }
};

// 📅 NEW FEATURE: Weekly Analytics
export const getWeeklyAnalytics = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { date } = req.query; // Optional date for specific week
    
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active cycling plan found'
      });
    }

    // Calculate week boundaries
    const targetDate = date ? new Date(date) : new Date();
    const startOfWeek = new Date(targetDate);
    startOfWeek.setDate(targetDate.getDate() - targetDate.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Get week sessions
    const weekSessions = plan.dailySessions.filter(session => {
      const sessionDate = new Date(session.date);
      return sessionDate >= startOfWeek && sessionDate <= endOfWeek;
    });

    // Calculate analytics
    const analytics = {
      weekPeriod: {
        start: startOfWeek.toISOString().split('T')[0],
        end: endOfWeek.toISOString().split('T')[0]
      },
      totalSessions: weekSessions.length,
      completedSessions: weekSessions.filter(s => s.status === 'completed').length,
      missedSessions: weekSessions.filter(s => s.status === 'missed').length,
      pendingSessions: weekSessions.filter(s => s.status === 'pending').length,
      totalPlannedHours: weekSessions.reduce((sum, s) => sum + s.plannedHours, 0),
      totalCompletedHours: weekSessions.reduce((sum, s) => sum + s.completedHours, 0),
      totalCaloriesBurned: weekSessions.reduce((sum, s) => sum + s.caloriesBurned, 0),
      completionRate: weekSessions.length > 0 ? 
        (weekSessions.filter(s => s.status === 'completed').length / weekSessions.length * 100).toFixed(1) : 0,
      dailyBreakdown: weekSessions.map(session => ({
        date: session.date.toISOString().split('T')[0],
        dayOfWeek: new Date(session.date).toLocaleDateString('en-US', { weekday: 'long' }),
        plannedHours: session.plannedHours,
        completedHours: session.completedHours,
        status: session.status,
        caloriesBurned: session.caloriesBurned
      }))
    };

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Weekly analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get weekly analytics'
    });
  }
};

// 📅 NEW FEATURE: Monthly Analytics
export const getMonthlyAnalytics = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { year, month } = req.query;
    
    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active cycling plan found'
      });
    }

    // Default to current month if not specified
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();
    
    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0);
    
    const monthSessions = plan.dailySessions.filter(session => {
      const sessionDate = new Date(session.date);
      return sessionDate >= startDate && sessionDate <= endDate;
    });

    // Calculate weekly breakdown for the month
    const weeks = [];
    let currentWeekStart = new Date(startDate);
    currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
    
    while (currentWeekStart <= endDate) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);
      
      const weekSessions = monthSessions.filter(session => {
        const sessionDate = new Date(session.date);
        return sessionDate >= currentWeekStart && sessionDate <= weekEnd;
      });
      
      weeks.push({
        weekNumber: weeks.length + 1,
        startDate: currentWeekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0],
        completedSessions: weekSessions.filter(s => s.status === 'completed').length,
        totalSessions: weekSessions.length,
        completedHours: weekSessions.reduce((sum, s) => sum + s.completedHours, 0),
        caloriesBurned: weekSessions.reduce((sum, s) => sum + s.caloriesBurned, 0)
      });
      
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }

    const analytics = {
      monthPeriod: {
        year: targetYear,
        month: targetMonth + 1,
        monthName: startDate.toLocaleDateString('en-US', { month: 'long' })
      },
      totalSessions: monthSessions.length,
      completedSessions: monthSessions.filter(s => s.status === 'completed').length,
      missedSessions: monthSessions.filter(s => s.status === 'missed').length,
      totalPlannedHours: monthSessions.reduce((sum, s) => sum + s.plannedHours, 0),
      totalCompletedHours: monthSessions.reduce((sum, s) => sum + s.completedHours, 0),
      totalCaloriesBurned: monthSessions.reduce((sum, s) => sum + s.caloriesBurned, 0),
      completionRate: monthSessions.length > 0 ? 
        (monthSessions.filter(s => s.status === 'completed').length / monthSessions.length * 100).toFixed(1) : 0,
      weeklyBreakdown: weeks
    };

    res.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Monthly analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get monthly analytics'
    });
  }
};

// 📅 NEW FEATURE: Reschedule Session
export const rescheduleSession = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;
    const { newDate, reason } = req.body;

    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active cycling plan found'
      });
    }

    // Find the session to reschedule
    const sessionIndex = plan.dailySessions.findIndex(
      session => session._id.toString() === sessionId
    );

    if (sessionIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const session = plan.dailySessions[sessionIndex];
    
    // Only allow rescheduling pending or missed sessions
    if (session.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot reschedule completed sessions'
      });
    }

    // Update session
    const oldDate = session.date;
    session.date = new Date(newDate);
    session.status = 'rescheduled';
    session.rescheduleInfo = {
      originalDate: oldDate,
      reason: reason || 'User requested reschedule',
      rescheduledAt: new Date()
    };

    await plan.save();

    res.json({
      success: true,
      message: 'Session rescheduled successfully',
      data: {
        sessionId: session._id,
        oldDate: oldDate.toISOString().split('T')[0],
        newDate: session.date.toISOString().split('T')[0],
        status: session.status
      }
    });

  } catch (error) {
    console.error('Reschedule session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reschedule session'
    });
  }
};

// 🎯 NEW FEATURE: Smart Plan Adjustment
export const checkPlanAdjustment = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const adjustmentResult = await checkAndAdjustPlan(userId);

    res.json({
      success: true,
      data: adjustmentResult
    });

  } catch (error) {
    console.error('Plan adjustment check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check plan adjustment',
      details: error.message
    });
  }
};

// 🔄 NEW FEATURE: Suggest Plan Reset
export const suggestNewPlan = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const suggestion = await suggestPlanReset(userId);

    res.json({
      success: true,
      data: suggestion
    });

  } catch (error) {
    console.error('Plan reset suggestion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to suggest plan reset',
      details: error.message
    });
  }
};

// ⏰ NEW FEATURE: Daily Plan Health Check
export const performDailyCheck = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const checkResult = await dailyPlanCheck(userId);

    res.json({
      success: true,
      data: checkResult
    });

  } catch (error) {
    console.error('Daily plan check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform daily check',
      details: error.message
    });
  }
};

// 📊 NEW FEATURE: Get Plan Adjustment History
export const getPlanAdjustmentHistory = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const plan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active cycling plan found'
      });
    }

    const adjustmentHistory = plan.adjustmentHistory || [];

    res.json({
      success: true,
      data: {
        adjustmentHistory,
        originalPlan: plan.originalPlan,
        totalAdjustments: adjustmentHistory.length,
        autoAdjustmentSettings: plan.autoAdjustmentSettings
      }
    });

  } catch (error) {
    console.error('Get adjustment history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get adjustment history',
      details: error.message
    });
  }
};

// 🎯 NEW: Automatic Missed Session Detection Controllers

/**
 * Real-time missed session check with automatic detection
 * Compares user's day 1 to current date and marks missed sessions
 */
export const autoDetectMissedSessions = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const result = await realtimeMissedSessionCheck(userId);

    if (!result.success) {
      return errorResponse(res, 404, result.error);
    }

    res.json({
      success: true,
      data: {
        autoDetected: result.autoDetected,
        alerts: result.alerts,
        stats: result.stats,
        missedSessions: result.missedSessions,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Auto detect missed sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect missed sessions',
      details: error.message
    });
  }
};

/**
 * Get missed session summary with day 1 status
 */
export const getMissedSessionStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const result = await getMissedSessionSummary(userId);

    if (!result.success) {
      return errorResponse(res, 404, result.error);
    }

    res.json({
      success: true,
      data: {
        missedSessions: result.missedSessions,
        summary: result.summary,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Get missed session status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get missed session status',
      details: error.message
    });
  }
};

/**
 * Force detection and marking of missed sessions
 */
export const forceMissedSessionDetection = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const result = await detectAndMarkMissedSessions(userId);

    if (!result.success) {
      return errorResponse(res, 404, result.error);
    }

    res.json({
      success: true,
      data: {
        detected: result.missedSessions,
        newMissedCount: result.newMissedCount,
        newMissedHours: result.newMissedHours,
        totalMissedCount: result.totalMissedCount,
        totalMissedHours: result.totalMissedHours,
        currentStats: result.currentStats,
        needsAdjustment: result.needsAdjustment,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Force missed session detection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to force detection',
      details: error.message
    });
  }
};



