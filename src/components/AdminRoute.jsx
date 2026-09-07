import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isAppAdmin } from '@/lib/role-utils';
import { Loader2 } from 'lucide-react';

// AdminRoute — router-level guard for /admin/* routes.
// Only an authenticated platform Admin (role === 'admin') may render the
// wrapped admin screen. Client and Creator users are redirected away before
// the admin component mounts, so no admin UI/data ever renders for them.
// Role is server-authoritative — there is no client-side path to become admin.
export default function AdminRoute({ children }) {
  const { user, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isAppAdmin(user)) return <Navigate to="/" replace />;

  return children;
}