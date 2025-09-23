/**
 * Password Reset Routes
 * 
 * Secure password reset API endpoints with progressive rate limiting,
 * IP tracking, and comprehensive security monitoring.
 */

import express from 'express';
import User from '../models/User.js';
import passwordResetService from '../services/passwordResetService.js';
import emailService from '../services/emailService.js';
import logger from '../utils/logger.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Rate limiting store (in production, use Redis)
const resetAttempts = new Map();
const TOKEN_BLACKLIST = new Set();

/**
 * Middleware: Progressive Rate Limiting
 * Implements exponential backoff instead of hard limits
 */
const progressiveRateLimit = async (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const email = req.body.email?.toLowerCase();
  const key = `${clientIP}:${email}`;
  
  try {
    // Check if user exists and get their reset history
    if (email) {
      const user = await User.findOne({ email }).select('+resetPasswordAttempts +lastResetAttempt');
      
      if (user) {
        const rateLimit = await passwordResetService.checkRateLimit(user, clientIP);
        
        if (rateLimit.isRateLimited) {
          const nextAttemptIn = Math.ceil(rateLimit.remainingDelay / 1000);
          
          logger.warn('Password reset rate limited', {
            email,
            ip: clientIP,
            remainingDelay: rateLimit.remainingDelay,
            totalAttempts: rateLimit.totalAttempts,
            hasExceededMaxAttempts: rateLimit.hasExceededMaxAttempts
          });
          
          // Different messages for hard limit vs progressive delay
          const errorMessage = rateLimit.hasExceededMaxAttempts ? 
            `Maximum password reset attempts (${rateLimit.maxAttemptsPerHour}) exceeded. Please wait 1 hour before trying again.` :
            `Too many reset attempts. Please wait ${nextAttemptIn} seconds before trying again.`;
          
          const errorCode = rateLimit.hasExceededMaxAttempts ? 'MAX_ATTEMPTS_EXCEEDED' : 'TOO_MANY_ATTEMPTS';
          
          return res.status(429).json({
            success: false,
            error: errorCode,
            message: errorMessage,
            retryAfter: nextAttemptIn,
            maxAttemptsPerHour: rateLimit.maxAttemptsPerHour,
            attemptsUsed: rateLimit.totalRecentAttempts,
            nextAttemptAt: rateLimit.nextAttemptAt
          });
        }
      }
    }
    
    next();
  } catch (error) {
    logger.error('Rate limiting error', { error: error.message, ip: clientIP });
    next(); // Continue on error to not block legitimate requests
  }
};

/**
 * Middleware: Input Validation & Sanitization
 */
const validatePasswordResetInput = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid input provided',
        details: errors.array()
      });
    }
    next();
  }
];

const validateResetPasswordInput = [
  body('token')
    .isLength({ min: 64, max: 64 })
    .isAlphanumeric()
    .withMessage('Invalid reset token format'),
  
  body('newPassword')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid input provided',
        details: errors.array()
      });
    }
    next();
  }
];

/**
 * POST /api/auth/forgot-password
 * Request a password reset link
 */
