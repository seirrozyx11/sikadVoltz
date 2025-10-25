import CyclingPlan from '../models/CyclingPlan.js';
import User from '../models/User.js';
import GoalProgressService from './goalProgressService.js';
import AchievementService from './achievementService.js';

/**
 * Session Tracker Service
 * Handles real-time session tracking and calorie integration
 */
class SessionTrackerService {
  /**
   * Update session progress with validation and error handling
   */
  static async updateSessionProgress(userId, sessionData) {
    try {
      const { sessionId, completedHours, caloriesBurned, distance, planId } = sessionData;

      // Logging for debugging
      console.log('[SessionTracker] updateSessionProgress called:', { userId, planId, sessionId });

      // Get user to verify profile exists
      const user = await User.findById(userId);
      if (!user || !user.profile) {
        throw new Error('User profile not complete');
      }

      // Try to find the plan by planId and userId
      let plan = await CyclingPlan.findOne({ 
        _id: planId,
        user: userId 
      }).sort({ createdAt: -1 });

      if (!plan) {
        // Fallback: try to find the most recent active plan for the user
        console.warn(`[SessionTracker] Plan not found by planId. Falling back to most recent active plan for user ${userId}`);
        plan = await CyclingPlan.findOne({ user: userId, isActive: true }).sort({ createdAt: -1 });
        if (plan) {
          console.warn(`[SessionTracker] Fallback plan found: ${plan._id}`);
        }
      }

      if (!plan) {
        // Log all plans for this user for debugging
        const allPlans = await CyclingPlan.find({ user: userId });
        console.error(`[SessionTracker] No plan found for user ${userId}. planId: ${planId}. User has ${allPlans.length} plans.`);
        throw new Error('Active plan not found');
      }

      // Update session in plan with distance
      const sessionResult = await this.updatePlanSession(plan, {
        sessionId,
        completedHours: parseFloat(completedHours),
        caloriesBurned: parseFloat(caloriesBurned || 0),
        distance: parseFloat(distance || 0) // Add distance parameter
      });

      // Update user activity log
      // Ensure duration is valid and at least 1 minute (NaN-safe)
      const hoursVal = Number(completedHours);
      const safeDuration = Math.max(1, Math.round((Number.isFinite(hoursVal) ? hoursVal : 0) * 60));
      await this.updateUserActivityLog(userId, {
        sessionId,
        calories: parseFloat(caloriesBurned || 0),
        duration: safeDuration
      });

      return {
        success: true,
        data: sessionResult
      };

    } catch (error) {
      console.error('Session tracking error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update session in cycling plan
   */
  static async updatePlanSession(plan, sessionData) {
    const { sessionId, completedHours, caloriesBurned, distance } = sessionData;

    // Find or create session entry
    let sessionEntry = plan.activeSessions?.find(s => s.sessionId === sessionId);
    
    if (!sessionEntry) {
      if (!plan.activeSessions) {
        plan.activeSessions = [];
      }
      
      sessionEntry = {
        sessionId,
        startTime: new Date(),
        lastUpdate: new Date(),
        completedHours: 0,
        caloriesBurned: 0,
        distance: 0.0, // Add distance field
        isActive: true
      };
      
      plan.activeSessions.push(sessionEntry);
    }

    // Update session progress
    sessionEntry.completedHours = completedHours;
    sessionEntry.caloriesBurned = caloriesBurned;
    sessionEntry.distance = distance || 0.0; // Add distance update
    sessionEntry.lastUpdate = new Date();

    // Update today's session
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySession = plan.dailySessions.find(session => {
      const sessionDate = new Date(session.date);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() === today.getTime();
    });

    if (todaySession && todaySession.status === 'pending') {
      todaySession.progressCalories = caloriesBurned;
      todaySession.progressHours = completedHours;
      todaySession.progressDistance = distance || 0.0; // Add distance to daily session
      todaySession.lastActivity = new Date();
    }

    await plan.save();

    return {
      planSummary: plan.planSummary,
      sessionProgress: sessionEntry,
      todaySession: todaySession ? {
        plannedHours: todaySession.plannedHours,
        progressHours: todaySession.progressHours || 0,
        progressCalories: todaySession.progressCalories || 0,
        status: todaySession.status
      } : null
    };
  }

  /**
   * Update user activity log
   */
  static async updateUserActivityLog(userId, sessionData) {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      if (!user.activityLog) {
        user.activityLog = [];
      }

      // Find or create session activity
      let sessionActivity = user.activityLog.find(
        activity => activity.sessionId === sessionData.sessionId && 
                   activity.type === 'cycling_session'
      );

      // Always ensure duration is at least 1 minute and rounded (NaN-safe)
      const durationVal = Number(sessionData.duration);
      const safeDuration = Math.max(1, Math.round(Number.isFinite(durationVal) ? durationVal : 0));

      if (!sessionActivity) {
        sessionActivity = {
          type: 'cycling_session',
          sessionId: sessionData.sessionId,
          duration: safeDuration,
          calories: sessionData.calories || 0,
          date: new Date(),
          metadata: {
            isActive: true,
            lastUpdate: new Date()
          }
        };
        user.activityLog.push(sessionActivity);
      } else {
        // Update session data
        sessionActivity.calories = sessionData.calories;
        sessionActivity.duration = safeDuration;
        sessionActivity.metadata.lastUpdate = new Date();
      }

      await user.save();
      
      console.log(`Updated activity log for user ${userId}: ${sessionData.calories} calories, duration: ${safeDuration}`);
    } catch (error) {
      console.error('Failed to update user activity log:', error);
      throw error;
    }
  }

  /**
   * Complete session and finalize data
   */
  static async completeSession(userId, sessionData) {
    try {
      const { sessionId, finalCalories, finalHours, finalDistance } = sessionData;

      // Update plan
      const plan = await CyclingPlan.findOne({ 
        user: userId, 
        isActive: true 
      });

      if (!plan) {
        throw new Error('Active plan not found');
      }

      // Find and complete session
      const sessionEntry = plan.activeSessions?.find(
        s => s.sessionId === sessionId && s.isActive
      );
      
      if (sessionEntry) {
        sessionEntry.isActive = false;
        sessionEntry.completedAt = new Date();
        sessionEntry.finalCalories = parseFloat(finalCalories || sessionEntry.caloriesBurned);
        sessionEntry.finalHours = parseFloat(finalHours || sessionEntry.completedHours);
        sessionEntry.finalDistance = parseFloat(finalDistance || sessionEntry.distance || 0); // Add distance

        // Update today's session
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todaySession = plan.dailySessions.find(session => {
          const sessionDate = new Date(session.date);
          sessionDate.setHours(0, 0, 0, 0);
          return sessionDate.getTime() === today.getTime();
        });

        if (todaySession) {
          todaySession.completedHours = (todaySession.completedHours || 0) + sessionEntry.finalHours;
          todaySession.caloriesBurned = (todaySession.caloriesBurned || 0) + sessionEntry.finalCalories;
          todaySession.distance = (todaySession.distance || 0) + sessionEntry.finalDistance; // Add distance to completed session
          
          if (todaySession.completedHours >= todaySession.plannedHours) {
            todaySession.status = 'completed';
            todaySession.completedAt = new Date();
            plan.completedDays = (plan.completedDays || 0) + 1;
          }
        }

        plan.completedHours = (plan.completedHours || 0) + sessionEntry.finalHours;
        await plan.save();
      }

      // Finalize user activity log
      await this.finalizeUserActivity(userId, sessionData);

      // ========== DATA FLOW FIX: CONNECT TO GOALS & ACHIEVEMENTS ==========
      console.log('[SessionTracker] 🔗 Connecting session to goal and achievement systems...');
      
      try {
        // 1. Update goal progress (Issues #1-5, #7)
        if (plan.goal) {
          const goalUpdateData = {
            _id: sessionId, // Session ID for linking
            sessionId,
            totalDistance: sessionEntry?.finalDistance || 0,
            totalCalories: sessionEntry?.finalCalories || 0,
            duration: (sessionEntry?.finalHours || 0) * 3600, // Convert hours to seconds
            avgSpeed: sessionEntry?.finalDistance && sessionEntry?.finalHours 
              ? (sessionEntry.finalDistance / sessionEntry.finalHours) 
              : 0,
            avgPower: sessionEntry?.avgPower || 0,
            endTime: sessionEntry?.completedAt || new Date()
          };

          await GoalProgressService.updateGoalFromSession(plan.goal, goalUpdateData);
          console.log('[SessionTracker] ✅ Goal progress updated');
        } else {
          console.log('[SessionTracker] ⚠️ Plan has no linked goal, skipping goal update');
        }

        // 2. Award XP and check achievements (Issue #6)
        const sessionAchievementData = {
          totalDistance: sessionEntry?.finalDistance || 0,
          totalCalories: sessionEntry?.finalCalories || 0,
          duration: (sessionEntry?.finalHours || 0) * 3600,
          avgSpeed: sessionEntry?.finalDistance && sessionEntry?.finalHours 
            ? (sessionEntry.finalDistance / sessionEntry.finalHours) 
            : 0,
          avgPower: sessionEntry?.avgPower || 0,
          maxSpeed: sessionEntry?.maxSpeed || 0,
          maxPower: sessionEntry?.maxPower || 0
        };

        // Award XP
        const xpResult = await AchievementService.awardWorkoutXP(userId, sessionAchievementData);
        console.log('[SessionTracker] ✅ XP awarded:', xpResult.xpEarned);

        // Update streak
        await AchievementService.updateStreak(userId, sessionEntry?.completedAt);
        console.log('[SessionTracker] ✅ Streak updated');

        // Check milestones
        const user = await User.findById(userId);
        const milestoneStats = {
          totalDistance: (user.totalDistanceCycled || 0) + (sessionEntry?.finalDistance || 0),
          totalWorkouts: (user.totalWorkouts || 0) + 1,
          totalCalories: (user.totalCaloriesBurned || 0) + (sessionEntry?.finalCalories || 0)
        };
        const newMilestones = await AchievementService.checkMilestones(userId, milestoneStats);
        if (newMilestones.length > 0) {
          console.log('[SessionTracker] ✅ New milestones achieved:', newMilestones.length);
        }

        // Check badges
        const newBadges = await AchievementService.checkBadgeProgress(userId, sessionAchievementData);
        if (newBadges.length > 0) {
          console.log('[SessionTracker] ✅ New badges unlocked:', newBadges.length);
        }

        // ========== ISSUE #8: AUTO-ARCHIVE COMPLETED PLANS ==========
        // Check if plan is fully completed
        if (plan.completedDays >= plan.totalDays && plan.isActive) {
          console.log('[SessionTracker] 🏁 Plan completed! Creating workout history...');
          
          try {
            const WorkoutHistory = (await import('../models/WorkoutHistory.js')).default;
            const RideSession = (await import('../models/Telemetry.js')).RideSession;
            
            // Get all sessions for this plan
            const planSessions = await RideSession.find({ 
              planId: plan._id,
              status: 'completed'
            }).select('_id totalDistance totalCalories avgSpeed duration');

            // Calculate statistics
            const totalDistance = planSessions.reduce((sum, s) => sum + (s.totalDistance || 0), 0);
            const totalCalories = planSessions.reduce((sum, s) => sum + (s.totalCalories || 0), 0);
            const totalDuration = planSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
            const avgSpeed = planSessions.length > 0 
              ? planSessions.reduce((sum, s) => sum + (s.avgSpeed || 0), 0) / planSessions.length 
              : 0;

            // Create workout history
            const workoutHistory = await WorkoutHistory.create({
              user: userId,
              plan: plan._id,
              linkedSessions: planSessions.map(s => s._id),
              startDate: plan.originalPlan?.startDate || plan.createdAt,
              endDate: new Date(),
              status: 'completed',
              statistics: {
                totalSessions: planSessions.length,
                completedSessions: planSessions.length,
                missedSessions: plan.totalDays - planSessions.length,
                totalHours: totalDuration / 3600,
                completedHours: totalDuration / 3600,
                caloriesBurned: totalCalories,
                averageIntensity: 2, // Default intensity
                originalGoal: {
                  type: 'cycling_plan',
                  targetValue: plan.totalDays,
                  timeframe: plan.totalDays
                }
              },
              planSummary: {
                planType: 'cycling',
                dailyCyclingHours: plan.planSummary?.dailyCyclingHours || 1,
                totalPlanDays: plan.totalDays,
                completionRate: (planSessions.length / plan.totalDays) * 100
              },
              notes: `Plan completed on ${new Date().toLocaleDateString()}`
            });

            // Mark plan as inactive
            plan.isActive = false;
            await plan.save();

            console.log('[SessionTracker] ✅ Workout history created:', workoutHistory._id);
            console.log('[SessionTracker] ✅ Plan marked as inactive');

            // Send completion notification
            const NotificationService = (await import('./notificationService.js')).default;
            await NotificationService.createNotification(userId, {
              type: 'plan_completed',
              title: '🎉 Plan Completed!',
              message: `Congratulations! You've completed your ${plan.totalDays}-day cycling plan with ${planSessions.length} sessions and ${totalDistance.toFixed(1)}km total distance!`,
              priority: 'high',
              actions: [
                {
                  type: 'navigation',
                  label: 'View History',
                  data: { route: '/workout-history' },
                  isPrimary: true
                },
                {
                  type: 'navigation',
                  label: 'Create New Plan',
                  data: { route: '/goal-frames' },
                  isPrimary: false
                }
              ],
              data: {
                planId: plan._id,
                workoutHistoryId: workoutHistory._id,
                totalSessions: planSessions.length,
                totalDistance,
                totalCalories
              }
            });

          } catch (archiveError) {
            console.error('[SessionTracker] ⚠️ Error creating workout history:', archiveError);
          }
        }
        // ========== END ISSUE #8 ==========

      } catch (integrationError) {
        // Don't fail the entire session if goal/achievement update fails
        console.error('[SessionTracker] ⚠️ Error in goal/achievement integration:', integrationError);
        console.error('[SessionTracker] Session completed, but goal/achievement tracking failed');
      }
      // ========== END DATA FLOW FIX ==========

      return {
        success: true,
        data: {
          sessionSummary: {
            sessionId,
            duration: sessionEntry?.finalHours || 0,
            calories: sessionEntry?.finalCalories || 0,
            completedAt: sessionEntry?.completedAt || new Date()
          }
        }
      };

    } catch (error) {
      console.error('Complete session error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Finalize user activity in activity log
   */
  static async finalizeUserActivity(userId, sessionData) {
    const user = await User.findById(userId);
    if (!user) return;

    // Mark session as inactive
    const sessionActivity = user.activityLog?.find(
      activity => activity.sessionId === sessionData.sessionId && 
                 activity.type === 'cycling_session'
    );

    if (sessionActivity) {
      sessionActivity.calories = parseFloat(sessionData.finalCalories || sessionActivity.calories);
      const finalHoursVal = Number(sessionData.finalHours);
      sessionActivity.duration = Math.max(1, Math.round(((Number.isFinite(finalHoursVal) ? finalHoursVal : 0) * 60)));
      sessionActivity.metadata.isActive = false;
      sessionActivity.metadata.completedAt = new Date();
    }

    // Create summary activity entry
    const finalHoursVal2 = Number(sessionData.finalHours);
    const summaryActivity = {
      type: 'cycling',
      duration: Math.max(1, Math.round(((Number.isFinite(finalHoursVal2) ? finalHoursVal2 : 0) * 60))),
      calories: parseFloat(sessionData.finalCalories || 0),
      date: new Date(),
      sessionId: sessionData.sessionId,
      metadata: {
        source: 'completed_session'
      }
    };

    user.activityLog.push(summaryActivity);
    await user.save();
  }

  /**
   * Get real-time calorie data for today
   */
  static async getTodayCalories(userId) {
    try {
      const user = await User.findById(userId).select('activityLog');
      const plan = await CyclingPlan.findOne({ user: userId, isActive: true });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      // Get logged activities for today
      const todayActivities = user?.activityLog?.filter(activity => {
        const activityDate = new Date(activity.date);
        return activityDate >= today && activityDate < tomorrow;
      }) || [];

      const loggedCalories = todayActivities.reduce(
        (sum, activity) => sum + (activity.calories || 0), 0
      );

      // Get real-time session calories
      const realtimeCalories = plan?.activeSessions
        ?.filter(s => s.isActive)
        ?.reduce((sum, s) => sum + s.caloriesBurned, 0) || 0;

      return {
        success: true,
        data: {
          loggedCalories,
          realtimeCalories,
          totalCalories: loggedCalories + realtimeCalories,
          todayActivities
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default SessionTrackerService;
