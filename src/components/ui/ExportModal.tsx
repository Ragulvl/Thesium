import { X, FileText, File, Download, Sparkles, Check, LucideIcon } from 'lucide-react';
import { useState } from 'react';
import Button from './Button';
import { useToast } from '../../contexts/ToastContext';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  thesisTitle?: string;
}

type Format = 'pdf' | 'docx';
type Quality = 'standard' | 'high' | 'print';

export default function ExportModal({ isOpen, onClose, thesisTitle = 'My Thesis' }: ExportModalProps) {
  const { success } = useToast();
  const [format, setFormat] = useState<Format>('pdf');
  const [quality, setQuality] = useState<Quality>('high');
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);

  const handleExport = () => {
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      setDone(true);
      success(`Successfully exported as ${format.toUpperCase()}`, 'Export Complete');
      setTimeout(() => {
        setDone(false);
        onClose();
      }, 1500);
    }, 2200);
  };

  if (!isOpen) return null;

  const formats: { id: Format; label: string; desc: string; icon: LucideIcon }[] = [
    { id: 'pdf',  label: 'PDF',  desc: 'Best for sharing & printing', icon: FileText },
    { id: 'docx', label: 'DOCX', desc: 'Editable in Microsoft Word',   icon: File },
  ];

  const qualities: { id: Quality; label: string; desc: string }[] = [
    { id: 'standard', label: 'Standard',    desc: 'Fast download, smaller file' },
    { id: 'high',     label: 'High Quality', desc: 'Optimized formatting' },
    { id: 'print',    label: 'Print-Ready',  desc: 'Full resolution, press-ready' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-background text-foreground border border-border rounded-xl shadow-lg animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Export Thesis</h2>
            <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-[240px]">{thesisTitle}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Format */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Format</p>
            <div className="grid grid-cols-2 gap-3">
              {formats.map(f => {
                const Icon = f.icon;
                const active = format === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border transition-all duration-200 ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {active && (
                      <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <Check size={10} className="text-primary-foreground" />
                      </span>
                    )}
                    <Icon size={24} className="stroke-[1.5]" />
                    <div className="text-center">
                      <div className="font-semibold text-sm">{f.label}</div>
                      <div className="text-[11px] mt-0.5 opacity-80">{f.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quality */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quality</p>
            <div className="space-y-2">
              {qualities.map(q => (
                <button
                  key={q.id}
                  onClick={() => setQuality(q.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all duration-200 ${
                    quality === q.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:bg-accent'
                  }`}
                >
                  <div>
                    <span className={`text-sm font-medium ${quality === q.id ? 'text-primary' : 'text-foreground'}`}>{q.label}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{q.desc}</p>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    quality === q.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                  }`}>
                    {quality === q.id && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-0">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleExport}
            disabled={exporting || done}
          >
            {done ? (
              <><Check size={16} className="mr-2" /> Download Ready!</>
            ) : exporting ? (
              <><Sparkles size={16} className="mr-2 animate-spin" /> Preparing Export…</>
            ) : (
              <><Download size={16} className="mr-2" /> Export {format.toUpperCase()}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
