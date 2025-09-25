/**
 * Email Configuration Test Routes
 * 
 * Diagnostic endpoints to test email connectivity and configuration
 * without sending actual emails during troubleshooting.
 */

import express from 'express';
import renderEmailService from '../services/renderEmailService.js';
import renderAPIEmailService from '../services/renderAPIEmailService.js';
import enhancedEmailService from '../services/enhancedEmailService.js';
import emailService from '../services/emailService.js';
import networkDiagnostics from '../utils/networkDiagnostics.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/email-test/config
 * Check email configuration status
 */
router.get('/config', async (req, res) => {
  try {
    const configuredPort = parseInt(process.env.EMAIL_PORT) || 587;
    const isSecure = configuredPort === 465;
    
    const config = {
      configured: emailService.isConfigured,
      service: 'Gmail',
      configuration: {
        name: `Gmail ${isSecure ? 'SSL' : 'TLS'} (Port ${configuredPort})`,
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: configuredPort,
        secure: isSecure,
        configuredInRender: true
      },
      environment: {
        EMAIL_HOST: process.env.EMAIL_HOST || 'Using defaults (smtp.gmail.com)',
        EMAIL_PORT: process.env.EMAIL_PORT || 'Using defaults (587)',
        EMAIL_USER: process.env.EMAIL_USER ? 'Set' : 'Not set',
        EMAIL_PASS: process.env.EMAIL_PASS ? 'Set' : 'Not set',
        EMAIL_FROM: process.env.EMAIL_FROM ? 'Set' : 'Using EMAIL_USER'
      },
      renderOptimized: false // Single port as configured
    };

    res.json({
      success: true,
      config,
      recommendations: {
        missingVars: [],
        suggestions: []
      }
    });

    // Add recommendations based on missing config
    if (!process.env.EMAIL_USER) {
      config.recommendations.missingVars.push('EMAIL_USER');
      config.recommendations.suggestions.push('Set EMAIL_USER to your Gmail address');
    }
    if (!process.env.EMAIL_PASS) {
      config.recommendations.missingVars.push('EMAIL_PASS');
      config.recommendations.suggestions.push('Set EMAIL_PASS to your Gmail App Password (not regular password)');
    }

  } catch (error) {
    logger.error('Email config check failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to check email configuration'
    });
  }
});

/**
 * POST /api/email-test/connection
 * Test SMTP connection using configured port (587)
 */
router.post('/connection', async (req, res) => {
  const startTime = Date.now();
  
  try {
    logger.info('Testing email connection using configured port 587...');
    
    const testResult = await emailService.testEmailConfiguration();
    const duration = Date.now() - startTime;
    
    // Response for single-port configuration
    res.json({
      success: testResult.success,
      message: testResult.message || testResult.error,
      configuration: testResult.configuration,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      renderOptimized: testResult.renderOptimized || false,
      recommendation: testResult.recommendation || 'No specific recommendation',
      hostingEnvironment: process.env.NODE_ENV === 'production' ? 'Render Production' : 'Local Development',
      configuredPort: process.env.EMAIL_PORT || '587'
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Email connection test failed', { 
      error: error.message, 
      duration: `${duration}ms` 
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      hostingEnvironment: process.env.NODE_ENV === 'production' ? 'Render Production' : 'Local Development'
    });
  }
});

/**
 * GET /api/email-test/network-diagnostics
 * Test network connectivity to SMTP servers
 */
router.get('/network-diagnostics', async (req, res) => {
  try {
    const NetworkDiagnostics = (await import('../utils/networkDiagnostics.js')).default;
    const diagnostics = new NetworkDiagnostics();
    
    logger.info('Running network diagnostics for SMTP connectivity...');
    
    const results = await diagnostics.testSMTPConnectivity();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV === 'production' ? 'Render Production' : 'Local Development',
      diagnosis: results.smtpBlocked ? 'SMTP ports likely blocked by hosting provider' : 'Network connectivity issues',
      recommendation: results.smtpBlocked ? 'Use API-based email services (SendGrid, Mailgun)' : 'Check network configuration',
      httpConnectivity: results.httpConnectivity,
      smtpBlocked: results.smtpBlocked
    });

  } catch (error) {
    logger.error('Network diagnostics failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Network diagnostics failed',
      details: error.message
    });
  }
});

/**
 * GET /api/email-test/service-comparison
 * Compare all available email services
 */
router.get('/service-comparison', async (req, res) => {
  try {
    const services = [];
    
    // Test SendGrid API service (Render-compatible)
    try {
      const apiResult = await renderAPIEmailService.testEmailConfiguration();
      services.push({
        name: 'SendGrid API (Recommended for Render)',
        ...apiResult,
        priority: 1,
        renderCompatible: true
      });
    } catch (error) {
      services.push({
        name: 'SendGrid API',
        success: false,
        error: error.message,
        priority: 1,
        renderCompatible: true
      });
    }

    // Test SMTP services (likely to fail on Render)
    try {
      const renderResult = await renderEmailService.testEmailConfiguration();
      services.push({
        name: 'Gmail SMTP (Render Optimized)',
        ...renderResult,
        priority: 2,
        renderCompatible: false,
        warning: 'SMTP blocked on Render'
      });
    } catch (error) {
      services.push({
        name: 'Gmail SMTP (Render Optimized)',
        success: false,
        error: error.message,
        priority: 2,
        renderCompatible: false
      });
    }

    // Determine recommendation
    const workingService = services.find(s => s.success);
    const recommendation = workingService ? 
      `Use ${workingService.name}` : 
      'Set up SendGrid API - see SENDGRID_SETUP_GUIDE.md';

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV === 'production' ? 'Render Production' : 'Local Development',
      services,
      recommendation,
      setupGuide: 'See SENDGRID_SETUP_GUIDE.md for complete setup instructions'
    });

  } catch (error) {
    logger.error('Service comparison failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Service comparison failed',
      details: error.message
    });
  }
});

/**
 * POST /api/email-test/send-test
 * Send a test email using the API service (Render-compatible)
 */
router.post('/send-test', async (req, res) => {
  const { testEmail } = req.body;
  
  if (!testEmail) {
    return res.status(400).json({
      success: false,
      error: 'testEmail is required'
    });
  }

  const startTime = Date.now();
  
  try {
    // Create a simple test reset token for testing
    const testToken = 'test_' + Math.random().toString(36).substr(2, 32);
    
    // Use the NEW API-based service (should work on Render)
    const result = await renderAPIEmailService.sendPasswordResetEmail(testEmail, testToken, {
      firstName: 'Test User',
      isResend: false
    });
    
    const duration = Date.now() - startTime;
    
    res.json({
      success: result.success,
      messageId: result.messageId,
      provider: result.provider,
      error: result.error,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      renderCompatible: true
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Test email send failed', { 
      error: error.message, 
      duration: `${duration}ms`,
      testEmail: testEmail.replace(/^(.{2}).*(@.*)$/, '$1***$2')
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;