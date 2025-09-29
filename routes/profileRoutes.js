// routes/profileRoutes.js
import express from 'express';
// import multer from 'multer'; // Temporarily commented out
import { completeProfile, updateProfile, getProfileStatus, getProfile } from '../controllers/profileController.js'; // Removed uploadProfileImage temporarily
import authenticateToken from '../middleware/authenticateToken.js';

const router = express.Router();

// Multer configuration for image uploads - TEMPORARILY DISABLED
// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: {
//     fileSize: 5 * 1024 * 1024, // 5MB limit
//   },
//   fileFilter: (req, file, cb) => {
//     if (file.mimetype.startsWith('image/')) {
//       cb(null, true);
//     } else {
//       cb(new Error('Only image files are allowed'), false);
//     }
//   },
// });

router.post('/complete', authenticateToken, completeProfile);
router.put('/update', authenticateToken, updateProfile); // NEW: Flexible profile updates
router.get('/status', authenticateToken, getProfileStatus);
router.get('/me', authenticateToken, getProfile);
// router.post('/upload-image', authenticateToken, upload.single('profileImage'), uploadProfileImage); // Temporarily disabled

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
