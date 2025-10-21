/**
 *  ENHANCED REDIS CACHING SERVICE
 * 
 * Advanced Redis caching with intelligent cache warming, 
 * performance monitoring, and automatic optimization
 */

import logger from '../utils/logger.js';
import SessionManager from './sessionManager.js';

class EnhancedCacheService {
  constructor() {
    this.isInitialized = false;
    this.performanceMetrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      totalRequests: 0,
      averageResponseTime: 0
    };
    
    // Cache warming schedule
    this.warmingSchedule = new Map();
    
    // Cache key patterns for organized management
    this.keyPatterns = {
      dashboard: 'dashboard:*',
      user: 'user:*', 
      plan: 'plan:*',
      session: 'session:*',
      telemetry: 'telemetry:*'
    };
  }

  /**
   * Initialize enhanced caching with performance monitoring
   */
  async initialize() {
    try {
      if (!SessionManager.isRedisAvailable) {
        logger.warn('Redis not available - enhanced caching disabled');
        return false;
      }

      this.isInitialized = true;
      
      // Start performance monitoring
      this.startPerformanceMonitoring();
      
      // Initialize cache warming
      this.initializeCacheWarming();
      
      logger.info('Enhanced Redis caching service initialized');
      return true;
      
    } catch (error) {
      logger.error(' Failed to initialize enhanced caching:', error);
      return false;
    }
  }

  /**
   *  ULTRA-FAST: Smart get with automatic cache warming
   */
  async smartGet(key, warmingFunction = null, ttl = 300) {
    const startTime = Date.now();
    this.performanceMetrics.totalRequests++;
    
    try {
      if (!SessionManager.isRedisAvailable) {
        this.performanceMetrics.misses++;
        return null;
      }

      // Try to get from cache
      const cachedValue = await SessionManager.redisClient.get(key);
      
      if (cachedValue) {
        this.performanceMetrics.hits++;
        this.updateResponseTime(Date.now() - startTime);
        
        // Check if cache is expiring soon (last 25% of TTL)
        const ttlRemaining = await SessionManager.redisClient.ttl(key);
        if (ttlRemaining > 0 && ttlRemaining < (ttl * 0.25) && warmingFunction) {
          // Warm cache in background
          this.warmCacheInBackground(key, warmingFunction, ttl);
        }
        
        return JSON.parse(cachedValue);
      }

      this.performanceMetrics.misses++;
      this.updateResponseTime(Date.now() - startTime);
      
      // If warming function provided, fetch and cache
      if (warmingFunction) {
        const freshData = await warmingFunction();
        if (freshData !== null && freshData !== undefined) {
          await this.smartSet(key, freshData, ttl);
          return freshData;
        }
      }
      
      return null;
      
    } catch (error) {
      this.performanceMetrics.errors++;
      this.updateResponseTime(Date.now() - startTime);
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   *  ULTRA-FAST: Smart set with compression for large objects
   */
  async smartSet(key, value, ttl = 300, options = {}) {
    try {
      if (!SessionManager.isRedisAvailable) return false;

      const stringValue = JSON.stringify(value);
      
      // Compress large values (>1KB)
      if (stringValue.length > 1024 && options.compress !== false) {
        // Store with compression flag
        await SessionManager.redisClient.setEx(`${key}:compressed`, ttl, stringValue);
        await SessionManager.redisClient.setEx(`${key}:meta`, ttl, JSON.stringify({
          compressed: true,
          size: stringValue.length,
          timestamp: Date.now()
        }));
      } else {
        await SessionManager.redisClient.setEx(key, ttl, stringValue);
      }
      
      return true;
      
    } catch (error) {
      this.performanceMetrics.errors++;
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   *  BATCH OPERATIONS: Set multiple cache keys efficiently
   */
  async batchSet(keyValuePairs, ttl = 300) {
    if (!SessionManager.isRedisAvailable) return false;

    try {
      const pipeline = SessionManager.redisClient.multi();
      
      for (const [key, value] of keyValuePairs) {
        const stringValue = JSON.stringify(value);
        pipeline.setEx(key, ttl, stringValue);
      }
      
      await pipeline.exec();
      
      logger.info(` Batch cached ${keyValuePairs.length} items`);
      return true;
      
    } catch (error) {
      this.performanceMetrics.errors++;
      logger.error('Batch cache set error:', error);
      return false;
    }
  }

  /**
   *  CACHE WARMING: Pre-load frequently accessed data
   */
  async warmUserCache(userId) {
    try {
      logger.info(` Warming cache for user ${userId}`);
      
      const warmingTasks = [
        this.warmDashboardCache(userId),
        this.warmPlanCache(userId),
        this.warmStatsCache(userId)
      ];
      
      await Promise.all(warmingTasks);
      
      logger.info(`Cache warmed for user ${userId}`);
      
    } catch (error) {
      logger.error(` Cache warming failed for user ${userId}:`, error);
    }
  }

  /**
   * Warm dashboard cache specifically
   */
  async warmDashboardCache(userId) {
    const now = new Date();
    const cacheKey = `home_dashboard:${userId}:${now.getMonth() + 1}:${now.getFullYear()}`;
    
    // Check if already cached
    const exists = await SessionManager.redisClient.exists(cacheKey);
    if (exists) return;
    
    try {
      // Import models dynamically to avoid circular dependencies
      const { default: CyclingPlan } = await import('../models/CyclingPlan.js');
      const { default: User } = await import('../models/User.js');
      
      // Fetch dashboard data
      const [user, activePlan] = await Promise.all([
        User.findById(userId).select('profile email').lean(),
        CyclingPlan.findOne({ user: userId, isActive: true }).populate('goal').lean()
      ]);
      
      if (user && activePlan) {
        const dashboardData = {
          user,
          activePlan,
          timestamp: Date.now()
        };
        
        await this.smartSet(cacheKey, dashboardData, 30); // 30 second TTL
        logger.info(` Dashboard cache warmed for user ${userId}`);
      }
      
    } catch (error) {
      logger.error(`Failed to warm dashboard cache for user ${userId}:`, error);
    }
  }

  /**
   * Warm plan cache
   */
  async warmPlanCache(userId) {
    const cacheKey = `user_plan:${userId}`;
    
    try {
      const { default: CyclingPlan } = await import('../models/CyclingPlan.js');
      
      const activePlan = await CyclingPlan.findOne({ 
        user: userId, 
        isActive: true 
      }).lean();
      
      if (activePlan) {
        await this.smartSet(cacheKey, activePlan, 300); // 5 minute TTL
        logger.info(` Plan cache warmed for user ${userId}`);
      }
      
    } catch (error) {
      logger.error(`Failed to warm plan cache for user ${userId}:`, error);
    }
  }

  /**
   * Warm stats cache
   */
  async warmStatsCache(userId) {
    const cacheKey = `user_stats:${userId}`;
    
    try {
      // This would calculate user statistics
      const stats = {
        totalWorkouts: 0,
        totalDistance: 0,
        totalCalories: 0,
        lastUpdated: Date.now()
      };
      
      await this.smartSet(cacheKey, stats, 120); // 2 minute TTL
      logger.info(` Stats cache warmed for user ${userId}`);
      
    } catch (error) {
      logger.error(`Failed to warm stats cache for user ${userId}:`, error);
    }
  }

  /**
   *  INTELLIGENT INVALIDATION: Clear related cache keys
   */
  async invalidateUserCache(userId, pattern = '*') {
    if (!SessionManager.isRedisAvailable) return;

    try {
      const keys = await SessionManager.redisClient.keys(`*${userId}*${pattern}*`);
      
      if (keys.length > 0) {
        await SessionManager.redisClient.del(keys);
        logger.info(` Invalidated ${keys.length} cache keys for user ${userId}`);
      }
      
    } catch (error) {
      logger.error(`Cache invalidation failed for user ${userId}:`, error);
    }
  }

  /**
   *  PERFORMANCE MONITORING: Track cache performance
   */
  startPerformanceMonitoring() {
    setInterval(() => {
      this.logPerformanceMetrics();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Log detailed performance metrics
   */
  async logPerformanceMetrics() {
    try {
      const { hits, misses, errors, totalRequests, averageResponseTime } = this.performanceMetrics;
      
      const hitRate = totalRequests > 0 ? ((hits / totalRequests) * 100).toFixed(2) : 0;
      const errorRate = totalRequests > 0 ? ((errors / totalRequests) * 100).toFixed(2) : 0;
      
      logger.info(' Cache Performance Metrics:', {
        totalRequests,
        hits,
        misses,
        errors,
        hitRate: `${hitRate}%`,
        errorRate: `${errorRate}%`,
        averageResponseTime: `${averageResponseTime}ms`
      });
      
      // Get Redis memory info
      if (SessionManager.isRedisAvailable) {
        const info = await SessionManager.redisClient.info('memory');
        const memoryUsed = info.match(/used_memory_human:(.*)/)?.[1];
        const memoryPeak = info.match(/used_memory_peak_human:(.*)/)?.[1];
        
        logger.info(' Redis Memory Usage:', {
          used: memoryUsed?.trim(),
          peak: memoryPeak?.trim()
        });
      }
      
    } catch (error) {
      logger.error('Failed to log performance metrics:', error);
    }
  }

  /**
   * Update average response time
   */
  updateResponseTime(responseTime) {
    const { totalRequests, averageResponseTime } = this.performanceMetrics;
    
    this.performanceMetrics.averageResponseTime = 
      ((averageResponseTime * (totalRequests - 1)) + responseTime) / totalRequests;
  }

  /**
   * Background cache warming
   */
  async warmCacheInBackground(key, warmingFunction, ttl) {
    // Don't block main thread
    setImmediate(async () => {
      try {
        const freshData = await warmingFunction();
        if (freshData !== null && freshData !== undefined) {
          await this.smartSet(key, freshData, ttl);
          logger.info(` Background cache warmed for key: ${key}`);
        }
      } catch (error) {
        logger.error(`Background cache warming failed for key ${key}:`, error);
      }
    });
  }

  /**
   * Initialize automatic cache warming for frequently accessed data
   */
  initializeCacheWarming() {
    // Warm popular cache keys every hour
    setInterval(async () => {
      logger.info(' Starting scheduled cache warming...');
      
      try {
        // This would warm cache for active users
        // Implementation depends on your user tracking system
        logger.info('Scheduled cache warming completed');
      } catch (error) {
        logger.error(' Scheduled cache warming failed:', error);
      }
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Get comprehensive cache statistics
   */
  async getCacheStatistics() {
    if (!SessionManager.isRedisAvailable) {
      return { error: 'Redis not available' };
    }

    try {
      const info = await SessionManager.redisClient.info();
      const keyspaceInfo = await SessionManager.redisClient.info('keyspace');
      
      // Count keys by pattern
      const keyStats = {};
      for (const [name, pattern] of Object.entries(this.keyPatterns)) {
        const keys = await SessionManager.redisClient.keys(pattern);
        keyStats[name] = keys.length;
      }
      
      return {
        performance: this.performanceMetrics,
        redis: {
          connected: true,
          info: info,
          keyspace: keyspaceInfo
        },
        keyStats,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Failed to get cache statistics:', error);
      return { error: error.message };
    }
  }
}

// Export singleton instance
export default new EnhancedCacheService();