/**
 * PHASE 1 OPTIMIZATION: Redis Session Manager
 * 
 * Scalable session management using Redis for horizontal scaling
 * Falls back to in-memory storage for development
 */

import logger from '../utils/logger.js';

class SessionManager {
  constructor() {
    this.isRedisAvailable = false;
    this.redisClient = null;
    this.memoryStore = new Map(); // Fallback for development
    this.sessionTTL = 7 * 24 * 60 * 60; // 7 days in seconds
  }

  /**
   * Initialize session manager with Redis if available
   */
  async initialize() {
    try {
      // Try to initialize Redis if REDIS_URL is provided
      if (process.env.REDIS_URL) {
        const { createClient } = await import('redis');
        
        // 🔧 RENDER FIX: Use explicit configuration matching Redis Cloud format
        // This matches your working Redis Cloud connection exactly
        this.redisClient = createClient({
          username: 'default',
          password: 'MzcxWsuM3beem2R2fEW7ju8cHT4CnF2R',
          socket: {
            host: 'redis-19358.c295.ap-southeast-1-1.ec2.redns.redis-cloud.com',
            port: 19358,
            connectTimeout: 10000, // 10 seconds for Render
            commandTimeout: 5000,
            lazyConnect: false // Connect immediately for better error detection
          },
          // Additional Redis Cloud optimizations
          retry_unfulfilled_commands: true,
          enable_offline_queue: false
        });

        this.redisClient.on('error', (err) => {
          logger.warn('Redis session client error:', err);
          this.isRedisAvailable = false;
        });

        this.redisClient.on('connect', () => {
          logger.info('✅ Redis session manager connected');
          this.isRedisAvailable = true;
        });

        this.redisClient.on('ready', () => {
          logger.info('✅ Redis session manager ready');
        });

        logger.info('🔗 Connecting to Redis Cloud...');
        await this.redisClient.connect();
        
        // Test Redis connection
        await this.redisClient.ping();
        logger.info('✅ Redis session manager initialized successfully');
        
      } else {
        logger.info('📝 Using in-memory session storage (development mode)');
      }
    } catch (error) {
      logger.warn('⚠️ Redis unavailable, falling back to memory store:', error.message);
      logger.warn('Error details:', error.code, error.stack?.split('\n')[0]);
      this.isRedisAvailable = false;
    }
  }

  /**
   * Store session data
   */
  async setSession(sessionId, userData, expiresIn = this.sessionTTL) {
    try {
      const sessionData = {
        ...userData,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (expiresIn * 1000)).toISOString()
      };

      if (this.isRedisAvailable && this.redisClient) {
        await this.redisClient.setEx(
          `session:${sessionId}`, 
          expiresIn, 
          JSON.stringify(sessionData)
        );
      } else {
        // Fallback to memory store with timeout
        this.memoryStore.set(sessionId, sessionData);
        setTimeout(() => {
          this.memoryStore.delete(sessionId);
        }, expiresIn * 1000);
      }

      logger.debug(`Session stored: ${sessionId}`);
      return true;
    } catch (error) {
      logger.error('Failed to store session:', error);
      return false;
    }
  }

  /**
   * Retrieve session data
   */
  async getSession(sessionId) {
    try {
      if (this.isRedisAvailable && this.redisClient) {
        const sessionData = await this.redisClient.get(`session:${sessionId}`);
        return sessionData ? JSON.parse(sessionData) : null;
      } else {
        // Check memory store
        const sessionData = this.memoryStore.get(sessionId);
        if (sessionData) {
          // Check if expired
          const now = new Date();
          const expiresAt = new Date(sessionData.expiresAt);
          if (now > expiresAt) {
            this.memoryStore.delete(sessionId);
            return null;
          }
          return sessionData;
        }
        return null;
      }
    } catch (error) {
      logger.error('Failed to retrieve session:', error);
      return null;
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId) {
    try {
      if (this.isRedisAvailable && this.redisClient) {
        await this.redisClient.del(`session:${sessionId}`);
      } else {
        this.memoryStore.delete(sessionId);
      }
      logger.debug(`Session deleted: ${sessionId}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete session:', error);
      return false;
    }
  }

  /**
   * Update session expiry
   */
  async refreshSession(sessionId, expiresIn = this.sessionTTL) {
    try {
      if (this.isRedisAvailable && this.redisClient) {
        const exists = await this.redisClient.exists(`session:${sessionId}`);
        if (exists) {
          await this.redisClient.expire(`session:${sessionId}`, expiresIn);
          return true;
        }
      } else {
        const sessionData = this.memoryStore.get(sessionId);
        if (sessionData) {
          sessionData.expiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();
          return true;
        }
      }
      return false;
    } catch (error) {
      logger.error('Failed to refresh session:', error);
      return false;
    }
  }

  /**
   * Get session statistics
   */
  async getStats() {
    try {
      if (this.isRedisAvailable && this.redisClient) {
        const keys = await this.redisClient.keys('session:*');
        return {
          activeSessions: keys.length,
          storageType: 'redis',
          redisConnected: true
        };
      } else {
        return {
          activeSessions: this.memoryStore.size,
          storageType: 'memory',
          redisConnected: false
        };
      }
    } catch (error) {
      logger.error('Failed to get session stats:', error);
      return {
        activeSessions: 0,
        storageType: 'unknown',
        redisConnected: false,
        error: error.message
      };
    }
  }

  /**
   * Cleanup expired sessions (for memory store)
   */
  cleanupExpiredSessions() {
    if (!this.isRedisAvailable) {
      const now = new Date();
      let cleanupCount = 0;
      
      for (const [sessionId, sessionData] of this.memoryStore.entries()) {
        const expiresAt = new Date(sessionData.expiresAt);
        if (now > expiresAt) {
          this.memoryStore.delete(sessionId);
          cleanupCount++;
        }
      }
      
      if (cleanupCount > 0) {
        logger.debug(`Cleaned up ${cleanupCount} expired sessions`);
      }
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      if (this.isRedisAvailable && this.redisClient) {
        await this.redisClient.quit();
        logger.info('Redis session manager disconnected');
      }
      this.memoryStore.clear();
    } catch (error) {
      logger.error('Error during session manager shutdown:', error);
    }
  }
}

// Export singleton instance
export default new SessionManager();