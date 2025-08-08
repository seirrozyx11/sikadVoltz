import express from 'express';
import authenticateToken from '../middleware/authenticateToken.js';
import { body, validationResult } from 'express-validator';
import logger from '../utils/logger.js';

// Import models when available
// import { Telemetry, RideSession, ESP32Device } from '../models/Telemetry.js';
// import User from '../models/User.js';
// import CyclingPlan from '../models/CyclingPlan.js';
// import { calculateCyclingCalories } from '../services/calorieService.js';

const router = express.Router();

// Validation middleware
const validateRideData = [
  body('speed').isFloat({ min: 0 }).withMessage('Speed must be a positive number'),
  body('distance').isFloat({ min: 0 }).withMessage('Distance must be a positive number'),
  body('power').isFloat({ min: 0 }).withMessage('Power must be a positive number'),
  body('voltage').isFloat({ min: 0 }).withMessage('Voltage must be a positive number'),
  body('sessionTime').isInt({ min: 0 }).withMessage('Session time must be a positive integer'),
  body('timestamp').isInt({ min: 0 }).withMessage('Timestamp must be a positive integer')
];

const validateSessionData = [
  body('sessionId').notEmpty().withMessage('Session ID is required'),
  body('distanceKm').isFloat({ min: 0 }).withMessage('Distance must be a positive number'),
  body('durationSeconds').isInt({ min: 0 }).withMessage('Duration must be a positive integer'),
  body('averageSpeed').isFloat({ min: 0 }).withMessage('Average speed must be a positive number'),
  body('maxSpeed').isFloat({ min: 0 }).withMessage('Max speed must be a positive number'),
  body('averageWatts').isFloat({ min: 0 }).withMessage('Average watts must be a positive number'),
  body('maxWatts').isFloat({ min: 0 }).withMessage('Max watts must be a positive number')
];

// POST /api/esp32/ride-data - Receive real-time data from ESP32 via app
router.post('/ride-data', authenticateToken, validateRideData, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      speed,
      distance,
      power,
      avgPower,
      maxPower,
      voltage,
      sessionTime,
      state,
      timestamp
    } = req.body;

    const userId = req.user.id;

    // Log the received data
    logger.info('ESP32 ride data received', {
      userId,
      speed,
      distance,
      power,
      sessionTime,
      state
    });

    // TODO: Store in database when models are ready
    // For now, just acknowledge receipt
    res.status(201).json({
      success: true,
      message: 'Ride data received successfully',
      data: {
        userId,
        receivedAt: new Date().toISOString(),
        metrics: {
          speed,
          distance,
          power,
          avgPower,
          maxPower,
          voltage,
          sessionTime,
          state
        }
      }
    });

  } catch (error) {
    logger.error('Error processing ESP32 ride data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process ride data',
      details: error.message
    });
  }
});

// Register ESP32 device
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { deviceId, deviceName, firmwareVersion } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Device ID is required'
      });
    }
    
    // TODO: Implement when ESP32Device model is available
    // Mock response for now
    const device = {
      deviceId,
      userId,
      deviceName: deviceName || 'SIKAD-VOLTZ',
      firmwareVersion: firmwareVersion || '1.0.0',
      lastSeen: new Date(),
      isActive: true
    };
    
    res.json({
      success: true,
      data: device,
      message: 'Device registered successfully'
    });
    
  } catch (error) {
    logger.error('ESP32 device registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register device',
      details: error.message
    });
  }
});

// Start new ride session
router.post('/session/start', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { deviceId } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Device ID is required'
      });
    }
    
    // TODO: Implement when models are available
    // Mock session creation for now
    const session = {
      sessionId: `session_${Date.now()}`,
      userId,
      deviceId,
      startTime: new Date(),
      status: 'active'
    };
    
    logger.info(`New ride session started: ${session.sessionId} for user ${userId}`);
    
    res.json({
      success: true,
      data: session,
      message: 'Ride session started successfully'
    });
    
  } catch (error) {
    logger.error('Start session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start session',
      details: error.message
    });
  }
});

