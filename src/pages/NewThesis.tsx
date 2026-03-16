import { useState } from 'react';
import { Sparkles, BookOpen, ArrowRight, Clock, FileText, AlertCircle, ChevronDown } from 'lucide-react';
import Sidebar from '../components/layout/Sidebar';
import Button from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';

import { useNavigate } from 'react-router-dom';

// Note: Passing complex state across routes is better handled via Context or Redux, but to preserve
// the exact existing app flow for the migration, we will use React Router's `state` object.
// We remove `onNavigate` here.

const FIELDS = [
  'Computer Science', 'Electrical Engineering', 'Mechanical Engineering',
  'Business & Management', 'Medicine & Health', 'Environmental Science',
  'Social Science', 'Law', 'Economics', 'Psychology',
  'Education', 'Mathematics', 'Physics', 'Chemistry', 'Other',
];

function estimateTime(pages: number): string {
  const minutes = Math.round(pages * 1.4);
  if (minutes < 60) return `~${minutes} minutes`;
  const hours = (minutes / 60).toFixed(1);
  return `~${hours} hours`;
}

function estimateWords(pages: number): string {
  return (pages * 250).toLocaleString();
}

export default function NewThesis() {
  const navigate = useNavigate();
  const { info } = useToast();
  const [topic, setTopic]   = useState('');
  const [field, setField]   = useState('');
  const [pages, setPages]   = useState(60);
  const [error, setError]   = useState('');

  const canSubmit = topic.trim().length > 10 && field !== '';

  const handleLaunch = () => {
    if (!canSubmit) {
      setError('Please enter a topic (at least 10 characters) and select a field.');
      return;
    }
    setError('');
    info('Deploying AI council for generation...', 'Process Started');
    navigate('/generating', { state: { thesisConfig: { topic: topic.trim(), field, pages } } });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar activeItem="new-thesis" />

      <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-transparent">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-8 py-4">
          <h1 className="text-xl font-bold tracking-tight text-foreground">New Thesis</h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-medium">Configure your thesis and launch the AI council</p>
        </div>

        <div className="p-8">
          <div className="max-w-2xl mx-auto">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-8">
              {['Research Topic', 'Configuration', 'Launch'].map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center ${
                    i === 0 ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground border border-border'
                  }`}>{i + 1}</div>
                  <span className={`text-xs font-medium ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{s}</span>
                  {i < 2 && <ChevronDown className="text-muted-foreground/50 rotate-[-90deg]" size={12} />}
                </div>
              ))}
            </div>

            {/* Form card */}
            <div className="bg-card text-card-foreground border border-border rounded-xl p-8 shadow-sm space-y-8">
              {/* Topic */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <FileText size={16} className="text-primary" />
                  Research Topic
                  <span className="text-destructive font-bold ml-0.5">*</span>
                </label>
                <textarea
                  value={topic}
                  onChange={e => { setTopic(e.target.value); setError(''); }}
                  placeholder="e.g. The impact of machine learning on healthcare diagnostics and patient outcome prediction…"
                  rows={4}
                  className="w-full px-4 py-3 bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none transition-shadow shadow-sm"
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-muted-foreground font-medium">Be specific — the more detail you provide, the better the thesis.</p>
                  <span className={`text-xs font-semibold ${topic.length < 10 ? 'text-muted-foreground' : 'text-primary'}`}>{topic.length} chars</span>
                </div>
              </div>

              {/* Field */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <BookOpen size={16} className="text-primary" />
                  Academic Field
                  <span className="text-destructive font-bold ml-0.5">*</span>
                </label>
                <div className="relative">
                  <select
                    value={field}
                    onChange={e => { setField(e.target.value); setError(''); }}
                    className="w-full px-4 py-3 bg-background border border-input rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow cursor-pointer appearance-none shadow-sm"
                  >
                    <option value="" disabled className="text-muted-foreground">Select your academic field…</option>
                    {FIELDS.map(f => (
                      <option key={f} value={f} className="text-foreground">{f}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {/* Page Count Slider */}
              <div>
                <label className="flex items-center justify-between mb-4">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <FileText size={16} className="text-primary" />
                    Thesis Length
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold tracking-tight text-foreground">{pages}</span>
                    <span className="text-sm font-medium text-muted-foreground">pages</span>
                  </div>
                </label>

                <input
                  type="range"
                  min={20} max={300} step={5}
                  value={pages}
                  onChange={e => setPages(Number(e.target.value))}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary mb-4"
                />

                <div className="flex justify-between text-xs font-medium text-muted-foreground mb-6 px-1">
                  <span>20 (Short)</span>
                  <span>150 (Standard)</span>
                  <span>300 (Doctoral)</span>
                </div>

                {/* Estimates */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Word Count',  value: `~${estimateWords(pages)} words`, icon: FileText },
                    { label: 'Est. Time',   value: estimateTime(pages),               icon: Clock },
                    { label: 'AI Sections', value: '10 sections',                       icon: Sparkles },
                  ].map((e, i) => {
                    const Icon = e.icon;
                    return (
                      <div key={i} className="bg-background border border-border rounded-xl p-4 text-center shadow-sm">
                        <Icon size={16} className="text-primary mx-auto mb-2" />
                        <div className="text-sm font-bold tracking-tight text-foreground">{e.value}</div>
                        <div className="text-[11px] font-medium text-muted-foreground mt-1 uppercase tracking-wider">{e.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl animate-in fade-in">
                  <AlertCircle size={16} className="text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-destructive">{error}</p>
                </div>
              )}

              {/* Submit */}
              <div className="pt-4 border-t border-border">
                <Button
                  variant="primary"
                  size="xl"
                  className="w-full text-base font-bold shadow-md"
                  onClick={handleLaunch}
                  disabled={!canSubmit}
                >
                  <Sparkles size={18} className="mr-2" />
                  Launch AI Council
                  <ArrowRight size={18} className="ml-2" />
                </Button>

                <p className="text-center text-xs font-medium text-muted-foreground mt-4">
                  The AI council will begin working immediately after launch.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
