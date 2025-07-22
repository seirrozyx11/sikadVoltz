import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { validateRequest, authValidation } from '../middleware/validation.js';

const router = express.Router();

const createToken = (user) => {
  return jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET || 'fallbacksecret',
    { expiresIn: '24h' }
  );
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
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Duplicate email',
        message: 'Email already exists',
        field: 'email'
      });
    }

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

export default router;
