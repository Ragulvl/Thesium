import { Router } from 'express';
import { createSession, destroySession, getMe } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// POST /api/auth/session  — verify Google credential, set httpOnly cookie
router.post('/session', apiLimiter, createSession);

// GET  /api/auth/me       — return authenticated user profile (requires cookie or Bearer)
router.get('/me', apiLimiter, requireAuth, getMe);

// POST /api/auth/logout   — clear session cookie
router.post('/logout', apiLimiter, destroySession);

export default router;
