/**
 * Debug token blacklist system
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

async function debugTokenBlacklist() {
  console.log('🔍 Debugging Token Blacklist System...\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');

    // Check the specific token that's failing
    const failingToken = '55ba39df79b1ae439a0bc298dc387078bb9c450d4727d44564f698344153670f';
    const hashedToken = crypto.createHash('sha256').update(failingToken).digest('hex');
    
    console.log('🔑 Checking Token:', failingToken);
    console.log('🔒 Hashed Token:', hashedToken);
    
    // Find user with this token
    const user = await User.findOne({
      resetPasswordToken: hashedToken
    }).select('+resetPasswordToken +resetPasswordExpires');
    
    if (user) {
      console.log('✅ Token found in database:');
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   🔒 Token Hash: ${user.resetPasswordToken?.substring(0, 16)}...`);
      console.log(`   ⏰ Expires: ${user.resetPasswordExpires}`);
      console.log(`   🕐 Expired?: ${user.resetPasswordExpires < new Date()}`);
      
      const timeRemaining = user.resetPasswordExpires - new Date();
      console.log(`   ⏱️  Time remaining: ${Math.ceil(timeRemaining / 60000)} minutes`);
    } else {
      console.log('❌ Token not found in database');
    }
    
    // Create a fresh test token
    console.log('\n🆕 Creating fresh test token...');
    
    let testUser = await User.findOne({ email: 'test@example.com' });
    if (!testUser) {
      testUser = new User({
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: true
      });
      await testUser.save();
    }
    
    // Generate new token
    const newResetToken = crypto.randomBytes(32).toString('hex');
    const newHashedToken = crypto.createHash('sha256').update(newResetToken).digest('hex');
    const newExpiryTime = new Date(Date.now() + 15 * 60 * 1000);
    
    // Clear any existing reset data
    testUser.resetPasswordToken = newHashedToken;
    testUser.resetPasswordExpires = newExpiryTime;
    testUser.lastResetAttempt = new Date();
    
    await testUser.save();
    
    console.log('✅ Fresh token created:');
    console.log(`   🔑 Token: ${newResetToken}`);
    console.log(`   ⏰ Expires: ${newExpiryTime.toISOString()}`);
    console.log(`   ⏱️  Valid for: 15 minutes`);
    
    console.log('\n🧪 Test this fresh token:');
    console.log(`   Deep Link: sikadvoltz://reset-password?token=${newResetToken}`);
    console.log(`   Manual Page: http://localhost:3000/api/password-reset/manual-verify/${newResetToken}`);

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🏁 Database connection closed');
  }
}

// Run the debug
debugTokenBlacklist()
  .then(() => {
    console.log('\n✅ Token blacklist debug completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Debug failed:', error);
    process.exit(1);
  });