// Receive telemetry data from ESP32
router.post('/telemetry', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { deviceId, sessionId, data } = req.body;
    
    // Enhanced debug logging
    logger.info(`📡 ESP32 Telemetry Received`, {
      userId,
      deviceId,
      sessionId,
      rawData: data,
      timestamp: new Date().toISOString()
    });
    
    if (!deviceId || !data) {
      logger.warn(`❌ Missing required fields`, { deviceId: !!deviceId, data: !!data });
      return res.status(400).json({
        success: false,
        error: 'Device ID and data are required'
      });
    }
    
    // Parse telemetry data
    const parsedMetrics = {
      speed: parseFloat(data.speed) || 0,
      distance: parseFloat(data.distance) || 0,
      sessionTime: parseInt(data.sessionTime) || 0,
      watts: parseFloat(data.power) || 0,
      voltage: parseFloat(data.voltage) || 0
    };
    
    logger.info(`📊 Parsed Telemetry Data:`, {
      parsed: parsedMetrics,
      workoutActive: data.state === 'RUNNING'
    });
    
    // TODO: Store in database when models are ready
    // For now, just log and acknowledge
    
    // Publish to real-time service if available
    const telemetryService = req.app.locals.telemetryService;
    if (telemetryService) {
      try {
        await telemetryService.publishTelemetry(deviceId, {
          type: 'telemetry',
          deviceId: deviceId,
          userId: userId,
          sessionId: sessionId || `auto_${Date.now()}`,
          metrics: parsedMetrics,
          timestamp: new Date()
        });
        logger.info(`🚀 Real-time telemetry published for device ${deviceId}`);
      } catch (publishError) {
        logger.error('❌ WebSocket publish failed:', publishError.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Telemetry data received and processed',
      debug: {
        deviceId,
        metrics: parsedMetrics,
        publishedToWebSocket: !!telemetryService
      }
    });
    
  } catch (error) {
    logger.error('Telemetry processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process telemetry data',
      details: error.message
    });
  }
});

// End ride session
router.post('/session/end', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { sessionId, deviceId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }
    
    // TODO: Implement when models are available
    // Mock session completion for now
    const completedSession = {
      sessionId,
      userId,
      deviceId,
      endTime: new Date(),
      status: 'completed',
      summary: {
        duration: '30 minutes',
        distance: '5.2 km',
        avgSpeed: '10.4 km/h',
        calories: 150
      }
    };
    
    logger.info(`Session completed: ${sessionId}`);
    
    res.json({
      success: true,
      data: completedSession,
      message: 'Session completed successfully'
    });
    
  } catch (error) {
    logger.error('End session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end session',
      details: error.message
    });
  }
});

// GET /api/esp32/sessions - Get user's ESP32 sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, offset = 0 } = req.query;

    // TODO: Retrieve from database when models are ready
    // Mock response for now
    const mockSessions = [];

    res.status(200).json({
      success: true,
      data: {
        sessions: mockSessions,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: mockSessions.length
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching ESP32 sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions',
      details: error.message
    });
  }
});

// POST /api/esp32/device-status - Update device status/connectivity
router.post('/device-status', authenticateToken, async (req, res) => {
  try {
    const { deviceId, status, batteryLevel, signalStrength } = req.body;
    const userId = req.user.id;

    logger.info('ESP32 device status update', {
      userId,
      deviceId,
      status,
      batteryLevel,
      signalStrength
    });

    // TODO: Store device status when models are ready
    
    res.status(200).json({
      success: true,
      message: 'Device status updated',
      data: {
        deviceId,
        status,
        lastUpdate: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error updating device status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update device status',
      details: error.message
    });
  }
});

// Get device status
router.get('/device/:deviceId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { deviceId } = req.params;
    
    // TODO: Implement when models are available
    // Mock device status for now
    const deviceStatus = {
      deviceId,
      userId,
      isOnline: true,
      lastSeen: new Date(),
      batteryLevel: 85,
      signalStrength: -45
    };
    
    res.json({
      success: true,
      data: deviceStatus
    });
    
  } catch (error) {
    logger.error('Get device status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get device status',
      details: error.message
    });
  }
});

// Helper function to calculate battery level percentage
function calculateBatteryLevel(voltage) {
  // Typical Li-ion battery: 4.2V (100%) to 3.0V (0%)
  const maxVoltage = 4.2;
  const minVoltage = 3.0;
  
  if (voltage >= maxVoltage) return 100;
  if (voltage <= minVoltage) return 0;
  
  return Math.round(((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100);
}

export default router;
