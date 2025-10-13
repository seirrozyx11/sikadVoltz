/**
 * 🔍 RENDER REDIS DEBUGGING SCRIPT
 * Test Redis connection in Render environment
 */

import { createClient } from 'redis';

console.log('🚀 Testing Redis connection in Render environment...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Platform:', process.platform);
console.log('Node version:', process.version);

async function testRedisOnRender() {
  try {
    console.log('\n🔥 STEP 1: Creating Redis client...');
    
    const client = createClient({
      username: 'default',
      password: 'MzcxWsuM3beem2R2fEW7ju8cHT4CnF2R',
      socket: {
        host: 'redis-19358.c295.ap-southeast-1-1.ec2.redns.redis-cloud.com',
        port: 19358,
        connectTimeout: 10000,
        commandTimeout: 8000,
        lazyConnect: false
      }
    });

    console.log('✅ Redis client created');

    console.log('\n🔥 STEP 2: Setting up event listeners...');
    
    client.on('error', (err) => {
      console.error('❌ Redis error event:', err.message);
      console.error('   Error code:', err.code);
      console.error('   Error stack:', err.stack);
    });

    client.on('connect', () => {
      console.log('✅ Redis connect event fired');
    });

    client.on('ready', () => {
      console.log('✅ Redis ready event fired');
    });

    client.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting event fired');
    });

    client.on('end', () => {
      console.log('🔚 Redis end event fired');
    });

    console.log('✅ Event listeners set up');

    console.log('\n🔥 STEP 3: Connecting to Redis...');
    await client.connect();
    console.log('✅ Redis connect() completed');

    console.log('\n🔥 STEP 4: Testing PING...');
    const pong = await client.ping();
    console.log('✅ PING successful:', pong);

    console.log('\n🔥 STEP 5: Testing SET/GET...');
    await client.set('render-test', 'success-' + Date.now());
    const value = await client.get('render-test');
    console.log('✅ SET/GET successful:', value);

    console.log('\n🎉 ALL TESTS PASSED - Redis is working perfectly!');
    
    await client.quit();
    console.log('✅ Redis client closed cleanly');
    
  } catch (error) {
    console.error('\n❌ REDIS TEST FAILED:');
    console.error('   Message:', error.message);
    console.error('   Code:', error.code);
    console.error('   Stack:', error.stack);
    console.error('   Name:', error.name);
    
    // Check for specific error types
    if (error.code === 'ECONNREFUSED') {
      console.error('🔍 Connection refused - check host/port');
    } else if (error.code === 'ENOTFOUND') {
      console.error('🔍 DNS resolution failed - check hostname');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('🔍 Connection timeout - check network/firewall');
    } else if (error.message?.includes('Auth')) {
      console.error('🔍 Authentication failed - check username/password');
    }
    
    process.exit(1);
  }
}

// Run the test
testRedisOnRender();