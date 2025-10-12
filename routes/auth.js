import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import { validateRequest, authValidation } from '../middleware/validation.js';
import TokenBlacklist from '../models/TokenBlacklist.js'; // Ensure this exists
import loginRateLimitService from '../services/loginRateLimitService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Google OAuth2 client - you'll need to create a WEB client ID in Google Console
const googleClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

// Token creator with optional refresh token
const createToken = (user, includeRefresh = false) => {
  const accessToken = jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET, // 🔒 SECURITY: No fallback - validated by environmentValidator
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
  
  if (includeRefresh) {
    const refreshToken = jwt.sign(
      { userId: user._id, email: user.email, type: 'refresh' },
      process.env.JWT_SECRET, // 🔒 SECURITY: No fallback - validated by environmentValidator
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
    
    return { accessToken, refreshToken };
  }
  
  return accessToken;
};

// Unified middleware for protected routes
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // 🔒 SECURITY: No fallback

    // Check blacklist
    const isBlacklisted = await TokenBlacklist.exists({ token });
    if (isBlacklisted) {
      return res.status(401).json({ success: false, error: 'Token revoked' });
    }

    req.user = decoded;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// Register
router.post('/register', validateRequest(authValidation.register), async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered',
        field: 'email'
      });
    }

    const user = new User({ email, password, firstName, lastName });
    await user.save();

    const tokens = createToken(user, true); // Include refresh token

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileCompleted: user.profileCompleted
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: 'Registration failed'
    });
  }
});

// Login with rate limiting
router.post('/login', validateRequest(authValidation.login), async (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  try {
    const { email, password } = req.body;

    // Find user first (including sensitive fields for rate limiting)
    const user = await User.findOne({ email }).select('+password +loginAttempts +lastLoginAttempt +loginAttemptIPs +accountLockedUntil');
    
    if (!user) {
      // Even for non-existent users, log the attempt for security monitoring
      logger.warn('Login attempt for non-existent user', {
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        ip: clientIP,
        userAgent
      });
      
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_FAILED',
        message: 'Invalid email or password',
        field: 'email'
      });
    }

    // Check rate limiting before attempting authentication
    const rateLimitResult = await loginRateLimitService.checkLoginRateLimit(user, clientIP);
    
    if (rateLimitResult.isBlocked) {
      logger.warn('Login blocked due to rate limiting', {
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        ip: clientIP,
        reason: rateLimitResult.reason,
        attemptsUsed: rateLimitResult.attemptsUsed || 0,
        isAccountLocked: rateLimitResult.isAccountLocked
      });

      if (rateLimitResult.isAccountLocked) {
        return res.status(423).json({
          success: false,
          error: 'ACCOUNT_LOCKED',
          message: rateLimitResult.message,
          remainingLockTime: rateLimitResult.remainingLockTime,
          unlockAt: rateLimitResult.unlockAt
        });
      }

      if (rateLimitResult.hasExceededMaxAttempts) {
        return res.status(429).json({
          success: false,
          error: 'MAX_LOGIN_ATTEMPTS_EXCEEDED',
          message: rateLimitResult.message,
          maxAttemptsPerHour: rateLimitResult.maxAttemptsPerHour,
          windowResetAt: rateLimitResult.windowResetAt
        });
      }
    }

    // Attempt password verification
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      // Record failed login attempt
      await loginRateLimitService.recordLoginAttempt(user, clientIP, userAgent, false);
      
      // Check for suspicious activity
      const suspiciousActivity = loginRateLimitService.detectSuspiciousLoginActivity(user, clientIP, userAgent);
      
      if (suspiciousActivity.isSuspicious) {
        logger.warn('Suspicious login activity detected', {
          email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
          ip: clientIP,
          indicators: suspiciousActivity.indicators,
          riskLevel: suspiciousActivity.riskLevel
        });
      }

      logger.info('Failed login attempt recorded', {
        email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        ip: clientIP,
        attemptsRemaining: rateLimitResult.attemptsRemaining - 1
      });

      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_FAILED',
        message: 'Invalid email or password',
        field: 'password',
        attemptsRemaining: Math.max(0, (rateLimitResult.attemptsRemaining || 3) - 1)
      });
    }

    // Successful login - record attempt and generate tokens
    await loginRateLimitService.recordLoginAttempt(user, clientIP, userAgent, true);
    
    const tokens = createToken(user, true); // Request both access and refresh tokens

    logger.info('Successful login', {
      email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
      ip: clientIP,
      userAgent: userAgent.substring(0, 100) // Truncate long user agents
    });

    res.json({
      success: true,
      message: 'Login successful',
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileCompleted: user.profileCompleted
      }
    });
  } catch (error) {
    logger.error('Login system error', { 
      error: error.message, 
      stack: error.stack,
      email: req.body.email?.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
      ip: clientIP 
    });
    
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Login system temporarily unavailable'
    });
  }
});

// Logout with blacklist
router.post('/logout', authenticateUser, async (req, res) => {
  try {
    const decoded = jwt.decode(req.token);
    await TokenBlacklist.create({
      token: req.token,
      expiresAt: new Date(decoded.exp * 1000)
    });
    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ success: false, error: "Logout failed" });
  }
});

// 👤 Profile
router.get('/profile', authenticateUser, (req, res) => {
  res.json({
    success: true,
    message: 'User profile fetched successfully',
    user: req.user
  });
});

