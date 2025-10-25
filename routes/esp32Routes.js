import express from 'express';
import authenticateToken from '../middleware/authenticateToken.js';
import { body, validationResult } from 'express-validator';
import logger from '../utils/logger.js';

// Import models
import { Telemetry, RideSession, ESP32Device } from '../models/Telemetry.js';
import User from '../models/User.js';
import CyclingPlan from '../models/CyclingPlan.js';
import { calculateCyclingCalories } from '../services/calorieService.js';

const router = express.Router();

// Validation middleware
const validateRideData = [
  body('speed').isFloat({ min: 0 }).withMessage('Speed must be a positive number'),
  body('distance').isFloat({ min: 0 }).withMessage('Distance must be a positive number'),
  body('power').isFloat({ min: 0 }).withMessage('Power must be a positive number'),
  body('voltage').isFloat({ min: 0 }).withMessage('Voltage must be a positive number'),
  body('sessionTime').isInt({ min: 0 }).withMessage('Session time must be a positive integer'),
  body('timestamp').isInt({ min: 0 }).withMessage('Timestamp must be a positive integer'),
  body('intensity').optional().isInt({ min: 0, max: 4 }).withMessage('Intensity must be between 0-4')
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
      intensity = 2, // Default to light cycling if not provided
      timestamp
    } = req.body;

    const userId = req.user?.userId;

    // Log the received data with intensity
    logger.info('ESP32 ride data received', {
      userId,
      speed,
      distance,
      power,
      sessionTime,
      state,
      intensity
    });

    // STORE DATA: Save telemetry data to database
    try {
      // Get or create device registration
      let device = await ESP32Device.findOne({ deviceId: req.body.deviceId || 'DEFAULT_DEVICE', userId });
      if (!device) {
        device = await ESP32Device.create({
          deviceId: req.body.deviceId || 'DEFAULT_DEVICE',
          userId,
          deviceName: 'SIKAD-VOLTZ',
          lastSeen: new Date()
        });
        logger.info('New ESP32 device registered', { deviceId: device.deviceId, userId });
      } else {
        device.lastSeen = new Date();
        await device.save();
      }

      // Get or create active ride session
      let session = await RideSession.findOne({
        userId,
        deviceId: device.deviceId,
        status: 'active'
      });

      if (!session && state === 'active') {
        // Create new session
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // ========== DATA FLOW FIX: Link session to goal (Issue #4) ==========
        // Find active plan to get goalId
        let goalId = null;
        let planId = null;
        
        try {
          const activePlan = await CyclingPlan.findOne({
            user: userId,
            isActive: true
          }).select('_id goal');
          
          if (activePlan) {
            planId = activePlan._id;
            goalId = activePlan.goal;
            logger.info('🔗 Linking session to plan and goal', { 
              sessionId, 
              planId: planId?.toString(), 
              goalId: goalId?.toString() 
            });
          } else {
            logger.warn('⚠️ No active plan found, session will not be linked to goal', { userId });
          }
        } catch (planError) {
          logger.error('Error finding active plan for session:', planError);
        }
        // ========== END DATA FLOW FIX ==========
        
        session = await RideSession.create({
          userId,
          deviceId: device.deviceId,
          sessionId,
          startTime: new Date(),
          status: 'active',
          planId, // Link to plan
          goalId  // ✅ NEW: Link to goal for progress tracking
        });
        logger.info('✅ New ride session created', { sessionId, userId, planId, goalId });
      }

      // Store telemetry data point
      if (session) {
        const telemetry = await Telemetry.create({
          deviceId: device.deviceId,
          userId,
          sessionId: session.sessionId,
          metrics: {
            speed,
            distance,
            sessionTime,
            watts: power,
            pulseCount: 0
          },
          battery: {
            voltage,
            level: 0
          },
          workoutActive: state === 'active',
          rawData: req.body,
          timestamp: new Date(timestamp || Date.now())
        });

        // Update session metrics in real-time
        await session.updateMetrics(telemetry);

        // Calculate calories burned
        const user = await User.findById(userId);
        if (user) {
          const caloriesBurned = calculateCyclingCalories({
            weight: user.weight || 70,
            duration: sessionTime / 60, // Convert seconds to minutes
            avgSpeed: speed,
            intensity: intensity || 2
          });
          
          session.totalCalories = caloriesBurned;
          await session.save();
        }

        // Update device statistics
        device.totalSessions = await RideSession.countDocuments({ 
          deviceId: device.deviceId, 
          status: { $in: ['completed', 'active'] } 
        });
        device.totalDistance += (distance - (session.totalDistance || 0));
        device.totalTime = sessionTime;
        await device.save();

        logger.info(' Telemetry data stored', {
          sessionId: session.sessionId,
          speed,
          distance,
          calories: session.totalCalories
        });

        res.status(201).json({
          success: true,
          message: 'Ride data received and stored successfully',
          data: {
            userId,
            sessionId: session.sessionId,
            receivedAt: new Date().toISOString(),
            metrics: {
              speed,
              distance,
              power,
              avgPower,
              maxPower,
              voltage,
              sessionTime,
              state,
              intensity,
              calories: session.totalCalories
            },
            session: {
              totalDistance: session.totalDistance,
              maxSpeed: session.maxSpeed,
              avgSpeed: session.avgSpeed,
              duration: session.duration
            }
          }
        });
      } else {
        // Session ended but still receiving data - acknowledge but don't store
        res.status(200).json({
          success: true,
          message: 'Ride data received (no active session)',
          data: { userId, state }
        });
      }
    } catch (dbError) {
      logger.error(' Database error storing ride data:', dbError);
      // Still return success to ESP32 to avoid blocking cycling
      res.status(201).json({
        success: true,
        message: 'Ride data received (storage pending)',
        warning: 'Data queued for retry',
        data: { userId }
      });
    }

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
    logger.info(` ESP32 Telemetry Received`, {
      userId,
      deviceId,
      sessionId,
      rawData: data,
      timestamp: new Date().toISOString()
    });
    
    if (!deviceId || !data) {
      logger.warn(` Missing required fields`, { deviceId: !!deviceId, data: !!data });
      return res.status(400).json({
        success: false,
        error: 'Device ID and data are required'
      });
    }

    // **NEW**: Handle enhanced firmware data structure
    const telemetryData = {
      speed: parseFloat(data.speed) || 0,
      distance: parseFloat(data.distance) || 0,
      cadence: parseFloat(data.cadence) || 0,
      power: parseFloat(data.power) || 0,
      voltage: parseFloat(data.voltage) || 0,
      intensity: parseInt(data.intensity) || 0,
      gear_ratio: parseFloat(data.gear_ratio) || 4.33,
      // **NEW FIELDS** from firmware update
      session_status: data.session_status || 'IDLE',
      auto_session: data.auto_session === 'true' || data.auto_session === true,
      session_duration: parseInt(data.session_duration) || 0,
      cloud: data.cloud === 'true' || data.cloud === true
    };
    
    logger.info(` Enhanced Telemetry Data:`, {
      metrics: telemetryData,
      autoSession: telemetryData.auto_session,
      sessionStatus: telemetryData.session_status,
      sessionDuration: telemetryData.session_duration
    });

    // **NEW**: Auto-session management - only update if session is active
    const isSessionActive = telemetryData.session_status === 'IN_PROGRESS' || 
                           telemetryData.session_status === 'PAUSED';
    
    if (isSessionActive && telemetryData.auto_session) {
      try {
        const updateResponse = await fetch(`${req.protocol}://${req.get('host')}/api/plans/update-session-progress-realtime`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.authorization
          },
          body: JSON.stringify({
            distance: telemetryData.distance,
            speed: telemetryData.speed,
            sessionTime: telemetryData.session_duration,
            watts: telemetryData.power,
            voltage: telemetryData.voltage,
            intensity: telemetryData.intensity,
            cadence: telemetryData.cadence,
            sessionStatus: telemetryData.session_status,
            autoSession: telemetryData.auto_session
          })
        });
        
        const updateResult = await updateResponse.json();
        
        if (updateResult.success) {
          logger.info(`Auto-session progress updated`, updateResult.data);
        } else {
          logger.info(` Session update response:`, updateResult.message);
        }
        
      } catch (updateError) {
        logger.error(' Error updating auto-session progress:', updateError.message);
      }
    }

    // Publish to real-time service if available
    const telemetryService = req.app.locals.telemetryService;
    if (telemetryService) {
      try {
        telemetryService.processTelemetryData(userId, deviceId, telemetryData);
      } catch (serviceError) {
        logger.error(' Telemetry service error:', serviceError);
      }
    }

    res.json({
      success: true,
      message: 'Telemetry received and processed',
      data: {
        processed: telemetryData,
        sessionActive: isSessionActive,
        autoSession: telemetryData.auto_session,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('ESP32 telemetry error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process telemetry',
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
    const userId = req.user?.userId;
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
    const userId = req.user?.userId;

    logger.info('ESP32 device status update', {
      userId,
      deviceId,
      status,
      batteryLevel,
      signalStrength
    });

    // STORE DEVICE STATUS: Update device in database
    let device = await ESP32Device.findOne({ deviceId, userId });
    
    if (!device) {
      // Create new device if not exists
      device = await ESP32Device.create({
        deviceId,
        userId,
        deviceName: 'SIKAD-VOLTZ',
        lastSeen: new Date(),
        isActive: status === 'connected'
      });
      logger.info('New device registered via status update', { deviceId, userId });
    } else {
      // Update existing device
      device.lastSeen = new Date();
      device.isActive = status === 'connected';
      await device.save();
      logger.info('Device status updated', { deviceId, status });
    }
    
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

// POST /api/esp32/session/end - End active session
router.post('/session/end', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { sessionId, finalMetrics } = req.body;

    let session;
    
    if (sessionId) {
      // End specific session
      session = await RideSession.findOne({ sessionId, userId });
    } else {
      // End any active session for this user
      session = await RideSession.findOne({ userId, status: 'active' });
    }

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'No active session found'
      });
    }

    // Complete the session in RideSession collection
    await RideSession.completeSession(session.sessionId, finalMetrics);

    // Get updated session with final metrics
    const completedSession = await RideSession.findOne({ sessionId: session.sessionId });
    
    // 🔥 CRITICAL FIX: Also update CyclingPlan to link ESP32 workout with daily session
    try {
      const SessionTrackerService = (await import('../services/session_tracker_service.js')).default;
      await SessionTrackerService.completeSession(userId, {
        sessionId: completedSession.sessionId,
        finalCalories: completedSession.totalCalories || 0,
        finalHours: (completedSession.duration || 0) / 60, // Convert minutes to hours
        finalDistance: completedSession.totalDistance || 0
      });
      logger.info('✅ Linked ESP32 session to cycling plan', { sessionId: completedSession.sessionId });
    } catch (linkError) {
      // Don't fail the request if linking fails - session is still saved
      logger.warn('⚠️ Failed to link ESP32 session to plan (non-critical)', { error: linkError.message });
    }

    logger.info('Session completed', {
      sessionId: session.sessionId,
      duration: completedSession.duration,
      distance: completedSession.totalDistance,
      calories: completedSession.totalCalories
    });

    res.status(200).json({
      success: true,
      message: 'Session completed successfully',
      data: {
        sessionId: completedSession.sessionId,
        duration: completedSession.duration,
        totalDistance: completedSession.totalDistance,
        totalCalories: completedSession.totalCalories,
        avgSpeed: completedSession.avgSpeed,
        maxSpeed: completedSession.maxSpeed
      }
    });

  } catch (error) {
    logger.error('Error ending session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end session',
      details: error.message
    });
  }
});

