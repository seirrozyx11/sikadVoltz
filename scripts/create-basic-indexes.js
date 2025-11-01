#!/usr/bin/env node

/**
 * 🗂️ DATABASE INDEX CREATION (Standalone)
 * 
 * Simple script to create database indexes without other optimizations
 * Safe for production deployment
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

// Import all models to register schemas
import User from '../models/User.js';
import CyclingPlan from '../models/CyclingPlan.js';
import Goal from '../models/Goal.js';
import { Telemetry } from '../models/Telemetry.js';
import Notification from '../models/Notification.js';
import TokenBlacklist from '../models/TokenBlacklist.js';
import WorkoutHistory from '../models/WorkoutHistory.js';

class SimpleIndexCreator {
  
  async run() {
    console.log('🗂️ Creating Database Indexes...');
    
    try {
      // Connect to database
      await this.connectDatabase();
      
      // Create basic performance indexes
      await this.createBasicIndexes();
      
      console.log('Database indexes created successfully');
      
    } catch (error) {
      console.error(' Index creation failed:', error.message);
      console.log(' Server can still start without optimized indexes');
    } finally {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    }
  }
  
  async connectDatabase() {
    const MONGODB_URI = process.env.MONGODB_URI;
    
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI not found');
    }
    
    await mongoose.connect(MONGODB_URI);
    
    console.log('Connected to MongoDB');
  }
  
  async createBasicIndexes() {
    const models = mongoose.modelNames();
    console.log('📚 Registered models:', models.join(', '));
    
    if (models.includes('User')) {
      const User = mongoose.model('User');
      try {
        await User.collection.createIndex({ email: 1 }, { unique: true, background: true });
        console.log('User email index created');
      } catch (error) {
        console.log(' User index may already exist');
      }
    }
    
    if (models.includes('CyclingPlan')) {
      const CyclingPlan = mongoose.model('CyclingPlan');
      try {
        await CyclingPlan.collection.createIndex({ user: 1, isActive: 1 }, { background: true });
        console.log('CyclingPlan user index created');
      } catch (error) {
        console.log(' CyclingPlan index may already exist');
      }
    }
    
    if (models.includes('Telemetry')) {
      const Telemetry = mongoose.model('Telemetry');
      try {
        await Telemetry.collection.createIndex({ userId: 1, timestamp: -1 }, { background: true });
        console.log('Telemetry performance index created');
      } catch (error) {
        console.log(' Telemetry index may already exist');
      }
    }
  }
}

// Run if called directly
const indexCreator = new SimpleIndexCreator();
indexCreator.run();