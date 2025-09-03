import cron from 'node-cron';
import { detectAndMarkMissedSessions, realtimeMissedSessionCheck } from './missedSessionDetector.js';
import User from '../models/User.js';
import CyclingPlan from '../models/CyclingPlan.js';
import logger from '../utils/logger.js';

/**
 * Scheduled Tasks Service
 * Handles automatic background tasks for the SikadVoltz app
 */

/**
 * Send missed session notification (placeholder for push notification)
 * @param {string} userId - User ID
 * @param {Object} missedData - Missed session data
 */
async function sendMissedSessionNotification(userId, missedData) {
  try {
    const user = await User.findById(userId);
    if (!user) return;
    
    logger.info(`📱 [NOTIFICATION] User ${user.firstName} (${user.email}) has ${missedData.newMissedCount} missed session(s)`, {
      userId,
      newMissedCount: missedData.newMissedCount,
      totalMissedCount: missedData.totalMissedCount,
      totalMissedHours: missedData.totalMissedHours
    });
    
    // TODO: Implement actual push notification with Firebase
    // For now, just log the notification that would be sent
    const notificationData = {
      title: '🚴‍♂️ Missed Cycling Session',
      body: `Hey ${user.firstName}! You've missed ${missedData.newMissedCount} session(s). Let's get back on track!`,
      data: {
        type: 'missed_session',
        missedCount: missedData.newMissedCount.toString(),
        totalMissed: missedData.totalMissedCount.toString(),
        needsAdjustment: missedData.needsAdjustment
      }
    };
    
    logger.info(`📲 [NOTIFICATION READY]`, notificationData);
    
  } catch (error) {
    logger.error('❌ Error preparing missed session notification:', error);
  }
}

/**
 * Daily missed session detection task
 * Runs every day at 8:00 AM (disabled for testing)
 */
export function startDailyMissedSessionDetection() {
  logger.info('📅 Starting daily missed session detection at 8:00 AM');
  
  // Run every day at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    logger.info('�️ [CRON] Daily missed session detection started');
    
    try {
      const activeUsers = await User.find({});
      let totalProcessed = 0;
      let totalNotified = 0;
      
      for (const user of activeUsers) {
        const activePlan = await CyclingPlan.findOne({ 
          user: user._id, 
          isActive: true 
        });
        
        if (activePlan) {
          const result = await detectAndMarkMissedSessions(user._id);
          totalProcessed++;
          
          if (result.success && result.newMissedCount > 0) {
            await sendMissedSessionNotification(user._id, result);
            totalNotified++;
          }
        }
      }
      
      logger.info(`✅ [CRON] Daily detection complete: ${totalProcessed} users processed, ${totalNotified} notifications sent`);
      
    } catch (error) {
      logger.error('❌ [CRON] Daily missed session detection error:', error);
    }
  });
}

/**
 * Hourly missed session check (more frequent for testing/development)
 * Runs every hour during active hours (6 AM - 10 PM) (disabled for testing)
 */
export function startHourlyMissedSessionCheck() {
  logger.info('⏰ Starting hourly missed session check (6 AM - 10 PM)');
  
  // Run every hour from 6 AM to 10 PM
  cron.schedule('0 6-22 * * *', async () => {
    logger.info('🔍 [CRON] Hourly missed session check started');
    
    try {
      const activeUsers = await User.find({});
      let checksPerformed = 0;
      
      for (const user of activeUsers) {
        const activePlan = await CyclingPlan.findOne({ 
          user: user._id, 
          isActive: true 
        });
        
        if (activePlan) {
          await realtimeMissedSessionCheck(user._id);
          checksPerformed++;
        }
      }
      
      logger.info(`✅ [CRON] Hourly check complete: ${checksPerformed} users checked`);
      
    } catch (error) {
      logger.error('❌ [CRON] Hourly missed session check error:', error);
    }
  });
}

/**
 * Initialize all scheduled tasks
 */
export function initializeScheduledTasks() {
  logger.info('🚀 Initializing scheduled tasks...');
  
  // Start the daily detection
  startDailyMissedSessionDetection();
  
  // Start the hourly check for more frequent monitoring
  startHourlyMissedSessionCheck();
  
  logger.info('✅ All scheduled tasks initialized successfully');
}

/**
 * Manual trigger for testing (can be called via API endpoint)
 */
export async function manualMissedSessionDetection(userId = null) {
  try {
    logger.info('🔍 [MANUAL] Starting manual missed session detection...');
    
    if (userId) {
      // Check specific user
      const result = await detectAndMarkMissedSessions(userId);
      logger.info(`Manual check for user ${userId}:`, result);
      return result;
    } else {
      // Check all users (same as daily cron)
      const activeUsers = await User.find({});
      const results = [];
      
      for (const user of activeUsers) {
        const activePlan = await CyclingPlan.findOne({ 
          user: user._id, 
          isActive: true 
        });
        
        if (activePlan) {
          const result = await detectAndMarkMissedSessions(user._id);
          results.push({
            userId: user._id,
            userEmail: user.email,
            result
          });
        }
      }
      
      logger.info(`Manual detection complete. Processed ${results.length} users`);
      return results;
    }
    
  } catch (error) {
    logger.error('❌ Error in manual missed session detection:', error);
    throw error;
  }
}

export default {
  initializeScheduledTasks,
  startDailyMissedSessionDetection,
  startHourlyMissedSessionCheck,
  manualMissedSessionDetection
};
