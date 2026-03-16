import { useEffect, useState, useRef } from 'react';
import { BookOpen, Sparkles, ArrowRight, Clock } from 'lucide-react';
import AgentCard from '../components/ui/AgentCard';
import Button from '../components/ui/Button';

import { useLocation, useNavigate } from 'react-router-dom';
import { useGoogleAuth } from '../contexts/GoogleAuthContext';
import { useToast } from '../contexts/ToastContext';
import { logger } from '../utils/logger';

interface GeneratingThesisProps {
  thesisConfig?: {
    topic: string;
    field: string;
    pages: number;
  };
}

type AgentStatus = 'idle' | 'queued' | 'running' | 'completed';

interface Agent {
  name: string;
  task: string;
  durationMs: number;
}

const AGENTS: Agent[] = [
  { name: 'Topic Analyst',      task: 'Analyzing research scope and defining thesis boundaries',   durationMs: 4000 },
  { name: 'Research Planner',   task: 'Building structured research plan and chapter outline',     durationMs: 5000 },
  { name: 'Literature Review AI', task: 'Identifying and synthesizing relevant academic sources', durationMs: 7000 },
  { name: 'Writer AI',          task: 'Drafting thesis sections with academic precision',          durationMs: 9000 },
  { name: 'Reviewer AI',        task: 'Checking coherence, flow, grammar, and argument strength',  durationMs: 5000 },
  { name: 'Citation AI',        task: 'Formatting references and generating bibliography',         durationMs: 3000 },
];

const STEPS = [
  'Topic Analysis',
  'Research Planning',
  'Literature Review',
  'Drafting Sections',
  'Quality Review',
  'Citation & Format',
  'Final Compilation',
];

