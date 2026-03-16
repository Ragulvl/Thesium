import { FileText, Clock, MoreHorizontal, ExternalLink, Download, Sparkles } from 'lucide-react';
import Button from './Button';

interface ThesisCardProps {
  id: number;
  title: string;
  field: string;
  lastEdited: string;
  progress: number;
  targetPages?: number;
  onOpen?: () => void;
  onDownload?: () => void;
}

const FIELD_COLORS: Record<string, string> = {
  'Computer Science':      'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  'Environmental Science': 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
  'Business':              'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  'Medicine':              'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  'Social Science':        'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  'Engineering':           'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
};

export default function ThesisCard({ title, field, lastEdited, progress, targetPages, onOpen, onDownload }: ThesisCardProps) {
  const fieldColor = FIELD_COLORS[field] || 'bg-secondary text-secondary-foreground border-border';

  return (
    <div className="bg-card text-card-foreground border border-border rounded-xl p-5 shadow-sm hover:border-primary/40 hover:shadow-md transition-all duration-200 group flex flex-col h-full">
      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText size={18} className="text-primary" />
        </div>
        <button className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors opacity-0 group-hover:opacity-100">
          <MoreHorizontal size={16} />
        </button>
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold leading-tight mb-2 line-clamp-2">{title}</h3>

      {/* Field badge */}
      <div className="mb-4">
        <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md border ${fieldColor}`}>
          {field}
        </span>
      </div>

      <div className="mt-auto">
        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-1">
            <Clock size={12} />
            <span>{lastEdited}</span>
          </div>
          {targetPages && (
            <div className="flex items-center gap-1">
              <Sparkles size={12} />
              <span>{targetPages} pages</span>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="mb-5 relative">
          <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
            <span className="text-muted-foreground">Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="primary" size="sm" className="flex-1" onClick={onOpen}>
            <ExternalLink size={14} className="mr-1.5" />
            Open
          </Button>
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
