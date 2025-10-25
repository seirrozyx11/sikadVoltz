/**
 * Achievement Service
 * 
 * Handles gamification: XP awards, level ups, badge unlocks, milestone tracking, streaks.
 * Fixes Issue #6: Auto-trigger achievement system during workout sessions.
 * 
 * Created: October 25, 2025
 * Part of: Data Flow Fix Implementation
 */

import User from '../models/User.js';
import Badge from '../models/Badge.js';
import Milestone from '../models/Milestone.js';
import Quest from '../models/Quest.js';
import NotificationService from './notificationService.js';

class AchievementService {
  /**
   * Award XP for completing a workout session
   * @param {ObjectId} userId - User ID
   * @param {Object} sessionData - Session data (distance, calories, duration, power)
   * @returns {Object} XP award details and level up info
   */
  async awardWorkoutXP(userId, sessionData) {
    try {
      console.log(`[AchievementService] Awarding XP to user ${userId}`);

      const user = await User.findById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Calculate XP based on session metrics
      const xpEarned = this._calculateWorkoutXP(sessionData);
      const previousXP = user.xp || 0;
      const previousLevel = user.level || 1;

      // Award XP
      user.xp = (user.xp || 0) + xpEarned;

      // Check for level up
      const newLevel = this._calculateLevel(user.xp);
      const leveledUp = newLevel > previousLevel;

      if (leveledUp) {
        user.level = newLevel;
        user.rank = this._calculateRank(newLevel);
        
        console.log(`[AchievementService] 🎊 User leveled up! ${previousLevel} → ${newLevel}`);
        
        // Send level up notification
        await NotificationService.createNotification(userId, {
          type: 'level_up',
          title: `Level ${newLevel} Reached!`,
          message: `Congratulations! You've reached level ${newLevel}. Your rank is now: ${user.rank}`,
          data: { level: newLevel, rank: user.rank, xpEarned }
        });
      }

      await user.save();

      console.log(`[AchievementService] ✅ Awarded ${xpEarned} XP to user ${userId}`);
      console.log(`  - Total XP: ${user.xp}`);
      console.log(`  - Level: ${user.level}`);
      console.log(`  - Rank: ${user.rank}`);

      return {
        xpEarned,
        totalXP: user.xp,
        previousXP,
        level: user.level,
        previousLevel,
        leveledUp,
        rank: user.rank,
        xpToNextLevel: this._xpToNextLevel(user.xp)
      };
    } catch (error) {
      console.error('[AchievementService] Error awarding XP:', error);
      throw error;
    }
  }

  /**
   * Calculate XP earned from a workout session
   * @param {Object} sessionData - Session metrics
   * @returns {Number} XP amount
   */
  _calculateWorkoutXP(sessionData) {
    let xp = 0;

    // Base XP for completing workout
    xp += 50;

    // Distance bonus (10 XP per km)
    xp += Math.floor((sessionData.totalDistance || 0) * 10);

    // Duration bonus (1 XP per minute)
    const durationMinutes = (sessionData.duration || 0) / 60;
    xp += Math.floor(durationMinutes);

    // Calorie bonus (1 XP per 10 calories)
    xp += Math.floor((sessionData.totalCalories || 0) / 10);

    // Speed bonus (high average speed)
    if (sessionData.avgSpeed > 25) {
      xp += 30; // Fast rider bonus
    } else if (sessionData.avgSpeed > 20) {
      xp += 20;
    } else if (sessionData.avgSpeed > 15) {
      xp += 10;
    }

    // Power bonus (high average power)
    if (sessionData.avgPower > 200) {
      xp += 40; // Strong rider bonus
    } else if (sessionData.avgPower > 150) {
      xp += 25;
    } else if (sessionData.avgPower > 100) {
      xp += 15;
    }

    return Math.floor(xp);
  }

  /**
   * Calculate level from total XP
   * Uses exponential curve: level = floor(sqrt(xp / 100))
   * @param {Number} xp - Total XP
   * @returns {Number} Level
   */
  _calculateLevel(xp) {
    return Math.floor(Math.sqrt(xp / 100)) + 1;
  }

  /**
   * Calculate XP needed to reach next level
   * @param {Number} currentXP - Current XP
   * @returns {Number} XP needed
   */
  _xpToNextLevel(currentXP) {
    const currentLevel = this._calculateLevel(currentXP);
    const nextLevelXP = Math.pow(currentLevel, 2) * 100;
    return nextLevelXP - currentXP;
  }

