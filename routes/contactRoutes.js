import express from 'express';
import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting to prevent spam
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    success: false,
    error: 'Too many contact form submissions. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/contact/send
 * Send contact form email to SikadVoltz support
 */
router.post('/send', contactLimiter, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Email validation
    const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address'
      });
    }

    // Message length validation
    if (message.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Message must be at least 10 characters long'
      });
    }

    // Configure email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || process.env.EMAIL_FROM || 'sikadvoltz.app@gmail.com',
        pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || process.env.EMAIL_APP_PASSWORD,
      },
    });

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER || process.env.EMAIL_FROM || 'sikadvoltz.app@gmail.com',
      to: 'sikadvoltz.app@gmail.com',
      replyTo: email,
      subject: `[SikadVoltz Contact] ${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #FF6B35 0%, #FF8A50 100%);
              color: white;
              padding: 20px;
              border-radius: 8px 8px 0 0;
              text-align: center;
            }
            .content {
              background: #f9f9f9;
              padding: 20px;
              border: 1px solid #ddd;
              border-top: none;
            }
            .field {
              margin-bottom: 15px;
            }
            .field-label {
              font-weight: bold;
              color: #FF6B35;
              display: block;
              margin-bottom: 5px;
            }
            .field-value {
              background: white;
              padding: 10px;
              border-radius: 4px;
              border-left: 3px solid #FF6B35;
            }
            .message-box {
              background: white;
              padding: 15px;
              border-radius: 4px;
              border-left: 3px solid #FF6B35;
              min-height: 100px;
              white-space: pre-wrap;
              word-wrap: break-word;
            }
            .footer {
              background: #f1f1f1;
              padding: 15px;
              text-align: center;
              font-size: 12px;
              color: #666;
              border-radius: 0 0 8px 8px;
            }
            .timestamp {
              color: #999;
              font-size: 11px;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>🚴 New Contact Form Submission</h2>
            <p>SikadVoltz Support Portal</p>
          </div>
          
          <div class="content">
            <div class="field">
              <span class="field-label">👤 Name:</span>
              <div class="field-value">${name}</div>
            </div>
            
            <div class="field">
              <span class="field-label">📧 Email:</span>
              <div class="field-value">${email}</div>
            </div>
            
            <div class="field">
              <span class="field-label">📋 Subject:</span>
              <div class="field-value">${subject}</div>
            </div>
            
            <div class="field">
              <span class="field-label">💬 Message:</span>
              <div class="message-box">${message}</div>
            </div>
            
            <div class="timestamp">
              ⏰ Received: ${new Date().toLocaleString('en-US', { 
                timeZone: 'Asia/Manila',
                dateStyle: 'full',
                timeStyle: 'long'
              })}
            </div>
          </div>
          
          <div class="footer">
            <p>This email was sent from the SikadVoltz Contact Form</p>
            <p>To reply, use the email address: <strong>${email}</strong></p>
          </div>
        </body>
        </html>
      `,
      text: `
SikadVoltz Contact Form Submission

Name: ${name}
Email: ${email}
Subject: ${subject}

Message:
${message}

---
Received: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
Reply to: ${email}
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    logger.info('📧 Contact form email sent successfully', {
      messageId: info.messageId,
      from: email,
      subject: subject,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Your message has been sent successfully! We\'ll get back to you within 24-48 hours.',
      messageId: info.messageId
    });

  } catch (error) {
    logger.error('❌ Error sending contact form email:', {
      error: error.message,
      stack: error.stack
    });

    // Check for specific email errors
    if (error.code === 'EAUTH') {
      return res.status(500).json({
        success: false,
        error: 'Email service authentication failed. Please contact the administrator.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to send message. Please try again later or email us directly at sikadvoltz.app@gmail.com'
    });
  }
});

/**
 * GET /api/contact/test
 * Test endpoint to verify email configuration (development only)
 */
router.get('/test', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Test endpoint disabled in production'
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || process.env.EMAIL_FROM || 'sikadvoltz.app@gmail.com',
        pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || process.env.EMAIL_APP_PASSWORD,
      },
    });

    await transporter.verify();

    res.json({
      success: true,
      message: 'Email service is configured correctly',
      config: {
        service: 'gmail',
        user: process.env.EMAIL_USER || process.env.EMAIL_FROM || 'sikadvoltz.app@gmail.com',
        passwordConfigured: !!(process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || process.env.EMAIL_APP_PASSWORD)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Email service configuration error',
      details: error.message
    });
  }
});

export default router;
