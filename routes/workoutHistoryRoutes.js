import express from 'express';
import * as workoutHistoryController from '../controllers/workoutHistoryController.js';
import authenticateToken from '../middleware/authenticateToken.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Archive a plan to workout history
router.post('/archive/:planId', workoutHistoryController.archivePlan);

// Get user's workout history with pagination
router.get('/', workoutHistoryController.getUserHistory);

// Get workout history analytics
router.get('/analytics', workoutHistoryController.getHistoryAnalytics);

// Get specific workout history details
router.get('/:historyId', workoutHistoryController.getHistoryDetail);

export default router;
