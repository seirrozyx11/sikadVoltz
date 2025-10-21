/**
 * Database Index Creation Script
 * 
 * Creates optimized indexes for password reset functionality
 * to ensure fast queries and good performance.
 * 
 * Run with: node scripts/create_password_reset_indexes.js
 */

import mongoose from 'mongoose';
import User from '../models/User.js';
import { config } from 'dotenv';
import logger from '../utils/logger.js';

// Load environment variables
config();

const createIndexes = async () => {
  try {
    console.log(' Creating password reset indexes...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Create indexes for password reset functionality
    const indexesToCreate = [
      // Index for reset token lookups (compound index for security)
      {
        fields: { resetPasswordToken: 1, resetPasswordExpires: 1 },
        options: { 
          name: 'reset_token_lookup',
          sparse: true, // Only index documents that have these fields
          background: true
        }
      },
      
      // Index for token expiration cleanup
      {
        fields: { resetPasswordExpires: 1 },
        options: {
          name: 'reset_token_expiry',
          sparse: true,
          background: true,
          expireAfterSeconds: 0 // Let MongoDB handle expiration
        }
      },
      
      // Index for IP-based rate limiting queries
      {
        fields: { lastResetIP: 1, lastResetAttempt: 1 },
        options: {
          name: 'reset_ip_tracking',
          sparse: true,
          background: true
        }
      },
      
      // Index for suspicious activity monitoring
      {
        fields: { 'resetAnalytics.suspiciousActivity': 1, 'resetAnalytics.lastSuccessfulReset': 1 },
        options: {
          name: 'reset_security_monitoring',
          sparse: true,
          background: true
        }
      },
      
      // Index for reset attempt history (for analytics)
      {
        fields: { 'resetAttemptIPs.timestamp': 1, 'resetAttemptIPs.ip': 1 },
        options: {
          name: 'reset_attempt_history',
          sparse: true,
          background: true
        }
      },
      
      // Compound index for email and reset fields (for user lookup)
      {
        fields: { email: 1, resetPasswordAttempts: 1 },
        options: {
          name: 'user_reset_lookup',
          background: true
        }
      }
    ];
    
    console.log(` Creating ${indexesToCreate.length} indexes...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const indexDef of indexesToCreate) {
      try {
        await User.collection.createIndex(indexDef.fields, indexDef.options);
        console.log(`Created index: ${indexDef.options.name}`);
        successCount++;
      } catch (error) {
        if (error.code === 85) { // Index already exists
          console.log(`  Index already exists: ${indexDef.options.name}`);
          successCount++;
        } else {
          console.error(` Failed to create index ${indexDef.options.name}:`, error.message);
          errorCount++;
        }
      }
    }
    
    // Verify indexes were created
    const indexes = await User.collection.indexes();
    const resetRelatedIndexes = indexes.filter(index => 
      index.name.includes('reset') || 
      index.name.includes('Reset')
    );
    
    console.log('\n Password Reset Indexes Summary:');
    console.log(`   Successfully created/verified: ${successCount}`);
    console.log(`    Failed: ${errorCount}`);
    console.log(`    Total reset-related indexes: ${resetRelatedIndexes.length}`);
    
    console.log('\n Reset-related indexes:');
    resetRelatedIndexes.forEach(index => {
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)}`);
    });
    
    // Performance recommendations
    console.log('\n Performance Notes:');
    console.log('   - All indexes created with background: true for non-blocking creation');
    console.log('   - Sparse indexes used to save space (only index documents with fields)');
    console.log('   - TTL index on resetPasswordExpires for automatic cleanup');
    console.log('   - Compound indexes optimized for common query patterns');
    
    if (errorCount === 0) {
      console.log('\n All password reset indexes created successfully!');
    } else {
      console.log(`\n  Index creation completed with ${errorCount} errors. Check logs above.`);
    }
    
  } catch (error) {
    console.error(' Index creation failed:', error);
    logger.error('Password reset index creation failed', { error: error.message });
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log(' Disconnected from MongoDB');
    process.exit(0);
  }
};

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n  Index creation interrupted by user');
  await mongoose.disconnect();
  process.exit(1);
});

// Run index creation
if (import.meta.url === `file://${process.argv[1]}`) {
  createIndexes();
}

export default createIndexes;
