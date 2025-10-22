const express = require('express');
const router = express.Router();
const UserTutorial = require('../models/UserTutorial');

// 1️⃣ GET /api/user/tutorials/status - Check if tutorial completed
router.get('/status', async (req, res) => {
  try {
    const { email, tutorialKey } = req.query;
    
    if (!email || !tutorialKey) {
      return res.status(400).json({ 
        error: 'Email and tutorialKey are required',
        success: false
      });
    }
    
    const userTutorial = await UserTutorial.findOne({ email });
    
    if (!userTutorial) {
      return res.json({ 
        completed: false,
        skipped: false,
        success: true
      });
    }
    
    const tutorial = userTutorial.tutorials.find(
      t => t.tutorialKey === tutorialKey
    );
    
    res.json({ 
      completed: tutorial?.completed ?? false,
      skipped: tutorial?.skipped ?? false,
      completedAt: tutorial?.completedAt,
      deviceInfo: tutorial?.deviceInfo,
      success: true
    });
    
  } catch (error) {
    console.error('Error checking tutorial status:', error);
    res.status(500).json({ 
      error: 'Server error',
      success: false,
      message: error.message
    });
  }
});

// 2️⃣ POST /api/user/tutorials/complete - Mark tutorial as completed
router.post('/complete', async (req, res) => {
  try {
    const { email, tutorialKey, completedAt, deviceInfo } = req.body;
    
    if (!email || !tutorialKey) {
      return res.status(400).json({ 
        error: 'Email and tutorialKey are required',
        success: false
      });
    }
    
    let userTutorial = await UserTutorial.findOne({ email });
    
    if (!userTutorial) {
      // Create new user tutorial record
      userTutorial = new UserTutorial({
        email,
        tutorials: [{
          tutorialKey,
          completed: true,
          completedAt: completedAt ? new Date(completedAt) : new Date(),
          skipped: false,
          deviceInfo: deviceInfo || {},
        }],
      });
    } else {
      // Update existing tutorial or add new one
      userTutorial.markCompleted(tutorialKey, deviceInfo || {});
    }
    
    await userTutorial.save();
    
    res.json({ 
      success: true, 
      message: 'Tutorial marked as completed',
      email,
      tutorialKey,
      completedAt: userTutorial.tutorials.find(t => t.tutorialKey === tutorialKey)?.completedAt
    });
    
  } catch (error) {
    console.error('Error marking tutorial as completed:', error);
    res.status(500).json({ 
      error: 'Server error',
      success: false,
      message: error.message
    });
  }
});

// 3️⃣ POST /api/user/tutorials/skip - Mark tutorial as skipped
router.post('/skip', async (req, res) => {
  try {
    const { email, tutorialKey, deviceInfo } = req.body;
    
    if (!email || !tutorialKey) {
      return res.status(400).json({ 
        error: 'Email and tutorialKey are required',
        success: false
      });
    }
    
    let userTutorial = await UserTutorial.findOne({ email });
    
    if (!userTutorial) {
      userTutorial = new UserTutorial({
        email,
        tutorials: [{
          tutorialKey,
          completed: false,
          skipped: true,
          completedAt: new Date(),
          deviceInfo: deviceInfo || {},
        }],
      });
    } else {
      userTutorial.markSkipped(tutorialKey, deviceInfo || {});
    }
    
    await userTutorial.save();
    
    res.json({ 
      success: true, 
      message: 'Tutorial marked as skipped',
      email,
      tutorialKey
    });
    
  } catch (error) {
    console.error('Error marking tutorial as skipped:', error);
    res.status(500).json({ 
      error: 'Server error',
      success: false,
      message: error.message
    });
  }
});

