import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

// Define activity log schema
const activityLogSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['cycling', 'running', 'walking', 'swimming', 'other']
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
  
  // Google Sign-In fields
  profilePicture: { type: String },
  authProvider: { 
    type: String, 
    enum: ['local', 'google'], 
    default: 'local' 
  },
  isEmailVerified: { type: Boolean, default: false }
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
