const mongoose = require('mongoose');

const questSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['daily', 'weekly', 'monthly', 'challenge', 'special']
  },
  category: {
    type: String,
    required: true,
    enum: ['distance', 'time', 'calories', 'streak', 'social', 'health']
  },
  progress: {
    current: {
      type: Number,
      default: 0
    },
    target: {
      type: Number,
      required: true
    }
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'expired', 'locked'],
    default: 'active'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  rewards: {
    xp: {
      type: Number,
      default: 100
    },
    badge: {
      type: String,
      default: null
    }
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'expert'],
    default: 'medium'
  },
  icon: {
    type: String,
    default: '🎯'
  },
  color: {
    type: String,
    default: '#4CAF50'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
questSchema.index({ userId: 1, status: 1, endDate: -1 });
questSchema.index({ userId: 1, type: 1, status: 1 });

// Check if quest is expired
questSchema.methods.isExpired = function() {
  return this.endDate < new Date() && this.status !== 'completed';
};

// Check if quest is completed
questSchema.methods.isCompleted = function() {
  return this.progress.current >= this.progress.target;
};

// Update quest progress
questSchema.methods.updateProgress = async function(value) {
  this.progress.current = Math.min(this.progress.current + value, this.progress.target);
  
  if (this.isCompleted() && this.status === 'active') {
    this.status = 'completed';
  }
  
  return await this.save();
};

// Complete quest
questSchema.methods.complete = async function() {
  this.status = 'completed';
  this.progress.current = this.progress.target;
  return await this.save();
};

// Static method to get active quests
questSchema.statics.getActiveQuests = async function(userId) {
  return await this.find({ 
    userId, 
    status: 'active',
    endDate: { $gte: new Date() }
  })
    .sort({ endDate: 1 })
    .lean();
};

// Static method to get user quests with filters
questSchema.statics.getUserQuests = async function(userId, filters = {}) {
  const query = { userId, ...filters };
  return await this.find(query)
    .sort({ createdAt: -1 })
    .lean();
};

// Static method to create daily quests
questSchema.statics.createDailyQuests = async function(userId) {
  const today = new Date();
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const dailyQuests = [
    {
      userId,
      title: 'Morning Ride',
      description: 'Complete a 5km cycling session',
      type: 'daily',
      category: 'distance',
      progress: { current: 0, target: 5 },
      endDate: endOfDay,
      rewards: { xp: 50 },
      difficulty: 'easy',
      icon: '🚴',
      color: '#FF9800'
    },
    {
      userId,
      title: 'Calorie Burner',
      description: 'Burn 300 calories today',
      type: 'daily',
      category: 'calories',
      progress: { current: 0, target: 300 },
      endDate: endOfDay,
      rewards: { xp: 75 },
      difficulty: 'medium',
      icon: '🔥',
      color: '#F44336'
    }
  ];

  return await this.insertMany(dailyQuests);
};

module.exports = mongoose.model('Quest', questSchema);
