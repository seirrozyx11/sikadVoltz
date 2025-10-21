/**
 * TDEE Service - Enhanced Goal Planning Calculations
 * Implements TDEE-based personalized cycling plan calculations
 * Reference: docs/ENHANCED_GOAL_PLANNING_FORMULA_TDEE.md
 */

/**
 * Calculate Basal Metabolic Rate using Mifflin-St Jeor Equation
 * Most accurate BMR formula validated in 80% of cases within ±10%
 * 
 * @param {number} weight - Weight in kg
 * @param {number} height - Height in cm
 * @param {number} age - Age in years
 * @param {string} gender - 'male' or 'female'
 * @returns {number} BMR in kcal/day
 * 
 * Formula:
 * Males: BMR = (10 × weight) + (6.25 × height) - (5 × age) + 5
 * Females: BMR = (10 × weight) + (6.25 × height) - (5 × age) - 161
 * 
 * Reference: Mifflin MD, et al. (1990) - American Journal of Clinical Nutrition
 */
function calculateBMR(weight, height, age, gender) {
  if (!weight || !height || !age || !gender) {
    throw new Error('Missing required parameters for BMR calculation');
  }

  if (weight <= 0 || height <= 0 || age <= 0) {
    throw new Error('Invalid parameters: weight, height, and age must be positive');
  }

  const genderLower = gender.toLowerCase();
  
  if (genderLower === 'male') {
    return (10 * weight) + (6.25 * height) - (5 * age) + 5;
  } else if (genderLower === 'female') {
    return (10 * weight) + (6.25 * height) - (5 * age) - 161;
  } else {
    // Default to male formula for 'other' or unspecified
    return (10 * weight) + (6.25 * height) - (5 * age) + 5;
  }
}

/**
 * Calculate Total Daily Energy Expenditure
 * Uses WHO/FAO/UNU validated activity multipliers
 * 
 * @param {number} bmr - Basal Metabolic Rate
 * @param {string} activityLevel - Activity level: 'sedentary', 'light', 'moderate', 'active', 'very_active'
 * @returns {number} TDEE in kcal/day
 * 
 * Formula: TDEE = BMR × Activity_Multiplier
 * 
 * Activity Multipliers:
 * - sedentary: 1.2 (office job, little/no exercise)
 * - light: 1.375 (light exercise 1-3 days/week)
 * - moderate: 1.55 (moderate exercise 3-5 days/week)
 * - active: 1.725 (hard exercise 6-7 days/week)
 * - very_active: 1.9 (physical job + daily intense exercise)
 * 
 * Reference: WHO/FAO/UNU (2004) Human Energy Requirements
 */
function calculateTDEE(bmr, activityLevel) {
  if (!bmr || bmr <= 0) {
    throw new Error('Invalid BMR value');
  }

  const activityMultipliers = {
    'sedentary': 1.2,
    'light': 1.375,
    'moderate': 1.55,
    'active': 1.725,
    'very_active': 1.9,
    'very active': 1.9, // Handle space variant
  };
  
  const level = activityLevel ? activityLevel.toLowerCase().replace(' ', '_') : 'moderate';
  const multiplier = activityMultipliers[level] || 1.55; // Default to moderate
  
  return bmr * multiplier;
}

/**
 * Calculate total calories needed for weight change
 * 1 kg of body weight ≈ 7700 kcal (scientific constant)
 * 
 * @param {number} currentWeight - Current weight in kg
 * @param {number} targetWeight - Target weight in kg
 * @returns {number} Total calories needed
 * 
 * Formula: Total_Calories = |Target_Weight - Current_Weight| × 7700
 * 
 * Reference: Hall KD, et al. (2011) - The Lancet
 */
function calculateTotalCalories(currentWeight, targetWeight) {
  if (!currentWeight || !targetWeight) {
    throw new Error('Missing required parameters for total calories calculation');
  }

  if (currentWeight <= 0 || targetWeight <= 0) {
    throw new Error('Invalid weights: must be positive');
  }

  const weightChange = Math.abs(targetWeight - currentWeight);
  return weightChange * 7700; // kcal per kg
}

/**
 * Calculate daily calorie deficit/surplus
 * Distributes total calorie requirement across timeline
 * 
 * @param {number} totalCalories - Total calories needed
 * @param {number} timeframeWeeks - Timeframe in weeks
 * @returns {number} Daily deficit/surplus in kcal
 * 
 * Formula: Daily_Deficit = Total_Calories / (Timeframe_Weeks × 7)
 */
