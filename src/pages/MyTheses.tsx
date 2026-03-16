import { useState, useEffect } from 'react';
import { Search, Filter, Clock, Menu, PlusCircle, FileText } from 'lucide-react';
import Button from '../components/ui/Button';
import ThesisCard from '../components/ui/ThesisCard';
import ExportModal from '../components/ui/ExportModal';
import { ThesisCardSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../contexts/ToastContext';
import { ThesisItem } from './Dashboard';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useGoogleAuth } from '../contexts/GoogleAuthContext';
import { logger } from '../utils/logger';

export default function MyTheses() {
  const navigate = useNavigate();
  const { user } = useGoogleAuth();
  const { success, info } = useToast();
  const [loading, setLoading] = useState(true);
  const { setMobileSidebarOpen } = useOutletContext<{ setMobileSidebarOpen: (o: boolean) => void }>();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTitle, setExportTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [allTheses, setAllTheses] = useState<ThesisItem[]>([]);

  useEffect(() => {
    if (!user?.sub) return;

    fetch(`/api/theses/${user.sub}`)
      .then((res) => res.json())
      .then((data) => {
        setAllTheses(data);
        setLoading(false);
      })
      .catch((err) => {
        logger.error({ err }, 'Failed to fetch theses');
        setLoading(false);
      });
  }, [user?.sub]);

  const filteredTheses = allTheses.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.field.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleDownload = (title: string) => {
    setExportTitle(title);
    setExportOpen(true);
    info('Preparing export options…', 'Download');
  };

  const handleOpen = (title: string) => {
    success(`Opened "${title.slice(0, 40)}…"`, 'Thesis Opened');
    navigate('/workspace');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">

      <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-transparent">
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground rounded-md transition-colors" onClick={() => setMobileSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">My Theses</h1>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">Manage all your research projects</p>
            </div>
          </div>
          <Button variant="primary" size="md" onClick={() => navigate('/new-thesis')}>
            <PlusCircle size={16} className="hidden sm:block mr-2" />
            <span className="hidden sm:inline">New Thesis</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>

        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search theses by title or field..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow shadow-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="md" className="hidden sm:flex px-4">
                <Filter size={16} className="mr-2" /> Filter
              </Button>
              <Button variant="outline" size="md" className="hidden sm:flex px-4">
                <Clock size={16} className="mr-2" /> Sort by Date
              </Button>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: Math.max(3, filteredTheses.length) }).map((_, i) => <ThesisCardSkeleton key={i} />)}
            </div>
          ) : filteredTheses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredTheses.map(thesis => (
                <ThesisCard
                  key={thesis.id}
                  {...thesis}
                  onOpen={() => handleOpen(thesis.title)}
                  onDownload={() => handleDownload(thesis.title)}
                />
              ))}
            </div>
          ) : (
            <div className="bg-card text-card-foreground border border-border rounded-xl p-16 text-center mt-8 shadow-sm">
              <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border">
                <FileText size={28} className="text-primary/70" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-foreground mb-2">No results found</h3>
              <p className="text-sm font-medium text-muted-foreground mb-6">
                {searchQuery ? `We couldn't find any theses matching "${searchQuery}".` : "You haven't created any theses yet."}
              </p>
              {searchQuery ? (
                <Button variant="outline" onClick={() => setSearchQuery('')}>Clear Search</Button>
              ) : (
                <Button variant="primary" onClick={() => navigate('/new-thesis')}>Create First Thesis</Button>
              )}
            </div>
          )}
        </div>
      </main>

      <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} thesisTitle={exportTitle} />
    </div>
  );
}
