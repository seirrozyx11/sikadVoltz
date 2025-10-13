/**
 * 🚀 DATABASE PERFORMANCE OPTIMIZATION
 * 
 * Creates optimized indexes for fast query performance
 * Run this script after deployment to optimize database queries
 */

import mongoose from 'mongoose';
import logger from '../utils/logger.js';

/**
 * Creates all necessary indexes for optimal query performance
 */
export class DatabaseIndexManager {
  
  /**
   * Create all performance-critical indexes
   */
  static async createOptimizedIndexes() {
    const startTime = Date.now();
    logger.info('🚀 Creating optimized database indexes...');
    
    try {
      const indexPromises = [
        // User collection indexes
        this.createUserIndexes(),
        
        // CyclingPlan collection indexes  
        this.createCyclingPlanIndexes(),
        
        // Telemetry collection indexes
        this.createTelemetryIndexes(),
        
        // Session collection indexes
        this.createSessionIndexes(),
        
        // Notification indexes
        this.createNotificationIndexes(),
        
        // Goal collection indexes
        this.createGoalIndexes()
      ];
      
      await Promise.all(indexPromises);
      
      const duration = Date.now() - startTime;
      logger.info(`✅ All indexes created successfully in ${duration}ms`);
      
      // Log index statistics
      await this.logIndexStatistics();
      
    } catch (error) {
      logger.error('❌ Failed to create indexes:', error);
      throw error;
    }
  }
  
