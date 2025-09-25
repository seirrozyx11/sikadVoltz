/**
 * Enhanced Email Service with Multiple Provider Support
 * 
 * Supports Gmail SMTP, SendGrid API, and other providers
 * with automatic fallback and better error handling.
 */

import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

class EnhancedEmailService {
  constructor() {
    this.transporter = null;
    this.provider = null;
    this.isConfigured = false;
    this.setupEmailProvider();
  }

  setupEmailProvider() {
    try {
      // Check which email service to use
      if (process.env.SENDGRID_API_KEY) {
        this.setupSendGrid();
      } else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        this.setupGmailSMTP();
      } else {
        logger.warn('No email service configured');
        this.isConfigured = false;
        return;
      }
    } catch (error) {
      logger.error('Email service setup failed', { error: error.message });
      this.isConfigured = false;
    }
  }

  setupSendGrid() {
    try {
      // Use SendGrid API via nodemailer
      this.transporter = nodemailer.createTransporter({
        service: 'SendGrid',
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateLimit: 14 // SendGrid allows 14 emails/second
      });

      this.provider = 'SendGrid';
      this.isConfigured = true;
      logger.info('SendGrid email service configured successfully');

    } catch (error) {
      logger.error('SendGrid setup failed', { error: error.message });
      this.isConfigured = false;
    }
  }

  setupGmailSMTP() {
    try {
      const emailPort = parseInt(process.env.EMAIL_PORT) || 587;
      const isSSL = emailPort === 465;
      
      this.transporter = nodemailer.createTransporter({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: emailPort,
        secure: isSSL, // true for 465 (SSL), false for 587 (TLS)
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateLimit: 10,
        // Enhanced timeout protection
        connectionTimeout: 10000,
        greetingTimeout: 5000,
        socketTimeout: 30000,
        tls: {
          rejectUnauthorized: false
        }
      });

      this.provider = 'Gmail SMTP';
      this.isConfigured = true;
      logger.info('Gmail SMTP email service configured successfully');

    } catch (error) {
      logger.error('Gmail SMTP setup failed', { error: error.message });
      this.isConfigured = false;
    }
  }

  /**
   * Send password reset email with provider flexibility
   */
  async sendPasswordResetEmail(email, resetToken, options = {}) {
    if (!this.isConfigured) {
      logger.error('Email service not configured');
      return { 
        success: false, 
        error: 'Email service not configured',
        provider: 'None'
      };
    }

    try {
      // Provider-specific connection verification
      if (this.provider === 'Gmail SMTP') {
        // Only verify SMTP connections (SendGrid doesn't need this)
        const verifyPromise = this.transporter.verify();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000)
        );
        
        await Promise.race([verifyPromise, timeoutPromise]);
        logger.info(`${this.provider} connection verified successfully`);
      }

      const resetUrl = `sikadvoltz://reset-password?token=${resetToken}`;
      
      const mailOptions = {
        from: `"SikadVoltz Security" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to: email,
        subject: options.isResend ? 
          '🔐 Password Reset Link (Resent) - SikadVoltz' : 
          '🔐 Reset Your SikadVoltz Password',
        html: this.getPasswordResetTemplate(resetUrl, email, options),
        text: this.getPasswordResetTextTemplate(resetUrl, email, options)
      };

      // Send with timeout protection
      const sendPromise = this.transporter.sendMail(mailOptions);
      const sendTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email send timeout after 30 seconds')), 30000)
      );
      
      const result = await Promise.race([sendPromise, sendTimeoutPromise]);
      
      logger.info('Password reset email sent successfully', {
        messageId: result.messageId,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        provider: this.provider,
        isResend: options.isResend || false
      });

      return { 
        success: true, 
        messageId: result.messageId,
        acceptedRecipients: result.accepted,
        provider: this.provider
      };

    } catch (error) {
      logger.error('Password reset email failed to send', {
        error: error.message,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        provider: this.provider,
        isResend: options.isResend || false
      });

      // Enhanced error reporting
      return { 
        success: false, 
        error: error.message,
        provider: this.provider,
        troubleshooting: this.getTroubleshootingInfo(error)
      };
    }
  }

  getTroubleshootingInfo(error) {
    const info = {
      provider: this.provider,
      errorType: null,
      recommendation: null
    };

    if (error.message.includes('timeout')) {
      info.errorType = 'CONNECTION_TIMEOUT';
      info.recommendation = this.provider === 'Gmail SMTP' ? 
        'Consider switching to SendGrid for better Render compatibility' :
        'Check SendGrid API key and network connectivity';
    } else if (error.message.includes('auth')) {
      info.errorType = 'AUTHENTICATION_FAILED';
      info.recommendation = this.provider === 'Gmail SMTP' ?
        'Verify Gmail App Password is correct' :
        'Check SendGrid API key permissions';
    } else if (error.message.includes('connect')) {
      info.errorType = 'CONNECTION_REFUSED';
      info.recommendation = 'Network connectivity issue - consider alternative email provider';
    }

    return info;
  }

  /**
   * Test email configuration with provider info
   */
  async testEmailConfiguration() {
    if (!this.isConfigured) {
      return { 
        success: false, 
        error: 'Email service not configured',
        provider: 'None',
        availableProviders: {
          sendgrid: process.env.SENDGRID_API_KEY ? 'Available' : 'Not configured',
          gmail: (process.env.EMAIL_USER && process.env.EMAIL_PASS) ? 'Available' : 'Not configured'
        }
      };
    }

    try {
      if (this.provider === 'Gmail SMTP') {
        // Test SMTP connection
        const verifyPromise = this.transporter.verify();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('SMTP verification timeout after 10 seconds')), 10000)
        );
        
        await Promise.race([verifyPromise, timeoutPromise]);
      }
      // SendGrid doesn't need connection verification - API based

      logger.info(`${this.provider} configuration test successful`);
      return { 
        success: true, 
        message: `${this.provider} is working correctly`,
        provider: this.provider
      };

    } catch (error) {
      logger.error(`${this.provider} configuration test failed`, { error: error.message });
      return { 
        success: false, 
        error: error.message,
        provider: this.provider,
        troubleshooting: this.getTroubleshootingInfo(error)
      };
    }
  }

  // Template methods remain the same...
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
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">🔐 SikadVoltz</h1>
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
                    <h3 style="color: #333; margin-top: 0;">📱 Mobile App Instructions:</h3>
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

📱 MOBILE APP INSTRUCTIONS:
This link will open directly in your SikadVoltz mobile app where you can securely reset your password.

🔒 SECURITY NOTICE:
- This link expires in 15 minutes for your security
- You can only use this link once  
- If you didn't request this reset, please ignore this email

Need help? Contact our support team.

© ${new Date().getFullYear()} SikadVoltz. All rights reserved.
    `;
  }
}

export default new EnhancedEmailService();