import mongoose from 'mongoose';

// Tutorial step schema
const tutorialSchema = new mongoose.Schema({
  tutorialKey: {
    type: String,
    required: true,
    enum: [
      'home_dashboard',
      'bottom_nav',
      'health_screening',
      'goal_wizard',
      'activity_tracker',
      'notification_view'
    ]
  },
  completed: {
    type: Boolean,
    default: false,
  },
  skipped: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
    default: Date.now,
  },
  deviceInfo: {
    platform: {
      type: String,
      enum: ['Android', 'iOS', 'Unknown'],
      default: 'Unknown'
    },
    model: String,
    version: String,
  },
});

// User tutorial tracking schema (email-based)
const userTutorialSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  tutorials: [tutorialSchema],
  autoPlayTutorials: {
    type: Boolean,
    default: true,
  },
  skipOnLogin: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Indexes for performance
// Note: email index is already created via unique: true and index: true in schema definition
userTutorialSchema.index({ 'tutorials.tutorialKey': 1 });

// Method to check if tutorial is completed
userTutorialSchema.methods.hasSeen = function(tutorialKey) {
  const tutorial = this.tutorials.find(t => t.tutorialKey === tutorialKey);
  return tutorial ? (tutorial.completed || tutorial.skipped) : false;
};

// Method to mark tutorial as completed
userTutorialSchema.methods.markCompleted = function(tutorialKey, deviceInfo = {}) {
  const tutorialIndex = this.tutorials.findIndex(t => t.tutorialKey === tutorialKey);
  
  if (tutorialIndex >= 0) {
    this.tutorials[tutorialIndex].completed = true;
    this.tutorials[tutorialIndex].completedAt = new Date();
    this.tutorials[tutorialIndex].deviceInfo = deviceInfo;
  } else {
    this.tutorials.push({
      tutorialKey,
      completed: true,
      completedAt: new Date(),
      skipped: false,
      deviceInfo,
    });
  }
};

// Method to mark tutorial as skipped
userTutorialSchema.methods.markSkipped = function(tutorialKey, deviceInfo = {}) {
  const tutorialIndex = this.tutorials.findIndex(t => t.tutorialKey === tutorialKey);
  
  if (tutorialIndex >= 0) {
    this.tutorials[tutorialIndex].skipped = true;
    this.tutorials[tutorialIndex].completedAt = new Date();
    this.tutorials[tutorialIndex].deviceInfo = deviceInfo;
  } else {
    this.tutorials.push({
      tutorialKey,
      completed: false,
      skipped: true,
      completedAt: new Date(),
      deviceInfo,
    });
  }
};

export default mongoose.model('UserTutorial', userTutorialSchema);
