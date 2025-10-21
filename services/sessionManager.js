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
    this.isInitialized = false; //  Guard against multiple initializations
    this.initializationPromise = null; // Store initialization promise
  }

  /**
   * Initialize session manager with Redis if available
   */
  async initialize() {
    //  GUARD: Prevent multiple initializations
    if (this.isInitialized) {
      console.log(' SessionManager already initialized - skipping');
      return;
    }
    
    // If initialization is already in progress, wait for it
    if (this.initializationPromise) {
      console.log(' SessionManager initialization in progress - waiting...');
      return await this.initializationPromise;
    }
    
    // Mark initialization in progress and store promise
    this.initializationPromise = this._performInitialization();
    return await this.initializationPromise;
  }

  /**
   * Perform the actual initialization (called only once)
   */
  async _performInitialization() {
    try {
      console.log('🔧 SessionManager._performInitialization() called');
      console.log(`   REDIS_URL exists: ${!!process.env.REDIS_URL}`);
      
      // Try to initialize Redis if REDIS_URL is provided
      if (process.env.REDIS_URL) {
        console.log(' Importing redis client...');
        const { createClient } = await import('redis');
        console.log('Redis module imported successfully');
        
        // 🔧 RENDER FIX: Use explicit configuration matching Redis Cloud format
        console.log(' Creating Redis client with explicit config...');
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

        console.log(' Setting up Redis event handlers...');
        this.redisClient.on('error', (err) => {
          console.error(' Redis session client error:', err.code, err.message);
          logger.warn('Redis session client error:', err);
          
          // 🔧 FIX: Only disable Redis for critical connection errors
          // Don't disable for minor operational errors that don't break connection
          const criticalErrors = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
          if (criticalErrors.includes(err.code)) {
            console.log(` Critical Redis error detected: ${err.code} - Disabling Redis`);
            this.isRedisAvailable = false;
          } else {
            console.log(` Non-critical Redis error: ${err.code} - Keeping Redis enabled`);
            // Keep Redis available for non-critical errors
          }
        });

        this.redisClient.on('connect', () => {
          console.log(' Redis session manager connected');
          logger.info('Redis session manager connected');
          this.isRedisAvailable = true;
        });

        this.redisClient.on('ready', () => {
          console.log('Redis session manager ready');
          logger.info('Redis session manager ready');
          this.isRedisAvailable = true; // Ensure this is set to true on ready
        });

        this.redisClient.on('end', () => {
          console.log('🔚 Redis connection ended');
          this.isRedisAvailable = false;
        });

        this.redisClient.on('reconnecting', () => {
          console.log('Redis reconnecting...');
          // Don't disable Redis during reconnection
        });

        console.log(' Attempting Redis connection...');
        logger.info(' Connecting to Redis Cloud...');
        await this.redisClient.connect();
        console.log('Redis connection established');
        
        console.log('🏓 Testing Redis PING...');
        const pong = await this.redisClient.ping();
        console.log(`Redis PING successful: ${pong}`);
        
        // 🔧 FINAL FIX: Ensure Redis is marked as available after successful initialization
        this.isRedisAvailable = true;
        console.log(`Final Redis status: isRedisAvailable = ${this.isRedisAvailable}`);
        console.log(`Redis client exists: ${!!this.redisClient}`);
        console.log(`Redis client open: ${this.redisClient?.isOpen}`);
        
        //  VERIFICATION: Test Redis immediately after setting status
        setTimeout(async () => {
          console.log(' POST-INIT VERIFICATION (5s later):');
          console.log(`   isRedisAvailable: ${this.isRedisAvailable}`);
          console.log(`   redisClient exists: ${!!this.redisClient}`);
          if (this.redisClient && this.isRedisAvailable) {
            try {
              const testPong = await this.redisClient.ping();
              console.log(`   PING test: ${testPong} `);
            } catch (pingError) {
              console.log(`   PING test failed: ${pingError.message} `);
            }
          }
        }, 5000);
        
        logger.info('Redis session manager initialized successfully');
        console.log(' SessionManager initialization completed successfully');
        
        //  Mark as initialized
        this.isInitialized = true;
        
      } else {
        console.log('No REDIS_URL found - using memory storage');
        logger.info('Using in-memory session storage (development mode)');
        
        //  Mark as initialized (memory fallback)
        this.isInitialized = true;
      }
    } catch (error) {
      console.error(' SessionManager initialization failed:');
      console.error(`   Error: ${error.message}`);
      console.error(`   Code: ${error.code}`);
      console.error(`   Stack: ${error.stack?.split('\n').slice(0, 3).join('\n')}`);
      
      logger.warn(' Redis unavailable, falling back to memory store:', error.message);
      logger.warn('Error details:', error.code, error.stack?.split('\n')[0]);
      this.isRedisAvailable = false;
      
      //  Mark as initialized (memory fallback due to error)
      this.isInitialized = true;
      
      // Don't throw the error - just log it and continue with memory fallback
    }
    
    // Return Redis availability status
    return this.isRedisAvailable;
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