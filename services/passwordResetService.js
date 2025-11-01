/**
 * Password Reset Service
 * 
 * Handles secure password reset functionality with progressive delays,
 * IP tracking, and comprehensive security monitoring.
 */

import crypto from 'crypto';
import User from '../models/User.js';
import logger from '../utils/logger.js';

class PasswordResetService {
  constructor() {
    this.RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
    this.MAX_ATTEMPTS_BEFORE_DELAY = 3;
    this.MAX_ATTEMPTS_PER_HOUR = 3; // Hard limit: only 3 attempts per hour
    this.BASE_DELAY = 2000; // 2 seconds
    this.MAX_DELAY = 300000; // 5 minutes
    this.TOKEN_EXPIRY = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Calculate progressive delay based on attempt count
   * @param {number} attemptCount - Number of failed attempts
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attemptCount) {
    if (attemptCount <= this.MAX_ATTEMPTS_BEFORE_DELAY) {
      return 0;
    }
    
    const delayMultiplier = attemptCount - this.MAX_ATTEMPTS_BEFORE_DELAY;
    const delay = this.BASE_DELAY * Math.pow(2, delayMultiplier);
    
    return Math.min(delay, this.MAX_DELAY);
  }

  /**
   * Check if user has exceeded rate limits
   * @param {Object} user - User document
   * @param {string} ip - Client IP address
   * @returns {Object} Rate limit status
   */
  async checkRateLimit(user, ip) {
    const now = Date.now();
    const windowStart = now - this.RATE_LIMIT_WINDOW;
    
    // Count recent attempts from this IP within the time window
    const recentAttempts = user.resetAttemptIPs?.filter(attempt => 
      attempt.ip === ip && 
      attempt.timestamp.getTime() > windowStart
    ) || [];
    
    // Count total recent attempts across all IPs within the time window
    const totalRecentAttempts = user.resetAttemptIPs?.filter(attempt => 
      attempt.timestamp.getTime() > windowStart
    ) || [];
    
    const totalAttempts = user.resetPasswordAttempts || 0;
    const delay = this.calculateDelay(totalAttempts);
    
    // Check hard maximum limit per hour
    const hasExceededMaxAttempts = totalRecentAttempts.length >= this.MAX_ATTEMPTS_PER_HOUR;
    
    // Check if last attempt was too recent
    const lastAttempt = user.lastResetAttempt;
    const timeSinceLastAttempt = lastAttempt ? now - lastAttempt.getTime() : Infinity;
    
    const isRateLimited = (delay > 0 && timeSinceLastAttempt < delay) || hasExceededMaxAttempts;
    const remainingDelay = hasExceededMaxAttempts ? 
      this.RATE_LIMIT_WINDOW - (now - Math.min(...totalRecentAttempts.map(a => a.timestamp.getTime()))) :
      (delay > 0 && timeSinceLastAttempt < delay) ? delay - timeSinceLastAttempt : 0;
    
    return {
      isRateLimited,
      remainingDelay,
      recentAttempts: recentAttempts.length,
      totalAttempts,
      hasExceededMaxAttempts,
      maxAttemptsPerHour: this.MAX_ATTEMPTS_PER_HOUR,
      totalRecentAttempts: totalRecentAttempts.length,
      nextAttemptAt: isRateLimited ? new Date(now + remainingDelay) : new Date()
    };
  }

  /**
   * Generate secure password reset token
   * @param {Object} user - User document
   * @returns {string} Unhashed token for email
   */
  generateResetToken(user) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash and store token
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    user.resetPasswordExpires = new Date(Date.now() + this.TOKEN_EXPIRY);
    
