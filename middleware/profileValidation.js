import User from '../models/User.js';
// In middleware/profileValidation.js
export const requireCompleteProfile = async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }
  
      const user = await User.findById(userId);
      if (!user?.profileCompleted) {
        return res.status(400).json({
          success: false,
          error: 'Complete your profile first',
          code: 'PROFILE_INCOMPLETE',
          requiredFields: ['weight', 'height', 'birthDate', 'gender', 'activityLevel']
        });
      }
  
      req.user.profile = user.profile;
      next();
    } catch (error) {
      console.error('Profile validation error:', error);
      res.status(500).json({
        success: false,
        error: 'Error validating profile'
      });
    }
  };