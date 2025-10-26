import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Telemetry, RideSession } from '../models/Telemetry.js';
import CyclingPlan from '../models/CyclingPlan.js';
import User from '../models/User.js';

dotenv.config();

async function checkUserData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find user by email
    const email = 'miksheen16@gmail.com';
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('❌ User not found:', email);
      process.exit(1);
    }

    console.log('\n📊 User Data:');
    console.log('User ID:', user._id);
    console.log('Email:', user.email);
    console.log('Name:', user.profile?.firstName, user.profile?.lastName);

    // Check RideSessions
    console.log('\n🚴 Ride Sessions:');
    const sessions = await RideSession.find({ userId: user._id }).sort({ startTime: -1 }).limit(10);
    console.log('Total sessions:', sessions.length);
    
    if (sessions.length > 0) {
      console.log('\nRecent sessions:');
      sessions.forEach((session, index) => {
        console.log(`\n${index + 1}. Session ID: ${session.sessionId}`);
        console.log(`   Status: ${session.status}`);
        console.log(`   Start: ${session.startTime}`);
        console.log(`   End: ${session.endTime || 'N/A'}`);
        console.log(`   Distance: ${session.totalDistance || 0} km`);
        console.log(`   Calories: ${session.totalCalories || 0} kcal`);
        console.log(`   Duration: ${session.duration || 0} seconds`);
        console.log(`   Device: ${session.deviceId}`);
      });
    } else {
      console.log('⚠️ No ride sessions found');
    }

    // Check Telemetry data
    console.log('\n📡 Telemetry Data:');
    const telemetry = await Telemetry.find({ userId: user._id }).sort({ timestamp: -1 }).limit(10);
    console.log('Total telemetry points:', telemetry.length);
    
    if (telemetry.length > 0) {
      console.log('\nRecent telemetry:');
      telemetry.forEach((data, index) => {
        console.log(`\n${index + 1}. Session: ${data.sessionId}`);
        console.log(`   Timestamp: ${data.timestamp}`);
        console.log(`   Speed: ${data.metrics?.speed || 0} km/h`);
        console.log(`   Distance: ${data.metrics?.distance || 0} km`);
        console.log(`   Cadence: ${data.metrics?.cadence || 0} RPM`);
        console.log(`   Power: ${data.metrics?.watts || 0} W`);
      });
    } else {
      console.log('⚠️ No telemetry data found');
    }

    // Check Cycling Plan
    console.log('\n📅 Cycling Plan:');
    const plan = await CyclingPlan.findOne({ user: user._id, isActive: true });
    
    if (plan) {
      console.log('Plan ID:', plan._id);
      console.log('Goal:', plan.goal);
      console.log('Total Hours:', plan.totalHours);
      console.log('Completed Hours:', plan.completedHours);
      console.log('Completed Days:', plan.completedDays);
      console.log('Active Sessions:', plan.activeSessions?.length || 0);
      
      // Check today's session
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todaySession = plan.dailySessions.find(session => {
        const sessionDate = new Date(session.date);
        sessionDate.setHours(0, 0, 0, 0);
        return sessionDate.getTime() === today.getTime();
      });
      
      if (todaySession) {
        console.log('\nToday\'s Session:');
        console.log('Status:', todaySession.status);
        console.log('Planned Hours:', todaySession.plannedHours);
        console.log('Completed Hours:', todaySession.completedHours);
        console.log('Calories Burned:', todaySession.caloriesBurned);
        console.log('Distance:', todaySession.distance || todaySession.currentDistance);
      } else {
        console.log('\n⚠️ No session scheduled for today');
      }
    } else {
      console.log('⚠️ No active cycling plan found');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkUserData();
