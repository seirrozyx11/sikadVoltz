// 📊 MONITORING: Initialize New Relic APM first (must be first import)
import './newrelic.cjs';

import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';
import compression from 'compression';
import logger from './utils/logger.js';
import environmentValidator from './utils/environmentValidator.js';
import SecurityMiddleware from './middleware/security.js';
import { initWebSocket, getWebSocketService } from './services/websocketService.js';
import esp32BLEBridge from './services/esp32_ble_bridge.js'; // Enabled for real-time ESP32 communication
import HTTP2ServerManager from './services/http2ServerManager.js';

// Import routes
import authRouter from './routes/auth.js';
import planRoutes from './routes/planRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import calorieRoutes from './routes/calorieRoutes.js';
import calorieCalculationRoutes from './routes/calorieCalculationRoutes.js';
import goalsRoutes from './routes/goalsRoutes.js';
import esp32Routes from './routes/esp32Routes.js';
import workoutHistoryRoutes from './routes/workoutHistoryRoutes.js';
import progressRoutes from './routes/progressRoutes.js';
import healthScreeningRoutes from './routes/healthScreeningRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import passwordResetRoutes from './routes/passwordReset.js';
import adminTokenRoutes from './routes/adminTokenRetrieval.js';
import oauthRoutes from './routes/oauth.js';
import testRoutes from './routes/test.js';
import monitoringRoutes from './routes/monitoringRoutes.js';
// Import services
import RealTimeTelemetryService from './services/realTimeTelemetryService.js';
import ScheduledTasksService from './services/scheduledTasksService.js';
import SessionManager from './services/sessionManager.js';

// Environment setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI;
const IS_RENDER = process.env.RENDER; // Render environment detection

// Base URL configuration for WebSocket and API
const BASE_URL = IS_RENDER 
  ? 'https://sikadvoltz-backend.onrender.com'
  : `http://localhost:${PORT}`;

// WebSocket URL configuration  
const WS_BASE_URL = IS_RENDER
  ? 'wss://sikadvoltz-backend.onrender.com'
  : `ws://localhost:${PORT}`;

// 🔒 SECURITY: Validate environment variables before starting server
environmentValidator.validateOrExit();

if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI not defined in environment variables');
  process.exit(1);
}

// PHASE 1 OPTIMIZATION: Enhanced MongoDB connection with pooling
const connectDB = async () => {
  try {
    console.log('Connecting to MongoDB with connection pooling...');
    await mongoose.connect(MONGODB_URI, {
      // REMOVED: Deprecated options
      // useNewUrlParser: true,
      // useUnifiedTopology: true, 
      
      // PHASE 1: Connection pooling for scalability
      maxPoolSize: IS_RENDER ? 20 : 50,        // Max concurrent connections
      minPoolSize: IS_RENDER ? 2 : 5,          // Min connections to maintain
      maxIdleTimeMS: 30000,                    // Close connections after 30s idle
      serverSelectionTimeoutMS: IS_RENDER ? 3000 : 5000,
      socketTimeoutMS: 30000,
      
      // PHASE 1: Performance optimizations  
      bufferCommands: false,                   // Disable buffering for immediate fails
      heartbeatFrequencyMS: 10000,            // Check server health every 10s
    });
    
    logger.info('MongoDB connected successfully');
    console.log('MongoDB connection verified');
    return true;
  } catch (err) {
    logger.error('MongoDB connection failed:', err);
    console.error('MongoDB connection error:', err.message);
    
    if (!IS_RENDER) {
      console.log('Retrying in 5 seconds...');
      setTimeout(connectDB, 5000); // Only retry in non-Render environments
    } else {
      process.exit(1); // Let Render handle restarts
    }
  }
};

// Create Express app
const app = express();

// � CRITICAL FIX: Body parsing MUST come before security middleware
// This is required because rate limiting middleware accesses req.body.email
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// �🔒 SECURITY: Apply all security middleware (helmet, rate limiting, HTTPS enforcement)
// Note: Rate limiting now runs after body parsing
SecurityMiddleware.applyAll(app);

// 🚀 PERFORMANCE: Enable response compression
app.use(compression({
  // Only compress responses that are larger than 1kb
  threshold: 1024,
  // Don't compress responses with this request header
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    // fallback to standard filter function
    return compression.filter(req, res);
  },
  // Compression level (1=fastest, 9=best compression)
  level: 6
}));

