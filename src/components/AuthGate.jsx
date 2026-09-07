import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

// AuthGate — the router-layer authentication guard for every private route.
// While the session resolves it renders a neutral skeleton (never a wrong
// identity), unauthenticated visitors are sent to sign-in with their intended
// internal destination remembered (?returnTo is validated same-origin by the
// login page), and only a confirmed server session renders protected content.
// Role separation (creator vs brand vs admin) is enforced inside by
// RoleRoute / AdminRoute.
export default function AuthGate() {
  const { authState } = useAuth();
  const location = useLocation();

  if (authState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" aria-label="Loading">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (authState === 'visitor') {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  return <Outlet />;
}