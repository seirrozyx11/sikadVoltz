/**
 * SIMPLE REDIS CONNECTION TEST
 * Testing Redis Cloud connectivity with current Redis URL
 */

const { describe, test, expect, beforeAll } = require('@jest/globals');

describe('Redis Cloud Connection Test', () => {
  let redisClient;

  beforeAll(async () => {
    // Set Redis URL from your configuration
    process.env.REDIS_URL = 'redis://default:MzcxWsuM3beem2R2fEW7ju8cHT4CnF2R@redis-19358.c295.ap-southeast-1-1.ec2.redns.redis-cloud.com:19358';
  });

  test('Should connect to Redis Cloud successfully', async () => {
    try {
      const redis = require('redis');
      redisClient = redis.createClient({
        url: process.env.REDIS_URL
      });

      await redisClient.connect();
      const result = await redisClient.ping();
      
      expect(result).toBe('PONG');
      console.log('Redis Cloud connection successful!');
    } catch (error) {
      console.error(' Redis connection failed:', error.message);
      throw error;
    }
  });

  test('Should perform basic Redis operations', async () => {
    if (!redisClient) {
      const redis = require('redis');
      redisClient = redis.createClient({
        url: process.env.REDIS_URL
      });
      await redisClient.connect();
    }

    // Test SET operation
    await redisClient.set('test:key', 'test-value');
    
    // Test GET operation
    const value = await redisClient.get('test:key');
    expect(value).toBe('test-value');
    
    // Test DELETE operation
    const deleted = await redisClient.del('test:key');
    expect(deleted).toBe(1);
    
    console.log('Redis operations successful!');
  });

  afterAll(async () => {
    if (redisClient) {
      await redisClient.quit();
    }
  });
});