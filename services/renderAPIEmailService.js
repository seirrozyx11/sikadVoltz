/**
 * Render-Compatible Email Service using SendGrid API
 * 
 * Uses SendGrid's Web API instead of SMTP to bypass Render's SMTP restrictions.
 * This is the recommended approach for hosting platforms like Render, Heroku, Vercel.
 */

import logger from '../utils/logger.js';

class RenderAPIEmailService {
  constructor() {
    this.isConfigured = false;
    this.provider = 'None';
    this.setupEmailProvider();
  }

  setupEmailProvider() {
    try {
      // Check if SendGrid API key is available
      if (process.env.SENDGRID_API_KEY) {
        this.setupSendGridAPI();
      } else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        logger.warn('SMTP credentials found but may not work on Render. Consider using SendGrid API.');
        this.setupGmailSMTP();
      } else {
        logger.warn('No email service configured. Set SENDGRID_API_KEY for Render compatibility.');
        this.isConfigured = false;
      }
    } catch (error) {
      logger.error('Email service setup failed', { error: error.message });
      this.isConfigured = false;
    }
  }

  /**
   * Setup SendGrid API (recommended for Render)
   */
  setupSendGridAPI() {
    this.provider = 'SendGrid API';
    this.isConfigured = true;
    this.apiKey = process.env.SENDGRID_API_KEY;
    
    // Prioritize EMAIL_FROM for SendGrid, fallback to verified sender
    this.fromEmail = process.env.EMAIL_FROM || 'sikadvoltz.app@gmail.com';
    
    logger.info('SendGrid API email service configured (Render-compatible)', {
      fromEmail: this.fromEmail.replace(/^(.{8}).*(@.*)$/, '$1***$2'),
      fullFromEmail: this.fromEmail, // Debug: show full email
      provider: 'SendGrid API'
    });
  }

  /**
   * Fallback to SMTP (may not work on Render)
   */
  setupGmailSMTP() {
    // Import the existing render email service for SMTP fallback
    this.provider = 'Gmail SMTP (Fallback)';
    this.isConfigured = true;
    
    logger.warn('Using SMTP fallback - may not work on Render due to port restrictions');
  }

  /**
   * Send password reset email using SendGrid API
   */
  async sendPasswordResetEmail(email, resetToken, options = {}) {
    if (!this.isConfigured) {
      logger.error('Email service not configured');
      return { success: false, error: 'Email service not configured' };
    }

    if (this.provider === 'SendGrid API') {
      return await this.sendViaSendGridAPI(email, resetToken, options);
    } else {
      // Fallback to SMTP (will likely fail on Render)
      return await this.sendViaSMTP(email, resetToken, options);
    }
  }

  /**
   * Send email via SendGrid Web API (Render-compatible)
   */
  async sendViaSendGridAPI(email, resetToken, options = {}) {
    try {
      logger.info('Sending password reset email via SendGrid API');

      const resetUrl = `sikadvoltz://reset-password?token=${resetToken}`;
      
      const emailData = {
        personalizations: [{
          to: [{ email: email }],
          subject: options.isResend ? 
            '🔐 Password Reset Link (Resent) - SikadVoltz' : 
            '🔐 Reset Your SikadVoltz Password'
        }],
        from: { 
          email: this.fromEmail,
          name: 'SikadVoltz Security'
        },
        content: [
          {
            type: 'text/plain', 
            value: this.getPasswordResetTextTemplate(resetUrl, email, options)
          },
          {
            type: 'text/html',
            value: this.getPasswordResetTemplate(resetUrl, email, options)
          }
        ]
      };

      // Send via SendGrid API
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData)
      });

      if (response.ok) {
        const messageId = response.headers.get('x-message-id') || 'sendgrid-' + Date.now();
        
        logger.info('Password reset email sent successfully via SendGrid API', {
          messageId,
          email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
          provider: 'SendGrid API',
          isResend: options.isResend || false
        });

        return {
          success: true,
          messageId,
          provider: 'SendGrid API',
          acceptedRecipients: [email]
        };
      } else {
        const errorText = await response.text();
        throw new Error(`SendGrid API error: ${response.status} - ${errorText}`);
      }

    } catch (error) {
      logger.error('SendGrid API email send failed', {
        error: error.message,
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        provider: 'SendGrid API'
      });

      return {
        success: false,
        error: error.message,
        provider: 'SendGrid API'
      };
    }
  }

  /**
   * Fallback to SMTP (will likely fail on Render)
   */
  async sendViaSMTP(email, resetToken, options = {}) {
    try {
      // Dynamic import to avoid circular dependencies
      const { default: renderEmailService } = await import('./renderEmailService.js');
      
      logger.warn('Attempting SMTP fallback (may fail on Render)...');
      const result = await renderEmailService.sendPasswordResetEmail(email, resetToken, options);
      
      if (result.success) {
        result.provider = 'Gmail SMTP (Fallback)';
      }
      
      return result;
    } catch (error) {
      logger.error('SMTP fallback failed', { error: error.message });
      return {
        success: false,
        error: `SMTP fallback failed: ${error.message}`,
        provider: 'Gmail SMTP (Fallback)'
      };
    }
  }

  /**
   * Test email configuration
   */
  async testEmailConfiguration() {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Email service not configured',
        recommendations: {
          'For Render': 'Set SENDGRID_API_KEY environment variable',
          'SendGrid Setup': 'Create free SendGrid account and get API key',
          'Alternative': 'Use Mailgun, SES, or other API-based email services'
        }
      };
    }

    if (this.provider === 'SendGrid API') {
      try {
        // Test SendGrid API connectivity
        const response = await fetch('https://api.sendgrid.com/v3/user/profile', {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        });

        if (response.ok) {
          return {
            success: true,
            message: 'SendGrid API is working correctly',
            provider: 'SendGrid API',
            renderCompatible: true
          };
        } else {
          return {
            success: false,
            error: `SendGrid API authentication failed: ${response.status}`,
            provider: 'SendGrid API'
          };
        }
      } catch (error) {
        return {
          success: false,
          error: `SendGrid API test failed: ${error.message}`,
          provider: 'SendGrid API'
        };
      }
    } else {
      // Test SMTP fallback
      const { default: renderEmailService } = await import('./renderEmailService.js');
      const result = await renderEmailService.testEmailConfiguration();
      result.provider = 'Gmail SMTP (Fallback)';
      result.renderCompatible = false;
      result.warning = 'SMTP may not work on Render due to port restrictions';
      return result;
    }
  }

  // Template methods (same as other services)
  getPasswordResetTemplate(resetUrl, email, options = {}) {
    const isResend = options.isResend || false;
    
    // Extract token from resetUrl for fallback display
    const tokenMatch = resetUrl.match(/token=([^&]+)/);
    const resetToken = tokenMatch ? tokenMatch[1] : 'TOKEN_NOT_FOUND';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="x-apple-disable-message-reformatting">
        <meta name="format-detection" content="telephone=no">
        <title>Reset Your SikadVoltz Password</title>
        <style>
            /* Mobile-specific styles */
            @media only screen and (max-width: 600px) {
                .mobile-center { text-align: center !important; }
                .mobile-padding { padding: 10px !important; }
                .mobile-font { font-size: 16px !important; }
            }
            /* Ensure links are clickable */
            a { color: #92A3FD !important; }
            .button-link { 
                color: white !important; 
                text-decoration: none !important;
                -webkit-text-size-adjust: none;
            }
        </style>
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
                </div>
                
                <!-- Reset Button - Mobile Optimized -->
                <div style="text-align: center; margin: 30px 0;">
                    <!-- Wrapper table for better email client compatibility -->
                    <table role="presentation" style="margin: 0 auto;">
                        <tr>
                            <td style="background: linear-gradient(135deg, #92A3FD 0%, #9DCEFF 100%); 
                                       background-color: #92A3FD; border-radius: 25px; text-align: center;">
                                <a href="${resetUrl}" 
                                   class="button-link"
                                   style="display: inline-block; color: white !important; text-decoration: none !important; 
                                          padding: 18px 35px; border-radius: 25px; font-weight: bold; 
                                          font-size: 18px; line-height: 1.2; mso-hide: all; 
                                          -webkit-text-size-adjust: none; -webkit-touch-callout: default;">
                                    🔐 Reset Password in App
                                </a>
                            </td>
                        </tr>
                    </table>
                </div>
                
                <!-- Fallback Link for Email Clients -->
                <div style="text-align: center; margin: 15px 0;">
                    <p style="color: #666; font-size: 14px; margin-bottom: 10px;">
                        <strong>Can't click the button above?</strong>
                    </p>
                    <div style="background-color: #f8f9ff; border: 1px solid #92A3FD; border-radius: 8px; 
                                padding: 15px; margin: 10px 0; word-break: break-all;">
                        <p style="color: #333; font-size: 14px; margin: 0 0 8px 0;">
                            Copy and open this link in your mobile browser:
                        </p>
                        <a href="${resetUrl}" style="color: #92A3FD; text-decoration: underline; 
                                                    font-family: monospace; font-size: 13px; word-break: break-all;">
                            ${resetUrl}
                        </a>
                    </div>
                </div>
                
                <!-- Alternative Verification Methods -->
                <div style="background-color: #f8f9ff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="color: #333; margin-top: 0;">� Multiple Ways to Reset Your Password</h3>
                    
                    ${options.replyCode ? `
                    <!-- Method 1: Email Reply -->
                    <div style="background-color: #ffffff; border-left: 4px solid #4CAF50; padding: 15px; margin: 10px 0;">
                        <strong style="color: #333;">✉️ Method 1: Reply to this Email (Recommended)</strong><br>
                        <span style="color: #666; font-size: 13px;">Simply reply to this email with ONLY this code:</span><br>
                        <div style="background-color: #f0f8f0; border: 2px solid #4CAF50; border-radius: 8px; padding: 10px; margin: 8px 0; text-align: center;">
                            <code style="font-size: 18px; font-weight: bold; color: #2E7D32; font-family: monospace;">
                                ${options.replyCode}
                            </code>
                        </div>
                        <span style="color: #666; font-size: 12px;">
                            • Don't change the subject line<br>
                            • Include only the 6-digit code above<br>
                            • Reply from the same email address
                        </span>
                    </div>
                    ` : ''}
                    
                    <!-- Method 2: Manual Token Entry -->
                    <div style="background-color: #ffffff; border-left: 4px solid #92A3FD; padding: 15px; margin: 10px 0;">
                        <strong style="color: #333;">📱 Method 2: Manual Token Entry</strong><br>
                        <span style="color: #666; font-size: 13px;">Open this webpage on any device to get your reset token:</span><br>
                        ${options.manualVerifyUrl ? `
                        <div style="margin: 8px 0;">
                            <a href="${options.manualVerifyUrl}" 
                               style="color: #92A3FD; text-decoration: underline; font-size: 13px; word-break: break-all;">
                                Manual Reset Page →
                            </a>
                        </div>
                        ` : ''}
                        <span style="color: #666; font-size: 12px;">
                            • Works on any device (PC, mobile, tablet)<br>
                            • Copy token and paste in SikadVoltz app<br>
                            • No email client issues
                        </span>
                    </div>
                    
                    <!-- Method 3: Forward Email -->
                    <div style="background-color: #ffffff; border-left: 4px solid #FF9800; padding: 15px; margin: 10px 0;">
                        <strong style="color: #333;">📧 Method 3: Forward This Email</strong><br>
                        <span style="color: #666; font-size: 13px;">Forward this email to your mobile device and try the button again</span><br>
                        <span style="color: #666; font-size: 12px;">
                            • Sometimes works better on different email apps<br>
                            • Try Gmail mobile app if using web version<br>
                            • Button works better on mobile devices
                        </span>
                    </div>
                    
                    <!-- Method 4: Contact Support -->
                    <div style="background-color: #ffffff; border-left: 4px solid #9E9E9E; padding: 15px; margin: 10px 0;">
                        <strong style="color: #333;">🆘 Method 4: Contact Support</strong><br>
                        <span style="color: #666; font-size: 13px;">If none of the above work, contact support with this reference:</span><br>
                        <code style="background-color: #f0f0f0; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 11px;">
                            REF: ${resetToken.substring(0, 16)}...
                        </code><br>
                        <span style="color: #666; font-size: 12px;">
                            • Include this reference number<br>
                            • We can manually verify your identity<br>
                            • Available 24/7 through the app
                        </span>
                    </div>
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

© ${new Date().getFullYear()} SikadVoltz. All rights reserved.
    `;
  }
}

export default new RenderAPIEmailService();