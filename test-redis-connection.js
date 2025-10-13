/**
 * Quick Redis Connection Test
 * Test script to diagnose Redis Cloud connectivity
 */

import dotenv from 'dotenv';
import { createClient } from 'redis';

// Load environment variables
dotenv.config();

async function testRedisConnection() {
  console.log('🔥 Testing Redis Cloud Connection...\n');
  
  console.log('Environment Variables:');
  console.log('REDIS_URL:', process.env.REDIS_URL ? 'SET' : 'NOT SET');
  console.log('REDIS_HOST:', process.env.REDIS_HOST);
  console.log('REDIS_PORT:', process.env.REDIS_PORT);
  console.log('REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? 'SET (hidden)' : 'NOT SET');
  console.log();

  if (!process.env.REDIS_URL) {
    console.error('❌ REDIS_URL environment variable is not set!');
    process.exit(1);
  }

  let client;
  
  try {
    console.log('📡 Creating Redis client...');
    client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 10000, // 10 seconds timeout
        commandTimeout: 5000,
        lazyConnect: false
      }
    });

    // Set up event handlers
    client.on('error', (err) => {
      console.error('❌ Redis Client Error:', err.message);
    });

    client.on('connect', () => {
      console.log('🔗 Redis client connecting...');
    });

    client.on('ready', () => {
      console.log('✅ Redis client ready!');
    });

    client.on('end', () => {
      console.log('🔚 Redis connection ended');
    });

    console.log('🚀 Attempting to connect to Redis Cloud...');
    await client.connect();
    
    console.log('🏓 Testing PING command...');
    const pong = await client.ping();
    console.log('✅ PING response:', pong);
    
    console.log('💾 Testing SET/GET operations...');
    await client.set('test:connection', JSON.stringify({
      timestamp: new Date().toISOString(),
      message: 'Redis connection test successful!'
    }), { EX: 300 }); // Expire in 5 minutes
    
    const testValue = await client.get('test:connection');
    console.log('✅ Retrieved test value:', testValue);
    
    console.log('📊 Getting Redis info...');
    const info = await client.info('server');
    const lines = info.split('\r\n').filter(line => 
      line.includes('redis_version') || 
      line.includes('connected_clients') || 
      line.includes('used_memory_human')
    );
    
    console.log('\nRedis Server Info:');
    lines.forEach(line => {
      if (line.trim()) console.log('  ', line);
    });
    
    console.log('\n🎉 Redis Cloud connection test SUCCESSFUL!');
    console.log('✅ Your Redis Cloud database is working perfectly');
    console.log('✅ All caching operations should work');
    
  } catch (error) {
    console.error('\n❌ Redis connection test FAILED:');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    
    if (error.code === 'ENOTFOUND') {
      console.error('\n🔍 DNS Resolution failed - check your Redis URL');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n🔍 Connection refused - check Redis server status');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('\n🔍 Connection timeout - check network/firewall settings');
    } else if (error.message.includes('NOAUTH')) {
      console.error('\n🔍 Authentication failed - check Redis password');
    }
    
    console.error('\n🔧 Troubleshooting steps:');
    console.error('1. Verify your Redis Cloud database is active');
    console.error('2. Check your REDIS_URL format in .env file');
    console.error('3. Ensure your IP is whitelisted in Redis Cloud');
    console.error('4. Test network connectivity to Redis Cloud');
    
  } finally {
    if (client) {
      try {
        await client.quit();
        console.log('\n🔚 Redis client disconnected cleanly');
      } catch (err) {
        console.error('Error disconnecting:', err.message);
      }
    }
  }
}

// Run the test
testRedisConnection().catch(console.error);