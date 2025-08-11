// sv_backend/services/calorieService.js
import User from '../models/User.js';
import Goal from '../models/Goal.js';
import CyclingPlan from '../models/CyclingPlan.js';

// Plan duration mapping (as per CALORIE.MD specification)
export const DURATION_MAP = {
    "15days": 15,
    "30days": 30, 
    "2months": 60,
    "3months": 90,
    "6months": 180,
    "1year": 365
};

// Calculate BMR using Harris-Benedict Equation (as per CALORIE.MD specification)
export function calculateBMR(weight, height, birthDate, gender) {
    const age = new Date().getFullYear() - new Date(birthDate).getFullYear();
    
    if (gender === 'male') {
        return 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
    } else {
        return 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
    }
}

export function calculateCyclingCaloriesDirect(weight, hours, intensity = 'moderate') {
  // Enhanced 5-level intensity system matching frontend
  const metValues = { 
    'stopped': 0.0,
    'coasting': 2.0,
    'light': 4.0, 
    'moderate': 8.0, 
    'vigorous': 12.0 
  };
  
  // Handle numeric intensity levels from ESP32 (0-4)
  if (typeof intensity === 'number') {
    switch (intensity) {
      case 0: intensity = 'stopped'; break;
      case 1: intensity = 'coasting'; break;
      case 2: intensity = 'light'; break;
      case 3: intensity = 'moderate'; break;
      case 4: intensity = 'vigorous'; break;
      default: intensity = 'moderate';
    }
  }
  
  const met = metValues[intensity] || metValues.moderate;
  return parseFloat((met * weight * hours).toFixed(2));
}

// Calculate TDEE based on activity level (as per CALORIE.MD specification)
export function calculateTDEE(bmr, activityLevel) {
    const activityMultipliers = {
        'sedentary': 1.2,
        'light': 1.375,
        'moderate': 1.55,
        'active': 1.725,
        'very_active': 1.9
    };
    return bmr * (activityMultipliers[activityLevel] || 1.55);
}