// Enhanced CORS configuration
const allowedOrigins = [
  ...(process.env.ALLOWED_ORIGINS?.split(',') || []).map(o => o.trim()),
  BASE_URL, // Use dynamic base URL

].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// PHASE 1 OPTIMIZATION: Enhanced request logging with performance monitoring
app.use(logger.requestLogger);

// PHASE 1: Performance monitoring middleware
app.use((req, res, next) => {
  // Track slow requests
  const timer = logger.performance.startTimer(`${req.method} ${req.originalUrl}`);
  
  res.on('finish', () => {
    const duration = timer.end({
      method: req.method,
      endpoint: req.originalUrl,
      statusCode: res.statusCode,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentLength: res.get('Content-Length')
    });
    
    // Alert on very slow requests
    if (duration > 5000) {
      logger.warn('Very slow request detected', {
        method: req.method,
        endpoint: req.originalUrl,
        duration,
        statusCode: res.statusCode,
        ip: req.ip
      });
    }
  });
  
  next();
});

// PHASE 1: Memory monitoring (every 5 minutes)
setInterval(() => {
  logger.performance.trackMemory();
}, 5 * 60 * 1000);

// 🚀 API VERSIONING: v1 API routes with future-proof structure
const v1Router = express.Router();

// Mount all v1 routes
v1Router.use('/auth', authRouter);
v1Router.use('/password-reset', passwordResetRoutes);
v1Router.use('/plans', planRoutes);
v1Router.use('/calories', calorieRoutes);
v1Router.use('/calorie-calculation', calorieCalculationRoutes);
v1Router.use('/profile', profileRoutes);
v1Router.use('/goals', goalsRoutes);
v1Router.use('/esp32', esp32Routes);
v1Router.use('/workout-history', workoutHistoryRoutes);
v1Router.use('/progress', progressRoutes);
v1Router.use('/health-screening', healthScreeningRoutes); // Fixed duplicate profile route
v1Router.use('/notifications', notificationRoutes);
v1Router.use('/admin', adminTokenRoutes);
v1Router.use('/oauth', oauthRoutes);
v1Router.use('/monitor', monitoringRoutes);

// 🚀 OPTIMIZATION: Ultra-fast unified dashboard endpoint
import dashboardRoutes from './routes/dashboardRoutes.js';
v1Router.use('/dashboard', dashboardRoutes);

// Mount versioned API
app.use('/api/v1', v1Router);

// 🔄 BACKWARD COMPATIBILITY: Legacy routes (deprecated - use /api/v1/)
// Add deprecation warning for legacy routes
const deprecationWarning = (req, res, next) => {
  res.set('X-API-Warning', 'This endpoint is deprecated. Use /api/v1/ instead.');
  logger.warn(`Deprecated API used: ${req.method} ${req.originalUrl}`);
  next();
};

app.use('/api/auth', deprecationWarning, authRouter);
app.use('/api/password-reset', deprecationWarning, passwordResetRoutes);
app.use('/api/plans', deprecationWarning, planRoutes);
app.use('/api/calories', deprecationWarning, calorieRoutes);
app.use('/api/calorie-calculation', deprecationWarning, calorieCalculationRoutes);
app.use('/api/profile', deprecationWarning, profileRoutes);
app.use('/api/goals', deprecationWarning, goalsRoutes);
app.use('/api/esp32', deprecationWarning, esp32Routes);
app.use('/api/workout-history', deprecationWarning, workoutHistoryRoutes);
app.use('/api/progress', deprecationWarning, progressRoutes);
app.use('/api/notifications', deprecationWarning, notificationRoutes);
app.use('/api/admin', deprecationWarning, adminTokenRoutes);
app.use('/api/oauth', deprecationWarning, oauthRoutes);
app.use('/api/test', deprecationWarning, testRoutes);
app.use('/api/dashboard', deprecationWarning, dashboardRoutes);

