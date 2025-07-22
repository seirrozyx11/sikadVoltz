// routes/profileRoutes.js
import express from 'express';
import { completeProfile, getProfileStatus } from '../controllers/profileController.js';
import authenticateToken from '../middleware/authenticateToken.js';

const router = express.Router();

router.post('/complete', authenticateToken, completeProfile);
router.get('/status', authenticateToken, getProfileStatus);

export default router;
