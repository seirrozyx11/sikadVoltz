/**
 * Email Service for Password Reset
 * 
 * Professional email service using Gmail SMTP with responsive templates
 * and comprehensive tracking for password reset functionality.
 */

import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.setupTransporter();
  }

  setupTransporter() {
    try {
      // Debug logging
      console.log('DEBUG - Email environment variables:');
      console.log('EMAIL_USER:', process.env.EMAIL_USER);
      console.log('EMAIL_HOST:', process.env.EMAIL_HOST);
      console.log('EMAIL_PORT:', process.env.EMAIL_PORT);
      console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'Set' : 'Not set');
      
      // Gmail SMTP configuration
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        pool: true, // Use connection pooling
        maxConnections: 5,
        maxMessages: 100,
        rateLimit: 10 // Max 10 emails per second
      });

      this.isConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
      
      if (this.isConfigured) {
        logger.info('Email service configured successfully');
      } else {
        logger.warn('Email service not configured - missing EMAIL_USER or EMAIL_PASS');
      }
    } catch (error) {
      logger.error('Email service setup failed', { error: error.message });
      this.isConfigured = false;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email, resetToken, options = {}) {
    if (!this.isConfigured) {
      logger.error('Email service not configured');
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:8082'}/reset-password?token=${resetToken}`;
      
      const mailOptions = {
        from: `"SikadVoltz Security" <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: options.isResend ? 
          '🔐 Password Reset Link (Resent) - SikadVoltz' : 
          '🔐 Reset Your SikadVoltz Password',
        html: this.getPasswordResetTemplate(resetUrl, email, options),
        text: this.getPasswordResetTextTemplate(resetUrl, email, options)
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Password reset email sent successfully', {
        messageId: result.messageId,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        isResend: options.isResend || false
      });

      return { 
        success: true, 
        messageId: result.messageId,
        acceptedRecipients: result.accepted
      };

    } catch (error) {
      logger.error('Password reset email failed to send', {
        error: error.message,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        isResend: options.isResend || false
      });

      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Test email configuration
   */
  async testEmailConfiguration() {
    if (!this.isConfigured) {
      return { success: false, error: 'Email service not configured' };
    }

    try {
      await this.transporter.verify();
      logger.info('Email configuration test successful');
      return { success: true, message: 'Email service is working correctly' };
    } catch (error) {
      logger.error('Email configuration test failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  // Simplified templates for now
  getPasswordResetTemplate(resetUrl, email, options = {}) {
    return `<h1>Reset Password</h1><p>Click <a href="${resetUrl}">here</a> to reset your password.</p>`;
  }

  getPasswordResetTextTemplate(resetUrl, email, options = {}) {
    return `Reset your password: ${resetUrl}`;
  }
}

export default new EmailService();
