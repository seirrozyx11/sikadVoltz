import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    plannedHours: { type: Number, required: true },
    completedHours: { type: Number, default: 0 },
    status: { 
      type: String, 
      enum: ['pending', 'completed', 'missed', 'rescheduled'],
      default: 'pending'
    },
    caloriesBurned: { type: Number, default: 0 },
    missedHours: { type: Number, default: 0 }, // Track hours that need to be carried over
    adjustedHours: { type: Number, default: 0 } // Track additional hours from previous missed sessions
  });
  
  const cyclingPlanSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    goal: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', required: true },
    totalDays: { type: Number, required: true },
    dailySessions: [sessionSchema],
    missedCount: { type: Number, default: 0 }, // Track missed sessions
    totalMissedHours: { type: Number, default: 0 }, // Track total accumulated missed hours
    emergencyCatchUp: { type: Boolean, default: false }, // Emergency catch-up flag
    isActive: { type: Boolean, default: true }, // Plan status
    
    // NEW: Smart Plan Adjustment features
    originalPlan: {
      durationWeeks: Number,
      targetHours: Number,
      startDate: Date,
      endDate: Date,
      dailyHours: Number
    },
    adjustmentHistory: [{
      date: { type: Date, default: Date.now },
      missedHours: Number,
      newDailyTarget: Number,
      reason: { 
        type: String, 
        enum: ['missed_day', 'weekly_reset', 'manual_adjustment'],
        default: 'missed_day'
      },
      redistributionMethod: {
        type: String,
        enum: ['distribute_remaining', 'extend_plan', 'increase_intensity'],
        default: 'distribute_remaining'
      }
    }],
    autoAdjustmentSettings: {
      enabled: { type: Boolean, default: true },
      maxDailyHours: { type: Number, default: 3 }, // Safety limit
      gracePeriodDays: { type: Number, default: 2 }, // Buffer days
      weeklyResetThreshold: { type: Number, default: 7 } // Days missed before suggesting reset
    },
    
    planSummary: {
      totalCaloriesToBurn: { type: Number },
      dailyCyclingHours: { type: Number },
      totalPlanDays: { type: Number },
      totalCyclingHours: { type: Number },
      bmr: { type: Number },
      tdee: { type: Number },
      dailyCalorieGoal: { type: Number }
    }
  }, { timestamps: true });

const CyclingPlan = mongoose.model('CyclingPlan', cyclingPlanSchema);
export default CyclingPlan;