import express from 'express';
<<<<<<< HEAD
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
=======
import { Telemetry, RideSession, ESP32Device } from '../models/Telemetry.js';
import User from '../models/User.js';
import CyclingPlan from '../models/CyclingPlan.js';
import { calculateCyclingCalories } from '../services/calorieService.js';
import authenticateToken from '../middleware/authenticateToken.js';
import logger from '../utils/logger.js';

const router = express.Router();

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
    
    // Check if device already exists
    let device = await ESP32Device.findOne({ deviceId });
    
    if (device) {
      // Update existing device
      device.userId = userId;
      device.deviceName = deviceName || device.deviceName;
      device.firmwareVersion = firmwareVersion || device.firmwareVersion;
      device.lastSeen = new Date();
      device.isActive = true;
    } else {
      // Create new device
      device = new ESP32Device({
        deviceId,
        userId,
        deviceName: deviceName || 'SIKAD-VOLTZ',
        firmwareVersion: firmwareVersion || '1.0.0',
        lastSeen: new Date(),
        isActive: true
      });
    }
    
    await device.save();
    
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
>>>>>>> 3410dad17cf9e63a2af42968b7a6cf5a10666b70
      details: error.message
    });
  }
});

<<<<<<< HEAD
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
=======
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
    
    // Verify device belongs to user
    const device = await ESP32Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found or not authorized'
      });
    }
    
    // Check for existing active sessions
    const activeSessions = await RideSession.getUserActiveSessions(userId);
    if (activeSessions.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'You already have an active session. Please end it first.',
        activeSession: activeSessions[0].sessionId
      });
    }
    
    // Create new session
    const session = await RideSession.createNewSession(userId, deviceId);
    
    // Update device stats
    device.lastSeen = new Date();
    device.totalSessions += 1;
    await device.save();
    
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
>>>>>>> 3410dad17cf9e63a2af42968b7a6cf5a10666b70
      details: error.message
    });
  }
});

