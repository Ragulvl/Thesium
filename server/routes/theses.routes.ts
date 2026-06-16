// Why: Updated to use auth user ID, removed userId from URL param (security fix).
import { Router } from 'express';
import { getUserTheses, createThesis, deleteThesis } from '../controllers/theses.controller.js';
import { exportThesis } from '../controllers/export.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Apply general API rate limiter to thesis routes
router.use(apiLimiter);

// Must be authenticated to access theses
router.use(requireAuth);

// Changed: no longer takes userId in URL — always uses auth token
router.get('/', getUserTheses);
router.post('/', createThesis);
router.get('/:id/export', exportThesis);
router.delete('/:id', deleteThesis);

export default router;
