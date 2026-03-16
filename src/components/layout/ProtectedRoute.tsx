import { Navigate, Outlet } from 'react-router-dom';
import { useGoogleAuth } from '../../contexts/GoogleAuthContext';

export default function ProtectedRoute() {
  const { user, loading } = useGoogleAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
}
