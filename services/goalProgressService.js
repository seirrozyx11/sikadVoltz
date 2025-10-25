/**
 * Goal Progress Service
 * 
 * Handles all goal progress tracking and updates from workout sessions.
 * Fixes Issues #1-5: Connects RideSessions to Goals with real-time progress updates.
 * 
 * Created: October 25, 2025
 * Part of: Data Flow Fix Implementation
 */

import Goal from '../models/Goal.js';
import RideSession from '../models/Telemetry.js';
import mongoose from 'mongoose';

class GoalProgressService {
  /**
   * Update goal progress from a completed session
   * @param {ObjectId} goalId - The goal to update
   * @param {Object} sessionData - Session data (distance, calories, duration, etc.)
   * @returns {Object} Updated goal with progress data
   */
  async updateGoalFromSession(goalId, sessionData) {
    try {
      console.log(`[GoalProgressService] Updating goal ${goalId} from session ${sessionData.sessionId}`);
      
      const goal = await Goal.findById(goalId);
      if (!goal) {
        throw new Error(`Goal ${goalId} not found`);
      }

      // 1. Add session to linkedSessions array (Issue #2)
      if (!goal.linkedSessions.includes(sessionData._id)) {
        goal.linkedSessions.push(sessionData._id);
      }

      // 2. Update progressData (Issue #1)
      goal.progressData = goal.progressData || {
        totalDistance: 0,
        totalCalories: 0,
        totalWorkouts: 0,
        completionPercentage: 0,
        lastUpdated: new Date()
      };

      goal.progressData.totalDistance += sessionData.totalDistance || 0;
      goal.progressData.totalCalories += sessionData.totalCalories || 0;
      goal.progressData.totalWorkouts += 1;
      goal.progressData.lastUpdated = new Date();

      // Calculate completion percentage based on goal type
      goal.progressData.completionPercentage = this._calculateCompletion(goal);

      // 3. Update weekly progress (Issue #3)
      await this._updateWeeklyProgress(goal, sessionData);

      // 4. Update weight history if applicable (Issue #7)
      if (sessionData.totalCalories > 0) {
        this._estimateWeightChange(goal, sessionData.totalCalories);
      }

      // Save updated goal
      const previousCompletion = goal.progressData.completionPercentage;
      await goal.save();

      // ========== ISSUE #10: GOAL PROGRESS NOTIFICATIONS ==========
      // Send notifications for milestone completion percentages
      try {
        const NotificationService = (await import('./notificationService.js')).default;
        const currentCompletion = goal.progressData.completionPercentage;

        // Check for milestone notifications (25%, 50%, 75%, 100%)
        const milestones = [25, 50, 75, 100];
        for (const milestone of milestones) {
          if (previousCompletion < milestone && currentCompletion >= milestone) {
            let title, message;
            
            if (milestone === 100) {
              title = '🎉 Goal Completed!';
              message = `Congratulations! You've achieved your ${goal.goalType.replace('_', ' ')} goal!`;
            } else if (milestone === 75) {
              title = '🚀 Almost There!';
              message = `You're ${milestone}% complete! Keep pushing!`;
            } else if (milestone === 50) {
              title = '💪 Halfway There!';
              message = `You've reached the halfway point of your goal!`;
            } else {
              title = `✨ ${milestone}% Complete!`;
              message = `Great progress! You're ${milestone}% of the way to your goal!`;
            }

            await NotificationService.createNotification(goal.user, {
              type: 'goal_progress',
              title,
              message,
              priority: milestone === 100 ? 'high' : 'medium',
              actions: [
                {
                  type: 'navigation',
                  label: 'View Progress',
                  data: { route: '/goal-details' },
                  isPrimary: true
                }
              ],
              data: {
                goalId: goal._id,
                completionPercentage: currentCompletion,
                milestone,
                totalDistance: goal.progressData.totalDistance,
                totalCalories: goal.progressData.totalCalories,
                totalWorkouts: goal.progressData.totalWorkouts
              }
            });

            console.log(`[GoalProgressService] 🎊 Goal ${milestone}% milestone notification sent`);
          }
        }
      } catch (notificationError) {
        console.error('[GoalProgressService] ⚠️ Error sending progress notification:', notificationError);
      }
      // ========== END ISSUE #10 ==========

      console.log(`[GoalProgressService] ✅ Goal ${goalId} updated successfully`);
      console.log(`  - Total Distance: ${goal.progressData.totalDistance.toFixed(2)} km`);
      console.log(`  - Total Calories: ${goal.progressData.totalCalories.toFixed(0)} kcal`);
      console.log(`  - Total Workouts: ${goal.progressData.totalWorkouts}`);
      console.log(`  - Completion: ${goal.progressData.completionPercentage.toFixed(1)}%`);

      return goal;
    } catch (error) {
      console.error('[GoalProgressService] Error updating goal:', error);
      throw error;
    }
  }

