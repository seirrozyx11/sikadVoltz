import mongoose from 'mongoose';

const workoutHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // For faster queries by user
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CyclingPlan',
    required: true
  },
  
  // ========== NEW FIELD FOR DATA FLOW FIX ==========
  // Issue #8: Link to all sessions that were part of this workout history
  linkedSessions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RideSession'
  }],
  // ========== END NEW FIELD ==========
  
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['completed', 'reset', 'abandoned'],
    required: true
  },
  resetReason: {
    type: String,
    enum: ['too_many_missed', 'user_request', 'injury', 'other'],
    default: null
  },
  statistics: {
    totalSessions: { type: Number, default: 0 },
    completedSessions: { type: Number, default: 0 },
    missedSessions: { type: Number, default: 0 },
    totalHours: { type: Number, default: 0 },
    completedHours: { type: Number, default: 0 },
    caloriesBurned: { type: Number, default: 0 },
    averageIntensity: { type: Number, default: 0 },
    originalGoal: {
      type: { type: String },
      targetValue: Number,
      timeframe: Number
    }
  },
  planSummary: {
    planType: String,
    dailyCyclingHours: Number,
    totalPlanDays: Number,
    completionRate: Number
  },
  notes: String
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Indexes for common queries
workoutHistorySchema.index({ user: 1, startDate: -1 });
workoutHistorySchema.index({ status: 1 });

export default mongoose.model('WorkoutHistory', workoutHistorySchema);
