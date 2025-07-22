// Load environment variables from .env
import dotenv from 'dotenv';
dotenv.config();
console.log('JWT_SECRET from .env:', process.env.JWT_SECRET); // Add this line

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
import authRoutes from './routes/auth.js';
import planRoutes from './routes/planRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import calorieRoutes from './routes/calorieRoutes.js';

// Environment setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sikadvoltz';

// MongoDB connection
console.log('Attempting to connect to MongoDB...');
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('MongoDB connected successfully');
  logger.info('MongoDB connected successfully');
})
.catch(err => {
  console.error('MongoDB connection error:', err.message);
  logger.error('MongoDB connection error:', err);
  process.exit(1);
});

// Create Express app
const app = express();

// Enable CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || NODE_ENV === 'development') {
      callback(null, true);
    } else {
      logger.warn(`Blocked CORS request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/profile', profileRoutes);


// Request logger
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
app.use('/api/auth', authRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/calories', calorieRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    nodeVersion: process.version
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn(`404 - ${req.method} ${req.originalUrl}`, { ip: req.ip });
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`
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
    ...(NODE_ENV === 'development' && { stack: err.stack })
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

  // Initial welcome message
  ws.send(JSON.stringify({
    type: 'connection_established',
    timestamp: new Date().toISOString(),
    message: 'Connected to WebSocket server'
  }));
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

// Start server
const startServer = async () => {
  try {
    console.log('Attempting to connect to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    mongoose.connection.once('open', async () => {
      console.log('MongoDB connection open');

      // Ping to confirm admin access
      try {
        await mongoose.connection.db.admin().ping();
        console.log('MongoDB connection verified');

        server.listen(PORT, '0.0.0.0', () => {
          console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`);
          console.log(`WebSocket server running on ws://localhost:${PORT}`);
          console.log(`API available at http://localhost:${PORT}/api`);
        });

        server.on('error', (error) => {
          if (error.syscall !== 'listen') throw error;
          switch (error.code) {
            case 'EACCES':
              console.error(`Port ${PORT} requires elevated privileges`);
              process.exit(1);
            case 'EADDRINUSE':
              console.error(`Port ${PORT} is already in use`);
              process.exit(1);
            default:
              throw error;
          }
        });
      } catch (err) {
        console.error('Ping failed:', err);
        process.exit(1);
      }
    });

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB error:', err);
      process.exit(1);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};


startServer();
