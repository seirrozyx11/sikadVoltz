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
 * Runs every day at 8:00 AM
 */
export function startDailyMissedSessionDetection() {
  // Run every day at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    try {
      logger.info('🔍 [CRON] Starting daily missed session detection...');
      const startTime = Date.now();
      
      // Get all users with active cycling plans
      const activeUsers = await User.find({}).populate('activePlan');
      const usersWithActivePlans = [];
      
      // Find users who have active cycling plans
      for (const user of activeUsers) {
        const activePlan = await CyclingPlan.findOne({ 
          user: user._id, 
          isActive: true 
        });
        
        if (activePlan) {
          usersWithActivePlans.push({
            userId: user._id,
            userInfo: {
              firstName: user.firstName,
              email: user.email
            }
          });
        }
      }
      
      logger.info(`👥 Found ${usersWithActivePlans.length} users with active cycling plans`);
      
      let totalNotificationsSent = 0;
      let totalMissedSessions = 0;
      
      // Process each user
      for (const { userId, userInfo } of usersWithActivePlans) {
        try {
          const result = await detectAndMarkMissedSessions(userId);
          
          if (result.success && result.newMissedCount > 0) {
            logger.info(`🔔 User ${userInfo.firstName} (${userInfo.email}) - ${result.newMissedCount} new missed session(s)`);
            
            // Send notification for missed sessions
            await sendMissedSessionNotification(userId, result);
            
            totalNotificationsSent++;
            totalMissedSessions += result.newMissedCount;
          } else if (result.success) {
            logger.info(`✅ User ${userInfo.firstName} - No new missed sessions`);
          } else {
            logger.warn(`⚠️ User ${userInfo.firstName} - Detection failed: ${result.error}`);
          }
          
        } catch (userError) {
          logger.error(`❌ Error processing user ${userId}:`, userError);
        }
      }
      
      const duration = Date.now() - startTime;
      logger.info(`✅ [CRON COMPLETE] Daily missed session detection finished`, {
        duration: `${duration}ms`,
        usersProcessed: usersWithActivePlans.length,
        notificationsSent: totalNotificationsSent,
        totalMissedSessions
      });
      
    } catch (error) {
      logger.error('❌ [CRON ERROR] Error in scheduled missed session detection:', error);
    }
  });
  
  logger.info('📅 Daily missed session detection cron job started (runs at 8:00 AM daily)');
}

/**
 * Hourly missed session check (more frequent for testing/development)
 * Runs every hour during active hours (6 AM - 10 PM)
 */
export function startHourlyMissedSessionCheck() {
  // Run every hour from 6 AM to 10 PM
  cron.schedule('0 6-22 * * *', async () => {
    try {
      logger.info('🔍 [HOURLY] Starting hourly missed session check...');
      
      // Get users with active plans that have sessions today
      const today = new Date().toISOString().split('T')[0];
      
      const activePlans = await CyclingPlan.find({ 
        isActive: true,
        'dailySessions.date': {
          $gte: new Date(today),
          $lt: new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000)
        }
      }).populate('user');
      
      logger.info(`👥 Found ${activePlans.length} active plans with today's sessions`);
      
      for (const plan of activePlans) {
        try {
          const result = await realtimeMissedSessionCheck(plan.user._id);
          
          if (result.success && result.alerts && result.alerts.length > 0) {
            const alertTypes = result.alerts.map(a => a.type).join(', ');
            logger.info(`🔔 [HOURLY] User ${plan.user.firstName} has alerts: ${alertTypes}`);
            
            // For new missed sessions, send notification
            const missedAlert = result.alerts.find(a => a.type === 'missed_detected');
            if (missedAlert) {
              await sendMissedSessionNotification(plan.user._id, {
                newMissedCount: result.stats.missedSessions,
                totalMissedCount: result.stats.missedSessions,
                needsAdjustment: result.alerts.some(a => a.type === 'adjustment_needed')
              });
            }
          }
          
        } catch (userError) {
          logger.error(`❌ [HOURLY] Error checking user ${plan.user._id}:`, userError);
        }
      }
      
    } catch (error) {
      logger.error('❌ [HOURLY ERROR] Error in hourly missed session check:', error);
    }
  });
  
  logger.info('⏰ Hourly missed session check started (runs 6 AM - 10 PM)');
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