function calculateDailyDeficit(totalCalories, timeframeWeeks) {
  if (!totalCalories || !timeframeWeeks) {
    throw new Error('Missing required parameters for daily deficit calculation');
  }

  if (timeframeWeeks <= 0) {
    throw new Error('Invalid timeframe: must be positive');
  }

  const totalDays = timeframeWeeks * 7;
  return totalCalories / totalDays;
}

/**
 * Calculate daily cycling hours using activity-adjusted MET
 * Uses personalized MET values based on user's activity level
 * 
 * @param {number} weight - Weight in kg
 * @param {number} dailyDeficit - Daily calorie deficit
 * @param {string} activityLevel - Activity level (determines cycling intensity)
 * @returns {number} Daily cycling hours
 * 
 * Formula:
 * Calories_Per_Hour = MET × Weight
 * Hours = Daily_Deficit / Calories_Per_Hour
 * 
 * MET Values by Activity Level:
 * - sedentary: 6.0 (light cycling for beginners)
 * - light: 7.0 (light-moderate cycling)
 * - moderate: 8.0 (moderate cycling) DEFAULT
 * - active: 9.0 (hard cycling)
 * - very_active: 10.0 (very hard cycling)
 * 
 * Reference: Ainsworth BE, et al. (2011) - Compendium of Physical Activities
 */
function calculateDailyCyclingHours(weight, dailyDeficit, activityLevel = 'moderate') {
  if (!weight || weight <= 0) {
    throw new Error('Invalid weight: must be positive');
  }

  if (!dailyDeficit || dailyDeficit < 0) {
    throw new Error('Invalid daily deficit');
  }

  // Activity-adjusted MET values
  const metValues = {
    'sedentary': 6.0,      // Light cycling (beginner)
    'light': 7.0,          // Light-moderate cycling
    'moderate': 8.0,       // Moderate cycling DEFAULT
    'active': 9.0,         // Hard cycling
    'very_active': 10.0,   // Very hard cycling
    'very active': 10.0,   // Handle space variant
  };
  
  const level = activityLevel ? activityLevel.toLowerCase().replace(' ', '_') : 'moderate';
  const met = metValues[level] || 8.0; // Default to moderate
  
  const caloriesPerHour = met * weight;
  return dailyDeficit / caloriesPerHour;
}

/**
 * Calculate target daily calorie intake
 * Provides nutrition target for weight goal
 * 
 * @param {number} tdee - Total Daily Energy Expenditure
 * @param {number} dailyDeficit - Daily calorie deficit
 * @param {string} bodyGoal - Goal: 'lose', 'maintain', or 'gain'
 * @returns {number} Target daily calories
 * 
 * Formulas:
 * - Weight Loss: Target = TDEE - Daily_Deficit
 * - Weight Gain: Target = TDEE + Daily_Deficit
 * - Maintenance: Target = TDEE
 */
function calculateTargetCalories(tdee, dailyDeficit, bodyGoal) {
  if (!tdee || tdee <= 0) {
    throw new Error('Invalid TDEE value');
  }

  if (!dailyDeficit || dailyDeficit < 0) {
    throw new Error('Invalid daily deficit');
  }

  const goalLower = bodyGoal ? bodyGoal.toLowerCase() : 'lose';

  if (goalLower === 'lose') {
    return tdee - dailyDeficit;  // Eat less than TDEE
  } else if (goalLower === 'gain') {
    return tdee + dailyDeficit;  // Eat more than TDEE
  } else {
    return tdee;  // Maintain weight
  }
}

/**
 * Validate plan safety and generate warnings
 * Implements safety limits based on ACSM guidelines
 * 
 * @param {object} params - Validation parameters
 * @param {number} params.currentWeight - Current weight in kg
 * @param {number} params.targetWeight - Target weight in kg
 * @param {number} params.timeframeWeeks - Timeframe in weeks
 * @param {number} params.dailyDeficit - Daily calorie deficit
 * @param {number} params.dailyCyclingHours - Daily cycling hours
 * @param {number} params.targetCalories - Target daily calories
 * @param {string} params.gender - Gender
 * @param {string} params.bodyGoal - Body goal
 * @returns {array} Array of warning messages
 * 
 * Safety Limits:
 * - Max weight loss rate: 1.0 kg/week
 * - Max weight gain rate: 0.5 kg/week
 * - Max daily deficit: 1000 kcal
 * - Max daily surplus: 500 kcal
 * - Max cycling hours: 3.0 hours/day
 * - Min daily intake: 1500 kcal (male), 1200 kcal (female)
 * 
 * Reference: ACSM (2021) Guidelines for Exercise Testing and Prescription
 */
