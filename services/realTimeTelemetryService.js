import { WebSocketServer } from 'ws';
// import { createClient } from 'redis'; // Temporarily disabled
import { Telemetry, RideSession, ESP32Device } from '../models/Telemetry.js';
import logger from '../utils/logger.js';

class RealTimeTelemetryService {
  constructor() {
    this.wss = null;
    this.redisClient = null; // Will be null when Redis is disabled
    this.subscribers = new Map();
    this.activeDevices = new Set();
    this.telemetryBuffer = new Map();
    this.bufferFlushInterval = 5000; // 5 seconds
    this.maxBufferSize = 100;
    this.isInitialized = false;
  }

  async initialize(server) {
    if (this.isInitialized) {
      logger.warn('Real-time telemetry service already initialized');
      return;
    }

    try {
      // Initialize WebSocket server
      this.wss = new WebSocketServer({ 
        server,
        path: '/ws/telemetry',
        verifyClient: this.verifyClient.bind(this)
      });

      // Initialize Redis pub/sub (temporarily disabled)
      /*
      try {
        this.redisClient = createClient({
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD,
          retryDelayOnFailover: 100,
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
        });

        this.redisClient.on('error', (err) => {
          logger.warn('Redis connection error (telemetry will work without Redis):', err.message);
        });

        await this.redisClient.connect();
        logger.info('Redis connected for real-time telemetry');
      } catch (redisError) {
        logger.warn('Redis not available, using in-memory pub/sub:', redisError.message);
        this.redisClient = null;
      }
      */
      this.redisClient = null; // Redis temporarily disabled
      logger.info('Real-time telemetry service initialized without Redis');
      
      // Setup WebSocket event handlers
      this.setupWebSocketHandlers();
      
      // Start buffer flush interval
      this.startBufferFlush();
      
      this.isInitialized = true;
      logger.info('Real-time telemetry service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize telemetry service:', error);
      throw error;
    }
  }

  verifyClient(info) {
    // TODO: Implement JWT token verification from WebSocket headers
    const token = info.req.headers.authorization || info.req.url.split('token=')[1];
    if (!token) {
      logger.warn('WebSocket connection rejected: No token provided');
      return false;
    }
    return true; // For now, allow all connections with tokens
  }

  setupWebSocketHandlers() {
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      ws.clientId = clientId;
      ws.isAlive = true;
      
      logger.info(`WebSocket client connected: ${clientId}`);

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleWebSocketMessage(ws, data);
        } catch (error) {
          logger.error(`WebSocket message error for client ${clientId}:`, error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      ws.on('close', () => {
        this.handleClientDisconnect(ws);
        logger.info(`WebSocket client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}:`, error);
      });

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Send initial connection success message
      ws.send(JSON.stringify({
        type: 'connection',
        clientId: clientId,
        timestamp: new Date().toISOString(),
        message: 'Connected to real-time telemetry service'
      }));
    });

