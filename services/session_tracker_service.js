import CyclingPlan from '../models/CyclingPlan.js';
import User from '../models/User.js';

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
      const { sessionId, completedHours, caloriesBurned, planId } = sessionData;

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

      // Update session in plan
      const sessionResult = await this.updatePlanSession(plan, {
        sessionId,
        completedHours: parseFloat(completedHours),
        caloriesBurned: parseFloat(caloriesBurned || 0)
      });

      // Update user activity log
      await this.updateUserActivityLog(userId, {
        sessionId,
        calories: parseFloat(caloriesBurned || 0),
        duration: parseFloat(completedHours) * 60
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
    const { sessionId, completedHours, caloriesBurned } = sessionData;

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
        isActive: true
      };
      
      plan.activeSessions.push(sessionEntry);
    }

    // Update session progress
    sessionEntry.completedHours = completedHours;
    sessionEntry.caloriesBurned = caloriesBurned;
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

      if (!sessionActivity) {
        sessionActivity = {
          type: 'cycling_session',
          sessionId: sessionData.sessionId,
          duration: 0,
          calories: 0,
          date: new Date(),
          metadata: {
            isActive: true,
            lastUpdate: new Date()
          }
        };
        user.activityLog.push(sessionActivity);
      }

      // Update session data
      sessionActivity.calories = sessionData.calories;
      sessionActivity.duration = sessionData.duration;
      sessionActivity.metadata.lastUpdate = new Date();

      await user.save();
      
      console.log(`Updated activity log for user ${userId}: ${sessionData.calories} calories`);
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
      const { sessionId, finalCalories, finalHours } = sessionData;

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
      sessionActivity.duration = parseFloat(sessionData.finalHours || 0) * 60;
      sessionActivity.metadata.isActive = false;
      sessionActivity.metadata.completedAt = new Date();
    }

    // Create summary activity entry
    const summaryActivity = {
      type: 'cycling',
      duration: parseFloat(sessionData.finalHours || 0) * 60,
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
