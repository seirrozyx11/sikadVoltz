/**
 * Redis Setup Script for SikadVoltz Backend
 * 
 * Initializes Redis with optimal configuration for session management
 */

import dotenv from 'dotenv';
import { createClient } from 'redis';
import logger from '../utils/logger.js';

// Load environment variables
dotenv.config();

class RedisSetup {
  constructor() {
    this.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = null;
  }

  async initialize() {
    console.log(' Initializing Redis for SikadVoltz Backend...');
    
    try {
      // Create Redis client
      this.client = createClient({
        url: this.redisUrl,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true
        }
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      this.client.on('connect', () => {
        console.log('Connected to Redis');
      });

      // Connect
      await this.client.connect();
      
      // Run setup tasks
      await this.createIndexes();
      await this.setOptimalConfiguration();
      await this.cleanupOldSessions();
      
      console.log('Redis setup completed successfully!');
      return true;
      
    } catch (error) {
      console.error(' Redis setup failed:', error.message);
      return false;
    } finally {
      if (this.client) {
        await this.client.quit();
      }
    }
  }

  async createIndexes() {
    console.log('📑 Setting up Redis indexes...');
    
    // Create sample session pattern for documentation
    const sampleSession = {
      userId: 'user_123',
      email: 'user@example.com',
      role: 'user',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      lastActivity: new Date().toISOString()
    };
    
    // Store sample session (will expire in 60 seconds)
    await this.client.setEx('session:sample', 60, JSON.stringify(sampleSession));
    console.log('   Session pattern created');
  }

  async setOptimalConfiguration() {
    console.log('  Applying optimal Redis configuration...');
    
    try {
      // These configurations optimize Redis for session storage
      const configs = [
        ['maxmemory-policy', 'allkeys-lru'], // Evict least recently used keys when memory limit reached
        ['timeout', '300'],                  // Client idle timeout
        ['tcp-keepalive', '60'],            // TCP keepalive
      ];
      
      for (const [key, value] of configs) {
        try {
          await this.client.configSet(key, value);
          console.log(`   Set ${key} = ${value}`);
        } catch (configError) {
          console.log(`     Could not set ${key}: ${configError.message}`);
        }
      }
    } catch (error) {
      console.log('     Configuration adjustment limited (may require Redis admin privileges)');
    }
  }

  async cleanupOldSessions() {
    console.log(' Cleaning up old sessions...');
    
    try {
      // Find all session keys
      const sessionKeys = await this.client.keys('session:*');
      let cleanedCount = 0;
      
      for (const key of sessionKeys) {
        // Skip the sample session we just created
        if (key === 'session:sample') continue;
        
        try {
          const sessionData = await this.client.get(key);
          if (sessionData) {
            const session = JSON.parse(sessionData);
            const expiresAt = new Date(session.expiresAt);
            
            // Remove expired sessions
            if (expiresAt < new Date()) {
              await this.client.del(key);
              cleanedCount++;
            }
          }
        } catch (parseError) {
          // Invalid session data, remove it
          await this.client.del(key);
          cleanedCount++;
        }
      }
      
      console.log(`   Cleaned up ${cleanedCount} old sessions`);
    } catch (error) {
      console.log('     Session cleanup failed:', error.message);
    }
  }

  async showStats() {
    console.log('\n Redis Statistics:');
    
    try {
      // Get basic info
      const info = await this.client.info('memory');
      const memoryInfo = info.split('\r\n').filter(line => 
        line.includes('used_memory_human') || 
        line.includes('maxmemory_human') ||
        line.includes('mem_fragmentation_ratio')
      );
      
      memoryInfo.forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          console.log(`   ${key}: ${value}`);
        }
      });
      
      // Count sessions
      const sessionKeys = await this.client.keys('session:*');
      console.log(`   active_sessions: ${sessionKeys.length}`);
      
    } catch (error) {
      console.log('   Could not retrieve statistics:', error.message);
    }
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new RedisSetup();
  
  setup.initialize()
    .then(async (success) => {
      if (success) {
        await setup.showStats();
        console.log('\n Redis is ready for production session management!');
        console.log('\nNext steps:');
        console.log('   1. Start your backend server: npm run dev');
        console.log('   2. Test session creation via API calls');
        console.log('   3. Monitor sessions: redis-cli monitor');
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Setup error:', error);
      process.exit(1);
    });
}

export default RedisSetup;