    // Heartbeat to detect broken connections
    const heartbeat = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(heartbeat);
    });
  }

  async handleWebSocketMessage(ws, data) {
    switch (data.type) {
      case 'subscribe':
        await this.handleSubscription(ws, data);
        break;
      case 'unsubscribe':
        await this.handleUnsubscription(ws, data);
        break;
      case 'telemetry':
        await this.processTelemetryData(data);
        break;
      case 'ping':
        ws.send(JSON.stringify({ 
          type: 'pong', 
          timestamp: new Date().toISOString() 
        }));
        break;
      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${data.type}`
        }));
    }
  }

  async handleSubscription(ws, data) {
    const { deviceId, sessionId, userId } = data;
    
    try {
      // Verify user has access to this device
      const device = await ESP32Device.findOne({ 
        deviceId, 
        userId: userId || ws.userId 
      });
      
      if (!device) {
        ws.send(JSON.stringify({
          type: 'subscription_error',
          message: 'Device not found or access denied'
        }));
        return;
      }

      // Add subscription
      const subscriptionKey = `${deviceId}:${sessionId || 'live'}`;
      if (!this.subscribers.has(subscriptionKey)) {
        this.subscribers.set(subscriptionKey, new Set());
      }
      this.subscribers.get(subscriptionKey).add(ws);

      // Subscribe to Redis channel if available
      if (this.redisClient) {
        try {
          await this.redisClient.subscribe(`telemetry:${deviceId}`);
        } catch (redisError) {
          logger.warn('Redis subscription failed:', redisError.message);
        }
      }

      ws.send(JSON.stringify({
        type: 'subscription_success',
        deviceId,
        sessionId: sessionId || null,
        timestamp: new Date().toISOString()
      }));

      logger.info(`Client ${ws.clientId} subscribed to device ${deviceId}`);
    } catch (error) {
      logger.error('Subscription error:', error);
      ws.send(JSON.stringify({
        type: 'subscription_error',
        message: 'Failed to subscribe to device'
      }));
    }
  }

  async handleUnsubscription(ws, data) {
    const { deviceId, sessionId } = data;
    const subscriptionKey = `${deviceId}:${sessionId || 'live'}`;
    
    if (this.subscribers.has(subscriptionKey)) {
      this.subscribers.get(subscriptionKey).delete(ws);
      if (this.subscribers.get(subscriptionKey).size === 0) {
        this.subscribers.delete(subscriptionKey);
        
        // Unsubscribe from Redis if available
        if (this.redisClient) {
          try {
            await this.redisClient.unsubscribe(`telemetry:${deviceId}`);
          } catch (redisError) {
            logger.warn('Redis unsubscription failed:', redisError.message);
          }
        }
      }
    }

    ws.send(JSON.stringify({
      type: 'unsubscription_success',
      deviceId,
      sessionId: sessionId || null,
      timestamp: new Date().toISOString()
    }));
  }

  async processTelemetryData(data) {
    try {
      const { deviceId, sessionId, metrics, battery, timestamp } = data;

      // Validate required fields
      if (!deviceId || !metrics) {
        throw new Error('Missing required fields: deviceId, metrics');
      }

      // Create telemetry document
      const telemetryData = {
        deviceId,
        sessionId: sessionId || `auto_${Date.now()}`,
        metrics: {
          speed: parseFloat(metrics.speed) || 0,
          distance: parseFloat(metrics.distance) || 0,
          sessionTime: parseInt(metrics.sessionTime) || 0,
          watts: parseFloat(metrics.watts) || 0,
          pulseCount: parseInt(metrics.pulseCount) || 0
        },
        battery: {
          voltage: parseFloat(battery?.voltage) || 0,
          level: parseInt(battery?.level) || 0
        },
        workoutActive: data.workoutActive || false,
        rawData: data.rawData || data,
        timestamp: timestamp ? new Date(timestamp) : new Date()
      };

      // Add to buffer for batch processing
      this.addToBuffer(deviceId, telemetryData);

      // Publish to Redis and WebSocket subscribers
      await this.publishTelemetry(deviceId, telemetryData);

      // Update device status
      this.activeDevices.add(deviceId);

      logger.debug(`Processed telemetry for device ${deviceId}`);
    } catch (error) {
      logger.error('Error processing telemetry data:', error);
      throw error;
    }
  }

  addToBuffer(deviceId, telemetryData) {
    if (!this.telemetryBuffer.has(deviceId)) {
      this.telemetryBuffer.set(deviceId, []);
    }

    const buffer = this.telemetryBuffer.get(deviceId);
    buffer.push(telemetryData);

    // If buffer is full, flush immediately
    if (buffer.length >= this.maxBufferSize) {
      this.flushBuffer(deviceId);
    }
  }

  async flushBuffer(deviceId) {
    const buffer = this.telemetryBuffer.get(deviceId);
    if (!buffer || buffer.length === 0) return;

    try {
      // Batch insert to MongoDB
      await Telemetry.insertMany(buffer);
      logger.debug(`Flushed ${buffer.length} telemetry records for device ${deviceId}`);
      
      // Clear buffer
      this.telemetryBuffer.set(deviceId, []);
    } catch (error) {
      logger.error(`Error flushing buffer for device ${deviceId}:`, error);
    }
  }

  startBufferFlush() {
    setInterval(() => {
      for (const deviceId of this.telemetryBuffer.keys()) {
        this.flushBuffer(deviceId);
      }
    }, this.bufferFlushInterval);
  }

  async publishTelemetry(deviceId, data) {
    try {
      const message = JSON.stringify({
        ...data,
        processedAt: Date.now()
      });

      // Publish to Redis if available
      if (this.redisClient) {
        try {
          await this.redisClient.publish(`telemetry:${deviceId}`, message);
        } catch (redisError) {
          logger.warn('Redis publish failed:', redisError.message);
        }
      }

      // Broadcast to WebSocket subscribers
      const subscriptionKey = `${deviceId}:live`;
      if (this.subscribers.has(subscriptionKey)) {
        const subscribers = this.subscribers.get(subscriptionKey);
        const payload = JSON.stringify({
          type: 'telemetry_data',
          deviceId,
          data: data.metrics,
          battery: data.battery,
          workoutActive: data.workoutActive,
          timestamp: data.timestamp
        });

        subscribers.forEach(ws => {
          if (ws.readyState === ws.OPEN) {
            ws.send(payload);
          }
        });
      }
    } catch (error) {
      logger.error('Error publishing telemetry:', error);
    }
  }

  handleClientDisconnect(ws) {
    // Remove client from all subscriptions
    for (const [key, subscribers] of this.subscribers.entries()) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.subscribers.delete(key);
      }
    }
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getDeviceStatus(deviceId) {
    try {
      const latestTelemetry = await Telemetry.findOne({ deviceId })
        .sort({ timestamp: -1 })
        .lean();

      const device = await ESP32Device.findOne({ deviceId }).lean();

      return {
        deviceId,
        online: this.activeDevices.has(deviceId),
        lastSeen: latestTelemetry?.timestamp || device?.lastSeen,
        firmwareVersion: device?.firmwareVersion || 'unknown',
        battery: latestTelemetry?.battery || null,
        currentMetrics: latestTelemetry?.metrics || null
      };
    } catch (error) {
      logger.error(`Error getting device status for ${deviceId}:`, error);
      throw error;
    }
  }

  async getActiveDevices() {
    return Array.from(this.activeDevices);
  }

  async shutdown() {
    try {
      // Flush all buffers
      for (const deviceId of this.telemetryBuffer.keys()) {
        await this.flushBuffer(deviceId);
      }

      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
      }

      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      logger.info('Real-time telemetry service shut down successfully');
    } catch (error) {
      logger.error('Error during telemetry service shutdown:', error);
    }
  }
}

export default RealTimeTelemetryService;