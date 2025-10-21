const express = require('express');
const router = express.Router();
const achievementController = require('../controllers/achievementController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * All routes require authentication
 * userId is extracted from JWT token by authenticateToken middleware
 */

// Badge routes
router.get('/me/badges', authenticateToken, achievementController.getUserBadges);
router.post('/me/badges', authenticateToken, achievementController.awardBadge);

// Milestone routes
router.get('/me/milestones', authenticateToken, achievementController.getUserMilestones);
router.post('/me/milestones', authenticateToken, achievementController.createMilestone);

// Rank routes
router.get('/me/rank', authenticateToken, achievementController.getUserRank);

// Quest routes
router.get('/me/quests', authenticateToken, achievementController.getUserQuests);
router.patch('/me/quests/:questId', authenticateToken, achievementController.updateQuestProgress);

module.exports = router;
