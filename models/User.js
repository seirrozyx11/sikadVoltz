import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// Define activity log schema
const activityLogSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['cycling', 'cycling_session', 'running', 'walking', 'swimming', 'other']
  },
  duration: { 
    type: Number, 
    required: true, 
    min: 1 
  },
  intensity: {
    type: String,
    enum: ['light', 'moderate', 'vigorous'],
    default: 'moderate'
  },
  distance: { 
    type: Number, 
    min: 0 
  },
  calories: { 
    type: Number, 
    required: true,
    min: 0
  },
  date: { 
    type: Date, 
    default: Date.now 
  },
  notes: {
    type: String
  }
}, { _id: true });

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: false, select: false }, // Optional for Google users
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  profile: {
    weight: { type: Number },
    height: { type: Number },
    birthDate: { type: Date },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: false
    },
    activityLevel: {
      type: String,
      enum: ['sedentary', 'light', 'moderate', 'active', 'very active'],
      default: 'moderate'
    },
    dailyCalorieGoal: { type: Number, min: 1000, max: 10000 },
    weightGoal: {
      targetWeight: { type: Number },
      targetDate: { type: Date },
      weeklyGoal: { type: Number } // kg per week
    }
  },
  activityLog: [activityLogSchema],
  profileCompleted: { type: Boolean, default: false },
  
  // Health screening fields
  healthScreening: {
    riskLevel: {
      type: String,
      enum: ['LOW', 'MODERATE', 'HIGH'],
      required: false
    },
    riskScore: {
      type: Number,
      min: 0,
      required: false
    },
    responses: {
      type: mongoose.Schema.Types.Mixed,
      required: false
    },
    screeningDate: {
      type: Date,
      required: false
    },
    isQuickScreening: {
      type: Boolean,
      default: false
    },
    isValid: {
      type: Boolean,
      default: true
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  
  // Google Sign-In fields
  profilePicture: { type: String },
  authProvider: { 
    type: String, 
    enum: ['local', 'google'], 
    default: 'local' 
  },
  isEmailVerified: { type: Boolean, default: false },
  
  // Google Calendar Integration
  googleCalendar: {
    accessToken: { type: String, select: false },
    refreshToken: { type: String, select: false },
    expiryDate: { type: Date, select: false },
    connectedAt: { type: Date },
    lastRefresh: { type: Date },
    userInfo: {
      id: String,
      email: String,
      name: String,
      picture: String
    }
  },
  
  // Password Reset Fields
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },
  resetPasswordAttempts: { type: Number, default: 0, select: false },
  lastResetAttempt: { type: Date, select: false },

  // Login Attempt Tracking
  loginAttempts: { type: Number, default: 0, select: false },
  lastLoginAttempt: { type: Date, select: false },
  loginAttemptIPs: [{
    ip: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    userAgent: { type: String },
    success: { type: Boolean, default: false }
  }],
  accountLockedUntil: { type: Date, select: false },

  // Enhanced Security Tracking
  lastResetIP: { type: String, select: false },
  resetAttemptIPs: [{
    ip: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    userAgent: { type: String }
  }],
  trustedIPs: [{ type: String }], // Known safe locations

  // Backup Recovery Options
  securityQuestions: [{
    question: { type: String, required: true },
    answer: { type: String, required: true, select: false }, // Hashed with bcrypt
    created: { type: Date, default: Date.now }
  }],
  backupEmail: { type: String, select: false },

  // Analytics & Compliance
  resetAnalytics: {
    totalResets: { type: Number, default: 0 },
    lastSuccessfulReset: { type: Date },
    suspiciousActivity: { type: Boolean, default: false }
  },

  // Push Notification Fields (FCM)
  fcmToken: { 
    type: String, 
    select: false // Keep token private for security
  },
  platform: {
    type: String,
    enum: ['android', 'ios', 'web', 'unknown'],
    default: 'unknown'
  },
  appVersion: {
    type: String,
    default: '1.0.0'
  },
  fcmTokenUpdatedAt: {
    type: Date
  },
  notificationPreferences: {
    missedSessions: { type: Boolean, default: true },
    sessionReminders: { type: Boolean, default: true },
    dailyMotivation: { type: Boolean, default: true },
    weeklyProgress: { type: Boolean, default: true },
    quietHours: {
      enabled: { type: Boolean, default: false },
      startTime: { type: String, default: '22:00' },
      endTime: { type: String, default: '07:00' }
    }
  },
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Hash password if modified (skip for Google users)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Password reset methods
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  
  return resetToken; // Return unhashed token to send via email
};

userSchema.methods.validateResetToken = function(token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  return (
    this.resetPasswordToken === hashedToken &&
    this.resetPasswordExpires > Date.now()
  );
};

userSchema.methods.clearPasswordResetFields = function() {
  this.resetPasswordToken = undefined;
  this.resetPasswordExpires = undefined;
  this.resetPasswordAttempts = 0;
  this.lastResetAttempt = undefined;
};

userSchema.methods.recordResetAttempt = function(ip, userAgent) {
  this.resetPasswordAttempts = (this.resetPasswordAttempts || 0) + 1;
  this.lastResetAttempt = new Date();
  this.lastResetIP = ip;
  
  // Add to reset attempt history (keep last 10 attempts)
  this.resetAttemptIPs = this.resetAttemptIPs || [];
  this.resetAttemptIPs.push({
    ip: ip,
    timestamp: new Date(),
    userAgent: userAgent
  });
  
  // Keep only last 10 attempts
  if (this.resetAttemptIPs.length > 10) {
    this.resetAttemptIPs = this.resetAttemptIPs.slice(-10);
  }
};

userSchema.methods.updateResetAnalytics = function() {
  this.resetAnalytics = this.resetAnalytics || {};
  this.resetAnalytics.totalResets = (this.resetAnalytics.totalResets || 0) + 1;
  this.resetAnalytics.lastSuccessfulReset = new Date();
  this.resetAnalytics.suspiciousActivity = false;
};

// Method to add activity to log
userSchema.methods.addActivity = function(activityData) {
  this.activityLog.push(activityData);
  return this.save();
};

// Static method to get user's calorie summary
userSchema.statics.getCalorieSummary = async function(userId, startDate, endDate) {
  const user = await this.findById(userId).select('activityLog profile');
  
  if (!user) {
    throw new Error('User not found');
  }

  let activities = user.activityLog || [];
  
  if (startDate) {
    activities = activities.filter(activity => activity.date >= new Date(startDate));
  }
  
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    activities = activities.filter(activity => activity.date <= end);
  }

  const totalCalories = activities.reduce((sum, activity) => sum + (activity.calories || 0), 0);
  
  return {
    totalCalories,
    activityCount: activities.length,
    activities: activities.sort((a, b) => b.date - a.date)
  };
};

export default mongoose.model('User', userSchema);
