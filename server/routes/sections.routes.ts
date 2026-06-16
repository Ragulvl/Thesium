// Fixes: Added missing POST /:thesisId/generate-all route (was exported from controller
// but never registered as a route — frontend had to fall back to client-side looping).
import { Router } from 'express';
import {
  getSections,
  updateSectionContent,
  queueSectionGeneration,
  queueAllSections,
} from '../controllers/sections.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { apiLimiter, aiGenerationLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// All section routes require authentication
router.use(requireAuth);

router.get('/:thesisId/sections', apiLimiter, getSections);
router.patch('/:thesisId/sections/:sectionId', apiLimiter, updateSectionContent);

// AI Generation hits a stricter rate limit (e.g. 10/min) before queuing
router.post('/:thesisId/sections/:sectionId/generate', aiGenerationLimiter, queueSectionGeneration);

// Bulk: queue all empty sections in one request — prevents client-side sequential looping
router.post('/:thesisId/generate-all', aiGenerationLimiter, queueAllSections);

export default router;