export default function GeneratingThesis({ thesisConfig: propConfig }: GeneratingThesisProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useGoogleAuth();
  const { error } = useToast();
  // Use state passed via router if prop isn't available
  const thesisConfig = propConfig || location.state?.thesisConfig;

  const topic  = thesisConfig?.topic  ?? 'Your Research Topic';
  const field  = thesisConfig?.field  ?? 'Academic Field';
  const pages  = thesisConfig?.pages  ?? 60;

  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>(
    AGENTS.map(() => 'queued')
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [overallPct, setOverallPct]   = useState(0);
  const [elapsed, setElapsed]         = useState(0);
  const [done, setDone]               = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalDuration = AGENTS.reduce((a, b) => a + b.durationMs, 0);

  // Elapsed clock
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Agent cascade
  useEffect(() => {
    let offset = 800;
    AGENTS.forEach((agent, idx) => {
      setTimeout(() => {
        setAgentStatuses(prev => {
          const next = [...prev];
          next[idx] = 'running';
          return next;
        });
        setCurrentStep(idx);

        let elapsed2 = 0;
        const tick = 200;
        const interval = setInterval(() => {
          elapsed2 += tick;
          const pct = Math.min((elapsed2 / agent.durationMs) * (100 / AGENTS.length) + (idx * 100 / AGENTS.length), ((idx + 1) * 100 / AGENTS.length));
          setOverallPct(Math.round(pct));

          if (elapsed2 >= agent.durationMs) {
            clearInterval(interval);
            setAgentStatuses(prev => {
              const next = [...prev];
              next[idx] = 'completed';
              return next;
            });
          }
        }, tick);
      }, offset);
      offset += agent.durationMs + 300;
    });

    // Done
    setTimeout(async () => {
      setOverallPct(100);
      setCurrentStep(STEPS.length - 1);
      
      // Save the freshly generated thesis to the database
      if (user?.sub) {
        try {
          await fetch('http://localhost:3001/api/theses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.sub,
              title: topic,
              field: field,
              targetPages: pages,
              researchQuestion: 'AI Generated Focus',
              status: 'Draft',
              progress: 100
            })
          });
        } catch (e) {
          logger.error({ err: e }, "Failed to save thesis");
          error("Error saving your newly generated thesis configuration", "Save Error");
        }
      }

      setDone(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }, offset + 500);
  }, [user, topic, field, pages]); // Added topic, field, pages to dependency array

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const estimatedTotal = Math.ceil(totalDuration / 1000);

  // SVG ring
  const radius   = 52;
  const circum   = 2 * Math.PI * radius;
  const dashOff  = circum - (overallPct / 100) * circum;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20 selection:text-primary">
      {/* Header */}
      <div className="bg-background/80 backdrop-blur-md border-b border-border px-8 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
          <BookOpen size={16} className="text-primary-foreground" />
        </div>
        <span className="font-bold tracking-tight text-foreground">Thesium</span>
        <span className="text-muted-foreground font-bold">·</span>
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">AI Council Generation</span>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-0">
        {/* Left panel */}
        <div className="flex-1 p-8 md:p-12 flex flex-col bg-slate-50/50 dark:bg-transparent overflow-y-auto">
          {/* Thesis info */}
          <div className="mb-10 lg:max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-bold mb-5 tracking-wide">
              <Sparkles size={14} className={done ? '' : 'animate-pulse'} />
              {done ? 'Generation Complete' : 'AI Council Active'}
            </div>

            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-4 leading-snug">
              {topic}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-muted-foreground">
              <span className="px-2.5 py-1 rounded-md bg-secondary text-foreground border border-border">{field}</span>
              <span>·</span>
              <span>{pages} pages</span>
              <span>·</span>
              <div className="flex items-center gap-1.5 border border-border bg-background px-2.5 py-1 rounded-md">
                <Clock size={14} />
                <span>{formatElapsed(elapsed)} elapsed</span>
              </div>
            </div>
          </div>

          {/* Progress ring + overall */}
          <div className="flex items-center gap-8 mb-10 p-8 bg-card border border-border rounded-xl shadow-sm">
            <div className="relative w-36 h-36 flex-shrink-0">
              <svg width="144" height="144" viewBox="0 0 144 144" className="progress-ring -rotate-90">
                <circle cx="72" cy="72" r={radius} fill="none" stroke="currentColor" className="text-secondary" strokeWidth="12" />
                <circle
                  cx="72" cy="72" r={radius}
                  fill="none"
                  stroke="currentColor"
                  className="text-primary"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={circum}
                  strokeDashoffset={dashOff}
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
                <span className="text-3xl font-black tracking-tight text-foreground">{overallPct}%</span>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Ready</span>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold tracking-tight text-foreground mb-1.5">
                {done ? 'Thesis is ready!' : `${AGENTS[Math.min(currentStep, AGENTS.length - 1)]?.name} working…`}
              </p>
              <p className="text-sm font-medium text-muted-foreground mb-5">
                {done ? 'Your complete academic thesis has been generated and thoroughly reviewed.' : AGENTS[Math.min(currentStep, AGENTS.length - 1)]?.task}
              </p>
              <div className="h-2 bg-secondary rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
              {!done && (
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Estimated {formatElapsed(Math.max(0, estimatedTotal - elapsed))} remaining</p>
              )}
            </div>
          </div>

          {/* Agent grid */}
          <div className="lg:max-w-5xl lg:mx-auto w-full">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">AI Council Specialists</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {AGENTS.map((agent, i) => (
                <AgentCard
                  key={agent.name}
                  name={agent.name}
                  status={agentStatuses[i]}
                  task={agent.task}
                  index={i}
                />
              ))}
            </div>
          </div>

          {/* Done action */}
          {done && (
            <div className="mt-10 p-6 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 rounded-xl animate-in slide-in-from-bottom-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-teal-800 dark:text-teal-300 mb-1">🎉 Your thesis is ready!</h3>
                  <p className="text-sm font-medium text-teal-600 dark:text-teal-400">All scholarly sections have been generated, cited, and rigorously reviewed.</p>
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto font-bold"
                  onClick={() => navigate('/workspace', { state: { thesisConfig } })}
                >
                  Open Thesis
                  <ArrowRight size={18} className="ml-2" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right panel — step timeline */}
        <div className="lg:w-80 border-t lg:border-t-0 lg:border-l border-border p-8 bg-card shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.1)] lg:h-screen lg:overflow-y-auto">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-8">Generation Pipeline</h2>
          <div className="space-y-0 relative">
            {STEPS.map((step, i) => {
              const isDone   = i < currentStep || done;
              const isActive = i === currentStep && !done;

              return (
                <div key={i} className="flex gap-4">
                  {/* Timeline node */}
                  <div className="flex flex-col items-center relative z-10">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold border-2 transition-all duration-500 ${
                      isDone
                        ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                        : isActive
                        ? 'bg-background border-primary text-primary shadow-sm shadow-primary/10'
                        : 'bg-secondary border-border text-muted-foreground'
                    }`}>
                      {isDone ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span>{i + 1}</span>
                      )}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`w-0.5 h-10 my-1 rounded-full transition-all duration-700 ${isDone ? 'bg-primary' : 'bg-secondary'}`} />
                    )}
                  </div>

                  {/* Label */}
                  <div className="pt-0.5 pb-8">
                    <p className={`text-sm font-bold tracking-tight transition-colors ${
                      isDone ? 'text-primary' : isActive ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
                      {step}
                    </p>
                    {isActive && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Processing…</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
