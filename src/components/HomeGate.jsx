import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isAppAdmin } from '@/lib/role-utils';
import Landing from '@/pages/Landing';

// HomeGate — the "/" entry of the auth state machine. Exactly one of these
// outcomes renders, decided by the server session — never a mix:
//   loading → neutral skeleton · visitor → public landing (Sign in / Join)
//   brand → brand dashboard · creator → creator dashboard
export default function HomeGate() {
  const { authState, user, role } = useAuth();

  if (authState === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-secondary border-t-primary rounded-full animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (authState === 'visitor') return <Landing />;

  if (isAppAdmin(user)) return <Navigate to="/admin/users" replace />;
  if (!user?.onboarding_completed) return <Navigate to="/onboarding" replace />;
  if (role === 'brand') return <Navigate to="/client/dashboard" replace />;
  if (role === 'creator') return <Navigate to="/creator/dashboard" replace />;

  return <Navigate to="/explore" replace />;
}