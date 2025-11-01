import Badge from '../models/Badge.js';
import Milestone from '../models/Milestone.js';
import Quest from '../models/Quest.js';
import User from '../models/User.js';
import * as notificationService from '../services/notificationService.js';

/**
 * Get user badges
 * GET /api/users/me/badges
 */
export const getUserBadges = async (req, res) => {
  try {
    const userId = req.userId; // Set by authenticateToken middleware

    const badges = await Badge.getUserBadges(userId);

    res.json({
      success: true,
      data: badges,
      count: badges.length
    });
  } catch (error) {
    console.error('Error fetching user badges:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch badges'
    });
  }
};

/**
 * Get user milestones
 * GET /api/users/me/milestones
 */
export const getUserMilestones = async (req, res) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 50;

    const milestones = await Milestone.getUserMilestones(userId, limit);

    res.json({
      success: true,
      data: milestones,
      count: milestones.length
    });
  } catch (error) {
    console.error('Error fetching user milestones:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch milestones'
    });
  }
};

/**
 * Get user rank and XP
 * GET /api/users/me/rank
 */
export const getUserRank = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).select('xp level rank streak');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Calculate XP needed for next level
    const currentLevelXp = calculateLevelXp(user.level || 1);
    const nextLevelXp = calculateLevelXp((user.level || 1) + 1);
    const xpProgress = (user.xp || 0) - currentLevelXp;
    const xpNeeded = nextLevelXp - currentLevelXp;

    // Get user's rank position (based on XP)
    const usersWithHigherXp = await User.countDocuments({ xp: { $gt: user.xp || 0 } });
    const rankPosition = usersWithHigherXp + 1;

    // Get total users for percentage calculation
    const totalUsers = await User.countDocuments();
    const percentile = totalUsers > 0 ? ((totalUsers - rankPosition) / totalUsers * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        level: user.level || 1,
        xp: user.xp || 0,
        rank: user.rank || 'Bronze',
        rankPosition: rankPosition,
        percentile: parseFloat(percentile),
        streak: user.streak || 0,
        xpProgress: Math.max(0, xpProgress),
        xpNeeded: xpNeeded,
        nextLevel: (user.level || 1) + 1
      }
    });
  } catch (error) {
    console.error('Error fetching user rank:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rank'
    });
  }
};

/**
 * Get user quests
 * GET /api/users/me/quests
 */
export const getUserQuests = async (req, res) => {
  try {
    const userId = req.userId;
    const status = req.query.status; // active, completed, expired
    const type = req.query.type; // daily, weekly, monthly

    const filters = {};
    if (status) filters.status = status;
    if (type) filters.type = type;

    const quests = await Quest.getUserQuests(userId, filters);

    res.json({
      success: true,
      data: quests,
      count: quests.length
    });
  } catch (error) {
    console.error('Error fetching user quests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quests'
    });
  }
};

/**
 * Award badge to user
 * POST /api/users/me/badges
 */
export const awardBadge = async (req, res) => {
  try {
    const userId = req.userId;
    const { type, name, description, icon, color, target, rarity, xpReward } = req.body;

    // Validate required fields
    if (!type || !name || !description || !icon) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, name, description, icon'
      });
    }

    const badgeData = {
      type,
      name,
      description,
      icon,
      color: color || '#FFD700',
      progress: { target: target || 1 },
      rarity: rarity || 'common',
      xpReward: xpReward || 100
    };

    const badge = await Badge.awardBadge(userId, badgeData);

    // Award XP to user
    const user = await User.findById(userId);
    if (user) {
      user.xp = (user.xp || 0) + badge.xpReward;
      
      // Check for level up
      const newLevel = calculateLevel(user.xp);
      const leveledUp = newLevel > (user.level || 1);
      
      if (leveledUp) {
        user.level = newLevel;
        user.rank = calculateRank(newLevel);
      }
      
      await user.save();

      // Send notification
      await notificationService.createMilestoneNotification(
        userId,
        'achievement',
        {
          title: `🏆 Badge Earned: ${name}`,
          message: description,
          xpGained: badge.xpReward,
          leveledUp,
          newLevel: user.level
        }
      );
    }

    res.status(201).json({
      success: true,
      data: badge,
      message: 'Badge awarded successfully'
    });
  } catch (error) {
    console.error('Error awarding badge:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to award badge'
    });
  }
};

