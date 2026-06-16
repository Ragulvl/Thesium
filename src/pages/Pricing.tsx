import { useState, useEffect } from 'react';
import { Check, Sparkles, Zap, Crown, Menu, ArrowLeft, Tag, X, Loader2 } from 'lucide-react';
import { useGoogleAuth } from '../contexts/GoogleAuthContext';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { logger } from '../utils/logger';

interface Plan {
  id: string;
  name: string;
  priceInr: number;
  priceDisplay: string;
  thesisQuota: number;
  description: string;
}

interface QuotaData {
  canGenerate: boolean;
  thesisCount: number;
  freeLimit: number;
  remaining: number;
  tier: string;
}

interface CouponResult {
  valid: boolean;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  discountAmount: number;
  originalPrice: number;
  finalPrice: number;
  finalPriceDisplay: string;
}

// Razorpay types
declare global {
  interface Window {
    Razorpay?: new (options: any) => { open: () => void };
  }
}

export default function Pricing() {
  const { getToken, user } = useGoogleAuth();
  const navigate = useNavigate();
  const { setMobileSidebarOpen } = useOutletContext<{ setMobileSidebarOpen: (o: boolean) => void }>();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [couponPlanId, setCouponPlanId] = useState<string | null>(null);
  const [couponResult, setCouponResult] = useState<CouponResult | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const headers = { 'Authorization': `Bearer ${token}` };

    Promise.all([
      fetch('/api/payments/plans').then(r => r.json()),
      fetch('/api/usage/quota', { headers }).then(r => r.json()),
    ])
      .then(([plansData, quotaData]) => {
        setPlans(plansData);
        setQuota(quotaData);
      })
      .catch(err => logger.error({ err }, 'Failed to fetch pricing data'))
      .finally(() => setLoading(false));
  }, [getToken]);

  // Load Razorpay script
  useEffect(() => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const handleApplyCoupon = async (planId: string) => {
    const token = getToken();
    if (!token || !couponInput.trim()) return;

    setValidating(true);
    setCouponError(null);
    setCouponResult(null);
    setCouponPlanId(planId);

    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: couponInput.trim(), planId }),
      });
      const data = await res.json();

      if (res.ok && data.valid) {
        setCouponResult(data);
        setCouponError(null);
      } else {
        setCouponError(data.error || 'Invalid coupon');
        setCouponResult(null);
      }
    } catch {
      setCouponError('Failed to validate coupon');
    } finally {
      setValidating(false);
    }
  };

  const clearCoupon = () => {
    setCouponInput('');
    setCouponResult(null);
    setCouponError(null);
    setCouponPlanId(null);
  };

  const handlePurchase = async (planId: string) => {
    const token = getToken();
    if (!token) return;

    setPaying(planId);

    try {
      // 1. Create order on backend (with coupon if applied to this plan)
      const body: any = { planId };
      if (couponResult && couponPlanId === planId) {
        body.couponCode = couponResult.code;
      }

      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const orderData = await orderRes.json();

      if (!orderRes.ok) throw new Error(orderData.error || 'Failed to create order');

      // 2. Open Razorpay checkout
      if (!window.Razorpay) throw new Error('Razorpay SDK not loaded');

      const rzp = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Thesium',
        description: `${orderData.planName} Plan${orderData.couponApplied ? ` (${orderData.couponApplied})` : ''}`,
        order_id: orderData.orderId,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
        },
        theme: {
          color: '#6366f1',
        },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          // 3. Verify payment on backend
          try {
            const verifyRes = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify(response),
            });
            const verifyData = await verifyRes.json();

            if (verifyData.success) {
              const newQuota = await fetch('/api/usage/quota', {
                headers: { 'Authorization': `Bearer ${token}` },
              }).then(r => r.json());
              setQuota(newQuota);
              clearCoupon();
              alert(`✅ Payment successful! ${verifyData.quotaAdded} theses added to your account.`);
            } else {
              alert('Payment verification failed. Contact support.');
            }
          } catch (err) {
            logger.error({ err }, 'Payment verification error');
            alert('Payment verification failed. Your payment is safe — contact support.');
          }
          setPaying(null);
        },
        modal: {
          ondismiss: () => setPaying(null),
        },
      });
      rzp.open();
    } catch (err: any) {
      logger.error({ err }, 'Payment error');
      alert(err.message || 'Payment failed');
      setPaying(null);
    }
  };

  const planIcons: Record<string, typeof Sparkles> = {
    starter: Zap,
    pro: Crown,
    unlimited: Sparkles,
  };

  const planColors: Record<string, { gradient: string; badge: string; button: string }> = {
    starter: {
      gradient: 'from-blue-500/10 to-blue-600/5',
      badge: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      button: 'bg-blue-600 hover:bg-blue-700',
    },
    pro: {
      gradient: 'from-violet-500/10 to-purple-600/5',
      badge: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
      button: 'bg-violet-600 hover:bg-violet-700',
    },
    unlimited: {
      gradient: 'from-amber-500/10 to-orange-500/5',
      badge: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
      button: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600',
    },
  };

  const planFeatures: Record<string, string[]> = {
    starter: ['5 AI-generated theses', 'All sections included', 'Citations & references', 'Quality guard checks'],
    pro: ['25 AI-generated theses', 'Priority processing', 'All Starter features', 'Advanced research integration'],
    unlimited: ['Unlimited theses', 'Highest priority', 'All Pro features', 'Dedicated pipeline capacity'],
  };

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-transparent">
          <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4">
            <h1 className="text-xl font-bold tracking-tight">Pricing</h1>
          </div>
          <div className="p-6 md:p-8 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-80 bg-card border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-transparent">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4 flex items-center gap-3">
          <button className="lg:hidden p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground rounded-md" onClick={() => setMobileSidebarOpen(true)}>
            <Menu size={18} />
          </button>
          <button onClick={() => navigate('/usage')} className="p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground rounded-md">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Upgrade Your Plan</h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              {quota ? `Currently: ${quota.tier.charAt(0).toUpperCase() + quota.tier.slice(1)} · ${quota.remaining} theses remaining` : 'Loading...'}
            </p>
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-5xl mx-auto">
          {/* Current plan banner */}
          {quota && quota.tier !== 'free' && (
            <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-3">
              <Check size={18} className="text-primary" />
              <p className="text-sm font-medium text-foreground">
                You're on the <span className="text-primary font-bold">{quota.tier.charAt(0).toUpperCase() + quota.tier.slice(1)}</span> plan
                with <span className="font-bold">{quota.remaining} theses</span> remaining.
              </p>
            </div>
          )}

          {/* ── Coupon Code Input ──────────────────────────────── */}
          <div className="mb-8 p-5 bg-card text-card-foreground border border-border rounded-xl shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                <Tag size={18} className="text-orange-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Have a coupon code?</h3>
                <p className="text-xs text-muted-foreground">Apply your discount code before purchasing</p>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  id="coupon-input"
                  value={couponInput}
                  onChange={e => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Enter coupon code (e.g. LAUNCH50)"
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono tracking-wider"
                  disabled={!!couponResult}
                />
                {couponResult && (
                  <button
                    onClick={clearCoupon}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {!couponResult && (
                <button
                  onClick={() => couponPlanId ? handleApplyCoupon(couponPlanId) : null}
                  disabled={!couponInput.trim() || validating}
                  className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {validating ? <Loader2 size={14} className="animate-spin" /> : null}
                  {validating ? 'Checking...' : 'Apply'}
                </button>
              )}
            </div>

            {!couponResult && !couponError && !couponPlanId && couponInput.trim() && (
              <p className="mt-2 text-xs text-muted-foreground">
                💡 Select a plan below and click "Apply" on the card to apply this coupon
              </p>
            )}

            {/* Coupon success */}
            {couponResult && (
              <div className="mt-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-emerald-600">
                      ✅ {couponResult.code} applied!
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {couponResult.discountType === 'percent'
                        ? `${couponResult.discountValue}% off`
                        : `₹${(couponResult.discountValue / 100).toFixed(0)} off`}
                      {' · '}You save ₹{(couponResult.discountAmount / 100).toFixed(0)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground line-through">
                      ₹{(couponResult.originalPrice / 100).toFixed(0)}
                    </p>
                    <p className="text-lg font-bold text-emerald-600">
                      {couponResult.finalPriceDisplay}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Coupon error */}
            {couponError && (
              <p className="mt-2 text-xs text-destructive font-medium">❌ {couponError}</p>
            )}
          </div>

          {/* Free tier for comparison */}
          <div className="mb-8 p-5 bg-card text-card-foreground border border-border rounded-xl shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <Sparkles size={18} className="text-emerald-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Free Plan</h3>
                <p className="text-xs text-muted-foreground">Your starting point</p>
              </div>
              <span className="ml-auto px-3 py-1 text-xs font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                CURRENT
              </span>
            </div>
            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-3xl font-bold text-foreground">₹0</span>
              <span className="text-sm text-muted-foreground font-medium">/forever</span>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-muted-foreground">
                <Check size={14} className="text-emerald-500" /> 2 AI-generated theses
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <Check size={14} className="text-emerald-500" /> All core features
              </li>
            </ul>
          </div>

          {/* Paid plans grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const Icon = planIcons[plan.id] || Sparkles;
              const colors = planColors[plan.id] || planColors.starter;
              const features = planFeatures[plan.id] || [];
              const isCurrentTier = quota?.tier === plan.id;
              const isPaying = paying === plan.id;
              const hasCoupon = couponResult && couponPlanId === plan.id;
              const displayPrice = hasCoupon ? couponResult!.finalPriceDisplay : plan.priceDisplay;

              return (
                <div
                  key={plan.id}
                  className={`relative bg-card text-card-foreground border rounded-xl shadow-sm overflow-hidden transition-all hover:shadow-lg ${
                    plan.id === 'pro' ? 'border-violet-500/50 ring-2 ring-violet-500/20' : 'border-border'
                  }`}
                >
                  {/* Popular badge */}
                  {plan.id === 'pro' && (
                    <div className="absolute top-0 right-0 px-3 py-1 text-xs font-bold text-white bg-violet-600 rounded-bl-lg">
                      POPULAR
                    </div>
                  )}

                  {/* Gradient header */}
                  <div className={`bg-gradient-to-br ${colors.gradient} px-6 pt-6 pb-4`}>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${colors.badge} border`}>
                      <Icon size={22} />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground font-medium">{plan.description}</p>
                  </div>

                  <div className="px-6 pb-6">
                    {/* Price */}
                    <div className="flex items-baseline gap-2 my-4">
                      {hasCoupon && (
                        <span className="text-lg text-muted-foreground line-through font-medium">{plan.priceDisplay}</span>
                      )}
                      <span className={`text-4xl font-extrabold ${hasCoupon ? 'text-emerald-600' : 'text-foreground'}`}>{displayPrice}</span>
                      <span className="text-sm text-muted-foreground font-medium">/one-time</span>
                    </div>

                    {hasCoupon && (
                      <div className="mb-3 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs text-emerald-600 font-semibold text-center">
                        🎉 {couponResult!.code} — Save ₹{(couponResult!.discountAmount / 100).toFixed(0)}
                      </div>
                    )}

                    {/* Features */}
                    <ul className="space-y-2.5 mb-4">
                      {features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                          <Check size={14} className="text-emerald-500 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {/* Apply coupon to this plan */}
                    {couponInput.trim() && !couponResult && !isCurrentTier && (
                      <button
                        onClick={() => handleApplyCoupon(plan.id)}
                        disabled={validating}
                        className="w-full mb-2 py-1.5 px-3 border border-orange-500/30 text-orange-600 bg-orange-500/5 rounded-lg text-xs font-semibold hover:bg-orange-500/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <Tag size={12} />
                        {validating && couponPlanId === plan.id ? 'Checking...' : `Apply "${couponInput}" to ${plan.name}`}
                      </button>
                    )}

                    {/* CTA */}
                    <button
                      onClick={() => handlePurchase(plan.id)}
                      disabled={isCurrentTier || isPaying}
                      className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white transition-all ${
                        isCurrentTier
                          ? 'bg-muted text-muted-foreground cursor-not-allowed'
                          : isPaying
                          ? 'bg-muted text-muted-foreground cursor-wait'
                          : colors.button
                      }`}
                    >
                      {isCurrentTier ? '✓ Current Plan' : isPaying ? 'Processing...' : `Get ${plan.name}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trust signals */}
          <div className="mt-8 text-center space-y-2">
            <p className="text-xs text-muted-foreground font-medium">
              🔒 Payments secured by Razorpay · 256-bit SSL encryption
            </p>
            <p className="text-xs text-muted-foreground">
              Need help? Contact support at thesium@support.com
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
