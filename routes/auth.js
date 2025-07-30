import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { validateRequest, authValidation } from '../middleware/validation.js';
import TokenBlacklist from '../models/TokenBlacklist.js'; // Ensure this exists

const router = express.Router();

// 🔐 Token creator
const createToken = (user) => {
  return jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET || 'fallbacksecret',
    { expiresIn: '24h' }
  );
};

// ✅ Unified middleware for protected routes
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

// 📝 Register
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

// 🔓 Login
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

// 🚪 Logout with blacklist
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

export default router;
