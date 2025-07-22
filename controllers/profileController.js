import User from '../models/User.js';

export const completeProfile = async (req, res) => {
  try {
    const userId = req.user?.userId; // Safer access
    const { gender, birthDate, weight, height, activityLevel } = req.body;

    // Check for missing fields (more detailed validation)
    if (!gender || !birthDate || !weight || !height || !activityLevel) {
      return res.status(400).json({
        success: false,
        error: 'All profile fields are required',
        details: { gender, birthDate, weight, height, activityLevel },
      });
    }

    // Check if userId exists (better auth handling)
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User ID not found in token',
      });
    }

    // Check if user exists (from profilecontroller.js)
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Prevent duplicate submissions (from profilecontroller.js)
    if (existingUser.profileCompleted) {
      return res.status(200).json({
        success: true,
        message: 'Profile already completed',
        data: existingUser.profile,
      });
    }

    // Update profile (atomic operation + type safety)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          profile: { // Structured like completeprofilecontroller.js
            gender,
            birthDate: new Date(birthDate), // Ensure proper type
            weight: Number(weight),
            height: Number(height),
            activityLevel,
          },
          profileCompleted: true, // Mark as complete
        },
      },
      { new: true } // Return updated document
    );

    // Final check if update succeeded
    if (!updatedUser) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update profile',
      });
    }

    // Success response (structured like profilecontroller.js)
    res.status(200).json({
      success: true,
      message: 'Profile completed successfully',
      data: updatedUser.profile,
    });
  } catch (error) {
    console.error('Profile completion error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during profile completion',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const getProfileStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User ID not found in token' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const isCompleted =
      user.profileCompleted &&
      user.profile &&
      user.profile.height &&
      user.profile.weight &&
      user.profile.birthDate;

    return res.status(200).json({
      success: true,
      profileCompleted: !!isCompleted
    });
  } catch (err) {
    console.error("Error fetching profile status:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
