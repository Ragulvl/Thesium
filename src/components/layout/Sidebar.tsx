import { BookOpen, Home, FileText, PlusCircle, LayoutTemplate, Settings, LogOut, User } from 'lucide-react';

import { useNavigate } from 'react-router-dom';

interface SidebarProps {
  activeItem?: string;
  onMobileClose?: () => void;
}

export default function Sidebar({ activeItem = 'dashboard', onMobileClose }: SidebarProps) {
  const navigate = useNavigate();

  const handleNav = (path: string) => {
    navigate(path);
    if (onMobileClose) onMobileClose();
  };
  const menuItems = [
    { id: 'dashboard',  label: 'Dashboard',  icon: Home },
    { id: 'my-theses',  label: 'My Theses',  icon: FileText },
    { id: 'new-thesis', label: 'New Thesis',  icon: PlusCircle },
    { id: 'templates',  label: 'Templates',   icon: LayoutTemplate },
    { id: 'settings',   label: 'Settings',    icon: Settings },
  ];

  return (
    <div className="w-64 h-screen bg-card text-card-foreground border-r border-border flex flex-col flex-shrink-0">
      {/* Brand */}
      <div className="px-5 py-6 border-b border-border">
        <button
          onClick={() => handleNav('/dashboard')}
          className="flex items-center gap-3 group w-full"
        >
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center shadow-sm">
            <BookOpen size={16} className="text-primary-foreground" />
          </div>
          <div className="text-left">
            <span className="text-base font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">Thesium</span>
            <p className="text-[10px] text-muted-foreground leading-none font-medium mt-0.5">AI Thesis Generator</p>
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <p className="px-3 pb-2 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Menu</p>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNav(`/${item.id === 'home' || item.id === 'dashboard' ? 'dashboard' : item.id === 'history' ? 'my-theses' : item.id === 'settings' ? 'settings' : item.id}`)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground font-normal'
              }`}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-border mt-auto">
        <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors group">
          <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-secondary-foreground" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-foreground truncate leading-tight">User</p>
            <p className="text-[11px] text-muted-foreground truncate leading-tight">user@example.com</p>
          </div>
          <LogOut size={14} className="text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}
