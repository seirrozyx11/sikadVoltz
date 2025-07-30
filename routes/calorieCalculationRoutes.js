import express from 'express';
import { 
    calculateBMR, 
    calculateTDEE, 
    calculateCyclingCalories, 
    generateCyclingPlan,
    validateInputs,
    DURATION_MAP,
    logSession,
    emergencyCatchUp
} from '../services/calorieService.js';
import authenticateToken from '../middleware/authenticateToken.js';
import User from '../models/User.js';
import Goal from '../models/Goal.js';
import CyclingPlan from '../models/CyclingPlan.js';

const router = express.Router();

// Calculate and preview plan without saving
router.post('/calculate-plan', authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { currentWeight, targetWeight, planDuration, bodyGoal } = req.body;
        
        // Get user profile
        const user = await User.findById(userId);
        if (!user || !user.profile) {
            return res.status(400).json({ 
                success: false, 
                error: 'User profile is incomplete' 
            });
        }
        
        // Validate inputs
        const validationErrors = validateInputs(
            currentWeight, 
            targetWeight, 
            user.profile.height, 
            planDuration
        );
        
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Validation failed',
                details: validationErrors 
            });
        }
        
        // Calculate plan metrics
        const bmr = calculateBMR(
            user.profile.weight,
            user.profile.height,
            user.profile.birthDate,
            user.profile.gender
        );
        
        const tdee = calculateTDEE(bmr, user.profile.activityLevel);
        const totalDays = DURATION_MAP[planDuration];
        const weightDeltaKg = currentWeight - targetWeight;
        const caloriesNeeded = Math.abs(weightDeltaKg) * 7700;
        const dailyCalorieGoal = caloriesNeeded / totalDays;
        
        // Safety checks
        if (dailyCalorieGoal > 1000) {
            return res.status(400).json({
                success: false,
                error: 'Daily calorie goal exceeds 1000 kcal - unsafe deficit',
                recommendation: 'Please extend the plan duration or reduce weight loss goal'
            });
        }
        
        const caloriesPerHour = calculateCyclingCalories(user.profile.weight, 1, 'moderate');
        const dailyCyclingHours = dailyCalorieGoal / caloriesPerHour;
        
        if (dailyCyclingHours > 4) {
            return res.status(400).json({
                success: false,
                error: 'Daily cycling hours exceed 4 hours - unsafe limit',
                recommendation: 'Please extend the plan duration or reduce weight loss goal'
            });
        }
        
        const totalCyclingHours = dailyCyclingHours * totalDays;
        
        // Special case for weight gain
        if (weightDeltaKg < 0) {
            return res.json({
                success: true,
                data: {
                    goalType: 'weight_gain',
                    message: 'For weight gain, cycle 0.5 hours/day for fitness. Focus on increasing caloric intake.',
                    recommendedCyclingHours: 0.5,
                    dailyCalorieSurplus: Math.abs(dailyCalorieGoal),
                    totalPlanDays: totalDays,
                    bmr,
                    tdee
                }
            });
        }
        
        res.json({
            success: true,
            data: {
                goalType: 'weight_loss',
                totalCaloriesToBurn: caloriesNeeded,
                dailyCyclingHours: parseFloat(dailyCyclingHours.toFixed(2)),
                totalPlanDays: totalDays,
                totalCyclingHours: parseFloat(totalCyclingHours.toFixed(2)),
                bmr: parseFloat(bmr.toFixed(0)),
                tdee: parseFloat(tdee.toFixed(0)),
                dailyCalorieGoal: parseFloat(dailyCalorieGoal.toFixed(0)),
                caloriesPerHour: parseFloat(caloriesPerHour.toFixed(0)),
                warning: "Missed sessions will increase next day's hours."
            }
        });
        
    } catch (error) {
        console.error('Calculate plan error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to calculate plan',
            details: error.message 
        });
    }
});

// Create and save cycling plan
router.post('/create-plan', authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { goalId } = req.body;
        
        if (!goalId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Goal ID is required' 
            });
        }
        
        // Check if user already has an active plan
        const existingPlan = await CyclingPlan.findOne({ 
            user: userId, 
            isActive: true 
        });
        
        if (existingPlan) {
            return res.status(400).json({
                success: false,
                error: 'User already has an active cycling plan',
                existingPlan: existingPlan._id
            });
        }
        
        const planData = await generateCyclingPlan(userId, goalId);
        
        const cyclingPlan = new CyclingPlan({
            ...planData,
            planSummary: planData.planSummary
        });
        
        await cyclingPlan.save();
        
        res.status(201).json({
            success: true,
            data: cyclingPlan,
            message: 'Cycling plan created successfully'
        });
        
    } catch (error) {
        console.error('Create plan error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create plan',
            details: error.message 
        });
    }
});

// Log session completion
router.post('/log-session', authenticateToken, async (req, res) => {
    try {
        const { planId, dayIndex, hoursCompleted } = req.body;
        
        if (!planId || dayIndex === undefined || hoursCompleted === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Plan ID, day index, and hours completed are required'
            });
        }
        
        const updatedPlan = await logSession(planId, dayIndex, hoursCompleted);
        
        res.json({
            success: true,
            data: updatedPlan,
            message: 'Session logged successfully'
        });
        
    } catch (error) {
        console.error('Log session error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to log session',
            details: error.message
        });
    }
});

// Emergency catch-up
router.post('/emergency-catchup', authenticateToken, async (req, res) => {
    try {
        const { planId } = req.body;
        
        if (!planId) {
            return res.status(400).json({
                success: false,
                error: 'Plan ID is required'
            });
        }
        
        const updatedPlan = await emergencyCatchUp(planId);
        
        res.json({
            success: true,
            data: updatedPlan,
            message: 'Emergency catch-up completed successfully'
        });
        
    } catch (error) {
        console.error('Emergency catch-up error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to perform emergency catch-up',
            details: error.message
        });
    }
});

// Get current user's active plan
router.get('/current-plan', authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        
        const activePlan = await CyclingPlan.findOne({ 
            user: userId, 
            isActive: true 
        }).populate('goal');
        
        if (!activePlan) {
            return res.status(404).json({
                success: false,
                error: 'No active cycling plan found'
            });
        }
        
        res.json({
            success: true,
            data: activePlan
        });
        
    } catch (error) {
        console.error('Get current plan error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get current plan',
            details: error.message
        });
    }
});

export default router;
