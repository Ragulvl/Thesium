import { FileText, PlusCircle, Sparkles, TrendingUp, Clock, BookOpen, MoreHorizontal, Download, Menu } from 'lucide-react';

import Button from '../components/ui/Button';
import ThesisCard from '../components/ui/ThesisCard';
import ExportModal from '../components/ui/ExportModal';
import { ThesisCardSkeleton, DashboardStatSkeleton } from '../components/ui/Skeleton';
import { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useGoogleAuth } from '../contexts/GoogleAuthContext';
import { logger } from '../utils/logger';

export interface ThesisItem {
  id: number;
  title: string;
  field: string;
  lastEdited: string;
  progress: number;
  targetPages: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { success, info } = useToast();
  const { user } = useGoogleAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTitle, setExportTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [theses, setTheses] = useState<ThesisItem[]>([]);
  const { setMobileSidebarOpen } = useOutletContext<{ setMobileSidebarOpen: (o: boolean) => void }>();

  useEffect(() => {
    if (!user?.sub) return;

    fetch(`/api/theses/${user.sub}`)
      .then((res) => res.json())
      .then((data) => {
        setTheses(data);
        setLoading(false);
      })
      .catch((err) => {
        logger.error({ err }, 'Failed to fetch theses');
        setLoading(false);
      });
  }, [user?.sub]);

  const stats = [
    { label: 'Active Projects', value: theses.length.toString(), icon: FileText, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Pages Written',   value: theses.reduce((acc, t) => acc + (t.targetPages || 60), 0).toString(), icon: BookOpen, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { label: 'Avg. Completion', value: theses.length ? `${Math.round(theses.reduce((a, t) => a + t.progress, 0) / theses.length)}%` : '0%', icon: TrendingUp, color: 'text-teal-500', bg: 'bg-teal-500/10' },
    { label: 'AI Generations',  value: theses.length ? (theses.length * 6).toString() : '0', icon: Sparkles, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ];

  const handleDownload = (title: string) => {
    setExportTitle(title);
    setExportOpen(true);
    info('Preparing export options…', 'Download');
  };

  const handleOpen = (title: string) => {
    success(`Opened "${title.slice(0, 40)}…"`, 'Thesis Opened');
    navigate('/workspace');
  };

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
              <h1 className="text-xl font-bold tracking-tight text-foreground">Dashboard</h1>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">Welcome back, {user?.name || 'Researcher'}</p>
            </div>
          </div>
          <Button variant="primary" size="md" onClick={() => navigate('/new-thesis')}>
            <PlusCircle size={16} />
            New Thesis
          </Button>
        </div>

        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <DashboardStatSkeleton key={i} />)
              : stats.map((s, i) => {
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
                })
            }
          </div>

          {/* Recent */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-foreground">My Theses</h2>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">{theses.length} project{theses.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="hidden sm:flex">
                  <Clock size={14} className="mr-1.5" /> Recent
                </Button>
                <Button variant="outline" size="sm" className="px-2">
                  <MoreHorizontal size={14} />
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 3 }).map((_, i) => <ThesisCardSkeleton key={i} />)}
              </div>
            ) : theses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {theses.map(thesis => (
                  <ThesisCard
                    key={thesis.id}
                    {...thesis}
                    onOpen={() => handleOpen(thesis.title)}
                    onDownload={() => handleDownload(thesis.title)}
                  />
                ))}
                {/* Add new card */}
                <button
                  onClick={() => navigate('/new-thesis')}
                  className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-primary/50 hover:bg-accent transition-all duration-200 min-h-[260px] group"
                >
                  <div className="w-12 h-12 rounded-lg bg-secondary group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                    <PlusCircle size={22} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">New Thesis</p>
                    <p className="text-xs mt-1 text-muted-foreground font-medium">Start a new AI-powered thesis</p>
                  </div>
                </button>
              </div>
            ) : (
              <div className="bg-card text-card-foreground border border-border rounded-xl p-16 text-center shadow-sm">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText size={28} className="text-primary" />
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground mb-2">No theses yet</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">Start your first thesis project and let the AI council handle the heavy lifting for you.</p>
                <Button variant="primary" onClick={() => navigate('/new-thesis')}>
                  <Sparkles size={16} className="mr-2" />
                  Create First Thesis
                </Button>
              </div>
            )}
          </div>

          {/* Download tip */}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Download size={16} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold tracking-tight text-foreground">Ready to export?</p>
              <p className="text-xs text-muted-foreground font-medium">Open any thesis and click "Export" to download your formatted PDF or DOCX.</p>
            </div>
          </div>
        </div>
      </main>

      <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} thesisTitle={exportTitle} />
    </div>
  );
}
