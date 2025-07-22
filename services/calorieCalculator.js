import User from '../models/User.js';
import Goal from '../models/Goal.js';
import CyclingPlan from '../models/CyclingPlan.js';

// Calculate BMR (Basal Metabolic Rate)
export function calculateBMR(user) {
  if (
    !user.profile ||
    user.profile.weight == null ||
    user.profile.height == null ||
    !user.profile.birthDate ||
    !user.profile.gender
  ) {
    throw new Error('User profile is incomplete for BMR calculation');
  }
  const age = new Date().getFullYear() - new Date(user.profile.birthDate).getFullYear();
  if (user.profile.gender === 'male') {
    return 10 * user.profile.weight + 6.25 * user.profile.height - 5 * age + 5;
  } else {
    return 10 * user.profile.weight + 6.25 * user.profile.height - 5 * age - 161;
  }
}

// Calculate TDEE (Total Daily Energy Expenditure)
export function calculateTDEE(bmr, activityLevel) {
  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    'very active': 1.9
  };
  return bmr * multipliers[activityLevel];
}

// Calculate calories burned per hour cycling
export function calculateCyclingCalories(user, hours, intensity = 'moderate') {
  const metValues = {
    light: 4,
    moderate: 8,
    vigorous: 12
  };
  return metValues[intensity] * user.profile.weight * hours;
}

// Create a cycling plan
export async function createCyclingPlan(userId, goalId) {
  const user = await User.findById(userId);
  const goal = await Goal.findById(goalId);

  const totalDays = Math.ceil((goal.targetDate - goal.startDate) / (1000 * 60 * 60 * 24));
  const weightDiff = goal.currentWeight - goal.targetWeight;
  const totalCalories = weightDiff * 7700;

  const dailyCalories = totalCalories / totalDays;
  const dailyHours = dailyCalories / calculateCyclingCalories(user, 1);

  const dailySessions = [];
  let currentDate = new Date(goal.startDate);

  for (let i = 0; i < totalDays; i++) {
    dailySessions.push({
      date: new Date(currentDate),
      plannedHours: dailyHours,
      completedHours: 0,
      status: 'pending',
      caloriesBurned: 0
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const cyclingPlan = new CyclingPlan({
    user: userId,
    goal: goalId,
    totalDays,
    dailySessions
  });

  await cyclingPlan.save();
  return cyclingPlan;
}

// Record a completed session
export async function recordSession(planId, sessionDate, completedHours) {
  const plan = await CyclingPlan.findById(planId);
  const session = plan.dailySessions.find(s =>
    s.date.toISOString().split('T')[0] === sessionDate.toISOString().split('T')[0]
  );

  if (!session) {
    throw new Error('Session not found for this date');
  }

  session.completedHours = completedHours;
  session.status = 'completed';

  const user = await User.findById(plan.user);
  session.caloriesBurned = calculateCyclingCalories(user, completedHours);

  await plan.save();
  return plan;
}

// Handle missed sessions
export async function handleMissedSession(planId, missedDate) {
  const plan = await CyclingPlan.findById(planId);
  const today = new Date();

  const missedSession = plan.dailySessions.find(s =>
    s.date.toISOString().split('T')[0] === missedDate.toISOString().split('T')[0] &&
    s.status === 'pending'
  );

  if (!missedSession) return plan;

  const upcomingSessions = plan.dailySessions.filter(s =>
    s.date > missedDate &&
    s.date <= today &&
    s.status === 'pending'
  );

  if (upcomingSessions.length === 0) {
    missedSession.status = 'missed';
    await plan.save();
    return plan;
  }

  const additionalHours = missedSession.plannedHours / upcomingSessions.length;
  upcomingSessions.forEach(session => {
    session.plannedHours += additionalHours;
  });

  missedSession.status = 'missed';
  await plan.save();
  return plan;
}
