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
      
      // Render-optimized dual-port fallback strategy
      // Primary: User's configured port, Fallback: Alternative port for Render reliability
      const primaryPort = parseInt(process.env.EMAIL_PORT) || 465;
      const fallbackPort = primaryPort === 465 ? 587 : 465;
      
      this.smtpConfigs = [
        // Primary configuration (user's preferred port)
        {
          name: `Gmail ${primaryPort === 465 ? 'SSL' : 'TLS'} (Port ${primaryPort})`,
          config: {
            host: process.env.EMAIL_HOST || 'smtp.gmail.com',
            port: primaryPort,
            secure: primaryPort === 465,
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS
            },
            pool: true,
            maxConnections: 1,
            maxMessages: 10,
            rateLimit: 1,
            connectionTimeout: 12000, // Shorter timeout for faster fallback
            greetingTimeout: 8000,
            socketTimeout: 30000,
            tls: {
              rejectUnauthorized: false
            }
          }
        },
        // Fallback configuration (alternative port for Render)
        {
          name: `Gmail ${fallbackPort === 465 ? 'SSL' : 'TLS'} (Port ${fallbackPort}) - Render Fallback`,
          config: {
            host: process.env.EMAIL_HOST || 'smtp.gmail.com',
            port: fallbackPort,
            secure: fallbackPort === 465,
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS
            },
            pool: true,
            maxConnections: 1,
            maxMessages: 5,
            rateLimit: 1,
            connectionTimeout: 20000, // Longer timeout for fallback
            greetingTimeout: 15000,
            socketTimeout: 60000,
            tls: {
              rejectUnauthorized: false
            }
          }
        }
      ];

      this.currentConfigIndex = 0;

      // Start with primary configuration
      this.transporter = nodemailer.createTransport(this.smtpConfigs[0].config);
      this.currentConfigName = this.smtpConfigs[0].name;

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
   * Try fallback SMTP configuration when primary fails
   */
  tryFallbackConfiguration() {
    if (this.currentConfigIndex < this.smtpConfigs.length - 1) {
      this.currentConfigIndex++;
      const fallbackConfig = this.smtpConfigs[this.currentConfigIndex];
      this.transporter = nodemailer.createTransport(fallbackConfig.config);
      this.currentConfigName = fallbackConfig.name;
      
      logger.info(`Switching to fallback: ${this.currentConfigName}`);
      return true;
    }
    return false;
  }

  /**
   * Reset to primary configuration
   */
  resetToPrimaryConfiguration() {
    this.currentConfigIndex = 0;
    const primaryConfig = this.smtpConfigs[0];
    this.transporter = nodemailer.createTransport(primaryConfig.config);
    this.currentConfigName = primaryConfig.name;
    logger.info(`Reset to primary: ${this.currentConfigName}`);
  }

  /**
   * Send password reset email with dual-port fallback for Render reliability
   */
  async sendPasswordResetEmail(email, resetToken, options = {}) {
    if (!this.isConfigured) {
      logger.error('Email service not configured');
      return { success: false, error: 'Email service not configured' };
    }

    let lastError = null;
    let attempts = 0;
    const maxAttempts = this.smtpConfigs.length;

    // Try primary first, then fallback if needed
    while (attempts < maxAttempts) {
      try {
        attempts++;
        
        logger.info(`Email attempt ${attempts}/${maxAttempts} using ${this.currentConfigName}`);
        
        // Test connection with shorter timeout for faster fallback
        const verifyPromise = this.transporter.verify();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Connection timeout after 12 seconds with ${this.currentConfigName}`)), 12000)
        );
        
        await Promise.race([verifyPromise, timeoutPromise]);
        logger.info(`${this.currentConfigName} connection verified successfully`);

        // Use deep link URL instead of web URL for mobile app
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

        // Send email with timeout protection
        const sendPromise = this.transporter.sendMail(mailOptions);
        const sendTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Email send timeout after 30 seconds with ${this.currentConfigName}`)), 30000)
        );
        
        const result = await Promise.race([sendPromise, sendTimeoutPromise]);
        
        logger.info('Password reset email sent successfully', {
          messageId: result.messageId,
          email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
          configuration: this.currentConfigName,
          attempt: attempts,
          isResend: options.isResend || false
        });

        // Reset to primary config for next time if fallback was used
        if (this.currentConfigIndex !== 0) {
          this.resetToPrimaryConfiguration();
        }

        return { 
          success: true, 
          messageId: result.messageId,
          acceptedRecipients: result.accepted,
          configuration: this.currentConfigName,
          attempt: attempts
        };

      } catch (error) {
        lastError = error;
        
        logger.error(`Email attempt ${attempts}/${maxAttempts} failed with ${this.currentConfigName}`, {
          error: error.message,
          email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
          configuration: this.currentConfigName,
          isResend: options.isResend || false
        });

        // Try fallback configuration if available
        if (attempts < maxAttempts) {
          const hasFallback = this.tryFallbackConfiguration();
          if (!hasFallback) {
            break; // No more configurations to try
          }
          
          // Brief delay before trying fallback
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // All configurations failed
    logger.error('All email configurations failed', {
      totalAttempts: attempts,
      lastError: lastError?.message,
      email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
      allConfigurations: this.smtpConfigs.map(c => c.name)
    });

    // Reset to primary configuration for next time
    this.resetToPrimaryConfiguration();

    return { 
      success: false, 
      error: lastError?.message || 'All email configurations failed',
      totalAttempts: attempts,
      configurationsAttempted: this.smtpConfigs.slice(0, attempts).map(c => c.name)
    };
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

    const results = [];
    let successfulConfig = null;

    // Test both configurations
    for (let i = 0; i < this.smtpConfigs.length; i++) {
      const config = this.smtpConfigs[i];
      const testTransporter = nodemailer.createTransport(config.config);
      
      try {
        const verifyPromise = testTransporter.verify();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Verification timeout after 12 seconds')), 12000)
        );
        
        const startTime = Date.now();
        await Promise.race([verifyPromise, timeoutPromise]);
        const duration = Date.now() - startTime;
        
        results.push({
          configuration: config.name,
          success: true,
          duration: `${duration}ms`,
          message: 'Connection successful'
        });
        
        if (!successfulConfig) {
          successfulConfig = config.name;
        }
        
        logger.info(`${config.name} test successful in ${duration}ms`);
        
      } catch (error) {
        results.push({
          configuration: config.name,
          success: false,
          error: error.message
        });
        
        logger.error(`${config.name} test failed`, { error: error.message });
      }
      
      testTransporter.close();
    }

    return { 
      success: !!successfulConfig,
      message: successfulConfig ? 
        `Working configuration found: ${successfulConfig}` : 
        'All configurations failed - check network and credentials',
      results: results,
      recommendation: successfulConfig ? 
        `Render can use ${successfulConfig} for email delivery` : 
        'Consider checking Render firewall rules or alternative email service',
      renderOptimized: true
    };
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

export default new RenderEmailService();