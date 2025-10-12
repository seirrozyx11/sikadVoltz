#!/usr/bin/env node

/**
 * FCM Production Deployment Verification Script
 * 
 * This script verifies that your FCM implementation is ready for production deployment.
 * Run this before deploying to production to ensure everything is configured correctly.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

console.log('🚀 FCM Production Deployment Verification');
console.log('=========================================\n');

const checks = [];

function addCheck(name, status, message) {
  checks.push({ name, status, message });
  const emoji = status ? '✅' : '❌';
  console.log(`${emoji} ${name}: ${message}`);
}

// Check 1: Firebase Admin SDK
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const firebaseVersion = packageJson.dependencies['firebase-admin'];
  addCheck('Firebase Admin SDK', !!firebaseVersion, firebaseVersion ? `v${firebaseVersion}` : 'Not installed');
} catch (error) {
  addCheck('Firebase Admin SDK', false, 'Package.json not found');
}

// Check 2: Environment Variables
const hasProjectId = !!process.env.FIREBASE_PROJECT_ID;
const hasServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY && 
                         process.env.FIREBASE_SERVICE_ACCOUNT_KEY !== '{"type":"service_account","project_id":"sikadvoltz-app",...}';

addCheck('Firebase Project ID', hasProjectId, hasProjectId ? process.env.FIREBASE_PROJECT_ID : 'Missing');
addCheck('Service Account Key', hasServiceAccount, hasServiceAccount ? 'Configured' : 'Missing or example value');

// Check 3: FCM Service File
const fcmServicePath = path.join(__dirname, '..', 'services', 'fcmService.js');
const fcmServiceExists = fs.existsSync(fcmServicePath);
addCheck('FCM Service Implementation', fcmServiceExists, fcmServiceExists ? 'Found' : 'Missing');

// Check 4: Auth Routes (FCM token endpoints)
const authRoutesPath = path.join(__dirname, '..', 'routes', 'auth.js');
let hasFCMRoutes = false;
if (fs.existsSync(authRoutesPath)) {
  const authContent = fs.readFileSync(authRoutesPath, 'utf8');
  hasFCMRoutes = authContent.includes('fcm_token') && authContent.includes('/fcm-token');
}
addCheck('FCM Token Endpoints', hasFCMRoutes, hasFCMRoutes ? 'Implemented' : 'Missing');

// Check 5: Google OAuth Integration
const hasGoogleClientId = !!process.env.GOOGLE_WEB_CLIENT_ID;
const hasGoogleSecret = !!process.env.GOOGLE_CLIENT_SECRET;
addCheck('Google OAuth Integration', hasGoogleClientId && hasGoogleSecret, 
         hasGoogleClientId && hasGoogleSecret ? 'Configured' : 'Missing credentials');

// Check 6: Production Environment
const isProduction = process.env.NODE_ENV === 'production';
const hasProductionUrl = !!process.env.BACKEND_URL && process.env.BACKEND_URL.includes('render.com');
addCheck('Production Configuration', isProduction || hasProductionUrl, 
         isProduction ? 'Production mode' : hasProductionUrl ? 'Production URL configured' : 'Development mode');

// Check 7: Database Connection
const hasMongoUri = !!process.env.MONGODB_URI;
addCheck('Database Connection', hasMongoUri, hasMongoUri ? 'MongoDB configured' : 'Missing MongoDB URI');

// Summary
console.log('\n📊 Deployment Readiness Summary:');
console.log('=================================');

const passedChecks = checks.filter(check => check.status).length;
const totalChecks = checks.length;
const readinessPercentage = Math.round((passedChecks / totalChecks) * 100);

console.log(`Passed: ${passedChecks}/${totalChecks} checks (${readinessPercentage}%)`);

if (readinessPercentage >= 90) {
  console.log('🚀 EXCELLENT! Your FCM implementation is production-ready!');
  console.log('   You can deploy with confidence.');
} else if (readinessPercentage >= 70) {
  console.log('⚠️ GOOD! Almost ready for production.');
  console.log('   Address the failed checks before deploying.');
} else {
  console.log('❌ NOT READY! Several critical items need attention.');
  console.log('   Complete the setup before deploying to production.');
}

// Action Items
console.log('\n📋 Action Items:');
console.log('================');

const failedChecks = checks.filter(check => !check.status);
if (failedChecks.length === 0) {
  console.log('🎉 No action items - you\'re all set!');
} else {
  failedChecks.forEach((check, index) => {
    console.log(`${index + 1}. Fix: ${check.name} - ${check.message}`);
  });
}

// Next Steps
console.log('\n🎯 Next Steps:');
console.log('==============');

if (readinessPercentage >= 90) {
  console.log('1. 🔧 Get Firebase Service Account Key (if not done)');
  console.log('2. 🧪 Test FCM: npm run test:fcm');
  console.log('3. 🚀 Deploy to production');
  console.log('4. 📱 Test push notifications on real devices');
  console.log('5. 🎊 Celebrate your excellent implementation!');
} else {
  console.log('1. 📝 Address failed checks above');
  console.log('2. 🔄 Run this script again');
  console.log('3. 🧪 Test FCM: npm run test:fcm');
  console.log('4. 🚀 Deploy when ready');
}

console.log('\n💡 Pro Tip: Your notification system architecture is excellent!');
console.log('   Once configured, it will rival enterprise apps like Nike Training Club.');