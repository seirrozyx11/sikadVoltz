import cron from 'node-cron';
import logger from '../utils/logger.js';
import NotificationService from './notificationService.js';
import mongoose from 'mongoose';
// Import models to ensure they are registered
import '../models/CyclingPlan.js';
import '../models/User.js';

/**
 * Scheduled Tasks Service
 * Handles automated background tasks like missed session detection
 */
class ScheduledTasksService {
  static isInitialized = false;
  static cronJobs = new Map();

  /**
   * Initialize all scheduled tasks
   */
  static async initialize() {
    if (this.isInitialized) {
      logger.warn(' Scheduled tasks already initialized');
      return;
    }

    logger.info('🕐 Initializing scheduled tasks for real-time notifications...');

    try {
      // **ENHANCED**: Check for missed sessions every hour
      const missedSessionsJob = cron.schedule('0 * * * *', async () => {
        logger.info(' Running hourly missed session check...');
        await this.detectAndNotifyMissedSessions();
      }, {
        scheduled: false,
        timezone: 'Asia/Manila' // Adjust to your timezone
      });

      // **NEW**: Morning reminder at 10 AM (for today's sessions)
      const morningReminderJob = cron.schedule('0 10 * * *', async () => {
        logger.info('🔔 Running 10 AM session reminder...');
        await this.sendSessionReminders('morning');
      }, {
        scheduled: false,
        timezone: 'Asia/Manila'
      });

      // **NEW**: Evening reminder at 7 PM (for today's sessions)
      const eveningReminderJob = cron.schedule('0 19 * * *', async () => {
        logger.info('🔔 Running 7 PM (19:00) session reminder...');
        await this.sendSessionReminders('evening');
      }, {
        scheduled: false,
        timezone: 'Asia/Manila'
      });

      // **NEW**: Daily summary notifications at 8 PM
      const dailySummaryJob = cron.schedule('0 20 * * *', async () => {
        logger.info(' Running daily summary notifications...');
        await this.sendDailySummaryNotifications();
      }, {
        scheduled: false,
        timezone: 'Asia/Manila'
      });

      // **NEW**: Weekly progress notifications every Sunday at 6 PM
      const weeklyProgressJob = cron.schedule('0 18 * * 0', async () => {
        logger.info('Running weekly progress notifications...');
        await this.sendWeeklyProgressNotifications();
      }, {
        scheduled: false,
        timezone: 'Asia/Manila'
      });

      // **NEW**: Cleanup expired notifications daily at 2 AM
      const cleanupJob = cron.schedule('0 2 * * *', async () => {
        logger.info(' Running notification cleanup...');
        await this.cleanupExpiredNotifications();
      }, {
        scheduled: false,
        timezone: 'Asia/Manila'
      });

      // Store jobs for management
      this.cronJobs.set('missedSessions', missedSessionsJob);
      this.cronJobs.set('morningReminder', morningReminderJob);
      this.cronJobs.set('eveningReminder', eveningReminderJob);
      this.cronJobs.set('dailySummary', dailySummaryJob);
      this.cronJobs.set('weeklyProgress', weeklyProgressJob);
      this.cronJobs.set('cleanup', cleanupJob);

      // Start all jobs
      this.cronJobs.forEach((job, name) => {
        job.start();
        logger.info(`Started scheduled task: ${name}`);
      });

      this.isInitialized = true;
      logger.info('All scheduled tasks initialized successfully');
    } catch (error) {
      logger.error(' Error initializing scheduled tasks:', error);
      throw error;
    }
  }

  /**
   * Detect and notify missed sessions
   */
  static async detectAndNotifyMissedSessions() {
    try {
      const User = mongoose.model('User');
      const CyclingPlan = mongoose.model('CyclingPlan');
      
      // Get all active users with cycling plans
      const activeUsers = await User.find({ 
        isActive: true,
        'profile.weight': { $exists: true, $gt: 0 } // Only users with complete profiles
      }).populate('currentPlan');

      let totalNotificationsSent = 0;

      for (const user of activeUsers) {
        if (!user.currentPlan) continue;

        const plan = await CyclingPlan.findById(user.currentPlan._id);
        if (!plan || plan.status === 'completed') continue;

        // **ENHANCED**: Check if user missed yesterday's session
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        const endOfYesterday = new Date(yesterday);
        endOfYesterday.setHours(23, 59, 59, 999);

        // Check if user had any session yesterday in the daily sessions
        const yesterdaySession = plan.dailySessions.find(session => {
          const sessionDate = new Date(session.date);
          sessionDate.setHours(0, 0, 0, 0);
          return sessionDate.getTime() === yesterday.getTime() && 
                 (session.completedHours > 0 || session.status === 'completed');
        });

        // **CRITICAL FIX**: Use TOTAL missed count from plan, not just consecutive days
        // This ensures we detect 7+ total missed sessions even if not consecutive
        const totalMissedCount = plan.missedCount || 0;
        const consecutiveMissedDays = await this.calculateConsecutiveMissedDays(user._id, plan._id);

        if (!yesterdaySession) {
          // Create missed session notification with BOTH counts
          const notification = await NotificationService.createMissedSessionNotification(
            user._id,
            {
              count: totalMissedCount > 0 ? totalMissedCount : consecutiveMissedDays,
              sessions: [{ date: yesterday }],
              planAdjusted: totalMissedCount > 3,
              consecutiveMissedDays: consecutiveMissedDays,
              totalMissedCount: totalMissedCount, // ← CRITICAL: Pass total missed count
              suggestedAction: 'start_session'
            }
          );

          totalNotificationsSent++;
          logger.info(`✅ Sent missed session notification to user ${user._id} - Total: ${totalMissedCount}, Consecutive: ${consecutiveMissedDays}`);
        }
      }

      logger.info(`Missed session check completed. Sent ${totalNotificationsSent} notifications.`);
    } catch (error) {
      logger.error(' Error in missed session detection:', error);
    }
  }

