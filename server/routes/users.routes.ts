import { Router } from 'express';
import { syncUser } from '../controllers/users.controller.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/sync', apiLimiter, requireAuth, syncUser);

export default router;