// 🔐 Admin: Unlock Account (for emergency use)
router.post('/admin/unlock-account', authenticateUser, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // For now, simple admin check (you may want to implement proper admin roles)
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser || !currentUser.email.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const result = await loginRateLimitService.unlockAccount(email);
    
    if (result.success) {
      logger.info('Account unlocked by admin', {
        targetEmail: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        adminEmail: currentUser.email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Admin unlock error', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to unlock account'
    });
  }
});

// Google Sign-In Authentication
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'Google ID token is required'
      });
    }

    console.log('Received Google ID token:', idToken?.substring(0, 50) + '...');
    
    // Verify the token with Google
    // Accept both Web and Android client IDs
    const audience = [
      process.env.GOOGLE_WEB_CLIENT_ID, // Web client
      process.env.GOOGLE_ANDROID_CLIENT_ID // Android client
    ];
    
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: audience,
    });
    
    const payload = ticket.getPayload();
    const { email, name, given_name, family_name, picture, email_verified } = payload;
    
    // Also get user info from request body as fallback
    const { userInfo } = req.body;
    
    console.log('Google user info from token:', { email, name, given_name, family_name });
    console.log('Google user info from request:', userInfo);
    
    // Extract first and last names with multiple fallbacks
    let firstName = given_name || '';
    let lastName = family_name || '';
    
    // If no given_name/family_name, try to parse from full name
    if (!firstName && !lastName && name) {
      const nameParts = name.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }
    
    // If still no names, try from userInfo displayName
    if (!firstName && !lastName && userInfo?.displayName) {
      const nameParts = userInfo.displayName.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }
    
    // Final fallback
    if (!firstName) firstName = 'User';
    
    console.log('Final extracted names:', { firstName, lastName });
    
    if (!email_verified) {
      return res.status(400).json({
        success: false,
        error: 'Email not verified with Google'
      });
    }
    
    // Find or create user in database
    let user = await User.findOne({ email });
    
    if (!user) {
      // Create new user with Google info
      user = new User({
        email,
        firstName: firstName,
        lastName: lastName,
        profilePicture: picture || userInfo?.photoUrl,
        authProvider: 'google',
        isEmailVerified: true,
        profileCompleted: false // They'll need to complete fitness profile
      });
      await user.save();
      console.log('Created new Google user:', user.email);
    } else {
      // Update existing user info if needed
      if (!user.firstName && firstName) {
        user.firstName = firstName;
      }
      if (!user.lastName && lastName) {
        user.lastName = lastName;
      }
      if ((picture || userInfo?.photoUrl) && !user.profilePicture) {
        user.profilePicture = picture || userInfo?.photoUrl;
      }
      if (user.isModified()) {
        await user.save();
      }
      console.log('Found existing user:', user.email);
    }
    
    // Generate JWT token
    const token = createToken(user);
    
    console.log('Sending user data to frontend:', {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email
    });
    
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePicture: user.profilePicture
        },
        profileCompleted: user.profileCompleted || false
      },
      message: 'Google sign-in successful'
    });
    
  } catch (error) {
    console.error('Google auth error:', error);
    
    // Handle specific Google auth errors
    if (error.message?.includes('Token used too late')) {
      return res.status(400).json({
        success: false,
        error: 'Google token expired. Please try again.'
      });
    }
    
    res.status(400).json({
      success: false,
      error: 'Invalid Google token or authentication failed'
    });
  }
});

// **NEW**: Refresh token endpoint
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token required'
      });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET); // 🔒 SECURITY: No fallback
    
    // Check if it's actually a refresh token
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token type'
      });
    }
    
    // Check if refresh token is blacklisted
    const isBlacklisted = await TokenBlacklist.exists({ token: refreshToken });
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token revoked'
      });
    }
    
    // Find the user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Generate new access token
    const newAccessToken = createToken(user);
    
    res.json({
      success: true,
      token: newAccessToken,
      message: 'Token refreshed successfully'
    });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Refresh token expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Token refresh failed'
    });
  }
});

// ============================================================================
// FCM TOKEN MANAGEMENT
// ============================================================================

/**
 * POST /api/auth/fcm-token
 * Update user's FCM token for push notifications
 */
router.post('/fcm-token', authenticateUser, async (req, res) => {
  try {
    const { fcm_token, platform, app_version } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!fcm_token) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required'
      });
    }

    // Update user with FCM token
    const user = await User.findByIdAndUpdate(
      userId, 
      { 
        fcmToken: fcm_token,
        platform: platform || 'unknown',
        appVersion: app_version || '1.0.0',
        fcmTokenUpdatedAt: new Date()
      }, 
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logger.info(`📱 FCM token updated for user`, {
      userId,
      platform: platform || 'unknown',
      tokenPrefix: fcm_token.substring(0, 20) + '...',
      appVersion: app_version || '1.0.0'
    });

    res.json({
      success: true,
      message: 'FCM token updated successfully',
      data: {
        userId: user._id,
        fcmTokenUpdated: true,
        platform: user.platform,
        updatedAt: user.fcmTokenUpdatedAt
      }
    });

  } catch (error) {
    logger.error('❌ Error updating FCM token:', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to update FCM token'
    });
  }
});

/**
 * DELETE /api/auth/fcm-token
 * Remove user's FCM token (e.g., on logout)
 */
router.delete('/fcm-token', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findByIdAndUpdate(
      userId, 
      { 
        $unset: { 
          fcmToken: 1,
          platform: 1,
          appVersion: 1,
          fcmTokenUpdatedAt: 1
        }
      }, 
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logger.info(`🗑️ FCM token removed for user`, { userId });

    res.json({
      success: true,
      message: 'FCM token removed successfully'
    });

  } catch (error) {
    logger.error('❌ Error removing FCM token:', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to remove FCM token'
    });
  }
});

export default router;
