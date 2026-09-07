import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getPostLoginPath } from '@/lib/post-login-route';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';

// RoleRoute — enforces role-based access at the routing layer, layered inside
// AuthGate. Sits under an AuthGate so unauthenticated users are handled there;
// the wrong authenticated role never renders the page — it is sent back to its
// own surface. Role is server-authoritative (from the session user).
export default function RoleRoute({ allowedRoles, children }) {
  const { user, isLoadingAuth } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  const role = user.user_role || 'visitor';
  if (!allowedRoles.includes(role)) {
    try {
      base44.analytics.track({ eventName: 'role_access_denied', properties: { role: user.user_role || 'none', path: location.pathname } });
    } catch (e) {}
    return <Navigate to={getPostLoginPath(user)} replace />;
  }

  return children;
}