import { useState, useEffect } from 'react';
import { BarChart3, Zap, FileText, TrendingUp, Clock, Sparkles, Menu, CreditCard } from 'lucide-react';
import { useGoogleAuth } from '../contexts/GoogleAuthContext';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { logger } from '../utils/logger';

interface UsageData {
  totalCostUsd: number;
  totalTokens: number;
  totalCalls: number;
  thesisCount: number;
  freeThesesRemaining: number;
  recentUsage: {
    id: string;
    costUsd: number;
    tokens: number;
    model: string | null;
    stage: string | null;
    createdAt: string;
    thesis: { title: string } | null;
  }[];
}

interface QuotaData {
  canGenerate: boolean;
  thesisCount: number;
  freeLimit: number;
  remaining: number;
  tier: string;
}

export default function UsageDashboard() {
  const { getToken } = useGoogleAuth();
  const { setMobileSidebarOpen } = useOutletContext<{ setMobileSidebarOpen: (o: boolean) => void }>();
  const navigate = useNavigate();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const headers = { 'Authorization': `Bearer ${token}` };

    Promise.all([
      fetch('/api/usage', { headers }).then(r => r.json()),
      fetch('/api/usage/quota', { headers }).then(r => r.json()),
    ])
      .then(([usageData, quotaData]) => {
        setUsage(usageData);
        setQuota(quotaData);
      })
      .catch(err => logger.error({ err }, 'Failed to fetch usage data'))
      .finally(() => setLoading(false));
  }, [getToken]);

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const tierColors: Record<string, string> = {
    free: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    paid: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    unlimited: 'text-violet-500 bg-violet-500/10 border-violet-500/20',
  };

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-transparent">
          <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4 flex items-center gap-3">
            <button className="lg:hidden p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground rounded-md transition-colors" onClick={() => setMobileSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">Usage & Billing</h1>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">Loading...</p>
            </div>
          </div>
          <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  const stats = [
    {
      label: 'Current Plan',
      value: (quota?.tier || 'free').charAt(0).toUpperCase() + (quota?.tier || 'free').slice(1),
      icon: CreditCard,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
    },
    {
      label: 'Theses Generated',
      value: String(usage?.thesisCount || 0),
      icon: FileText,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Total AI Cost',
      value: formatCost(usage?.totalCostUsd || 0),
      icon: TrendingUp,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      label: 'AI Calls Made',
      value: String(usage?.totalCalls || 0),
      icon: Zap,
      color: 'text-teal-500',
      bg: 'bg-teal-500/10',
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-transparent">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground rounded-md transition-colors" onClick={() => setMobileSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">Usage & Billing</h1>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">Monitor your AI usage and plan</p>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="bg-card text-card-foreground border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className={`w-10 h-10 ${s.bg} rounded-lg flex items-center justify-center mb-3`}>
                    <Icon size={18} className={s.color} />
                  </div>
                  <div className="text-2xl font-bold tracking-tight mb-1 leading-none">{s.value}</div>
                  <div className="text-xs text-muted-foreground font-medium">{s.label}</div>
                </div>
              );
            })}
          </div>

          {/* Quota Card */}
          {quota && (
            <div className="bg-card text-card-foreground border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Sparkles size={18} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold tracking-tight">Generation Quota</h2>
                    <p className="text-xs text-muted-foreground font-medium">Your thesis generation limits</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${tierColors[quota.tier] || tierColors.free}`}>
                  {quota.tier.toUpperCase()}
                </span>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">
                    {quota.thesisCount} of {quota.freeLimit} theses used
                  </span>
                  <span className={`font-semibold ${quota.canGenerate ? 'text-emerald-500' : 'text-destructive'}`}>
                    {quota.remaining} remaining
                  </span>
                </div>
                <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      quota.remaining === 0
                        ? 'bg-destructive'
                        : quota.remaining === 1
                        ? 'bg-amber-500'
                        : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(100, (quota.thesisCount / quota.freeLimit) * 100)}%` }}
                  />
                </div>
              </div>

              {!quota.canGenerate && (
                <div className="mt-4 p-3 bg-destructive/5 border border-destructive/20 rounded-lg flex items-center justify-between">
                  <p className="text-sm text-destructive font-medium">
                    ⚠️ You've reached your limit. Upgrade to continue.
                  </p>
                  <button
                    onClick={() => navigate('/pricing')}
                    className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors flex-shrink-0 ml-3"
                  >
                    Upgrade
                  </button>
                </div>
              )}

              {quota.canGenerate && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => navigate('/pricing')}
                    className="px-4 py-1.5 bg-secondary text-secondary-foreground text-xs font-medium rounded-lg hover:bg-secondary/80 transition-colors"
                  >
                    View Plans
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Recent Activity */}
          <div className="bg-card text-card-foreground border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Clock size={16} className="text-blue-500" />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Recent Activity</h2>
                <p className="text-xs text-muted-foreground font-medium">Your latest AI generation usage</p>
              </div>
            </div>

            {usage && usage.recentUsage.length > 0 ? (
              <div className="divide-y divide-border">
                {usage.recentUsage.map((entry) => (
                  <div key={entry.id} className="px-6 py-3.5 flex items-center justify-between hover:bg-accent/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BarChart3 size={14} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {entry.thesis?.title || 'Unknown thesis'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.stage?.replace('subsection:', '') || 'Generation'} · {entry.model?.split('/').pop() || 'AI'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-sm font-semibold text-foreground">{formatCost(entry.costUsd)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-12 text-center">
                <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center mx-auto mb-3">
                  <BarChart3 size={20} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">No usage yet</p>
                <p className="text-xs text-muted-foreground">Generate your first thesis to see activity here</p>
              </div>
            )}
          </div>

          {/* Cost breakdown tip */}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <TrendingUp size={16} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold tracking-tight text-foreground">Cost Optimization</p>
              <p className="text-xs text-muted-foreground font-medium">
                Each thesis uses ~4 AI calls per subsection. Typical thesis costs $0.15–$0.50 depending on length and complexity.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
