import express from 'express';
import authenticateToken from '../middleware/authenticateToken.js';
import { body, validationResult } from 'express-validator';
import logger from '../utils/logger.js';

// For future implementation: 
// import ActivitySession from '../models/ActivitySession.js';
// import RideData from '../models/RideData.js';

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
    // const rideData = new RideData({
    //   userId,
    //   speed,
    //   distance,
    //   power,
    //   avgPower,
    //   maxPower,
    //   voltage,
    //   sessionTime,
    //   state,
    //   timestamp: new Date(timestamp),
    //   source: 'esp32'
    // });
    // await rideData.save();

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

// POST /api/esp32/session - Complete session data from ESP32
router.post('/session', authenticateToken, validateSessionData, async (req, res) => {
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
      sessionId,
      distanceKm,
      durationSeconds,
      averageSpeed,
      maxSpeed,
      averageWatts,
      maxWatts,
      startTime,
      endTime
    } = req.body;

    const userId = req.user.id;

    logger.info('ESP32 session completed', {
      userId,
      sessionId,
      distanceKm,
      durationSeconds,
      averageSpeed,
      maxSpeed
    });

    // Calculate calories burned (rough estimate)
    const caloriesBurned = Math.round(averageWatts * (durationSeconds / 3600) * 3.6);

    // TODO: Store complete session when models are ready
    // const session = new ActivitySession({
    //   userId,
    //   sessionId,
    //   type: 'cycling',
    //   distanceKm,
    //   durationSeconds,
    //   averageSpeed,
    //   maxSpeed,
    //   averageWatts,
    //   maxWatts,
    //   caloriesBurned,
    //   startTime: new Date(startTime),
    //   endTime: new Date(endTime),
    //   source: 'esp32'
    // });
    // await session.save();

    res.status(201).json({
      success: true,
      message: 'Session data saved successfully',
      data: {
        sessionId,
        userId,
        summary: {
          distanceKm,
          durationMinutes: Math.round(durationSeconds / 60),
          averageSpeed,
          maxSpeed,
          averageWatts,
          maxWatts,
          estimatedCalories: caloriesBurned
        },
        completedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error processing ESP32 session data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process session data',
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
    // const sessions = await ActivitySession.find({ userId, source: 'esp32' })
    //   .sort({ endTime: -1 })
    //   .limit(parseInt(limit))
    //   .skip(parseInt(offset));

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

export default router;
