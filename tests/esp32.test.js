/**
 * ESP32 Telemetry API Tests
 * 
 * Tests for ESP32 device registration, telemetry data ingestion,
 * real-time WebSocket communication, and session management.
 */
import request from 'supertest';
import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import WebSocket from 'ws';

describe('ESP32 Telemetry API', () => {
  let app;
  let User, ESP32Device, Telemetry, RideSession;
  let testUser, authToken, testDevice;

  beforeAll(async () => {
    // Import app and models
    const appModule = await import('../index.js');
    app = appModule.default || appModule.app;
    
    User = (await import('../models/User.js')).default;
    const telemetryModels = await import('../models/Telemetry.js');
    ESP32Device = telemetryModels.ESP32Device;
    Telemetry = telemetryModels.Telemetry;
    RideSession = telemetryModels.RideSession;
  });

  beforeEach(async () => {
    // Create test user and device
    testUser = await global.testUtils.createTestUser({
      email: 'esp32@example.com',
    });
    authToken = global.testUtils.createTestToken(testUser._id);

    testDevice = await ESP32Device.create({
      deviceId: 'TEST_ESP32_001',
      userId: testUser._id,
      deviceName: 'Test SikadVoltz Device',
      firmwareVersion: '1.0.0',
    });
  });

  describe('Device Registration', () => {
    it('should register a new ESP32 device', async () => {
      const deviceData = {
        deviceId: 'NEW_ESP32_002',
        deviceName: 'New Test Device',
        firmwareVersion: '1.1.0',
        wheelCircumference: 2.1,
      };

      const response = await request(app)
        .post('/api/v1/esp32/register')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deviceData)
        .expect(201);

      expect(response.body).toHaveProperty('device');
      expect(response.body.device.deviceId).toBe(deviceData.deviceId);
      expect(response.body.device.userId.toString()).toBe(testUser._id.toString());
    });

    it('should reject duplicate device registration', async () => {
      const deviceData = {
        deviceId: testDevice.deviceId,
        deviceName: 'Duplicate Device',
      };

      const response = await request(app)
        .post('/api/v1/esp32/register')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deviceData)
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/device.*already.*registered/i);
    });

    it('should require authentication for device registration', async () => {
      const deviceData = {
        deviceId: 'UNAUTH_ESP32',
        deviceName: 'Unauthorized Device',
      };

      const response = await request(app)
        .post('/api/v1/esp32/register')
        .send(deviceData)
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Telemetry Data Ingestion', () => {
    let testSession;

    beforeEach(async () => {
      testSession = await RideSession.create({
        userId: testUser._id,
        deviceId: testDevice.deviceId,
        sessionId: 'TEST_SESSION_001',
        startTime: new Date(),
        status: 'active',
      });
    });

    it('should accept valid telemetry data', async () => {
      const telemetryData = {
        deviceId: testDevice.deviceId,
        sessionId: testSession.sessionId,
        metrics: {
          speed: 25.5,
          distance: 5.2,
          sessionTime: 3600,
          watts: 180,
          pulseCount: 2400,
        },
        battery: {
          voltage: 12.6,
          level: 85,
        },
        workoutActive: true,
        coordinates: {
          coordinates: [14.5995, 120.9842], // Manila coordinates
        },
      };

      const response = await request(app)
        .post('/api/v1/esp32/telemetry')
        .send(telemetryData)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('dataReceived', true);

      // Verify data was stored
      const storedTelemetry = await Telemetry.findOne({
        deviceId: testDevice.deviceId,
        sessionId: testSession.sessionId,
      });
      expect(storedTelemetry).toBeTruthy();
      expect(storedTelemetry.metrics.speed).toBe(25.5);
    });

    it('should reject telemetry data without required fields', async () => {
      const invalidData = {
        deviceId: testDevice.deviceId,
        // Missing sessionId and metrics
        workoutActive: true,
      };

      const response = await request(app)
        .post('/api/v1/esp32/telemetry')
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/required.*field/i);
    });

    it('should validate metric ranges', async () => {
      const invalidData = {
        deviceId: testDevice.deviceId,
        sessionId: testSession.sessionId,
        metrics: {
          speed: 150, // Too high (max 120 km/h)
          distance: -5, // Negative distance
          watts: 3000, // Too high (max 2000)
        },
      };

      const response = await request(app)
        .post('/api/v1/esp32/telemetry')
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/validation/i);
    });

    it('should handle high-frequency telemetry data', async () => {
      const promises = [];
      
      // Send 50 telemetry points rapidly
      for (let i = 0; i < 50; i++) {
        const telemetryData = {
          deviceId: testDevice.deviceId,
          sessionId: testSession.sessionId,
          metrics: {
            speed: 20 + Math.random() * 10,
            distance: i * 0.1,
            sessionTime: i * 60,
            watts: 150 + Math.random() * 50,
          },
          workoutActive: true,
        };

        promises.push(
          request(app)
            .post('/api/v1/esp32/telemetry')
            .send(telemetryData)
        );
      }

      const responses = await Promise.all(promises);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify all data was stored
      const storedCount = await Telemetry.countDocuments({
        deviceId: testDevice.deviceId,
        sessionId: testSession.sessionId,
      });
      expect(storedCount).toBe(50);
    });
  });

  describe('Session Management', () => {
    it('should create a new ride session', async () => {
      const sessionData = {
        deviceId: testDevice.deviceId,
        plannedHours: 2,
      };

      const response = await request(app)
        .post('/api/v1/esp32/session/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send(sessionData)
        .expect(201);

      expect(response.body).toHaveProperty('session');
      expect(response.body.session.userId.toString()).toBe(testUser._id.toString());
      expect(response.body.session.status).toBe('active');
      expect(response.body.session).toHaveProperty('sessionId');
    });

    it('should end an active session', async () => {
      // Create active session
      const session = await RideSession.create({
        userId: testUser._id,
        deviceId: testDevice.deviceId,
        sessionId: 'END_TEST_SESSION',
        startTime: new Date(Date.now() - 3600000), // 1 hour ago
        status: 'active',
      });

      const endData = {
        sessionId: session.sessionId,
        finalMetrics: {
          distance: 15.5,
          maxSpeed: 35,
          avgSpeed: 22,
          calories: 450,
          avgPower: 175,
          maxPower: 220,
        },
      };

      const response = await request(app)
        .post('/api/v1/esp32/session/end')
        .set('Authorization', `Bearer ${authToken}`)
        .send(endData)
        .expect(200);

      expect(response.body).toHaveProperty('session');
      expect(response.body.session.status).toBe('completed');
      expect(response.body.session.totalDistance).toBe(15.5);
      expect(response.body.session).toHaveProperty('endTime');
    });

    it('should get user active sessions', async () => {
      // Create multiple sessions
      await RideSession.create([
        {
          userId: testUser._id,
          deviceId: testDevice.deviceId,
          sessionId: 'ACTIVE_1',
          startTime: new Date(),
          status: 'active',
        },
        {
          userId: testUser._id,
          deviceId: testDevice.deviceId,
          sessionId: 'ACTIVE_2',
          startTime: new Date(),
          status: 'active',
        },
        {
          userId: testUser._id,
          deviceId: testDevice.deviceId,
          sessionId: 'COMPLETED_1',
          startTime: new Date(),
          status: 'completed',
        },
      ]);

      const response = await request(app)
        .get('/api/v1/esp32/sessions/active')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('sessions');
      expect(response.body.sessions).toHaveLength(2);
      expect(response.body.sessions.every(s => s.status === 'active')).toBe(true);
    });
  });

  describe('Device Management', () => {
    it('should get user devices', async () => {
      // Create additional device
      await ESP32Device.create({
        deviceId: 'SECOND_DEVICE',
        userId: testUser._id,
        deviceName: 'Second Device',
        isActive: true,
      });

      const response = await request(app)
        .get('/api/v1/esp32/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('devices');
      expect(response.body.devices).toHaveLength(2);
      expect(response.body.devices.every(d => d.userId.toString() === testUser._id.toString())).toBe(true);
    });

    it('should update device settings', async () => {
      const updateData = {
        deviceName: 'Updated Device Name',
        wheelCircumference: 2.15,
        batteryThreshold: 15,
      };

      const response = await request(app)
        .put(`/api/v1/esp32/device/${testDevice.deviceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('device');
      expect(response.body.device.deviceName).toBe(updateData.deviceName);
      expect(response.body.device.wheelCircumference).toBe(updateData.wheelCircumference);
    });

    it('should deactivate device', async () => {
      const response = await request(app)
        .delete(`/api/v1/esp32/device/${testDevice.deviceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/deactivated/i);

      // Verify device is deactivated
      const updatedDevice = await ESP32Device.findOne({ deviceId: testDevice.deviceId });
      expect(updatedDevice.isActive).toBe(false);
    });
  });

  describe('Performance and Rate Limiting', () => {
    it('should handle telemetry rate limiting correctly', async () => {
      const telemetryData = {
        deviceId: testDevice.deviceId,
        sessionId: 'RATE_LIMIT_TEST',
        metrics: { speed: 20, distance: 1, sessionTime: 60, watts: 150 },
      };

      // ESP32 endpoints should allow high frequency (50 req/s burst)
      const promises = [];
      for (let i = 0; i < 30; i++) {
        promises.push(
          request(app)
            .post('/api/v1/esp32/telemetry')
            .send({ ...telemetryData, sessionTime: i * 60 })
        );
      }

      const responses = await Promise.all(promises);
      
      // Most requests should succeed (ESP32 has higher limits)
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(25);
    });

    it('should respond quickly to telemetry requests', async () => {
      const telemetryData = {
        deviceId: testDevice.deviceId,
        sessionId: 'PERF_TEST',
        metrics: { speed: 25, distance: 2, sessionTime: 120, watts: 175 },
      };

      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/v1/esp32/telemetry')
        .send(telemetryData)
        .expect(200);

      const responseTime = Date.now() - startTime;
      
      // Should respond within 100ms for optimal real-time performance
      expect(responseTime).toBeLessThan(100);
    });
  });

  describe('Data Validation and Security', () => {
    it('should sanitize telemetry input data', async () => {
      const maliciousData = {
        deviceId: testDevice.deviceId,
        sessionId: 'XSS_TEST',
        metrics: {
          speed: 25,
          distance: 1,
          sessionTime: 60,
          watts: 150,
        },
        // Attempt XSS injection
        maliciousField: '<script>alert("xss")</script>',
        rawData: {
          command: 'rm -rf /',
          eval: 'process.exit(1)',
        },
      };

      const response = await request(app)
        .post('/api/v1/esp32/telemetry')
        .send(maliciousData)
        .expect(200);

      // Data should be stored but malicious content sanitized
      const storedData = await Telemetry.findOne({
        deviceId: testDevice.deviceId,
        sessionId: 'XSS_TEST',
      });

      expect(storedData).toBeTruthy();
      expect(storedData.toObject()).not.toHaveProperty('maliciousField');
    });

    it('should validate device ownership', async () => {
      // Create device for different user
      const otherUser = await global.testUtils.createTestUser({
        email: 'other@example.com',
      });
      
      const otherDevice = await ESP32Device.create({
        deviceId: 'OTHER_DEVICE',
        userId: otherUser._id,
        deviceName: 'Other User Device',
      });

      // Try to access other user's device
      const response = await request(app)
        .get(`/api/v1/esp32/device/${otherDevice.deviceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/access.*denied/i);
    });
  });
});