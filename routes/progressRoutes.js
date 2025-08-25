import express from 'express';
import authenticateToken from '../middleware/authenticateToken.js';
import CyclingPlan from '../models/CyclingPlan.js';
import { Telemetry } from '../models/Telemetry.js';

const router = express.Router();

// Get cycling progress data for a date range 
router.get('/progress', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get the user's current active cycling plan
    const plan = await CyclingPlan.findOne({
      userId: req.user._id,
      status: 'active'
    }).populate('dailySessions');

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active cycling plan found'
      });
    }

    // Get sessions within the date range and calculate progress
    const sessions = plan.dailySessions.filter(session => {
      const sessionDate = new Date(session.date);
      return sessionDate >= start && sessionDate <= end;
    });

    // Sort sessions by date
    sessions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate progress percentages and fetch telemetry data
    const progressData = await Promise.all(sessions.map(async session => {
      const progressPercentage = session.plannedHours > 0 
        ? (session.completedHours / session.plannedHours) * 100
        : 0;

      // Fetch telemetry data for this session if available
      const telemetry = await Telemetry.find({
        sessionId: session._id.toString()
      }).sort('timestamp');

      // Add telemetry stats if available
      const stats = telemetry.length > 0 ? {
        averageSpeed: telemetry.reduce((sum, t) => sum + (t.metrics?.speed || 0), 0) / telemetry.length,
        maxSpeed: Math.max(...telemetry.map(t => t.metrics?.speed || 0)),
        totalDistance: telemetry[telemetry.length - 1]?.metrics?.distance || 0,
        averageWatts: telemetry.reduce((sum, t) => sum + (t.metrics?.watts || 0), 0) / telemetry.length
      } : null;

      return {
        date: session.date,
        progressPercentage: Math.min(progressPercentage, 100),
        completed: session.completedHours,
        total: session.plannedHours,
        status: session.status,
        caloriesBurned: session.caloriesBurned || 0,
        telemetryStats: stats
      };
    }));

    res.json({
      success: true,
      data: progressData
    });

  } catch (error) {
    console.error('Error fetching cycling progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cycling progress',
      details: error.message
    });
  }
});

export default router;
