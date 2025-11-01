import express from 'express';
import authenticateToken from '../middleware/authenticateToken.js';
import CyclingPlan from '../models/CyclingPlan.js';
import { RideSession } from '../models/Telemetry.js';
import Goal from '../models/Goal.js';
import Badge from '../models/Badge.js';
import Milestone from '../models/Milestone.js';
import WorkoutHistory from '../models/WorkoutHistory.js';

const router = express.Router();

/**
 * GET /api/activity-history/overview
 * Get complete activity history overview for a user
 */
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get all cycling plans for this user
    const allPlans = await CyclingPlan.find({ user: userId })
      .populate('goal')
      .sort({ createdAt: -1 })
      .lean();
    
    // Get all workout history
    const workoutHistory = await WorkoutHistory.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();
    
    // FIXED: Get all completed ride sessions to calculate accurate distance
    const completedRideSessions = await RideSession.find({ 
      userId, 
      status: 'completed' 
    }).lean();
    
    console.log(`[ActivityHistory] Found ${completedRideSessions.length} completed ride sessions for user ${userId}`);
    
    // Calculate total stats from ride sessions (more accurate)
    const totalDistanceFromSessions = completedRideSessions.reduce((sum, session) => {
      const distance = session.totalDistance || 0;
      console.log(`  Session ${session._id}: ${distance} km`);
      return sum + distance;
    }, 0);
    const totalCaloriesFromSessions = completedRideSessions.reduce((sum, s) => sum + (s.totalCalories || 0), 0);
    const totalDurationFromSessions = completedRideSessions.reduce((sum, s) => sum + ((s.duration || 0) / 3600), 0); // Convert seconds to hours
    
    console.log(`[ActivityHistory] Total from sessions: ${totalDistanceFromSessions} km, ${totalCaloriesFromSessions} kcal, ${totalDurationFromSessions.toFixed(2)} hrs`);
    
    // Calculate total stats across all plans (for completion tracking)
    let totalDistance = totalDistanceFromSessions; // Use session data for distance
    let totalCalories = totalCaloriesFromSessions; // Use session data for calories
    let totalDuration = totalDurationFromSessions; // Use session data for duration
    let totalSessions = 0;
    let completedSessions = completedRideSessions.length; // Use actual completed sessions count
    
    // Track active plan for completion rate
    let activePlanTotalSessions = 0;
    let activePlanCompletedSessions = 0;
    
    const planHistory = await Promise.all(allPlans.map(async (plan) => {
      const completedSessionsInPlan = plan.dailySessions.filter(s => s.status === 'completed' || s.status === 'redistributed');
      
      // Don't re-add to totals since we already calculated from ride sessions
      totalSessions += plan.dailySessions.length;
      
      // Track active plan sessions for completion rate
      if (plan.isActive) {
        activePlanTotalSessions = plan.dailySessions.length;
        activePlanCompletedSessions = completedSessionsInPlan.length;
      }
      
      // Calculate plan-specific stats (for display purposes)
      const planDistance = completedSessionsInPlan.reduce((sum, s) => sum + (s.distance || 0), 0);
      const planCalories = completedSessionsInPlan.reduce((sum, s) => sum + (s.caloriesBurned || 0), 0);
      const planDuration = completedSessionsInPlan.reduce((sum, s) => sum + (s.completedHours || 0), 0);
      
      return {
        planId: plan._id,
        title: plan.goal?.goalType ? `${plan.goal.goalType.replace('_', ' ')} Plan` : 'Cycling Plan',
        planType: plan.planType || 'Custom',
        status: plan.isActive ? 'active' : 'completed',
        isActive: plan.isActive,
        startDate: plan.createdAt,
        endDate: plan.updatedAt,
        totalSessions: plan.dailySessions.length,
        completedSessions: completedSessionsInPlan.length,
        completionRate: plan.dailySessions.length > 0 
          ? (completedSessionsInPlan.length / plan.dailySessions.length) * 100 
          : 0,
        distance: planDistance,
        calories: planCalories,
        duration: planDuration,
      };
    }));
    
    // Calculate completion rate from active plan only (not all plans)
    const completionRate = activePlanTotalSessions > 0 
      ? (activePlanCompletedSessions / activePlanTotalSessions) * 100 
      : 0;
    
    res.json({
      success: true,
      data: {
        totalStats: {
          totalPlans: allPlans.length,
          totalSessions,
          completedSessions,
          distance: totalDistance,
          calories: totalCalories,
          duration: totalDuration,
          completionRate,
        },
        plans: planHistory,
        workoutHistory,
      }
    });
    
  } catch (error) {
    console.error('[ActivityHistory] Error fetching overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity history',
      error: error.message
    });
  }
});