// 🔍 TEMPORARY REDIS DEBUG ENDPOINT
app.get('/redis-debug', async (req, res) => {
  const debug = {
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    redis_url_exists: !!process.env.REDIS_URL,
    session_manager: {
      available: SessionManager.isRedisAvailable,
      client_exists: !!SessionManager.redisClient
    }
  };

  if (process.env.REDIS_URL) {
    debug.redis_url_preview = process.env.REDIS_URL.replace(/:([^:@]{4})[^:@]*@/, ':$1***@');
    
    try {
      const { createClient } = await import('redis');
      const testClient = createClient({
        username: 'default',
        password: 'MzcxWsuM3beem2R2fEW7ju8cHT4CnF2R',
        socket: {
          host: 'redis-19358.c295.ap-southeast-1-1.ec2.redns.redis-cloud.com',
          port: 19358,
          connectTimeout: 5000
        }
      });
      
      await testClient.connect();
      await testClient.ping();
      await testClient.quit();
      
      debug.direct_test = 'SUCCESS';
    } catch (error) {
      debug.direct_test = 'FAILED';
      debug.error = { code: error.code, message: error.message };
    }
  }

  res.json(debug);
});

// PHASE 1 OPTIMIZATION: Enhanced health check with detailed metrics
// **RENDER FREE TIER OPTIMIZATION**: Ultra-fast health check endpoint
app.get('/health', async (req, res) => {
  try {
    // **CRITICAL**: Only check database connection status - no heavy operations
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    // **CRITICAL**: Return immediately with minimal data
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      environment: NODE_ENV,
      platform: IS_RENDER ? 'render' : 'local',
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    // **CRITICAL**: Even on error, respond quickly
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      uptime: process.uptime()
    });
  }
});

// **RENDER FREE TIER OPTIMIZATION**: External keep-alive endpoint
app.get('/keep-alive', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    message: 'Server is active'
  });
});

// **RENDER DEPLOYMENT**: Simple ready check for deployment
app.get('/ready', (req, res) => {
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: 'Server is ready to accept requests'
  });
});

// WebSocket connection info endpoint for Flutter app
app.get('/ws-info', (req, res) => {
  res.json({
    success: true,
    websocket: {
      baseUrl: WS_BASE_URL,
      endpoints: {
        telemetry: `${WS_BASE_URL}/ws/telemetry`,
        legacy: `${WS_BASE_URL}/ws/legacy`
      }
    },
    api: {
      baseUrl: BASE_URL,
      endpoints: {
        esp32: `${BASE_URL}/api/esp32`,
        plans: `${BASE_URL}/api/plans`,
        auth: `${BASE_URL}/api/auth`
      }
    }
  });
});

// WebSocket health check endpoint
app.get('/ws-health', (req, res) => {
  const wsService = getWebSocketService();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    websocket: {
      status: 'active',
      connections: wsService ? 'available' : 'unavailable'
    },
    esp32: {
      status: 'direct_ble_connection',
      note: 'ESP32 connects directly to Flutter via BLE'
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    success: true,
    message: "SikadVoltz API is running. MAG BAYAD KA MUNA",
    deployment: IS_RENDER ? "Render" : "Local",
    status: {
      environment: NODE_ENV,
      database: dbStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    },
    endpoints: {
      auth: "/api/auth",
      "password-reset": "/api/password-reset",
      plans: "/api/plans",
      calories: "/api/calories",
      "calorie-calculation": "/api/calorie-calculation",
      profile: "/api/profile",
      goals: "/api/goals",
      esp32: "/api/esp32",
      health: "/health"
    },
    websockets: {
      telemetry: `${WS_BASE_URL}/ws/telemetry`,
      legacy: `${WS_BASE_URL}/ws/legacy`
    },
    urls: {
      baseUrl: BASE_URL,
      websocketBase: WS_BASE_URL
    },
    meta: {
      version: process.env.npm_package_version || "1.0.0",
      docs: "https://docs.sikadvoltz.com"
    }
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn(`404 - ${req.method} ${req.originalUrl}`, { ip: req.ip });
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    suggested_endpoints: {
      root: "/",
      api_docs: "/api-docs"
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled Error:', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip  
  });

  res.status(err.status || 500).json({
    success: false,
    error: 'Internal Server Error',
    message: NODE_ENV === 'development' ? err.message : 'Something went wrong',
    ...(NODE_ENV === 'development' && { stack: err.stack }),
    support: "sikadvoltz.app@gmail.com"
  });
});

// 🚀 HTTP/2 OPTIMIZATION: Create enhanced server with HTTP/2 support
const http2ServerManager = new HTTP2ServerManager();
let server;

