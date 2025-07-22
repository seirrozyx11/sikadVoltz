import {
  createCyclingPlan,
  recordSession as recordSessionService,
  handleMissedSession as handleMissedSessionService
} from '../services/calorieCalculator.js';
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
    const userId = req.user?._id;

    if (!goalId) {
      return errorResponse(res, 400, 'Missing required field: goalId');
    }
    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const plan = await createCyclingPlan(userId, goalId);

    res.status(201).json({
      success: true,
      data: plan
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

    const updatedPlan = await recordSessionService(planId, sessionDate, parseFloat(hours));

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

    const updatedPlan = await handleMissedSessionService(planId, missedDate);

    res.json({
      success: true,
      data: updatedPlan
    });
  } catch (error) {
    console.error('Error handling missed session:', error);
    errorResponse(res, 500, 'Failed to handle missed session', error.message);
  }
};

// Get user's current plan
export const getCurrentPlan = async (req, res) => {
  try {
    const userId = req.user?._id;

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
