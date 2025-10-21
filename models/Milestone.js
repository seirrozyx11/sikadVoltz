const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['progress', 'streak', 'achievement', 'distance', 'time', 'calories']
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  value: {
    type: Number,
    required: true
  },
  unit: {
    type: String,
    required: true // km, days, sessions, kcal, etc.
  },
  achievedAt: {
    type: Date,
    default: Date.now
  },
  icon: {
    type: String,
    default: '🏆'
  },
  color: {
    type: String,
    default: '#FFD700'
  },
  xpReward: {
    type: Number,
    default: 150
  },
  notified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
milestoneSchema.index({ userId: 1, achievedAt: -1 });
milestoneSchema.index({ userId: 1, type: 1 });
milestoneSchema.index({ userId: 1, notified: 1 });

// Mark milestone as notified
milestoneSchema.methods.markNotified = async function() {
  this.notified = true;
  return await this.save();
};

// Static method to get user milestones
milestoneSchema.statics.getUserMilestones = async function(userId, limit = 50) {
  return await this.find({ userId })
    .sort({ achievedAt: -1 })
    .limit(limit)
    .lean();
};

// Static method to create milestone
milestoneSchema.statics.createMilestone = async function(userId, milestoneData) {
  const milestone = new this({
    userId,
    ...milestoneData
  });
  return await milestone.save();
};

// Static method to get unnotified milestones
milestoneSchema.statics.getUnnotifiedMilestones = async function(userId) {
  return await this.find({ userId, notified: false })
    .sort({ achievedAt: -1 })
    .lean();
};

module.exports = mongoose.model('Milestone', milestoneSchema);