// Enable HTTP/2 performance optimizations
if (process.env.ENABLE_HTTP2 === 'true') {
  logger.info('🚀 HTTP/2 optimization enabled');
  http2ServerManager.enablePerformanceOptimizations(app);
  
  // Initialize HTTP/2 server (with fallback to HTTP/1.1)
  server = await http2ServerManager.initializeServer(app, PORT);
} else {
  // Standard HTTP/1.1 server
  server = http.createServer(app);
  logger.info('🌐 Using standard HTTP/1.1 server');
}

// Initialize WebSocket service
initWebSocket(server);

// Initialize real-time telemetry service
const telemetryService = new RealTimeTelemetryService();

// Legacy WebSocket server for backward compatibility
const legacyWss = new WebSocketServer({ 
  server,
  path: '/ws/legacy' 
});

legacyWss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  logger.info(`Legacy WebSocket client connected: ${clientIp}`);

  ws.on('message', (message) => {
    logger.debug(`Legacy WebSocket message from ${clientIp}: ${message.toString()}`);
    ws.send(`Server received: ${message}`);
  });

  ws.on('close', () => {
    logger.info(`Legacy WebSocket disconnected: ${clientIp}`);
  });

  ws.on('error', (error) => {
    logger.error(`Legacy WebSocket error from ${clientIp}`, { error });
  });

  ws.send(JSON.stringify({
    type: 'connection_established',
    timestamp: new Date().toISOString(),
    message: 'Connected to legacy WebSocket server'
  }));
});

