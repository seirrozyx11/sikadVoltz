#!/usr/bin/env node

/**
 * Firebase Setup Script for SikadVoltz Backend
 * 
 * This script helps set up Firebase Admin SDK for FCM push notifications.
 * 
 * Steps to get Firebase Service Account Key:
 * 1. Go to Firebase Console: https://console.firebase.google.com/
 * 2. Select your project: sikadvoltz-app
 * 3. Go to Project Settings (gear icon)
 * 4. Click on "Service accounts" tab
 * 5. Click "Generate new private key"
 * 6. Download the JSON file
 * 7. Copy the entire JSON content as a single line string
 * 8. Set it as FIREBASE_SERVICE_ACCOUNT_KEY in your .env file
 * 
 * Usage:
 * node scripts/setup-firebase.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(' Firebase Setup Script for SikadVoltz');
console.log('=====================================\n');

// Check if Firebase Admin SDK is installed
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  if (packageJson.dependencies['firebase-admin']) {
    console.log('Firebase Admin SDK is installed:', packageJson.dependencies['firebase-admin']);
  } else {
    console.log(' Firebase Admin SDK is NOT installed');
    console.log('Run: npm install firebase-admin');
    process.exit(1);
  }
} catch (error) {
  console.error(' Error reading package.json:', error.message);
  process.exit(1);
}

// Check environment variables
const envPath = path.join(__dirname, '..', '.env');
let envContent = '';

try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch (error) {
  console.error(' Error reading .env file:', error.message);
  process.exit(1);
}

// Check Firebase configuration
const hasProjectId = envContent.includes('FIREBASE_PROJECT_ID=sikadvoltz-app');
const hasServiceAccount = envContent.includes('FIREBASE_SERVICE_ACCOUNT_KEY=') && 
                         !envContent.includes('FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account"');

console.log('\n Firebase Configuration Status:');
console.log('================================');
console.log(`FIREBASE_PROJECT_ID: ${hasProjectId ? 'Set' : ' Missing'}`);
console.log(`FIREBASE_SERVICE_ACCOUNT_KEY: ${hasServiceAccount ? 'Set' : ' Missing/Example'}`);

if (!hasServiceAccount) {
  console.log('\nTo get your Firebase Service Account Key:');
  console.log('==========================================');
  console.log('1. Go to: https://console.firebase.google.com/');
  console.log('2. Select project: sikadvoltz-app');
  console.log('3. Click Settings () → Project settings');
  console.log('4. Go to "Service accounts" tab');
  console.log('5. Click "Generate new private key"');
  console.log('6. Download the JSON file');
  console.log('7. Copy the entire JSON content as ONE LINE');
  console.log('8. Replace the FIREBASE_SERVICE_ACCOUNT_KEY value in .env');
  console.log('\nExample format:');
  console.log('FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"sikadvoltz-app","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}');
}

// Test Firebase initialization (if service account is set)
if (hasProjectId && hasServiceAccount) {
  console.log('\n Testing Firebase Initialization...');
  
  try {
    // Dynamically import to avoid module loading issues
    const { default: fcmService } = await import('../services/fcmService.js');
    
    if (fcmService.isInitialized) {
      console.log('Firebase Admin SDK initialized successfully!');
      console.log(' FCM push notifications are ready to use!');
    } else {
      console.log(' Firebase initialization failed');
      console.log('Please check your FIREBASE_SERVICE_ACCOUNT_KEY format');
    }
  } catch (error) {
    console.log(' Firebase initialization error:', error.message);
    console.log('Please verify your service account key format');
  }
}

console.log('\nNext Steps:');
console.log('=============');
console.log('1. Complete Firebase service account setup (if not done)');
console.log('2. Test FCM with: npm run test:fcm');
console.log('3. Start your backend: npm run dev');
console.log('4. Update your Flutter app with enhanced FCM service');
console.log('\n You\'re almost ready for production push notifications!');