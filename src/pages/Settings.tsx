import { useState } from 'react';
import { User, Bell, Shield, PaintBucket, Menu, CreditCard, LogOut, Check } from 'lucide-react';
import Button from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';
import { useTheme, Theme } from '../contexts/ThemeContext';
import { useOutletContext } from 'react-router-dom';

// interface SettingsProps {
//   onNavigate: (page: string) => void;
// }

export default function Settings() {
  const { success } = useToast();
  const { theme, setTheme } = useTheme();
  const { setMobileSidebarOpen } = useOutletContext<{ setMobileSidebarOpen: (o: boolean) => void }>();
  const [activeTab, setActiveTab] = useState('account');
  const [pendingTheme, setPendingTheme] = useState<Theme>(theme);

  const tabs = [
    { id: 'account', icon: User, label: 'Account Profile' },
    { id: 'billing', icon: CreditCard, label: 'Billing & Plan' },
    { id: 'notifications', icon: Bell, label: 'Notifications' },
    { id: 'appearance', icon: PaintBucket, label: 'Appearance' },
    { id: 'security', icon: Shield, label: 'Security' },
  ];

  const handleSave = () => {
    if (activeTab === 'appearance') {
      setTheme(pendingTheme);
    }
    success('Settings have been updated successfully.', 'Saved');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">

      <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-transparent">
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-6 lg:px-8 py-4 flex items-center gap-3">
          <button className="lg:hidden p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors rounded-md" onClick={() => setMobileSidebarOpen(true)}>
            <Menu size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Settings</h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">Manage your account and preferences</p>
          </div>
        </div>

        <div className="p-6 lg:p-8 max-w-6xl mx-auto flex flex-col md:flex-row gap-8">
          {/* Settings Nav */}
          <div className="w-full md:w-64 flex-shrink-0 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive 
                      ? 'bg-accent text-foreground' 
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-foreground' : 'text-muted-foreground'} />
                  {tab.label}
                </button>
              );
            })}
            
            <div className="pt-4 mt-4 border-t border-border">
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
                <LogOut size={18} />
                Sign Out
              </button>
            </div>
          </div>

          {/* Settings Content */}
          <div className="flex-1">
            <div className="bg-card text-card-foreground border border-border rounded-xl p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-2 shadow-sm">
              {activeTab === 'account' && (
                <div className="space-y-8">
                  <div className="border-b border-border pb-6">
                    <h2 className="text-xl font-semibold tracking-tight text-foreground mb-1">Account Profile</h2>
                    <p className="text-sm font-medium text-muted-foreground">Update your personal information and academic details.</p>
                  </div>
                  
                  <div className="flex items-center gap-6 pb-8">
                    <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-2xl tracking-tighter shadow-sm">
                      U
                    </div>
                    <div>
                      <Button variant="outline" size="sm" className="mb-2">Change Avatar</Button>
                      <p className="text-xs font-medium text-muted-foreground">JPG, GIF or PNG. 1MB max.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">First Name</label>
                      <input type="text" placeholder="First Name" defaultValue="" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow shadow-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">Last Name</label>
                      <input type="text" placeholder="Last Name" defaultValue="" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow shadow-sm" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">Email Address</label>
                      <input type="email" placeholder="Email Address" defaultValue="" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow shadow-sm" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-bold text-foreground uppercase tracking-wider">Institution / University</label>
                      <input type="text" placeholder="Institution" defaultValue="" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow shadow-sm" />
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-border flex justify-end">
                    <Button variant="primary" onClick={handleSave} className="px-6 font-semibold">
                      <Check size={16} className="mr-2" /> Save Changes
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === 'appearance' && (
                <div className="space-y-8">
                  <div className="border-b border-border pb-6">
                    <h2 className="text-xl font-semibold tracking-tight text-foreground mb-1">Appearance</h2>
                    <p className="text-sm font-medium text-muted-foreground">Customize how Thesium looks on your device.</p>
                  </div>
                  
                  <div className="space-y-4">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider">Theme Preference</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {(['Dark (Premium)', 'Light', 'System Theme'] as Theme[]).map((t) => {
                        const isSelected = pendingTheme === t;
                        return (
                          <div key={t} onClick={() => setPendingTheme(t)} className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-background hover:border-border/80'}`}>
                            <div className={`w-5 h-5 rounded-full border-2 mb-4 flex items-center justify-center ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`}>
                              {isSelected && <div className="w-2 h-2 bg-background rounded-full" />}
                            </div>
                            <span className={`text-sm font-semibold tracking-tight ${isSelected ? 'text-primary' : 'text-foreground'}`}>{t}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="pt-6 mt-6 border-t border-border flex justify-end">
                    <Button variant="primary" onClick={handleSave} className="px-6 font-semibold">
                      <Check size={16} className="mr-2" /> Save Formats
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Other tabs empty state for demo */}
              {['billing', 'notifications', 'security'].includes(activeTab) && (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-5 border border-border">
                    <Shield size={24} className="text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight text-foreground mb-2">Coming Soon</h3>
                  <p className="text-sm font-medium text-muted-foreground max-w-sm mx-auto">This section is currently under development and will be available in the next platform update.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