  /**
   * Calculate goal completion percentage based on goal type
   * @param {Object} goal - Goal document
   * @returns {Number} Completion percentage (0-100)
   */
  _calculateCompletion(goal) {
    const now = new Date();
    const totalDays = Math.ceil((goal.targetDate - goal.startDate) / (1000 * 60 * 60 * 24));
    const daysPassed = Math.ceil((now - goal.startDate) / (1000 * 60 * 60 * 24));
    const timeProgress = Math.min((daysPassed / totalDays) * 100, 100);

    // Different calculation based on goal type
    switch (goal.goalType) {
      case 'weight_loss':
      case 'muscle_gain': {
        // Calculate based on weight progress
        const weightDifference = Math.abs(goal.targetWeight - goal.currentWeight);
        const totalWeightGoal = Math.abs(goal.targetWeight - (goal.weightHistory[0]?.weight || goal.currentWeight));
        const weightProgress = totalWeightGoal > 0 
          ? ((totalWeightGoal - weightDifference) / totalWeightGoal) * 100 
          : 0;
        
        // Average of weight progress and time progress
        return Math.min((weightProgress * 0.7 + timeProgress * 0.3), 100);
      }

      case 'maintenance': {
        // Based on workout consistency
        const expectedWorkouts = Math.floor(daysPassed / 2); // Assume 3-4 workouts per week
        const workoutProgress = expectedWorkouts > 0 
          ? Math.min((goal.progressData.totalWorkouts / expectedWorkouts) * 100, 100) 
          : 0;
        
        return Math.min((workoutProgress * 0.6 + timeProgress * 0.4), 100);
      }

      default:
        return timeProgress;
    }
  }

