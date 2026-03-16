import { useState, useEffect, useRef } from 'react';
import {
  BookOpen, Download, Sparkles, RotateCw, Quote, Check,
  ChevronRight, AlignLeft, Menu, X
} from 'lucide-react';
import Button from '../components/ui/Button';
import AgentCard from '../components/ui/AgentCard';
import ExportModal from '../components/ui/ExportModal';
import { useToast } from '../contexts/ToastContext';

import { useLocation, useNavigate } from 'react-router-dom';
import { logger } from '../utils/logger';

interface ThesisWorkspaceProps {
  thesisConfig?: {
    id: string; // The database ID
    topic: string;
    field: string;
    pages: number;
    progress?: number;
  };
}

interface Section {
  id: string;
  label: string;
  wordCount: number;
  content: string;
}

const DEFAULT_SECTIONS: Section[] = [
  { id: 'title',         label: 'Title Page',       wordCount: 0, content: '' },
  { id: 'abstract',      label: 'Abstract',         wordCount: 0, content: '' },
  { id: 'toc',           label: 'Table of Contents', wordCount: 0, content: '' },
  { id: 'introduction',  label: 'Introduction',     wordCount: 0, content: '' },
  { id: 'literature',    label: 'Literature Review', wordCount: 0, content: '' },
  { id: 'methodology',   label: 'Methodology',      wordCount: 0, content: '' },
  { id: 'results',       label: 'Results',           wordCount: 0, content: '' },
  { id: 'discussion',    label: 'Discussion',        wordCount: 0, content: '' },
  { id: 'conclusion',    label: 'Conclusion',        wordCount: 0, content: '' },
  { id: 'references',    label: 'References',        wordCount: 0, content: '' },
];

const AGENTS = [
  { name: 'Topic Analyst',       status: 'completed' as const, task: 'Topic analysis complete' },
  { name: 'Research Planner',    status: 'completed' as const, task: 'Outline and structure ready' },
  { name: 'Literature Review AI', status: 'completed' as const, task: '94 sources synthesized' },
  { name: 'Writer AI',           status: 'completed' as const, task: 'All sections drafted' },
  { name: 'Reviewer AI',         status: 'completed' as const, task: 'Review and edits applied' },
  { name: 'Citation AI',         status: 'completed' as const, task: 'Bibliography formatted (APA)' },
];

