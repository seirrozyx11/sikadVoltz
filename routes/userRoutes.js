import express from 'express';
import * as achievementController from '../controllers/achievementController.js';
import authenticateToken from '../middleware/authenticateToken.js';
import User from '../models/User.js';
import Goal from '../models/Goal.js';

const router = express.Router();

/**
 * All routes require authentication
 * userId is extracted from JWT token by authenticateToken middleware
 */

// Badge routes
router.get('/me/badges', authenticateToken, achievementController.getUserBadges);
router.post('/me/badges', authenticateToken, achievementController.awardBadge);

// Milestone routes
router.get('/me/milestones', authenticateToken, achievementController.getUserMilestones);
router.post('/me/milestones', authenticateToken, achievementController.createMilestone);

// Rank routes
router.get('/me/rank', authenticateToken, achievementController.getUserRank);

// Quest routes
router.get('/me/quests', authenticateToken, achievementController.getUserQuests);
router.patch('/me/quests/:questId', authenticateToken, achievementController.updateQuestProgress);

// ========== NEW ENDPOINTS FOR DATA FLOW FIX ==========

/**
 * Get comprehensive achievement summary (Issue #6)
 * Returns XP, level, rank, badges, milestones, quests, streak
 */
router.get('/me/achievements', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;

    // Import service
    const AchievementService = (await import('../services/achievementService.js')).default;

    // Get full achievement summary
    const summary = await AchievementService.getUserAchievementSummary(userId);

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('Get achievements error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve achievements',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Update user weight (Issue #7)
 * Updates both User profile and active Goal weightHistory
 */
router.post('/me/weight', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { weight, date } = req.body;

    if (!weight || isNaN(weight)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid weight is required' 
      });
    }

    const weightValue = parseFloat(weight);
    const weightDate = date ? new Date(date) : new Date();

    // Update user profile weight
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.profile) {
      user.profile = {};
    }
    user.profile.weight = weightValue;
    await user.save();

    // Update active goal's weight history
    const activeGoal = await Goal.findOne({ user: userId, status: 'active' });
    
    let goalUpdated = false;
    if (activeGoal) {
      if (!activeGoal.weightHistory) {
        activeGoal.weightHistory = [];
      }

      activeGoal.weightHistory.push({
        date: weightDate,
        weight: weightValue,
        source: 'manual'
      });

      activeGoal.currentWeight = weightValue;
      
      // Recalculate completion if GoalProgressService is available
      try {
        const GoalProgressService = (await import('../services/goalProgressService.js')).default;
        if (activeGoal.progressData) {
          activeGoal.progressData.completionPercentage = GoalProgressService._calculateCompletion(activeGoal);
        }
      } catch (err) {
        console.warn('Could not recalculate goal completion:', err.message);
      }

      await activeGoal.save();
      goalUpdated = true;
    }

    res.json({
      success: true,
      message: 'Weight updated successfully',
      data: {
        weight: weightValue,
        date: weightDate,
        profileUpdated: true,
        goalUpdated,
        goal: goalUpdated ? {
          currentWeight: activeGoal.currentWeight,
          targetWeight: activeGoal.targetWeight,
          completionPercentage: activeGoal.progressData?.completionPercentage
        } : null
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

/**
 * Get user activity log (Issue #9)
 * Returns recent activities with pagination
 */
router.get('/me/activity-log', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { limit = 30, offset = 0 } = req.query;

    const user = await User.findById(userId).select('activityLog');
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const activityLog = user.activityLog || [];
    
    // Sort by date descending (most recent first)
    const sortedActivities = activityLog
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: sortedActivities,
      pagination: {
        total: activityLog.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < activityLog.length
      }
    });

  } catch (error) {
    console.error('Get activity log error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve activity log',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get activity summary statistics (Issue #9)
 * Returns aggregated stats for specified period
 */
router.get('/me/activity-summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { period = 'week' } = req.query; // week, month, year, all

    const user = await User.findById(userId).select('activityLog');
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const activityLog = user.activityLog || [];
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0); // All time
    }

    // Filter activities by date range
    const filteredActivities = activityLog.filter(activity => 
      new Date(activity.date) >= startDate
    );

    // Calculate summary statistics
    const summary = {
      period,
      startDate,
      endDate: now,
      totalWorkouts: filteredActivities.length,
      totalDistance: filteredActivities.reduce((sum, a) => sum + (a.distance || 0), 0),
      totalCalories: filteredActivities.reduce((sum, a) => sum + (a.caloriesBurned || 0), 0),
      totalDuration: filteredActivities.reduce((sum, a) => sum + (a.duration || 0), 0),
      averageDistance: 0,
      averageCalories: 0,
      averageDuration: 0
    };

    if (summary.totalWorkouts > 0) {
      summary.averageDistance = summary.totalDistance / summary.totalWorkouts;
      summary.averageCalories = summary.totalCalories / summary.totalWorkouts;
      summary.averageDuration = summary.totalDuration / summary.totalWorkouts;
    }

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('Get activity summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve activity summary',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get workout history (Issue #8)
 * Returns archived cycling plans
 */
router.get('/me/workout-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { limit = 20, offset = 0 } = req.query;

    const WorkoutHistory = (await import('../models/WorkoutHistory.js')).default;

    const total = await WorkoutHistory.countDocuments({ user: userId });
    
    const history = await WorkoutHistory.find({ user: userId })
      .populate('plan', 'planSummary originalPlan')
      .populate('linkedSessions', 'sessionId totalDistance totalCalories avgSpeed startTime endTime')
      .sort({ endDate: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: history,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    });

  } catch (error) {
    console.error('Get workout history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve workout history',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========== END NEW ENDPOINTS ==========

export default router;
