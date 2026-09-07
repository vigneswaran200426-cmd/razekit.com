import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { queryClientInstance } from '@/lib/query-client';
import { toast } from '@/components/ui/use-toast';

// Multi-tab auth broadcast: storage events fire in every OTHER tab of the app.
const AUTH_EVENT_KEY = 'razekit:auth-event';

const AuthContext = createContext();

/**
 * Razekit session architecture — the single source of truth for identity.
 *
 * State machine:
 *   AUTH_LOADING → VISITOR        (no server session)
 *   AUTH_LOADING → AUTHENTICATED  (role resolved from the server session: creator | brand | admin)
 *
 * The server is authoritative: `base44.auth.me()` is the session endpoint
 * (conceptually GET /api/auth/session). Client state NEVER invents an identity
 * or role — an unresolved session renders a neutral skeleton, never a fake
 * visitor profile. Every page and the navigation shell consume this provider.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  // Ref mirror of the authed flag so event listeners never read stale state.
  const authedRef = useRef(false);

  useEffect(() => {
    checkAppState();
  }, []);

  // Multi-tab consistency: a logout in one tab must log out every tab.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== AUTH_EVENT_KEY || !e.newValue) return;
      try {
        const evt = JSON.parse(e.newValue);
        if (evt?.type === 'logout') {
          queryClientInstance.clear();
          // Hard reload re-bootstraps the app: AUTH_LOADING → VISITOR.
          window.location.assign('/');
        }
      } catch (e) {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Session refresh on tab focus / reopen: verifies the server session is
  // still alive. An expired session transitions cleanly to VISITOR instead of
  // leaving stale authenticated UI. No loading flicker — the current identity
  // stays rendered until the server answers.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') refreshSession();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      try {
        const res = await fetch(`${base44.apiBaseUrl}/api/public-settings`, { credentials: 'include' });
        const publicSettings = res.ok ? await res.json() : {};
        setAppPublicSettings(publicSettings);

        if (appParams.token) {
          await checkUserAuth();
        } else {
          // No session token → genuine VISITOR. Public browsing continues.
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);

        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  // Initial session resolution: the server session is the only source of truth.
  const checkUserAuth = async () => {
    const wasAuthenticated = authedRef.current;
    setIsLoadingAuth(true);
    try {
      const currentUser = await base44.auth.me();
      authedRef.current = true;
      setUser(currentUser);
      setIsAuthenticated(true);
      setSessionExpired(false);
      setAuthError(null);
    } catch (error) {
      authedRef.current = false;
      setUser(null);
      setIsAuthenticated(false);
      // Expired/invalid session → clean VISITOR state (no fake identity, no
      // forced login on public pages; protected routes gate on isAuthenticated).
      if (wasAuthenticated && (error.status === 401 || error.status === 403)) {
        setSessionExpired(true);
        queryClientInstance.clear();
        toast({ title: 'Session expired', description: 'Please sign in again to continue.' });
      }
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  // Quiet session refresh (tab focus / visibility): keeps `user` fresh and
  // detects expiry without toggling loading spinners.
  const refreshSession = async () => {
    if (!authedRef.current) return;
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      authedRef.current = false;
      setUser(null);
      setIsAuthenticated(false);
      if (error.status === 401 || error.status === 403) {
        setSessionExpired(true);
        queryClientInstance.clear();
        toast({ title: 'Session expired', description: 'Please sign in again to continue.' });
      }
    }
  };

  // Entry point for sign-in: routes to the platform login page and comes back
  // to the same destination (returnTo) after the session is established.
  const login = (returnTo) => {
    base44.auth.redirectToLogin(returnTo || window.location.href);
  };

  // Real logout: server session invalidated first, then ALL client state
  // (provider, query cache) cleared, other tabs synced, and the app hard
  // reloaded so it re-bootstraps through AUTH_LOADING → VISITOR.
  const logout = async () => {
    try { base44.analytics.track({ eventName: 'user_logout' }); } catch (e) {}
    authedRef.current = false;
    setUser(null);
    setIsAuthenticated(false);
    setSessionExpired(false);
    queryClientInstance.clear();
    try {
      localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify({ type: 'logout', at: Date.now() }));
    } catch (e) {}
    try {
      await base44.auth.logout();
    } catch (e) {}
    window.location.assign('/');
  };

  const navigateToLogin = () => {
    login();
  };

  // Normalized account role. The platform stores 'client'; the product
  // experience is Brand. Visitor is the absence of a session, not a role.
  const isLoading = isLoadingAuth || isLoadingPublicSettings;
  const role = !isAuthenticated || !user
    ? null
    : user.user_role === 'client'
      ? 'brand'
      : user.user_role === 'creator' || user.user_role === 'editor'
        ? 'creator'
        : user.role === 'admin'
          ? 'admin'
          : null;
  const authState = isLoading
    ? 'loading'
    : isAuthenticated
      ? (role || 'authenticated')
      : 'visitor';

  return (
    <AuthContext.Provider value={{
      user,
      role,
      isAuthenticated,
      isLoading,
      isLoadingAuth,
      isLoadingPublicSettings,
      authState,
      sessionExpired,
      authError,
      authChecked,
      appPublicSettings,
      login,
      logout,
      refreshSession,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};