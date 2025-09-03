import express from 'express';
import authenticateToken from '../middleware/authenticateToken.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Save health screening results
 */
router.post('/health-screening', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId; // Fixed: use userId instead of id
    const { risk_level, risk_score, responses, screening_date, is_quick_screening } = req.body;

    // Validate required fields
    if (!risk_level || risk_score === undefined || !responses || !screening_date) {
      return res.status(400).json({
        success: false,
        message: 'Missing required health screening data',
        errorCode: 'VALIDATION_ERROR',
      });
    }

    // Validate risk level
    const validRiskLevels = ['LOW', 'MODERATE', 'HIGH'];
    if (!validRiskLevels.includes(risk_level.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid risk level. Must be LOW, MODERATE, or HIGH',
        errorCode: 'VALIDATION_ERROR',
      });
    }

    // Validate risk score
    if (typeof risk_score !== 'number' || risk_score < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid risk score. Must be a non-negative number',
        errorCode: 'VALIDATION_ERROR',
      });
    }

    // Find user and update health screening data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND',
      });
    }

    // Update user with health screening data
    user.healthScreening = {
      riskLevel: risk_level.toUpperCase(),
      riskScore: risk_score,
      responses: responses,
      screeningDate: new Date(screening_date),
      isValid: true,
      lastUpdated: new Date(),
      isQuickScreening: is_quick_screening || false,
    };

    await user.save();

    logger.info(`Health screening saved for user ${userId}`, {
      userId,
      riskLevel: risk_level,
      riskScore: risk_score,
      isQuickScreening: is_quick_screening || false,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Health screening results saved successfully',
      data: {
        risk_level: user.healthScreening.riskLevel,
        risk_score: user.healthScreening.riskScore,
        screening_date: user.healthScreening.screeningDate,
        can_proceed: user.healthScreening.riskLevel !== 'HIGH',
        is_quick_screening: user.healthScreening.isQuickScreening,
      },
    });

  } catch (error) {
    logger.error('Error saving health screening results:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to save health screening results',
      errorCode: 'SERVER_ERROR',
    });
  }
});

/**
 * Get health screening results
 */
router.get('/health-screening', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId; // Fixed: use userId instead of id

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND',
      });
    }

    if (!user.healthScreening) {
      return res.json({
        success: true,
        message: 'No health screening data found',
        data: {
          screening_completed: false,
          risk_level: null,
          risk_score: null,
          screening_date: null,
          is_valid: false,
          can_proceed: false,
        },
      });
    }

    const screening = user.healthScreening;
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - (6 * 30 * 24 * 60 * 60 * 1000));
    const isValid = screening.screeningDate > sixMonthsAgo;

    res.json({
      success: true,
      message: 'Health screening data retrieved successfully',
      data: {
        screening_completed: true,
        risk_level: screening.riskLevel,
        risk_score: screening.riskScore,
        screening_date: screening.screeningDate,
        is_valid: isValid,
        can_proceed: screening.riskLevel !== 'HIGH' && isValid,
        responses: screening.responses,
        is_quick_screening: screening.isQuickScreening || false,
      },
    });

  } catch (error) {
    logger.error('Error retrieving health screening results:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve health screening results',
      errorCode: 'SERVER_ERROR',
    });
  }
});

/**
 * Clear health screening data (for retaking)
 */
router.delete('/health-screening', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId; // Fixed: use userId instead of id

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND',
      });
    }

    // Clear health screening data
    user.healthScreening = undefined;
    await user.save();

    logger.info(`Health screening data cleared for user ${userId}`, {
      userId,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Health screening data cleared successfully',
    });

  } catch (error) {
    logger.error('Error clearing health screening data:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to clear health screening data',
      errorCode: 'SERVER_ERROR',
    });
  }
});

/**
 * Get health screening recommendations based on risk level
 */
router.get('/health-screening/recommendations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId; // Fixed: use userId instead of id

    const user = await User.findById(userId);
    if (!user || !user.healthScreening) {
      return res.status(404).json({
        success: false,
        message: 'Health screening data not found',
        errorCode: 'SCREENING_NOT_FOUND',
      });
    }

    const riskLevel = user.healthScreening.riskLevel;
    let recommendations = [];
    let description = '';

    switch (riskLevel) {
      case 'HIGH':
        description = 'Medical clearance recommended before starting exercise program';
        recommendations = [
          'Consult with your healthcare provider before starting',
          'Get medical clearance for exercise',
          'Consider supervised exercise programs',
          'Start with very low intensity if cleared',
        ];
        break;
      case 'MODERATE':
        description = 'Proceed with caution, start slowly and listen to your body';
        recommendations = [
          'Start with low to moderate intensity',
          'Listen to your body and rest when needed',
          'Consider consulting a healthcare provider',
          'Gradually increase intensity over time',
          'Stop if you experience any concerning symptoms',
        ];
        break;
      case 'LOW':
        description = 'Safe to begin exercise program with normal precautions';
        recommendations = [
          'Start at your comfort level and progress gradually',
          'Warm up before and cool down after exercise',
          'Stay hydrated during workouts',
          'Set realistic and achievable goals',
          'Enjoy your fitness journey!',
        ];
        break;
      default:
        description = 'Unknown risk level';
        recommendations = ['Complete health screening to get personalized recommendations'];
    }

    res.json({
      success: true,
      message: 'Health screening recommendations retrieved successfully',
      data: {
        risk_level: riskLevel,
        description,
        recommendations,
        color: getRiskLevelColor(riskLevel),
      },
    });

  } catch (error) {
    logger.error('Error retrieving health screening recommendations:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.userId,
    });

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve health screening recommendations',
      errorCode: 'SERVER_ERROR',
    });
  }
});

/**
 * Get risk level color for UI
 */
function getRiskLevelColor(riskLevel) {
  switch (riskLevel) {
    case 'HIGH':
      return 'red';
    case 'MODERATE':
      return 'orange';
    case 'LOW':
      return 'green';
    default:
      return 'gray';
  }
}

export default router;
