import { CheckCircle, XCircle, AlertTriangle, Info, X, LucideIcon } from 'lucide-react';
import { useToast, ToastItem, ToastType } from '../../contexts/ToastContext';

const CONFIG: Record<ToastType, { icon: LucideIcon; bar: string; iconColor: string }> = {
  success: { icon: CheckCircle,    bar: 'bg-teal-500',   iconColor: 'text-teal-500' },
  error:   { icon: XCircle,        bar: 'bg-destructive', iconColor: 'text-destructive' },
  warning: { icon: AlertTriangle,  bar: 'bg-amber-500',  iconColor: 'text-amber-500' },
  info:    { icon: Info,           bar: 'bg-primary',    iconColor: 'text-primary' },
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const { removeToast } = useToast();
  const cfg = CONFIG[toast.type];
  const Icon = cfg.icon;

  return (
    <div className="relative flex items-start gap-3 px-4 py-4 rounded-xl border border-border bg-card text-card-foreground shadow-lg overflow-hidden min-w-[300px] max-w-sm animate-in slide-in-from-right-5 fade-in duration-300">
      {/* Progress bar */}
      <div className={`absolute bottom-0 left-0 h-1 ${cfg.bar} toast-progress`} />

      <Icon size={18} className={`${cfg.iconColor} flex-shrink-0 mt-0.5`} />

      <div className="flex-1 min-w-0 pr-2">
        {toast.title && (
          <p className="text-sm font-semibold tracking-tight text-foreground mb-0.5">{toast.title}</p>
        )}
        <p className="text-xs text-muted-foreground leading-snug">{toast.message}</p>
      </div>

      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors -mr-1 -mt-1"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 items-end pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard toast={t} />
        </div>
      ))}
    </div>
  );
}
