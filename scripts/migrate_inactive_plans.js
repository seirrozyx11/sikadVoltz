import mongoose from 'mongoose';
import CyclingPlan from '../models/CyclingPlan.js';
import WorkoutHistory from '../models/WorkoutHistory.js';
import Goal from '../models/Goal.js';
import User from '../models/User.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function migrateInactivePlans() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all inactive plans that haven't been archived yet
    console.log('🔍 Finding inactive plans that need archiving...');
    const inactivePlans = await CyclingPlan.find({ 
      isActive: false,
      // Only migrate plans that don't already have a WorkoutHistory entry
    }).populate('goal user');

    console.log(`📋 Found ${inactivePlans.length} inactive plans`);

    if (inactivePlans.length === 0) {
      console.log('✅ No inactive plans need migration');
      return;
    }

    let migratedCount = 0;
    let skippedCount = 0;

    for (const plan of inactivePlans) {
      try {
        // Check if this plan already has a WorkoutHistory entry
        const existingHistory = await WorkoutHistory.findOne({ plan: plan._id });
        if (existingHistory) {
          console.log(`⏭️  Skipping plan ${plan._id} - already has workout history`);
          skippedCount++;
          continue;
        }

        const completedSessions = plan.dailySessions.filter(s => s.status === 'completed');
        const missedSessions = plan.dailySessions.filter(s => s.status === 'missed');
        const totalCaloriesBurned = plan.dailySessions.reduce((sum, s) => sum + (s.caloriesBurned || 0), 0);

        // Create workout history entry
        const workoutHistory = new WorkoutHistory({
          user: plan.user._id,
          plan: plan._id,
          startDate: plan.dailySessions[0]?.date || plan.createdAt,
          endDate: plan.updatedAt || new Date(),
          status: plan.status === 'completed' ? 'completed' : 'abandoned', // Use valid enum values
          resetReason: 'user_request',
          notes: 'Plan archived during system migration to fix activity history display',
          statistics: {
            totalSessions: plan.dailySessions.length,
            completedSessions: completedSessions.length,
            missedSessions: missedSessions.length,
            totalHours: plan.planSummary?.totalCyclingHours || 0,
            completedHours: plan.completedHours || 0,
            caloriesBurned: totalCaloriesBurned,
            averageIntensity: plan.planSummary?.averageIntensity || 2,
            originalGoal: plan.goal ? {
              type: plan.goal.type,
              targetValue: plan.goal.targetValue,
              timeframe: plan.goal.timeframe
            } : null
          },
          planSummary: {
            planType: plan.planType || 'Recommended',
            dailyCyclingHours: plan.planSummary?.dailyCyclingHours || 0,
            totalPlanDays: plan.planSummary?.totalPlanDays || 0,
            completionRate: plan.dailySessions.length > 0 ? (completedSessions.length / plan.dailySessions.length) * 100 : 0
          }
        });

        await workoutHistory.save();
        migratedCount++;
        
        console.log(`✅ Migrated plan ${plan._id} for user ${plan.user.email} - ${completedSessions.length}/${plan.dailySessions.length} sessions completed`);

      } catch (error) {
        console.error(`❌ Error migrating plan ${plan._id}:`, error.message);
      }
    }

    console.log(`\n🎉 Migration complete!`);
    console.log(`   ✅ Migrated: ${migratedCount} plans`);
    console.log(`   ⏭️  Skipped: ${skippedCount} plans (already archived)`);
    console.log(`   📚 Total WorkoutHistory entries: ${await WorkoutHistory.countDocuments()}`);

  } catch (error) {
    console.error('❌ Migration error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the migration
migrateInactivePlans();