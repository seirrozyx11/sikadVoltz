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