/**
 * Quick debug test for password reset token verification
 */

import dotenv from 'dotenv';
import User from './models/User.js';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

async function debugTokenVerification() {
  console.log('🔍 Debugging Password Reset Token Verification...\n');

  try {
    // Find a user with an active reset token
    console.log('1. Looking for users with active reset tokens...');
    
    const usersWithTokens = await User.find({
      resetPasswordToken: { $exists: true, $ne: null },
      resetPasswordExpires: { $gt: new Date() }
    }).select('email resetPasswordToken resetPasswordExpires');

    console.log(`Found ${usersWithTokens.length} users with active reset tokens\n`);

    if (usersWithTokens.length === 0) {
      console.log('❌ No active reset tokens found. Please request a password reset first.');
      return;
    }

    for (const user of usersWithTokens) {
      console.log(`📧 User: ${user.email.replace(/^(.{2}).*(@.*)$/, '$1***$2')}`);
      console.log(`🔑 Token Hash: ${user.resetPasswordToken?.substring(0, 16)}...`);
      console.log(`⏰ Expires: ${user.resetPasswordExpires}`);
      console.log(`⏱️  Time remaining: ${Math.ceil((user.resetPasswordExpires - new Date()) / 60000)} minutes\n`);
    }

    // Test token verification process
    console.log('2. Testing token verification logic...');
    
    // Simulate what happens when a token comes from the deep link
    // We need to reverse-engineer what the original token was
    
    console.log('\n🔧 DEBUGGING STEPS:');
    console.log('1. When you copy the token from the manual verification page');
    console.log('2. The token should be 64 characters long');
    console.log('3. The backend hashes it with SHA256 to compare with database');
    console.log('4. If hashes match and token not expired, verification succeeds\n');
    
    console.log('📋 Current database token hashes:');
    usersWithTokens.forEach((user, index) => {
      console.log(`   User ${index + 1}: ${user.resetPasswordToken}`);
    });

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Run the debug
debugTokenVerification()
  .then(() => {
    console.log('\n🏁 Debug completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Debug failed with error:', error);
    process.exit(1);
  });