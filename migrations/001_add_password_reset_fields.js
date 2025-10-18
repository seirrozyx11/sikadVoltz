/**
 * Migration: Add Password Reset Fields to User Model
 * 
 * This migration adds the enhanced password reset security fields
 * to existing users in the database.
 * 
 * Run with: node migrations/001_add_password_reset_fields.js
 */

import mongoose from 'mongoose';
import User from '../models/User.js';
import { config } from 'dotenv';

// Load environment variables
config();

const runMigration = async () => {
  try {
    console.log('Starting password reset fields migration...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Count existing users
    const totalUsers = await User.countDocuments();
    console.log(`Found ${totalUsers} users to migrate`);
    
    if (totalUsers === 0) {
      console.log('No users found. Migration complete.');
      process.exit(0);
    }
    
    // Update users in batches
    const batchSize = 100;
    let processed = 0;
    
    while (processed < totalUsers) {
      const users = await User.find({})
        .skip(processed)
        .limit(batchSize)
        .exec();
      
      const bulkOperations = users.map(user => ({
        updateOne: {
          filter: { _id: user._id },
          update: {
            $set: {
              // Initialize password reset fields
              resetPasswordAttempts: 0,
              resetAttemptIPs: [],
              trustedIPs: [],
              securityQuestions: [],
              resetAnalytics: {
                totalResets: 0,
                suspiciousActivity: false
              }
            },
            // Remove any existing reset tokens for security
            $unset: {
              resetPasswordToken: 1,
              resetPasswordExpires: 1,
              lastResetAttempt: 1,
              lastResetIP: 1,
              backupEmail: 1
            }
          }
        }
      }));
      
      if (bulkOperations.length > 0) {
        const result = await User.bulkWrite(bulkOperations);
        processed += users.length;
        
        console.log(`Migrated batch: ${processed}/${totalUsers} users (${result.modifiedCount} modified)`);
      }
    }
    
    // Verify migration
    const verificationCount = await User.countDocuments({
      resetPasswordAttempts: { $exists: true },
      resetAnalytics: { $exists: true }
    });
    
    console.log(`Verification: ${verificationCount}/${totalUsers} users have new fields`);
    
    if (verificationCount === totalUsers) {
      console.log('Migration completed successfully!');
      console.log('Summary:');
      console.log(`   - Users migrated: ${totalUsers}`);
      console.log(`   - New fields added: resetPasswordAttempts, resetAttemptIPs, trustedIPs, securityQuestions, resetAnalytics`);
      console.log(`   - Security tokens cleared: All existing reset tokens removed`);
    } else {
      console.error('Migration incomplete. Some users may not have been updated.');
      console.log(`   Expected: ${totalUsers}, Got: ${verificationCount}`);
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\nMigration interrupted by user');
  await mongoose.disconnect();
  process.exit(1);
});

process.on('unhandledRejection', async (error) => {
  console.error('Unhandled rejection:', error);
  await mongoose.disconnect();
  process.exit(1);
});

// Run migration
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration();
}

export default runMigration;
