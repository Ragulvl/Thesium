import { useState } from 'react';
import { Sparkles, Menu, Loader2, GraduationCap, ChevronDown } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useGoogleAuth } from '../contexts/GoogleAuthContext';
import { useToast } from '../contexts/ToastContext';

const FIELDS = [
  'Computer Science', 'Business', 'Medicine', 'Engineering',
  'Social Sciences', 'Education', 'Psychology', 'Other'
];

const PAGE_OPTIONS = [20, 40, 60, 80, 100, 120];

export default function NewThesis() {
  const navigate = useNavigate();
  const { setMobileSidebarOpen } = useOutletContext<{ setMobileSidebarOpen: (o: boolean) => void }>();
  const { getToken } = useGoogleAuth();
  const { success, error: showError } = useToast();

  const [topic, setTopic] = useState('');
  const [field, setField] = useState('Computer Science');
  const [pages, setPages] = useState(60);
  const [creating, setCreating] = useState(false);

  const canSubmit = topic.trim().length > 5 && field !== '' && !creating;

  const handleCreate = async () => {
    if (!canSubmit) return;
    setCreating(true);

    try {
      const token = getToken();
      const res = await fetch('/api/theses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: topic.trim(),
          field,
          targetPages: pages,
          researchQuestion: 'AI Generated Focus',
          status: 'draft',
          progress: 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create thesis');
      }

      const thesis = await res.json();
      success('Thesis created! Generation starting...', 'Success');
      navigate(`/workspace/${thesis.id}?auto=1`);
    } catch (err: any) {
      showError(err.message || 'Failed to create thesis', 'Error');
      setCreating(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <main className="flex-1 overflow-auto">
        {/* Mobile menu */}
        <button
          className="lg:hidden fixed top-4 left-4 z-50 p-2 text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg transition-colors"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <Menu size={20} />
        </button>

        {/* Centered content */}
        <div className="min-h-full flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-xl">

            {/* Header */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-5">
                <GraduationCap size={28} className="text-primary" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Create your thesis
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">
                Enter your topic and we'll generate a complete academic thesis with AI.
              </p>
            </div>

            {/* Form Card */}
            <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-xl shadow-black/5">

              {/* Topic */}
              <div className="mb-6">
                <label htmlFor="thesis-topic" className="block text-sm font-semibold text-foreground mb-2">
                  Thesis Topic
                </label>
                <textarea
                  id="thesis-topic"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g., Impact of Artificial Intelligence on Healthcare Diagnostics"
                  rows={3}
                  className="w-full px-4 py-3 bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all resize-none"
                  disabled={creating}
                  autoFocus
                />
                {topic.trim().length > 0 && topic.trim().length <= 5 && (
                  <p className="mt-1.5 text-xs text-amber-500 font-medium">
                    Please enter a more descriptive topic
                  </p>
                )}
              </div>

              {/* Field + Pages — side by side */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div>
                  <label htmlFor="thesis-field" className="block text-sm font-semibold text-foreground mb-2">
                    Field
                  </label>
                  <div className="relative">
                    <select
                      id="thesis-field"
                      value={field}
                      onChange={e => setField(e.target.value)}
                      className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer appearance-none"
                      disabled={creating}
                    >
                      {FIELDS.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label htmlFor="thesis-pages" className="block text-sm font-semibold text-foreground mb-2">
                    Pages
                  </label>
                  <div className="relative">
                    <select
                      id="thesis-pages"
                      value={pages}
                      onChange={e => setPages(Number(e.target.value))}
                      className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer appearance-none"
                      disabled={creating}
                    >
                      {PAGE_OPTIONS.map(p => (
                        <option key={p} value={p}>{p} pages</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleCreate}
                disabled={!canSubmit}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: canSubmit
                    ? 'linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)'
                    : undefined,
                  backgroundColor: !canSubmit ? 'var(--muted)' : undefined,
                  boxShadow: canSubmit ? '0 4px 14px rgba(59, 130, 246, 0.4)' : undefined,
                }}
              >
                {creating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Creating & starting generation...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Generate Thesis
                  </>
                )}
              </button>

              {/* Subtle info */}
              <p className="text-center text-xs text-muted-foreground mt-4">
                Your thesis will be auto-generated section by section. You can track progress in the workspace.
              </p>
            </div>

            {/* Bottom accent */}
            <p className="text-center text-xs text-muted-foreground/60 mt-6">
              Powered by multi-stage AI pipeline with academic research integration
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
