/**
 * 🚀 ULTRA-FAST HOME DASHBOARD API
 * 
 * Unified endpoint that returns ALL home screen data in a single request
 * Optimized with Redis caching and aggregated database queries
 */

import express from 'express';
import authenticateToken from '../middleware/authenticateToken.js';
import User from '../models/User.js';
import CyclingPlan from '../models/CyclingPlan.js';
import Goal from '../models/Goal.js';
import { Telemetry } from '../models/Telemetry.js';
import logger from '../utils/logger.js';
import SessionManager from '../services/sessionManager.js';

const router = express.Router();

// Redis cache keys
const CACHE_KEYS = {
  homeDashboard: (userId, month, year) => `home_dashboard:${userId}:${month}:${year}`,
  userPlan: (userId) => `user_plan:${userId}`,
  userStats: (userId) => `user_stats:${userId}`,
};

// Cache TTL (Time To Live) in seconds
const CACHE_TTL = {
  dashboard: 30,    // 30 seconds for dashboard data
  plan: 300,        // 5 minutes for plan data 
  stats: 120,       // 2 minutes for stats
};

/**
 * 🚀 MAIN ENDPOINT: GET /api/dashboard/home
 * Returns ALL home screen data in single optimized response
 */
router.get('/home', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const userId = req.user.userId;
    const now = new Date();
    const cacheKey = CACHE_KEYS.homeDashboard(userId, now.getMonth() + 1, now.getFullYear());
    
    // 🚀 STEP 1: Check Redis cache first
    let cachedData = null;
    try {
      if (SessionManager.isRedisAvailable) {
        const cached = await SessionManager.redisClient.get(cacheKey);
        if (cached) {
          cachedData = JSON.parse(cached);
          const cacheAge = Date.now() - cachedData.timestamp;
          
          // Return cached data if less than 30 seconds old
          if (cacheAge < CACHE_TTL.dashboard * 1000) {
            logger.info(`🚀 Dashboard cache HIT (${cacheAge}ms old) for user ${userId}`);
            
            return res.status(200).json({
              success: true,
              data: cachedData.data,
              cached: true,
              cacheAge: Math.round(cacheAge / 1000),
              responseTime: Date.now() - startTime
            });
          }
        }
      }
    } catch (cacheError) {
      logger.warn('Cache read error:', cacheError.message);
    }

    // 🚀 STEP 2: Execute optimized parallel database queries
    logger.info(`🔄 Dashboard cache MISS - fetching fresh data for user ${userId}`);
    
    const [user, activePlan, recentTelemetry] = await Promise.all([
      // Get user with minimal fields
      User.findById(userId).select('profile email').lean(),
      
      // Get active plan with populated sessions
      CyclingPlan.findOne({ user: userId, isActive: true })
        .populate('goal')
        .lean(),
      
      // Get recent telemetry for chart data (last 30 days)
      Telemetry.find({ 
        userId,
        timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      })
      .select('timestamp calories distance speed')
      .sort({ timestamp: -1 })
      .limit(100)
      .lean()
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // 🚀 STEP 3: Process data efficiently
    const dashboardData = await _processDashboardData({
      user,
      activePlan,
      recentTelemetry,
      currentMonth: now.getMonth() + 1,
      currentYear: now.getFullYear()
    });

    // 🚀 STEP 4: Cache the processed data
    try {
      if (SessionManager.isRedisAvailable) {
        const cacheData = {
          data: dashboardData,
          timestamp: Date.now(),
          userId
        };
        
        await SessionManager.redisClient.setEx(
          cacheKey, 
          CACHE_TTL.dashboard, 
          JSON.stringify(cacheData)
        );
        
        logger.info(`📦 Dashboard data cached for user ${userId}`);
      }
    } catch (cacheError) {
      logger.warn('Cache write error:', cacheError.message);
    }

    // 🚀 STEP 5: Return optimized response
    const responseTime = Date.now() - startTime;
    
    res.status(200).json({
      success: true,
      data: dashboardData,
      cached: false,
      responseTime,
      meta: {
        userId,
        timestamp: new Date().toISOString(),
        dataFreshness: 'live'
      }
    });

    logger.info(`✅ Dashboard served in ${responseTime}ms for user ${userId}`);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Dashboard endpoint error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to load dashboard data',
      details: error.message,
      responseTime
    });
  }
});

/**
 * 🚀 OPTIMIZATION: Process all dashboard data in single function
 * Replaces multiple separate API calls with unified processing
 */
