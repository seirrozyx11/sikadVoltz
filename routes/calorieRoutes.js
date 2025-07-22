import express from 'express';
import authenticate from '../middleware/auth.js';
import { 
  calculateBMR, 
  calculateTDEE, 
  calculateCyclingCalories 
} from '../services/calorieService.js';
import User from '../models/User.js';

const router = express.Router();

// Get user's daily calorie goal
router.get('/goal', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('profile');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const bmr = calculateBMR(
      user.profile.weight,
      user.profile.height,
      user.profile.birthDate,
      user.profile.gender
    );

    const tdee = calculateTDEE(bmr, user.profile.activityLevel || 'moderate');
    
    // Add some basic goal calculation (can be adjusted based on user's goals)
    const calorieGoal = Math.round(tdee * 0.8); // Example: 20% calorie deficit

    res.json({
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      dailyCalorieGoal: calorieGoal,
      activityLevel: user.profile.activityLevel
    });
  } catch (error) {
    console.error('Error getting calorie goal:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Log calories burned from cycling
router.post('/log/cycling', authenticate, async (req, res) => {
  try {
    const { duration, intensity = 'moderate', distance, date = new Date() } = req.body;
    
    if (!duration) {
      return res.status(400).json({ message: 'Duration is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const hours = parseFloat(duration) / 60; // Convert minutes to hours
    const caloriesBurned = calculateCyclingCalories(
      user.profile.weight,
      hours,
      intensity
    );

    // Add to user's activity log
    const activity = {
      type: 'cycling',
      duration: parseFloat(duration),
      intensity,
      distance: distance ? parseFloat(distance) : null,
      calories: Math.round(caloriesBurned),
      date: new Date(date)
    };

    user.activityLog = user.activityLog || [];
    user.activityLog.push(activity);
    await user.save();

    res.status(201).json({
      message: 'Activity logged successfully',
      activity: {
        ...activity,
        id: user.activityLog[user.activityLog.length - 1]._id
      }
    });
  } catch (error) {
    console.error('Error logging cycling activity:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get calorie log for a specific date range
router.get('/log', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const user = await User.findById(req.user.id).select('activityLog profile');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let activities = user.activityLog || [];
    
    // Filter by date range if provided
    if (startDate) {
      const start = new Date(startDate);
      activities = activities.filter(activity => new Date(activity.date) >= start);
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // End of the day
      activities = activities.filter(activity => new Date(activity.date) <= end);
    }

    // Sort by date (newest first)
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate total calories burned
    const totalCalories = activities.reduce((sum, activity) => sum + (activity.calories || 0), 0);

    res.json({
      activities,
      totalCalories,
      count: activities.length
    });
  } catch (error) {
    console.error('Error getting calorie log:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Calculate cycling plan based on user profile and goal
router.post('/plan', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.profile) {
      return res.status(404).json({ message: 'User profile not found' });
    }

    const { targetWeight, targetDate, intensity = 'moderate' } = req.body;
    const currentWeight = user.profile.weight;
    const weight = user.profile.weight;
    const height = user.profile.height;
    const birthDate = user.profile.birthDate;
    const gender = user.profile.gender;
    const activityLevel = user.profile.activityLevel;

    if (!targetWeight || !targetDate) {
      return res.status(400).json({ message: 'targetWeight and targetDate are required' });
    }

    // Calculate age
    const age = new Date().getFullYear() - new Date(birthDate).getFullYear();

    // Calculate BMR
    let bmr;
    if (gender === 'male') {
      bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    }

    // Calculate TDEE
    const activityMultipliers = {
      'sedentary': 1.2,
      'light': 1.375,
      'moderate': 1.55,
      'active': 1.725,
      'very active': 1.9
    };
    const tdee = bmr * (activityMultipliers[activityLevel] || 1.55);

    // Calculate total kcal deficit
    const totalKg = currentWeight - targetWeight;
    const totalKcal = totalKg * 7700;

    // Calculate timeframe in days
    const startDate = new Date();
    const endDate = new Date(targetDate);
    const timeframeDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const dailyKcalTarget = totalKcal / timeframeDays;

    // Cycling kcal per hour
    const metValues = { 'light': 4, 'moderate': 8, 'vigorous': 12 };
    const cyclingKcalPerHour = metValues[intensity] * weight;
    const dailyHours = dailyKcalTarget / cyclingKcalPerHour;

    // Safety check
    const maxHours = 3;
    const safe = dailyHours <= maxHours;

    res.json({
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      totalKcal: Math.round(totalKcal),
      dailyKcalTarget: Math.round(dailyKcalTarget),
      cyclingKcalPerHour: Math.round(cyclingKcalPerHour),
      dailyHours: parseFloat(dailyHours.toFixed(2)),
      safe,
      maxHours,
      timeframeDays,
      startDate,
      endDate,
      intensity,
      message: safe
        ? 'Plan is safe'
        : `Warning: Required daily cycling hours (${dailyHours.toFixed(2)}) exceed safe maximum (${maxHours}h)`
    });
  } catch (error) {
    console.error('Error calculating cycling plan:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
