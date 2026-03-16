import { BookOpen, Sparkles, ArrowRight, Brain, Search, PenLine, Quote, FlaskConical, Shield, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';

export default function LandingPage() {
  const navigate = useNavigate();
  const features = [
    {
      icon: Brain,
      title: 'AI Council Collaboration',
      description: 'Six specialized AI agents work in parallel — each an expert in research, writing, reviewing, and citations.'
    },
    {
      icon: Search,
      title: 'Deep Literature Review',
      description: 'Automatically discovers, synthesizes, and cites relevant academic papers and sources for your field.'
    },
    {
      icon: PenLine,
      title: 'Structured Academic Writing',
      description: 'Generates properly formatted thesis sections following academic standards and your selected style guide.'
    },
    {
      icon: FlaskConical,
      title: 'Methodology Builder',
      description: 'AI constructs a robust research methodology tailored to your topic, hypothesis, and academic field.'
    },
    {
      icon: Quote,
      title: 'Citation Generator',
      description: 'Automatic citation formatting in APA, MLA, Chicago, and IEEE styles — no manual bibliography needed.'
    },
    {
      icon: Shield,
      title: 'Quality Review AI',
      description: 'A dedicated reviewer agent checks coherence, argument strength, grammar, and academic integrity.'
    },
  ];

  const stats = [
    { value: '12,400+', label: 'Theses Generated' },
    { value: '98%',     label: 'User Satisfaction' },
    { value: '6',       label: 'AI Agents Per Thesis' },
    { value: '<2 hrs',  label: 'Average Generation Time' },
  ];

  const steps = [
    { step: '01', title: 'Enter Your Topic', desc: 'Provide your research topic, academic field, and desired page count.' },
    { step: '02', title: 'AI Council Activates', desc: 'Six specialized agents begin researching, planning, and writing.' },
    { step: '03', title: 'Review & Edit', desc: 'Open your generated thesis in the workspace and refine any section.' },
    { step: '04', title: 'Export & Submit', desc: 'Download a professionally formatted PDF or Word document.' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/20 selection:text-primary">
      {/* ─── Header ─── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
              <BookOpen size={16} className="text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Thesium</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
            <a href="#stats" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Stats</a>
            <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>
              Sign In
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/auth')}>
              Get Started
            </Button>
          </nav>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative pt-40 pb-24 px-6 overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        
        {/* Decorative glow (Subtle) */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-xs font-semibold text-primary mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Sparkles size={12} className="stroke-[2.5]" />
            Powered by Multi-Agent AI Council
            <ChevronRight size={12} className="stroke-[2.5]" />
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
            Write Your Thesis <br className="hidden md:block" />
            <span className="text-muted-foreground">With Six AI Minds</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
            Thesium deploys a council of specialized AI agents to research, structure, write, and review your complete academic thesis — in hours, not months.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
            <Button variant="primary" size="lg" className="w-full sm:w-auto text-base" onClick={() => navigate('/auth')}>
              Start Your Thesis
              <ArrowRight size={18} className="ml-2" />
            </Button>
            <Button variant="outline" size="lg" className="w-full sm:w-auto text-base" onClick={() => navigate('/auth')}>
              Sign In To Workspace
            </Button>
          </div>

          {/* Hero visual */}
          <div className="mt-20 relative animate-in fade-in zoom-in-95 duration-1000 delay-500">
            <div className="bg-card/50 backdrop-blur-md border border-border rounded-xl p-6 max-w-3xl mx-auto shadow-2xl shadow-black/5 ring-1 ring-border/50">
              <div className="flex items-center gap-2 mb-6 border-b border-border pb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                <div className="ml-2 text-xs font-medium text-muted-foreground">thesium / ai-council — Active</div>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { name: 'Topic Analyst', status: 'Done', isActive: false },
                  { name: 'Research Planner', status: 'Done', isActive: false },
                  { name: 'Literature AI', status: 'Active', isActive: true },
                  { name: 'Writer AI', status: 'Queued', isActive: false },
                  { name: 'Reviewer AI', status: 'Queued', isActive: false },
                  { name: 'Citation AI', status: 'Queued', isActive: false },
                ].map((a, i) => (
                  <div key={i} className={`rounded-lg p-4 border text-left transition-colors ${
                    a.isActive ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/20' : 'bg-background border-border'
                  }`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        a.status === 'Done' ? 'bg-primary/70' :
                        a.isActive ? 'bg-primary animate-pulse' :
                        'bg-muted-foreground/30'
                      }`} />
                      <span className={`text-[10px] uppercase tracking-wider font-semibold ${
                        a.isActive ? 'text-primary' : 'text-muted-foreground'
                      }`}>{a.status}</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground tracking-tight">{a.name}</p>
                  </div>
                ))}
              </div>
              
              <div className="mt-5 pt-5 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Overall Progress</span>
                  <span className="text-xs text-primary font-bold">38%</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full w-[38%] bg-primary rounded-full transition-all duration-1000" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section id="stats" className="py-20 border-y border-border bg-card/30">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-10">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-3">{stat.value}</div>
              <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20 max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">
              Everything You Need for a <br className="hidden md:block" />
              <span className="text-muted-foreground">Complete Thesis</span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Each feature is powered by a dedicated AI specialist, collaborating in real-time to produce publication-quality academic work.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="bg-card text-card-foreground border border-border rounded-xl p-8 shadow-sm hover:shadow-md hover:border-border/80 transition-all group">
                  <div className={`w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6`}>
                    <Icon size={24} className="text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" className="py-32 px-6 bg-card/30 border-y border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">
              From Topic to <span className="text-muted-foreground">Submission</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {steps.map((s, i) => (
              <div key={i} className="bg-background border border-border rounded-xl p-6 flex gap-6 items-start">
                <div className="text-4xl font-black text-muted-foreground/30 leading-none">{s.step}</div>
                <div>
                  <h3 className="text-xl font-semibold tracking-tight mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-32 px-6 text-center">
        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Ready to Write Your <br />
            Thesis?
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
            Join thousands of researchers who've used Thesium to complete their academic work in record time.
          </p>
          <Button variant="primary" size="xl" onClick={() => navigate('/auth')} className="px-10">
            Start For Free
            <ArrowRight size={18} className="ml-2" />
          </Button>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border bg-background">
        <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <BookOpen size={12} className="text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">Thesium</span>
          </div>
          <div className="flex flex-wrap justify-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">About</a>
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Contact</a>
          </div>
          <p className="text-sm text-muted-foreground">© 2026 Thesium. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
