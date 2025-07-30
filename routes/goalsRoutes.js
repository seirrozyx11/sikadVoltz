import express from 'express';
import Goal from '../models/Goal.js';
import authenticateToken from '../middleware/authenticateToken.js';

const router = express.Router();

// Create a new goal
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { currentWeight, targetWeight, goalType, targetDate } = req.body;

    if (!currentWeight || !targetWeight || !goalType || !targetDate) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const goal = new Goal({
      user: userId,
      currentWeight,
      targetWeight,
      goalType,
      targetDate,
      startDate: new Date(),
      status: 'active'
    });

    await goal.save();

    res.status(201).json({ success: true, data: goal });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
