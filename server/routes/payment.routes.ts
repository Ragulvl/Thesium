// Why: Razorpay payment routes with coupon support — order creation, verification, coupon discount application.
import { Router, Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { validateCoupon, calculateDiscount, redeemCoupon } from './coupon.routes.js';

const router = Router();

// ── Pricing Plans ────────────────────────────────────────────────────
export const PLANS = {
  starter: {
    name: 'Starter',
    priceInr: 4900,        // ₹49 in paise
    thesisQuota: 5,
    description: '5 AI-powered theses',
  },
  pro: {
    name: 'Pro',
    priceInr: 9900,        // ₹99 in paise
    thesisQuota: 25,
    description: '25 AI-powered theses',
  },
  unlimited: {
    name: 'Unlimited',
    priceInr: 19900,       // ₹199 in paise
    thesisQuota: 9999,
    description: 'Unlimited thesis generation',
  },
} as const;

type PlanId = keyof typeof PLANS;

// ── Razorpay Instance ────────────────────────────────────────────────
function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay keys not configured');
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// ── GET /api/payments/plans — List available plans ───────────────────
router.get('/plans', (_req: Request, res: Response) => {
  const plans = Object.entries(PLANS).map(([id, plan]) => ({
    id,
    name: plan.name,
    priceInr: plan.priceInr,
    priceDisplay: `₹${(plan.priceInr / 100).toFixed(0)}`,
    thesisQuota: plan.thesisQuota,
    description: plan.description,
  }));
  res.json(plans);
});

// ── POST /api/payments/create-order — Create Razorpay order ─────────
router.post('/create-order', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { planId, couponCode } = req.body as { planId: string; couponCode?: string };

    if (!planId || !(planId in PLANS)) {
      return res.status(400).json({ error: `Invalid plan. Choose: ${Object.keys(PLANS).join(', ')}` });
    }

    const plan = PLANS[planId as PlanId];
    let finalAmount: number = plan.priceInr;
    let appliedCouponCode: string | null = null;
    let couponId: string | null = null;

    // Apply coupon if provided
    if (couponCode) {
      const code = couponCode.toUpperCase().trim();
      const validation = await validateCoupon(code, planId, req.user!.id);

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const discount = calculateDiscount(validation.coupon!, plan.priceInr);
      finalAmount = plan.priceInr - discount;
      appliedCouponCode = code;
      couponId = validation.coupon!.id;

      logger.info({
        userId: req.user!.id, planId, couponCode: code,
        originalAmount: plan.priceInr, discount, finalAmount,
      }, 'Coupon applied to order');
    }

    // Ensure minimum ₹1 for Razorpay
    finalAmount = Math.max(finalAmount, 100);

    const razorpay = getRazorpay();

    const order = await razorpay.orders.create({
      amount: finalAmount,
      currency: 'INR',
      receipt: `thesium_${req.user!.id}_${Date.now()}`,
      notes: {
        userId: req.user!.id,
        planId,
        couponCode: appliedCouponCode || '',
        userEmail: req.user!.email || '',
      },
    });

    // Save pending payment with coupon info
    await prisma.payment.create({
      data: {
        userId: req.user!.id,
        razorpayOrderId: order.id,
        planId,
        amount: finalAmount,
        originalAmount: plan.priceInr,
        couponCode: appliedCouponCode,
        currency: 'INR',
        status: 'created',
      },
    });

    logger.info({
      userId: req.user!.id, orderId: order.id, planId,
      amount: finalAmount, coupon: appliedCouponCode,
    }, 'Razorpay order created');

    res.json({
      orderId: order.id,
      amount: finalAmount,
      originalAmount: plan.priceInr,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      planName: plan.name,
      couponApplied: appliedCouponCode,
      discount: plan.priceInr - finalAmount,
      _couponId: couponId, // internal — used for redemption on verify
    });
  } catch (err) {
    logger.error({ err }, 'Failed to create Razorpay order');
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// ── POST /api/payments/verify — Verify payment after checkout ───────
router.post('/verify', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    // Verify signature
    const secret = process.env.RAZORPAY_KEY_SECRET!;
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      logger.warn({ userId: req.user!.id, razorpay_order_id }, 'Payment signature mismatch');
      return res.status(400).json({ error: 'Payment verification failed — signature mismatch' });
    }

    // Find the payment record
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: razorpay_order_id, userId: req.user!.id },
    });

    if (!payment) return res.status(404).json({ error: 'Payment order not found' });
    if (payment.status === 'paid') return res.json({ success: true, message: 'Already verified' });

    const plan = PLANS[payment.planId as PlanId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan in payment record' });

    // Update payment + upgrade user in atomic transaction
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          status: 'paid',
          paidAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: req.user!.id },
        data: {
          tier: payment.planId,
          thesisQuota: { increment: plan.thesisQuota },
        },
      }),
    ]);

    // Redeem coupon if one was applied
    if (payment.couponCode) {
      try {
        const coupon = await prisma.coupon.findUnique({ where: { code: payment.couponCode } });
        if (coupon) {
          await redeemCoupon(coupon.id, req.user!.id, payment.id);
          logger.info({ couponCode: payment.couponCode, userId: req.user!.id }, 'Coupon redeemed on payment');
        }
      } catch (couponErr) {
        logger.warn({ err: couponErr }, 'Failed to redeem coupon — non-fatal');
      }
    }

    logger.info({
      userId: req.user!.id, planId: payment.planId,
      paymentId: razorpay_payment_id, amount: payment.amount,
      coupon: payment.couponCode,
    }, '✅ Payment verified — user upgraded');

    res.json({
      success: true,
      tier: payment.planId,
      quotaAdded: plan.thesisQuota,
    });
  } catch (err) {
    logger.error({ err }, 'Payment verification failed');
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

export default router;
