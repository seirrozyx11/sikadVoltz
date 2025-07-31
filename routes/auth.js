import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import { validateRequest, authValidation } from '../middleware/validation.js';
import TokenBlacklist from '../models/TokenBlacklist.js'; // Ensure this exists

const router = express.Router();

// Google OAuth2 client - you'll need to create a WEB client ID in Google Console
const googleClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

// Token creator
const createToken = (user) => {
  return jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET || 'fallbacksecret',
    { expiresIn: '24h' }
  );
};

// Unified middleware for protected routes
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallbacksecret');

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

    const token = createToken(user);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
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

// Login
router.post('/login', validateRequest(authValidation.login), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed',
        message: 'Invalid email or password',
        field: 'email'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed',
        message: 'Invalid email or password',
        field: 'password'
      });
    }

    const token = createToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileCompleted: user.profileCompleted
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: 'Login failed'
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
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_WEB_CLIENT_ID, // Use web client ID
    });
    
    const payload = ticket.getPayload();
    const { email, name, given_name, family_name, picture, email_verified } = payload;
    
    console.log('Google user info:', { email, name, given_name, family_name });
    
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
        firstName: given_name || name?.split(' ')[0] || 'User',
        lastName: family_name || name?.split(' ').slice(1).join(' ') || '',
        profilePicture: picture,
        authProvider: 'google',
        isEmailVerified: true,
        profileCompleted: false // They'll need to complete fitness profile
      });
      await user.save();
      console.log('Created new Google user:', user.email);
    } else {
      // Update existing user info if needed
      if (picture && !user.profilePicture) {
        user.profilePicture = picture;
        await user.save();
      }
      console.log('Found existing user:', user.email);
    }
    
    // Generate JWT token
    const token = createToken(user);
    
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

export default router;
