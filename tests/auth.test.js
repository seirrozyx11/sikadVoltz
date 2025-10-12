/**
 * Authentication API Tests
 * 
 * Tests for user registration, login, JWT token handling,
 * password reset, and Google OAuth integration.
 */
import request from 'supertest';
import { jest } from '@jest/globals';
import mongoose from 'mongoose';

// Mock the app without starting the server
jest.unstable_mockModule('../newrelic.js', () => ({}));

describe('Authentication API', () => {
  let app;
  let User;
  
  beforeAll(async () => {
    // Import app after mocking
    const appModule = await import('../index.js');
    app = appModule.default || appModule.app;
    User = (await import('../models/User.js')).default;
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'StrongPassword123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should reject registration with weak password', async () => {
      const userData = {
        email: 'weakpass@example.com',
        password: '123',
        firstName: 'Weak',
        lastName: 'Password',
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/password/i);
    });

    it('should reject registration with duplicate email', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'StrongPassword123!',
        firstName: 'First',
        lastName: 'User',
      };

      // Create first user
      await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      // Try to create duplicate
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/email.*exists/i);
    });

    it('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'StrongPassword123!',
        firstName: 'Invalid',
        lastName: 'Email',
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/email/i);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser({
        email: 'login@example.com',
        password: 'LoginPassword123!',
      });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'login@example.com',
          password: 'LoginPassword123!',
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('login@example.com');
    });

    it('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'login@example.com',
          password: 'WrongPassword',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/invalid.*credentials/i);
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'AnyPassword123!',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/invalid.*credentials/i);
    });

    it('should implement rate limiting for login attempts', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'WrongPassword',
      };

      // Make multiple failed login attempts
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send(loginData);
      }

      // Next attempt should be rate limited
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(429);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/rate.*limit/i);
    });
  });

  describe('GET /api/v1/auth/profile', () => {
    let testUser, authToken;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();
      authToken = global.testUtils.createTestToken(testUser._id);
    });

    it('should get user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/token.*required/i);
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/invalid.*token/i);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let testUser, authToken;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();
      authToken = global.testUtils.createTestToken(testUser._id);
    });

    it('should logout successfully with valid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/logout.*successful/i);
    });

    it('should handle logout without token gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Password Reset Flow', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser({
        email: 'reset@example.com',
      });
    });

    it('should initiate password reset with valid email', async () => {
      const response = await request(app)
        .post('/api/v1/password-reset/request')
        .send({ email: 'reset@example.com' })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/reset.*sent/i);

      // Verify reset token was created
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.resetPasswordToken).toBeTruthy();
      expect(updatedUser.resetPasswordExpires).toBeTruthy();
    });

    it('should handle password reset for non-existent email', async () => {
      const response = await request(app)
        .post('/api/v1/password-reset/request')
        .send({ email: 'nonexistent@example.com' })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/user.*not.*found/i);
    });

    it('should implement rate limiting for password reset requests', async () => {
      // Make multiple reset requests
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post('/api/v1/password-reset/request')
          .send({ email: 'reset@example.com' });
      }

      // Next attempt should be rate limited
      const response = await request(app)
        .post('/api/v1/password-reset/request')
        .send({ email: 'reset@example.com' })
        .expect(429);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/rate.*limit/i);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('API Versioning', () => {
    it('should support legacy routes with deprecation warning', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${global.testUtils.createTestToken(new mongoose.Types.ObjectId())}`)
        .expect(401); // Will fail auth but should reach the endpoint

      expect(response.headers).toHaveProperty('x-api-warning');
      expect(response.headers['x-api-warning']).toMatch(/deprecated/i);
    });

    it('should support new versioned routes', async () => {
      const testUser = await global.testUtils.createTestUser();
      const authToken = global.testUtils.createTestToken(testUser._id);

      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers).not.toHaveProperty('x-api-warning');
    });
  });
});