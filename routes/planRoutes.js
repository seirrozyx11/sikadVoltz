import express from 'express';
import {
  createPlan,
  recordSession,
  missedSession,
  getCurrentPlan,
  allowEditPlan,
  triggerEmergencyCatchUp,
  remindMissedGoals,
  markDayComplete
} from '../controllers/planController.js';

import authenticateToken from '../middleware/authenticateToken.js';
import { validateRequest, planValidation } from '../middleware/validation.js';

const router = express.Router();

// Create a new cycling plan
router.post(
  '/',
  authenticateToken,
  validateRequest(planValidation.createPlan),
  createPlan
);

// Record a completed session
router.post(
  '/:id/sessions',
  authenticateToken,
  validateRequest(planValidation.recordSession),
  recordSession
);

// Handle missed session
router.post(
  '/:id/missed',
  authenticateToken,
  validateRequest(planValidation.missedSession),
  missedSession
);

// Get user's current plan
router.get(
  '/current',
  authenticateToken,
  getCurrentPlan
);

// Allow editing plan if missed 5 days
router.get('/:id/allow-edit', authenticateToken, allowEditPlan);

// Emergency catch-up
router.post('/:id/emergency-catchup', authenticateToken, triggerEmergencyCatchUp);

// Remind users for missed goals (admin/cron)
router.post('/remind-missed', remindMissedGoals);

// Mark current day as complete
router.post('/mark-day-complete', authenticateToken, markDayComplete);

export default router;
