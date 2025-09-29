import User from '../models/User.js';
// import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

// Helper function to check if profile is complete
const checkProfileComplete = (profile) => {
  return !!(profile.gender && profile.birthDate && profile.weight && profile.height && profile.activityLevel);
};

// Configure Cloudinary (you'll need to set these environment variables)
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

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

// NEW: Flexible profile update for progressive profiling
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const updates = req.body;

    // Check if userId exists
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User ID not found in token',
      });
    }

    // Find user first
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Allow partial updates - only validate provided fields
    const allowedFields = ['gender', 'birthDate', 'weight', 'height', 'activityLevel'];
    const profileUpdates = {};
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined && updates[field] !== null) {
        if (field === 'birthDate') {
          profileUpdates[field] = new Date(updates[field]);
        } else if (field === 'weight' || field === 'height') {
          profileUpdates[field] = Number(updates[field]);
        } else {
          profileUpdates[field] = updates[field];
        }
      }
    }

    if (Object.keys(profileUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid profile fields provided',
        allowedFields,
      });
    }

    // Build update object with dot notation for nested fields
    const updateObject = {};
    for (const [key, value] of Object.entries(profileUpdates)) {
      updateObject[`profile.${key}`] = value;
    }

    // Check if profile will be complete after this update
    const currentProfile = existingUser.profile || {};
    const updatedProfile = { ...currentProfile.toObject?.() || currentProfile, ...profileUpdates };
    const willBeComplete = checkProfileComplete(updatedProfile);
    
    if (willBeComplete) {
      updateObject.profileCompleted = true;
    }

    // Update user with new profile data
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateObject },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update profile',
      });
    }

    // Success response
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser.profile,
      profileCompleted: updatedUser.profileCompleted,
      updatedFields: Object.keys(profileUpdates),
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during profile update',
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

export const getProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: User ID not found in token' 
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    if (!user.profile) {
      // Changed from 404 to 200 for frontend compatibility
      return res.status(200).json({ 
        success: false, 
        error: 'Profile not completed yet' 
      });
    }
    
    // Return profile data at root level for simpler parsing
    res.status(200).json({
      success: true,
      profileCompleted: user.profileCompleted, // Include profile completion status
      ...user.profile.toObject() // Include all profile fields
    });
    
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ 
      success: false, 
      error: "Server error",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

export const uploadProfileImage = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: User ID not found in token' 
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Temporarily disabled - Upload to Cloudinary
    /* const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'sikadvoltz/profiles',
        public_id: `profile_${userId}`,
        overwrite: true,
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      },
      async (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to upload image to cloud storage'
          });
        }

        try {
          // Update user's profile picture URL
          user.profilePicture = result.secure_url;
          await user.save();

          console.log(`Profile image updated for user ${userId}: ${result.secure_url}`);

          res.json({
            success: true,
            data: {
              imageUrl: result.secure_url,
              user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                profilePicture: user.profilePicture
              }
            },
            message: 'Profile image uploaded successfully'
          });
        } catch (dbError) {
          console.error('Database update error:', dbError);
          res.status(500).json({
            success: false,
            error: 'Failed to update user profile in database'
          });
        }
      }
    );

    // Convert buffer to stream and pipe to Cloudinary
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    bufferStream.pipe(uploadStream); */

    // Temporary response while cloudinary is disabled
    res.json({
      success: true,
      data: {
        imageUrl: '/default-profile.jpg', // placeholder
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePicture: user.profilePicture
        }
      },
      message: 'Profile image upload temporarily disabled'
    });

  } catch (err) {
    console.error("Error uploading profile image:", err);
    res.status(500).json({ 
      success: false, 
      error: "Server error",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};
