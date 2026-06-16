import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import MyTheses from './pages/MyTheses';
import Settings from './pages/Settings';
import NewThesis from './pages/NewThesis';

import ThesisWorkspace from './pages/ThesisWorkspace';
import MetricsDashboard from './pages/admin/MetricsDashboard';
import UsageDashboard from './pages/UsageDashboard';
import Pricing from './pages/Pricing';
import Sidebar from './components/layout/Sidebar';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/GoogleAuthContext';
import ToastContainer from './components/ui/Toast';
import ProtectedRoute from './components/layout/ProtectedRoute';




// Global state emulation wrapper (in a real app this would move to Context or Redux)
function AppRoutes() {
  // We keep a simple wrapper layout for pages that need the Sidebar
  const SidebarLayout = () => {
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    return (
      <div className="flex h-screen bg-background overflow-hidden selection:bg-primary/20 selection:text-primary">
        <div className="hidden lg:flex">
          <Sidebar />
        </div>

        {/* Mobile Sidebar Overlay */}
        {mobileSidebarOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-in fade-in"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 lg:hidden animate-in slide-in-from-left">
              <Sidebar onMobileClose={() => setMobileSidebarOpen(false)} />
            </div>
          </>
        )}

        <main className="flex-1 overflow-y-auto">
          {/* Outlet context allows child routes to trigger the sidebar */}
          <Outlet context={{ setMobileSidebarOpen }} />
        </main>
      </div>
    );
  };

  return (
    <Routes>
      {/* Full screen routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<Auth />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        {/* App routes with Sidebar */}
        <Route element={<SidebarLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/my-theses" element={<MyTheses />} />
          <Route path="/templates" element={<MyTheses />} />
          <Route path="/admin/metrics" element={<MetricsDashboard />} />
          <Route path="/usage" element={<UsageDashboard />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/new-thesis" element={<NewThesis />} />
        </Route>

        <Route path="/workspace/:id" element={<ThesisWorkspace />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
            <ToastContainer />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
