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
import logger from './utils/logger.js';
import { initWebSocket, getWebSocketService } from './services/websocketService.js';
import esp32BLEBridge from './services/esp32_ble_bridge.js';

// Import routes
import authRouter from './routes/auth.js';
import planRoutes from './routes/planRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import calorieRoutes from './routes/calorieRoutes.js';
import calorieCalculationRoutes from './routes/calorieCalculationRoutes.js';
import goalsRoutes from './routes/goalsRoutes.js';
import esp32Routes from './routes/esp32Routes.js';
import workoutHistoryRoutes from './routes/workoutHistoryRoutes.js';
// Import services
import RealTimeTelemetryService from './services/realTimeTelemetryService.js';
import { initializeScheduledTasks } from './services/scheduledTasks.js';

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

if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI not defined in environment variables');
  process.exit(1);
}

// Render-optimized MongoDB connection
const connectDB = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: IS_RENDER ? 3000 : 5000, // Faster timeout for Render
      socketTimeoutMS: 30000
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

// Enhanced CORS configuration
const allowedOrigins = [
  ...(process.env.ALLOWED_ORIGINS?.split(',') || []).map(o => o.trim()),
  BASE_URL, // Use dynamic base URL
  WS_BASE_URL // Allow WebSocket connections
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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced request logging
app.use((req, res, next) => {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logMessage = `${method} ${originalUrl} ${res.statusCode} - ${duration}ms`;
    const logMeta = { ip, statusCode: res.statusCode, duration };

    if (res.statusCode >= 500) {
      logger.error(logMessage, logMeta);
    } else if (res.statusCode >= 400) {
      logger.warn(logMessage, logMeta);
    } else {
      logger.http(logMessage, logMeta);
    }
  });

  next();
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/plans', planRoutes);
app.use('/api/calories', calorieRoutes);
app.use('/api/calorie-calculation', calorieCalculationRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/esp32', esp32Routes);
app.use('/api/workout-history', workoutHistoryRoutes);

// Render-compatible health check (essential for deployment)
app.get('/health', (req, res) => {
  const dbHealthy = mongoose.connection.readyState === 1;
  const status = dbHealthy ? 200 : 503;
  
  res.status(status).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    database: dbHealthy ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    nodeVersion: process.version,
    uptime: process.uptime(),
    ...(IS_RENDER && { 
      renderInstance: process.env.RENDER_INSTANCE_ID,
      service: process.env.RENDER_SERVICE_NAME 
    })
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
  const wsHealthy = telemetryService?.isInitialized || false;
  const status = wsHealthy ? 200 : 503;
  
  res.status(status).json({
    success: wsHealthy,
    websocketService: {
      status: wsHealthy ? 'healthy' : 'unhealthy',
      initialized: wsHealthy,
      endpoints: {
        telemetry: `${WS_BASE_URL}/ws/telemetry`,
        legacy: `${WS_BASE_URL}/ws/legacy`
      }
    },
    urls: {
      baseUrl: BASE_URL,
      websocketBase: WS_BASE_URL
    },
    testInstructions: {
      message: "To test WebSocket connection, use a WebSocket client to connect to the telemetry endpoint",
      testUrl: `${WS_BASE_URL}/ws/telemetry`,
      expectedResponse: "Connection established message with timestamp"
    },
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    success: true,
    message: "SikadVoltz API is running. BOSHET",
    deployment: IS_RENDER ? "Render" : "Local",
    status: {
      environment: NODE_ENV,
      database: dbStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    },
    endpoints: {
      auth: "/api/auth",
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
      docs: "https://docs.your-api.com"
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
    support: "sln32166@gmail.com"
  });
});

// Create HTTP server
const server = http.createServer(app);

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

// Render-optimized server startup
const startServer = async () => {
  try {
    await connectDB();
    
    // Initialize telemetry service after DB connection
    await telemetryService.initialize(server);
    
    // Make telemetry service available to routes
    app.locals.telemetryService = telemetryService;
    
    server.listen(PORT, () => {
      const startupMessage = `
      ============================================
       ${IS_RENDER ? 'Render Production' : 'Local Development'} Server
       Base URL: ${BASE_URL}
       WebSocket Base: ${WS_BASE_URL}
       Environment: ${NODE_ENV}
       Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}
       
       🌐 API Endpoints:
       - REST API: ${BASE_URL}/api/*
       - Health Check: ${BASE_URL}/health
       
       📡 WebSocket Endpoints:
       - Telemetry: ${WS_BASE_URL}/ws/telemetry
       - Legacy: ${WS_BASE_URL}/ws/legacy
       
       Startup Time: ${process.uptime().toFixed(2)}s
      ============================================
      `;
      
      console.log(startupMessage);
      logger.info(`Server started on port ${PORT}`);
      
      // Initialize scheduled tasks for missed session detection
      try {
        initializeScheduledTasks();
        logger.info('✅ Scheduled tasks initialized successfully');
      } catch (taskError) {
        logger.error('❌ Failed to initialize scheduled tasks:', taskError);
      }
      
      // Initialize ESP32 BLE Bridge on a separate port
      try {
        esp32BLEBridge.initialize(server, PORT + 1);
      } catch (error) {
        logger.warn('ESP32 BLE Bridge failed to start:', error);
        console.warn('⚠️  ESP32 BLE Bridge not available');
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