import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';

/**
 * 🔐 Google OAuth & Calendar Service for SikadVoltz Backend
 * Handles secure OAuth authentication and Google Calendar API operations
 * Protects sensitive credentials by keeping them server-side only
 */
class GoogleOAuthService {
  constructor() {
    // Validate required environment variables
    this.validateConfig();
    
    // Initialize OAuth2 client
    this.oauth2Client = new OAuth2Client(
      process.env.GOOGLE_WEB_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || `${process.env.BACKEND_URL}/auth/google/callback`
    );

    // Scopes for Google Calendar access
    this.scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];
  }

  validateConfig() {
    const required = [
      'GOOGLE_WEB_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'JWT_SECRET'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`❌ Missing Google OAuth configuration: ${missing.join(', ')}`);
    }
  }

  /**
   * Generate OAuth authorization URL for mobile app
   */
  getAuthUrl(userId) {
    const state = jwt.sign({ userId, timestamp: Date.now() }, process.env.JWT_SECRET, { expiresIn: '10m' });
    
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      state: state,
      prompt: 'consent' // Force consent to get refresh token
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code, state) {
    try {
      // Verify state parameter
      const decoded = jwt.verify(state, process.env.JWT_SECRET);
      
      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getAccessToken(code);
      
      // Set credentials
      this.oauth2Client.setCredentials(tokens);
      
      // Get user info
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();
      
      return {
        success: true,
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date
        },
        userInfo: {
          id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture
        },
        userId: decoded.userId
      };
    } catch (error) {
      console.error('❌ OAuth token exchange failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Refresh access token using stored refresh token
   */
  async refreshAccessToken(refreshToken) {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      return {
        success: true,
        tokens: {
          access_token: credentials.access_token,
          expiry_date: credentials.expiry_date
        }
      };
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create cycling session in user's Google Calendar
   */
  async createCalendarEvent(accessToken, eventData) {
    try {
      // Set up authenticated client
      const authClient = new OAuth2Client();
      authClient.setCredentials({ access_token: accessToken });
      
      const calendar = google.calendar({ version: 'v3', auth: authClient });

      // Create event
      const event = {
        summary: `🚴‍♂️ ${eventData.title}`,
        description: this.buildEventDescription(eventData),
        start: {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        end: {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        location: eventData.location,
        colorId: '11', // Blue color for cycling
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 60 },
            { method: 'popup', minutes: 15 }
          ]
        },
        extendedProperties: {
          private: {
            sikadvoltz_session: 'true',
            session_id: eventData.sessionId,
            intensity: eventData.intensity?.toString(),
            duration: eventData.duration?.toString(),
            distance: eventData.distance?.toString()
          }
        }
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event
      });

      return {
        success: true,
        eventId: response.data.id,
        eventUrl: response.data.htmlLink
      };
    } catch (error) {
      console.error('❌ Calendar event creation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update existing calendar event
   */
  async updateCalendarEvent(accessToken, eventId, eventData) {
    try {
      const authClient = new OAuth2Client();
      authClient.setCredentials({ access_token: accessToken });
      
      const calendar = google.calendar({ version: 'v3', auth: authClient });

      const event = {
        summary: `🚴‍♂️ ${eventData.title}`,
        description: this.buildEventDescription(eventData),
        start: {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        end: {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        location: eventData.location,
        extendedProperties: {
          private: {
            sikadvoltz_session: 'true',
            session_id: eventData.sessionId,
            intensity: eventData.intensity?.toString(),
            duration: eventData.duration?.toString(),
            distance: eventData.distance?.toString()
          }
        }
      };

      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        resource: event
      });

      return {
        success: true,
        eventId: response.data.id,
        eventUrl: response.data.htmlLink
      };
    } catch (error) {
      console.error('❌ Calendar event update failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete calendar event
   */
  async deleteCalendarEvent(accessToken, eventId) {
    try {
      const authClient = new OAuth2Client();
      authClient.setCredentials({ access_token: accessToken });
      
      const calendar = google.calendar({ version: 'v3', auth: authClient });

      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId
      });

      return { success: true };
    } catch (error) {
      console.error('❌ Calendar event deletion failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get user's cycling events from calendar
   */
  async getCalendarEvents(accessToken, timeMin, timeMax) {
    try {
      const authClient = new OAuth2Client();
      authClient.setCredentials({ access_token: accessToken });
      
      const calendar = google.calendar({ version: 'v3', auth: authClient });

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        q: 'sikadvoltz OR cycling OR 🚴‍♂️'
      });

      const events = response.data.items?.filter(event => 
        event.extendedProperties?.private?.sikadvoltz_session === 'true'
      ) || [];

      return {
        success: true,
        events: events.map(event => ({
          id: event.id,
          title: event.summary,
          description: event.description,
          startTime: event.start?.dateTime,
          endTime: event.end?.dateTime,
          location: event.location,
          sessionId: event.extendedProperties?.private?.session_id,
          intensity: event.extendedProperties?.private?.intensity,
          duration: event.extendedProperties?.private?.duration,
          distance: event.extendedProperties?.private?.distance
        }))
      };
    } catch (error) {
      console.error('❌ Calendar events fetch failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check for calendar conflicts
   */
  async checkConflicts(accessToken, startTime, endTime) {
    try {
      const authClient = new OAuth2Client();
      authClient.setCredentials({ access_token: accessToken });
      
      const calendar = google.calendar({ version: 'v3', auth: authClient });

      // Add 30-minute buffer
      const bufferStart = new Date(new Date(startTime).getTime() - 30 * 60000).toISOString();
      const bufferEnd = new Date(new Date(endTime).getTime() + 30 * 60000).toISOString();

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: bufferStart,
        timeMax: bufferEnd,
        singleEvents: true
      });

      const conflicts = response.data.items?.filter(event => {
        if (!event.start?.dateTime || !event.end?.dateTime) return false;
        
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);
        const sessionStart = new Date(startTime);
        const sessionEnd = new Date(endTime);
        
        // Check for overlap
        return sessionStart < eventEnd && sessionEnd > eventStart;
      }) || [];

      return {
        success: true,
        conflicts: conflicts.map(event => ({
          id: event.id,
          title: event.summary,
          startTime: event.start?.dateTime,
          endTime: event.end?.dateTime,
          location: event.location
        }))
      };
    } catch (error) {
      console.error('❌ Conflict check failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build rich event description
   */
  buildEventDescription(eventData) {
    let description = eventData.description || 'Cycling session created by SikadVoltz';
    
    description += '\n\n🚴‍♂️ SikadVoltz Cycling Session\n';
    
    if (eventData.intensity) {
      description += `💪 Intensity: ${eventData.intensity}\n`;
    }
    if (eventData.duration) {
      description += `⏱️ Duration: ${eventData.duration} minutes\n`;
    }
    if (eventData.distance) {
      description += `📏 Distance: ${eventData.distance} km\n`;
    }
    
    description += '\n📱 Created with SikadVoltz App';
    
    return description;
  }

  /**
   * Revoke user's OAuth tokens
   */
  async revokeTokens(accessToken) {
    try {
      const authClient = new OAuth2Client();
      authClient.setCredentials({ access_token: accessToken });
      
      await authClient.revokeCredentials();
      
      return { success: true };
    } catch (error) {
      console.error('❌ Token revocation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default GoogleOAuthService;