    return resetToken;
  }

  /**
   * Validate reset token
   * @param {Object} user - User document
   * @param {string} token - Reset token from email
   * @returns {boolean} Token validity
   */
  validateResetToken(user, token) {
    if (!user.resetPasswordToken || !user.resetPasswordExpires) {
      return false;
    }
    
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    const isValidToken = user.resetPasswordToken === hashedToken;
    const isNotExpired = user.resetPasswordExpires.getTime() > Date.now();
    
    return isValidToken && isNotExpired;
  }

  /**
   * Detect suspicious activity patterns
   * @param {Object} user - User document
   * @param {string} ip - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Object} Suspicious activity analysis
   */
  detectSuspiciousActivity(user, ip, userAgent) {
    const suspiciousIndicators = [];
    const recentAttempts = user.resetAttemptIPs || [];
    
    // Check for multiple IPs in short time
    const recentIPs = new Set(
      recentAttempts
        .filter(attempt => Date.now() - attempt.timestamp.getTime() < 3600000) // Last hour
        .map(attempt => attempt.ip)
    );
    
    if (recentIPs.size > 3) {
      suspiciousIndicators.push('MULTIPLE_IPS');
    }
    
    // Check for rapid successive attempts
    const recentAttemptTimes = recentAttempts
      .filter(attempt => Date.now() - attempt.timestamp.getTime() < 600000) // Last 10 minutes
      .map(attempt => attempt.timestamp.getTime())
      .sort((a, b) => b - a);
    
    if (recentAttemptTimes.length >= 5) {
      const intervals = [];
      for (let i = 1; i < recentAttemptTimes.length; i++) {
        intervals.push(recentAttemptTimes[i - 1] - recentAttemptTimes[i]);
      }
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval < 30000) { // Less than 30 seconds between attempts
        suspiciousIndicators.push('RAPID_ATTEMPTS');
      }
    }
    
    // Check for unusual user agent patterns
    const recentUserAgents = new Set(
      recentAttempts
        .filter(attempt => Date.now() - attempt.timestamp.getTime() < 3600000)
        .map(attempt => attempt.userAgent)
        .filter(ua => ua)
    );
    
    if (recentUserAgents.size > 2) {
      suspiciousIndicators.push('MULTIPLE_USER_AGENTS');
    }
    
    const riskLevel = suspiciousIndicators.length === 0 ? 'LOW' :
                     suspiciousIndicators.length <= 2 ? 'MEDIUM' : 'HIGH';
    
    return {
      riskLevel,
      indicators: suspiciousIndicators,
      recentIPCount: recentIPs.size,
      recentAttemptCount: recentAttempts.length
    };
  }

  /**
   * Record password reset attempt
   * @param {Object} user - User document
   * @param {string} ip - Client IP address
   * @param {string} userAgent - Client user agent
   * @param {boolean} success - Whether attempt was successful
   */
  async recordAttempt(user, ip, userAgent, success = false) {
    user.recordResetAttempt(ip, userAgent);
    
    if (success) {
      user.updateResetAnalytics();
      user.clearPasswordResetFields();
    }
    
    // Detect and log suspicious activity
    const suspiciousActivity = this.detectSuspiciousActivity(user, ip, userAgent);
    
    if (suspiciousActivity.riskLevel === 'HIGH') {
      user.resetAnalytics.suspiciousActivity = true;
      
      logger.warn('Suspicious password reset activity detected', {
        userId: user._id,
        email: user.email,
        ip,
        userAgent,
        riskLevel: suspiciousActivity.riskLevel,
        indicators: suspiciousActivity.indicators
      });
    }
    
    await user.save();
    
    return suspiciousActivity;
  }

  /**
   * Clean up expired tokens (should be run periodically)
   */
  async cleanupExpiredTokens() {
    try {
      const result = await User.updateMany(
        {
          resetPasswordExpires: { $lt: new Date() }
        },
        {
          $unset: {
            resetPasswordToken: 1,
            resetPasswordExpires: 1
          }
        }
      );
      
      logger.info(`Cleaned up ${result.modifiedCount} expired reset tokens`);
      return result.modifiedCount;
    } catch (error) {
      logger.error('Error cleaning up expired tokens:', error);
      throw error;
    }
  }

  /**
   * Get reset statistics (for admin dashboard)
   */
  async getResetStatistics(timeframe = '24h') {
    const timeframesToMs = {
      '1h': 3600000,
      '24h': 86400000,
      '7d': 604800000,
      '30d': 2592000000
    };
    
    const msAgo = timeframesToMs[timeframe] || timeframesToMs['24h'];
    const since = new Date(Date.now() - msAgo);
    
    try {
      const stats = await User.aggregate([
        {
          $match: {
            'resetAttemptIPs.timestamp': { $gte: since }
          }
        },
        {
          $unwind: '$resetAttemptIPs'
        },
        {
          $match: {
            'resetAttemptIPs.timestamp': { $gte: since }
          }
        },
        {
          $group: {
            _id: null,
            totalAttempts: { $sum: 1 },
            uniqueUsers: { $addToSet: '$_id' },
            uniqueIPs: { $addToSet: '$resetAttemptIPs.ip' },
            suspiciousUsers: {
              $sum: {
                $cond: ['$resetAnalytics.suspiciousActivity', 1, 0]
              }
            }
          }
        },
        {
          $project: {
            totalAttempts: 1,
            uniqueUserCount: { $size: '$uniqueUsers' },
            uniqueIPCount: { $size: '$uniqueIPs' },
            suspiciousUsers: 1
          }
        }
      ]);
      
      return stats[0] || {
        totalAttempts: 0,
        uniqueUserCount: 0,
        uniqueIPCount: 0,
        suspiciousUsers: 0
      };
    } catch (error) {
      logger.error('Error getting reset statistics:', error);
      throw error;
    }
  }
}

export default new PasswordResetService();