/**
 * Create milestone for user
 * POST /api/users/me/milestones
 */
export const createMilestone = async (req, res) => {
  try {
    const userId = req.userId;
    const { type, title, description, value, unit, icon, color, xpReward } = req.body;

    if (!type || !title || !description || !value || !unit) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, title, description, value, unit'
      });
    }

    const milestoneData = {
      type,
      title,
      description,
      value,
      unit,
      icon: icon || '🏆',
      color: color || '#FFD700',
      xpReward: xpReward || 150
    };

    const milestone = await Milestone.createMilestone(userId, milestoneData);

    // Award XP to user
    const user = await User.findById(userId);
    if (user) {
      user.xp = (user.xp || 0) + milestone.xpReward;
      
      const newLevel = calculateLevel(user.xp);
      const leveledUp = newLevel > (user.level || 1);
      
      if (leveledUp) {
        user.level = newLevel;
        user.rank = calculateRank(newLevel);
      }
      
      await user.save();

      // Send notification
      await notificationService.createMilestoneNotification(
        userId,
        type,
        {
          title: `🎯 ${title}`,
          message: description,
          value,
          unit,
          xpGained: milestone.xpReward,
          leveledUp,
          newLevel: user.level
        }
      );
    }

    res.status(201).json({
      success: true,
      data: milestone,
      message: 'Milestone created successfully'
    });
  } catch (error) {
    console.error('Error creating milestone:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create milestone'
    });
  }
};

/**
 * Update quest progress
 * PATCH /api/users/me/quests/:questId
 */
export const updateQuestProgress = async (req, res) => {
  try {
    const userId = req.userId;
    const { questId } = req.params;
    const { progress } = req.body;

    if (progress === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Progress value required'
      });
    }

    const quest = await Quest.findOne({ _id: questId, userId });
    
    if (!quest) {
      return res.status(404).json({
        success: false,
        error: 'Quest not found'
      });
    }

    const wasCompleted = quest.isCompleted();
    await quest.updateProgress(progress);
    const isNowCompleted = quest.isCompleted();

    // If quest just completed, award rewards
    if (!wasCompleted && isNowCompleted) {
      const user = await User.findById(userId);
      if (user) {
        user.xp = (user.xp || 0) + quest.rewards.xp;
        
        const newLevel = calculateLevel(user.xp);
        const leveledUp = newLevel > (user.level || 1);
        
        if (leveledUp) {
          user.level = newLevel;
          user.rank = calculateRank(newLevel);
        }
        
        await user.save();

        // Send notification
        await notificationService.createMilestoneNotification(
          userId,
          'achievement',
          {
            title: `✅ Quest Complete: ${quest.title}`,
            message: `You earned ${quest.rewards.xp} XP!`,
            xpGained: quest.rewards.xp,
            leveledUp,
            newLevel: user.level
          }
        );
      }
    }

    res.json({
      success: true,
      data: quest,
      message: isNowCompleted ? 'Quest completed!' : 'Progress updated'
    });
  } catch (error) {
    console.error('Error updating quest progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update quest progress'
    });
  }
};

/**
 * Helper: Calculate level from XP
 */
function calculateLevel(xp) {
  // Level formula: level = floor(sqrt(xp / 100)) + 1
  // Level 1: 0-99 XP
  // Level 2: 100-399 XP
  // Level 3: 400-899 XP
  // Level 4: 900-1599 XP
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/**
 * Helper: Calculate XP required for a level
 */
function calculateLevelXp(level) {
  // Inverse of level formula: xp = (level - 1)^2 * 100
  return Math.pow(level - 1, 2) * 100;
}

/**
 * Helper: Calculate rank from level
 */
function calculateRank(level) {
  if (level >= 50) return 'Legend';
  if (level >= 40) return 'Master';
  if (level >= 30) return 'Diamond';
  if (level >= 20) return 'Platinum';
  if (level >= 15) return 'Gold';
  if (level >= 10) return 'Silver';
  return 'Bronze';
}
