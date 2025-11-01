/**
 * Admin Token Retrieval Routes
 * 
 * Backup endpoints to manually retrieve reset tokens when email fails.
 * 
 */

import express from 'express';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Simple admin authentication (replace with proper auth in production)
const ADMIN_KEY = process.env.ADMIN_KEY || 'sikadvoltz-admin-2025';

/**
 * Middleware: Admin authentication
 */
const requireAdmin = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
  
  if (!adminKey || adminKey !== ADMIN_KEY) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Admin authentication required'
    });
  }
  
  next();
};

/**
 * GET /api/admin/reset-token/:email
 * Retrieve active reset token for a user (when email fails)
 */
router.get('/reset-token/:email', 
  requireAdmin,
  async (req, res) => {
    const { email } = req.params;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    try {
      logger.info('Admin reset token retrieval requested', {
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        ip: clientIP
      });
      
      const user = await User.findOne({ 
        email: email.toLowerCase(),
        resetPasswordToken: { $exists: true, $ne: null },
        resetPasswordExpires: { $gt: new Date() }
      });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'NO_ACTIVE_RESET',
          message: 'No active password reset found for this email',
          details: {
            email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
            hasUser: !!(await User.findOne({ email: email.toLowerCase() })),
            suggestion: 'Generate a new reset token first'
          }
        });
      }
      
      // Calculate time remaining
      const expiresAt = new Date(user.resetPasswordExpires);
      const timeRemaining = Math.max(0, expiresAt.getTime() - Date.now());
      const minutesRemaining = Math.ceil(timeRemaining / 60000);
      
      // Return the unhashed token (we need to regenerate it)
      const crypto = await import('crypto');
      const newToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(newToken).digest('hex');
      
      // Update user with new token (extend expiry)
      const expiryTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = expiryTime;
      await user.save();
      
      logger.info('Admin reset token retrieved', {
        userId: user._id,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        ip: clientIP,
        newExpiry: expiryTime
      });
      
      res.json({
        success: true,
        message: 'Reset token retrieved successfully',
        data: {
          email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
          token: newToken, // Unhashed token for use
          expiresAt: expiryTime.toISOString(),
          minutesRemaining: 15,
          deepLink: `sikadvoltz://reset-password?token=${newToken}`,
          instructions: [
            'Copy the deep link above',
            'Send it to the user via alternative method (SMS, chat, etc.)',
            'User can click the link to reset password in the app',
            'Token expires in 15 minutes'
          ]
        }
      });
      
    } catch (error) {
      logger.error('Admin reset token retrieval failed', {
        error: error.message,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        ip: clientIP
      });
      
      res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'Failed to retrieve reset token'
      });
    }
  }
);

/**
 * POST /api/admin/generate-reset-token
 * Generate a new reset token for a user (when email fails)
 */
router.post('/generate-reset-token',
  requireAdmin,
  body('email').isEmail().normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }
    
    const { email } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    try {
      logger.info('Admin reset token generation requested', {
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        ip: clientIP
      });
      
      const user = await User.findOne({ email: email.toLowerCase() });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'No user found with this email address'
        });
      }
      
      // Generate new reset token
      const crypto = await import('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      
      // Set token and expiry
      const expiryTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = expiryTime;
      
      // Update reset attempt tracking
      user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
      user.lastResetAttempt = new Date();
      
      await user.save();
      
      logger.info('Admin reset token generated', {
        userId: user._id,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        ip: clientIP,
        expiresAt: expiryTime
      });
      
      res.json({
        success: true,
        message: 'Reset token generated successfully',
        data: {
          email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
          token: resetToken, // Unhashed token for use
          expiresAt: expiryTime.toISOString(),
          minutesRemaining: 15,
          deepLink: `sikadvoltz://reset-password?token=${resetToken}`,
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=sikadvoltz://reset-password?token=${resetToken}`,
          instructions: [
            'Copy the deep link above and send to user',
            'Or share the QR code for easy scanning',
            'User can click/scan to reset password in the app',
            'Token expires in 15 minutes for security'
          ]
        }
      });
      
    } catch (error) {
      logger.error('Admin reset token generation failed', {
        error: error.message,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        ip: clientIP
      });
      
      res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'Failed to generate reset token'
      });
    }
  }
);

/**
 * GET /api/admin/user-reset-status/:email
 * Check reset status for a user
 */
router.get('/user-reset-status/:email',
  requireAdmin,
  async (req, res) => {
    const { email } = req.params;
    
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'No user found with this email address'
        });
      }
      
      const hasActiveToken = user.resetPasswordToken && 
                            user.resetPasswordExpires && 
                            user.resetPasswordExpires > new Date();
      
      const status = {
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        userId: user._id,
        hasActiveResetToken: hasActiveToken,
        resetTokenExpires: hasActiveToken ? user.resetPasswordExpires.toISOString() : null,
        minutesRemaining: hasActiveToken ? Math.ceil((user.resetPasswordExpires.getTime() - Date.now()) / 60000) : 0,
        totalResetAttempts: user.resetPasswordAttempts || 0,
        lastResetAttempt: user.lastResetAttempt ? user.lastResetAttempt.toISOString() : null,
        accountCreated: user.createdAt.toISOString(),
        lastLogin: user.lastLoginAt ? user.lastLoginAt.toISOString() : null
      };
      
      res.json({
        success: true,
        data: status
      });
      
    } catch (error) {
      logger.error('Admin reset status check failed', {
        error: error.message,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
      });
      
      res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'Failed to check reset status'
      });
    }
  }
);

export default router;