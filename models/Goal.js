import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  currentWeight: { type: Number, required: true },
  targetWeight: { type: Number, required: true },
  goalType: { 
    type: String, 
    enum: ['weight_loss', 'maintenance', 'muscle_gain'],
    required: true 
  },
  startDate: { type: Date, default: Date.now },
  targetDate: { type: Date, required: true },
  dailyCalorieTarget: { type: Number },
  status: { 
    type: String, 
    enum: ['active', 'completed', 'paused'],
    default: 'active'
  },
  
  // ========== NEW FIELDS FOR DATA FLOW FIX ==========
  // Issue #1-2: Track sessions linked to this goal
  linkedSessions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RideSession'
  }],
  
  // Issue #1: Real-time progress data for Activity Tracker
  progressData: {
    totalDistance: { type: Number, default: 0 }, // km
    totalCalories: { type: Number, default: 0 },
    totalWorkouts: { type: Number, default: 0 },
    completionPercentage: { type: Number, default: 0 }, // 0-100
    lastUpdated: { type: Date, default: Date.now }
  },
  
  // Issue #3: Weekly progress for charts in Goal Details View
  weeklyProgress: [{
    weekNumber: Number, // Week since goal start
    weekStart: Date,
    weekEnd: Date,
    totalDistance: { type: Number, default: 0 },
    totalCalories: { type: Number, default: 0 },
    workoutCount: { type: Number, default: 0 },
    avgSpeed: { type: Number, default: 0 }
  }],
  
  // Issue #7: Weight tracking history for weight graph
  weightHistory: [{
    date: Date,
    weight: Number,
    source: { 
      type: String, 
      enum: ['manual', 'estimated'], 
      default: 'manual' 
    }
  }]
  // ========== END NEW FIELDS ==========
}, { timestamps: true });

const Goal = mongoose.model('Goal', goalSchema);
export default Goal;
