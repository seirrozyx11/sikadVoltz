import mongoose from 'mongoose';

const badgeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['distance', 'speed', 'streak', 'challenge', 'special']
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    required: true
  },
  color: {
    type: String,
    default: '#FFD700'
  },
  earnedAt: {
    type: Date,
    default: Date.now
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
  rarity: {
    type: String,
    enum: ['common', 'rare', 'epic', 'legendary'],
    default: 'common'
  },
  xpReward: {
    type: Number,
    default: 100
  }
}, {
  timestamps: true
});

// Index for efficient queries
badgeSchema.index({ userId: 1, earnedAt: -1 });
badgeSchema.index({ userId: 1, type: 1 });

// Check if badge is completed
badgeSchema.methods.isCompleted = function() {
  return this.progress.current >= this.progress.target;
};

// Award badge and mark as complete
badgeSchema.methods.award = async function() {
  if (!this.isCompleted()) {
    this.progress.current = this.progress.target;
    this.earnedAt = new Date();
  }
  return await this.save();
};

// Static method to get user badges
badgeSchema.statics.getUserBadges = async function(userId) {
  return await this.find({ userId })
    .sort({ earnedAt: -1 })
    .lean();
};

// Static method to award badge
badgeSchema.statics.awardBadge = async function(userId, badgeData) {
  const badge = new this({
    userId,
    ...badgeData,
    progress: {
      current: badgeData.progress?.target || 0,
      target: badgeData.progress?.target || 1
    }
  });
  return await badge.save();
};

export default mongoose.model('Badge', badgeSchema);
