/**
 * Security Middleware Configuration
 * 
 * Centralized security middleware including helmet, rate limiting,
 * HTTPS enforcement, and other security measures.
 */

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

class SecurityMiddleware {
  /**
   * Configure Helmet security headers
   * @param {Object} app - Express application
   */
  static configureSecurityHeaders(app) {
    const isProduction = process.env.NODE_ENV === 'production';
    
    app.use(helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'", // Required for some admin panels
            "https://apis.google.com", // Google OAuth
            "https://accounts.google.com"
          ],
          styleSrc: [
            "'self'", 
            "'unsafe-inline'", // Required for dynamic styles
            "https://fonts.googleapis.com"
          ],
          fontSrc: [
            "'self'",
            "https://fonts.gstatic.com"
          ],
          imgSrc: [
            "'self'", 
            "data:", 
            "https:", // Allow HTTPS images
            "blob:" // Allow blob URLs for profile pictures
          ],
          connectSrc: [
            "'self'",
            "https://api.mongodb.com",
            "wss:", // WebSocket connections
            "ws:" // WebSocket connections (dev)
          ],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: [
            "'self'",
            "https://accounts.google.com" // Google OAuth
          ]
        },
        // Only enable in production to avoid development issues
        reportOnly: !isProduction
      },

      // HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },

      // X-Frame-Options
      frameguard: {
        action: 'deny'
      },

      // X-Content-Type-Options
      noSniff: true,

      // X-XSS-Protection
      xssFilter: true,

      // Referrer Policy
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'
      },

      // Hide X-Powered-By header
      hidePoweredBy: true,

      // Don't set CSP in development for easier debugging
      ...(process.env.NODE_ENV === 'development' && {
        contentSecurityPolicy: false
      })
    }));

    logger.info('Security headers configured', {
      environment: process.env.NODE_ENV,
      cspEnabled: isProduction
    });
  }

  /**
   * Configure API rate limiting
   * @param {Object} app - Express application
   */
  static configureRateLimit(app) {
    // General API rate limiting
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'production' ? 100 : 200, // Stricter in production
      message: {
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: 15 * 60 // 15 minutes in seconds
      },
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path === '/ws-health';
      },
      keyGenerator: (req) => {
        // Use forwarded IP if available (for reverse proxies)
        return req.ip || req.connection.remoteAddress;
      },
      onLimitReached: (req, res, options) => {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method
        });
      }
    });

    // Stricter rate limiting for authentication endpoints
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20, // Much stricter for auth endpoints
      message: {
        success: false,
        error: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts, please try again later.',
        retryAfter: 15 * 60
      },
      standardHeaders: true,
      legacyHeaders: false,
      onLimitReached: (req, res, options) => {
        logger.error('Authentication rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          email: req.body?.email?.replace(/^(.{2}).*(@.*)$/, '$1***$2') || 'unknown'
        });
      }
    });

    // Password reset rate limiting
    const passwordResetLimiter = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5, // Only 5 password reset attempts per hour
      message: {
        success: false,
        error: 'PASSWORD_RESET_RATE_LIMITED',
        message: 'Too many password reset attempts, please try again later.',
        retryAfter: 60 * 60
      },
      keyGenerator: (req) => {
        // Rate limit by IP and email combination
        // Handle cases where body might not be parsed yet
        const email = req.body?.email || 'unknown';
        return `${req.ip}-${email}`;
      },
      onLimitReached: (req, res, options) => {
        logger.error('Password reset rate limit exceeded', {
          ip: req.ip,
          email: req.body?.email?.replace(/^(.{2}).*(@.*)$/, '$1***$2') || 'unknown'
        });
      }
    });

    // Apply rate limiters
    app.use('/api/', apiLimiter);
    app.use('/api/auth/', authLimiter);
    app.use('/api/password-reset/', passwordResetLimiter);

    logger.info('Rate limiting configured', {
      apiLimit: process.env.NODE_ENV === 'production' ? 100 : 200,
      authLimit: 20,
      passwordResetLimit: 5
    });
  }

  /**
   * Configure HTTPS enforcement and secure cookies
   * @param {Object} app - Express application
   */
  static configureHTTPSEnforcement(app) {
    const isProduction = process.env.NODE_ENV === 'production';
    const IS_RENDER = process.env.RENDER;

    if (isProduction) {
      // Trust proxy headers (required for Render and other cloud platforms)
      app.set('trust proxy', 1);

      // HTTPS redirect middleware
      app.use((req, res, next) => {
        // Check if request is not secure and not from a load balancer
        if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
          const httpsUrl = `https://${req.get('host')}${req.url}`;
          
          logger.info('Redirecting HTTP to HTTPS', {
            originalUrl: req.url,
            httpsUrl: httpsUrl,
            ip: req.ip
          });
          
          return res.redirect(301, httpsUrl);
        }
        next();
      });

      // Set secure cookie defaults
      app.use((req, res, next) => {
        res.cookie = function(name, value, options = {}) {
          // Set secure defaults for production
          const secureOptions = {
            ...options,
            secure: true, // HTTPS only
            httpOnly: true, // Prevent XSS
            sameSite: 'strict', // CSRF protection
            ...(options.maxAge && { maxAge: options.maxAge }),
            ...(options.domain && { domain: options.domain })
          };
          
          return res.cookie.call(this, name, value, secureOptions);
        };
        next();
      });

      logger.info('HTTPS enforcement enabled for production');
    } else {
      logger.info('HTTPS enforcement disabled for development');
    }
  }

  /**
   * Configure additional security middleware
   * @param {Object} app - Express application
   */
  static configureAdditionalSecurity(app) {
    // Remove server signature
    app.disable('x-powered-by');

    // Security logging middleware
    app.use((req, res, next) => {
      // Log potentially suspicious requests
      const userAgent = req.get('User-Agent') || '';
      const isSuspicious = (
        req.path.includes('..') || // Path traversal
        req.path.includes('script') || // Potential XSS
        req.path.includes('union') || // SQL injection
        userAgent.toLowerCase().includes('bot') ||
        userAgent.toLowerCase().includes('scan')
      );

      if (isSuspicious) {
        logger.warn('Suspicious request detected', {
          ip: req.ip,
          userAgent: userAgent.substring(0, 100),
          path: req.path,
          method: req.method,
          query: Object.keys(req.query).length > 0 ? req.query : undefined
        });
      }

      next();
    });

    logger.info('Additional security middleware configured');
  }

  /**
   * Apply all security middleware to the app
   * @param {Object} app - Express application
   */
  static applyAll(app) {
    logger.info('Applying security middleware...');
    
    this.configureSecurityHeaders(app);
    this.configureRateLimit(app);
    this.configureHTTPSEnforcement(app);
    this.configureAdditionalSecurity(app);
    
    logger.info('✅ All security middleware applied successfully');
  }
}

export default SecurityMiddleware;