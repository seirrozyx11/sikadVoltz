/**
 * Render-Optimized Email Service for Password Rese      // Create transporter with the configured settings
      this.transporter = nodemailer.createTransporter(this.smtpConfig.config);
      this.currentConfigName = this.smtpConfig.name;* 
 * Enhanced email service with multiple SMTP configurations,
 * automatic failover, and Render-specific optimizations.
 */

import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

class RenderEmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.currentConfigIndex = 0;
    this.currentConfigName = '';
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
      
      // Use the configured port from Render environment variables
      const configuredPort = parseInt(process.env.EMAIL_PORT) || 587; // Default to 587 if not set
      const isSecure = configuredPort === 465; // SSL for 465, TLS for 587
      
      // Single configuration using Render environment settings
      this.smtpConfig = {
        name: `Gmail ${isSecure ? 'SSL' : 'TLS'} (Port ${configuredPort})`,
        config: {
          host: process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: configuredPort,
          secure: isSecure,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          },
          pool: true,
          maxConnections: 1,
          maxMessages: 10,
          rateLimit: 1,
          connectionTimeout: 8000, // Optimized timeout for faster failure detection
          greetingTimeout: 5000,
          socketTimeout: 30000,
          tls: {
            rejectUnauthorized: false
          }
        }
      };

      // Create transporter with the configured settings
      this.transporter = nodemailer.createTransport(this.smtpConfig.config);
      this.currentConfigName = this.smtpConfig.name;

      this.isConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
      
      if (this.isConfigured) {
        logger.info(`Render email service configured with ${this.currentConfigName}`);
      } else {
        logger.warn('Email service not configured - missing EMAIL_USER or EMAIL_PASS');
      }
    } catch (error) {
      logger.error('Email service setup failed', { error: error.message });
      this.isConfigured = false;
    }
  }

  /**
   * Recreate transporter if needed (for connection issues)
   */
  recreateTransporter() {
    try {
      if (this.transporter) {
        this.transporter.close();
      }
      this.transporter = nodemailer.createTransport(this.smtpConfig.config);
      logger.info(`Email transporter recreated: ${this.currentConfigName}`);
      return true;
    } catch (error) {
      logger.error('Failed to recreate email transporter', { error: error.message });
      return false;
    }
  }

  /**
   * Send password reset email with dual-port fallback for Render reliability
   */
  async sendPasswordResetEmail(email, resetToken, options = {}) {
    if (!this.isConfigured) {
      logger.error('Email service not configured');
      return { success: false, error: 'Email service not configured' };
    }

    // Prepare email options outside try block to avoid scope issues
    const resetUrl = `sikadvoltz://reset-password?token=${resetToken}`;
    const mailOptions = {
      from: `"SikadVoltz Security" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: options.isResend ? 
        'Password Reset Link (Resent) - SikadVoltz' : 
        'Reset Your SikadVoltz Password',
      html: this.getPasswordResetTemplate(resetUrl, email, options),
      text: this.getPasswordResetTextTemplate(resetUrl, email, options)
    };

    // Try sending email with optimized timeout and retry logic
    return await this.attemptEmailSend(mailOptions, email, options);
  }

  /**
   * Attempt to send email with smart retry logic
   */
  async attemptEmailSend(mailOptions, email, options, isRetry = false) {
    try {
      const attempt = isRetry ? 'retry' : 'initial';
      logger.info(`Sending password reset email (${attempt}) using ${this.currentConfigName}`);
      
      // Quick connection test with reduced timeout (8 seconds)
      const verifyPromise = this.transporter.verify();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Connection timeout after 8 seconds with ${this.currentConfigName}`)), 8000)
      );
      
      await Promise.race([verifyPromise, timeoutPromise]);
      logger.info(`${this.currentConfigName} connection verified successfully`);

      // Send email with timeout protection (25 seconds)
      const sendPromise = this.transporter.sendMail(mailOptions);
      const sendTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Email send timeout after 25 seconds with ${this.currentConfigName}`)), 25000)
      );
      
      const result = await Promise.race([sendPromise, sendTimeoutPromise]);
      
      logger.info(`Password reset email sent successfully${isRetry ? ' on retry' : ''}`, {
        messageId: result.messageId,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        configuration: this.currentConfigName,
        isResend: options.isResend || false,
        retried: isRetry
      });

      return { 
        success: true, 
        messageId: result.messageId,
        acceptedRecipients: result.accepted,
        configuration: this.currentConfigName,
        retried: isRetry
      };

    } catch (error) {
      logger.error(`Email send failed (${isRetry ? 'retry' : 'initial'}) with ${this.currentConfigName}`, {
        error: error.message,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        isResend: options.isResend || false
      });

      // Only attempt retry on first failure and if it's a connection issue
      if (!isRetry && (error.message.includes('timeout') || error.message.includes('connection'))) {
        logger.info('Connection issue detected, attempting one retry with fresh transporter...');
        
        // Recreate transporter for retry
        const recreated = this.recreateTransporter();
        if (recreated) {
          // Short delay before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          return await this.attemptEmailSend(mailOptions, email, options, true);
        }
      }

      // Final failure
      return { 
        success: false, 
        error: error.message || 'Email send failed',
        configuration: this.currentConfigName,
        finalAttempt: true
      };
    }
  }

  /**
   * Test both email configurations for Render compatibility
   */
  async testEmailConfiguration() {
    if (!this.isConfigured) {
      return { 
        success: false, 
        error: 'Email service not configured - missing EMAIL_USER or EMAIL_PASS',
        details: {
          EMAIL_USER: process.env.EMAIL_USER ? 'Set' : 'Missing',
          EMAIL_PASS: process.env.EMAIL_PASS ? 'Set' : 'Missing',
          EMAIL_HOST: process.env.EMAIL_HOST || 'Using gmail defaults',
          EMAIL_PORT: process.env.EMAIL_PORT || 'Using gmail defaults'
        }
      };
    }

    try {
      logger.info(`Testing email configuration: ${this.currentConfigName}`);
      
      const verifyPromise = this.transporter.verify();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Verification timeout after 15 seconds')), 15000)
      );
      
      const startTime = Date.now();
      await Promise.race([verifyPromise, timeoutPromise]);
      const duration = Date.now() - startTime;
      
      logger.info(`${this.currentConfigName} test successful in ${duration}ms`);
      
      return { 
        success: true,
        message: `Email configuration working: ${this.currentConfigName}`,
        configuration: this.currentConfigName,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
        renderOptimized: false, // Single config, not dual-port
        recommendation: `Using configured port ${process.env.EMAIL_PORT || 587} as specified in Render environment`,
        hostingEnvironment: process.env.NODE_ENV === 'production' ? 'Render Production' : 'Local Development'
      };
      
    } catch (error) {
      logger.error(`${this.currentConfigName} test failed`, { error: error.message });
      
      return { 
        success: false,
        error: error.message,
        configuration: this.currentConfigName,
        timestamp: new Date().toISOString(),
        recommendation: 'Check network connectivity, SMTP credentials, or Render firewall rules',
        hostingEnvironment: process.env.NODE_ENV === 'production' ? 'Render Production' : 'Local Development'
      };
    }
  }

  // Template methods (same as before)
  getPasswordResetTemplate(resetUrl, email, options = {}) {
    const isResend = options.isResend || false;
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your SikadVoltz Password</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #92A3FD 0%, #9DCEFF 100%); padding: 40px 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">SikadVoltz</h1>
                <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Password Reset ${isResend ? '(Resent)' : 'Request'}</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 40px 30px;">
                <h2 style="color: #333; margin-bottom: 20px;">Reset Your Password</h2>
                
                ${isResend ? 
                  '<p style="color: #666; margin-bottom: 20px;"><strong>This is a resent password reset link.</strong></p>' : 
                  ''
                }
                
                <p style="color: #666; margin-bottom: 20px;">
                    We received a request to reset your password for your SikadVoltz account. 
                    Click the button below to create a new password.
                </p>
                
                <!-- Mobile App Instructions -->
                <div style="background-color: #f8f9ff; border-left: 4px solid #92A3FD; padding: 20px; margin: 20px 0;">
                    <h3 style="color: #333; margin-top: 0;">Mobile App Instructions:</h3>
                    <p style="color: #666; margin-bottom: 10px;">
                        This link will open directly in your SikadVoltz mobile app where you can securely reset your password.
                    </p>
                    <p style="color: #666; margin: 0;">
                        If the app doesn't open automatically, make sure you have the SikadVoltz app installed on your device.
                    </p>
                </div>
                
                <!-- Reset Button -->
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" 
                       style="display: inline-block; background: linear-gradient(135deg, #92A3FD 0%, #9DCEFF 100%); 
                              color: white; text-decoration: none; padding: 15px 30px; border-radius: 25px; 
                              font-weight: bold; font-size: 16px;">
                        Reset Password in App
                    </a>
                </div>
                
                <!-- Alternative Instructions -->
                <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
                    <p style="color: #856404; margin: 0; font-size: 14px;">
                        <strong>Can't click the button?</strong> Copy and paste this link into your mobile browser, 
                        and it will redirect to the SikadVoltz app: <br>
                        <code style="background-color: #f8f9fa; padding: 2px 4px; border-radius: 3px; word-break: break-all;">${resetUrl}</code>
                    </p>
                </div>
                
                <!-- Security Notice -->
                <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                    <p style="color: #999; font-size: 14px; margin-bottom: 10px;">
                        <strong>Security Notice:</strong>
                    </p>
                    <ul style="color: #999; font-size: 14px; margin: 0;">
                        <li>This link expires in 15 minutes for your security</li>
                        <li>You can only use this link once</li>
                        <li>If you didn't request this reset, please ignore this email</li>
                    </ul>
                </div>
                
                <!-- Footer -->
                <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
                    <p style="color: #999; font-size: 12px; margin: 0;">
                        This email was sent to ${email.replace(/^(.{2}).*(@.*)$/, '$1***$2')}
                    </p>
                    <p style="color: #999; font-size: 12px; margin: 5px 0 0 0;">
                        © ${new Date().getFullYear()} SikadVoltz. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  getPasswordResetTextTemplate(resetUrl, email, options = {}) {
    const isResend = options.isResend || false;
    
    return `
SikadVoltz - Password Reset ${isResend ? '(Resent)' : 'Request'}

Hi there!

We received a request to reset your password for your SikadVoltz account.

To reset your password, click or copy this link into your mobile browser:
${resetUrl}

MOBILE APP INSTRUCTIONS:
This link will open directly in your SikadVoltz mobile app where you can securely reset your password.

SECURITY NOTICE:
- This link expires in 15 minutes for your security
- You can only use this link once  
- If you didn't request this reset, please ignore this email

Need help? Contact our support team.

© ${new Date().getFullYear()} SikadVoltz. All rights reserved.
    `;
  }
}

export default new RenderEmailService();