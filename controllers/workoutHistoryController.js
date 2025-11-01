import WorkoutHistory from '../models/WorkoutHistory.js';
import CyclingPlan from '../models/CyclingPlan.js';
import { errorResponse } from '../utils/responseHelpers.js';

// Archive a plan to workout history
export const archivePlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { status, resetReason, notes } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    // Find the plan to archive
    const plan = await CyclingPlan.findById(planId).populate('goal');
    if (!plan) {
      return errorResponse(res, 404, 'Plan not found');
    }

    // Calculate statistics
    const completedSessions = plan.dailySessions.filter(s => s.status === 'completed');
    const missedSessions = plan.dailySessions.filter(s => s.status === 'missed');
    const totalCaloriesBurned = plan.dailySessions.reduce((sum, s) => sum + (s.caloriesBurned || 0), 0);

    // Create workout history entry
    const workoutHistory = new WorkoutHistory({
      user: userId,
      plan: planId,
      startDate: plan.dailySessions[0]?.date || plan.createdAt,
      endDate: new Date(),
      status: status || 'completed',
      resetReason: resetReason,
      notes: notes,
      statistics: {
        totalSessions: plan.dailySessions.length,
        completedSessions: completedSessions.length,
        missedSessions: missedSessions.length,
        totalHours: plan.planSummary.totalCyclingHours,
        completedHours: plan.completedHours || 0,
        caloriesBurned: totalCaloriesBurned,
        averageIntensity: plan.planSummary.averageIntensity || 2,
        originalGoal: {
          type: plan.goal.type,
          targetValue: plan.goal.targetValue,
          timeframe: plan.goal.timeframe
        }
      },
      planSummary: {
        planType: plan.planType,
        dailyCyclingHours: plan.planSummary.dailyCyclingHours,
        totalPlanDays: plan.planSummary.totalPlanDays,
        completionRate: (completedSessions.length / plan.dailySessions.length) * 100
      }
    });

    await workoutHistory.save();

    // Update the plan status
    plan.isActive = false;
    plan.status = status;
    await plan.save();

    res.json({
      success: true,
      message: 'Plan archived successfully',
      data: workoutHistory
    });

  } catch (error) {
    console.error('Error archiving plan:', error);
    errorResponse(res, 500, 'Failed to archive plan', error.message);
  }
};

// Get user's workout history
export const getUserHistory = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { page = 1, limit = 10, status } = req.query;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const query = { user: userId };
    if (status) {
      query.status = status;
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { endDate: -1 },
      populate: 'plan'
    };

    const history = await WorkoutHistory.find(query)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .sort(options.sort)
      .populate(options.populate);

    const total = await WorkoutHistory.countDocuments(query);

    res.json({
      success: true,
      data: {
        history,
        pagination: {
          total,
          page: options.page,
          pages: Math.ceil(total / options.limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching workout history:', error);
    errorResponse(res, 500, 'Failed to fetch workout history', error.message);
  }
};

// Get workout history analytics
export const getHistoryAnalytics = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const analytics = await WorkoutHistory.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: null,
          totalWorkouts: { $sum: 1 },
          totalCompletedSessions: { $sum: '$statistics.completedSessions' },
          totalMissedSessions: { $sum: '$statistics.missedSessions' },
          totalHours: { $sum: '$statistics.completedHours' },
          totalCaloriesBurned: { $sum: '$statistics.caloriesBurned' },
          averageCompletionRate: { $avg: '$planSummary.completionRate' }
        }
      }
    ]);

    // Get completion rate trends
    const trends = await WorkoutHistory.aggregate([
      { $match: { user: userId } },
      { $sort: { endDate: -1 } },
      { $limit: 5 },
      {
        $project: {
          endDate: 1,
          completionRate: '$planSummary.completionRate',
          planType: '$planSummary.planType'
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        summary: analytics[0] || {},
        trends
      }
    });

  } catch (error) {
    console.error('Error fetching history analytics:', error);
    errorResponse(res, 500, 'Failed to fetch history analytics', error.message);
  }
};

// Get specific workout history details
export const getHistoryDetail = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { historyId } = req.params;

    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const history = await WorkoutHistory.findOne({
      _id: historyId,
      user: userId
    }).populate('plan');

    if (!history) {
      return errorResponse(res, 404, 'Workout history not found');
    }

    res.json({
      success: true,
      data: history
    });

  } catch (error) {
    console.error('Error fetching history detail:', error);
    errorResponse(res, 500, 'Failed to fetch history detail', error.message);
  }
};