<<<<<<< HEAD
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
=======
// Receive telemetry data from ESP32
router.post('/telemetry', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { deviceId, sessionId, data } = req.body;
    
    // Enhanced debug logging - Step 1: Request received
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
    
    // Enhanced debug logging - Step 2: Validating device
    logger.debug(`🔍 Looking up device: ${deviceId} for user: ${userId}`);
    
    // Verify device and session
    const device = await ESP32Device.findOne({ deviceId, userId });
    if (!device) {
      logger.error(`🚫 Device not found or unauthorized`, { deviceId, userId });
      return res.status(404).json({
        success: false,
        error: 'Device not found or not authorized'
      });
    }
    
    logger.info(`✅ Device verified: ${device.deviceName}`);
    
    // Enhanced debug logging - Step 3: Session lookup
    let session = null;
    if (sessionId) {
      session = await RideSession.findOne({ sessionId, userId });
      logger.debug(`🎯 Session lookup: ${sessionId} -> ${session ? 'Found' : 'Not found'}`);
    }
    
    // Enhanced debug logging - Step 4: Data parsing
    const parsedMetrics = {
      speed: parseFloat(data.speed) || 0,
      distance: parseFloat(data.distance) || 0,
      sessionTime: parseInt(data.time) || 0,
      watts: parseFloat(data.watts) || 0,
      pulseCount: parseInt(data.pulses) || 0
    };
    
    logger.info(`📊 Parsed Reed Switch Metrics:`, {
      raw: { speed: data.speed, distance: data.distance, watts: data.watts, pulses: data.pulses },
      parsed: parsedMetrics,
      batteryVoltage: parseFloat(data.battery) || 0,
      workoutActive: data.active === true || data.active === 'true'
    });
    
    // Create telemetry record
    const telemetryData = {
      deviceId,
      userId,
      sessionId: sessionId || `auto_${Date.now()}`,
      metrics: parsedMetrics,
      battery: {
        voltage: parseFloat(data.battery) || 0,
        level: calculateBatteryLevel(parseFloat(data.battery) || 0)
      },
      workoutActive: data.active === true || data.active === 'true',
      rawData: data,
      timestamp: new Date()
    };
    
    // Enhanced debug logging - Step 5: Database save
    logger.debug(`💾 Saving telemetry to database...`);
    
    // Save telemetry
    const telemetry = new Telemetry(telemetryData);
    await telemetry.save();
    
    logger.info(`✅ Telemetry saved to database`, { 
      telemetryId: telemetry._id,
      metrics: telemetryData.metrics,
      sessionId: telemetryData.sessionId
    });
    
    // Enhanced debug logging - Step 6: Session update
    if (session) {
      logger.debug(`🔄 Updating session metrics for session: ${sessionId}`);
      await session.updateMetrics(telemetryData);
      logger.info(`✅ Session metrics updated`);
    } else {
      logger.debug(`ℹ️ No active session to update`);
    }
    
    // Enhanced debug logging - Step 7: Device update
    logger.debug(`📱 Updating device last seen timestamp`);
    device.lastSeen = new Date();
    await device.save();
    
    // Enhanced debug logging - Step 8: Real-time publishing
    const telemetryService = req.app.locals.telemetryService;
    if (telemetryService) {
      try {
        logger.debug(`📡 Publishing to WebSocket service...`);
        await telemetryService.publishTelemetry(deviceId, {
          type: 'telemetry',
          deviceId: deviceId,
          userId: userId,
          sessionId: telemetryData.sessionId,
          data: telemetryData,
          timestamp: telemetryData.timestamp
        });
        logger.info(`🚀 SUCCESS: Real-time telemetry published for device ${deviceId}`, {
          webSocketSubscribers: 'active',
          dataFlow: 'ESP32 → Backend → Database → WebSocket → UI'
        });
      } catch (publishError) {
        logger.error('❌ WebSocket publish failed:', publishError.message);
      }
    } else {
      logger.warn('⚠️ Telemetry service not available for real-time publishing');
    }
    
    // Enhanced debug logging - Step 9: Success response
    logger.info(`🎉 ESP32 Telemetry Processing Complete`, {
      deviceId,
      userId,
      sessionId: telemetryData.sessionId,
      kph: telemetryData.metrics.speed,
      distance: telemetryData.metrics.distance,
      watts: telemetryData.metrics.watts,
      pulseCount: telemetryData.metrics.pulseCount,
      dataFlowStatus: 'SUCCESS'
    });
    
    res.json({
      success: true,
      message: 'Telemetry data received and processed',
      sessionActive: session?.status === 'active',
      debug: {
        savedToDatabase: true,
        publishedToWebSocket: !!telemetryService,
        sessionUpdated: !!session,
        metrics: telemetryData.metrics
      }
    });
    
  } catch (error) {
    logger.error('Telemetry processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process telemetry data',
>>>>>>> 3410dad17cf9e63a2af42968b7a6cf5a10666b70
      details: error.message
    });
  }
});

