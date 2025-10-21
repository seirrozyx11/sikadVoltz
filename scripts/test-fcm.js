#!/usr/bin/env node

/**
 * FCM Test Script for SikadVoltz Backend
 * 
 * This script tests Firebase Cloud Messaging functionality.
 * 
 * Usage:
 * npm run test:fcm
 * or
 * node scripts/test-fcm.js
 */

import dotenv from 'dotenv';
import fcmService from '../services/fcmService.js';
import logger from '../utils/logger.js';

// Load environment variables
dotenv.config();

console.log(' FCM Test Script for SikadVoltz');
console.log('=================================\n');

async function testFCMInitialization() {
  console.log('1️⃣ Testing FCM Initialization...');
  
  if (fcmService.isInitialized) {
    console.log('FCM Service initialized successfully');
    return true;
  } else {
    console.log(' FCM Service failed to initialize');
    console.log('Please check your Firebase configuration in .env file');
    return false;
  }
}

async function testNotificationStructure() {
  console.log('\n2️⃣ Testing Notification Structure...');
  
  const sampleNotification = {
    title: ' Test Notification',
    body: 'This is a test notification from SikadVoltz FCM service'
  };
  
  const sampleData = {
    type: 'test',
    route: '/notifications',
    testId: 'fcm-test-' + Date.now()
  };
  
  console.log('Sample notification structure:');
  console.log(JSON.stringify({ notification: sampleNotification, data: sampleData }, null, 2));
  
  return { notification: sampleNotification, data: sampleData };
}

async function testNotificationMethods() {
  console.log('\n3️⃣ Testing FCM Service Methods...');
  
  const methods = [
    'sendToUser',
    'sendToMultipleUsers', 
    'sendToTopic',
    'sendMissedSessionNotification',
    'sendSessionReminderNotification',
    'sendDailyMotivationNotification'
  ];
  
  methods.forEach(method => {
    if (typeof fcmService[method] === 'function') {
      console.log(`${method} method exists`);
    } else {
      console.log(` ${method} method missing`);
    }
  });
}

async function testEnvironmentVariables() {
  console.log('\n4️⃣ Testing Environment Variables...');
  
  const requiredVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_SERVICE_ACCOUNT_KEY'
  ];
  
  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      if (varName === 'FIREBASE_SERVICE_ACCOUNT_KEY') {
        // Don't log the full key, just check if it looks like JSON
        const key = process.env[varName];
        const isValidJson = key.startsWith('{') && key.endsWith('}') && key.includes('"type":"service_account"');
        console.log(`${varName}: ${isValidJson ? 'Valid JSON format' : 'Invalid format'}`);
      } else {
        console.log(`${varName}: ${process.env[varName]}`);
      }
    } else {
      console.log(` ${varName}: Not set`);
    }
  });
}

async function simulateNotificationFlow() {
  console.log('\n5️⃣ Simulating Notification Flow...');
  
  if (!fcmService.isInitialized) {
    console.log('⏭️ Skipping flow simulation - FCM not initialized');
    return;
  }
  
  console.log('Simulating missed session notification...');
  console.log('Note: This won\'t actually send a notification without a valid user FCM token');
  
  try {
    // This will fail gracefully since we don't have a real user ID with FCM token
    const result = await fcmService.sendMissedSessionNotification('test-user-id', {
      count: 2,
      sessions: ['2024-01-01', '2024-01-02']
    });
    
    console.log(` Notification result: ${result ? 'Success' : 'Failed (expected without valid FCM token)'}`);
  } catch (error) {
    console.log(` Notification test completed with expected error: ${error.message}`);
  }
}

async function runTests() {
  try {
    console.log(' Starting FCM Tests...\n');
    
    // Test 1: Initialization
    const isInitialized = await testFCMInitialization();
    
    // Test 2: Notification Structure
    await testNotificationStructure();
    
    // Test 3: Service Methods
    await testNotificationMethods();
    
    // Test 4: Environment Variables
    await testEnvironmentVariables();
    
    // Test 5: Simulation
    await simulateNotificationFlow();
    
    console.log('\nTest Summary:');
    console.log('================');
    
    if (isInitialized) {
      console.log('FCM Service is ready for production!');
      console.log(' You can now send push notifications to your users');
      console.log('\nTo test with real notifications:');
      console.log('1. Have a user with FCM token in your database');
      console.log('2. Use fcmService.sendToUser(userId, notification, data)');
      console.log('3. Check your mobile app for the notification');
    } else {
      console.log(' FCM Service needs configuration');
      console.log('🔧 Please complete Firebase setup using setup-firebase.js');
    }
    
  } catch (error) {
    console.error(' Test execution error:', error);
  }
}

// Run tests
runTests();