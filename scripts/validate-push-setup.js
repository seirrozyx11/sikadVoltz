#!/usr/bin/env node

/**
 * Push Notification Setup Validator
 * 
 * This script validates that your push notification system is configured correctly
 * after updating the Firebase service account key.
 * 
 * Usage: node validate-push-setup.js
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

console.log('🔍 SikadVoltz Push Notification Setup Validator\n');
console.log('='.repeat(60));

let hasErrors = false;
let hasWarnings = false;

// ============================================================================
// CHECK 1: Firebase Project ID
// ============================================================================
console.log('\n📋 Checking Firebase Configuration...\n');

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  console.log('❌ FIREBASE_PROJECT_ID not found in .env');
  hasErrors = true;
} else if (projectId === 'sikadvoltz-9c8bc') {
  console.log(`❌ FIREBASE_PROJECT_ID is still set to '${projectId}'`);
  console.log('   Expected: sikadvoltz-app (to match Flutter app)');
  hasErrors = true;
} else if (projectId === 'sikadvoltz-app') {
  console.log(`✅ FIREBASE_PROJECT_ID: ${projectId} (CORRECT)`);
} else {
  console.log(`⚠️  FIREBASE_PROJECT_ID: ${projectId}`);
  console.log('   Note: Verify this matches your Flutter app google-services.json');
  hasWarnings = true;
}

// ============================================================================
// CHECK 2: Firebase Service Account Key
// ============================================================================
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountKey) {
  console.log('❌ FIREBASE_SERVICE_ACCOUNT_KEY not found in .env');
  hasErrors = true;
} else {
  try {
    const parsedKey = JSON.parse(serviceAccountKey);
    
    // Check project_id in service account
    if (parsedKey.project_id === 'sikadvoltz-9c8bc') {
      console.log('❌ Service account key is for project: sikadvoltz-9c8bc');
      console.log('   You need to download a new key for: sikadvoltz-app');
      console.log('   Steps:');
      console.log('   1. Go to Firebase Console → sikadvoltz-app');
      console.log('   2. Project Settings → Service accounts');
      console.log('   3. Generate new private key');
      console.log('   4. Update FIREBASE_SERVICE_ACCOUNT_KEY in .env');
      hasErrors = true;
    } else if (parsedKey.project_id === 'sikadvoltz-app') {
      console.log(`✅ Service account key project: ${parsedKey.project_id} (CORRECT)`);
      console.log(`   Email: ${parsedKey.client_email}`);
    } else {
      console.log(`⚠️  Service account key project: ${parsedKey.project_id}`);
      console.log('   Verify this matches FIREBASE_PROJECT_ID');
      hasWarnings = true;
    }
    
    // Check required fields
    const requiredFields = ['project_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter(field => !parsedKey[field]);
    
    if (missingFields.length > 0) {
      console.log(`❌ Service account key missing fields: ${missingFields.join(', ')}`);
      hasErrors = true;
    } else {
      console.log('✅ Service account key has all required fields');
    }
    
  } catch (e) {
    console.log('❌ Invalid FIREBASE_SERVICE_ACCOUNT_KEY format (not valid JSON)');
    console.log(`   Error: ${e.message}`);
    hasErrors = true;
  }
}

// ============================================================================
// CHECK 3: Flutter google-services.json
// ============================================================================
console.log('\n📱 Checking Flutter Configuration...\n');

const googleServicesPath = path.join(__dirname, '../../sv_frontend/android/app/google-services.json');
if (fs.existsSync(googleServicesPath)) {
  try {
    const googleServices = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
    const frontendProjectId = googleServices.project_info?.project_id;
    
    if (frontendProjectId === 'sikadvoltz-app') {
      console.log(`✅ Flutter google-services.json project: ${frontendProjectId}`);
      
      // Check if backend matches frontend
      if (projectId === frontendProjectId) {
        console.log('✅ Backend and Frontend projects MATCH! 🎉');
      } else {
        console.log(`❌ Project MISMATCH!`);
        console.log(`   Backend:  ${projectId}`);
        console.log(`   Frontend: ${frontendProjectId}`);
        hasErrors = true;
      }
    } else {
      console.log(`⚠️  Flutter google-services.json project: ${frontendProjectId}`);
      console.log('   Expected: sikadvoltz-app');
      hasWarnings = true;
    }
  } catch (e) {
    console.log(`❌ Failed to read google-services.json: ${e.message}`);
    hasErrors = true;
  }
} else {
  console.log('⚠️  google-services.json not found at:');
  console.log(`   ${googleServicesPath}`);
  hasWarnings = true;
}

// ============================================================================
// CHECK 4: FCM Service Initialization
// ============================================================================
console.log('\n🔥 Testing FCM Service Initialization...\n');

try {
  const { default: fcmService } = await import('../services/fcmService.js');
  
  if (fcmService.isInitialized) {
    console.log('✅ FCM Service initialized successfully');
  } else {
    console.log('❌ FCM Service failed to initialize');
    console.log('   Check your FIREBASE_SERVICE_ACCOUNT_KEY format');
    hasErrors = true;
  }
} catch (e) {
  console.log(`❌ Failed to import FCM Service: ${e.message}`);
  hasErrors = true;
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(60));
console.log('\n📊 Validation Summary\n');

if (!hasErrors && !hasWarnings) {
  console.log('✅ All checks passed! Push notifications should work correctly.');
  console.log('\n🚀 Next Steps:');
  console.log('   1. Restart your backend: npm run dev');
  console.log('   2. Test with: npm run test:fcm');
  console.log('   3. Install app on device and check FCM token registration');
  process.exit(0);
} else if (hasErrors) {
  console.log('❌ Critical issues found! Push notifications will NOT work.');
  console.log('\n🔧 Required Actions:');
  console.log('   1. Download new Firebase service account key for sikadvoltz-app');
  console.log('   2. Update FIREBASE_PROJECT_ID=sikadvoltz-app in .env');
  console.log('   3. Update FIREBASE_SERVICE_ACCOUNT_KEY in .env');
  console.log('   4. Run this validator again: node validate-push-setup.js');
  process.exit(1);
} else if (hasWarnings) {
  console.log('⚠️  Some warnings found. Review and verify your configuration.');
  console.log('\n💡 Recommendations:');
  console.log('   - Double-check that all project IDs match');
  console.log('   - Test FCM with: npm run test:fcm');
  process.exit(0);
}