function validatePlanSafety({
  currentWeight,
  targetWeight,
  timeframeWeeks,
  dailyDeficit,
  dailyCyclingHours,
  targetCalories,
  gender,
  bodyGoal
}) {
  const warnings = [];
  
  // Check weight change rate
  const weeklyWeightChange = Math.abs(currentWeight - targetWeight) / timeframeWeeks;
  const maxWeeklyChange = bodyGoal === 'gain' ? 0.5 : 1.0;
  
  if (weeklyWeightChange > maxWeeklyChange) {
    warnings.push(
      `Weight change rate (${weeklyWeightChange.toFixed(2)} kg/week) exceeds safe limit of ${maxWeeklyChange} kg/week. ` +
      `Consider extending timeframe to ${Math.ceil((Math.abs(currentWeight - targetWeight) / maxWeeklyChange))} weeks.`
    );
  }
  
  // Check daily deficit/surplus
  const maxDailyChange = bodyGoal === 'gain' ? 500 : 1000;
  if (dailyDeficit > maxDailyChange) {
    warnings.push(
      `Daily calorie ${bodyGoal === 'gain' ? 'surplus' : 'deficit'} (${Math.round(dailyDeficit)} kcal) ` +
      `exceeds safe limit of ${maxDailyChange} kcal. This may be too aggressive.`
    );
  }
  
  // Check cycling hours
  if (dailyCyclingHours > 3.0) {
    warnings.push(
      `Daily cycling requirement (${dailyCyclingHours.toFixed(2)} hours) exceeds safe limit of 3 hours. ` +
      `Consider combining exercise with diet adjustment for better results.`
    );
  }
  
  // Check minimum calorie intake
  const genderLower = gender ? gender.toLowerCase() : 'male';
  const minCalories = genderLower === 'female' ? 1200 : 1500;
  
  if (bodyGoal === 'lose' && targetCalories < minCalories) {
    warnings.push(
      `Target calorie intake (${Math.round(targetCalories)} kcal) is below minimum recommended ` +
      `(${minCalories} kcal for ${gender}). This is unsafe and may cause health issues.`
    );
  }
  
  // Check for unrealistic short timeframes
  if (timeframeWeeks < 4 && Math.abs(currentWeight - targetWeight) > 5) {
    warnings.push(
      `Timeframe of ${timeframeWeeks} weeks is very short for ${Math.abs(currentWeight - targetWeight).toFixed(1)} kg change. ` +
      `Sustainable results typically require at least 4-6 weeks.`
    );
  }
  
  return warnings;
}

/**
 * Calculate complete enhanced goal plan with TDEE
 * Main function that orchestrates all calculations
 * 
 * @param {object} params - User profile and goal data
 * @param {number} params.currentWeight - Current weight in kg
 * @param {number} params.height - Height in cm
 * @param {number} params.age - Age in years
 * @param {string} params.gender - Gender: 'male' or 'female'
 * @param {string} params.activityLevel - Activity level
 * @param {number} params.targetWeight - Target weight in kg
 * @param {number} params.timeframeWeeks - Timeframe in weeks
 * @param {string} params.bodyGoal - Body goal: 'lose', 'maintain', or 'gain'
 * @returns {object} Complete plan with TDEE insights
 * 
 * Returns:
 * {
 *   success: boolean,
 *   warnings: string[],
 *   dailyCyclingHours: number,
 *   bmr: number,
 *   tdee: number,
 *   targetCalories: number,
 *   dailyDeficit: number,
 *   totalCalories: number,
 *   weeklyWeightChange: number,
 *   weeklyCalories: number
 * }
 */
