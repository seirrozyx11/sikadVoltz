import express from 'express';
import {
  createPlan,
  recordSession,
  missedSession,
  getCurrentPlan
} from '../controllers/planController.js';

import auth from '../middleware/auth.js';
import { validateRequest, planValidation } from '../middleware/validation.js';

const router = express.Router();

// Create a new cycling plan
router.post(
  '/',
  auth,
  validateRequest(planValidation.createPlan),
  createPlan
);

// Record a completed session
router.post(
  '/:id/sessions',
  auth,
  validateRequest(planValidation.recordSession),
  recordSession
);

// Handle missed session
router.post(
  '/:id/missed',
  auth,
  validateRequest(planValidation.missedSession),
  missedSession
);

// Get user's current plan
router.get(
  '/current',
  auth,
  getCurrentPlan
);

export default router;