  /**
   * Calculate consecutive missed days for a user
   * @param {string} userId - User ID
   * @param {string} planId - Plan ID
   * @returns {Promise<number>} Number of consecutive missed days
   */
  static async calculateConsecutiveMissedDays(userId, planId) {
    try {
      const CyclingPlan = mongoose.model('CyclingPlan');
      
      const plan = await CyclingPlan.findById(planId);
      if (!plan) return 0;
      
      let missedDays = 0;
      const today = new Date();
      
      // Check last 30 days for consecutive missed sessions
      for (let i = 1; i <= 30; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        checkDate.setHours(0, 0, 0, 0);
        
        // Find session for this date in the plan's dailySessions
        const daySession = plan.dailySessions.find(session => {
          const sessionDate = new Date(session.date);
          sessionDate.setHours(0, 0, 0, 0);
          return sessionDate.getTime() === checkDate.getTime();
        });
        
        // Check if session was missed (exists but not completed)
        if (!daySession || (daySession.completedHours === 0 && daySession.status !== 'completed')) {
          missedDays++;
        } else {
          break; // Stop counting when we find a completed session
        }
      }
      
      return missedDays;
    } catch (error) {
      logger.error('Error calculating consecutive missed days:', error);
      return 0;
    }
  }

  /**
   * Send session reminders for today's planned sessions
   * @param {string} timeOfDay - 'morning' or 'evening'
   */
  static async sendSessionReminders(timeOfDay = 'morning') {
    try {
      const User = mongoose.model('User');
      const CyclingPlan = mongoose.model('CyclingPlan');
      const fcmService = (await import('./fcmService.js')).default;
      
      // Get all active users with cycling plans
      const activeUsers = await User.find({ 
        isActive: true,
        'profile.weight': { $exists: true, $gt: 0 }, // Only users with complete profiles
        'notificationPreferences.sessionReminders': { $ne: false } // Check preferences
      }).select('_id email fcmToken notificationPreferences');

      let remindersSet = 0;

      for (const user of activeUsers) {
        // Get user's active cycling plan
        const plan = await CyclingPlan.findOne({
          userId: user._id,
          isActive: true,
          status: { $ne: 'completed' }
        });

        if (!plan) continue;

        // Check if user has a session scheduled for TODAY
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todaySession = plan.dailySessions.find(session => {
          const sessionDate = new Date(session.date);
          sessionDate.setHours(0, 0, 0, 0);
          return sessionDate.getTime() === today.getTime();
        });

        // Send reminder ONLY if:
        // 1. User has a session today
        // 2. Session is NOT completed yet
        // 3. Session is NOT missed
        if (todaySession && todaySession.status !== 'completed' && todaySession.status !== 'missed') {
          const plannedHours = todaySession.plannedHours || plan.planSummary.dailyCyclingHours;
          
          // Send FCM push notification
          if (user.fcmToken) {
            await fcmService.sendSessionReminderNotification(user._id, {
              sessionTime: timeOfDay === 'morning' ? 'today' : 'this evening',
              sessionType: 'cycling',
              plannedHours: plannedHours
            });
          }

          // Also create in-app notification
          await NotificationService.createMilestoneNotification(
            user._id,
            {
              type: 'session_reminder',
              title: timeOfDay === 'morning' 
                ? '🌅 Good Morning! Session Reminder' 
                : '🌆 Evening Reminder!',
              message: `You have a ${plannedHours}h cycling session scheduled for today. Let's crush it!`,
              plannedHours,
              timeOfDay,
              sessionDate: today
            }
          );

          remindersSet++;
          logger.info(`📨 Sent ${timeOfDay} reminder to user ${user._id} - ${plannedHours}h session`);
        }
      }

      logger.info(`✅ ${timeOfDay === 'morning' ? '10 AM' : '7 PM'} reminders completed. Sent ${remindersSet} notifications.`);
    } catch (error) {
      logger.error(` Error sending ${timeOfDay} session reminders:`, error);
    }
  }

