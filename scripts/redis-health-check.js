/**
 * Redis Health Check Script for SikadVoltz Backend
 * 
 * Tests Redis connection and validates session management setup
 */

import dotenv from 'dotenv';
import { createClient } from 'redis';
import logger from '../utils/logger.js';

// Load environment variables
dotenv.config();

class RedisHealthChecker {
  constructor() {
    this.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = null;
  }

  async checkConnection() {
    console.log('🔍 Testing Redis Connection...');
    console.log(`📍 Redis URL: ${this.redisUrl}`);
    
    try {
      // Create Redis client
      this.client = createClient({
        url: this.redisUrl,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true
        }
      });

      // Set up error handler
      this.client.on('error', (err) => {
        console.error('❌ Redis Client Error:', err.message);
      });

      // Connect to Redis
      console.log('🔌 Connecting to Redis...');
      await this.client.connect();
      
      // Test basic operations
      await this.runBasicTests();
      await this.testSessionOperations();
      
      console.log('✅ Redis health check completed successfully!');
      return true;
      
    } catch (error) {
      console.error('❌ Redis health check failed:', error.message);
      console.log('\n💡 Troubleshooting:');
      console.log('   1. Check if Redis is running: docker-compose -f docker-compose.redis.yml up -d');
      console.log('   2. Verify REDIS_URL in .env file');
      console.log('   3. Check network connectivity');
      return false;
    } finally {
      if (this.client) {
        await this.client.quit();
      }
    }
  }

  async runBasicTests() {
    console.log('\n🧪 Running Basic Redis Tests...');
    
    // Test PING
    const pong = await this.client.ping();
    console.log(`   PING response: ${pong}`);
    
    // Test SET/GET
    const testKey = 'healthcheck:test';
    const testValue = `test-${Date.now()}`;
    
    await this.client.set(testKey, testValue, { EX: 10 }); // Expire in 10 seconds
    const retrievedValue = await this.client.get(testKey);
    
    if (retrievedValue === testValue) {
      console.log('   ✅ SET/GET operations working');
    } else {
      throw new Error('SET/GET test failed');
    }
    
    // Test DELETE
    await this.client.del(testKey);
    const deletedValue = await this.client.get(testKey);
    
    if (deletedValue === null) {
      console.log('   ✅ DELETE operation working');
    } else {
      throw new Error('DELETE test failed');
    }
  }

  async testSessionOperations() {
    console.log('\n👤 Testing Session Management Operations...');
    
    const sessionId = `session:test-${Date.now()}`;
    const sessionData = {
      userId: 'test-user-123',
      email: 'test@example.com',
      role: 'user',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour
    };
    
    // Test session storage
    await this.client.setEx(sessionId, 3600, JSON.stringify(sessionData));
    console.log('   ✅ Session stored successfully');
    
    // Test session retrieval
    const retrievedSession = await this.client.get(sessionId);
    const parsedSession = JSON.parse(retrievedSession);
    
    if (parsedSession.userId === sessionData.userId) {
      console.log('   ✅ Session retrieval working');
    } else {
      throw new Error('Session retrieval test failed');
    }
    
    // Test session expiry
    const ttl = await this.client.ttl(sessionId);
    if (ttl > 0 && ttl <= 3600) {
      console.log(`   ✅ Session TTL working (${ttl}s remaining)`);
    } else {
      throw new Error('Session TTL test failed');
    }
    
    // Test session cleanup
    await this.client.del(sessionId);
    const deletedSession = await this.client.get(sessionId);
    
    if (deletedSession === null) {
      console.log('   ✅ Session cleanup working');
    } else {
      throw new Error('Session cleanup test failed');
    }
  }

  async getRedisInfo() {
    console.log('\n📊 Redis Server Information:');
    
    try {
      const info = await this.client.info();
      const lines = info.split('\r\n');
      
      // Extract key information
      const keyInfo = [
        'redis_version',
        'used_memory_human',
        'connected_clients',
        'total_connections_received',
        'total_commands_processed',
        'keyspace_hits',
        'keyspace_misses'
      ];
      
      for (const line of lines) {
        for (const key of keyInfo) {
          if (line.startsWith(`${key}:`)) {
            const value = line.split(':')[1];
            console.log(`   ${key}: ${value}`);
          }
        }
      }
    } catch (error) {
      console.log('   Could not retrieve Redis info:', error.message);
    }
  }
}

// Run health check if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const checker = new RedisHealthChecker();
  
  checker.checkConnection()
    .then((success) => {
      if (success) {
        console.log('\n🎉 Redis is ready for SikadVoltz session management!');
        process.exit(0);
      } else {
        console.log('\n💥 Redis health check failed!');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('💥 Health check error:', error);
      process.exit(1);
    });
}

export default RedisHealthChecker;