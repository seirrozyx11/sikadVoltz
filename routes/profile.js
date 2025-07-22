import express from 'express';
import { completeProfile } from '../controllers/profileController.js';
import authenticateToken from '../middleware/authenticateToken.js';

const router = express.Router();

router.post('/complete', authenticateToken, completeProfile);

export default router;