export default function ThesisWorkspace({ thesisConfig: propConfig }: ThesisWorkspaceProps) {
  const { success } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const thesisConfig = propConfig || location.state?.thesisConfig;

  const thesisId = thesisConfig?.id;
  const topic = thesisConfig?.topic ?? 'Untitled Thesis';
  const [sections, setSections]         = useState<Section[]>(DEFAULT_SECTIONS);
  const [activeId, setActiveId]         = useState('abstract');
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [exportOpen, setExportOpen]     = useState(false);
  const [generating, setGenerating]     = useState<string | null>(null);
  
  // Ref for debouncing auto-save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!thesisId) return;
    fetch(`/api/theses/${thesisId}/sections`)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          setSections(data);
        }
      })
      .catch(e => logger.error({ err: e }, "Failed to load sections from DB"));
  }, [thesisId]);

  const active = sections.find(s => s.id === activeId)!;
  const totalWords = sections.reduce((a, s) => a + s.wordCount, 0);
  const doneCount  = sections.filter(s => s.wordCount > 100).length;

  const handleContentChange = (val: string) => {
    const newWordCount = val.split(/\s+/).filter(Boolean).length;
    
    // Optimistic UI update
    setSections(prev => prev.map(s => s.id === activeId ? { ...s, content: val, wordCount: newWordCount } : s));

    // Debounced Auto-Save to DB
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (!thesisId) return;
      fetch(`/api/theses/${thesisId}/sections/${activeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: val, wordCount: newWordCount })
      }).catch(e => logger.error({ err: e }, "Auto-save failed"));
    }, 1000);
  };

  const handleGenerate = async () => {
    if (!thesisId) return;
    setGenerating(activeId);
    
    try {
      const res = await fetch(`/api/theses/${thesisId}/sections/${activeId}/generate`, {
        method: 'POST'
      });
      
      if (!res.ok) throw new Error("API Generation Failed");
      
      const updatedSection = await res.json();
      
      // Update UI with newly generated, securely saved content
      setSections(prev => prev.map(s => s.id === activeId ? { 
        ...s, 
        content: updatedSection.content, 
        wordCount: updatedSection.wordCount 
      } : s));
      
      success(`${active?.label ?? 'Section'} generated successfully`, 'Content Added');
    } catch (err) {
      logger.error({ err }, "Generation Failed");
      success("OpenRouter AI Error. Could not generate section.", "Generation Failed");
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* ─── Left Sidebar ─── */}
      <aside className={`
        ${sidebarOpen ? 'fixed inset-0 z-40' : 'hidden'}
        lg:flex lg:static lg:z-auto
        w-64 h-full bg-card border-r border-border flex flex-col flex-shrink-0
      `}>
        {/* Mobile close */}
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

        {/* Stats strip */}
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

        {/* Sections nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="px-2 pt-2 pb-2 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Document Structure</p>
          {sections.map((s) => {
            const isActive = s.id === activeId;
            const isDone   = s.wordCount > 100;
            return (
              <button
                key={s.id}
                onClick={() => { setActiveId(s.id); setSidebarOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <AlignLeft size={14} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                  <span className="truncate">{s.label}</span>
                </div>
                {isDone && (
                  <Check size={14} className={isActive ? 'text-primary' : 'text-teal-600 dark:text-teal-400'} />
                )}
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

      {/* Mobile sidebar overlay backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden animate-in fade-in" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ─── Main ─── */}
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
            <span>{thesisConfig?.pages ?? 60} pages</span>
          </div>
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
                <p className="text-sm font-medium text-muted-foreground">{active.wordCount.toLocaleString()} words</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating === activeId}
                  className="font-semibold shadow-sm"
                >
                  {generating === activeId ? (
                    <><Sparkles size={14} className="animate-spin mr-1.5" /> Generating…</>
                  ) : (
                    <><Sparkles size={14} className="mr-1.5" /> Generate</>
                  )}
                </Button>
                <Button variant="outline" size="sm" className="font-semibold bg-background">
                  <RotateCw size={13} className="mr-1.5" /> Improve
                </Button>
                <Button variant="outline" size="sm" className="font-semibold bg-background">Rewrite</Button>
                <Button variant="outline" size="sm" className="font-semibold bg-background">
                  <Quote size={13} className="mr-1.5" /> Cite
                </Button>
              </div>
            </div>

            {/* Editor */}
            <div className="bg-background border border-border rounded-xl p-6 md:p-10 min-h-[550px] shadow-sm hover:border-border/80 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent">
              <textarea
                value={active.content}
                onChange={e => handleContentChange(e.target.value)}
                placeholder={`Start writing the ${active.label} section or click 'Generate' to let the AI Writer create it for you…`}
                className="thesis-editor w-full min-h-[500px] bg-transparent text-foreground placeholder:text-muted-foreground/60 focus:outline-none resize-vertical leading-loose text-sm md:text-base font-medium"
              />
            </div>

            {/* Bottom nav */}
            <div className="flex items-center justify-between mt-6">
              <Button
                variant="ghost"
                size="sm"
                className="font-semibold"
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
                variant="ghost"
                size="sm"
                className="font-semibold"
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

      {/* ─── Right Panel — AI Council ─── */}
      <aside className="hidden xl:flex w-80 flex-col border-l border-border bg-card overflow-y-auto">
        <div className="p-6 border-b border-border">
          <h2 className="text-sm font-bold tracking-tight text-foreground mb-1">AI Council</h2>
          <p className="text-xs font-medium text-muted-foreground">Generation complete</p>
        </div>

        <div className="p-5 space-y-3">
          {AGENTS.map((a, i) => (
            <AgentCard key={i} {...a} index={i} />
          ))}
        </div>

        <div className="p-5 border-t border-border border-b">
          <div className="p-4 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 rounded-xl">
            <p className="text-sm font-bold tracking-tight text-teal-800 dark:text-teal-400 mb-1">✓ Generation Complete</p>
            <p className="text-xs font-medium text-teal-600 dark:text-teal-500/80 leading-relaxed">All sections generated and reviewed. Your thesis is ready for editing and export.</p>
          </div>
        </div>

        <div className="p-6 space-y-3.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-2">Quick Stats</p>
          {[
            { label: 'Total Words',   value: totalWords.toLocaleString() },
            { label: 'Sections',      value: `${doneCount} / ${sections.length}` },
            { label: 'References',    value: '94 sources' },
            { label: 'Citation Style', value: 'APA 7th Ed.' },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">{item.label}</span>
              <span className="font-bold text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      </aside>

      <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} thesisTitle={topic} />
    </div>
  );
}
