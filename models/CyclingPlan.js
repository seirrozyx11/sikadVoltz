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
    caloriesBurned: { type: Number, default: 0 }
  });
  
  const cyclingPlanSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    goal: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', required: true },
    totalDays: { type: Number, required: true },
    dailySessions: [sessionSchema],
    missedCount: { type: Number, default: 0 }, // Track missed sessions
    emergencyCatchUp: { type: Boolean, default: false } // Emergency catch-up flag
  }, { timestamps: true });

const CyclingPlan = mongoose.model('CyclingPlan', cyclingPlanSchema);
export default CyclingPlan;