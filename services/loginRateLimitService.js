/**
 * Login Rate Limiting Service
 * 
 * Handles secure login attempt tracking with maximum 3 attempts per hour,
 * IP tracking, and account lockout protection.
 */

import User from '../models/User.js';
import logger from '../utils/logger.js';

class LoginRateLimitService {
  constructor() {
    this.RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
    this.MAX_ATTEMPTS_PER_HOUR = 3; // Hard limit: only 3 failed attempts per hour
    this.LOCKOUT_DURATION = 60 * 60 * 1000; // 1 hour lockout after max attempts
  }

  /**
   * Check if user account is locked or has exceeded rate limits
   * @param {Object} user - User document
   * @param {string} ip - Client IP address
   * @returns {Object} Rate limit status
   */
  async checkLoginRateLimit(user, ip) {
    const now = Date.now();
    const windowStart = now - this.RATE_LIMIT_WINDOW;
    
    // Check if account is currently locked
    if (user.accountLockedUntil && user.accountLockedUntil.getTime() > now) {
      const remainingLockTime = user.accountLockedUntil.getTime() - now;
      return {
        isBlocked: true,
        isAccountLocked: true,
        remainingLockTime,
        reason: 'ACCOUNT_LOCKED',
        message: `Account is locked. Please try again in ${Math.ceil(remainingLockTime / 60000)} minutes.`,
        unlockAt: user.accountLockedUntil
      };
    }

    // Count recent failed attempts within the time window
    const recentFailedAttempts = user.loginAttemptIPs?.filter(attempt => 
      attempt.timestamp.getTime() > windowStart && !attempt.success
    ) || [];
    
    // Check if max attempts exceeded
    const hasExceededMaxAttempts = recentFailedAttempts.length >= this.MAX_ATTEMPTS_PER_HOUR;
    
    if (hasExceededMaxAttempts) {
      return {
        isBlocked: true,
        isAccountLocked: false,
        hasExceededMaxAttempts: true,
        maxAttemptsPerHour: this.MAX_ATTEMPTS_PER_HOUR,
        attemptsUsed: recentFailedAttempts.length,
        reason: 'MAX_ATTEMPTS_EXCEEDED',
        message: `Maximum login attempts (${this.MAX_ATTEMPTS_PER_HOUR}) exceeded. Please wait 1 hour before trying again.`,
        windowResetAt: new Date(Math.min(...recentFailedAttempts.map(a => a.timestamp.getTime())) + this.RATE_LIMIT_WINDOW)
      };
    }

    return {
      isBlocked: false,
      attemptsRemaining: this.MAX_ATTEMPTS_PER_HOUR - recentFailedAttempts.length,
      recentFailedAttempts: recentFailedAttempts.length,
      maxAttemptsPerHour: this.MAX_ATTEMPTS_PER_HOUR
    };
  }

  /**
   * Record a login attempt (successful or failed)
   * @param {Object} user - User document
   * @param {string} ip - Client IP address
   * @param {string} userAgent - Client user agent
   * @param {boolean} success - Whether the login was successful
   */
  async recordLoginAttempt(user, ip, userAgent, success = false) {
    const now = new Date();
    
    // Initialize arrays if they don't exist
    if (!user.loginAttemptIPs) {
      user.loginAttemptIPs = [];
    }

    // Add the new attempt
    user.loginAttemptIPs.push({
      ip,
      timestamp: now,
      userAgent,
      success
    });

    // Clean up old attempts (older than rate limit window)
    const windowStart = now.getTime() - this.RATE_LIMIT_WINDOW;
    user.loginAttemptIPs = user.loginAttemptIPs.filter(
      attempt => attempt.timestamp.getTime() > windowStart
    );

    // Update attempt counters
    if (!success) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      user.lastLoginAttempt = now;

      // Check if we should lock the account
      const recentFailedAttempts = user.loginAttemptIPs.filter(attempt => 
        attempt.timestamp.getTime() > windowStart && !attempt.success
      );

      if (recentFailedAttempts.length >= this.MAX_ATTEMPTS_PER_HOUR) {
        user.accountLockedUntil = new Date(now.getTime() + this.LOCKOUT_DURATION);
        
        logger.warn('Account locked due to excessive login attempts', {
          email: user.email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
          ip,
          attempts: recentFailedAttempts.length,
          lockedUntil: user.accountLockedUntil
        });
      }
    } else {
      // Successful login - reset counters and unlock account
      user.loginAttempts = 0;
      user.accountLockedUntil = undefined;
      user.lastSuccessfulLogin = now;
    }

    // Save the user
    await user.save();

    return {
      success,
      attemptsRecorded: user.loginAttemptIPs.length,
      isLocked: !!user.accountLockedUntil
    };
  }

  /**
   * Detect suspicious login activity patterns
   * @param {Object} user - User document
   * @param {string} ip - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Object} Suspicious activity analysis
   */
  detectSuspiciousLoginActivity(user, ip, userAgent) {
    const suspiciousIndicators = [];
    const recentAttempts = user.loginAttemptIPs || [];
    
    // Check for multiple IPs in short time
    const recentIPs = new Set(
      recentAttempts
        .filter(attempt => Date.now() - attempt.timestamp.getTime() < 3600000) // Last hour
        .map(attempt => attempt.ip)
    );
    
    if (recentIPs.size > 3) {
      suspiciousIndicators.push('MULTIPLE_IPS');
    }

    // Check for rapid succession attempts
    const rapidAttempts = recentAttempts.filter(attempt => 
      Date.now() - attempt.timestamp.getTime() < 300000 // Last 5 minutes
    );
    
    if (rapidAttempts.length > 3) {
      suspiciousIndicators.push('RAPID_ATTEMPTS');
    }

    // Check for new user agent
    const knownUserAgents = new Set(recentAttempts.map(attempt => attempt.userAgent));
    if (!knownUserAgents.has(userAgent) && recentAttempts.length > 0) {
      suspiciousIndicators.push('NEW_USER_AGENT');
    }

    return {
      isSuspicious: suspiciousIndicators.length > 0,
      indicators: suspiciousIndicators,
      riskLevel: suspiciousIndicators.length >= 2 ? 'HIGH' : 
                 suspiciousIndicators.length === 1 ? 'MEDIUM' : 'LOW',
      recentIPs: Array.from(recentIPs),
      recentAttemptsCount: recentAttempts.length
    };
  }

  /**
   * Manually unlock a user account (for admin use)
   * @param {string} email - User email
   * @returns {Object} Unlock result
   */
  async unlockAccount(email) {
    try {
      const user = await User.findOne({ email }).select('+accountLockedUntil +loginAttempts');
      
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (!user.accountLockedUntil) {
        return { success: true, message: 'Account was not locked' };
      }

      user.accountLockedUntil = undefined;
      user.loginAttempts = 0;
      await user.save();

      logger.info('Account manually unlocked', {
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
      });

      return { success: true, message: 'Account unlocked successfully' };
    } catch (error) {
      logger.error('Error unlocking account', { error: error.message, email });
      return { success: false, error: 'Failed to unlock account' };
    }
  }
}

export default new LoginRateLimitService();