router.post('/forgot-password', 
  validatePasswordResetInput,
  progressiveRateLimit,
  async (req, res) => {
    const startTime = Date.now();
    const { email } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    try {
      logger.info('Password reset requested', { 
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'), // Partial anonymization
        ip: clientIP 
      });
      
      // Find user by email
      const user = await User.findOne({ email: email.toLowerCase() });
      
      // Always return success for security (don't reveal if email exists)
      const genericResponse = {
        success: true,
        message: 'If an account with this email exists, a password reset link has been sent.',
        requestId: `reset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
      
      if (!user) {
        // Log failed attempt for security monitoring
        logger.warn('Password reset attempted for non-existent email', {
          email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
          ip: clientIP,
          userAgent
        });
        
        // Still return success response (security through obscurity)
        return res.json(genericResponse);
      }
      
      // Record the reset attempt
      const suspiciousActivity = await passwordResetService.recordAttempt(user, clientIP, userAgent, false);
      
      // Generate secure reset token
      const resetToken = passwordResetService.generateResetToken(user);
      
      // Save user with new token
      await user.save();
      
      // Send reset email (this will be implemented in emailService)
      const emailResult = await emailService.sendPasswordResetEmail(user.email, resetToken, {
        firstName: user.firstName,
        clientIP,
        userAgent,
        suspiciousActivity: suspiciousActivity.riskLevel
      });
      
      if (emailResult.success) {
        logger.info('Password reset email sent successfully', {
          userId: user._id,
          email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
          resetTokenExpiry: user.resetPasswordExpires
        });
        
        res.json({
          ...genericResponse,
          emailSent: true,
          expiresIn: '15 minutes'
        });
      } else {
        logger.error('Password reset email failed to send', {
          userId: user._id,
          error: emailResult.error
        });
        
        // Enhanced error handling - don't clear token for timeout errors
        // This allows manual email testing and retry functionality
        if (emailResult.error && emailResult.error.includes('timeout')) {
          // Keep token for debugging purposes, but inform user of email issue
          res.status(202).json({
            success: true,
            error: 'EMAIL_DELIVERY_DELAYED',
            message: 'Password reset request processed. If you don\'t receive an email within a few minutes, please contact support.',
            debug: {
              emailConfigurationIssue: true,
              tokenGenerated: true,
              userCanContactSupport: true
            }
          });
        } else {
          // Clear the reset token for other email failures
          user.clearPasswordResetFields();
          await user.save();
          
          res.status(500).json({
            success: false,
            error: 'EMAIL_SEND_FAILED',
            message: 'Failed to send reset email. Please try again later.'
          });
        }
      }
      
    } catch (error) {
      logger.error('Password reset request failed', {
        error: error.message,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        ip: clientIP,
        processingTime: Date.now() - startTime
      });
      
      res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'An error occurred while processing your request. Please try again.'
      });
    }
  }
);

/**
 * POST /api/auth/verify-reset-token
 * Verify if a reset token is valid and not expired
 */
router.post('/verify-reset-token',
  body('token').isLength({ min: 64, max: 64 }).isAlphanumeric(),
  async (req, res) => {
    const { token } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    try {
      // Check if token is blacklisted
      if (TOKEN_BLACKLIST.has(token)) {
        return res.status(400).json({
          success: false,
          error: 'TOKEN_BLACKLISTED',
          message: 'This reset token has already been used.'
        });
      }
      
      // Find user with valid reset token
      const crypto = await import('crypto');
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      
      const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: new Date() }
      });
      
      if (!user) {
        logger.warn('Invalid or expired reset token verification attempt', {
          tokenHash: hashedToken.substring(0, 8) + '...',
          ip: clientIP
        });
        
        return res.status(400).json({
          success: false,
          error: 'INVALID_TOKEN',
          message: 'Invalid or expired reset token.'
        });
      }
      
      // Calculate time remaining
      const expiresAt = new Date(user.resetPasswordExpires);
      const timeRemaining = Math.max(0, expiresAt.getTime() - Date.now());
      const minutesRemaining = Math.ceil(timeRemaining / 60000);
      
      res.json({
        success: true,
        message: 'Reset token is valid.',
        expiresAt: expiresAt.toISOString(),
        minutesRemaining,
        email: user.email.replace(/^(.{2}).*(@.*)$/, '$1***$2') // Partially masked
      });
      
    } catch (error) {
      logger.error('Token verification error', {
        error: error.message,
        ip: clientIP
      });
      
      res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'Error verifying reset token.'
      });
    }
  }
);

/**
 * POST /api/auth/reset-password
 * Reset password using valid token
 */
router.post('/reset-password',
  validateResetPasswordInput,
  async (req, res) => {
    const { token, newPassword } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    try {
      // Check if token is blacklisted
      if (TOKEN_BLACKLIST.has(token)) {
        return res.status(400).json({
          success: false,
          error: 'TOKEN_ALREADY_USED',
          message: 'This reset token has already been used.'
        });
      }
      
      // Find user with valid reset token
      const crypto = await import('crypto');
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      
      const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: new Date() }
      });
      
      if (!user) {
        logger.warn('Password reset attempted with invalid token', {
          tokenHash: hashedToken.substring(0, 8) + '...',
          ip: clientIP,
          userAgent
        });
        
        return res.status(400).json({
          success: false,
          error: 'INVALID_TOKEN',
          message: 'Invalid or expired reset token.'
        });
      }
      
      // Blacklist the token immediately to prevent reuse
      TOKEN_BLACKLIST.add(token);
      
      // Update password
      user.password = newPassword; // Will be hashed by pre-save hook
      
      // Record successful reset
      await passwordResetService.recordAttempt(user, clientIP, userAgent, true);
      
      // Save user (password will be hashed, reset fields cleared)
      await user.save();
      
      // Send confirmation email
      await emailService.sendPasswordChangedConfirmation(user.email, {
        firstName: user.firstName,
        resetIP: clientIP,
        resetTime: new Date()
      });
      
      logger.info('Password reset completed successfully', {
        userId: user._id,
        email: user.email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        ip: clientIP
      });
      
      res.json({
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.'
      });
      
    } catch (error) {
      logger.error('Password reset failed', {
        error: error.message,
        ip: clientIP,
        userAgent
      });
      
      res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'An error occurred while resetting your password. Please try again.'
      });
    }
  }
);

/**
 * GET /api/auth/reset-status/:token
 * Get the status of a reset token (for frontend validation)
 */
router.get('/reset-status/:token', async (req, res) => {
  const { token } = req.params;
  const clientIP = req.ip || req.connection.remoteAddress;
  
  try {
    if (!token || token.length !== 64) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_TOKEN_FORMAT',
        message: 'Invalid token format.'
      });
    }
    
    // Check if token is blacklisted
    if (TOKEN_BLACKLIST.has(token)) {
      return res.json({
        success: false,
        status: 'USED',
        message: 'This reset link has already been used.'
      });
    }
    
    // Find user with this token
    const crypto = await import('crypto');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      resetPasswordToken: hashedToken
    });
    
    if (!user) {
      return res.json({
        success: false,
        status: 'INVALID',
        message: 'Invalid reset token.'
      });
    }
    
    // Check if expired
    if (user.resetPasswordExpires <= new Date()) {
      return res.json({
        success: false,
        status: 'EXPIRED',
        message: 'This reset link has expired.',
        expiredAt: user.resetPasswordExpires.toISOString()
      });
    }
    
    // Token is valid
    const timeRemaining = user.resetPasswordExpires.getTime() - Date.now();
    const minutesRemaining = Math.ceil(timeRemaining / 60000);
    
    res.json({
      success: true,
      status: 'VALID',
      message: 'Reset token is valid.',
      expiresAt: user.resetPasswordExpires.toISOString(),
      minutesRemaining
    });
    
  } catch (error) {
    logger.error('Reset status check failed', {
      error: error.message,
      ip: clientIP
    });
    
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error checking reset token status.'
    });
  }
});

/**
 * POST /api/auth/resend-reset
 * Resend password reset email (with stricter rate limiting)
 */
router.post('/resend-reset',
  validatePasswordResetInput,
  async (req, res) => {
    const { email } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      
      if (!user || !user.resetPasswordToken) {
        return res.status(400).json({
          success: false,
          error: 'NO_PENDING_RESET',
          message: 'No pending password reset found for this email.'
        });
      }
      
      // Check if token is still valid
      if (user.resetPasswordExpires <= new Date()) {
        return res.status(400).json({
          success: false,
          error: 'RESET_EXPIRED',
          message: 'Previous reset request has expired. Please request a new one.'
        });
      }
      
      // Check resend rate limiting (more restrictive)
      const timeSinceLastAttempt = user.lastResetAttempt ? 
        Date.now() - user.lastResetAttempt.getTime() : Infinity;
      
      if (timeSinceLastAttempt < 120000) { // 2 minutes minimum between resends
        const waitTime = Math.ceil((120000 - timeSinceLastAttempt) / 1000);
        return res.status(429).json({
          success: false,
          error: 'RESEND_TOO_SOON',
          message: `Please wait ${waitTime} seconds before requesting another email.`,
          retryAfter: waitTime
        });
      }
      
      // Get the original token (unhashed)
      const resetToken = passwordResetService.generateResetToken(user);
      await user.save();
      
      // Resend email
      const emailResult = await emailService.sendPasswordResetEmail(user.email, resetToken, {
        firstName: user.firstName,
        isResend: true
      });
      
      if (emailResult.success) {
        res.json({
          success: true,
          message: 'Reset email has been resent.'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'EMAIL_SEND_FAILED',
          message: 'Failed to resend reset email.'
        });
      }
      
    } catch (error) {
      logger.error('Resend reset email failed', {
        error: error.message,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        ip: clientIP
      });
      
      res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'Error resending reset email.'
      });
    }
  }
);

// Cleanup blacklisted tokens periodically (every hour)
setInterval(() => {
  TOKEN_BLACKLIST.clear();
  logger.info('Token blacklist cleared');
}, 3600000);

export default router;
