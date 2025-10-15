/**
 * TDEE Service Unit Tests
 * 
 * Comprehensive tests for Total Daily Energy Expenditure (TDEE) calculations
 * including BMR, TDEE, calorie calculations, cycling hour estimations,
 * safety validations, and enhanced goal planning.
 * 
 * Test Coverage:
 * - All 8 calculation functions
 * - 6 safety validation checks
 * - 4 real-world user profiles
 * - Edge cases and error handling
 * - Calculation accuracy (±1% tolerance)
 */

import { jest } from '@jest/globals';
import {
  calculateBMR,
  calculateTDEE,
  calculateTotalCalories,
  calculateDailyDeficit,
  calculateDailyCyclingHours,
  calculateTargetCalories,
  validatePlanSafety,
  calculateEnhancedGoalPlan
} from '../services/tdeeService.js';

describe('TDEE Service - Unit Tests', () => {
  
  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  
  /**
   * Check if value is within tolerance of expected
   * @param {number} actual - Actual calculated value
   * @param {number} expected - Expected value
   * @param {number} tolerance - Tolerance percentage (default 1%)
   * @returns {boolean}
   */
  const withinTolerance = (actual, expected, tolerance = 0.01) => {
    const diff = Math.abs(actual - expected);
    const allowedDiff = expected * tolerance;
    return diff <= allowedDiff;
  };

  /**
   * Expect value to be within tolerance
   * @param {number} actual - Actual value
   * @param {number} expected - Expected value
   * @param {number} tolerance - Tolerance (default 1%)
   */
  const expectWithinTolerance = (actual, expected, tolerance = 0.01) => {
    expect(withinTolerance(actual, expected, tolerance)).toBe(true);
    // Also log for debugging
    if (!withinTolerance(actual, expected, tolerance)) {
      console.error(`Value ${actual} not within ${tolerance * 100}% of ${expected}`);
    }
  };

  // ============================================================================
  // TEST SUITE 1: BMR CALCULATION (Mifflin-St Jeor Equation)
  // ============================================================================
  
  describe('calculateBMR', () => {
    
    it('should calculate BMR correctly for male', () => {
      // Male: BMR = 10 × weight + 6.25 × height - 5 × age + 5
      const weight = 75; // kg
      const height = 175; // cm
      const age = 30; // years
      const gender = 'male';
      
      // Expected: 10*75 + 6.25*175 - 5*30 + 5 = 750 + 1093.75 - 150 + 5 = 1698.75
      const expected = 1698.75;
      const result = calculateBMR(weight, height, age, gender);
      
      expect(result).toBe(expected);
    });

    it('should calculate BMR correctly for female', () => {
      // Female: BMR = 10 × weight + 6.25 × height - 5 × age - 161
      const weight = 55; // kg
      const height = 160; // cm
      const age = 25; // years
      const gender = 'female';
      
      // Expected: 10*55 + 6.25*160 - 5*25 - 161 = 550 + 1000 - 125 - 161 = 1264
      const expected = 1264;
      const result = calculateBMR(weight, height, age, gender);
      
      expect(result).toBe(expected);
    });

    it('should handle heavier male (90kg)', () => {
      const result = calculateBMR(90, 180, 35, 'male');
      // 10*90 + 6.25*180 - 5*35 + 5 = 900 + 1125 - 175 + 5 = 1855
      expect(result).toBe(1855);
    });

    it('should handle lighter female (50kg)', () => {
      const result = calculateBMR(50, 155, 28, 'female');
      // 10*50 + 6.25*155 - 5*28 - 161 = 500 + 968.75 - 140 - 161 = 1167.75
      expect(result).toBe(1167.75);
    });

    it('should handle older male (60 years)', () => {
      const result = calculateBMR(80, 175, 60, 'male');
      // 10*80 + 6.25*175 - 5*60 + 5 = 800 + 1093.75 - 300 + 5 = 1598.75
      expect(result).toBe(1598.75);
    });

    it('should default to male when gender is invalid', () => {
      const resultMale = calculateBMR(75, 175, 30, 'male');
      const resultInvalid = calculateBMR(75, 175, 30, 'other');
      expect(resultInvalid).toBe(resultMale);
    });

    it('should handle edge case: minimum realistic values', () => {
      const result = calculateBMR(40, 140, 18, 'female');
      // 10*40 + 6.25*140 - 5*18 - 161 = 400 + 875 - 90 - 161 = 1024
      expect(result).toBe(1024);
    });

    it('should handle edge case: maximum realistic values', () => {
      const result = calculateBMR(150, 200, 70, 'male');
      // 10*150 + 6.25*200 - 5*70 + 5 = 1500 + 1250 - 350 + 5 = 2405
      expect(result).toBe(2405);
    });
  });

  // ============================================================================
  // TEST SUITE 2: TDEE CALCULATION (WHO/FAO/UNU Multipliers)
  // ============================================================================
  
  describe('calculateTDEE', () => {
    const baseBMR = 1700;

    it('should calculate TDEE for sedentary activity level', () => {
      const result = calculateTDEE(baseBMR, 'sedentary');
      expect(result).toBe(baseBMR * 1.2);
      expect(result).toBe(2040);
    });

    it('should calculate TDEE for light activity level', () => {
      const result = calculateTDEE(baseBMR, 'light');
      expect(result).toBe(baseBMR * 1.375);
      expect(result).toBe(2337.5);
    });

    it('should calculate TDEE for moderate activity level', () => {
      const result = calculateTDEE(baseBMR, 'moderate');
      expect(result).toBe(baseBMR * 1.55);
      expect(result).toBe(2635);
    });

    it('should calculate TDEE for active activity level', () => {
      const result = calculateTDEE(baseBMR, 'active');
      expect(result).toBe(baseBMR * 1.725);
      expect(result).toBe(2932.5);
    });

    it('should calculate TDEE for very-active activity level', () => {
      const result = calculateTDEE(baseBMR, 'very-active');
      expect(result).toBe(baseBMR * 1.9);
      expect(result).toBe(3230);
    });

    it('should default to sedentary for invalid activity level', () => {
      const result = calculateTDEE(baseBMR, 'invalid');
      expect(result).toBe(baseBMR * 1.2);
    });

    it('should handle low BMR (1000)', () => {
      const result = calculateTDEE(1000, 'moderate');
      expect(result).toBe(1550);
    });

    it('should handle high BMR (2500)', () => {
      const result = calculateTDEE(2500, 'active');
      expect(result).toBe(4312.5);
    });
  });

  // ============================================================================
  // TEST SUITE 3: TOTAL CALORIES CALCULATION (7700 kcal/kg)
  // ============================================================================
  
  describe('calculateTotalCalories', () => {
    
    it('should calculate calories for weight loss', () => {
      const weightChange = -5; // lose 5kg
      const result = calculateTotalCalories(weightChange);
      expect(result).toBe(-38500); // -5 * 7700
    });

    it('should calculate calories for weight gain', () => {
      const weightChange = 3; // gain 3kg
      const result = calculateTotalCalories(weightChange);
      expect(result).toBe(23100); // 3 * 7700
    });

    it('should handle zero weight change', () => {
      const result = calculateTotalCalories(0);
      expect(result).toBe(0);
    });

    it('should handle large weight loss (10kg)', () => {
      const result = calculateTotalCalories(-10);
      expect(result).toBe(-77000);
    });

    it('should handle small weight change (0.5kg)', () => {
      const result = calculateTotalCalories(0.5);
      expect(result).toBe(3850);
    });

    it('should handle fractional weight change', () => {
      const result = calculateTotalCalories(-2.5);
      expect(result).toBe(-19250);
    });
  });

  // ============================================================================
  // TEST SUITE 4: DAILY DEFICIT CALCULATION
  // ============================================================================
  
  describe('calculateDailyDeficit', () => {
    
    it('should calculate daily deficit for weight loss', () => {
      const totalCalories = -38500; // -5kg
      const timeframeWeeks = 12;
      const days = timeframeWeeks * 7; // 84 days
      
      const result = calculateDailyDeficit(totalCalories, timeframeWeeks);
      expectWithinTolerance(result, -458.33, 0.01); // -38500 / 84
    });

    it('should calculate daily surplus for weight gain', () => {
      const totalCalories = 23100; // +3kg
      const timeframeWeeks = 12;
      
      const result = calculateDailyDeficit(totalCalories, timeframeWeeks);
      expectWithinTolerance(result, 275, 0.01); // 23100 / 84
    });

    it('should handle short timeframe (4 weeks)', () => {
      const totalCalories = -15400; // -2kg
      const timeframeWeeks = 4;
      const days = 28;
      
      const result = calculateDailyDeficit(totalCalories, timeframeWeeks);
      expectWithinTolerance(result, -550, 0.01); // -15400 / 28
    });

    it('should handle long timeframe (24 weeks)', () => {
      const totalCalories = -38500; // -5kg
      const timeframeWeeks = 24;
      const days = 168;
      
      const result = calculateDailyDeficit(totalCalories, timeframeWeeks);
      expectWithinTolerance(result, -229.17, 0.01); // -38500 / 168
    });

    it('should return 0 for zero calorie change', () => {
      const result = calculateDailyDeficit(0, 12);
      expect(result).toBe(0);
    });
  });

  // ============================================================================
  // TEST SUITE 5: DAILY CYCLING HOURS CALCULATION
  // ============================================================================
  
  describe('calculateDailyCyclingHours', () => {
    const weight = 75; // kg

    it('should calculate cycling hours for sedentary (MET 5.0)', () => {
      const dailyDeficit = -500; // kcal
      const activityLevel = 'sedentary';
      // Hours = |deficit| / (MET * weight) = 500 / (5.0 * 75) = 500 / 375 = 1.33
      
      const result = calculateDailyCyclingHours(weight, dailyDeficit, activityLevel);
      expectWithinTolerance(result, 1.33, 0.01);
    });

    it('should calculate cycling hours for light (MET 6.5)', () => {
      const dailyDeficit = -500;
      const activityLevel = 'light';
      // Hours = 500 / (6.5 * 75) = 500 / 487.5 = 1.026
      
      const result = calculateDailyCyclingHours(weight, dailyDeficit, activityLevel);
      expectWithinTolerance(result, 1.026, 0.01);
    });

    it('should calculate cycling hours for moderate (MET 8.0)', () => {
      const dailyDeficit = -500;
      const activityLevel = 'moderate';
      // Hours = 500 / (8.0 * 75) = 500 / 600 = 0.833
      
      const result = calculateDailyCyclingHours(weight, dailyDeficit, activityLevel);
      expectWithinTolerance(result, 0.833, 0.01);
    });

    it('should calculate cycling hours for active (MET 10.0)', () => {
      const dailyDeficit = -500;
      const activityLevel = 'active';
      // Hours = 500 / (10.0 * 75) = 500 / 750 = 0.667
      
      const result = calculateDailyCyclingHours(weight, dailyDeficit, activityLevel);
      expectWithinTolerance(result, 0.667, 0.01);
    });

    it('should calculate cycling hours for very-active (MET 12.0)', () => {
      const dailyDeficit = -500;
      const activityLevel = 'very-active';
      // Hours = 500 / (12.0 * 75) = 500 / 900 = 0.556
      
      const result = calculateDailyCyclingHours(weight, dailyDeficit, activityLevel);
      expectWithinTolerance(result, 0.556, 0.01);
    });

    it('should handle weight gain (positive surplus)', () => {
      const dailySurplus = 300; // kcal
      const activityLevel = 'moderate';
      // Hours = |300| / (8.0 * 75) = 300 / 600 = 0.5
      
      const result = calculateDailyCyclingHours(weight, dailySurplus, activityLevel);
      expectWithinTolerance(result, 0.5, 0.01);
    });

    it('should handle large deficit (1000 kcal)', () => {
      const dailyDeficit = -1000;
      const activityLevel = 'moderate';
      // Hours = 1000 / (8.0 * 75) = 1000 / 600 = 1.667
      
      const result = calculateDailyCyclingHours(weight, dailyDeficit, activityLevel);
      expectWithinTolerance(result, 1.667, 0.01);
    });

    it('should handle heavier person (90kg)', () => {
      const weight90 = 90;
      const dailyDeficit = -500;
      const activityLevel = 'moderate';
      // Hours = 500 / (8.0 * 90) = 500 / 720 = 0.694
      
      const result = calculateDailyCyclingHours(weight90, dailyDeficit, activityLevel);
      expectWithinTolerance(result, 0.694, 0.01);
    });

    it('should handle lighter person (55kg)', () => {
      const weight55 = 55;
      const dailyDeficit = -500;
      const activityLevel = 'moderate';
      // Hours = 500 / (8.0 * 55) = 500 / 440 = 1.136
      
      const result = calculateDailyCyclingHours(weight55, dailyDeficit, activityLevel);
      expectWithinTolerance(result, 1.136, 0.01);
    });

    it('should return 0 for zero deficit', () => {
      const result = calculateDailyCyclingHours(weight, 0, 'moderate');
      expect(result).toBe(0);
    });

    it('should default to sedentary MET for invalid activity level', () => {
      const dailyDeficit = -500;
      const result = calculateDailyCyclingHours(weight, dailyDeficit, 'invalid');
      expectWithinTolerance(result, 1.33, 0.01); // Same as sedentary
    });
  });

  // ============================================================================
  // TEST SUITE 6: TARGET CALORIES CALCULATION
  // ============================================================================
  
  describe('calculateTargetCalories', () => {
    const tdee = 2500;

    it('should calculate target calories for weight loss', () => {
      const dailyDeficit = -500;
      const result = calculateTargetCalories(tdee, dailyDeficit);
      expect(result).toBe(2000); // 2500 - 500
    });

    it('should calculate target calories for weight gain', () => {
      const dailySurplus = 300;
      const result = calculateTargetCalories(tdee, dailySurplus);
      expect(result).toBe(2800); // 2500 + 300
    });

    it('should calculate target calories for maintenance', () => {
      const result = calculateTargetCalories(tdee, 0);
      expect(result).toBe(2500); // TDEE
    });

    it('should handle large deficit', () => {
      const result = calculateTargetCalories(tdee, -1000);
      expect(result).toBe(1500);
    });

    it('should handle large surplus', () => {
      const result = calculateTargetCalories(tdee, 500);
      expect(result).toBe(3000);
    });

    it('should handle low TDEE (1500)', () => {
      const lowTdee = 1500;
      const result = calculateTargetCalories(lowTdee, -300);
      expect(result).toBe(1200);
    });

    it('should handle high TDEE (3500)', () => {
      const highTdee = 3500;
      const result = calculateTargetCalories(highTdee, -500);
      expect(result).toBe(3000);
    });
  });

  // ============================================================================
  // TEST SUITE 7: PLAN SAFETY VALIDATION
  // ============================================================================
  
  describe('validatePlanSafety', () => {
    
    it('should pass validation for safe weight loss plan', () => {
      const planData = {
        bodyGoal: 'lose',
        weeklyWeightChange: -0.5, // Safe: 0.5kg/week
        dailyDeficit: -500,
        dailyCyclingHours: 1.0,
        targetCalories: 2000,
        timeframeWeeks: 12,
        gender: 'male'
      };

      const warnings = validatePlanSafety(planData);
      expect(warnings).toEqual([]);
    });

    it('should warn about excessive weight loss rate', () => {
      const planData = {
        bodyGoal: 'lose',
        weeklyWeightChange: -1.2, // Excessive: 1.2kg/week
        dailyDeficit: -500,
        dailyCyclingHours: 1.0,
        targetCalories: 2000,
        timeframeWeeks: 12,
        gender: 'male'
      };

      const warnings = validatePlanSafety(planData);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Weight loss rate');
      expect(warnings[0]).toContain('1.0 kg/week');
    });

    it('should warn about excessive weight gain rate', () => {
      const planData = {
        bodyGoal: 'gain',
        weeklyWeightChange: 1.0, // Excessive: 1.0kg/week
        dailyDeficit: 500,
        dailyCyclingHours: 0.5,
        targetCalories: 3000,
        timeframeWeeks: 12,
        gender: 'male'
      };

      const warnings = validatePlanSafety(planData);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Weight gain rate');
      expect(warnings[0]).toContain('0.8 kg/week');
    });

    it('should warn about excessive daily deficit', () => {
      const planData = {
        bodyGoal: 'lose',
        weeklyWeightChange: -0.8,
        dailyDeficit: -1100, // Excessive: 1100 kcal/day
        dailyCyclingHours: 1.5,
        targetCalories: 1500,
        timeframeWeeks: 12,
        gender: 'male'
      };

      const warnings = validatePlanSafety(planData);
      expect(warnings.some(w => w.includes('Daily calorie deficit'))).toBe(true);
      expect(warnings.some(w => w.includes('1000 kcal'))).toBe(true);
    });

    it('should warn about excessive cycling hours', () => {
      const planData = {
        bodyGoal: 'lose',
        weeklyWeightChange: -0.8,
        dailyDeficit: -800,
        dailyCyclingHours: 3.5, // Excessive: 3.5 hours/day
        targetCalories: 1700,
        timeframeWeeks: 12,
        gender: 'male'
      };

      const warnings = validatePlanSafety(planData);
      expect(warnings.some(w => w.includes('Daily cycling hours'))).toBe(true);
      expect(warnings.some(w => w.includes('3.0 hours'))).toBe(true);
    });

    it('should warn about too low calorie intake for male', () => {
      const planData = {
        bodyGoal: 'lose',
        weeklyWeightChange: -0.8,
        dailyDeficit: -1000,
        dailyCyclingHours: 1.5,
        targetCalories: 1400, // Too low for male (< 1500)
        timeframeWeeks: 12,
        gender: 'male'
      };

      const warnings = validatePlanSafety(planData);
      expect(warnings.some(w => w.includes('Target calorie intake'))).toBe(true);
      expect(warnings.some(w => w.includes('1500 kcal'))).toBe(true);
    });

    it('should warn about too low calorie intake for female', () => {
      const planData = {
        bodyGoal: 'lose',
        weeklyWeightChange: -0.6,
        dailyDeficit: -600,
        dailyCyclingHours: 1.2,
        targetCalories: 1100, // Too low for female (< 1200)
        timeframeWeeks: 12,
        gender: 'female'
      };

      const warnings = validatePlanSafety(planData);
      expect(warnings.some(w => w.includes('Target calorie intake'))).toBe(true);
      expect(warnings.some(w => w.includes('1200 kcal'))).toBe(true);
    });

    it('should warn about too short timeframe', () => {
      const planData = {
        bodyGoal: 'lose',
        weeklyWeightChange: -0.5,
        dailyDeficit: -500,
        dailyCyclingHours: 1.0,
        targetCalories: 2000,
        timeframeWeeks: 2, // Too short (< 4 weeks)
        gender: 'male'
      };

      const warnings = validatePlanSafety(planData);
      expect(warnings.some(w => w.includes('Timeframe'))).toBe(true);
      expect(warnings.some(w => w.includes('4-52 weeks'))).toBe(true);
    });

    it('should warn about too long timeframe', () => {
      const planData = {
        bodyGoal: 'lose',
        weeklyWeightChange: -0.3,
        dailyDeficit: -300,
        dailyCyclingHours: 0.6,
        targetCalories: 2200,
        timeframeWeeks: 60, // Too long (> 52 weeks)
        gender: 'male'
      };

      const warnings = validatePlanSafety(planData);
      expect(warnings.some(w => w.includes('Timeframe'))).toBe(true);
      expect(warnings.some(w => w.includes('4-52 weeks'))).toBe(true);
    });

    it('should handle multiple warnings', () => {
      const planData = {
        bodyGoal: 'lose',
        weeklyWeightChange: -1.5, // Warning 1: Excessive rate
        dailyDeficit: -1200, // Warning 2: Excessive deficit
        dailyCyclingHours: 3.8, // Warning 3: Excessive hours
        targetCalories: 1300, // Warning 4: Too low for male
        timeframeWeeks: 2, // Warning 5: Too short
        gender: 'male'
      };

      const warnings = validatePlanSafety(planData);
      expect(warnings.length).toBeGreaterThanOrEqual(3); // At least 3 warnings
    });

    it('should pass validation for safe weight gain plan', () => {
      const planData = {
        bodyGoal: 'gain',
        weeklyWeightChange: 0.5, // Safe: 0.5kg/week
        dailyDeficit: 350,
        dailyCyclingHours: 0.5,
        targetCalories: 2800,
        timeframeWeeks: 12,
        gender: 'male'
      };

      const warnings = validatePlanSafety(planData);
      expect(warnings).toEqual([]);
    });
  });

  // ============================================================================
  // TEST SUITE 8: ENHANCED GOAL PLAN (Integration Test)
  // ============================================================================
  
  describe('calculateEnhancedGoalPlan', () => {
    
    it('should generate complete plan for average male (weight loss)', () => {
      const planInput = {
        currentWeight: 75,
        targetWeight: 70,
        height: 175,
        age: 30,
        gender: 'male',
        activityLevel: 'moderate',
        timeframeWeeks: 12,
        bodyGoal: 'lose'
      };

      const result = calculateEnhancedGoalPlan(planInput);

      // Verify all fields are present
      expect(result).toHaveProperty('bmr');
      expect(result).toHaveProperty('tdee');
      expect(result).toHaveProperty('totalCalories');
      expect(result).toHaveProperty('dailyDeficit');
      expect(result).toHaveProperty('dailyCyclingHours');
      expect(result).toHaveProperty('targetCalories');
      expect(result).toHaveProperty('weeklyWeightChange');
      expect(result).toHaveProperty('weeklyCalories');
      expect(result).toHaveProperty('activityLevel');
      expect(result).toHaveProperty('bodyGoal');
      expect(result).toHaveProperty('warnings');

      // Verify calculations
      // BMR: 10*75 + 6.25*175 - 5*30 + 5 = 1698.75
      expect(result.bmr).toBe(1698.75);
      
      // TDEE: 1698.75 * 1.55 = 2633.06
      expectWithinTolerance(result.tdee, 2633.06, 0.01);
      
      // Total calories: -5 * 7700 = -38500
      expect(result.totalCalories).toBe(-38500);
      
      // Daily deficit: -38500 / 84 = -458.33
      expectWithinTolerance(result.dailyDeficit, -458.33, 0.01);
      
      // Weekly weight change: -5 / 12 = -0.417
      expectWithinTolerance(result.weeklyWeightChange, -0.417, 0.01);
      
      // Target calories: 2633.06 - 458.33 = 2174.73
      expectWithinTolerance(result.targetCalories, 2174.73, 0.02);
      
      // Cycling hours: 458.33 / (8.0 * 75) = 0.764
      expectWithinTolerance(result.dailyCyclingHours, 0.764, 0.02);
      
      // Should be safe plan (no warnings)
      expect(result.warnings).toEqual([]);
    });

    it('should generate complete plan for sedentary female (weight loss)', () => {
      const planInput = {
        currentWeight: 55,
        targetWeight: 52,
        height: 160,
        age: 25,
        gender: 'female',
        activityLevel: 'sedentary',
        timeframeWeeks: 8,
        bodyGoal: 'lose'
      };

      const result = calculateEnhancedGoalPlan(planInput);

      // BMR: 10*55 + 6.25*160 - 5*25 - 161 = 1264
      expect(result.bmr).toBe(1264);
      
      // TDEE: 1264 * 1.2 = 1516.8
      expect(result.tdee).toBe(1516.8);
      
      // Total calories: -3 * 7700 = -23100
      expect(result.totalCalories).toBe(-23100);
      
      // Daily deficit: -23100 / 56 = -412.5
      expectWithinTolerance(result.dailyDeficit, -412.5, 0.01);
      
      // Weekly weight change: -3 / 8 = -0.375
      expectWithinTolerance(result.weeklyWeightChange, -0.375, 0.01);
      
      // Target calories: 1516.8 - 412.5 = 1104.3
      expectWithinTolerance(result.targetCalories, 1104.3, 0.02);
      
      // Should have warning about low calories (< 1200 for female)
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('Target calorie intake'))).toBe(true);
    });

    it('should generate complete plan for active male (weight loss)', () => {
      const planInput = {
        currentWeight: 90,
        targetWeight: 80,
        height: 180,
        age: 35,
        gender: 'male',
        activityLevel: 'active',
        timeframeWeeks: 16,
        bodyGoal: 'lose'
      };

      const result = calculateEnhancedGoalPlan(planInput);

      // BMR: 10*90 + 6.25*180 - 5*35 + 5 = 1855
      expect(result.bmr).toBe(1855);
      
      // TDEE: 1855 * 1.725 = 3199.88
      expectWithinTolerance(result.tdee, 3199.88, 0.01);
      
      // Total calories: -10 * 7700 = -77000
      expect(result.totalCalories).toBe(-77000);
      
      // Daily deficit: -77000 / 112 = -687.5
      expectWithinTolerance(result.dailyDeficit, -687.5, 0.01);
      
      // Weekly weight change: -10 / 16 = -0.625
      expectWithinTolerance(result.weeklyWeightChange, -0.625, 0.01);
      
      // Should be safe plan (no warnings expected)
      expect(result.warnings).toEqual([]);
    });

    it('should generate complete plan for weight gain', () => {
      const planInput = {
        currentWeight: 60,
        targetWeight: 65,
        height: 170,
        age: 28,
        gender: 'male',
        activityLevel: 'moderate',
        timeframeWeeks: 12,
        bodyGoal: 'gain'
      };

      const result = calculateEnhancedGoalPlan(planInput);

      // BMR: 10*60 + 6.25*170 - 5*28 + 5 = 1527.5
      expect(result.bmr).toBe(1527.5);
      
      // TDEE: 1527.5 * 1.55 = 2367.625
      expectWithinTolerance(result.tdee, 2367.625, 0.01);
      
      // Total calories: +5 * 7700 = 38500
      expect(result.totalCalories).toBe(38500);
      
      // Daily deficit (surplus): 38500 / 84 = 458.33
      expectWithinTolerance(result.dailyDeficit, 458.33, 0.01);
      
      // Weekly weight change: +5 / 12 = 0.417
      expectWithinTolerance(result.weeklyWeightChange, 0.417, 0.01);
      
      // Target calories: 2367.625 + 458.33 = 2825.96
      expectWithinTolerance(result.targetCalories, 2825.96, 0.02);
      
      // Should be safe plan
      expect(result.warnings).toEqual([]);
    });

    it('should generate plan with warnings for aggressive goal', () => {
      const planInput = {
        currentWeight: 80,
        targetWeight: 65, // Aggressive: -15kg
        height: 175,
        age: 30,
        gender: 'male',
        activityLevel: 'sedentary',
        timeframeWeeks: 8, // Short timeframe
        bodyGoal: 'lose'
      };

      const result = calculateEnhancedGoalPlan(planInput);

      // Should have multiple warnings
      expect(result.warnings.length).toBeGreaterThan(0);
      
      // Check for specific warnings
      const hasWeightRateWarning = result.warnings.some(w => 
        w.includes('Weight loss rate') || w.includes('1.0 kg/week')
      );
      expect(hasWeightRateWarning).toBe(true);
    });

    it('should handle maintenance goal (no weight change)', () => {
      const planInput = {
        currentWeight: 70,
        targetWeight: 70,
        height: 175,
        age: 30,
        gender: 'male',
        activityLevel: 'moderate',
        timeframeWeeks: 12,
        bodyGoal: 'maintain'
      };

      const result = calculateEnhancedGoalPlan(planInput);

      expect(result.totalCalories).toBe(0);
      expect(result.dailyDeficit).toBe(0);
      expect(result.weeklyWeightChange).toBe(0);
      expect(result.dailyCyclingHours).toBe(0);
      expect(result.targetCalories).toBe(result.tdee);
      expect(result.warnings).toEqual([]);
    });

    it('should return all required fields in correct format', () => {
      const planInput = {
        currentWeight: 75,
        targetWeight: 70,
        height: 175,
        age: 30,
        gender: 'male',
        activityLevel: 'moderate',
        timeframeWeeks: 12,
        bodyGoal: 'lose'
      };

      const result = calculateEnhancedGoalPlan(planInput);

      // Verify types
      expect(typeof result.bmr).toBe('number');
      expect(typeof result.tdee).toBe('number');
      expect(typeof result.totalCalories).toBe('number');
      expect(typeof result.dailyDeficit).toBe('number');
      expect(typeof result.dailyCyclingHours).toBe('number');
      expect(typeof result.targetCalories).toBe('number');
      expect(typeof result.weeklyWeightChange).toBe('number');
      expect(typeof result.weeklyCalories).toBe('number');
      expect(typeof result.activityLevel).toBe('string');
      expect(typeof result.bodyGoal).toBe('string');
      expect(Array.isArray(result.warnings)).toBe(true);

      // Verify reasonable ranges
      expect(result.bmr).toBeGreaterThan(1000);
      expect(result.bmr).toBeLessThan(3000);
      expect(result.tdee).toBeGreaterThan(1500);
      expect(result.tdee).toBeLessThan(5000);
    });
  });

  // ============================================================================
  // TEST SUITE 9: EDGE CASES AND ERROR HANDLING
  // ============================================================================
  
  describe('Edge Cases and Error Handling', () => {
    
    it('should handle extreme low weight (40kg)', () => {
      const result = calculateBMR(40, 150, 20, 'female');
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(2000);
    });

    it('should handle extreme high weight (150kg)', () => {
      const result = calculateBMR(150, 190, 40, 'male');
      expect(result).toBeGreaterThan(1500);
      expect(result).toBeLessThan(4000);
    });

    it('should handle extreme low height (140cm)', () => {
      const result = calculateBMR(50, 140, 25, 'female');
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(2000);
    });

    it('should handle extreme high height (200cm)', () => {
      const result = calculateBMR(90, 200, 30, 'male');
      expect(result).toBeGreaterThan(1500);
      expect(result).toBeLessThan(3000);
    });

    it('should handle young age (18)', () => {
      const result = calculateBMR(70, 175, 18, 'male');
      expect(result).toBeGreaterThan(1500);
    });

    it('should handle old age (70)', () => {
      const result = calculateBMR(70, 175, 70, 'male');
      expect(result).toBeGreaterThan(1000);
      expect(result).toBeLessThan(2000);
    });

    it('should handle very short timeframe edge (4 weeks)', () => {
      const planInput = {
        currentWeight: 75,
        targetWeight: 73,
        height: 175,
        age: 30,
        gender: 'male',
        activityLevel: 'moderate',
        timeframeWeeks: 4,
        bodyGoal: 'lose'
      };

      const result = calculateEnhancedGoalPlan(planInput);
      expect(result.warnings).toEqual([]);
    });

    it('should handle very long timeframe edge (52 weeks)', () => {
      const planInput = {
        currentWeight: 90,
        targetWeight: 75,
        height: 180,
        age: 35,
        gender: 'male',
        activityLevel: 'moderate',
        timeframeWeeks: 52,
        bodyGoal: 'lose'
      };

      const result = calculateEnhancedGoalPlan(planInput);
      expect(result.warnings).toEqual([]);
    });

    it('should handle decimal weight values', () => {
      const result = calculateBMR(75.5, 175.5, 30, 'male');
      expect(result).toBeGreaterThan(1600);
      expect(result).toBeLessThan(1800);
    });

    it('should handle very small weight change (0.5kg)', () => {
      const planInput = {
        currentWeight: 70,
        targetWeight: 69.5,
        height: 175,
        age: 30,
        gender: 'male',
        activityLevel: 'moderate',
        timeframeWeeks: 8,
        bodyGoal: 'lose'
      };

      const result = calculateEnhancedGoalPlan(planInput);
      expect(result.warnings).toEqual([]);
      expectWithinTolerance(result.weeklyWeightChange, -0.0625, 0.01);
    });
  });

  // ============================================================================
  // TEST SUITE 10: REAL-WORLD USER PROFILES
  // ============================================================================
  
  describe('Real-World User Profiles', () => {
    
    it('Profile 1: Average Office Worker (Male, 30, Sedentary)', () => {
      const profile = {
        currentWeight: 82,
        targetWeight: 75,
        height: 178,
        age: 32,
        gender: 'male',
        activityLevel: 'sedentary',
        timeframeWeeks: 16,
        bodyGoal: 'lose'
      };

      const result = calculateEnhancedGoalPlan(profile);

      // Should be realistic and safe
      expect(result.weeklyWeightChange).toBeGreaterThan(-0.5);
      expect(result.weeklyWeightChange).toBeLessThan(0);
      expect(result.targetCalories).toBeGreaterThan(1500);
      expect(result.dailyCyclingHours).toBeLessThan(2);
      expect(result.warnings).toEqual([]);
    });

    it('Profile 2: Active Student (Female, 22, Light Active)', () => {
      const profile = {
        currentWeight: 58,
        targetWeight: 55,
        height: 165,
        age: 22,
        gender: 'female',
        activityLevel: 'light',
        timeframeWeeks: 12,
        bodyGoal: 'lose'
      };

      const result = calculateEnhancedGoalPlan(profile);

      expect(result.weeklyWeightChange).toBeGreaterThan(-0.3);
      expect(result.targetCalories).toBeGreaterThan(1200);
      expect(result.dailyCyclingHours).toBeLessThan(1.5);
      expect(result.warnings).toEqual([]);
    });

    it('Profile 3: Gym Enthusiast (Male, 28, Very Active)', () => {
      const profile = {
        currentWeight: 85,
        targetWeight: 80,
        height: 182,
        age: 28,
        gender: 'male',
        activityLevel: 'very-active',
        timeframeWeeks: 12,
        bodyGoal: 'lose'
      };

      const result = calculateEnhancedGoalPlan(profile);

      expect(result.tdee).toBeGreaterThan(2800);
      expect(result.weeklyWeightChange).toBeGreaterThan(-0.5);
      expect(result.targetCalories).toBeGreaterThan(2000);
      expect(result.dailyCyclingHours).toBeLessThan(1);
      expect(result.warnings).toEqual([]);
    });

    it('Profile 4: Bulking Athlete (Male, 25, Active)', () => {
      const profile = {
        currentWeight: 75,
        targetWeight: 82,
        height: 180,
        age: 25,
        gender: 'male',
        activityLevel: 'active',
        timeframeWeeks: 16,
        bodyGoal: 'gain'
      };

      const result = calculateEnhancedGoalPlan(profile);

      expect(result.weeklyWeightChange).toBeGreaterThan(0);
      expect(result.weeklyWeightChange).toBeLessThan(0.5);
      expect(result.targetCalories).toBeGreaterThan(result.tdee);
      expect(result.warnings).toEqual([]);
    });
  });
});