/**
 * GET /api/activity-history/achievements
 * Get user achievements, badges, milestones
 */
router.get('/achievements', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get badges
    const badges = await Badge.find({ userId })
      .sort({ earnedAt: -1 })
      .lean();
    
    // Get milestones
    const milestones = await Milestone.find({ userId })
      .sort({ achievedAt: -1 })
      .lean();
    
    res.json({
      success: true,
      data: {
        badges,
        milestones,
        totalBadges: badges.length,
        totalMilestones: milestones.length,
      }
    });
    
  } catch (error) {
    console.error('[ActivityHistory] Error fetching achievements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch achievements',
      error: error.message
    });
  }
});

/**
 * GET /api/activity-history/chart-data
 * Get chart data for progress visualization
 */
router.get('/chart-data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { timeRange = 'weekly' } = req.query; // weekly, monthly
    
    // Get all completed sessions
    const sessions = await RideSession.find({ 
      userId,
      status: 'completed'
    })
    .sort({ startTime: 1 })
    .lean();
    
    // Group sessions by time range
    const chartData = [];
    const now = new Date();
    
    if (timeRange === 'weekly') {
      // Group by day of week (7 days)
      const dayMap = new Map();
      
      // Get start of current week (Sunday = 0)
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      
      // Initialize all 7 days with zero values
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + i);
        const dayKey = dayDate.toISOString().split('T')[0];
        dayMap.set(dayKey, {
          date: dayKey,
          dayOfWeek: i, // 0=Sun, 1=Mon, ..., 6=Sat
          distance: 0,
          calories: 0,
          duration: 0,
          sessions: 0,
        });
      }
      
      // Add session data to corresponding days
      sessions.forEach(session => {
        const sessionDate = new Date(session.startTime);
        sessionDate.setHours(0, 0, 0, 0);
        const dayKey = sessionDate.toISOString().split('T')[0];
        
        if (dayMap.has(dayKey)) {
          const dayData = dayMap.get(dayKey);
          dayData.distance += session.totalDistance || 0;
          dayData.calories += session.totalCalories || 0;
          dayData.duration += session.duration || 0;
          dayData.sessions += 1;
        }
      });
      
      // Convert to array in order
      chartData.push(...Array.from(dayMap.values()).sort((a, b) => a.dayOfWeek - b.dayOfWeek));
      
    } else if (timeRange === 'monthly') {
      // Group by day of month (all days in current month)
      const dayMap = new Map();
      
      // Get first and last day of current month
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const daysInMonth = lastDay.getDate();
      
      // Initialize all days of month with zero values
      for (let day = 1; day <= daysInMonth; day++) {
        const dayDate = new Date(now.getFullYear(), now.getMonth(), day);
        const dayKey = dayDate.toISOString().split('T')[0];
        dayMap.set(dayKey, {
          date: dayKey,
          dayOfMonth: day,
          distance: 0,
          calories: 0,
          duration: 0,
          sessions: 0,
        });
      }
      
      // Add session data to corresponding days
      sessions.forEach(session => {
        const sessionDate = new Date(session.startTime);
        const isCurrentMonth = sessionDate.getMonth() === now.getMonth() && 
                               sessionDate.getFullYear() === now.getFullYear();
        
        if (isCurrentMonth) {
          sessionDate.setHours(0, 0, 0, 0);
          const dayKey = sessionDate.toISOString().split('T')[0];
          
          if (dayMap.has(dayKey)) {
            const dayData = dayMap.get(dayKey);
            dayData.distance += session.totalDistance || 0;
            dayData.calories += session.totalCalories || 0;
            dayData.duration += session.duration || 0;
            dayData.sessions += 1;
          }
        }
      });
      
      // Convert to array in order
      chartData.push(...Array.from(dayMap.values()).sort((a, b) => a.dayOfMonth - b.dayOfMonth));
    }
    
    console.log(`[ActivityHistory] Chart data for ${timeRange}:`, {
      totalDataPoints: chartData.length,
      totalSessions: sessions.length,
      sampleData: chartData.slice(0, 3),
    });
    
    res.json({
      success: true,
      data: {
        timeRange,
        chartData,
        totalSessions: sessions.length,
      }
    });
    
  } catch (error) {
    console.error('[ActivityHistory] Error fetching chart data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chart data',
      error: error.message
    });
  }
});

export default router;