  /**
   * User collection performance indexes
   */
  static async createUserIndexes() {
    const User = mongoose.model('User');
    
    const indexes = [
      // Fast login lookups
      { email: 1 },
      
      // Profile completion queries
      { 'profile.healthScreeningComplete': 1 },
      
      // User status queries
      { isActive: 1, createdAt: -1 },
      
      // Compound index for dashboard queries
      { _id: 1, isActive: 1 }
    ];
    
    for (const index of indexes) {
      try {
        await User.collection.createIndex(index);
        logger.info(`✅ User index created: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code !== 85) { // Index already exists
          logger.warn(`⚠️  User index warning: ${error.message}`);
        }
      }
    }
  }
  
  /**
   * CyclingPlan collection performance indexes  
   */
  static async createCyclingPlanIndexes() {
    const CyclingPlan = mongoose.model('CyclingPlan');
    
    const indexes = [
      // Fast active plan lookups (CRITICAL for dashboard)
      { user: 1, isActive: 1 },
      
      // Plan status queries
      { status: 1, createdAt: -1 },
      
      // Session date range queries
      { 'dailySessions.date': 1 },
      
      // Compound index for user's plans
      { user: 1, createdAt: -1 },
      
      // Missed session detection
      { user: 1, 'dailySessions.status': 1 },
      
      // Plan completion tracking
      { user: 1, isActive: 1, completedAt: 1 }
    ];
    
    for (const index of indexes) {
      try {
        await CyclingPlan.collection.createIndex(index);
        logger.info(`✅ CyclingPlan index created: ${JSON.stringify(index)}`);
      } catch (error) {
        if (error.code !== 85) {
          logger.warn(`⚠️  CyclingPlan index warning: ${error.message}`);
        }
      }
    }
  }
  
  /**
   * Telemetry collection performance indexes
   */
  static async createTelemetryIndexes() {
    try {
      const Telemetry = mongoose.model('Telemetry');
      
      const indexes = [
        // Time-series data queries (CRITICAL for charts)
        { userId: 1, timestamp: -1 },
        
        // Recent data queries
        { timestamp: -1 },
        
        // Session-based queries
        { userId: 1, sessionId: 1 },
        
        // Performance metrics queries
        { userId: 1, timestamp: -1, calories: 1 },
        
        // Date range queries for dashboard
        { userId: 1, timestamp: 1, calories: 1, distance: 1 }
      ];
      
      for (const index of indexes) {
        try {
          await Telemetry.collection.createIndex(index);
          logger.info(`✅ Telemetry index created: ${JSON.stringify(index)}`);
        } catch (error) {
          if (error.code !== 85) {
            logger.warn(`⚠️  Telemetry index warning: ${error.message}`);
          }
        }
      }
    } catch (modelError) {
      logger.warn('⚠️  Telemetry model not found - skipping telemetry indexes');
    }
  }
  
  /**
   * Session collection performance indexes
   */
  static async createSessionIndexes() {
    try {
      const RideSession = mongoose.model('RideSession');
      
      const indexes = [
        // User session queries
        { userId: 1, startTime: -1 },
        
        // Active session lookups
        { userId: 1, isActive: 1 },
        
        // Session completion queries
        { userId: 1, endTime: -1 },
        
        // Device-based queries
        { deviceId: 1, startTime: -1 }
      ];
      
      for (const index of indexes) {
        try {
          await RideSession.collection.createIndex(index);
          logger.info(`✅ RideSession index created: ${JSON.stringify(index)}`);
        } catch (error) {
          if (error.code !== 85) {
            logger.warn(`⚠️  RideSession index warning: ${error.message}`);
          }
        }
      }
    } catch (modelError) {
      logger.warn('⚠️  RideSession model not found - skipping session indexes');
    }
  }
  
  /**
   * Notification collection performance indexes
   */
  static async createNotificationIndexes() {
    try {
      const Notification = mongoose.model('Notification');
      
      const indexes = [
        // User notification queries
        { userId: 1, createdAt: -1 },
        
        // Unread notification queries
        { userId: 1, isRead: 1, createdAt: -1 },
        
        // Notification type queries
        { userId: 1, type: 1, createdAt: -1 },
        
        // Expiration cleanup
        { expiresAt: 1 }
      ];
      
      for (const index of indexes) {
        try {
          await Notification.collection.createIndex(index);
          logger.info(`✅ Notification index created: ${JSON.stringify(index)}`);
        } catch (error) {
          if (error.code !== 85) {
            logger.warn(`⚠️  Notification index warning: ${error.message}`);
          }
        }
      }
    } catch (modelError) {
      logger.warn('⚠️  Notification model not found - skipping notification indexes');
    }
  }
  
  /**
   * Goal collection performance indexes
   */
  static async createGoalIndexes() {
    try {
      const Goal = mongoose.model('Goal');
      
      const indexes = [
        // User goal queries
        { user: 1, createdAt: -1 },
        
        // Active goal lookups
        { user: 1, status: 1 },
        
        // Goal type queries
        { user: 1, goalType: 1 }
      ];
      
      for (const index of indexes) {
        try {
          await Goal.collection.createIndex(index);
          logger.info(`✅ Goal index created: ${JSON.stringify(index)}`);
        } catch (error) {
          if (error.code !== 85) {
            logger.warn(`⚠️  Goal index warning: ${error.message}`);
          }
        }
      }
    } catch (modelError) {
      logger.warn('⚠️  Goal model not found - skipping goal indexes');
    }
  }
  
  /**
   * Log detailed index statistics
   */
  static async logIndexStatistics() {
    try {
      const collections = ['users', 'cyclingplans', 'telemetries', 'notifications', 'goals'];
      
      logger.info('📊 Database Index Statistics:');
      
      for (const collectionName of collections) {
        try {
          const collection = mongoose.connection.db.collection(collectionName);
          const indexes = await collection.indexes();
          
          logger.info(`  ${collectionName}: ${indexes.length} indexes`);
          
          // Log individual indexes
          indexes.forEach(index => {
            const keyStr = Object.keys(index.key).map(k => 
              `${k}:${index.key[k]}`
            ).join(', ');
            logger.info(`    - {${keyStr}}`);
          });
          
        } catch (collError) {
          logger.warn(`    ${collectionName}: Collection not found`);
        }
      }
      
    } catch (error) {
      logger.warn('Failed to retrieve index statistics:', error.message);
    }
  }
  
  /**
   * Remove all custom indexes (for testing/reset)
   */
  static async dropAllCustomIndexes() {
    logger.warn('🗑️  Dropping all custom indexes...');
    
    try {
      const collections = ['users', 'cyclingplans', 'telemetries', 'notifications', 'goals'];
      
      for (const collectionName of collections) {
        try {
          const collection = mongoose.connection.db.collection(collectionName);
          const indexes = await collection.indexes();
          
          // Drop all indexes except _id
          for (const index of indexes) {
            if (index.name !== '_id_') {
              await collection.dropIndex(index.name);
              logger.info(`🗑️  Dropped index: ${index.name} from ${collectionName}`);
            }
          }
        } catch (collError) {
          logger.warn(`Collection ${collectionName} not found or error dropping indexes`);
        }
      }
      
      logger.info('✅ All custom indexes dropped');
      
    } catch (error) {
      logger.error('❌ Failed to drop indexes:', error);
      throw error;
    }
  }
  
  /**
   * Get current database performance metrics
   */
  static async getPerformanceMetrics() {
    try {
      const db = mongoose.connection.db;
      
      // Get database stats
      const dbStats = await db.stats();
      
      // Get collection stats
      const collections = ['users', 'cyclingplans', 'telemetries'];
      const collectionStats = {};
      
      for (const collName of collections) {
        try {
          const collection = db.collection(collName);
          const stats = await collection.stats();
          collectionStats[collName] = {
            count: stats.count,
            size: stats.size,
            avgObjSize: stats.avgObjSize,
            indexes: stats.nindexes,
            totalIndexSize: stats.totalIndexSize
          };
        } catch (collError) {
          collectionStats[collName] = { error: 'Collection not found' };
        }
      }
      
      return {
        database: {
          dataSize: dbStats.dataSize,
          indexSize: dbStats.indexSize,
          collections: dbStats.collections
        },
        collections: collectionStats,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Failed to get performance metrics:', error);
      return { error: error.message };
    }
  }
}

export default DatabaseIndexManager;