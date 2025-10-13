/**
 * 🔍 Production Redis Performance Monitor
 * Real-time monitoring endpoint for Render + Redis Cloud
 */

import express from 'express';
import SessionManager from '../services/sessionManager.js';
import simpleRedisClient from '../services/simpleRedisClient.js'; // 🔥 Simple Redis client for comparison
import authenticateToken from '../middleware/authenticateToken.js';

const router = express.Router();

/**
 * 📊 Real-time Redis + Performance Dashboard
 * GET /api/v1/monitor/redis-performance
 */
router.get('/redis-performance', authenticateToken, async (req, res) => {
  try {
    const startTime = Date.now();
    
    // 🔍 Test Redis Connection & Performance
    const redisStatus = await testRedisPerformance();
    
    // 📈 Get System Performance Metrics  
    const systemMetrics = await getSystemMetrics();
    
    // ⚡ Calculate API Response Performance
    const responseTime = Date.now() - startTime;
    
    res.json({
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      response_time_ms: responseTime,
      
      // 🚀 Redis Performance Analysis
      redis: redisStatus,
      
      // 📊 System Performance
      system: systemMetrics,
      
      // 🎯 Performance Score (0-100)
      performance_score: calculatePerformanceScore(redisStatus, responseTime),
      
      // ✅ Health Status
      health_status: redisStatus.connected ? 'excellent' : 'degraded',
      
      // 🔧 Optimization Recommendations
      recommendations: generateRecommendations(redisStatus, responseTime)
    });
    
  } catch (error) {
    console.error('Redis performance monitoring error:', error);
    res.status(500).json({
      error: 'Performance monitoring failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 🔥 Comprehensive Redis Performance Test
 */
async function testRedisPerformance() {
  const results = {
    connected: SessionManager.isRedisAvailable,
    storage_type: SessionManager.isRedisAvailable ? 'redis_cloud' : 'memory_fallback',
    response_times: {},
    operations: {},
    errors: []
  };

  if (!SessionManager.isRedisAvailable) {
    results.warning = '⚠️ Redis not available - using memory fallback';
    results.impact = 'Performance degraded by 60-80%';
    return results;
  }

  try {
    // 🏓 Test 1: Basic Connectivity (PING)
    const pingStart = Date.now();
    await SessionManager.redisClient.ping();
    results.response_times.ping_ms = Date.now() - pingStart;

    // 💾 Test 2: Write Performance (SET)
    const setStart = Date.now();
    await SessionManager.redisClient.set(
      'perf:test:write', 
      JSON.stringify({ test: 'data', timestamp: Date.now() }), 
      { EX: 300 }
    );
    results.response_times.write_ms = Date.now() - setStart;

    // 📖 Test 3: Read Performance (GET)
    const getStart = Date.now();
    const testValue = await SessionManager.redisClient.get('perf:test:write');
    results.response_times.read_ms = Date.now() - getStart;
    results.operations.read_success = !!testValue;

    // 📊 Test 4: Redis Stats
    const statsStart = Date.now();
    const redisInfo = await SessionManager.redisClient.info('stats');
    results.response_times.stats_ms = Date.now() - statsStart;
    
    // Parse Redis statistics
    const statsLines = redisInfo.split('\r\n');
    const stats = {};
    statsLines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        if (['total_commands_processed', 'instantaneous_ops_per_sec', 'keyspace_hits', 'keyspace_misses'].includes(key)) {
          stats[key] = parseInt(value) || value;
        }
      }
    });

    results.redis_stats = stats;
    
    // Calculate cache hit ratio
    if (stats.keyspace_hits && stats.keyspace_misses) {
      const total = stats.keyspace_hits + stats.keyspace_misses;
      results.cache_hit_ratio = total > 0 ? ((stats.keyspace_hits / total) * 100).toFixed(1) + '%' : '0%';
    }

    // 🗑️ Cleanup test data
    await SessionManager.redisClient.del('perf:test:write');

  } catch (error) {
    results.errors.push(error.message);
    results.connected = false;
  }

  return results;
}

/**
 * 📈 System Performance Metrics
 */
async function getSystemMetrics() {
  const memUsage = process.memoryUsage();
  
  return {
    memory: {
      used_mb: Math.round(memUsage.rss / 1024 / 1024),
      heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      external_mb: Math.round(memUsage.external / 1024 / 1024)
    },
    process: {
      uptime_minutes: Math.round(process.uptime() / 60),
      cpu_usage: process.cpuUsage(),
      node_version: process.version,
      platform: process.platform
    },
    environment: {
      node_env: process.env.NODE_ENV,
      port: process.env.PORT,
      redis_configured: !!process.env.REDIS_URL,
      mongodb_configured: !!process.env.MONGODB_URI
    }
  };
}

/**
 * 🎯 Calculate Performance Score (0-100)
 */
function calculatePerformanceScore(redisStatus, responseTime) {
  let score = 100;

  // Redis availability (40% of score)
  if (!redisStatus.connected) {
    score -= 40;
  } else {
    // Deduct based on Redis response times
    if (redisStatus.response_times?.ping_ms > 100) score -= 10;
    if (redisStatus.response_times?.read_ms > 50) score -= 10;
    if (redisStatus.response_times?.write_ms > 100) score -= 10;
  }

  // API response time (30% of score)
  if (responseTime > 500) score -= 30;
  else if (responseTime > 200) score -= 15;
  else if (responseTime > 100) score -= 5;

  // Cache hit ratio (30% of score)
  if (redisStatus.cache_hit_ratio) {
    const hitRate = parseFloat(redisStatus.cache_hit_ratio);
    if (hitRate < 70) score -= 30;
    else if (hitRate < 85) score -= 15;
  }

  return Math.max(0, Math.round(score));
}

/**
 * 🔧 Generate Performance Recommendations
 */
function generateRecommendations(redisStatus, responseTime) {
  const recommendations = [];

  if (!redisStatus.connected) {
    recommendations.push({
      priority: 'critical',
      issue: 'Redis disconnected',
      action: 'Check REDIS_URL environment variable and Redis Cloud connectivity'
    });
  }

  if (responseTime > 300) {
    recommendations.push({
      priority: 'high',
      issue: 'Slow API response time',
      action: 'Enable Redis caching to reduce database queries'
    });
  }

  if (redisStatus.cache_hit_ratio && parseFloat(redisStatus.cache_hit_ratio) < 80) {
    recommendations.push({
      priority: 'medium',
      issue: 'Low cache hit ratio',
      action: 'Increase cache TTL or optimize caching strategy'
    });
  }

  if (redisStatus.response_times?.ping_ms > 200) {
    recommendations.push({
      priority: 'medium',
      issue: 'High Redis latency',
      action: 'Check network connectivity to Redis Cloud'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'info',
      issue: 'All systems optimal',
      action: '🎉 Redis Cloud + Render performance is excellent!'
    });
  }

  return recommendations;
}

/**
 * 🚀 Quick Redis Health Check (No Auth Required)
 * GET /api/v1/monitor/redis-health
 */
router.get('/redis-health', async (req, res) => {
  try {
    // � REDIS COMPARISON HEALTH CHECK
    console.log('🏥 REDIS COMPARISON HEALTH CHECK:');
    console.log(`   SessionManager.isRedisAvailable: ${SessionManager.isRedisAvailable}`);
    console.log(`   SessionManager.redisClient exists: ${!!SessionManager.redisClient}`);
    console.log(`   SessionManager.redisClient.isOpen: ${SessionManager.redisClient?.isOpen}`);
    
    const simpleStatus = simpleRedisClient.getStatus();
    console.log(`   SimpleRedis Status:`, JSON.stringify(simpleStatus, null, 2));
    
    const health = {
      timestamp: new Date().toISOString(),
      
      // 🔥 SessionManager Redis Status  
      session_manager: {
        available: SessionManager.isRedisAvailable,
        client_exists: !!SessionManager.redisClient,
        client_open: SessionManager.redisClient?.isOpen || false
      },
      
      // 🔥 SimpleRedis Status
      simple_redis: simpleStatus,
      
      // 🔥 Overall Status (use SimpleRedis if SessionManager fails)
      redis_available: SessionManager.isRedisAvailable || simpleStatus.connected,
      storage_type: SessionManager.isRedisAvailable ? 'session_manager_redis' : 
                   simpleStatus.connected ? 'simple_redis_client' : 'memory_fallback'
    };

    // Test SessionManager Redis if available
    if (SessionManager.isRedisAvailable) {
      try {
        const pingStart = Date.now();
        await SessionManager.redisClient.ping();
        health.session_manager.ping_ms = Date.now() - pingStart;
        console.log(`✅ SessionManager PING successful: ${health.session_manager.ping_ms}ms`);
      } catch (error) {
        health.session_manager.ping_error = error.message;
        console.log(`❌ SessionManager PING failed: ${error.message}`);
      }
    }

    // Test SimpleRedis if available
    if (simpleStatus.connected) {
      try {
        const pingStart = Date.now();
        const pingResult = await simpleRedisClient.ping();
        health.simple_redis.ping_ms = Date.now() - pingStart;
        health.simple_redis.ping_success = pingResult;
        console.log(`✅ SimpleRedis PING successful: ${health.simple_redis.ping_ms}ms`);
      } catch (error) {
        health.simple_redis.ping_error = error.message;
        console.log(`❌ SimpleRedis PING failed: ${error.message}`);
      }
    }

    // Determine overall health status
    if (health.session_manager.available || health.simple_redis.connected) {
      health.status = 'healthy';
    } else {
      health.status = 'degraded';
      health.message = 'Both Redis clients unavailable - using memory fallback';
    }

    res.json(health);
  } catch (error) {
    res.status(500).json({
      timestamp: new Date().toISOString(),
      status: 'error',
      error: error.message
    });
  }
});

/**
 * 🔍 RENDER REDIS DIAGNOSTIC (Temporary Debug Endpoint)
 * GET /api/v1/monitor/redis-diagnostic
 */
router.get('/redis-diagnostic', async (req, res) => {
  const diagnostic = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    platform: process.platform,
    node_version: process.version,
    redis_url_configured: !!process.env.REDIS_URL,
    redis_url_preview: process.env.REDIS_URL ? 
      process.env.REDIS_URL.replace(/:([^:@]{8})[^:@]*@/, ':$1***@') : 'NOT SET',
    session_manager_status: {
      available: SessionManager.isRedisAvailable,
      client_exists: !!SessionManager.redisClient
    }
  };

  if (process.env.REDIS_URL) {
    try {
      console.log('🔍 Testing Redis connection for diagnostic...');
      const { createClient } = await import('redis');
      const testClient = createClient({
        username: 'default',
        password: 'MzcxWsuM3beem2R2fEW7ju8cHT4CnF2R',
        socket: {
          host: 'redis-19358.c295.ap-southeast-1-1.ec2.redns.redis-cloud.com',
          port: 19358,
          connectTimeout: 5000,
          commandTimeout: 3000,
          lazyConnect: false
        }
      });
      
      const startTime = Date.now();
      await testClient.connect();
      const connectTime = Date.now() - startTime;
      
      const pingStart = Date.now();
      const pong = await testClient.ping();
      const pingTime = Date.now() - pingStart;
      
      await testClient.quit();
      
      diagnostic.redis_test = 'SUCCESS';
      diagnostic.connection_time_ms = connectTime;
      diagnostic.ping_time_ms = pingTime;
      diagnostic.ping_response = pong;
      diagnostic.message = '✅ Redis connection working on Render!';
      
      console.log('✅ Redis diagnostic test passed');
    } catch (error) {
      diagnostic.redis_test = 'FAILED';
      diagnostic.error_code = error.code;
      diagnostic.error_message = error.message;
      diagnostic.error_stack = error.stack?.split('\n')[0]; // First line only
      
      console.log('❌ Redis diagnostic test failed:', error.message);
      
      // Add specific troubleshooting hints
      if (error.code === 'ENOTFOUND') {
        diagnostic.troubleshooting = 'DNS resolution failed - check Redis hostname';
      } else if (error.code === 'ECONNREFUSED') {
        diagnostic.troubleshooting = 'Connection refused - check Redis server status and port';
      } else if (error.code === 'ETIMEDOUT') {
        diagnostic.troubleshooting = 'Connection timeout - check IP whitelist (set to 0.0.0.0/0)';
      } else if (error.message.includes('AUTH')) {
        diagnostic.troubleshooting = 'Authentication failed - check Redis password';
      }
    }
  } else {
    diagnostic.redis_test = 'SKIPPED';
    diagnostic.message = '❌ REDIS_URL environment variable not set on Render';
    diagnostic.troubleshooting = 'Add REDIS_URL to Render environment variables';
  }

  res.json(diagnostic);
});

export default router;