  /**
   * Send daily summary notifications
   */
  static async sendDailySummaryNotifications() {
    try {
      const User = mongoose.model('User');
      const SessionProgress = mongoose.model('SessionProgress');
      
      // Get users who had activity today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);

      const todaysSessions = await SessionProgress.find({
        createdAt: {
          $gte: today,
          $lte: endOfToday
        },
        completedHours: { $gt: 0 }
      }).populate('userId');

      const sessionsByUser = new Map();
      todaysSessions.forEach(session => {
        const userId = session.userId._id.toString();
        if (!sessionsByUser.has(userId)) {
          sessionsByUser.set(userId, []);
        }
        sessionsByUser.get(userId).push(session);
      });

      let summariesSent = 0;

      for (const [userId, sessions] of sessionsByUser) {
        const totalHours = sessions.reduce((sum, session) => sum + session.completedHours, 0);
        const totalCalories = sessions.reduce((sum, session) => sum + (session.caloriesBurned || 0), 0);

        // Create daily summary notification
        const notification = await NotificationService.createMilestoneNotification(
          userId,
          {
            type: 'daily_summary',
            sessionsCompleted: sessions.length,
            totalHours: Math.round(totalHours * 100) / 100,
            totalCalories: Math.round(totalCalories),
            date: today
          }
        );

        summariesSent++;
      }

      logger.info(`Daily summary notifications sent to ${summariesSent} users`);
    } catch (error) {
      logger.error(' Error sending daily summary notifications:', error);
    }
  }

  /**
   * Send weekly progress notifications
   */
  static async sendWeeklyProgressNotifications() {
    try {
      const User = mongoose.model('User');
      const SessionProgress = mongoose.model('SessionProgress');
      
      // Get last 7 days of activity
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);

      const thisWeekSessions = await SessionProgress.find({
        createdAt: { $gte: weekAgo },
        completedHours: { $gt: 0 }
      }).populate('userId');

      const sessionsByUser = new Map();
      thisWeekSessions.forEach(session => {
        const userId = session.userId._id.toString();
        if (!sessionsByUser.has(userId)) {
          sessionsByUser.set(userId, []);
        }
        sessionsByUser.get(userId).push(session);
      });

      let progressNotificationsSent = 0;

      for (const [userId, sessions] of sessionsByUser) {
        const totalHours = sessions.reduce((sum, session) => sum + session.completedHours, 0);
        const totalCalories = sessions.reduce((sum, session) => sum + (session.caloriesBurned || 0), 0);
        const daysActive = new Set(sessions.map(s => s.createdAt.toDateString())).size;

        // Create weekly progress notification
        const notification = await NotificationService.createMilestoneNotification(
          userId,
          {
            type: 'weekly_progress',
            sessionsCompleted: sessions.length,
            totalHours: Math.round(totalHours * 100) / 100,
            totalCalories: Math.round(totalCalories),
            daysActive,
            weekStartDate: weekAgo
          }
        );

        progressNotificationsSent++;
      }

      logger.info(`Weekly progress notifications sent to ${progressNotificationsSent} users`);
    } catch (error) {
      logger.error(' Error sending weekly progress notifications:', error);
    }
  }

  /**
   * Cleanup expired notifications
   */
  static async cleanupExpiredNotifications() {
    try {
      const Notification = mongoose.model('Notification');
      
      const result = await Notification.deleteMany({
        expiresAt: { $lte: new Date() }
      });

      logger.info(` Cleaned up ${result.deletedCount} expired notifications`);
      return result;
    } catch (error) {
      logger.error(' Error cleaning up expired notifications:', error);
    }
  }

  /**
   * Stop all scheduled tasks
   */
  static stop() {
    this.cronJobs.forEach((job, name) => {
      job.stop();
      logger.info(`🛑 Stopped scheduled task: ${name}`);
    });
    this.cronJobs.clear();
    this.isInitialized = false;
    logger.info('🛑 All scheduled tasks stopped');
  }

  /**
   * Get status of all scheduled tasks
   */
  static getStatus() {
    const status = {};
    this.cronJobs.forEach((job, name) => {
      status[name] = {
        running: job.running,
        scheduled: job.scheduled
      };
    });
    return {
      initialized: this.isInitialized,
      tasks: status
    };
  }

  /**
   * Restart a specific task
   * @param {string} taskName - Name of the task to restart
   */
  static restartTask(taskName) {
    const job = this.cronJobs.get(taskName);
    if (job) {
      job.stop();
      job.start();
      logger.info(`Restarted scheduled task: ${taskName}`);
      return true;
    }
    return false;
  }
}

export default ScheduledTasksService;