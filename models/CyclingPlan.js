import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    plannedHours: { type: Number, required: true },
    completedHours: { type: Number, default: 0 },
    status: { 
      type: String, 
      enum: ['pending', 'completed', 'missed', 'rescheduled', 'redistributed'],
      default: 'pending'
    },
    caloriesBurned: { type: Number, default: 0 },
    missedHours: { type: Number, default: 0 }, // Track hours that need to be carried over
    adjustedHours: { type: Number, default: 0 }, // Track additional hours from previous missed sessions
    
    // NEW: Action tracking for missed session management
    actionHistory: [{
      action: {
        type: String,
        enum: ['reschedule', 'redistribute'],
        required: false
      },
      actionDate: { type: Date, default: Date.now },
      originalDate: Date,
      newDate: Date, // For rescheduled sessions
      hoursRedistributed: Number, // For redistributed sessions
      reason: String
    }],
    
    // NEW: Original session tracking (for rescheduled sessions)
    originalSessionId: { type: mongoose.Schema.Types.ObjectId },
    isRescheduled: { type: Boolean, default: false },
    isRedistributed: { type: Boolean, default: false }
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
    planType: { type: String, default: "Recommended" }, // Safety classification for plan intensity
    
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
        enum: ['missed_day', 'weekly_reset', 'manual_adjustment', 'reschedule_action', 'redistribute_action'],
        default: 'missed_day'
      },
      redistributionMethod: {
        type: String,
        enum: ['distribute_remaining', 'extend_plan', 'increase_intensity'],
        default: 'distribute_remaining'
      },
      // NEW: Action tracking for engagement-focused missed session management
      actionType: {
        type: String,
        enum: ['reschedule', 'redistribute'],
        required: false
      },
      sessionsAffected: [{ type: mongoose.Schema.Types.ObjectId }],
      userChoiceReason: String
    }],
    autoAdjustmentSettings: {
      enabled: { type: Boolean, default: true },
      maxDailyHours: { type: Number, default: 3 }, // Safety limit
      gracePeriodDays: { type: Number, default: 2 }, // Buffer days
      weeklyResetThreshold: { type: Number, default: 7 } // Days missed before suggesting reset
    },
    
    // NEW: Engagement-focused missed session management
    missedSessionManagement: {
      pendingMissedSessions: [{ type: mongoose.Schema.Types.ObjectId }], // Sessions awaiting user action
      lastActionDate: Date,
      userEngagementScore: { type: Number, default: 0 }, // Track how user handles missed sessions
      consecutiveEngagements: { type: Number, default: 0 }, // Consecutive non-skip actions
      totalRescheduledSessions: { type: Number, default: 0 },
      totalRedistributedSessions: { type: Number, default: 0 }
    },
    
    planSummary: {
      totalCaloriesToBurn: { type: Number },
      dailyCyclingHours: { type: Number },
      totalPlanDays: { type: Number },
      totalCyclingHours: { type: Number },
      bmr: { type: Number }, // Basal Metabolic Rate (kcal/day)
      tdee: { type: Number }, // Total Daily Energy Expenditure (kcal/day)
      dailyCalorieGoal: { type: Number },
      targetCalories: { type: Number }, // NEW: Target daily calorie intake (kcal/day)
      dailyDeficit: { type: Number }, // NEW: Daily calorie deficit/surplus (kcal/day)
      weeklyWeightChange: { type: Number }, // NEW: Expected weekly weight change (kg/week)
      weeklyCalories: { type: Number }, // NEW: Weekly calorie deficit/surplus
      activityLevel: { type: String }, // NEW: User's activity level for MET calculation
      bodyGoal: { type: String } // NEW: 'lose', 'maintain', or 'gain'
    },
    
    // NEW: Safety warnings from TDEE calculations
    tdeeWarnings: [{ type: String }]
  }, { timestamps: true });

const CyclingPlan = mongoose.model('CyclingPlan', cyclingPlanSchema);
export default CyclingPlan;