// 4️⃣ GET /api/user/tutorials/completed - Get all completed tutorials
router.get('/completed', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ 
        error: 'Email is required',
        success: false
      });
    }
    
    const userTutorial = await UserTutorial.findOne({ email });
    
    if (!userTutorial) {
      return res.json({ 
        tutorials: [],
        success: true
      });
    }
    
    const completedTutorials = userTutorial.tutorials
      .filter(t => t.completed)
      .map(t => ({
        tutorialKey: t.tutorialKey,
        completedAt: t.completedAt,
        deviceInfo: t.deviceInfo
      }));
    
    const skippedTutorials = userTutorial.tutorials
      .filter(t => t.skipped && !t.completed)
      .map(t => ({
        tutorialKey: t.tutorialKey,
        skippedAt: t.completedAt,
        deviceInfo: t.deviceInfo
      }));
    
    res.json({ 
      completedTutorials,
      skippedTutorials,
      autoPlayTutorials: userTutorial.autoPlayTutorials,
      skipOnLogin: userTutorial.skipOnLogin,
      success: true
    });
    
  } catch (error) {
    console.error('Error fetching completed tutorials:', error);
    res.status(500).json({ 
      error: 'Server error',
      success: false,
      message: error.message
    });
  }
});

// 5️⃣ DELETE /api/user/tutorials/reset - Reset all tutorials (testing/admin)
router.delete('/reset', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ 
        error: 'Email is required',
        success: false
      });
    }
    
    const result = await UserTutorial.findOneAndDelete({ email });
    
    if (!result) {
      return res.status(404).json({
        error: 'No tutorial data found for this email',
        success: false
      });
    }
    
    res.json({ 
      success: true, 
      message: 'All tutorials reset successfully',
      email,
      deletedCount: result.tutorials.length
    });
    
  } catch (error) {
    console.error('Error resetting tutorials:', error);
    res.status(500).json({ 
      error: 'Server error',
      success: false,
      message: error.message
    });
  }
});

// 6️⃣ GET /api/user/tutorials/analytics - Get tutorial analytics (admin only)
router.get('/analytics', async (req, res) => {
  try {
    const analytics = await UserTutorial.aggregate([
      { $unwind: '$tutorials' },
      {
        $group: {
          _id: '$tutorials.tutorialKey',
          totalUsers: { $sum: 1 },
          completedCount: {
            $sum: { $cond: ['$tutorials.completed', 1, 0] }
          },
          skippedCount: {
            $sum: { $cond: ['$tutorials.skipped', 1, 0] }
          },
          avgCompletionTime: {
            $avg: { $subtract: ['$tutorials.completedAt', '$createdAt'] }
          }
        }
      },
      {
        $project: {
          tutorialKey: '$_id',
          totalUsers: 1,
          completedCount: 1,
          skippedCount: 1,
          completionRate: {
            $multiply: [
              { $divide: ['$completedCount', '$totalUsers'] },
              100
            ]
          },
          skipRate: {
            $multiply: [
              { $divide: ['$skippedCount', '$totalUsers'] },
              100
            ]
          },
          avgCompletionTime: {
            $divide: ['$avgCompletionTime', 1000] // Convert to seconds
          }
        }
      },
      { $sort: { completionRate: -1 } }
    ]);
    
    // Get total users with tutorial data
    const totalUsers = await UserTutorial.countDocuments();
    
    res.json({ 
      analytics,
      totalUsers,
      success: true
    });
    
  } catch (error) {
    console.error('Error fetching tutorial analytics:', error);
    res.status(500).json({ 
      error: 'Server error',
      success: false,
      message: error.message
    });
  }
});

// 7️⃣ PUT /api/user/tutorials/settings - Update tutorial settings
router.put('/settings', async (req, res) => {
  try {
    const { email, autoPlayTutorials, skipOnLogin } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        error: 'Email is required',
        success: false
      });
    }
    
    let userTutorial = await UserTutorial.findOne({ email });
    
    if (!userTutorial) {
      userTutorial = new UserTutorial({ 
        email,
        tutorials: []
      });
    }
    
    if (typeof autoPlayTutorials !== 'undefined') {
      userTutorial.autoPlayTutorials = autoPlayTutorials;
    }
    
    if (typeof skipOnLogin !== 'undefined') {
      userTutorial.skipOnLogin = skipOnLogin;
    }
    
    await userTutorial.save();
    
    res.json({ 
      success: true, 
      message: 'Tutorial settings updated',
      settings: {
        autoPlayTutorials: userTutorial.autoPlayTutorials,
        skipOnLogin: userTutorial.skipOnLogin
      }
    });
    
  } catch (error) {
    console.error('Error updating tutorial settings:', error);
    res.status(500).json({ 
      error: 'Server error',
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
