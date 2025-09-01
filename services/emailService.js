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
      // Gmail SMTP configuration
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        },
        pool: true, // Use connection pooling
        maxConnections: 5,
        maxMessages: 100,
        rateLimit: 10 // Max 10 emails per second
      });

      this.isConfigured = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
      
      if (this.isConfigured) {
        logger.info('Email service configured successfully');
      } else {
        logger.warn('Email service not configured - missing GMAIL_USER or GMAIL_APP_PASSWORD');
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
        from: `"${process.env.EMAIL_FROM_NAME || 'SikadVoltz Security'}" <${process.env.GMAIL_USER}>`,
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
   * Send password changed confirmation email
   */
  async sendPasswordChangedConfirmation(email, options = {}) {
    if (!this.isConfigured) {
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME || 'SikadVoltz Security'}" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: '✅ Password Changed Successfully - SikadVoltz',
        html: this.getPasswordChangedTemplate(email, options),
        text: this.getPasswordChangedTextTemplate(email, options)
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Password changed confirmation sent', {
        messageId: result.messageId,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
      });

      return { success: true, messageId: result.messageId };

    } catch (error) {
      logger.error('Password changed confirmation failed to send', {
        error: error.message,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * HTML template for password reset email
   */
  getPasswordResetTemplate(resetUrl, email, options = {}) {
    const { firstName = 'User', isResend = false, suspiciousActivity = 'LOW' } = options;
    
    const suspiciousWarning = suspiciousActivity === 'HIGH' ? `
      <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin: 20px 0;">
        <h4 style="color: #856404; margin: 0 0 10px 0;">⚠️ Security Notice</h4>
        <p style="color: #856404; margin: 0; font-size: 14px;">
          We detected some unusual activity on your account. If you didn't request this password reset, 
          please contact our support team immediately.
        </p>
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${isResend ? 'Password Reset Link (Resent)' : 'Reset Your Password'} - SikadVoltz</title>
          <style>
            @media (prefers-color-scheme: dark) {
              .email-container { background-color: #1a1a1a !important; color: #ffffff !important; }
              .email-content { background-color: #2d2d2d !important; color: #ffffff !important; }
              .email-button { background-color: #4a90e2 !important; }
              .email-footer { background-color: #1a1a1a !important; }
            }
            @media screen and (max-width: 600px) {
              .email-container { width: 100% !important; margin: 0 !important; }
              .email-content { padding: 20px !important; }
              .email-button { display: block !important; width: 100% !important; }
            }
          </style>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa;">
          <div class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">🚴‍♀️ SikadVoltz</h1>
              <p style="color: #e8e8e8; margin: 10px 0 0 0; font-size: 16px;">
                ${isResend ? 'Password Reset Link (Resent)' : 'Password Reset Request'}
              </p>
            </div>
            
            <!-- Content -->
            <div class="email-content" style="padding: 40px 30px; background: white;">
              <h2 style="color: #333; margin-bottom: 20px; font-size: 24px;">
                ${isResend ? 'Here\'s your reset link again' : 'Reset Your Password'}
              </h2>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 20px; font-size: 16px;">
                Hello ${firstName},
              </p>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 30px; font-size: 16px;">
                ${isResend ? 
                  'As requested, here is your password reset link again. This link is still valid and will expire in 15 minutes from the original request.' :
                  'We received a request to reset your password for your SikadVoltz account. Click the button below to create a new password:'
                }
              </p>

              ${suspiciousWarning}
              
              <!-- Reset Button -->
              <div style="text-align: center; margin: 40px 0;">
                <a href="${resetUrl}" 
                   class="email-button"
                   style="background: #667eea; color: white; padding: 16px 32px; 
                          text-decoration: none; border-radius: 8px; font-weight: 600;
                          display: inline-block; font-size: 16px; min-height: 44px;
                          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                          transition: all 0.3s ease;">
                  Reset My Password
                </a>
              </div>
              
              <!-- Security Info -->
              <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h4 style="color: #495057; margin: 0 0 15px 0; font-size: 16px;">🔒 Security Information</h4>
                <ul style="color: #6c757d; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.5;">
                  <li>This link will expire in <strong>15 minutes</strong> for your security</li>
                  <li>The link can only be used <strong>once</strong></li>
                  <li>If you didn't request this reset, please ignore this email</li>
                  <li>Your account remains secure and no changes have been made</li>
                </ul>
              </div>
              
              <!-- Fallback Link -->
              <p style="color: #999; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                If the button doesn't work, copy and paste this URL into your browser:<br>
                <span style="word-break: break-all; color: #667eea; font-family: monospace; font-size: 12px;">
                  ${resetUrl}
                </span>
              </p>
            </div>
            
            <!-- Footer -->
            <div class="email-footer" style="background: #f8f9fa; padding: 30px; text-align: center; color: #666;">
              <p style="margin: 0 0 15px 0; font-size: 14px;">
                This email was sent to <strong>${email}</strong>
              </p>
              <p style="margin: 0 0 15px 0; font-size: 14px;">
                © 2025 SikadVoltz. All rights reserved.
              </p>
              <p style="margin: 0; font-size: 12px; color: #999;">
                If you're having trouble with password resets, contact our support team.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Plain text template for password reset email
   */
  getPasswordResetTextTemplate(resetUrl, email, options = {}) {
    const { firstName = 'User', isResend = false } = options;
    
    return `
SikadVoltz - ${isResend ? 'Password Reset Link (Resent)' : 'Password Reset Request'}

Hello ${firstName},

${isResend ? 
  'As requested, here is your password reset link again. This link is still valid and will expire in 15 minutes from the original request.' :
  'We received a request to reset your password for your SikadVoltz account.'
}

To reset your password, visit this link:
${resetUrl}

Security Information:
- This link will expire in 15 minutes for your security
- The link can only be used once
- If you didn't request this reset, please ignore this email
- Your account remains secure and no changes have been made

If you're having trouble, copy and paste the URL above into your browser.

---
© 2025 SikadVoltz. All rights reserved.
This email was sent to ${email}
    `.trim();
  }

  /**
   * HTML template for password changed confirmation
   */
  getPasswordChangedTemplate(email, options = {}) {
    const { firstName = 'User', resetIP = 'Unknown', resetTime = new Date() } = options;
    
    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Changed Successfully - SikadVoltz</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">🚴‍♀️ SikadVoltz</h1>
              <p style="color: #e8f5e8; margin: 10px 0 0 0; font-size: 16px;">Password Changed Successfully</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 40px 30px; background: white;">
              <h2 style="color: #333; margin-bottom: 20px; font-size: 24px;">✅ Password Updated</h2>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 20px; font-size: 16px;">
                Hello ${firstName},
              </p>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 30px; font-size: 16px;">
                Your SikadVoltz account password has been successfully changed. You can now log in with your new password.
              </p>
              
              <!-- Security Details -->
              <div style="background: #e8f5e9; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h4 style="color: #155724; margin: 0 0 15px 0; font-size: 16px;">🔒 Change Details</h4>
                <p style="color: #155724; margin: 0; font-size: 14px; line-height: 1.5;">
                  <strong>When:</strong> ${resetTime.toLocaleString()}<br>
                  <strong>IP Address:</strong> ${resetIP}<br>
                  <strong>Account:</strong> ${email}
                </p>
              </div>
              
              <!-- Security Notice -->
              <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h4 style="color: #856404; margin: 0 0 15px 0;">⚠️ Didn't make this change?</h4>
                <p style="color: #856404; margin: 0; font-size: 14px; line-height: 1.5;">
                  If you didn't change your password, please contact our support team immediately. 
                  Your account security is our priority.
                </p>
              </div>
              
              <p style="color: #666; line-height: 1.6; margin-top: 30px; font-size: 16px;">
                Thank you for keeping your SikadVoltz account secure!
              </p>
            </div>
            
            <!-- Footer -->
            <div style="background: #f8f9fa; padding: 30px; text-align: center; color: #666;">
              <p style="margin: 0 0 15px 0; font-size: 14px;">
                © 2025 SikadVoltz. All rights reserved.
              </p>
              <p style="margin: 0; font-size: 12px; color: #999;">
                This notification was sent to ${email}
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Plain text template for password changed confirmation
   */
  getPasswordChangedTextTemplate(email, options = {}) {
    const { firstName = 'User', resetIP = 'Unknown', resetTime = new Date() } = options;
    
    return `
SikadVoltz - Password Changed Successfully

Hello ${firstName},

Your SikadVoltz account password has been successfully changed. You can now log in with your new password.

Change Details:
- When: ${resetTime.toLocaleString()}
- IP Address: ${resetIP}
- Account: ${email}

SECURITY NOTICE:
If you didn't make this change, please contact our support team immediately. Your account security is our priority.

Thank you for keeping your SikadVoltz account secure!

---
© 2025 SikadVoltz. All rights reserved.
This notification was sent to ${email}
    `.trim();
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
}

export default new EmailService();
