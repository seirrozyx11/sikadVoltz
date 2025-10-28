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

// Add health screening endpoint to profile routes
router.get('/health-screening', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User ID not found in token' });
    }
    
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check if health screening is completed
    // BUG FIX: Must check for actual data, not just object existence
    //HealthScreening object might exist with empty/default values from Mongoose
    const hasValidScreeningData = user.healthScreening && 
                                   user.healthScreening.riskLevel && 
                                   user.healthScreening.riskScore !== undefined && 
                                   user.healthScreening.screeningDate;
    
    if (!hasValidScreeningData) {
      return res.json({
        success: true,
        data: {
          screening_completed: false,
          has_complete_data: false,
          can_proceed: false,
          requires_screening: true
        }
      });
    }
    
    const screening = user.healthScreening;
    
    // Validate screening is not expired (6 months validity)
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - (6 * 30 * 24 * 60 * 60 * 1000));
    const isValid = screening.screeningDate > sixMonthsAgo;
    
    return res.json({
      success: true,
      data: {
        screening_completed: true,
        has_complete_data: true,
        can_proceed: screening.riskLevel !== 'HIGH' && isValid,
        requires_screening: !isValid, // Require new screening if expired
        risk_level: screening.riskLevel,
        risk_score: screening.riskScore,
        screening_date: screening.screeningDate,
        is_quick_screening: screening.isQuickScreening,
        is_valid: isValid
      }
    });
    
  } catch (error) {
    console.error("Error fetching health screening status:", error);
    res.status(500).json({ 
      success: false, 
      error: "Server error fetching health screening status",
      message: error.message 
    });
  }
});

export default router;
