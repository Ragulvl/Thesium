import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen, Download, Sparkles, Check,
  ChevronRight, AlignLeft, Menu, X,
  FileText, BarChart3, Loader2, ShieldCheck
} from 'lucide-react';
import Button from '../components/ui/Button';
import ExportModal from '../components/ui/ExportModal';
import { useToast } from '../contexts/ToastContext';
import { useGoogleAuth } from '../contexts/GoogleAuthContext';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { logger } from '../utils/logger';

interface Section {
  id: string;
  label: string;
  wordCount: number;
  content: string;
}

interface ThesisData {
  id: string;
  title: string;
  field: string;
  targetPages: number;
  auditReport?: AuditReport | null;
}

interface AuditIssue {
  category: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  affectedSections: string[];
  suggestion: string;
}

interface AuditReport {
  generatedAt: string;
  overallScore: 'excellent' | 'good' | 'fair' | 'poor';
  issues: AuditIssue[];
  strengths: string[];
  wordCountBalance: Record<string, number>;
  summary: string;
}

export default function ThesisWorkspace() {
  const { success, error: showError } = useToast();
  const navigate = useNavigate();
  const { id: thesisId } = useParams<{ id: string }>();
  const { getToken: _getToken } = useGoogleAuth(); // kept for compat — not used directly

  const [thesis, setThesis] = useState<ThesisData | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [auditRunning, setAuditRunning] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const autoGenTriggered = useRef(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
  }), []);

  // ── Load thesis + sections from API ──
  useEffect(() => {
    if (!thesisId) { setLoading(false); return; }

    const load = async () => {
      try {
        const headers = getHeaders();

        // Fetch thesis metadata
        const thesesRes = await fetch('/api/theses', { headers, credentials: 'include' });
        const allTheses = await thesesRes.json();
        const found = allTheses.find((t: any) => t.id === thesisId);
        if (found) setThesis(found);

        // Fetch sections (auto-seeds if first visit)
        const secRes = await fetch(`/api/theses/${thesisId}/sections`, { headers, credentials: 'include' });
        const secData = await secRes.json();
        if (secData && secData.length > 0) {
          setSections(secData.map((s: any) => ({
            ...s,
            wordCount: s.wordCount ?? 0,
            content: s.content ?? '',
          })));
          setActiveId(secData[0].id);
        }

        // Load existing audit report if one was previously run
        const auditRes = await fetch(`/api/theses/${thesisId}/audit`, { headers, credentials: 'include' });
        if (auditRes.ok) {
          const report = await auditRes.json();
          setAuditReport(report);
        }
      } catch (e) {
        logger.error({ err: e }, 'Failed to load workspace');
        showError('Failed to load thesis workspace');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [thesisId, getHeaders, showError]);

  // ── Auto-generate all empty sections when ?auto=1 ──
  useEffect(() => {
    if (autoGenTriggered.current || loading || sections.length === 0) return;
    if (searchParams.get('auto') !== '1') return;

    autoGenTriggered.current = true;
    // Remove ?auto=1 from URL
    setSearchParams({}, { replace: true });

    // Trigger generation for all empty sections (in order)
    const emptySections = sections.filter(s => (s.wordCount ?? 0) === 0);

    for (const sec of emptySections) {
      handleGenerate(sec.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sections, searchParams, setSearchParams]);

  const topic = thesis?.title ?? 'Untitled Thesis';
  const targetPages = thesis?.targetPages ?? 60;

  const active = sections.find(s => s.id === activeId);
  const totalWords = sections.reduce((a, s) => a + (s.wordCount ?? 0), 0);
  const doneCount = sections.filter(s => (s.wordCount ?? 0) > 100).length;

  // ── Auto-save on edit ──
  const handleContentChange = (val: string) => {
    const newWordCount = val.split(/\s+/).filter(Boolean).length;
    setSections(prev => prev.map(s =>
      s.id === activeId ? { ...s, content: val, wordCount: newWordCount } : s
    ));

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!thesisId) return;
      fetch(`/api/theses/${thesisId}/sections/${activeId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ content: val, wordCount: newWordCount }),
      }).catch(e => logger.error({ err: e }, 'Auto-save failed'));
    }, 1000);
  };

  // ── Poll a job's status until done (lightweight — no section content in response) ──
  const pollJobUntilDone = useCallback(async (jobId: string): Promise<'completed' | 'failed' | 'timeout'> => {
    const maxPolls = 120; // 120 × 3s = 6 minutes max
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const headers = getHeaders();
        const res = await fetch(`/api/jobs/${jobId}`, { headers, credentials: 'include' });
        if (!res.ok) continue;
        const { state } = await res.json();
        if (state === 'completed') return 'completed';
        if (state === 'failed') return 'failed';
      } catch (e) {
        logger.warn({ err: e, jobId }, 'Job poll failed — retrying');
      }
    }
    return 'timeout';
  }, [getHeaders]);

  // ── Fetch a single section by ID from the API ──
  const fetchSection = useCallback(async (sectionId: string): Promise<Section | null> => {
    try {
      const headers = getHeaders();
      const res = await fetch(`/api/theses/${thesisId}/sections`, { headers, credentials: 'include' });
      const all: any[] = await res.json();
      const sec = all.find((s: any) => s.id === sectionId);
      if (!sec) return null;
      return { ...sec, wordCount: sec.wordCount ?? 0, content: sec.content ?? '' };
    } catch {
      return null;
    }
  }, [thesisId, getHeaders]);

  // ── Generate a single section ──
  const handleGenerate = async (sectionId: string) => {
    if (!thesisId || generating.has(sectionId)) return;

    setGenerating(prev => new Set(prev).add(sectionId));
    const sec = sections.find(s => s.id === sectionId);
    const label = sec?.label ?? sectionId;

    try {
      // 1. Queue the job
      const res = await fetch(`/api/theses/${thesisId}/sections/${sectionId}/generate`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to queue generation');
      const { jobId } = await res.json();

      // 2. Poll lightweight job status instead of all sections
      const result = await pollJobUntilDone(jobId);

      if (result === 'completed') {
        const updated = await fetchSection(sectionId);
        if (updated) {
          setSections(prev => prev.map(s => s.id === sectionId ? updated : s));
          success(`${label} generated successfully`, 'Content Ready');
        }
      } else if (result === 'failed') {
        showError(`${label} generation failed. Please try again.`, 'Error');
      } else {
        showError(`${label} generation timed out. Check back shortly.`, 'Timeout');
      }
    } catch (err: any) {
      logger.error({ err, sectionId }, 'Generation failed');
      showError(`Failed to generate ${label}`, 'Error');
    } finally {
      setGenerating(prev => {
        const next = new Set(prev);
        next.delete(sectionId);
        return next;
      });
    }
  };

  // ── Generate all empty sections via backend bulk endpoint ──
  const handleGenerateAll = async () => {
    if (!thesisId) return;

    const emptySections = sections.filter(s => (s.wordCount ?? 0) < 100);
    if (emptySections.length === 0) {
      success('All sections are already generated!', 'Nothing to do');
      return;
    }

    try {
      // Use the backend generate-all endpoint — server queues all jobs in correct order
      const res = await fetch(`/api/theses/${thesisId}/generate-all`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || 'Failed to queue all sections');
      }
      const { sections: queuedIds } = await res.json();

      // Mark all empty sections as generating
      const emptySet = new Set<string>(queuedIds);
      setGenerating(emptySet);

      // Poll each section concurrently (lightweight job status)
      // We re-use handleGenerate's polling logic via the job status endpoint
      // but fire them all at once instead of sequentially
      await Promise.all(
        emptySections
          .filter(s => emptySet.has(s.id))
          .map(async (sec) => {
            // Small delay per section to avoid thundering herd on status endpoint
            await new Promise(r => setTimeout(r, emptySections.indexOf(sec) * 500));
            const updated = await fetchSection(sec.id);
            if (updated && (updated.wordCount ?? 0) > 0) {
              setSections(prev => prev.map(s => s.id === sec.id ? updated : s));
            }
          })
      );

      success('Full thesis generation queued!', 'Generating…');
    } catch (err: any) {
      logger.error({ err }, 'Generate all failed');
      showError(err.message || 'Failed to start generation', 'Error');
    } finally {
      setGenerating(new Set());
    }
  };

  // ── Run Whole-Thesis Audit ──
  const handleRunAudit = async () => {
    if (!thesisId || auditRunning) return;
    setAuditRunning(true);
    try {
      // 1. Queue the audit job
      const res = await fetch(`/api/theses/${thesisId}/audit`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to start audit');
      }
      const { jobId } = await res.json();

      // 2. Poll job status (reuse existing poller — audit can take 60-120s)
      const result = await pollJobUntilDone(jobId);
      if (result === 'failed') { showError('Audit failed. Please try again.', 'Error'); return; }
      if (result === 'timeout') { showError('Audit timed out. Try again shortly.', 'Timeout'); return; }

      // 3. Fetch the stored report
      const reportRes = await fetch(`/api/theses/${thesisId}/audit`, { headers: getHeaders(), credentials: 'include' });
      if (!reportRes.ok) throw new Error('Failed to fetch audit report');
      const report = await reportRes.json();
      setAuditReport(report);
      success('Thesis audit complete!', 'Audit Done');
    } catch (err: any) {
      logger.error({ err }, 'Audit failed');
      showError(err.message || 'Audit failed', 'Error');
    } finally {
      setAuditRunning(false);
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-3">
          <Sparkles size={24} className="animate-spin text-primary mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!thesisId || !active) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-3">
          <FileText size={32} className="text-muted-foreground mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">No thesis found.</p>
          <Button variant="primary" size="sm" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const isAnyGenerating = generating.size > 0;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* ─── Left Sidebar — Document Structure ─── */}
      <aside className={`
        ${sidebarOpen ? 'fixed inset-0 z-40' : 'hidden'}
        lg:flex lg:static lg:z-auto
        w-64 h-full bg-card border-r border-border flex flex-col flex-shrink-0
      `}>
        <div className="lg:hidden absolute top-4 right-4 z-50">
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Brand */}
        <div className="px-5 py-5 border-b border-border">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-3 group">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
              <BookOpen size={13} className="text-primary-foreground" />
            </div>
            <span className="font-bold text-sm tracking-tight text-foreground group-hover:text-primary transition-colors">Thesium</span>
          </button>
          <p className="text-[11px] font-medium text-muted-foreground mt-3 leading-snug truncate" title={topic}>{topic}</p>
        </div>

        {/* Stats */}
        <div className="px-4 py-3 border-b border-border grid grid-cols-2 gap-2">
          <div className="bg-secondary/50 rounded-lg p-2 text-center border border-border/50">
            <div className="text-sm font-extrabold text-primary">{totalWords.toLocaleString()}</div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground mt-0.5 tracking-wider">Words</div>
          </div>
          <div className="bg-secondary/50 rounded-lg p-2 text-center border border-border/50">
            <div className="text-sm font-extrabold text-foreground">{doneCount}/{sections.length}</div>
            <div className="text-[10px] uppercase font-bold text-muted-foreground mt-0.5 tracking-wider">Sections</div>
          </div>
        </div>

        {/* Section nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="px-2 pt-2 pb-2 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Sections</p>
          {sections.map(s => {
            const isActive = s.id === activeId;
            const isDone = (s.wordCount ?? 0) > 100;
            const isGen = generating.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => { setActiveId(s.id); setSidebarOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-all ${
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <AlignLeft size={14} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                  <span className="truncate">{s.label}</span>
                </div>
                {isGen ? (
                  <Loader2 size={14} className="animate-spin text-primary flex-shrink-0" />
                ) : isDone ? (
                  <Check size={14} className={isActive ? 'text-primary' : 'text-teal-600 dark:text-teal-400'} />
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Export */}
        <div className="p-4 border-t border-border">
          <Button variant="primary" size="md" className="w-full font-semibold" onClick={() => setExportOpen(true)}>
            <Download size={14} className="mr-2" />
            Export Thesis
          </Button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden animate-in fade-in" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ─── Main Editor ─── */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-transparent">
        {/* Top bar */}
        <div className="bg-background/80 backdrop-blur-md border-b border-border px-6 py-3.5 flex items-center gap-4 flex-shrink-0 z-10">
          <button className="lg:hidden p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground rounded-md transition-colors" onClick={() => setSidebarOpen(true)}>
            <Menu size={18} />
          </button>
          <ChevronRight size={14} className="text-muted-foreground hidden lg:block" />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-foreground truncate">{topic}</h1>
          </div>
          <div className="hidden md:flex items-center gap-2.5 text-xs font-medium text-muted-foreground">
            <span>{totalWords.toLocaleString()} words</span>
            <span className="text-border">|</span>
            <span>{targetPages} pages</span>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerateAll}
            className="ml-2 font-semibold"
            disabled={isAnyGenerating || doneCount === sections.length}
          >
            {isAnyGenerating ? (
              <><Loader2 size={13} className="mr-1.5 animate-spin" /> Generating...</>
            ) : (
              <><Sparkles size={13} className="mr-1.5" /> Generate All</>
            )}
          </Button>

          {/* Audit button — enabled when ≥2 sections have content */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunAudit}
            className="ml-2 font-semibold"
            disabled={isAnyGenerating || auditRunning || doneCount < 2}
            title={doneCount < 2 ? 'Generate at least 2 sections to enable audit' : 'Run whole-thesis quality audit'}
          >
            {auditRunning ? (
              <><Loader2 size={13} className="mr-1.5 animate-spin" /> Auditing...</>
            ) : (
              <><ShieldCheck size={13} className="mr-1.5" /> Audit</>
            )}
          </Button>

          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="ml-2 font-semibold">
            <Download size={13} className="mr-1.5" />
            Export
          </Button>
        </div>

        {/* Editor area */}
        <div className="flex-1 overflow-auto p-6 lg:p-10">
          <div className="max-w-4xl mx-auto">
            {/* Section header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground mb-1.5">{active.label}</h2>
                <p className="text-sm font-medium text-muted-foreground">
                  {(active.wordCount ?? 0).toLocaleString()} words
                  {generating.has(active.id) && (
                    <span className="ml-2 text-primary font-semibold">
                      <Loader2 size={12} className="inline animate-spin mr-1" />
                      AI is generating…
                    </span>
                  )}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleGenerate(active.id)}
                disabled={generating.has(active.id)}
                className="font-semibold shadow-sm"
              >
                {generating.has(active.id) ? (
                  <><Loader2 size={14} className="animate-spin mr-1.5" /> Generating…</>
                ) : (
                  <><Sparkles size={14} className="mr-1.5" /> Generate</>
                )}
              </Button>
            </div>

            {/* Editor */}
            <div className="bg-background border border-border rounded-xl p-6 md:p-10 min-h-[550px] shadow-sm hover:border-border/80 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent">
              <textarea
                value={active.content ?? ''}
                onChange={e => handleContentChange(e.target.value)}
                placeholder={`Start writing the ${active.label} section or click 'Generate' to let AI create it…`}
                className="thesis-editor w-full min-h-[500px] bg-transparent text-foreground placeholder:text-muted-foreground/60 focus:outline-none resize-vertical leading-loose text-sm md:text-base font-medium"
                disabled={generating.has(active.id)}
              />
            </div>

            {/* Bottom nav */}
            <div className="flex items-center justify-between mt-6">
              <Button
                variant="ghost" size="sm" className="font-semibold"
                onClick={() => {
                  const idx = sections.findIndex(s => s.id === activeId);
                  if (idx > 0) setActiveId(sections[idx - 1].id);
                }}
                disabled={sections.findIndex(s => s.id === activeId) === 0}
              >
                ← Previous
              </Button>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                {sections.findIndex(s => s.id === activeId) + 1} / {sections.length}
              </span>
              <Button
                variant="ghost" size="sm" className="font-semibold"
                onClick={() => {
                  const idx = sections.findIndex(s => s.id === activeId);
                  if (idx < sections.length - 1) setActiveId(sections[idx + 1].id);
                }}
                disabled={sections.findIndex(s => s.id === activeId) === sections.length - 1}
              >
                Next →
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* ─── Right Panel — Thesis Info ─── */}
      <aside className="hidden xl:flex w-72 flex-col border-l border-border bg-card overflow-y-auto">
        <div className="p-6 border-b border-border">
          <h2 className="text-sm font-bold tracking-tight text-foreground mb-1">Thesis Info</h2>
          <p className="text-xs font-medium text-muted-foreground truncate" title={topic}>{topic}</p>
        </div>

        {/* Progress */}
        <div className="p-5 border-b border-border space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-muted-foreground">Section Progress</span>
              <span className="font-bold text-foreground">{doneCount}/{sections.length}</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${sections.length > 0 ? (doneCount / sections.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          {doneCount === sections.length && sections.length > 0 && (
            <div className="p-3 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 rounded-lg">
              <p className="text-xs font-bold text-teal-800 dark:text-teal-400">✓ All sections complete</p>
              <p className="text-[11px] text-teal-600 dark:text-teal-500/80 mt-0.5">
                {auditReport ? 'Audit ran — see report below.' : 'Click “Audit” to run a full quality check.'}
              </p>
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="p-6 space-y-3.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-2">Quick Stats</p>
          {[
            { label: 'Total Words', value: totalWords.toLocaleString(), icon: FileText },
            { label: 'Sections Done', value: `${doneCount} / ${sections.length}`, icon: BarChart3 },
            { label: 'Target Pages', value: targetPages.toString(), icon: BookOpen },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-semibold text-muted-foreground">
                <item.icon size={12} />
                {item.label}
              </span>
              <span className="font-bold text-foreground">{item.value}</span>
            </div>
          ))}
        </div>

        {/* Section list */}
        <div className="p-5 border-t border-border space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-2">Sections</p>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                s.id === activeId ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="truncate font-medium">{s.label}</span>
              {generating.has(s.id) ? (
                <Loader2 size={12} className="animate-spin text-primary flex-shrink-0" />
              ) : (s.wordCount ?? 0) > 100 ? (
                <Check size={12} className="text-teal-500 flex-shrink-0" />
              ) : (
                <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">{s.wordCount ?? 0}w</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Audit Report Panel ── */}
        {auditReport && (
          <div className="p-5 border-t border-border">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold flex items-center gap-1.5">
                <ShieldCheck size={10} /> Thesis Audit
              </p>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded capitalize ${
                auditReport.overallScore === 'excellent' ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400' :
                auditReport.overallScore === 'good'      ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
                auditReport.overallScore === 'fair'      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                                                           'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
              }`}>
                {auditReport.overallScore}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">{auditReport.summary}</p>
            {auditReport.issues.length === 0 ? (
              <div className="p-2 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 rounded-lg">
                <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-400">✓ No issues found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {auditReport.issues.slice(0, 4).map((issue, i) => (
                  <div key={i} className={`p-2 rounded-lg border ${
                    issue.severity === 'high'   ? 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20' :
                    issue.severity === 'medium' ? 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20' :
                                                  'bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20'
                  }`}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5 capitalize">
                      {issue.category} &middot; {issue.severity}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{issue.description}</p>
                    {issue.suggestion && (
                      <p className="text-[10px] font-medium text-foreground/70 mt-1 italic">{issue.suggestion}</p>
                    )}
                  </div>
                ))}
                {auditReport.issues.length > 4 && (
                  <p className="text-[10px] text-muted-foreground text-center">+{auditReport.issues.length - 4} more issues</p>
                )}
              </div>
            )}
            <button
              onClick={handleRunAudit}
              disabled={auditRunning}
              className="mt-3 w-full text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {auditRunning ? 'Running audit…' : 'Re-run audit'}
            </button>
          </div>
        )}
      </aside>

      <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} thesisTitle={topic} thesisId={thesisId} />
    </div>
  );
}
