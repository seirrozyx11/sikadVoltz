import mongoose from 'mongoose';
import CyclingPlan from '../models/CyclingPlan.js';

// Helper function to calculate plan type based on daily cycling hours
const calculatePlanType = (dailyCyclingHours) => {
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
};

async function fixPlanTypes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sikadvoltz');
    console.log('Connected to MongoDB');

    // Find all plans and check their planType values
    const allPlans = await CyclingPlan.find({});
    console.log(`Found ${allPlans.length} total plans in database`);
    
    const plansToFix = [];
    for (const plan of allPlans) {
      const planType = plan.planType;
      const dailyCyclingHours = plan.planSummary?.dailyCyclingHours;
      
      console.log(`Plan ${plan._id}: planType="${planType}", dailyCyclingHours=${dailyCyclingHours}`);
      
      if (!planType || planType === "N/A" || planType === "" || planType === "Recommended") {
        plansToFix.push(plan);
      }
    }

    console.log(`Found ${plansToFix.length} plans that need planType updates`);

    let updatedCount = 0;
    for (const plan of plansToFix) {
      const dailyCyclingHours = plan.planSummary?.dailyCyclingHours;
      const newPlanType = calculatePlanType(dailyCyclingHours);
      
      await CyclingPlan.findByIdAndUpdate(plan._id, { planType: newPlanType });
      console.log(`Updated Plan ${plan._id}: ${dailyCyclingHours}h/day -> "${newPlanType}"`);
      updatedCount++;
    }

    console.log(`\nSuccessfully updated ${updatedCount} plans with proper planType classifications`);
    
    // Verify the updates
    const verifyPlans = await CyclingPlan.find({
      $or: [
        { planType: { $exists: false } },
        { planType: null },
        { planType: "N/A" },
        { planType: "" }
      ]
    });
    
    console.log(`Remaining plans without planType: ${verifyPlans.length}`);

  } catch (error) {
    console.error('Error fixing plan types:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
fixPlanTypes();