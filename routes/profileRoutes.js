// routes/profileRoutes.js
import express from 'express';
import { completeProfile, getProfileStatus, getProfile } from '../controllers/profileController.js';
import authenticateToken from '../middleware/authenticateToken.js';

const router = express.Router();

router.post('/complete', authenticateToken, completeProfile);
router.get('/status', authenticateToken, getProfileStatus);
router.get('/me', authenticateToken, getProfile);

// Add this route to return the full profile object
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User ID not found in token' });
    }
    const user = await (await import('../models/User.js')).default.findById(userId);
    if (!user || !user.profile) {
      return res.status(404).json({ success: false, error: 'User profile not found' });
    }
    res.json({
      success: true,
      profile: user.profile
    });
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

export default router;
