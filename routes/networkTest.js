/**
 * Simple network connectivity test endpoint
 */

import express from 'express';

const testRouter = express.Router();

// Simple ping endpoint
testRouter.get('/ping', (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  res.json({
    success: true,
    message: 'Network connection working!',
    timestamp: new Date().toISOString(),
    clientIP: clientIP,
    serverIP: '192.168.1.3',
    port: 3000,
    environment: 'development'
  });
});

// Test password reset endpoint availability
testRouter.get('/test-reset-endpoints', (req, res) => {
  res.json({
    success: true,
    message: 'Password reset endpoints available',
    endpoints: {
      verify: 'POST /api/password-reset/verify-reset-token',
      reset: 'POST /api/password-reset/reset-password',
      manual: 'GET /api/password-reset/manual-verify/:token'
    },
    testToken: '5eed4e70030c92e666966deaf28d418b131f44a51f0010b10164766363b92d86',
    networkInfo: {
      serverIP: '192.168.1.3',
      port: 3000,
      protocol: 'http'
    }
  });
});

export default testRouter;