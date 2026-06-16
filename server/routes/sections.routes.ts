import { Router } from 'express';
import { getSections, updateSectionContent, queueSectionGeneration } from '../controllers/sections.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { apiLimiter, aiGenerationLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// All section routes require authentication
router.use(requireAuth);

router.get('/:thesisId/sections', apiLimiter, getSections);
router.patch('/:thesisId/sections/:sectionId', apiLimiter, updateSectionContent);

// AI Generation hits a stricter rate limit (e.g. 10/min) before queuing
router.post('/:thesisId/sections/:sectionId/generate', aiGenerationLimiter, queueSectionGeneration);

export default router;
