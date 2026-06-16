// Why: Fixed — now checks req.user.role from DB instead of nonexistent field.
import { Router, Response, NextFunction } from 'express';
import { getMetrics } from '../controllers/admin.controller.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

const requireSuperAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Requires Super Admin privileges' });
  }
  next();
};

router.get('/metrics', requireAuth, requireSuperAdmin, getMetrics);

export default router;