// GET /api/esp32/analytics - Get user's cycling analytics for charts
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { period = 'week' } = req.query; // week, month, year

    // Calculate date range
    const now = new Date();
    let startDate;
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get completed sessions in date range
    const sessions = await RideSession.find({
      userId,
      status: 'completed',
      startTime: { $gte: startDate }
    }).sort({ startTime: 1 });

    // Calculate aggregated statistics
    const totalDistance = sessions.reduce((sum, s) => sum + (s.totalDistance || 0), 0);
    const totalCalories = sessions.reduce((sum, s) => sum + (s.totalCalories || 0), 0);
    const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const avgSpeed = sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + (s.avgSpeed || 0), 0) / sessions.length 
      : 0;

    // Group by day for chart data
    const dailyData = {};
    sessions.forEach(session => {
      const day = session.startTime.toISOString().split('T')[0];
      if (!dailyData[day]) {
        dailyData[day] = {
          date: day,
          distance: 0,
          calories: 0,
          duration: 0,
          sessions: 0
        };
      }
      dailyData[day].distance += session.totalDistance || 0;
      dailyData[day].calories += session.totalCalories || 0;
      dailyData[day].duration += session.duration || 0;
      dailyData[day].sessions += 1;
    });

    const chartData = Object.values(dailyData).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    logger.info(' Analytics retrieved', { 
      userId, 
      period, 
      totalSessions: sessions.length,
      totalDistance: totalDistance.toFixed(2)
    });

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalSessions: sessions.length,
          totalDistance: parseFloat(totalDistance.toFixed(2)),
          totalCalories: Math.round(totalCalories),
          totalDuration: Math.round(totalDuration),
          avgSpeed: parseFloat(avgSpeed.toFixed(2))
        },
        chartData,
        sessions: sessions.slice(-10).map(s => ({
          sessionId: s.sessionId,
          date: s.startTime,
          distance: s.totalDistance,
          calories: s.totalCalories,
          duration: s.duration,
          avgSpeed: s.avgSpeed,
          maxSpeed: s.maxSpeed
        }))
      }
    });

  } catch (error) {
    logger.error('Error retrieving analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve analytics',
      details: error.message
    });
  }
});

// Get device status
router.get('/device/:deviceId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { deviceId } = req.params;
    
    // RETRIEVE DEVICE: Get device from database
    const device = await ESP32Device.findOne({ deviceId, userId });

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    const deviceStatus = {
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      userId,
      isActive: device.isActive,
      lastSeen: device.lastSeen,
      firmwareVersion: device.firmwareVersion,
      statistics: {
        totalSessions: device.totalSessions,
        totalDistance: device.totalDistance,
        totalTime: device.totalTime
      }
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