function calculateEnhancedGoalPlan({
  currentWeight,
  height,
  age,
  gender,
  activityLevel,
  targetWeight,
  timeframeWeeks,
  bodyGoal = 'lose'
}) {
  try {
    // Input validation
    if (!currentWeight || !height || !age || !gender || !targetWeight || !timeframeWeeks) {
      throw new Error('Missing required parameters for enhanced goal plan calculation');
    }

    // Step 1: Calculate BMR
    const bmr = calculateBMR(currentWeight, height, age, gender);
    
    // Step 2: Calculate TDEE
    const tdee = calculateTDEE(bmr, activityLevel);
    
    // Step 3: Calculate total calories needed
    const totalCalories = calculateTotalCalories(currentWeight, targetWeight);
    
    // Step 4: Calculate daily deficit
    const dailyDeficit = calculateDailyDeficit(totalCalories, timeframeWeeks);
    
    // Step 5: Calculate daily cycling hours
    const dailyCyclingHours = calculateDailyCyclingHours(currentWeight, dailyDeficit, activityLevel);
    
    // Step 6: Calculate target calorie intake
    const targetCalories = calculateTargetCalories(tdee, dailyDeficit, bodyGoal);
    
    // Safety validations
    const warnings = validatePlanSafety({
      currentWeight,
      targetWeight,
      timeframeWeeks,
      dailyDeficit,
      dailyCyclingHours,
      targetCalories,
      gender,
      bodyGoal
    });
    
    // Calculate additional metrics
    const weeklyWeightChange = Math.abs(currentWeight - targetWeight) / timeframeWeeks;
    const weeklyCalories = dailyDeficit * 7;
    
    // Determine plan classification
    const planType = classifyPlanType(dailyCyclingHours);
    const intensityLevel = getIntensityLevel(activityLevel);
    
    return {
      success: warnings.length === 0,
      warnings: warnings,
      
      // Core metrics
      dailyCyclingHours: dailyCyclingHours,
      
      // TDEE insights (NEW!)
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      targetCalories: Math.round(targetCalories),
      dailyDeficit: Math.round(dailyDeficit),
      
      // Progress tracking
      totalCalories: Math.round(totalCalories),
      weeklyWeightChange: Math.round(weeklyWeightChange * 100) / 100, // 2 decimal places
      weeklyCalories: Math.round(weeklyCalories),
      
      // Plan classification
      planType: planType,
      intensityLevel: intensityLevel,
      
      // Calculation details (for transparency)
      calculationMethod: 'TDEE-based (Mifflin-St Jeor + WHO/FAO/UNU)',
      accuracy: '±5-10%'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      warnings: [`Calculation error: ${error.message}`]
    };
  }
}

/**
 * Helper: Classify plan type based on daily cycling hours
 * @private
 */
function classifyPlanType(dailyCyclingHours) {
  if (!dailyCyclingHours) return "Recommended";
  
  const hours = dailyCyclingHours;
  if (hours >= 0.75 && hours <= 1.0) {
    return "Safe (45min - 1hr)";
  } else if (hours > 1.0 && hours <= 2.0) {
    return "Recommended (1.1hr - 2hr)";
  } else if (hours > 2.0 && hours <= 3.0) {
    return "Risky (2.1hr - 3hr)";
  } else if (hours > 3.0) {
    return "Unsafe (above 3hr limit)";
  } else {
    return "Below healthy minimum (<45min)";
  }
}

/**
 * Helper: Get intensity level description
 * @private
 */
function getIntensityLevel(activityLevel) {
  const level = activityLevel ? activityLevel.toLowerCase().replace(' ', '_') : 'moderate';
  
  const intensityMap = {
    'sedentary': 'Light',
    'light': 'Light-Moderate',
    'moderate': 'Moderate',
    'active': 'Hard',
    'very_active': 'Very Hard'
  };
  
  return intensityMap[level] || 'Moderate';
}

// ES6 Module Exports
export {
  calculateBMR,
  calculateTDEE,
  calculateTotalCalories,
  calculateDailyDeficit,
  calculateDailyCyclingHours,
  calculateTargetCalories,
  validatePlanSafety,
  calculateEnhancedGoalPlan
};

// CommonJS compatibility (if needed)
export default {
  calculateBMR,
  calculateTDEE,
  calculateTotalCalories,
  calculateDailyDeficit,
  calculateDailyCyclingHours,
  calculateTargetCalories,
  validatePlanSafety,
  calculateEnhancedGoalPlan
};