  /**
   * Calculate rank based on level
   * @param {Number} level - User level
   * @returns {String} Rank name
   */
  _calculateRank(level) {
    if (level >= 50) return 'Legend';
    if (level >= 40) return 'Champion';
    if (level >= 30) return 'Expert';
    if (level >= 20) return 'Advanced';
    if (level >= 10) return 'Intermediate';
    if (level >= 5) return 'Beginner';
    return 'Novice';
  }

  /**
   * Update user's workout streak
   * @param {ObjectId} userId - User ID
   * @param {Date} sessionDate - Session completion date
   * @returns {Object} Streak info
   */
  async updateStreak(userId, sessionDate = new Date()) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const today = new Date(sessionDate);
      today.setHours(0, 0, 0, 0);

      const lastActivity = user.lastActivityDate ? new Date(user.lastActivityDate) : null;
      if (lastActivity) {
        lastActivity.setHours(0, 0, 0, 0);
      }

      let streakIncreased = false;
      let streakBroken = false;

      if (!lastActivity) {
        // First workout ever
        user.streak = 1;
        streakIncreased = true;
      } else {
        const daysDifference = Math.floor((today - lastActivity) / (1000 * 60 * 60 * 24));

        if (daysDifference === 0) {
          // Same day, no change
        } else if (daysDifference === 1) {
          // Consecutive day, increase streak
          user.streak = (user.streak || 0) + 1;
          streakIncreased = true;
        } else {
          // Streak broken
          user.streak = 1;
          streakBroken = true;
        }
      }

      user.lastActivityDate = sessionDate;
      await user.save();

      // Check for streak milestones
      if (streakIncreased && [7, 14, 30, 60, 100].includes(user.streak)) {
        await NotificationService.createNotification(userId, {
          type: 'streak_milestone',
          title: `🔥 ${user.streak} Day Streak!`,
          message: `Amazing consistency! You've maintained a ${user.streak} day workout streak!`,
          data: { streak: user.streak }
        });
      }

      console.log(`[AchievementService] Streak updated for user ${userId}: ${user.streak} days`);

