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

  // Product role: admins are admin; otherwise the chosen product role.
  const role = user ? (user.role === 'admin' && !user.user_role ? 'admin' : (user.user_role || 'visitor')) : 'visitor';
  const status = loading ? 'loading' : user ? 'authenticated' : 'visitor';

  return (
    <AuthCtx.Provider value={{ user, setUser, role, status, loading, refresh: load, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
