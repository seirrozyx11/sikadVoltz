/**
 * Create a test password reset token for debugging
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

async function createTestResetToken() {
  console.log('🔧 Creating test password reset token...\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');

    // Find or create a test user
    let testUser = await User.findOne({ email: 'test@example.com' });
    
    if (!testUser) {
      console.log('📝 Creating test user...');
      testUser = new User({
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: true
      });
      await testUser.save();
      console.log('✅ Test user created');
    } else {
      console.log('✅ Test user found');
    }

    // Generate a reset token
    console.log('\n🔑 Generating reset token...');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    // Set token expiry to 15 minutes from now
    const expiryTime = new Date(Date.now() + 15 * 60 * 1000);
    
    // Update user with reset token
    testUser.resetPasswordToken = hashedToken;
    testUser.resetPasswordExpires = expiryTime;
    testUser.lastResetAttempt = new Date();
    
    await testUser.save();
    
    console.log('✅ Reset token created successfully!');
    console.log('\n📋 Token Details:');
    console.log(`   📧 Email: ${testUser.email}`);
    console.log(`   🔑 Token: ${resetToken}`);
    console.log(`   🔒 Hashed: ${hashedToken.substring(0, 16)}...`);
    console.log(`   ⏰ Expires: ${expiryTime.toISOString()}`);
    console.log(`   ⏱️  Valid for: ${Math.ceil((expiryTime - new Date()) / 60000)} minutes`);
    
    console.log('\n🧪 Test Commands:');
    console.log('1. Test token verification:');
    console.log(`   curl -X POST http://localhost:3000/api/password-reset/verify-reset-token \\`);
    console.log(`        -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"token":"${resetToken}"}'`);
    
    console.log('\n2. Test manual verification page:');
    console.log(`   http://localhost:3000/api/password-reset/manual-verify/${resetToken}`);
    
    console.log('\n3. Test deep link:');
    console.log(`   sikadvoltz://reset-password?token=${resetToken}`);

  } catch (error) {
    console.error('❌ Error creating test token:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🏁 Database connection closed');
  }
}

// Run the test
createTestResetToken()
  .then(() => {
    console.log('\n✅ Test token creation completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test token creation failed:', error);
    process.exit(1);
  });