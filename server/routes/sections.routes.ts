import { Router } from 'express';
import {
  getSections,
  updateSectionContent,
  queueSectionGeneration,
  queueAllSections,
  queueThesisAudit,
  getThesisAuditReport,
} from '../controllers/sections.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { apiLimiter, aiGenerationLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// All section routes require authentication
router.use(requireAuth);

// ── Section CRUD ────────────────────────────────────────────────────
router.get('/:thesisId/sections', apiLimiter, getSections);
router.patch('/:thesisId/sections/:sectionId', apiLimiter, updateSectionContent);

// ── AI Generation (stricter rate limit) ────────────────────────────
router.post('/:thesisId/sections/:sectionId/generate', aiGenerationLimiter, queueSectionGeneration);

// Bulk: queue all empty sections in one request — prevents client-side sequential looping
router.post('/:thesisId/generate-all', aiGenerationLimiter, queueAllSections);

// ── Whole-Thesis Audit ──────────────────────────────────────────────
// POST  — queue a new audit job (returns jobId for polling)
// GET   — fetch the stored audit report (returns 404 if never run)
router.post('/:thesisId/audit', aiGenerationLimiter, queueThesisAudit);
router.get('/:thesisId/audit', apiLimiter, getThesisAuditReport);

export default router;
