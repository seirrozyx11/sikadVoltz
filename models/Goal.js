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
  }
}, { timestamps: true });

const Goal = mongoose.model('Goal', goalSchema);
export default Goal;