<<<<<<< HEAD
export default router;
=======
// End ride session and calculate calories
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
    
    // Get session data
    const session = await RideSession.findOne({ sessionId, userId });
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    // Get user for calorie calculation
    const user = await User.findById(userId).select('profile');
    if (!user || !user.profile) {
      return res.status(400).json({
        success: false,
        error: 'User profile required for calorie calculation'
      });
    }
    
    // Calculate session metrics
    const sessionData = await Telemetry.getSessionData(sessionId);
    let maxSpeed = 0, avgSpeed = 0, maxPower = 0, avgPower = 0;
    
    if (sessionData.length > 0) {
      const speeds = sessionData.map(d => d.metrics.speed || 0).filter(s => s > 0);
      const powers = sessionData.map(d => d.metrics.watts || 0).filter(p => p > 0);
      
      maxSpeed = speeds.length > 0 ? Math.max(...speeds) : session.maxSpeed;
      avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : session.avgSpeed;
      maxPower = powers.length > 0 ? Math.max(...powers) : session.maxPower;
      avgPower = powers.length > 0 ? powers.reduce((a, b) => a + b, 0) / powers.length : session.avgPower;
    }
    
    // Calculate calories burned
    const durationHours = session.actualHours || (session.duration / 3600);
    const caloriesBurned = calculateCyclingCalories(
      user.profile.weight,
      durationHours,
      'moderate' // Could be determined by average power/speed
    );
    
    // Complete session
    const finalMetrics = {
      distance: session.totalDistance,
      maxSpeed,
      avgSpeed,
      calories: Math.round(caloriesBurned),
      avgPower,
      maxPower
    };
    
    const completedSession = await RideSession.completeSession(sessionId, finalMetrics);
    
    // Add to user activity log
    const activity = {
      type: 'cycling',
      duration: Math.round(durationHours * 60), // minutes
      intensity: avgPower > 200 ? 'vigorous' : (avgPower > 100 ? 'moderate' : 'light'),
      distance: session.totalDistance,
      calories: Math.round(caloriesBurned),
      date: session.startTime,
      sessionId: sessionId,
      deviceId: deviceId
    };
    
    user.activityLog = user.activityLog || [];
    user.activityLog.push(activity);
    await user.save();
    
    // Update cycling plan if user has active plan
    const activePlan = await CyclingPlan.findOne({ 
      user: userId, 
      isActive: true 
    });
    
    if (activePlan) {
      // Find today's session in the plan
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todaysSession = activePlan.dailySessions.find(s => {
        const sessionDate = new Date(s.date);
        sessionDate.setHours(0, 0, 0, 0);
        return sessionDate.getTime() === today.getTime() && s.status === 'pending';
      });
      
      if (todaysSession) {
        todaysSession.completedHours += durationHours;
        todaysSession.caloriesBurned += Math.round(caloriesBurned);
        
        // Check if session is completed
        const requiredHours = todaysSession.plannedHours + (todaysSession.adjustedHours || 0);
        if (todaysSession.completedHours >= requiredHours) {
          todaysSession.status = 'completed';
        }
        
        await activePlan.save();
      }
    }
    
    // Update device stats
    if (deviceId) {
      const device = await ESP32Device.findOne({ deviceId, userId });
      if (device) {
        device.totalDistance += session.totalDistance;
        device.totalTime += session.duration;
        await device.save();
      }
    }
    
    logger.info(`Session completed: ${sessionId}, Distance: ${session.totalDistance}km, Calories: ${caloriesBurned}`);
    
    res.json({
      success: true,
      data: {
        session: completedSession,
        activity: activity,
        planUpdated: !!activePlan
      },
      message: 'Session completed and calories logged successfully'
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

// Get session history
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { limit = 10, page = 1, status } = req.query;
    
    const query = { userId };
    if (status) {
      query.status = status;
    }
    
    const sessions = await RideSession.find(query)
      .sort({ startTime: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('planId', 'goal plannedHours');
    
    const total = await RideSession.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        sessions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
    
  } catch (error) {
    logger.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sessions',
      details: error.message
    });
  }
});

// Get device status
router.get('/device/:deviceId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { deviceId } = req.params;
    
    const device = await ESP32Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    // Get recent telemetry
    const recentData = await Telemetry.findOne({ deviceId, userId })
      .sort({ timestamp: -1 });
    
    // Get active session
    const activeSession = await RideSession.findOne({ 
      deviceId, 
      userId, 
      status: 'active' 
    });
    
    res.json({
      success: true,
      data: {
        device,
        recentData,
        activeSession,
        isOnline: device.lastSeen > new Date(Date.now() - 5 * 60 * 1000) // 5 minutes
      }
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
>>>>>>> 3410dad17cf9e63a2af42968b7a6cf5a10666b70
