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
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Shared page-level error fallback
function PageErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center p-8 text-center">
      <div className="space-y-4 max-w-md">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-lg font-bold text-foreground">Page crashed</h2>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  const SidebarLayout = () => {
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    return (
      <div className="flex h-screen bg-background overflow-hidden selection:bg-primary/20 selection:text-primary">
        <div className="hidden lg:flex">
          <Sidebar />
        </div>

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
          <Route path="/dashboard" element={
            <ErrorBoundary fallback={(e, r) => <PageErrorFallback error={e} reset={r} />} componentName="Dashboard">
              <Dashboard />
            </ErrorBoundary>
          } />
          <Route path="/my-theses" element={
            <ErrorBoundary fallback={(e, r) => <PageErrorFallback error={e} reset={r} />} componentName="MyTheses">
              <MyTheses />
            </ErrorBoundary>
          } />
          <Route path="/templates" element={<MyTheses />} />
          <Route path="/admin/metrics" element={
            <ErrorBoundary fallback={(e, r) => <PageErrorFallback error={e} reset={r} />} componentName="MetricsDashboard">
              <MetricsDashboard />
            </ErrorBoundary>
          } />
          <Route path="/usage" element={
            <ErrorBoundary fallback={(e, r) => <PageErrorFallback error={e} reset={r} />} componentName="UsageDashboard">
              <UsageDashboard />
            </ErrorBoundary>
          } />
          <Route path="/pricing" element={
            <ErrorBoundary fallback={(e, r) => <PageErrorFallback error={e} reset={r} />} componentName="Pricing">
              <Pricing />
            </ErrorBoundary>
          } />
          <Route path="/settings" element={
            <ErrorBoundary fallback={(e, r) => <PageErrorFallback error={e} reset={r} />} componentName="Settings">
              <Settings />
            </ErrorBoundary>
          } />
          <Route path="/new-thesis" element={
            <ErrorBoundary fallback={(e, r) => <PageErrorFallback error={e} reset={r} />} componentName="NewThesis">
              <NewThesis />
            </ErrorBoundary>
          } />
        </Route>

        <Route path="/workspace/:id" element={
          <ErrorBoundary fallback={(e, r) => <PageErrorFallback error={e} reset={r} />} componentName="ThesisWorkspace">
            <ThesisWorkspace />
          </ErrorBoundary>
        } />
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
