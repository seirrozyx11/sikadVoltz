import express from 'express';
import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import rateLimit from 'express-rate-limit';
import Contact from '../models/Contact.js';

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
  let contactRecord = null;
  
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

    // 1. FIRST: Save to database
    contactRecord = new Contact({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim(),
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      // Auto-categorize based on subject keywords
      category: _categorizeMessage(subject, message)
    });

    await contactRecord.save();
    logger.info(`Contact form submitted: ${contactRecord._id} from ${email}`);

    // 2. SECOND: Send email notification
    let emailSent = false;
    let emailError = null;

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

    // Temporarily disable email for capstone demo - focus on database storage
    emailSent = false;
    emailError = 'Email notifications disabled for demo - all messages saved to database';

    // Update database record
    contactRecord.emailSent = false;
    contactRecord.emailError = emailError;
    await contactRecord.save();

    logger.info('✅ Contact form saved to database (email disabled for demo)', {
      contactId: contactRecord._id,
      from: email,
      subject: subject,
      category: contactRecord.category,
      timestamp: new Date().toISOString()
    });

    // Always respond with success since we saved to database
    // Even if email fails, the message is still recorded
    res.json({
      success: true,
      message: emailSent 
        ? 'Your message has been sent successfully! We\'ll get back to you within 24-48 hours.'
        : 'Your message has been received and saved! We\'ll get back to you within 24-48 hours.',
      contactId: contactRecord._id,
      emailSent: emailSent,
      timestamp: contactRecord.createdAt
    });

  } catch (error) {
    logger.error('❌ Error processing contact form:', {
      error: error.message,
      stack: error.stack
    });

    // If this is a database error and no contact record was created
    if (!contactRecord) {
      return res.status(500).json({
        success: false,
        error: 'Failed to save your message. Please try again later or email us directly at sikadvoltz.app@gmail.com'
      });
    }

    // If contact was saved but there was another error
    res.status(500).json({
      success: false,
      error: 'Your message was saved but there was an issue processing it. We\'ll still get back to you within 24-48 hours.',
      contactId: contactRecord._id
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

/**
 * GET /api/contact/admin/list
 * Get all contact messages for admin (requires authentication in production)
 */
router.get('/admin/list', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category } = req.query;
    
    // Build query
    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    
    // Get paginated results
    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('name email subject status category emailSent createdAt timeAgo');
    
    // Get total count
    const total = await Contact.countDocuments(query);
    
    // Get stats
    const stats = await Contact.getStats();
    
    res.json({
      success: true,
      data: {
        contacts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        stats
      }
    });
    
  } catch (error) {
    logger.error('Error fetching contact list:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contact messages'
    });
  }
});

/**
 * GET /api/contact/admin/:id
 * Get specific contact message details
 */
router.get('/admin/:id', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id)
      .populate('respondedBy', 'name email');
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact message not found'
      });
    }
    
    // Mark as read if it's new
    if (contact.status === 'new') {
      await contact.markAsRead();
    }
    
    res.json({
      success: true,
      data: contact
    });
    
  } catch (error) {
    logger.error('Error fetching contact details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contact details'
    });
  }
});

/**
 * PATCH /api/contact/admin/:id/status
 * Update contact message status
 */
router.patch('/admin/:id/status', async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact message not found'
      });
    }
    
    contact.status = status;
    if (adminNotes) contact.adminNotes = adminNotes;
    
    await contact.save();
    
    res.json({
      success: true,
      message: 'Contact status updated successfully',
      data: contact
    });
    
  } catch (error) {
    logger.error('Error updating contact status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update contact status'
    });
  }
});

/**
 * Helper function to categorize messages based on keywords
 */
function _categorizeMessage(subject, message) {
  const content = `${subject} ${message}`.toLowerCase();
  
  // Bug keywords
  if (content.includes('bug') || content.includes('error') || content.includes('crash') || 
      content.includes('broken') || content.includes('not working') || content.includes('issue')) {
    return 'bug_report';
  }
  
  // Feature request keywords
  if (content.includes('feature') || content.includes('add') || content.includes('request') || 
      content.includes('suggestion') || content.includes('improve') || content.includes('enhancement')) {
    return 'feature_request';
  }
  
  // Technical support keywords
  if (content.includes('help') || content.includes('support') || content.includes('how to') || 
      content.includes('tutorial') || content.includes('setup') || content.includes('install')) {
    return 'technical_support';
  }
  
  // Feedback keywords
  if (content.includes('feedback') || content.includes('review') || content.includes('opinion') || 
      content.includes('love') || content.includes('hate') || content.includes('like') || 
      content.includes('dislike')) {
    return 'feedback';
  }
  
  return 'general_inquiry';
}

export default router;
