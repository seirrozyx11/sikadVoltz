#!/usr/bin/env node

/**
 *  SIKADVOLTZ PERFORMANCE OPTIMIZATION SETUP
 * 
 * Automated setup script to configure all performance optimizations:
 * 1. Unified dashboard API endpoint
 * 2. Enhanced Redis caching
 * 3. Database performance indexes
 * 4. HTTP/2 server optimization
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import DatabaseIndexManager from '../services/databaseIndexManager.js';
import EnhancedCacheService from '../services/enhancedCacheService.js';
import SessionManager from '../services/sessionManager.js';

// Import all models to register schemas
import User from '../models/User.js';
import CyclingPlan from '../models/CyclingPlan.js';
import Goal from '../models/Goal.js';
import { Telemetry } from '../models/Telemetry.js';
import Notification from '../models/Notification.js';
import TokenBlacklist from '../models/TokenBlacklist.js';
import WorkoutHistory from '../models/WorkoutHistory.js';

class PerformanceOptimizationSetup {
  
  async run() {
    console.log(' SikadVoltz Performance Optimization Setup');
    console.log('============================================\n');
    
    const startTime = Date.now();
    
    try {
      // Step 1: Connect to database
      await this.connectDatabase();
      
      // Step 2: Load all models (register schemas)
      await this.loadModels();
      
      // Step 3: Initialize Redis session manager
      await this.initializeRedis();
      
      // Step 4: Create database indexes
      await this.setupDatabaseIndexes();
      
      // Step 5: Initialize enhanced caching
      await this.initializeEnhancedCaching();
      
      // Step 6: Verify optimizations
      await this.verifyOptimizations();
      
      const totalTime = Date.now() - startTime;
      console.log(`\nSetup completed successfully in ${totalTime}ms`);
      console.log('\nPerformance improvements enabled:');
      console.log('   • Unified dashboard API (/api/v1/dashboard/home)');
      console.log('   • Enhanced Redis caching with 30s TTL');
      console.log('   • Optimized database indexes');
      console.log('   • Smart cache warming');
      console.log('   • Performance monitoring');
      
      console.log('\n Next steps:');
      console.log('   1. Update Flutter app to use /api/v1/dashboard/home');
      console.log('   2. Monitor performance with /api/v1/dashboard/health');
      console.log('   3. Check cache stats in logs');
      console.log('   4. Consider HTTP/2 for production\n');
      
    } catch (error) {
      console.error(' Setup failed:', error);
      console.log('  Continuing without full optimization setup...');
      
      // In production, don't fail the build - just log and continue
      if (process.env.NODE_ENV === 'production') {
        console.log(' Production mode: Server will start without full optimization');
        process.exit(0);
      } else {
        process.exit(1);
      }
    } finally {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      process.exit(0);
    }
  }
  
  /**
   * Connect to MongoDB database
   */
  async connectDatabase() {
    console.log(' Connecting to MongoDB...');
    
    try {
      const MONGODB_URI = process.env.MONGODB_URI;
      
      if (!MONGODB_URI) {
        throw new Error('MONGODB_URI environment variable is required');
      }
      
      await mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      
      console.log('Database connected successfully');
      
    } catch (error) {
      console.error(' Database connection failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Load and register all Mongoose models
   */
  async loadModels() {
    console.log('📚 Loading Mongoose models...');
    
    try {
      // Models are imported at the top, which registers them with Mongoose
      // Verify they are properly registered
      const registeredModels = mongoose.modelNames();
      console.log('Registered models:', registeredModels.join(', '));
      
      if (registeredModels.length === 0) {
        throw new Error('No models registered - check model imports');
      }
      
    } catch (error) {
      console.error(' Model loading failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Initialize Redis session manager
   */
  async initializeRedis() {
    console.log(' Initializing Redis session manager...');
    
    try {
      const initialized = await SessionManager.initialize();
      
      if (initialized) {
        console.log('Redis session manager initialized');
      } else {
        console.log('  Redis not available - using memory fallback');
      }
      
    } catch (error) {
      console.error(' Redis initialization failed:', error.message);
      // Don't throw - Redis is optional
    }
  }
  
  /**
   * Setup database performance indexes
   */
  async setupDatabaseIndexes() {
    console.log(' Creating performance indexes...');
    
    try {
      await DatabaseIndexManager.createOptimizedIndexes();
      console.log('Database indexes created successfully');
      
      // Log performance metrics
      const metrics = await DatabaseIndexManager.getPerformanceMetrics();
      console.log('Database performance metrics:');
      console.log(`   • Collections: ${metrics.database?.collections || 0}`);
      console.log(`   • Data size: ${(metrics.database?.dataSize || 0) / 1024 / 1024} MB`);
      console.log(`   • Index size: ${(metrics.database?.indexSize || 0) / 1024 / 1024} MB`);
      
    } catch (error) {
      console.error(' Database index creation failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Initialize enhanced caching service
   */
  async initializeEnhancedCaching() {
    console.log(' Initializing enhanced caching...');
    
    try {
      const initialized = await EnhancedCacheService.initialize();
      
      if (initialized) {
        console.log('Enhanced caching initialized');
        
        // Get cache statistics
        const stats = await EnhancedCacheService.getCacheStatistics();
        if (stats.redis?.connected) {
          console.log(' Cache service ready with Redis backend');
        }
      } else {
        console.log('  Enhanced caching disabled (Redis not available)');
      }
      
    } catch (error) {
      console.error(' Enhanced caching initialization failed:', error.message);
      // Don't throw - caching is optional but recommended
    }
  }
  
  /**
   * Verify all optimizations are working
   */
  async verifyOptimizations() {
    console.log(' Verifying optimizations...');
    
    const checks = [
      this.checkDatabaseConnection(),
      this.checkRedisConnection(), 
      this.checkIndexes(),
      this.checkCacheService()
    ];
    
    const results = await Promise.allSettled(checks);
    
    let successCount = 0;
    results.forEach((result, index) => {
      const checkNames = ['Database', 'Redis', 'Indexes', 'Cache'];
      if (result.status === 'fulfilled' && result.value) {
        console.log(`   ${checkNames[index]} check passed`);
        successCount++;
      } else {
        console.log(`     ${checkNames[index]} check failed:`, result.reason?.message || 'Unknown error');
      }
    });
    
    console.log(`\n Verification: ${successCount}/4 checks passed`);
    
    if (successCount >= 2) {
      console.log('Core optimizations are working');
    } else {
      console.log('  Some optimizations may not be fully functional');
    }
  }
  
  /**
   * Check database connection
   */
  async checkDatabaseConnection() {
    return mongoose.connection.readyState === 1;
  }
  
  /**
   * Check Redis connection
   */
  async checkRedisConnection() {
    if (!SessionManager.isRedisAvailable) return false;
    
    try {
      await SessionManager.redisClient.ping();
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Check if indexes were created
   */
  async checkIndexes() {
    try {
      const collections = ['users', 'cyclingplans'];
      
      for (const collectionName of collections) {
        const collection = mongoose.connection.db.collection(collectionName);
        const indexes = await collection.indexes();
        
        // Should have at least _id index + custom indexes
        if (indexes.length < 2) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Check cache service
   */
  async checkCacheService() {
    try {
      const stats = await EnhancedCacheService.getCacheStatistics();
      return !stats.error;
    } catch (error) {
      return false;
    }
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new PerformanceOptimizationSetup();
  setup.run();
}

export default PerformanceOptimizationSetup;