// In calorieService.js
export async function calculateCyclingCalories(userId, hours, intensity = 'moderate') {
    try {
      // 1. Get user profile data
      const user = await User.findById(userId).select('profile');
      if (!user || !user.profile) {
        throw new Error('User profile not found');
      }
  
      // 2. Use profile data for calculation
      const { weight, activityLevel } = user.profile;
      
      // 3. Get MET value based on intensity (enhanced 5-level system)
      const metValues = {
        'stopped': 0.0,
        'coasting': 2.0,
        'light': 4.0,
        'moderate': 8.0,
        'vigorous': 12.0
      };
      
      // Handle numeric intensity levels from ESP32 (0-4)
      let intensityKey = intensity;
      if (typeof intensity === 'number') {
        switch (intensity) {
          case 0: intensityKey = 'stopped'; break;
          case 1: intensityKey = 'coasting'; break;
          case 2: intensityKey = 'light'; break;
          case 3: intensityKey = 'moderate'; break;
          case 4: intensityKey = 'vigorous'; break;
          default: intensityKey = 'moderate';
        }
      }
      
      // 4. Calculate calories: MET * weight(kg) * hours
      const met = metValues[intensityKey] || metValues.moderate;
      const caloriesBurned = met * weight * hours;
      
      return {
        success: true,
        caloriesBurned: parseFloat(caloriesBurned.toFixed(2)),
        details: {
          met,
          weight,
          hours,
          intensity: intensityKey,
          activityLevel
        }
      };
    } catch (error) {
      console.error('Error calculating cycling calories:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

// Validate inputs according to CALORIE.MD specifications
export function validateInputs(currentWeight, targetWeight, height, planDuration) {
    const errors = [];
    
    // Ensure positive numbers
    if (currentWeight <= 0) errors.push('Current weight must be positive');
    if (targetWeight <= 0) errors.push('Target weight must be positive');
    if (height <= 0) errors.push('Height must be positive');
    
    // Check for unrealistic weight change (>50% change)
    const weightChange = Math.abs(currentWeight - targetWeight);
    const maxRealisticChange = currentWeight * 0.5;
    if (weightChange > maxRealisticChange) {
        errors.push('Weight change goal exceeds 50% of current weight - unsafe');
    }
    
    // Validate plan duration
    if (!DURATION_MAP[planDuration]) {
        errors.push('Invalid plan duration');
    }
    
    return errors;
}

// Generate cycling plan
export async function generateCyclingPlan(userId, goalId) {
    const user = await User.findById(userId);
    const goal = await Goal.findById(goalId);
    
    if (!user || !goal) {
        throw new Error('User or goal not found');
    }
    
    // Validate user profile completeness
    if (!user.profile || !user.profile.weight || !user.profile.height || 
        !user.profile.birthDate || !user.profile.gender || !user.profile.activityLevel) {
        throw new Error('User profile is incomplete');
    }
    
    // Calculate BMR and TDEE
    const bmr = calculateBMR(
        user.profile.weight,
        user.profile.height,
        user.profile.birthDate,
        user.profile.gender
    );
    
    const tdee = calculateTDEE(bmr, user.profile.activityLevel);
    
    // Calculate plan metrics according to CALORIE.MD
    const weightDeltaKg = goal.currentWeight - goal.targetWeight; // negative for weight gain
    const caloriesNeeded = Math.abs(weightDeltaKg) * 7700; // 7700 kcal ≈ 1 kg
    
    // Calculate days from goal dates
    const totalDays = Math.ceil((goal.targetDate - goal.startDate) / (1000 * 60 * 60 * 24));
    
    const dailyCalorieGoal = caloriesNeeded / totalDays;
    
    // Safety Check: Fail if daily_calorie_goal > 1000 (unsafe deficit)
    if (dailyCalorieGoal > 1000) {
        throw new Error('Daily calorie goal exceeds 1000 kcal - unsafe deficit');
    }
    
    // Calculate cycling hours
    const caloriesPerHour = calculateCyclingCaloriesDirect(user.profile.weight, 1, 'moderate');
    const dailyCyclingHours = dailyCalorieGoal / caloriesPerHour;
    
    // Feasibility Check: Fail if daily_cycling_hours > 4 (exceeds safe limits)
    if (dailyCyclingHours > 4) {
        throw new Error('Daily cycling hours exceed 4 hours - unsafe limit');
    }
    
    const totalCyclingHours = dailyCyclingHours * totalDays;
    
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
        totalDays: totalDays,
        dailySessions: sessions,
        
        // NEW: Store original plan data for smart adjustments
        originalPlan: {
            durationWeeks: Math.ceil(totalDays / 7),
            targetHours: totalCyclingHours,
            startDate: goal.startDate,
            endDate: goal.targetDate,
            dailyHours: dailyCyclingHours
        },
        autoAdjustmentSettings: {
            enabled: true,
            maxDailyHours: 3,
            gracePeriodDays: 2,
            weeklyResetThreshold: 7
        },
        
        // Plan summary metrics
        planSummary: {
            totalCaloriesToBurn: caloriesNeeded,
            dailyCyclingHours: dailyCyclingHours,
            totalPlanDays: totalDays,
            totalCyclingHours: totalCyclingHours,
            bmr: bmr,
            tdee: tdee,
            dailyCalorieGoal: dailyCalorieGoal,
            warning: "Missed sessions will increase next day's hours."
        }
    };
}

// Dynamic Session Scheduling Functions (as per CALORIE.MD)

// Get daily hours with missed hours carryover
export function getDailyHours(plan, dayIndex) {
    if (dayIndex >= plan.totalDays) {
        return 0; // Plan completed
    }
    
    const session = plan.dailySessions[dayIndex];
    if (!session) return 0;
    
    // Calculate today's requirement: planned + carried over missed hours
    const hoursToday = session.plannedHours + session.adjustedHours;
    return Math.min(hoursToday, 4); // Cap at 4 hours max per day
}

// Update session progress in real-time during cycling
// This allows the frontend to sync progress without completing the session
export const updateSessionProgressLegacy = async (userId, sessionId, completedHours, caloriesBurned = 0) => {
  // Find the active plan for the user
  const plan = await CyclingPlan.findOne({ user: userId, isActive: true });
  
  if (!plan) {
    throw new Error('No active plan found for user');
  }

  // Find the session by ID
  const session = plan.dailySessions.id(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Update session progress
  session.completedHours = Math.min(completedHours, session.plannedHours);
  session.caloriesBurned = Math.max(0, caloriesBurned);
  
  // Mark as completed if all hours are done
  if (session.completedHours >= session.plannedHours) {
    session.status = 'completed';
  } else if (session.status === 'pending') {
    session.status = 'progress'; // ✅ FIXED: Match frontend calendar expectations ('progress' not 'in_progress')
  }

  // Save the updated plan
  await plan.save();

  // Return the updated session and plan summary
  return {
    session: {
      _id: session._id,
      date: session.date,
      plannedHours: session.plannedHours,
      completedHours: session.completedHours,
      status: session.status,
      caloriesBurned: session.caloriesBurned
    },
    planSummary: {
      totalCaloriesBurned: plan.dailySessions.reduce((sum, s) => sum + (s.caloriesBurned || 0), 0),
      totalCompletedHours: plan.dailySessions.reduce((sum, s) => sum + (s.completedHours || 0), 0),
      totalPlannedHours: plan.dailySessions.reduce((sum, s) => sum + (s.plannedHours || 0), 0)
    }
  };
};

// Log session with carryover logic
export const logSession = async (planId, dayIndex, hoursActuallyDone) => {
    const CyclingPlan = (await import('../models/CyclingPlan.js')).default;
    const plan = await CyclingPlan.findById(planId);
    
    if (!plan || dayIndex >= plan.dailySessions.length) {
        throw new Error('Invalid plan or day index');
    }
    
    const session = plan.dailySessions[dayIndex];
    const requiredHours = getDailyHours(plan, dayIndex);
    
    // Update current session
    session.completedHours = hoursActuallyDone;
    session.caloriesBurned = calculateCyclingCaloriesDirect(session.weight || 70, hoursActuallyDone, 'moderate');
    
    if (hoursActuallyDone >= requiredHours) {
        session.status = 'completed';
    } else {
        session.status = 'missed';
        plan.missedCount += 1;
        
        // Calculate missed hours to carry over
        const missedHours = requiredHours - hoursActuallyDone;
        session.missedHours = missedHours;
        plan.totalMissedHours += missedHours;
        
        // Carry over to next available session
        for (let i = dayIndex + 1; i < plan.dailySessions.length; i++) {
            const nextSession = plan.dailySessions[i];
            if (nextSession.status === 'pending') {
                nextSession.adjustedHours += missedHours;
                break;
            }
        }
        
        // Auto-pause plan after 3 missed days
        if (plan.missedCount >= 3) {
            plan.isActive = false;
        }
    }
    
    await plan.save();
    return plan;
}

// Handle emergency catch-up: distribute missed hours across remaining sessions
export async function emergencyCatchUp(planId) {
    const CyclingPlan = (await import('../models/CyclingPlan.js')).default;
    const plan = await CyclingPlan.findById(planId);
    
    if (!plan || plan.totalMissedHours === 0) {
        return plan;
    }
    
    // Find remaining pending sessions
    const pendingSessions = plan.dailySessions.filter(s => s.status === 'pending');
    
    if (pendingSessions.length === 0) {
        throw new Error('No pending sessions available for catch-up');
    }
    
    // Distribute missed hours evenly
    const hoursPerSession = plan.totalMissedHours / pendingSessions.length;
    
    pendingSessions.forEach(session => {
        const additionalHours = Math.min(hoursPerSession, 4 - session.plannedHours);
        session.adjustedHours += additionalHours;
    });
    
    // Auto-pause plan after 3 missed days (moved before save)
    if (plan.missedCount >= 3) {
        plan.isActive = false;
    }
    
    plan.emergencyCatchUp = true;
    plan.totalMissedHours = 0; // Reset after redistribution
    
    await plan.save();
    return plan;
}
