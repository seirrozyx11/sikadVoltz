import express from 'express';
import Goal from '../models/Goal.js';
import User from '../models/User.js';
import CyclingPlan from '../models/CyclingPlan.js';
import authenticateToken from '../middleware/authenticateToken.js';

const router = express.Router();

// Get all user goals (or filter by status)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { status } = req.query; // Optional: filter by status (active, completed, paused)

    const query = { user: userId };
    if (status) {
      query.status = status;
    }

    const goals = await Goal.find(query)
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    res.status(200).json({ 
      success: true, 
      goals,
      count: goals.length 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new goal
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { currentWeight, targetWeight, goalType, targetDate } = req.body;

    if (!currentWeight || !targetWeight || !goalType || !targetDate) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const goal = new Goal({
      user: userId,
      currentWeight,
      targetWeight,
      goalType,
      targetDate,
      startDate: new Date(),
      status: 'active'
    });

    await goal.save();

    res.status(201).json({ success: true, data: goal });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// NEW: Complete goal creation wizard (handles both goal and profile data)
router.post('/complete-wizard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { 
      // Goal data
      bodyGoal, currentWeight, targetWeight, timeframeWeeks, dailyCyclingHours,
      // Profile data (optional - may already be set)
      gender, birthDate, weight, height, activityLevel,
      // Additional wizard data
      planWarning
    } = req.body;

    // Validate required goal fields
    if (!bodyGoal || !currentWeight || !targetWeight || !timeframeWeeks || !dailyCyclingHours) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required goal fields',
        required: ['bodyGoal', 'currentWeight', 'targetWeight', 'timeframeWeeks', 'dailyCyclingHours']
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Update profile if profile data provided
    if (gender || birthDate || weight || height || activityLevel) {
      const profileUpdates = {};
      if (gender) profileUpdates['profile.gender'] = gender;
      if (birthDate) profileUpdates['profile.birthDate'] = new Date(birthDate);
      if (weight) profileUpdates['profile.weight'] = Number(weight);
      if (height) profileUpdates['profile.height'] = Number(height);
      if (activityLevel) profileUpdates['profile.activityLevel'] = activityLevel;

      // Check if profile will be complete
      const currentProfile = user.profile || {};
      const updatedProfile = { 
        ...currentProfile.toObject?.() || currentProfile, 
        ...(gender && { gender }),
        ...(birthDate && { birthDate: new Date(birthDate) }),
        ...(weight && { weight: Number(weight) }),
        ...(height && { height: Number(height) }),
        ...(activityLevel && { activityLevel })
      };
      
      const isComplete = !!(updatedProfile.gender && updatedProfile.birthDate && 
                           updatedProfile.weight && updatedProfile.height && 
                           updatedProfile.activityLevel);
      
      if (isComplete) {
        profileUpdates.profileCompleted = true;
      }

      await User.findByIdAndUpdate(userId, { $set: profileUpdates });
    }

    // Map bodyGoal to goalType enum
    const goalTypeMapping = {
      'lose': 'weight_loss',
      'maintain': 'maintenance', 
      'gain': 'muscle_gain'
    };
    const goalType = goalTypeMapping[bodyGoal] || 'weight_loss';

    // Calculate target date
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + (timeframeWeeks * 7));

    // Create goal
    const goal = new Goal({
      user: userId,
      currentWeight: Number(currentWeight),
      targetWeight: Number(targetWeight),
      goalType,
      targetDate,
      startDate: new Date(),
      status: 'active'
    });

    await goal.save();

    // Create cycling plan
    const totalDays = timeframeWeeks * 7;
    const dailySessions = [];
    
    // Generate daily sessions
    for (let i = 0; i < totalDays; i++) {
      const sessionDate = new Date();
      sessionDate.setDate(sessionDate.getDate() + i);
      
      dailySessions.push({
        date: sessionDate,
        plannedHours: Number(dailyCyclingHours),
        status: 'pending'
      });
    }

    const cyclingPlan = new CyclingPlan({
      user: userId,
      goal: goal._id,
      totalDays,
      dailySessions,
      originalPlan: {
        durationWeeks: timeframeWeeks,
        targetHours: Number(dailyCyclingHours) * totalDays,
        startDate: new Date(),
        endDate: targetDate,
        dailyHours: Number(dailyCyclingHours)
      },
      planSummary: {
        dailyCyclingHours: Number(dailyCyclingHours),
        totalPlanDays: totalDays,
        totalCyclingHours: Number(dailyCyclingHours) * totalDays
      }
    });

    await cyclingPlan.save();

    // Refresh user data
    const updatedUser = await User.findById(userId);

    res.status(201).json({
      success: true,
      message: 'Goal creation wizard completed successfully!',
      data: {
        goal,
        plan: cyclingPlan,
        profile: updatedUser.profile,
        profileCompleted: updatedUser.profileCompleted,
        planWarning,
        summary: {
          goalType: bodyGoal,
          currentWeight,
          targetWeight,
          timeframeWeeks,
          dailyCyclingHours,
          totalDays,
          targetDate
        }
      }
    });

  } catch (error) {
    console.error('Goal wizard completion error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to complete goal creation wizard',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========== NEW ENDPOINTS FOR DATA FLOW FIX ==========

/**
 * Get goal progress summary (Issues #1-5)
 * Returns progressData, weeklyProgress, weightHistory, recent sessions
 */
router.get('/:id/progress', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Import service
    const GoalProgressService = (await import('../services/goalProgressService.js')).default;

    // Verify goal belongs to user
    const goal = await Goal.findById(id);
    if (!goal) {
      return res.status(404).json({ success: false, error: 'Goal not found' });
    }

    if (goal.user.toString() !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Get comprehensive progress summary
    const progressSummary = await GoalProgressService.getGoalProgressSummary(id);

    res.json({
      success: true,
      data: progressSummary
    });

  } catch (error) {
    console.error('Get goal progress error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve goal progress',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get all sessions linked to a goal (Issue #2)
 * Supports pagination
 */
router.get('/:id/sessions', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const { limit = 50, offset = 0, sortBy = 'endTime', order = 'desc' } = req.query;

    // Import service
    const GoalProgressService = (await import('../services/goalProgressService.js')).default;

    // Verify goal belongs to user
    const goal = await Goal.findById(id);
    if (!goal) {
      return res.status(404).json({ success: false, error: 'Goal not found' });
    }

    if (goal.user.toString() !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Get sessions
    const result = await GoalProgressService.getGoalSessions(id, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      sortBy,
      order: order === 'desc' ? -1 : 1
    });

    res.json({
      success: true,
      data: result.sessions,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore
      }
    });

  } catch (error) {
    console.error('Get goal sessions error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve goal sessions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Update user's weight manually (Issue #7)
 * Adds to goal's weightHistory
 */
router.post('/update-weight', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { weight, date } = req.body;

    if (!weight) {
      return res.status(400).json({ success: false, error: 'Weight is required' });
    }

    // Find active goal
    const goal = await Goal.findOne({ user: userId, status: 'active' });
    if (!goal) {
      return res.status(404).json({ 
        success: false, 
        error: 'No active goal found' 
      });
    }

    // Add to weight history
    if (!goal.weightHistory) {
      goal.weightHistory = [];
    }

    goal.weightHistory.push({
      date: date ? new Date(date) : new Date(),
      weight: parseFloat(weight),
      source: 'manual'
    });

    // Update current weight
    goal.currentWeight = parseFloat(weight);

    // Recalculate completion percentage
    const GoalProgressService = (await import('../services/goalProgressService.js')).default;
    goal.progressData.completionPercentage = GoalProgressService._calculateCompletion(goal);

    await goal.save();

    res.json({
      success: true,
      message: 'Weight updated successfully',
      data: {
        currentWeight: goal.currentWeight,
        weightHistory: goal.weightHistory,
        completionPercentage: goal.progressData.completionPercentage
      }
    });

  } catch (error) {
    console.error('Update weight error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update weight',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========== END NEW ENDPOINTS ==========

export default router;
