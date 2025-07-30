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

// Import routes
import authRouter from './routes/auth.js';
import planRoutes from './routes/planRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import calorieRoutes from './routes/calorieRoutes.js';
import calorieCalculationRoutes from './routes/calorieCalculationRoutes.js';
import goalsRoutes from './routes/goalsRoutes.js';

// Environment setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI;
const IS_RENDER = process.env.RENDER; // Render environment detection

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
  IS_RENDER ? 'https://sikadvoltz-backend.onrender.com' : 'http://localhost:3000'
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
      health: "/health"
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
    support: "contact@your-api.com"
  });
});

// Create HTTP + WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// WebSocket connection
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  logger.info(`WebSocket client connected: ${clientIp}`);

  ws.on('message', (message) => {
    logger.debug(`WebSocket message from ${clientIp}: ${message.toString()}`);
    ws.send(`Server received: ${message}`);
  });

  ws.on('close', () => {
    logger.info(`WebSocket disconnected: ${clientIp}`);
  });

  ws.on('error', (error) => {
    logger.error(`WebSocket error from ${clientIp}`, { error });
  });

  ws.send(JSON.stringify({
    type: 'connection_established',
    timestamp: new Date().toISOString(),
    message: 'Connected to WebSocket server'
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
    
    server.listen(PORT, () => {
      const startupMessage = `
      ============================================
       ${IS_RENDER ? 'Render Production' : 'Local Development'} Server
       URL: ${IS_RENDER ? process.env.RENDER_EXTERNAL_URL : `http://localhost:${PORT}`}
       Environment: ${NODE_ENV}
       Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}
       Startup Time: ${process.uptime().toFixed(2)}s
      ============================================
      `;
      
      console.log(startupMessage);
      logger.info(`Server started on port ${PORT}`);
    });

    server.on('error', (error) => {
      logger.error('Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} in use. Try: kill -9 $(lsof -t -i:${PORT})`);
      }
      process.exit(1);
    });

  } catch (err) {
    logger.error('Server startup failed:', err);
    process.exit(1);
  }
};

// Start the server
startServer();