      return {
        streak: user.streak,
        streakIncreased,
        streakBroken,
        lastActivityDate: user.lastActivityDate
      };
    } catch (error) {
      console.error('[AchievementService] Error updating streak:', error);
      throw error;
    }
  }

  /**
   * Check and create milestones based on user progress
   * @param {ObjectId} userId - User ID
   * @param {Object} stats - User statistics (totalDistance, totalWorkouts, etc.)
   * @returns {Array} Newly created milestones
   */
  async checkMilestones(userId, stats) {
    try {
      const newMilestones = [];

      // Define milestone thresholds
      const milestoneThresholds = [
        // Distance milestones
        { type: 'distance', values: [10, 50, 100, 250, 500, 1000], unit: 'km', stat: 'totalDistance' },
        // Workout count milestones
        { type: 'workouts', values: [5, 10, 25, 50, 100, 250], unit: 'workouts', stat: 'totalWorkouts' },
        // Calorie milestones
        { type: 'calories', values: [1000, 5000, 10000, 25000, 50000], unit: 'kcal', stat: 'totalCalories' },
      ];

      for (const threshold of milestoneThresholds) {
        const userValue = stats[threshold.stat] || 0;

        for (const value of threshold.values) {
          if (userValue >= value) {
            // Check if milestone already exists
            const existing = await Milestone.findOne({
              userId,
              type: threshold.type,
              value
            });

            if (!existing) {
              // Create new milestone
              const milestone = await Milestone.create({
                userId,
                type: threshold.type,
                value,
                unit: threshold.unit,
                achievedAt: new Date(),
                xpReward: this._calculateMilestoneXP(value)
              });

              newMilestones.push(milestone);

              // Award bonus XP
              const user = await User.findById(userId);
              user.xp = (user.xp || 0) + milestone.xpReward;
              await user.save();

              // Send notification
              await NotificationService.createNotification(userId, {
                type: 'milestone_achieved',
                title: `🏆 Milestone Achieved!`,
                message: `You've reached ${value} ${threshold.unit}! Earned ${milestone.xpReward} bonus XP.`,
                data: { 
                  milestoneType: threshold.type, 
                  value, 
                  unit: threshold.unit,
                  xpReward: milestone.xpReward 
                }
              });

              console.log(`[AchievementService] 🏆 Milestone achieved: ${value} ${threshold.unit}`);
            }
          }
        }
      }

      return newMilestones;
    } catch (error) {
      console.error('[AchievementService] Error checking milestones:', error);
      throw error;
    }
  }

  /**
   * Calculate XP reward for milestone
   * @param {Number} value - Milestone value
   * @returns {Number} XP reward
   */
  _calculateMilestoneXP(value) {
    return Math.floor(value * 5); // 5 XP per milestone unit
  }

  /**
   * Check and award badges based on session performance
   * @param {ObjectId} userId - User ID
   * @param {Object} sessionData - Session metrics
   * @returns {Array} Newly awarded badges
   */
  async checkBadgeProgress(userId, sessionData) {
    try {
      const newBadges = [];

      // Define badge criteria
      const badgeCriteria = [
        { 
          name: 'Speed Demon', 
          type: 'speed', 
          requirement: { avgSpeed: 30 },
          description: 'Maintain 30+ km/h average speed'
        },
        { 
          name: 'Endurance King', 
          type: 'distance', 
          requirement: { totalDistance: 50 },
          description: 'Complete a 50+ km ride'
        },
        { 
          name: 'Power House', 
          type: 'power', 
          requirement: { avgPower: 250 },
          description: 'Maintain 250+ watts average power'
        },
        { 
          name: 'Calorie Crusher', 
          type: 'calories', 
          requirement: { totalCalories: 1000 },
          description: 'Burn 1000+ calories in one session'
        },
      ];

      for (const criteria of badgeCriteria) {
        // Check if criteria met
        const criteriaKey = Object.keys(criteria.requirement)[0];
        const requiredValue = criteria.requirement[criteriaKey];
        const actualValue = sessionData[criteriaKey] || 0;

        if (actualValue >= requiredValue) {
          // Check if badge already awarded
          const existing = await Badge.findOne({
            userId,
            name: criteria.name
          });

          if (!existing) {
            // Award badge
            const badge = await Badge.create({
              userId,
              name: criteria.name,
              type: criteria.type,
              description: criteria.description,
              awardedAt: new Date(),
              metadata: {
                sessionValue: actualValue,
                requiredValue: requiredValue
              }
            });

            newBadges.push(badge);

            // Send notification
            await NotificationService.createNotification(userId, {
              type: 'badge_unlocked',
              title: `⚡ Badge Unlocked!`,
              message: `You've earned the "${criteria.name}" badge! ${criteria.description}`,
              data: { 
                badgeName: criteria.name, 
                badgeType: criteria.type,
                description: criteria.description 
              }
            });

            console.log(`[AchievementService] ⚡ Badge awarded: ${criteria.name}`);
          }
        }
      }

      return newBadges;
    } catch (error) {
      console.error('[AchievementService] Error checking badges:', error);
      throw error;
    }
  }

  /**
   * Get user's complete achievement summary
   * @param {ObjectId} userId - User ID
   * @returns {Object} Achievement summary
   */
  async getUserAchievementSummary(userId) {
    try {
      const user = await User.findById(userId).select('xp level rank streak lastActivityDate');
      const badges = await Badge.find({ userId }).sort({ awardedAt: -1 });
      const milestones = await Milestone.find({ userId }).sort({ achievedAt: -1 });
      const quests = await Quest.find({ userId, status: { $in: ['active', 'completed'] } });

      return {
        xp: user.xp || 0,
        level: user.level || 1,
        rank: user.rank || 'Novice',
        xpToNextLevel: this._xpToNextLevel(user.xp || 0),
        streak: user.streak || 0,
        lastActivityDate: user.lastActivityDate,
        badges: badges.map(b => ({
          name: b.name,
          type: b.type,
          description: b.description,
          awardedAt: b.awardedAt
        })),
        milestones: milestones.map(m => ({
          type: m.type,
          value: m.value,
          unit: m.unit,
          achievedAt: m.achievedAt,
          xpReward: m.xpReward
        })),
        quests: quests.map(q => ({
          title: q.title,
          description: q.description,
          status: q.status,
          progress: q.progress,
          target: q.target
        })),
        statistics: {
          totalBadges: badges.length,
          totalMilestones: milestones.length,
          activeQuests: quests.filter(q => q.status === 'active').length,
          completedQuests: quests.filter(q => q.status === 'completed').length
        }
      };
    } catch (error) {
      console.error('[AchievementService] Error getting achievement summary:', error);
      throw error;
    }
  }
}

export default new AchievementService();
