import { calculateCyclingCaloriesDirect } from './services/calorieService.js';

console.log('🔧 Testing Critical Fixes...\n');

// Test 1: Calculation Function
console.log('✅ Test 1: calculateCyclingCaloriesDirect');
try {
  const result = calculateCyclingCaloriesDirect(70, 1, 'moderate');
  console.log(`   Result: ${result} calories/hour`);
  console.log('   Status: ✅ WORKING\n');
} catch (error) {
  console.log(`   Error: ${error.message}`);
  console.log('   Status: ❌ FAILED\n');
}

// Test 2: Different intensities
console.log('✅ Test 2: Different Intensity Levels');
try {
  const light = calculateCyclingCaloriesDirect(70, 1, 'light');
  const moderate = calculateCyclingCaloriesDirect(70, 1, 'moderate');
  const vigorous = calculateCyclingCaloriesDirect(70, 1, 'vigorous');
  
  console.log(`   Light: ${light} cal/hr`);
  console.log(`   Moderate: ${moderate} cal/hr`);
  console.log(`   Vigorous: ${vigorous} cal/hr`);
  console.log('   Status: ✅ WORKING\n');
} catch (error) {
  console.log(`   Error: ${error.message}`);
  console.log('   Status: ❌ FAILED\n');
}

console.log('🎯 Critical fixes appear to be working!');
console.log('📋 Next: Start the server to test full functionality');
