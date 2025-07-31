import {
  generateCyclingPlan,
  logSession as recordSessionService,
  emergencyCatchUp
} from '../services/calorieService.js';
import CyclingPlan from '../models/CyclingPlan.js';

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
export const recordSession = async (req, res) => {
  try {
    const { date, hours } = req.body;
    const { id: planId } = req.params;

    if (!planId || !date || hours === undefined) {
      return errorResponse(res, 400, 'Missing required fields: planId, date, and hours');
    }

    const sessionDate = new Date(date);
    if (isNaN(sessionDate.getTime())) {
      return errorResponse(res, 400, 'Invalid date format');
    }

    // Get the plan to find the correct day index
    const plan = await CyclingPlan.findById(planId);
    if (!plan) {
      return errorResponse(res, 404, 'Plan not found');
    }

    // Find the session index for the given date
    const dayIndex = plan.dailySessions.findIndex(session => 
      session.date.toDateString() === sessionDate.toDateString()
    );

    if (dayIndex === -1) {
      return errorResponse(res, 404, 'Session not found for the specified date');
    }

    const updatedPlan = await recordSessionService(planId, dayIndex, parseFloat(hours));

    res.json({
      success: true,
      data: updatedPlan
    });
  } catch (error) {
    console.error('Error recording session:', error);
    errorResponse(res, 500, 'Failed to record session', error.message);
  }
};

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

    res.json({
      success: true,
      data: plan
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
