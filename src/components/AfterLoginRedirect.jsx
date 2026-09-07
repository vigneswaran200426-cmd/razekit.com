import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { getPostLoginPath } from '@/lib/post-login-route';

// Lands right after login: sends the user to the home surface for their role.
export default function AfterLoginRedirect() {
  const { user, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return <Navigate to={getPostLoginPath(user)} replace />;
}