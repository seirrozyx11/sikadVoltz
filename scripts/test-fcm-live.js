#!/usr/bin/env node

/**
 * FCM Push Notification Live Testing Script
 * 
 * This script helps you test real push notifications with logged-in users.
 * It provides a menu-driven interface to test different notification types.
 */

import axios from 'axios';
import readline from 'readline';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

console.log('🚀 SikadVoltz FCM Push Notification Live Testing');
console.log('================================================');
console.log(`📡 Backend URL: ${BASE_URL}`);
console.log('');

class FCMTester {
  constructor() {
    this.users = [];
  }

  async fetchUsersWithTokens() {
    try {
      console.log('📱 Fetching users with FCM tokens...');
      const response = await axios.get(`${API_BASE}/test/fcm/users`);
      
      if (response.data.success) {
        this.users = response.data.users;
        console.log(`✅ Found ${this.users.length} users with FCM tokens`);
        
        if (this.users.length > 0) {
          console.log('\n👥 Available Users:');
          this.users.forEach((user, index) => {
            console.log(`${index + 1}. ${user.email} (${user.platform || 'unknown'}) - Token: ${user.tokenPrefix}`);
          });
        } else {
          console.log('⚠️ No users found with FCM tokens.');
          console.log('📝 Make sure users have:');
          console.log('   1. Logged in on their mobile device');
          console.log('   2. Accepted notification permissions');
          console.log('   3. The enhanced FCM service is running');
        }
        return true;
      } else {
        console.log('❌ Failed to fetch users:', response.data.message);
        return false;
      }
    } catch (error) {
      console.log('❌ Error fetching users:', error.message);
      return false;
    }
  }

  async sendTestNotification() {
    if (this.users.length === 0) {
      console.log('❌ No users available for testing');
      return;
    }

    console.log('\n🧪 Send Test Notification');
    console.log('========================');
    
    const userIndex = await this.promptUser(`Select user (1-${this.users.length}): `);
    const selectedUser = this.users[parseInt(userIndex) - 1];
    
    if (!selectedUser) {
      console.log('❌ Invalid user selection');
      return;
    }

    const title = await this.promptUser('Enter notification title (or press Enter for default): ');
    const body = await this.promptUser('Enter notification body (or press Enter for default): ');

    try {
      console.log(`📨 Sending test notification to ${selectedUser.email}...`);
      
      const response = await axios.post(`${API_BASE}/test/fcm/user/${selectedUser.id}`, {
        title: title || undefined,
        body: body || undefined,
        type: 'test',
        route: '/notifications'
      });

      if (response.data.success) {
        console.log('✅ Notification sent successfully!');
        console.log(`📱 Check ${selectedUser.email}'s mobile device`);
        console.log(`🔗 Token: ${response.data.tokenPrefix}`);
        console.log(`📋 Platform: ${response.data.platform}`);
      } else {
        console.log('❌ Failed to send notification:', response.data.message);
      }
    } catch (error) {
      console.log('❌ Error sending notification:', error.message);
      if (error.response?.data) {
        console.log('📄 Server response:', error.response.data);
      }
    }
  }

  async sendMissedSessionNotification() {
    if (this.users.length === 0) {
      console.log('❌ No users available for testing');
      return;
    }

    console.log('\n🚴‍♂️ Send Missed Session Notification');
    console.log('====================================');
    
    const userIndex = await this.promptUser(`Select user (1-${this.users.length}): `);
    const selectedUser = this.users[parseInt(userIndex) - 1];
    
    if (!selectedUser) {
      console.log('❌ Invalid user selection');
      return;
    }

    const count = await this.promptUser('Enter number of missed sessions (1-10): ');

    try {
      console.log(`📨 Sending missed session notification to ${selectedUser.email}...`);
      
      const response = await axios.post(`${API_BASE}/test/fcm/missed-session/${selectedUser.id}`, {
        count: parseInt(count) || 1
      });

      if (response.data.success) {
        console.log('✅ Missed session notification sent successfully!');
        console.log(`📱 Check ${selectedUser.email}'s mobile device`);
        console.log(`📊 Missed sessions: ${response.data.missedCount}`);
      } else {
        console.log('❌ Failed to send notification:', response.data.message);
      }
    } catch (error) {
      console.log('❌ Error sending notification:', error.message);
      if (error.response?.data) {
        console.log('📄 Server response:', error.response.data);
      }
    }
  }

  async sendSessionReminderNotification() {
    if (this.users.length === 0) {
      console.log('❌ No users available for testing');
      return;
    }

    console.log('\n⏰ Send Session Reminder Notification');
    console.log('====================================');
    
    const userIndex = await this.promptUser(`Select user (1-${this.users.length}): `);
    const selectedUser = this.users[parseInt(userIndex) - 1];
    
    if (!selectedUser) {
      console.log('❌ Invalid user selection');
      return;
    }

    const hours = await this.promptUser('Enter planned session hours (e.g., 1.5): ');
    const type = await this.promptUser('Enter session type (cycling/strength/cardio): ');

    try {
      console.log(`📨 Sending session reminder to ${selectedUser.email}...`);
      
      const response = await axios.post(`${API_BASE}/test/fcm/session-reminder/${selectedUser.id}`, {
        plannedHours: parseFloat(hours) || 1,
        sessionType: type || 'cycling'
      });

      if (response.data.success) {
        console.log('✅ Session reminder sent successfully!');
        console.log(`📱 Check ${selectedUser.email}'s mobile device`);
        console.log(`📋 Session: ${response.data.sessionDetails.plannedHours}h ${response.data.sessionDetails.sessionType}`);
      } else {
        console.log('❌ Failed to send notification:', response.data.message);
      }
    } catch (error) {
      console.log('❌ Error sending notification:', error.message);
      if (error.response?.data) {
        console.log('📄 Server response:', error.response.data);
      }
    }
  }

