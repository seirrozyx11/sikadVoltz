/**
 * 🔧 SIMPLE REDIS CLIENT - DIRECT APPROACH
 * Bypass SessionManager complexity and use direct Redis connection
 */

import { createClient } from 'redis';
import logger from '../utils/logger.js';

class SimpleRedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async initialize() {
    try {
      console.log('🔥 SimpleRedis: Initializing with direct approach...');
      
      // Use the exact configuration that works in your examples
      this.client = createClient({
        username: 'default',
        password: 'MzcxWsuM3beem2R2fEW7ju8cHT4CnF2R',
        socket: {
          host: 'redis-19358.c295.ap-southeast-1-1.ec2.redns.redis-cloud.com',
          port: 19358,
          connectTimeout: 8000,
          commandTimeout: 5000,
          lazyConnect: false
        }
      });

      // Simple event handlers
      this.client.on('error', (err) => {
        console.error('❌ SimpleRedis error:', err.message);
        // Don't set isConnected to false for all errors
        if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(err.code)) {
          this.isConnected = false;
        }
      });

      this.client.on('connect', () => {
        console.log('✅ SimpleRedis connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('✅ SimpleRedis ready');
        this.isConnected = true;
      });

      // Connect
      await this.client.connect();
      
      // Test
      const pong = await this.client.ping();
      console.log(`✅ SimpleRedis PING: ${pong}`);
      
      this.isConnected = true;
      console.log('🎉 SimpleRedis initialization completed successfully');
      
      return true;
    } catch (error) {
      console.error('❌ SimpleRedis initialization failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  async get(key) {
    if (!this.isConnected || !this.client) return null;
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error('SimpleRedis GET error:', error.message);
      return null;
    }
  }

  async set(key, value, options = {}) {
    if (!this.isConnected || !this.client) return false;
    try {
      if (options.EX) {
        await this.client.setEx(key, options.EX, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      console.error('SimpleRedis SET error:', error.message);
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected || !this.client) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('SimpleRedis DEL error:', error.message);
      return false;
    }
  }

  async ping() {
    if (!this.isConnected || !this.client) return false;
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('SimpleRedis PING error:', error.message);
      return false;
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      clientExists: !!this.client,
      clientOpen: this.client?.isOpen || false
    };
  }
}

// Export singleton
export default new SimpleRedisClient();