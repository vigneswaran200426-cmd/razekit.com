import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth as authApi, token } from './api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token.get()) { setUser(null); setLoading(false); return; }
    try { setUser(await authApi.me()); }
    catch { token.clear(); setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const signOut = useCallback(async () => { await authApi.logout(); setUser(null); }, []);

  // Admins can switch which product surface they use. This sets the real
  // user_role on the backend (so brand/creator permissions actually apply),
  // while role === 'admin' keeps admin privileges.
  const switchMode = useCallback(async (mode) => {
    await authApi.updateMe({ user_role: mode, onboarding_completed: true });
    await load();
  }, [load]);

  const isAdmin = user?.role === 'admin';
  // Effective product role for nav/dashboard/guards.
  const role = user
    ? (['creator', 'client'].includes(user.user_role) ? user.user_role : (isAdmin ? 'admin' : 'visitor'))
    : 'visitor';
  const status = loading ? 'loading' : user ? 'authenticated' : 'visitor';

  return (
    <AuthCtx.Provider value={{ user, setUser, role, isAdmin, status, loading, refresh: load, signOut, switchMode }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