  /**
   * Update weekly progress array for chart rendering
   * @param {Object} goal - Goal document
   * @param {Object} sessionData - Session data
   */
  async _updateWeeklyProgress(goal, sessionData) {
    // Calculate which week this session belongs to
    const sessionDate = sessionData.endTime || new Date();
    const weekNumber = Math.floor((sessionDate - goal.startDate) / (1000 * 60 * 60 * 24 * 7));
    
    // Initialize weeklyProgress if needed
    if (!goal.weeklyProgress) {
      goal.weeklyProgress = [];
    }

    // Find or create week entry
    let weekEntry = goal.weeklyProgress.find(w => w.weekNumber === weekNumber);
    
    if (!weekEntry) {
      const weekStart = new Date(goal.startDate);
      weekStart.setDate(weekStart.getDate() + (weekNumber * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      weekEntry = {
        weekNumber,
        weekStart,
        weekEnd,
        totalDistance: 0,
        totalCalories: 0,
        workoutCount: 0,
        avgSpeed: 0
      };
      goal.weeklyProgress.push(weekEntry);
    }

    // Update week statistics
    weekEntry.totalDistance += sessionData.totalDistance || 0;
    weekEntry.totalCalories += sessionData.totalCalories || 0;
    weekEntry.workoutCount += 1;
    
    // Recalculate average speed
    weekEntry.avgSpeed = sessionData.avgSpeed 
      ? ((weekEntry.avgSpeed * (weekEntry.workoutCount - 1)) + sessionData.avgSpeed) / weekEntry.workoutCount
      : weekEntry.avgSpeed;

    // Sort by week number
    goal.weeklyProgress.sort((a, b) => a.weekNumber - b.weekNumber);
  }

  /**
   * Estimate weight change based on calories burned
   * @param {Object} goal - Goal document
   * @param {Number} caloriesBurned - Calories burned in session
   */
  _estimateWeightChange(goal, caloriesBurned) {
    // Rough estimation: 7700 calories = 1 kg
    const weightChange = caloriesBurned / 7700;
    
    if (goal.goalType === 'weight_loss') {
      const estimatedWeight = goal.currentWeight - weightChange;
      
      // Add to weight history
      if (!goal.weightHistory) {
        goal.weightHistory = [];
      }

      goal.weightHistory.push({
        date: new Date(),
        weight: estimatedWeight,
        source: 'estimated'
      });

      // Update current weight estimate
      goal.currentWeight = estimatedWeight;
    }
  }

  /**
   * Get comprehensive goal progress summary
   * @param {ObjectId} goalId - Goal ID
   * @returns {Object} Progress summary with all metrics
   */
  async getGoalProgressSummary(goalId) {
    try {
      const goal = await Goal.findById(goalId)
        .populate('linkedSessions')
        .lean();

      if (!goal) {
        throw new Error(`Goal ${goalId} not found`);
      }

      // Get recent sessions (last 10)
      const recentSessions = await RideSession.RideSession
        .find({ goalId })
        .sort({ endTime: -1 })
        .limit(10)
        .select('sessionId startTime endTime totalDistance totalCalories avgSpeed status')
        .lean();

      return {
        goal: {
          id: goal._id,
          goalType: goal.goalType,
          currentWeight: goal.currentWeight,
          targetWeight: goal.targetWeight,
          startDate: goal.startDate,
          targetDate: goal.targetDate,
          status: goal.status
        },
        progress: goal.progressData || {
          totalDistance: 0,
          totalCalories: 0,
          totalWorkouts: 0,
          completionPercentage: 0
        },
        weeklyProgress: goal.weeklyProgress || [],
        weightHistory: goal.weightHistory || [],
        recentSessions: recentSessions.map(s => ({
          sessionId: s.sessionId,
          date: s.endTime || s.startTime,
          distance: s.totalDistance,
          calories: s.totalCalories,
          avgSpeed: s.avgSpeed,
          status: s.status
        })),
        statistics: {
          totalSessions: goal.linkedSessions?.length || 0,
          averageDistance: goal.progressData?.totalWorkouts > 0 
            ? (goal.progressData.totalDistance / goal.progressData.totalWorkouts).toFixed(2) 
            : 0,
          averageCalories: goal.progressData?.totalWorkouts > 0 
            ? (goal.progressData.totalCalories / goal.progressData.totalWorkouts).toFixed(0) 
            : 0,
          daysRemaining: Math.ceil((goal.targetDate - new Date()) / (1000 * 60 * 60 * 24)),
          daysElapsed: Math.ceil((new Date() - goal.startDate) / (1000 * 60 * 60 * 24))
        }
      };
    } catch (error) {
      console.error('[GoalProgressService] Error getting progress summary:', error);
      throw error;
    }
  }

  /**
   * Get all sessions linked to a goal
   * @param {ObjectId} goalId - Goal ID
   * @param {Object} options - Pagination options
   * @returns {Array} Array of sessions
   */
  async getGoalSessions(goalId, options = {}) {
    const { limit = 50, offset = 0, sortBy = 'endTime', order = -1 } = options;

    try {
      const sessions = await RideSession.RideSession
        .find({ goalId })
        .sort({ [sortBy]: order })
        .skip(offset)
        .limit(limit)
        .lean();

      const total = await RideSession.RideSession.countDocuments({ goalId });

      return {
        sessions,
        total,
        limit,
        offset,
        hasMore: (offset + limit) < total
      };
    } catch (error) {
      console.error('[GoalProgressService] Error getting goal sessions:', error);
      throw error;
    }
  }
}

export default new GoalProgressService();
