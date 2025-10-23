/**
 * Manual Test Script for Push Notifications
 * Run this to test reminders immediately without waiting for scheduled times
 * 
 * Usage:
 *   node scripts/test-reminders.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import ScheduledTasksService from '../services/scheduledTasksService.js';

dotenv.config();

class ReminderTester {
  async connect() {
    try {
      await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      logger.info('✅ Connected to MongoDB');
    } catch (error) {
      logger.error('❌ MongoDB connection failed:', error);
      throw error;
    }
  }

  async testMorningReminders() {
    console.log('\n🌅 ========== TESTING MORNING REMINDERS (10 AM) ==========\n');
    
    try {
      await ScheduledTasksService.sendSessionReminders('morning');
      console.log('\n✅ Morning reminders test completed. Check logs above for results.\n');
    } catch (error) {
      console.error('❌ Morning reminders test failed:', error);
    }
  }

  async testEveningReminders() {
    console.log('\n🌆 ========== TESTING EVENING REMINDERS (7 PM) ==========\n');
    
    try {
      await ScheduledTasksService.sendSessionReminders('evening');
      console.log('\n✅ Evening reminders test completed. Check logs above for results.\n');
    } catch (error) {
      console.error('❌ Evening reminders test failed:', error);
    }
  }

  async testMissedSessions() {
    console.log('\n⚠️ ========== TESTING MISSED SESSION DETECTION ==========\n');
    
    try {
      await ScheduledTasksService.detectAndNotifyMissedSessions();
      console.log('\n✅ Missed session detection test completed. Check logs above for results.\n');
    } catch (error) {
      console.error('❌ Missed session detection test failed:', error);
    }
  }

  async showUserStats() {
    console.log('\n📊 ========== USER STATISTICS ==========\n');
    
    try {
      const User = mongoose.model('User');
      const CyclingPlan = mongoose.model('CyclingPlan');
      
      // Count users with FCM tokens
      const usersWithFCM = await User.countDocuments({ fcmToken: { $exists: true, $ne: null } });
      const activeUsers = await User.countDocuments({ isActive: true });
      const usersWithProfiles = await User.countDocuments({ 'profile.weight': { $exists: true, $gt: 0 } });
      const usersWithRemindersEnabled = await User.countDocuments({ 
        'notificationPreferences.sessionReminders': { $ne: false } 
      });
      
      // Count active plans
      const activePlans = await CyclingPlan.countDocuments({ isActive: true });
      
      // Count today's sessions
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const plansWithTodaySessions = await CyclingPlan.countDocuments({
        isActive: true,
        'dailySessions': {
          $elemMatch: {
            date: today,
            status: { $ne: 'completed' }
          }
        }
      });
      
      console.log('📈 User Statistics:');
      console.log(`   Active Users: ${activeUsers}`);
      console.log(`   Users with Profiles: ${usersWithProfiles}`);
      console.log(`   Users with FCM Tokens: ${usersWithFCM}`);
      console.log(`   Users with Reminders Enabled: ${usersWithRemindersEnabled}`);
      console.log(`\n📅 Plan Statistics:`);
      console.log(`   Active Plans: ${activePlans}`);
      console.log(`   Plans with Today's Pending Sessions: ${plansWithTodaySessions}`);
      console.log(`\n💡 Expected Reminders:`);
      console.log(`   Should send ~${plansWithTodaySessions} reminders (if users have FCM tokens)\n`);
      
    } catch (error) {
      console.error('❌ Failed to get user stats:', error);
    }
  }

  async showScheduledJobsStatus() {
    console.log('\n⏰ ========== SCHEDULED JOBS STATUS ==========\n');
    
    const status = ScheduledTasksService.getStatus();
    
    console.log(`Initialized: ${status.initialized ? '✅ Yes' : '❌ No'}\n`);
    console.log('Cron Jobs:');
    
    Object.entries(status.tasks || {}).forEach(([name, info]) => {
      console.log(`   ${name}: ${info.running ? '✅ Running' : '⏸️ Stopped'} (${info.scheduled ? 'Scheduled' : 'Not Scheduled'})`);
    });
    
    console.log('\n📅 Cron Schedules:');
    console.log('   morningReminder: Every day at 10:00 AM (0 10 * * *)');
    console.log('   eveningReminder: Every day at 7:00 PM (0 19 * * *)');
    console.log('   missedSessions: Every hour (0 * * * *)');
    console.log('   dailySummary: Every day at 8:00 PM (0 20 * * *)');
    console.log('   weeklyProgress: Every Sunday at 6:00 PM (0 18 * * 0)');
    console.log('   cleanup: Every day at 2:00 AM (0 2 * * *)\n');
  }

  async disconnect() {
    await mongoose.disconnect();
    logger.info('✅ Disconnected from MongoDB');
  }

  async runInteractive() {
    console.log('\n🧪 ========== PUSH NOTIFICATION TEST SUITE ==========\n');
    console.log('Options:');
    console.log('   1. Test Morning Reminders (10 AM)');
    console.log('   2. Test Evening Reminders (7 PM)');
    console.log('   3. Test Missed Session Detection');
    console.log('   4. Show User Statistics');
    console.log('   5. Show Scheduled Jobs Status');
    console.log('   6. Run All Tests');
    console.log('   7. Exit\n');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const askQuestion = () => {
      rl.question('Enter option (1-7): ', async (answer) => {
        switch (answer.trim()) {
          case '1':
            await this.testMorningReminders();
            askQuestion();
            break;
          case '2':
            await this.testEveningReminders();
            askQuestion();
            break;
          case '3':
            await this.testMissedSessions();
            askQuestion();
            break;
          case '4':
            await this.showUserStats();
            askQuestion();
            break;
          case '5':
            await this.showScheduledJobsStatus();
            askQuestion();
            break;
          case '6':
            await this.showScheduledJobsStatus();
            await this.showUserStats();
            await this.testMorningReminders();
            await this.testEveningReminders();
            await this.testMissedSessions();
            console.log('\n✅ All tests completed!\n');
            askQuestion();
            break;
          case '7':
            console.log('\n👋 Exiting...\n');
            rl.close();
            await this.disconnect();
            process.exit(0);
          default:
            console.log('❌ Invalid option. Please enter 1-7.');
            askQuestion();
        }
      });
    };
    
    askQuestion();
  }

  async runAll() {
    console.log('\n🧪 ========== RUNNING ALL TESTS ==========\n');
    
    await this.showScheduledJobsStatus();
    await this.showUserStats();
    await this.testMorningReminders();
    await this.testEveningReminders();
    await this.testMissedSessions();
    
    console.log('\n✅ ========== ALL TESTS COMPLETED ==========\n');
  }
}

// Run the tester
const tester = new ReminderTester();

(async () => {
  try {
    await tester.connect();
    
    // Check if running with --all flag
    const args = process.argv.slice(2);
    
    if (args.includes('--all')) {
      await tester.runAll();
      await tester.disconnect();
      process.exit(0);
    } else if (args.includes('--morning')) {
      await tester.testMorningReminders();
      await tester.disconnect();
      process.exit(0);
    } else if (args.includes('--evening')) {
      await tester.testEveningReminders();
      await tester.disconnect();
      process.exit(0);
    } else if (args.includes('--missed')) {
      await tester.testMissedSessions();
      await tester.disconnect();
      process.exit(0);
    } else if (args.includes('--stats')) {
      await tester.showUserStats();
      await tester.showScheduledJobsStatus();
      await tester.disconnect();
      process.exit(0);
    } else {
      // Interactive mode
      await tester.runInteractive();
    }
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
})();

/**
 * Usage Examples:
 * 
 * Interactive mode:
 *   node scripts/test-reminders.js
 * 
 * Run all tests:
 *   node scripts/test-reminders.js --all
 * 
 * Test morning reminders only:
 *   node scripts/test-reminders.js --morning
 * 
 * Test evening reminders only:
 *   node scripts/test-reminders.js --evening
 * 
 * Test missed session detection:
 *   node scripts/test-reminders.js --missed
 * 
 * Show statistics:
 *   node scripts/test-reminders.js --stats
 */
