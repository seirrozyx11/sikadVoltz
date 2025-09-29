/**
 * Email Reply Verification Service
 * 
 * Alternative password reset verification where users reply to email
 * with a simple confirmation code instead of clicking buttons
 */

import logger from '../utils/logger.js';
import User from '../models/User.js';
import crypto from 'crypto';

class EmailReplyVerificationService {
  constructor() {
    this.verificationCodes = new Map(); // In production, use Redis
    this.REPLY_EMAIL = process.env.REPLY_EMAIL || 'noreply@sikadvoltz.app';
    this.VERIFICATION_EXPIRY = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Generate a simple 6-digit verification code for email reply
   */
  generateReplyCode(userEmail, resetToken) {
    // Create a simple 6-digit code based on token
    const hash = crypto.createHash('sha256').update(resetToken + userEmail).digest('hex');
    const code = (parseInt(hash.substring(0, 8), 16) % 900000) + 100000; // 6-digit number
    
    // Store temporarily for verification
    const verificationKey = `${userEmail}:${resetToken}`;
    this.verificationCodes.set(verificationKey, {
      code: code.toString(),
      createdAt: Date.now(),
      verified: false
    });
    
    return code.toString();
  }

  /**
   * Verify a reply code sent by user
   */
  async verifyReplyCode(userEmail, resetToken, providedCode) {
    try {
      const verificationKey = `${userEmail}:${resetToken}`;
      const stored = this.verificationCodes.get(verificationKey);
      
      if (!stored) {
        return {
          success: false,
          error: 'CODE_NOT_FOUND',
          message: 'No verification code found. Please request a new password reset.'
        };
      }
      
      // Check expiry
      if (Date.now() - stored.createdAt > this.VERIFICATION_EXPIRY) {
        this.verificationCodes.delete(verificationKey);
        return {
          success: false,
          error: 'CODE_EXPIRED',
          message: 'Verification code has expired. Please request a new password reset.'
        };
      }
      
      // Check if already verified
      if (stored.verified) {
        return {
          success: false,
          error: 'CODE_ALREADY_USED',
          message: 'This verification code has already been used.'
        };
      }
      
      // Verify code
      if (stored.code !== providedCode.toString()) {
        return {
          success: false,
          error: 'INVALID_CODE',
          message: 'Invalid verification code. Please check your email and try again.'
        };
      }
      
      // Mark as verified
      stored.verified = true;
      this.verificationCodes.set(verificationKey, stored);
      
      logger.info('Email reply verification successful', {
        email: userEmail.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        codeUsed: providedCode
      });
      
      return {
        success: true,
        message: 'Email verification successful. You can now reset your password.'
      };
      
    } catch (error) {
      logger.error('Email reply verification failed', {
        error: error.message,
        email: userEmail.replace(/^(.{2}).*(@.*)$/, '$1***$2')
      });
      
      return {
        success: false,
        error: 'VERIFICATION_ERROR',
        message: 'Error verifying code. Please try again.'
      };
    }
  }

  /**
   * Check if email reply verification is completed for a token
   */
  isEmailVerified(userEmail, resetToken) {
    const verificationKey = `${userEmail}:${resetToken}`;
    const stored = this.verificationCodes.get(verificationKey);
    return stored && stored.verified && (Date.now() - stored.createdAt < this.VERIFICATION_EXPIRY);
  }

  /**
   * Clean up expired verification codes
   */
  cleanupExpiredCodes() {
    const now = Date.now();
    for (const [key, data] of this.verificationCodes.entries()) {
      if (now - data.createdAt > this.VERIFICATION_EXPIRY) {
        this.verificationCodes.delete(key);
      }
    }
  }

  /**
   * Get instructions for email reply verification
   */
  getReplyInstructions(verificationCode) {
    return {
      subject: 'RE: Password Reset - SikadVoltz',
      instructions: [
        '1. Reply to this email with ONLY the verification code below',
        '2. Do not change the subject line',
        '3. Include only the 6-digit code in your reply',
        `4. Your verification code: ${verificationCode}`,
        '5. Send the reply from the same email address'
      ],
      alternativeInstructions: [
        'If replying doesn\'t work:',
        '- Try forwarding this email to yourself on mobile',
        '- Use the manual verification option in the app',
        '- Contact support with this code'
      ]
    };
  }
}

// Cleanup expired codes every 30 minutes
const emailReplyService = new EmailReplyVerificationService();
setInterval(() => {
  emailReplyService.cleanupExpiredCodes();
}, 30 * 60 * 1000);

export default emailReplyService;