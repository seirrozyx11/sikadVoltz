/**
 * PHASE 1 OPTIMIZATION: Enhanced Centralized Logging
 * 
 * Provides structured logging with performance monitoring,
 * error tracking, and scalability metrics for production environments.
 */

import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_RENDER = process.env.RENDER;

// PHASE 1: Enhanced log format with performance metrics
const { combine, timestamp, printf, colorize, json, errors } = winston.format;

const productionFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  errors({ stack: true }),
  json(),
  printf(info => {
    const baseLog = {
      timestamp: info.timestamp,
      level: info.level,
      message: info.message,
      service: 'sikadvoltz-backend',
      environment: process.env.NODE_ENV || 'development',
      ...(info.requestId && { requestId: info.requestId }),
      ...(info.userId && { userId: info.userId }),
      ...(info.duration && { duration: info.duration }),
      ...(info.statusCode && { statusCode: info.statusCode }),
      ...(info.ip && { ip: info.ip }),
      ...(info.endpoint && { endpoint: info.endpoint }),
      ...(info.method && { method: info.method }),
      ...(IS_RENDER && { 
        instanceId: process.env.RENDER_INSTANCE_ID,
        serviceName: process.env.RENDER_SERVICE_NAME 
      }),
      ...info
    };
    
    // Remove duplicated fields
    delete baseLog.timestamp;
    delete baseLog.level;
    delete baseLog.message;
    
    return JSON.stringify(baseLog);
  })
);

const developmentFormat = printf(({ level, message, timestamp, duration, statusCode, method, endpoint, requestId, ...meta }) => {
  let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
  
  // Add HTTP request context if available
  if (method && endpoint) {
    logMessage += ` | ${method} ${endpoint}`;
  }
  
  if (statusCode) {
    logMessage += ` | ${statusCode}`;
  }
  
  if (duration) {
    logMessage += ` | ${duration}ms`;
  }
  
  if (requestId) {
    logMessage += ` | req:${requestId.slice(-6)}`;
  }
  
  // Add metadata if present
  const metaKeys = Object.keys(meta).filter(key => 
    !['service', 'environment'].includes(key)
  );
  
  if (metaKeys.length > 0) {
    const metaObj = {};
    metaKeys.forEach(key => {
      metaObj[key] = meta[key];
    });
    logMessage += ` | ${JSON.stringify(metaObj)}`;
  }
  
  return logMessage;
});

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// PHASE 1: Create enhanced logger with performance tracking
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug'),
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    errors({ stack: true })
  ),
  defaultMeta: { 
    service: 'sikadvoltz-backend',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: []
});

// PHASE 1: Add appropriate transports based on environment
if (IS_RENDER || IS_PRODUCTION) {
  // Production/Render: Console logging for centralized log aggregation
  logger.add(new winston.transports.Console({
    format: productionFormat
  }));
} else {
  // Development: File and console logging
  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    format: productionFormat
  }));
  
  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    format: productionFormat
  }));
  
  logger.add(new winston.transports.Console({
    format: combine(colorize(), developmentFormat)
  }));
}

// PHASE 1: Enhanced logging methods with context
logger.requestLogger = (req, res, next) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  req.requestId = requestId;
  req.startTime = Date.now();
  
  // Log request start
  logger.info('Request started', {
    requestId,
    method: req.method,
    endpoint: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length')
  });
  
  // Override res.end to log response
  const originalEnd = res.end.bind(res);
  res.end = function(...args) {
    const duration = Date.now() - req.startTime;
    
    logger.info('Request completed', {
      requestId,
      method: req.method,
      endpoint: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      ip: req.ip
    });
    
    originalEnd(...args);
  };
  
  next();
};

// PHASE 1: Performance monitoring methods
logger.performance = {
  startTimer: (operation) => {
    const startTime = Date.now();
    return {
      end: (metadata = {}) => {
        const duration = Date.now() - startTime;
        logger.info(`Performance: ${operation}`, {
          operation,
          duration,
          ...metadata
        });
        return duration;
      }
    };
  },
  
  trackQuery: (query, duration, metadata = {}) => {
    logger.debug('Database query', {
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      duration,
      ...metadata
    });
    
    if (duration > 1000) {
      logger.warn('Slow database query detected', {
        query: query.substring(0, 200),
        duration,
        ...metadata
      });
    }
  },
  
  trackMemory: () => {
    const usage = process.memoryUsage();
    logger.debug('Memory usage', {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
      external: Math.round(usage.external / 1024 / 1024) + 'MB',
      rss: Math.round(usage.rss / 1024 / 1024) + 'MB'
    });
  }
};

// PHASE 1: Request logging middleware
logger.requestLogger = (req, res, next) => {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logMessage = `${method} ${originalUrl} ${res.statusCode} - ${duration}ms`;
    const logMeta = { 
      ip, 
      statusCode: res.statusCode, 
      duration,
      userAgent: req.get('User-Agent'),
      contentLength: res.get('Content-Length'),
      timestamp: new Date().toISOString()
    };

    if (res.statusCode >= 500) {
      logger.error(logMessage, logMeta);
    } else if (res.statusCode >= 400) {
      logger.warn(logMessage, logMeta);
    } else {
      logger.http(logMessage, logMeta);
    }
  });

  next();
};

// PHASE 1: System health logging
logger.health = {
  logStartup: (startupTime) => {
    logger.info('System startup completed', {
      startupTime,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: {
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
      }
    });
  },
  
  logDatabaseConnection: (status, connectionTime) => {
    logger.info('Database connection', {
      status,
      connectionTime,
      database: 'mongodb'
    });
  },
  
  logServiceHealth: (serviceName, status, metrics = {}) => {
    logger.info(`Service health: ${serviceName}`, {
      service: serviceName,
      status,
      ...metrics
    });
  }
};

// ES Module export
export default logger;
