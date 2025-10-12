/**
 * Database Models Tests
 * 
 * Tests for User, CyclingPlan, WorkoutHistory, and Telemetry models
 * including validation, methods, and relationships.
 */
import { jest } from '@jest/globals';
import mongoose from 'mongoose';

describe('Database Models', () => {
  let User, CyclingPlan, WorkoutHistory, Goal;
  let Telemetry, RideSession, ESP32Device;

  beforeAll(async () => {
    // Import models
    User = (await import('../models/User.js')).default;
    CyclingPlan = (await import('../models/CyclingPlan.js')).default;
    WorkoutHistory = (await import('../models/WorkoutHistory.js')).default;
    Goal = (await import('../models/Goal.js')).default;
    
    const telemetryModels = await import('../models/Telemetry.js');
    Telemetry = telemetryModels.Telemetry;
    RideSession = telemetryModels.RideSession;
    ESP32Device = telemetryModels.ESP32Device;
  });

  describe('User Model', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        email: 'valid@example.com',
        password: 'StrongPassword123!',
        firstName: 'John',
        lastName: 'Doe',
        profile: {
          weight: 75,
          height: 180,
          birthDate: new Date('1990-01-01'),
          gender: 'male',
          dailyCalorieGoal: 2500,
        },
      };

      const user = new User(userData);
      await user.save();

      expect(user.email).toBe(userData.email);
      expect(user.password).not.toBe(userData.password); // Should be hashed
      expect(user.fullName).toBe('John Doe'); // Virtual field
      expect(user.profileCompleted).toBe(false); // Default value
    });

    it('should validate email uniqueness', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'Password123!',
        firstName: 'First',
        lastName: 'User',
      };

      // Create first user
      const user1 = new User(userData);
      await user1.save();

      // Try to create duplicate
      const user2 = new User(userData);
      
      await expect(user2.save()).rejects.toThrow(/duplicate key error/);
    });

    it('should hash password on save', async () => {
      const plainPassword = 'TestPassword123!';
      const user = new User({
        email: 'password@example.com',
        password: plainPassword,
        firstName: 'Password',
        lastName: 'Test',
      });

      await user.save();

      expect(user.password).not.toBe(plainPassword);
      expect(user.password).toMatch(/^\$2[ab]\$\d+\$/); // bcrypt hash pattern
    });

    it('should compare passwords correctly', async () => {
      const plainPassword = 'ComparePassword123!';
      const user = new User({
        email: 'compare@example.com',
        password: plainPassword,
        firstName: 'Compare',
        lastName: 'Test',
      });

      await user.save();

      const validPassword = await user.comparePassword(plainPassword);
      const invalidPassword = await user.comparePassword('WrongPassword');

      expect(validPassword).toBe(true);
      expect(invalidPassword).toBe(false);
    });

    it('should create password reset token', async () => {
      const user = new User({
        email: 'reset@example.com',
        password: 'ResetPassword123!',
        firstName: 'Reset',
        lastName: 'Test',
      });

      await user.save();

      const resetToken = user.createPasswordResetToken();

      expect(resetToken).toBeTruthy();
      expect(user.resetPasswordToken).toBeTruthy();
      expect(user.resetPasswordExpires).toBeTruthy();
      expect(user.resetPasswordExpires.getTime()).toBeGreaterThan(Date.now());
    });

    it('should validate password reset token', async () => {
      const user = new User({
        email: 'validate@example.com',
        password: 'ValidatePassword123!',
        firstName: 'Validate',
        lastName: 'Test',
      });

      await user.save();

      const resetToken = user.createPasswordResetToken();
      const isValid = user.validateResetToken(resetToken);
      const isInvalid = user.validateResetToken('invalid-token');

      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });

    it('should add activity to log', async () => {
      const user = new User({
        email: 'activity@example.com',
        password: 'ActivityPassword123!',
        firstName: 'Activity',
        lastName: 'Test',
      });

      await user.save();

      const activityData = {
        type: 'cycling',
        duration: 3600, // 1 hour
        intensity: 'moderate',
        distance: 25.5,
        calories: 450,
        notes: 'Great ride today!',
      };

      await user.addActivity(activityData);
      
      expect(user.activityLog).toHaveLength(1);
      expect(user.activityLog[0].type).toBe('cycling');
      expect(user.activityLog[0].calories).toBe(450);
    });

    it('should get calorie summary correctly', async () => {
      const user = new User({
        email: 'calories@example.com',
        password: 'CaloriePassword123!',
        firstName: 'Calorie',
        lastName: 'Test',
        activityLog: [
          {
            type: 'cycling',
            duration: 3600,
            calories: 400,
            date: new Date('2023-01-01'),
          },
          {
            type: 'running',
            duration: 1800,
            calories: 300,
            date: new Date('2023-01-02'),
          },
          {
            type: 'walking',
            duration: 2400,
            calories: 150,
            date: new Date('2022-12-31'), // Outside range
          },
        ],
      });

      await user.save();

      const summary = await User.getCalorieSummary(
        user._id,
        '2023-01-01',
        '2023-01-31'
      );

      expect(summary.totalCalories).toBe(700); // 400 + 300
      expect(summary.activityCount).toBe(2);
      expect(summary.activities).toHaveLength(2);
    });
  });

  describe('Telemetry Models', () => {
    let testUser, testDevice;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();
      
      testDevice = new ESP32Device({
        deviceId: 'TEST_DEVICE_MODEL',
        userId: testUser._id,
        deviceName: 'Test Device',
        firmwareVersion: '1.0.0',
      });
      await testDevice.save();
    });

    it('should create telemetry data with valid structure', async () => {
      const telemetryData = {
        deviceId: testDevice.deviceId,
        userId: testUser._id,
        sessionId: 'TEST_SESSION',
        coordinates: {
          type: 'Point',
          coordinates: [14.5995, 120.9842],
        },
        metrics: {
          speed: 25.5,
          distance: 10.2,
          sessionTime: 3600,
          watts: 180,
          pulseCount: 2400,
        },
        battery: {
          voltage: 12.6,
          level: 85,
        },
        workoutActive: true,
      };

      const telemetry = new Telemetry(telemetryData);
      await telemetry.save();

      expect(telemetry.deviceId).toBe(testDevice.deviceId);
      expect(telemetry.metrics.speed).toBe(25.5);
      expect(telemetry.coordinates.type).toBe('Point');
      expect(telemetry.timestamp).toBeTruthy();
    });

    it('should validate metric ranges', async () => {
      const invalidTelemetry = new Telemetry({
        deviceId: testDevice.deviceId,
        userId: testUser._id,
        sessionId: 'INVALID_SESSION',
        metrics: {
          speed: 150, // Too high (max 120)
          distance: -5, // Negative
          watts: 3000, // Too high (max 2000)
        },
      });

      await expect(invalidTelemetry.save()).rejects.toThrow(/validation/);
    });

    it('should create and manage ride sessions', async () => {
      const sessionData = {
        userId: testUser._id,
        deviceId: testDevice.deviceId,
        sessionId: 'MANAGED_SESSION',
        startTime: new Date(),
        status: 'active',
      };

      const session = new RideSession(sessionData);
      await session.save();

      expect(session.userId.toString()).toBe(testUser._id.toString());
      expect(session.status).toBe('active');
      expect(session.dataPoints).toBe(0); // Default value
    });

    it('should update session metrics correctly', async () => {
      const session = new RideSession({
        userId: testUser._id,
        deviceId: testDevice.deviceId,
        sessionId: 'METRICS_SESSION',
        startTime: new Date(),
        status: 'active',
      });
      await session.save();

      const telemetryUpdate = {
        metrics: {
          speed: 30,
          distance: 5,
          watts: 200,
        },
      };

      await session.updateMetrics(telemetryUpdate);

      expect(session.maxSpeed).toBe(30);
      expect(session.totalDistance).toBe(5);
      expect(session.maxPower).toBe(200);
      expect(session.dataPoints).toBe(1);
    });

    it('should complete sessions with final metrics', async () => {
      const session = new RideSession({
        userId: testUser._id,
        deviceId: testDevice.deviceId,
        sessionId: 'COMPLETE_SESSION',
        startTime: new Date(Date.now() - 3600000), // 1 hour ago
        status: 'active',
      });
      await session.save();

      const finalMetrics = {
        distance: 25.5,
        maxSpeed: 35,
        avgSpeed: 22,
        calories: 450,
        avgPower: 175,
        maxPower: 220,
      };

      const completedSession = await RideSession.completeSession(
        session.sessionId,
        finalMetrics
      );

      expect(completedSession.status).toBe('completed');
      expect(completedSession.totalDistance).toBe(25.5);
      expect(completedSession.endTime).toBeTruthy();
      expect(completedSession.duration).toBeGreaterThan(3500); // ~1 hour
    });
  });

  describe('CyclingPlan Model', () => {
    let testUser, testGoal;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();
      
      testGoal = new Goal({
        userId: testUser._id,
        goalType: 'weight_loss',
        targetValue: 5, // 5 kg
        timeframe: 8, // 8 weeks
        isActive: true,
      });
      await testGoal.save();
    });

    it('should create cycling plan with valid structure', async () => {
      const planData = {
        user: testUser._id,
        goal: testGoal._id,
        totalDays: 56, // 8 weeks
        dailySessions: [
          {
            date: new Date(),
            plannedHours: 2,
            status: 'pending',
          },
          {
            date: new Date(Date.now() + 86400000), // Tomorrow
            plannedHours: 1.5,
            status: 'pending',
          },
        ],
        planSummary: {
          totalCaloriesToBurn: 15000,
          dailyCyclingHours: 1.8,
          totalPlanDays: 56,
          totalCyclingHours: 100,
          bmr: 1800,
          tdee: 2200,
          dailyCalorieGoal: 2000,
        },
      };

      const plan = new CyclingPlan(planData);
      await plan.save();

      expect(plan.user.toString()).toBe(testUser._id.toString());
      expect(plan.totalDays).toBe(56);
      expect(plan.dailySessions).toHaveLength(2);
      expect(plan.isActive).toBe(true); // Default value
      expect(plan.missedCount).toBe(0); // Default value
    });

    it('should track missed sessions correctly', async () => {
      const plan = new CyclingPlan({
        user: testUser._id,
        goal: testGoal._id,
        totalDays: 7,
        dailySessions: [
          {
            date: new Date(Date.now() - 86400000), // Yesterday
            plannedHours: 2,
            status: 'missed',
            missedHours: 2,
          },
        ],
        missedCount: 1,
        totalMissedHours: 2,
      });

      await plan.save();

      expect(plan.missedCount).toBe(1);
      expect(plan.totalMissedHours).toBe(2);
      expect(plan.dailySessions[0].status).toBe('missed');
    });

    it('should handle plan adjustments', async () => {
      const plan = new CyclingPlan({
        user: testUser._id,
        goal: testGoal._id,
        totalDays: 30,
        adjustmentHistory: [
          {
            date: new Date(),
            missedHours: 3,
            newDailyTarget: 2.5,
            reason: 'missed_day',
            redistributionMethod: 'distribute_remaining',
          },
        ],
      });

      await plan.save();

      expect(plan.adjustmentHistory).toHaveLength(1);
      expect(plan.adjustmentHistory[0].missedHours).toBe(3);
      expect(plan.adjustmentHistory[0].reason).toBe('missed_day');
    });
  });

  describe('WorkoutHistory Model', () => {
    let testUser, testPlan;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();
      
      const testGoal = new Goal({
        userId: testUser._id,
        goalType: 'fitness_improvement',
        targetValue: 10,
        timeframe: 4,
        isActive: true,
      });
      await testGoal.save();

      testPlan = new CyclingPlan({
        user: testUser._id,
        goal: testGoal._id,
        totalDays: 28,
      });
      await testPlan.save();
    });

    it('should create workout history with statistics', async () => {
      const historyData = {
        user: testUser._id,
        plan: testPlan._id,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-28'),
        status: 'completed',
        statistics: {
          totalSessions: 20,
          completedSessions: 16,
          missedSessions: 4,
          totalHours: 32,
          completedHours: 28,
          caloriesBurned: 8500,
          averageIntensity: 7.5,
        },
        planSummary: {
          planType: 'Recommended',
          dailyCyclingHours: 1.5,
          totalPlanDays: 28,
          completionRate: 80,
        },
      };

      const history = new WorkoutHistory(historyData);
      await history.save();

      expect(history.user.toString()).toBe(testUser._id.toString());
      expect(history.status).toBe('completed');
      expect(history.statistics.completedSessions).toBe(16);
      expect(history.planSummary.completionRate).toBe(80);
    });

    it('should validate required fields', async () => {
      const incompleteHistory = new WorkoutHistory({
        user: testUser._id,
        // Missing required fields: plan, startDate, endDate, status
      });

      await expect(incompleteHistory.save()).rejects.toThrow(/required/);
    });

    it('should validate enum values', async () => {
      const invalidHistory = new WorkoutHistory({
        user: testUser._id,
        plan: testPlan._id,
        startDate: new Date(),
        endDate: new Date(),
        status: 'invalid_status', // Invalid enum value
      });

      await expect(invalidHistory.save()).rejects.toThrow(/enum/);
    });
  });

  describe('Model Relationships', () => {
    it('should populate user in cycling plan', async () => {
      const testUser = await global.testUtils.createTestUser({
        firstName: 'Populate',
        lastName: 'Test',
      });

      const testGoal = new Goal({
        userId: testUser._id,
        goalType: 'weight_loss',
        targetValue: 3,
        timeframe: 6,
        isActive: true,
      });
      await testGoal.save();

      const plan = new CyclingPlan({
        user: testUser._id,
        goal: testGoal._id,
        totalDays: 42,
      });
      await plan.save();

      const populatedPlan = await CyclingPlan.findById(plan._id).populate('user');
      
      expect(populatedPlan.user.firstName).toBe('Populate');
      expect(populatedPlan.user.lastName).toBe('Test');
    });

    it('should populate plan in workout history', async () => {
      const testUser = await global.testUtils.createTestUser();
      
      const testGoal = new Goal({
        userId: testUser._id,
        goalType: 'endurance',
        targetValue: 15,
        timeframe: 10,
        isActive: true,
      });
      await testGoal.save();

      const plan = new CyclingPlan({
        user: testUser._id,
        goal: testGoal._id,
        totalDays: 70,
        planType: 'Advanced',
      });
      await plan.save();

      const history = new WorkoutHistory({
        user: testUser._id,
        plan: plan._id,
        startDate: new Date(),
        endDate: new Date(),
        status: 'completed',
      });
      await history.save();

      const populatedHistory = await WorkoutHistory.findById(history._id).populate('plan');
      
      expect(populatedHistory.plan.planType).toBe('Advanced');
      expect(populatedHistory.plan.totalDays).toBe(70);
    });
  });
});