// Process event handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// PHASE 1: Render-optimized server startup with monitoring
const startServer = async () => {
  try {
    // Track startup time
    const startupStart = Date.now();
    logger.info('Starting SikadVoltz Backend Server...');

    // Connect to database with timing
    const dbStart = Date.now();
    await connectDB();
    const dbConnectionTime = Date.now() - dbStart;
    logger.health.logDatabaseConnection('connected', dbConnectionTime);

    // Listen on all interfaces (0.0.0.0) to support ADB port forwarding for USB debugging
    // **RENDER DEPLOYMENT FIX**: Start server FIRST, then initialize heavy services
    
    // 🚀 HTTP/2 SERVER: Start enhanced server based on configuration
    const startServerWithCallback = () => new Promise((resolve) => {
      if (process.env.ENABLE_HTTP2 === 'true' && http2ServerManager.server) {
        // HTTP/2 server is already started by initializeServer
        resolve();
      } else {
        // Start HTTP/1.1 server
        server.listen(PORT, '0.0.0.0', resolve);
      }
    });
    
    await startServerWithCallback();
    
    // Server startup callback
    (async () => {
      // 🚀 Get server performance stats
      const serverStats = http2ServerManager.getServerStats();
      
      const startupMessage = `
      ============================================
       ${IS_RENDER ? 'Render Production' : 'Local Development'} Server
       Base URL: ${BASE_URL}
       WebSocket Base: ${WS_BASE_URL}
       Environment: ${NODE_ENV}
       Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}

       🚀 Server Protocol: ${serverStats.protocol}
       ${serverStats.ssl ? '🔒 SSL: Enabled' : '🌐 SSL: Disabled'}
       ${serverStats.serverPush ? '📤 Server Push: Enabled' : '📦 Server Push: Disabled'}
       ${serverStats.multiplexing ? '⚡ HTTP/2 Multiplexing: Enabled' : '🔄 HTTP/2 Multiplexing: Disabled'}
       ${serverStats.compression ? '🗜️ Compression: Enabled' : '📄 Compression: Disabled'}

       🌐 API Endpoints:
       - REST API: ${BASE_URL}/api/*
       - Dashboard: ${BASE_URL}/api/v1/dashboard/home
       - Health Check: ${BASE_URL}/api/v1/dashboard/health
       - Cache Stats: ${BASE_URL}/api/v1/dashboard/cache-stats

       📡 WebSocket Endpoints:
       - Telemetry: ${WS_BASE_URL}/ws/telemetry
       - Legacy: ${WS_BASE_URL}/ws/legacy

       Startup Time: ${process.uptime().toFixed(2)}s
      ============================================
      `;

      console.log(startupMessage);

      // PHASE 1: Log successful startup with metrics
      const startupTime = Date.now() - startupStart;
      logger.health.logStartup(startupTime);
      logger.info(`Server started on port ${PORT} (startup: ${startupTime}ms)`);

      // **RENDER DEPLOYMENT FIX**: Initialize heavy services AFTER server is listening
      // This prevents Render deployment timeouts
      setTimeout(async () => {
        try {
          logger.info('🔄 Starting post-deployment initialization...');
          
          // PHASE 1: Initialize session manager with detailed error handling
          console.log('🔥 Initializing SessionManager...');
          try {
            await SessionManager.initialize();
            console.log('✅ SessionManager initialization completed');
            console.log(`   Redis Available: ${SessionManager.isRedisAvailable}`);
            console.log(`   Redis Client Exists: ${!!SessionManager.redisClient}`);
            logger.info('✅ Session manager initialized');
          } catch (sessionError) {
            console.error('❌ SessionManager initialization failed:');
            console.error(`   Error: ${sessionError.message}`);
            console.error(`   Code: ${sessionError.code}`);
            console.error(`   Stack: ${sessionError.stack?.split('\n')[0]}`);
            logger.error('❌ Session manager initialization failed:', sessionError);
            
            // Continue with other services even if Redis fails
          }

          // Initialize telemetry service after DB connection
          await telemetryService.initialize(server);
          logger.info('✅ Telemetry service initialized');

          // Make telemetry service available to routes
          app.locals.telemetryService = telemetryService;

          logger.info('✅ Post-deployment initialization completed (Redis status logged above)');
        } catch (initError) {
          logger.error('❌ Post-deployment initialization failed:', initError);
          console.error('💥 Critical initialization error:', initError.message);
        }
      }, 1000); // 1 second delay to ensure server is fully ready

      // **RENDER FREE TIER OPTIMIZATION**: Keep-alive mechanism
      if (IS_RENDER) {
        console.log('🔄 Render free tier detected - enabling keep-alive mechanism');

        // Ping health endpoint every 10 minutes to prevent sleep
        setInterval(async () => {
          try {
            const response = await fetch(`${BASE_URL}/health`);
            if (response.ok) {
              console.log('🔄 Keep-alive ping successful');
            }
          } catch (error) {
            console.log('⚠️ Keep-alive ping failed (expected on free tier):', error.message);
          }
        }, 10 * 60 * 1000); // 10 minutes

        // Log Render-specific info
        console.log('📊 Render Environment Info:');
        console.log(`   Instance ID: ${process.env.RENDER_INSTANCE_ID || 'Not set'}`);
        console.log(`   Service Name: ${process.env.RENDER_SERVICE_NAME || 'Not set'}`);
        console.log(`   Region: ${process.env.RENDER_REGION || 'Not set'}`);
      }

      // **ENHANCED**: Initialize scheduled tasks for real-time notifications (non-blocking)
      setTimeout(async () => {
        try {
          await ScheduledTasksService.initialize();
          logger.info('✅ Real-time notification system initialized successfully');
        } catch (taskError) {
          logger.error('❌ Failed to initialize scheduled tasks:', taskError);
        }
      }, 5000); // 5 second delay to ensure everything else is ready
      
      // Initialize ESP32 BLE Bridge for real-time communication
      try {
        if (IS_RENDER) {
          // On Render: Use the same server instance for WebSocket (port sharing)
          esp32BLEBridge.initialize(server, PORT);
          console.log('✅ ESP32 BLE Bridge enabled on same port as main server:', PORT);
          logger.info(`ESP32 BLE Bridge WebSocket server active on port ${PORT} (Render production)`);
        } else {
          // Local development: Use separate port
          esp32BLEBridge.initialize(server, PORT + 1);
          console.log('✅ ESP32 BLE Bridge enabled on port', PORT + 1);
          logger.info(`ESP32 BLE Bridge WebSocket server active on port ${PORT + 1} (local development)`);
        }
      } catch (error) {
        logger.error('ESP32 BLE Bridge failed to start:', error);
        console.error('❌ ESP32 BLE Bridge startup failed:', error.message);
      }
    });

    server.on('error', (error) => {
      logger.error('Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} in use. Try: kill -9 $(lsof -t -i:${PORT})`);
      }
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await telemetryService.shutdown();
      server.close(() => {
        mongoose.connection.close();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await telemetryService.shutdown();
      server.close(() => {
        mongoose.connection.close();
        process.exit(0);
      });
    });

  } catch (err) {
    logger.error('Server startup failed:', err);
    process.exit(1);
  }
};

// Start the server
startServer();