import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';

function FullSpinner() {
  return <div className="min-h-screen grid place-items-center bg-bg"><Spinner className="w-7 h-7" /></div>;
}

export function ProtectedRoute({ children, roles }) {
  const { status, role, isAdmin, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullSpinner />;
  if (status !== 'authenticated') return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  // Admins can access every role's surface (they switch modes in the header).
  if (roles && !roles.includes(role) && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

export function HomeGate({ landing: Landing }) {
  const { status, loading } = useAuth();
  if (loading) return <FullSpinner />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Landing />;
}
