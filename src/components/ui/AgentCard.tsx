import { Check, Loader2, Clock, Brain, Search, BookOpen, PenLine, Star, Quote, LucideIcon } from 'lucide-react';

type AgentStatus = 'idle' | 'running' | 'completed' | 'queued';

interface AgentCardProps {
  name: string;
  status: AgentStatus;
  task?: string;
  index?: number;
}

const AGENT_ICONS: Record<string, LucideIcon> = {
  'Topic Analyst':        Brain,
  'Research Planner':     Search,
  'Literature Review AI': BookOpen,
  'Writer AI':            PenLine,
  'Reviewer AI':          Star,
  'Citation AI':          Quote,
};

export default function AgentCard({ name, status, task, index = 0 }: AgentCardProps) {
  const Icon = AGENT_ICONS[name] ?? Brain;

  const statusConfig: Record<AgentStatus, { label: string; color: string; border: string; bg: string; iconBg: string }> = {
    idle: {
      label: 'Queued',
      color: 'text-muted-foreground',
      border: 'border-border',
      bg: 'bg-card',
      iconBg: 'bg-secondary',
    },
    queued: {
      label: 'Queued',
      color: 'text-muted-foreground',
      border: 'border-border',
      bg: 'bg-card',
      iconBg: 'bg-secondary',
    },
    running: {
      label: 'Active',
      color: 'text-primary',
      border: 'border-primary/40',
      bg: 'bg-primary/5',
      iconBg: 'bg-primary/10 border border-primary/20',
    },
    completed: {
      label: 'Done',
      color: 'text-teal-600 dark:text-teal-400',
      border: 'border-teal-500/20',
      bg: 'bg-teal-500/5',
      iconBg: 'bg-teal-500/10 border border-teal-500/20',
    },
  };

  const cfg = statusConfig[status];

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border ${cfg.bg} ${cfg.border} transition-all duration-500 animate-in fade-in zoom-in-95`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Icon */}
      <div className={`relative flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${cfg.iconBg}`}>
        <Icon size={18} className={cfg.color} />
        {status === 'running' && (
          <span className="absolute inset-0 rounded-lg border-2 border-primary/40 animate-pulse" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm font-semibold text-foreground truncate tracking-tight">{name}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0 border bg-background/50 px-2 py-0.5 rounded-full">
            {status === 'running' ? (
              <Loader2 size={10} className="text-primary animate-spin" />
            ) : status === 'completed' ? (
              <Check size={10} className="text-teal-600 dark:text-teal-400" />
            ) : (
              <Clock size={10} className="text-muted-foreground" />
            )}
            <span className={`text-[10px] font-medium uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
          </div>
        </div>
        {task && (
          <p className="text-xs text-muted-foreground leading-snug truncate">{task}</p>
        )}
      </div>
    </div>
  );
}
