// Why: Usage tracking routes — users see their own costs, Super Admin sees all.
import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';

const router = Router();

// All routes require auth
router.use(requireAuth);

// ── GET /api/usage — Current user's usage summary ────────────────────
router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const [totals, thesisCount, recentUsage] = await Promise.all([
      // Aggregate total cost and tokens
      prisma.usage.aggregate({
        where: { userId },
        _sum: { costUsd: true, tokens: true },
        _count: true,
      }),
      // Count theses
      prisma.thesis.count({ where: { userId } }),
      // Last 10 usage entries
      prisma.usage.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          costUsd: true,
          tokens: true,
          model: true,
          stage: true,
          createdAt: true,
          thesis: { select: { title: true } },
        },
      }),
    ]);

    const freeLimit = Number(process.env.FREE_THESIS_LIMIT) || 2;

    res.json({
      totalCostUsd: totals._sum.costUsd || 0,
      totalTokens: totals._sum.tokens || 0,
      totalCalls: totals._count,
      thesisCount,
      freeThesesRemaining: Math.max(0, freeLimit - thesisCount),
      recentUsage,
    });
  } catch (err) {
    (req as any).log?.error({ err }, 'Failed to fetch usage');
    res.status(500).json({ error: 'Failed to fetch usage data' });
  }
});

// ── GET /api/usage/quota — Check if user can generate ────────────────
router.get('/quota', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const [thesisCount, dbUser] = await Promise.all([
      prisma.thesis.count({ where: { userId } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { tier: true, thesisQuota: true },
      }),
    ]);

    const quota = dbUser?.thesisQuota ?? (process.env.FREE_THESIS_LIMIT ? Number(process.env.FREE_THESIS_LIMIT) : 2);
    const canGenerate = thesisCount < quota;
    const remaining = Math.max(0, quota - thesisCount);

    res.json({
      canGenerate,
      thesisCount,
      freeLimit: quota,
      remaining,
      tier: dbUser?.tier || 'free',
    });
  } catch (err) {
    (req as any).log?.error({ err }, 'Failed to check quota');
    res.status(500).json({ error: 'Failed to check quota' });
  }
});

// ── GET /api/usage/admin — Super Admin: all users' usage ─────────────
router.get('/admin', async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const userUsage = await prisma.$queryRaw`
      SELECT 
        u.id, u.email, u.name,
        COUNT(DISTINCT t.id)::int AS "thesisCount",
        COALESCE(SUM(ug."costUsd"), 0)::float AS "totalCostUsd",
        COALESCE(SUM(ug.tokens), 0)::int AS "totalTokens"
      FROM "User" u
      LEFT JOIN "Thesis" t ON t."userId" = u.id
      LEFT JOIN "Usage" ug ON ug."userId" = u.id
      GROUP BY u.id
      ORDER BY "totalCostUsd" DESC
      LIMIT 100
    `;

    res.json(userUsage);
  } catch (err) {
    (req as any).log?.error({ err }, 'Failed to fetch admin usage');
    res.status(500).json({ error: 'Failed to fetch admin usage data' });
  }
});

export default router;
