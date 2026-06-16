// Why: Complete coupon system — admin CRUD, validate, apply to payment, track redemptions.
import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { PLANS } from './payment.routes.js';

const router = Router();

// All routes require auth
router.use(requireAuth);

// ══════════════════════════════════════════════════════════════════
// PUBLIC: Validate / Apply coupon
// ══════════════════════════════════════════════════════════════════

// POST /api/coupons/validate — Check if coupon is valid for a plan
router.post('/validate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, planId } = req.body as { code: string; planId: string };

    if (!code || !planId) {
      return res.status(400).json({ error: 'Missing code or planId' });
    }

    const result = await validateCoupon(code.toUpperCase().trim(), planId, req.user!.id);

    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.error });
    }

    const plan = PLANS[planId as keyof typeof PLANS];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    const discount = calculateDiscount(result.coupon!, plan.priceInr);

    res.json({
      valid: true,
      code: result.coupon!.code,
      description: result.coupon!.description,
      discountType: result.coupon!.discountType,
      discountValue: result.coupon!.discountValue,
      discountAmount: discount,
      originalPrice: plan.priceInr,
      finalPrice: plan.priceInr - discount,
      finalPriceDisplay: `₹${((plan.priceInr - discount) / 100).toFixed(0)}`,
    });
  } catch (err) {
    logger.error({ err }, 'Coupon validation failed');
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

// ══════════════════════════════════════════════════════════════════
// ADMIN: CRUD for coupons (Super Admin only)
// ══════════════════════════════════════════════════════════════════

// GET /api/coupons/admin — List all coupons
router.get('/admin', async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Forbidden' });

  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: true } } },
    });
    res.json(coupons);
  } catch (err) {
    logger.error({ err }, 'Failed to list coupons');
    res.status(500).json({ error: 'Failed to list coupons' });
  }
});

// POST /api/coupons/admin — Create a coupon
router.post('/admin', async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Forbidden' });

  try {
    const {
      code, description, discountType, discountValue,
      minAmount, maxDiscount, applicablePlans,
      maxUses, maxUsesPerUser, expiresAt,
    } = req.body;

    if (!code || !discountType || discountValue == null) {
      return res.status(400).json({ error: 'code, discountType, and discountValue are required' });
    }

    if (!['percent', 'flat'].includes(discountType)) {
      return res.status(400).json({ error: 'discountType must be "percent" or "flat"' });
    }

    if (discountType === 'percent' && (discountValue < 0 || discountValue > 100)) {
      return res.status(400).json({ error: 'Percent discount must be 0-100' });
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase().trim(),
        description: description || null,
        discountType,
        discountValue,
        minAmount: minAmount || 0,
        maxDiscount: maxDiscount || null,
        applicablePlans: applicablePlans || [],
        maxUses: maxUses || null,
        maxUsesPerUser: maxUsesPerUser ?? 1,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    logger.info({ couponId: coupon.id, code: coupon.code }, 'Coupon created');
    res.status(201).json(coupon);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Coupon code already exists' });
    }
    logger.error({ err }, 'Failed to create coupon');
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

// PATCH /api/coupons/admin/:id — Update a coupon
router.patch('/admin/:id', async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Forbidden' });

  try {
    const { active, maxUses, maxUsesPerUser, expiresAt, description } = req.body;
    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data: {
        ...(active !== undefined && { active }),
        ...(maxUses !== undefined && { maxUses }),
        ...(maxUsesPerUser !== undefined && { maxUsesPerUser }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(description !== undefined && { description }),
      },
    });
    res.json(coupon);
  } catch (err) {
    logger.error({ err }, 'Failed to update coupon');
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

// DELETE /api/coupons/admin/:id — Delete a coupon
router.delete('/admin/:id', async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Forbidden' });

  try {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete coupon');
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
});

// ══════════════════════════════════════════════════════════════════
// Shared helpers (exported for use in payment.routes.ts)
// ══════════════════════════════════════════════════════════════════

interface CouponRecord {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  minAmount: number;
  maxDiscount: number | null;
  applicablePlans: string[];
  maxUses: number | null;
  maxUsesPerUser: number;
  currentUses: number;
  active: boolean;
  expiresAt: Date | null;
}

export async function validateCoupon(
  code: string,
  planId: string,
  userId: string,
): Promise<{ valid: boolean; error?: string; coupon?: CouponRecord }> {
  const coupon = await prisma.coupon.findUnique({ where: { code } });

  if (!coupon) return { valid: false, error: 'Coupon not found' };
  if (!coupon.active) return { valid: false, error: 'Coupon is inactive' };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return { valid: false, error: 'Coupon has expired' };
  if (coupon.maxUses !== null && coupon.currentUses >= coupon.maxUses) return { valid: false, error: 'Coupon usage limit reached' };

  // Check plan restriction
  if (coupon.applicablePlans.length > 0 && !coupon.applicablePlans.includes(planId)) {
    return { valid: false, error: `Coupon not valid for the ${planId} plan` };
  }

  // Check per-user limit
  const userRedemptions = await prisma.couponRedemption.count({
    where: { userId, couponId: coupon.id },
  });

  if (userRedemptions >= coupon.maxUsesPerUser) {
    return { valid: false, error: 'You have already used this coupon' };
  }

  return { valid: true, coupon };
}

export function calculateDiscount(coupon: CouponRecord, amountInPaise: number): number {
  let discount: number;

  if (coupon.discountType === 'percent') {
    discount = Math.round((amountInPaise * coupon.discountValue) / 100);
    // Apply max discount cap if set
    if (coupon.maxDiscount !== null && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  } else {
    // Flat discount (value is already in paise)
    discount = coupon.discountValue;
  }

  // Never discount more than the order amount (min ₹1 to keep Razorpay valid)
  return Math.min(discount, amountInPaise - 100);
}

export async function redeemCoupon(couponId: string, userId: string, paymentId?: string) {
  await prisma.$transaction([
    prisma.coupon.update({
      where: { id: couponId },
      data: { currentUses: { increment: 1 } },
    }),
    prisma.couponRedemption.create({
      data: { userId, couponId, paymentId },
    }),
  ]);
}

export default router;
