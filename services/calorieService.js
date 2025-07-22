// sv_backend/services/calorieService.js
import User from '../models/User.js';
import Goal from '../models/Goal.js';

// Calculate BMR using Mifflin-St Jeor Equation
export function calculateBMR(weight, height, birthDate, gender) {
    const age = new Date().getFullYear() - new Date(birthDate).getFullYear();
    const base = (10 * weight) + (6.25 * height) - (5 * age);
    return gender === 'male' ? base + 5 : base - 161;
}

// Calculate TDEE based on activity level
export function calculateTDEE(bmr, activityLevel) {
    const activityMultipliers = {
        'sedentary': 1.2,
        'light': 1.375,
        'moderate': 1.55,
        'active': 1.725,
        'very active': 1.9
    };
    return bmr * (activityMultipliers[activityLevel] || 1.55);
}

// Calculate calories burned cycling
export function calculateCyclingCalories(weight, hours, intensity = 'moderate') {
    const metValues = {
        'light': 4,
        'moderate': 8,
        'vigorous': 12
    };
    return metValues[intensity] * weight * hours;
}

// Generate cycling plan
export async function generateCyclingPlan(userId, goalId) {
    const user = await User.findById(userId);
    const goal = await Goal.findById(goalId);
    
    const bmr = calculateBMR(
        user.profile.weight,
        user.profile.height,
        user.profile.birthDate,
        user.profile.gender
    );
    
    const tdee = calculateTDEE(bmr, user.profile.activityLevel);
    const totalKg = goal.currentWeight - goal.targetWeight;
    const totalKcal = totalKg * 7700; // 7700 kcal ≈ 1kg of fat
    
    const timeframeDays = Math.ceil((goal.targetDate - goal.startDate) / (1000 * 60 * 60 * 24));
    const dailyKcalTarget = totalKcal / timeframeDays;
    
    const dailyCyclingHours = dailyKcalTarget / calculateCyclingCalories(user.profile.weight, 1);
    
    // Generate daily sessions
    const sessions = [];
    const currentDate = new Date(goal.startDate);
    const endDate = new Date(goal.targetDate);
    
    while (currentDate <= endDate) {
        sessions.push({
            date: new Date(currentDate),
            plannedHours: dailyCyclingHours,
            completedHours: 0,
            status: 'pending',
            caloriesBurned: 0
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return {
        user: userId,
        goal: goalId,
        totalDays: timeframeDays,
        dailySessions: sessions
    };
}
