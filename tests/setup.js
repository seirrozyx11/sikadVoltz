/**
 * Test Setup and Configuration
 * 
 * This file runs before all tests and sets up the testing environment.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Disable New Relic during testing
process.env.NEW_RELIC_ENABLED = 'false';
process.env.NODE_ENV = 'test';

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test timeout
jest.setTimeout(30000);

// Setup test database connection
const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/sikadvoltz_test';

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGODB_TEST_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000,
    });
  }
});

// Clean up after each test
afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  }
});

// Close database connection after all tests
afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
});

// Global test utilities
global.testUtils = {
  // Create test user
  createTestUser: async (overrides = {}) => {
    const User = (await import('../models/User.js')).default;
    const userData = {
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      password: 'TestPassword123!',
      profileCompleted: true,
      ...overrides,
    };
    return await User.create(userData);
  },
  
  // Create test JWT token
  createTestToken: (userId) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign({ userId }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  },
  
  // Wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Generate random test data
  generateTestData: {
    email: () => `test${Math.random().toString(36).substr(2, 9)}@example.com`,
    string: (length = 10) => Math.random().toString(36).substr(2, length),
    number: (min = 0, max = 100) => Math.floor(Math.random() * (max - min + 1)) + min,
    date: () => new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
  },
};