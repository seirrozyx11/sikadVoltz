import express from 'express';
import GoogleOAuthService from '../services/google_oauth_service.js';
import authenticateToken from '../middleware/authenticateToken.js';
import User from '../models/User.js';

const router = express.Router();
const googleOAuth = new GoogleOAuthService();

/**
 * 🔐 Google OAuth & Calendar API Routes
 * Secure OAuth proxy for mobile app integration
 */

/**
 * @route   GET /api/oauth/google/auth-url
 * @desc    Generate Google OAuth authorization URL
 * @access  Private (requires JWT token)
 */
router.get('/google/auth-url', authenticateToken, async (req, res) => {
  try {
    const authUrl = googleOAuth.getAuthUrl(req.user.userId);
    
    res.json({
      success: true,
      authUrl: authUrl,
      message: 'Authorization URL generated successfully'
    });
  } catch (error) {
    console.error('❌ OAuth URL generation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate authorization URL',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/oauth/google/exchange
 * @desc    Exchange authorization code for tokens
 * @access  Private (requires JWT token)
 */
router.post('/google/exchange', authenticateToken, async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code and state are required'
      });
    }

    const result = await googleOAuth.exchangeCodeForTokens(code, state);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Token exchange failed',
        error: result.error
      });
    }

    // Store tokens securely in user document
    await User.findByIdAndUpdate(req.user.userId, {
      'googleCalendar.accessToken': result.tokens.access_token,
      'googleCalendar.refreshToken': result.tokens.refresh_token,
      'googleCalendar.expiryDate': result.tokens.expiry_date,
      'googleCalendar.connectedAt': new Date(),
      'googleCalendar.userInfo': result.userInfo
    });

    res.json({
      success: true,
      message: 'Google Calendar connected successfully',
      userInfo: result.userInfo
    });
  } catch (error) {
    console.error('❌ OAuth token exchange failed:', error);
    res.status(500).json({
      success: false,
      message: 'Token exchange failed',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/oauth/google/refresh
 * @desc    Refresh Google access token
 * @access  Private (requires JWT token)
 */
router.post('/google/refresh', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user?.googleCalendar?.refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'No refresh token available. Please reconnect Google Calendar.'
      });
    }

    const result = await googleOAuth.refreshAccessToken(user.googleCalendar.refreshToken);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Token refresh failed',
        error: result.error
      });
    }

    // Update stored tokens
    await User.findByIdAndUpdate(req.user.userId, {
      'googleCalendar.accessToken': result.tokens.access_token,
      'googleCalendar.expiryDate': result.tokens.expiry_date,
      'googleCalendar.lastRefresh': new Date()
    });

    res.json({
      success: true,
      message: 'Access token refreshed successfully'
    });
  } catch (error) {
    console.error('❌ Token refresh failed:', error);
    res.status(500).json({
      success: false,
      message: 'Token refresh failed',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/oauth/google/calendar/create-event
 * @desc    Create cycling session in Google Calendar
 * @access  Private (requires JWT token)
 */
router.post('/google/calendar/create-event', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user?.googleCalendar?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Google Calendar not connected. Please connect first.'
      });
    }

    const { title, description, startTime, endTime, location, sessionId, intensity, duration, distance } = req.body;

    if (!title || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Title, start time, and end time are required'
      });
    }

    const eventData = {
      title,
      description,
      startTime,
      endTime,
      location,
      sessionId,
      intensity,
      duration,
      distance,
      timeZone: req.body.timeZone
    };

    const result = await googleOAuth.createCalendarEvent(user.googleCalendar.accessToken, eventData);

    if (!result.success) {
      // Try refreshing token if creation failed
      if (result.error.includes('invalid_grant') || result.error.includes('expired')) {
        const refreshResult = await googleOAuth.refreshAccessToken(user.googleCalendar.refreshToken);
        if (refreshResult.success) {
          await User.findByIdAndUpdate(req.user.userId, {
            'googleCalendar.accessToken': refreshResult.tokens.access_token,
            'googleCalendar.expiryDate': refreshResult.tokens.expiry_date
          });
          
          // Retry event creation with new token
          const retryResult = await googleOAuth.createCalendarEvent(refreshResult.tokens.access_token, eventData);
          if (retryResult.success) {
            return res.json({
              success: true,
              eventId: retryResult.eventId,
              eventUrl: retryResult.eventUrl,
              message: 'Event created successfully'
            });
          }
        }
      }
      
      return res.status(400).json({
        success: false,
        message: 'Failed to create calendar event',
        error: result.error
      });
    }

    res.json({
      success: true,
      eventId: result.eventId,
      eventUrl: result.eventUrl,
      message: 'Event created successfully'
    });
  } catch (error) {
    console.error('❌ Calendar event creation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create calendar event',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/oauth/google/calendar/update-event/:eventId
 * @desc    Update existing calendar event
 * @access  Private (requires JWT token)
 */
router.put('/google/calendar/update-event/:eventId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const { eventId } = req.params;
    
    if (!user?.googleCalendar?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Google Calendar not connected'
      });
    }

    const eventData = req.body;
    const result = await googleOAuth.updateCalendarEvent(user.googleCalendar.accessToken, eventId, eventData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to update calendar event',
        error: result.error
      });
    }

    res.json({
      success: true,
      eventId: result.eventId,
      eventUrl: result.eventUrl,
      message: 'Event updated successfully'
    });
  } catch (error) {
    console.error('❌ Calendar event update failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update calendar event',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/oauth/google/calendar/delete-event/:eventId
 * @desc    Delete calendar event
 * @access  Private (requires JWT token)
 */
router.delete('/google/calendar/delete-event/:eventId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const { eventId } = req.params;
    
    if (!user?.googleCalendar?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Google Calendar not connected'
      });
    }

    const result = await googleOAuth.deleteCalendarEvent(user.googleCalendar.accessToken, eventId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to delete calendar event',
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    console.error('❌ Calendar event deletion failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete calendar event',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/oauth/google/calendar/events
 * @desc    Get user's cycling events from calendar
 * @access  Private (requires JWT token)
 */
router.get('/google/calendar/events', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user?.googleCalendar?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Google Calendar not connected'
      });
    }

    const { timeMin, timeMax } = req.query;
    const result = await googleOAuth.getCalendarEvents(
      user.googleCalendar.accessToken,
      timeMin || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      timeMax || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()  // 90 days ahead
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to fetch calendar events',
        error: result.error
      });
    }

    res.json({
      success: true,
      events: result.events,
      message: `Found ${result.events.length} cycling events`
    });
  } catch (error) {
    console.error('❌ Calendar events fetch failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch calendar events',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/oauth/google/calendar/check-conflicts
 * @desc    Check for calendar conflicts
 * @access  Private (requires JWT token)
 */
router.post('/google/calendar/check-conflicts', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user?.googleCalendar?.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Google Calendar not connected'
      });
    }

    const { startTime, endTime } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Start time and end time are required'
      });
    }

    const result = await googleOAuth.checkConflicts(user.googleCalendar.accessToken, startTime, endTime);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to check conflicts',
        error: result.error
      });
    }

    res.json({
      success: true,
      conflicts: result.conflicts,
      hasConflicts: result.conflicts.length > 0,
      message: result.conflicts.length > 0 ? 
        `Found ${result.conflicts.length} conflict(s)` : 
        'No conflicts found'
    });
  } catch (error) {
    console.error('❌ Conflict check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check conflicts',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/oauth/google/status
 * @desc    Get Google Calendar connection status
 * @access  Private (requires JWT token)
 */
router.get('/google/status', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const isConnected = !!(user?.googleCalendar?.accessToken);
    
    res.json({
      success: true,
      isConnected,
      connectedAt: user?.googleCalendar?.connectedAt,
      userInfo: user?.googleCalendar?.userInfo,
      lastRefresh: user?.googleCalendar?.lastRefresh
    });
  } catch (error) {
    console.error('❌ Status check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check connection status',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/oauth/google/disconnect
 * @desc    Disconnect Google Calendar
 * @access  Private (requires JWT token)
 */
router.post('/google/disconnect', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (user?.googleCalendar?.accessToken) {
      // Revoke tokens on Google's side
      await googleOAuth.revokeTokens(user.googleCalendar.accessToken);
    }

    // Clear stored tokens
    await User.findByIdAndUpdate(req.user.userId, {
      $unset: { googleCalendar: 1 }
    });

    res.json({
      success: true,
      message: 'Google Calendar disconnected successfully'
    });
  } catch (error) {
    console.error('❌ Disconnect failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect Google Calendar',
      error: error.message
    });
  }
});

export default router;