// Integration tests for coupon validation and atomic redemption.
// Fixed: Mock targets now correctly separated — coupon.findUnique vs couponRedemption.count.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock factories
const {
  mockCouponFindUnique,
  mockRedemptionCount,
  mockTransaction,
} = vi.hoisted(() => ({
  mockCouponFindUnique: vi.fn(),
  mockRedemptionCount: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    coupon: {
      findUnique: mockCouponFindUnique,
      update: vi.fn().mockResolvedValue({}),
    },
    couponRedemption: {
      count: mockRedemptionCount,
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: mockTransaction,
  },
}));

import { validateCoupon, calculateDiscount, redeemCoupon } from '../routes/coupon.routes.js';

const makeActiveCoupon = (overrides = {}) => ({
  id: 'coupon-1',
  code: 'SAVE50',
  description: '50% off',
  discountType: 'percent',
  discountValue: 50,
  minAmount: 0,
  maxDiscount: null,
  applicablePlans: [],
  maxUses: null,
  maxUsesPerUser: 1,
  currentUses: 0,
  active: true,
  expiresAt: null,
  ...overrides,
});

describe('validateCoupon', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns valid:false when coupon does not exist', async () => {
    mockCouponFindUnique.mockResolvedValueOnce(null);
    const res = await validateCoupon('NONEXISTENT', 'starter', 'user-1');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('not found');
  });

  it('returns valid:false when coupon is inactive', async () => {
    mockCouponFindUnique.mockResolvedValueOnce(makeActiveCoupon({ active: false }));
    const res = await validateCoupon('SAVE50', 'starter', 'user-1');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('inactive');
  });

  it('returns valid:false when coupon has expired', async () => {
    const past = new Date(Date.now() - 1000);
    mockCouponFindUnique.mockResolvedValueOnce(makeActiveCoupon({ expiresAt: past }));
    const res = await validateCoupon('SAVE50', 'starter', 'user-1');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('expired');
  });

  it('returns valid:false when plan not in applicablePlans', async () => {
    mockCouponFindUnique.mockResolvedValueOnce(makeActiveCoupon({ applicablePlans: ['pro'] }));
    // No need for mockRedemptionCount here — plan check happens before user-limit check
    const res = await validateCoupon('SAVE50', 'starter', 'user-1');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('starter');
  });

  it('returns valid:false when user has already used the coupon', async () => {
    mockCouponFindUnique.mockResolvedValueOnce(makeActiveCoupon({ maxUsesPerUser: 1 }));
    mockRedemptionCount.mockResolvedValueOnce(1); // User already redeemed once
    const res = await validateCoupon('SAVE50', 'starter', 'user-1');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('already used');
  });

  it('returns valid:true with coupon object for a valid coupon', async () => {
    mockCouponFindUnique.mockResolvedValueOnce(makeActiveCoupon());
    mockRedemptionCount.mockResolvedValueOnce(0); // No previous redemptions
    const res = await validateCoupon('SAVE50', 'starter', 'user-1');
    expect(res.valid).toBe(true);
    expect(res.coupon).toBeDefined();
    expect(res.coupon?.code).toBe('SAVE50');
  });

  it('returns valid:true when coupon is valid for specified plan', async () => {
    mockCouponFindUnique.mockResolvedValueOnce(makeActiveCoupon({ applicablePlans: ['starter', 'pro'] }));
    mockRedemptionCount.mockResolvedValueOnce(0);
    const res = await validateCoupon('SAVE50', 'starter', 'user-1');
    expect(res.valid).toBe(true);
  });
});

describe('calculateDiscount', () => {
  it('calculates percent discount correctly', () => {
    const coupon = makeActiveCoupon({ discountType: 'percent', discountValue: 50 });
    const discount = calculateDiscount(coupon, 9900);
    expect(discount).toBe(4950); // 50% of ₹99
  });

  it('applies maxDiscount cap for percent coupons', () => {
    const coupon = makeActiveCoupon({ discountType: 'percent', discountValue: 90, maxDiscount: 2000 });
    const discount = calculateDiscount(coupon, 9900);
    expect(discount).toBe(2000); // capped at ₹20
  });

  it('calculates flat discount correctly', () => {
    const coupon = makeActiveCoupon({ discountType: 'flat', discountValue: 2000 });
    const discount = calculateDiscount(coupon, 9900);
    expect(discount).toBe(2000);
  });

  it('never discounts to less than ₹1 (100 paise minimum order)', () => {
    const coupon = makeActiveCoupon({ discountType: 'flat', discountValue: 99999 });
    const discount = calculateDiscount(coupon, 9900);
    // Max discount = 9900 - 100 = 9800 (keeps ₹1 minimum)
    expect(discount).toBe(9800);
  });
});

describe('redeemCoupon — TOCTOU fix', () => {
  beforeEach(() => vi.clearAllMocks());

  it('atomically checks per-user limit inside transaction and succeeds when within limit', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const tx = {
        coupon: {
          findUnique: vi.fn().mockResolvedValue({ maxUses: null, maxUsesPerUser: 1, currentUses: 0 }),
          update: vi.fn().mockResolvedValue({}),
        },
        couponRedemption: {
          count: vi.fn().mockResolvedValue(0),  // Not yet redeemed
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });

    await expect(redeemCoupon('coupon-1', 'user-1', 'payment-1')).resolves.not.toThrow();
  });

  it('throws when per-user limit reached inside transaction (TOCTOU guard)', async () => {
    // Simulate a race: by the time we are inside the transaction, the user already has a redemption
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const tx = {
        coupon: {
          findUnique: vi.fn().mockResolvedValue({ maxUses: null, maxUsesPerUser: 1, currentUses: 1 }),
          update: vi.fn(),
        },
        couponRedemption: {
          count: vi.fn().mockResolvedValue(1), // Already redeemed — race condition caught
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    await expect(redeemCoupon('coupon-1', 'user-1', 'payment-1'))
      .rejects.toThrow('per-user limit already reached');
  });

  it('throws when global usage limit reached inside transaction', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const tx = {
        coupon: {
          findUnique: vi.fn().mockResolvedValue({ maxUses: 10, maxUsesPerUser: 1, currentUses: 10 }),
          update: vi.fn(),
        },
        couponRedemption: { count: vi.fn(), create: vi.fn() },
      };
      return fn(tx);
    });

    await expect(redeemCoupon('coupon-1', 'user-1', 'payment-1'))
      .rejects.toThrow('global usage limit already reached');
  });

  it('throws when coupon is not found during redemption', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const tx = {
        coupon: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
        couponRedemption: { count: vi.fn(), create: vi.fn() },
      };
      return fn(tx);
    });

    await expect(redeemCoupon('missing-id', 'user-1', 'payment-1'))
      .rejects.toThrow('not found during redemption');
  });
});
