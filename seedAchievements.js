/**
 * Seed Script for Achievement System
 * 
 * This script creates sample badges, milestones, and quests for testing
 * 
 * Usage: node seedAchievements.js <userId>
 * Example: node seedAchievements.js 507f1f77bcf86cd799439011
 */

const mongoose = require('mongoose');
const Badge = require('./models/Badge');
const Milestone = require('./models/Milestone');
const Quest = require('./models/Quest');
const User = require('./models/User');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

// Sample badges
const sampleBadges = [
  {
    type: 'distance',
    name: 'First 10km',
    description: 'Completed your first 10 kilometers',
    icon: '🚴',
    color: '#FFD700',
    progress: { current: 10, target: 10 },
    rarity: 'common',
    xpReward: 100
  },
  {
    type: 'distance',
    name: 'Century Rider',
    description: 'Rode 100 kilometers total',
    icon: '🏆',
    color: '#FF6B6B',
    progress: { current: 100, target: 100 },
    rarity: 'rare',
    xpReward: 250
  },
  {
    type: 'streak',
    name: 'Week Warrior',
    description: 'Maintained a 7-day streak',
    icon: '🔥',
    color: '#FFA500',
    progress: { current: 7, target: 7 },
    rarity: 'rare',
    xpReward: 200
  },
  {
    type: 'speed',
    name: 'Speed Demon',
    description: 'Reached 30km/h average speed',
    icon: '⚡',
    color: '#4CAF50',
    progress: { current: 30, target: 30 },
    rarity: 'epic',
    xpReward: 300
  },
  {
    type: 'challenge',
    name: 'Early Bird',
    description: 'Completed 5 morning rides',
    icon: '🌅',
    color: '#00BCD4',
    progress: { current: 5, target: 5 },
    rarity: 'common',
    xpReward: 150
  }
];

// Sample milestones
const sampleMilestones = [
  {
    type: 'distance',
    title: 'First Ride Complete',
    description: 'Completed your first cycling session',
    value: 1,
    unit: 'session',
    icon: '🚴',
    color: '#FFD700',
    xpReward: 50
  },
  {
    type: 'distance',
    title: '50km Milestone',
    description: 'Rode a total of 50 kilometers',
    value: 50,
    unit: 'km',
    icon: '🎯',
    color: '#4CAF50',
    xpReward: 150
  },
  {
    type: 'calories',
    title: 'Calorie Crusher',
    description: 'Burned 1000 calories total',
    value: 1000,
    unit: 'kcal',
    icon: '🔥',
    color: '#FF6B6B',
    xpReward: 200
  },
  {
    type: 'streak',
    title: '3-Day Streak',
    description: 'Completed workouts for 3 consecutive days',
    value: 3,
    unit: 'days',
    icon: '⭐',
    color: '#FFA500',
    xpReward: 100
  },
  {
    type: 'time',
    title: 'Hour of Power',
    description: 'Cycled for 1 hour total',
    value: 60,
    unit: 'minutes',
    icon: '⏱️',
    color: '#9C27B0',
    xpReward: 120
  }
];

// Sample quests
const sampleQuests = [
  {
    title: 'Morning Ride',
    description: 'Complete a 5km cycling session',
    type: 'daily',
    category: 'distance',
    progress: { current: 3, target: 5 },
    status: 'active',
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    rewards: { xp: 50 },
    difficulty: 'easy',
    icon: '🌅',
    color: '#FF9800'
  },
  {
    title: 'Calorie Burner',
    description: 'Burn 300 calories today',
    type: 'daily',
    category: 'calories',
    progress: { current: 150, target: 300 },
    status: 'active',
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    rewards: { xp: 75 },
    difficulty: 'medium',
    icon: '🔥',
    color: '#F44336'
  },
  {
    title: 'Weekly Warrior',
    description: 'Complete 5 workouts this week',
    type: 'weekly',
    category: 'streak',
    progress: { current: 2, target: 5 },
    status: 'active',
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
    rewards: { xp: 200 },
    difficulty: 'medium',
    icon: '🏋️',
    color: '#2196F3'
  },
  {
    title: 'Speed Challenge',
    description: 'Maintain 25km/h average speed for 10km',
    type: 'challenge',
    category: 'distance',
    progress: { current: 0, target: 10 },
    status: 'active',
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Next month
    rewards: { xp: 300, badge: 'Speed Demon' },
    difficulty: 'hard',
    icon: '⚡',
    color: '#4CAF50'
  }
];

async function seedAchievements(userId) {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      console.error(`User with ID ${userId} not found`);
      process.exit(1);
    }

    console.log(`Seeding achievements for user: ${user.firstName} ${user.lastName}`);

    // Clear existing achievements for this user
    await Badge.deleteMany({ userId });
    await Milestone.deleteMany({ userId });
    await Quest.deleteMany({ userId });
    console.log('Cleared existing achievements');

    // Create badges
    console.log('\nCreating badges...');
    for (const badgeData of sampleBadges) {
      const badge = await Badge.awardBadge(userId, badgeData);
      console.log(`✓ Created badge: ${badge.name}`);
    }

    // Create milestones
    console.log('\nCreating milestones...');
    for (const milestoneData of sampleMilestones) {
      const milestone = await Milestone.createMilestone(userId, milestoneData);
      console.log(`✓ Created milestone: ${milestone.title}`);
    }

    // Create quests
    console.log('\nCreating quests...');
    for (const questData of sampleQuests) {
      const quest = new Quest({ ...questData, userId });
      await quest.save();
      console.log(`✓ Created quest: ${quest.title}`);
    }

    // Update user XP and level
    const totalXP = 
      sampleBadges.reduce((sum, b) => sum + b.xpReward, 0) +
      sampleMilestones.reduce((sum, m) => sum + m.xpReward, 0);
    
    user.xp = (user.xp || 0) + totalXP;
    user.level = Math.floor(Math.sqrt(user.xp / 100)) + 1;
    user.rank = calculateRank(user.level);
    user.streak = 3; // Set a 3-day streak for testing
    await user.save();

    console.log(`\n✓ Updated user stats:`);
    console.log(`  - XP: ${user.xp}`);
    console.log(`  - Level: ${user.level}`);
    console.log(`  - Rank: ${user.rank}`);
    console.log(`  - Streak: ${user.streak} days`);

    console.log('\n🎉 Achievement seeding completed successfully!');
    
  } catch (error) {
    console.error('Error seeding achievements:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDisconnected from MongoDB');
  }
}

function calculateRank(level) {
  if (level >= 50) return 'Legend';
  if (level >= 40) return 'Master';
  if (level >= 30) return 'Diamond';
  if (level >= 20) return 'Platinum';
  if (level >= 15) return 'Gold';
  if (level >= 10) return 'Silver';
  return 'Bronze';
}

// Get userId from command line arguments
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node seedAchievements.js <userId>');
  console.error('Example: node seedAchievements.js 507f1f77bcf86cd799439011');
  process.exit(1);
}

if (!mongoose.Types.ObjectId.isValid(userId)) {
  console.error(`Invalid MongoDB ObjectId: ${userId}`);
  process.exit(1);
}

seedAchievements(userId);