async function _processDashboardData({ user, activePlan, recentTelemetry, currentMonth, currentYear }) {
  const result = {
    // Plan data
    totalCaloriesToBurn: 0,
    caloriesBurned: 0,
    completedSessions: 0,
    totalSessions: 0,
    
    // Stats
    totalWorkouts: 0,
    totalDistance: 0,
    totalCalories: 0,
    totalMissedHours: 0,
    
    // Calendar data
    sessionStatus: {},
    
    // Chart data
    chartData: [],
    
    // User info
    userProfile: {
      name: user.profile?.firstName || 'User',
      email: user.email,
      profileComplete: !!(user.profile?.weight && user.profile?.height)
    },
    
    // Health status
    requiresHealthScreening: false
  };

  // Process active plan data
  if (activePlan && activePlan.dailySessions) {
    const sessions = activePlan.dailySessions;
    
    // Extract plan summary
    result.totalCaloriesToBurn = activePlan.planSummary?.totalCaloriesToBurn || 
                                activePlan.originalPlan?.goalCalories || 0;
    
    result.totalSessions = sessions.length;
    
    // Process each session
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const sessionDate = new Date(session.date);
      
      // Only process current month sessions for calendar
      if (sessionDate.getMonth() + 1 === currentMonth && sessionDate.getFullYear() === currentYear) {
        const day = sessionDate.getDate();
        const status = session.status?.toLowerCase();
        
        // Update calendar status
        switch (status) {
          case 'completed':
            result.sessionStatus[day] = 'completed';
            result.completedSessions++;
            result.caloriesBurned += session.actualCalories || 0;
            result.totalDistance += session.actualDistance || 0;
            result.totalWorkouts++;
            break;
            
          case 'missed':
            result.sessionStatus[day] = 'missed';
            result.totalMissedHours += session.plannedDuration || 0;
            break;
            
          case 'current':
          case 'active':
            result.sessionStatus[day] = 'current';
            break;
            
          case 'rescheduled':
            result.sessionStatus[day] = 'rescheduled';
            break;
            
          default:
            result.sessionStatus[day] = 'scheduled';
        }
      }
      
      // Add to chart data if completed
      if (session.status?.toLowerCase() === 'completed') {
        result.chartData.push({
          x: i,
          y: session.actualCalories || 0
        });
      }
    }
    
    result.totalCalories = Math.round(result.caloriesBurned);
    
  } else {
    // No active plan - check if health screening required
    result.requiresHealthScreening = !user.profile?.healthScreeningComplete;
  }

  // Process recent telemetry for enhanced chart data
  if (recentTelemetry && recentTelemetry.length > 0) {
    // Supplement chart data with recent telemetry if available
    const telemetryChartData = recentTelemetry
      .slice(0, 30) // Last 30 data points
      .reverse() // Chronological order
      .map((entry, index) => ({
        x: result.chartData.length + index,
        y: entry.calories || 0
      }));
      
    result.chartData.push(...telemetryChartData);
  }

  return result;
}

/**
 * 🚀 CACHE MANAGEMENT: Clear user cache when plan changes
 */
router.delete('/cache/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Only allow users to clear their own cache (or admin)
    if (req.user.userId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to clear this cache'
      });
    }
    
    if (SessionManager.isRedisAvailable) {
      // Clear all dashboard cache keys for this user
      const now = new Date();
      const patterns = [
        CACHE_KEYS.homeDashboard(userId, now.getMonth() + 1, now.getFullYear()),
        CACHE_KEYS.userPlan(userId),
        CACHE_KEYS.userStats(userId)
      ];
      
      for (const pattern of patterns) {
        await SessionManager.redisClient.del(pattern);
      }
      
      logger.info(`🧹 Cache cleared for user ${userId}`);
      
      res.json({
        success: true,
        message: 'Cache cleared successfully',
        clearedKeys: patterns.length
      });
    } else {
      res.json({
        success: true,
        message: 'Redis not available - no cache to clear'
      });
    }
    
  } catch (error) {
    logger.error('Cache clear error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      details: error.message
    });
  }
});

/**
 * 🚀 HEALTH CHECK: Dashboard endpoint performance
 */
router.get('/health', (req, res) => {
  const stats = {
    status: 'healthy',
    redis: SessionManager.isRedisAvailable ? 'connected' : 'unavailable',
    endpoints: {
      dashboard: '/api/dashboard/home',
      cacheManagement: '/api/dashboard/cache/:userId'
    },
    caching: {
      dashboardTTL: CACHE_TTL.dashboard,
      planTTL: CACHE_TTL.plan,
      statsTTL: CACHE_TTL.stats
    }
  };
  
  res.json(stats);
});

export default router;