  async sendMotivationNotification() {
    if (this.users.length === 0) {
      console.log('❌ No users available for testing');
      return;
    }

    console.log('\n💪 Send Daily Motivation Notification');
    console.log('====================================');
    
    const userIndex = await this.promptUser(`Select user (1-${this.users.length}): `);
    const selectedUser = this.users[parseInt(userIndex) - 1];
    
    if (!selectedUser) {
      console.log('❌ Invalid user selection');
      return;
    }

    const streak = await this.promptUser('Enter streak days (e.g., 5): ');
    const sessions = await this.promptUser('Enter completed sessions (e.g., 10): ');
    const hours = await this.promptUser('Enter total hours (e.g., 15.5): ');

    try {
      console.log(`📨 Sending motivation notification to ${selectedUser.email}...`);
      
      const response = await axios.post(`${API_BASE}/test/fcm/motivation/${selectedUser.id}`, {
        streakDays: parseInt(streak) || 5,
        completedSessions: parseInt(sessions) || 10,
        totalHours: parseFloat(hours) || 15.5
      });

      if (response.data.success) {
        console.log('✅ Motivation notification sent successfully!');
        console.log(`📱 Check ${selectedUser.email}'s mobile device`);
        console.log(`📊 Stats: ${response.data.stats.streakDays} day streak, ${response.data.stats.completedSessions} sessions, ${response.data.stats.totalHours}h total`);
      } else {
        console.log('❌ Failed to send notification:', response.data.message);
      }
    } catch (error) {
      console.log('❌ Error sending notification:', error.message);
      if (error.response?.data) {
        console.log('📄 Server response:', error.response.data);
      }
    }
  }

  async sendBroadcastNotification() {
    if (this.users.length === 0) {
      console.log('❌ No users available for testing');
      return;
    }

    console.log('\n📢 Send Broadcast Notification');
    console.log('==============================');
    
    const limit = await this.promptUser(`Enter max users to notify (1-${this.users.length}): `);
    const title = await this.promptUser('Enter broadcast title (or press Enter for default): ');
    const body = await this.promptUser('Enter broadcast body (or press Enter for default): ');

    try {
      console.log(`📨 Sending broadcast notification to up to ${limit} users...`);
      
      const response = await axios.post(`${API_BASE}/test/fcm/all-users`, {
        title: title || undefined,
        body: body || undefined,
        type: 'broadcast',
        route: '/notifications',
        limit: parseInt(limit) || this.users.length
      });

      if (response.data.success) {
        console.log('✅ Broadcast notification sent successfully!');
        console.log(`📊 Results: ${response.data.results.successful} successful, ${response.data.results.failed} failed`);
        console.log(`📱 Users notified: ${response.data.userEmails.join(', ')}`);
        
        if (response.data.results.errors.length > 0) {
          console.log('⚠️ Some errors occurred:');
          response.data.results.errors.forEach(error => {
            console.log(`   - ${error.userId}: ${error.error}`);
          });
        }
      } else {
        console.log('❌ Failed to send broadcast:', response.data.message);
      }
    } catch (error) {
      console.log('❌ Error sending broadcast:', error.message);
      if (error.response?.data) {
        console.log('📄 Server response:', error.response.data);
      }
    }
  }

  async showMenu() {
    console.log('\n📋 FCM Testing Menu');
    console.log('==================');
    console.log('1. 🔄 Refresh user list');
    console.log('2. 🧪 Send test notification');
    console.log('3. 🚴‍♂️ Send missed session notification');
    console.log('4. ⏰ Send session reminder');
    console.log('5. 💪 Send daily motivation');
    console.log('6. 📢 Send broadcast notification');
    console.log('7. 👥 Show current users');
    console.log('0. ❌ Exit');
    console.log('');
  }

  async promptUser(question) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async run() {
    console.log('🔄 Initializing FCM tester...\n');
    
    // Initial user fetch
    await this.fetchUsersWithTokens();

    while (true) {
      await this.showMenu();
      const choice = await this.promptUser('Select option: ');

      switch (choice) {
        case '1':
          await this.fetchUsersWithTokens();
          break;
        case '2':
          await this.sendTestNotification();
          break;
        case '3':
          await this.sendMissedSessionNotification();
          break;
        case '4':
          await this.sendSessionReminderNotification();
          break;
        case '5':
          await this.sendMotivationNotification();
          break;
        case '6':
          await this.sendBroadcastNotification();
          break;
        case '7':
          if (this.users.length > 0) {
            console.log('\n👥 Current Users with FCM Tokens:');
            this.users.forEach((user, index) => {
              console.log(`${index + 1}. ${user.email} (${user.platform || 'unknown'})`);
              console.log(`   Token: ${user.tokenPrefix}`);
              console.log(`   Updated: ${user.tokenUpdated || 'Unknown'}`);
            });
          } else {
            console.log('❌ No users found');
          }
          break;
        case '0':
          console.log('👋 Goodbye!');
          rl.close();
          return;
        default:
          console.log('❌ Invalid option. Please try again.');
      }
    }
  }
}

// Start the tester
const tester = new FCMTester();
tester.run().catch(console.error);