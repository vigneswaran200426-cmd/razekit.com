// RazeKit API client — talks to the self-hosted RazeKit backend (razekit-api).
// One small, typed-ish surface: entities, auth, functions, uploads.
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const TOKEN_KEY = 'rk_token';

export const token = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); } catch {} },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch {} },
};

// Capture an OAuth redirect token (?access_token=…) once on load, then clean URL.
(function captureOAuthToken() {
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('access_token');
    if (t) {
      token.set(t);
      url.searchParams.delete('access_token');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  } catch {}
})();

async function request(method, path, { body, formData, headers } = {}) {
  const h = { ...(headers || {}) };
  const t = token.get();
  if (t) h.Authorization = `Bearer ${t}`;
  let payload;
  if (formData) payload = formData;
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  const res = await fetch(`${BASE}${path}`, { method, headers: h, body: payload });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.error && (data.error.message || data.error)) || res.statusText || 'Request failed';
    const err = new Error(typeof msg === 'string' ? msg : 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const enc = encodeURIComponent;

// entities.<Name>.{list,filter,get,create,update,delete}
export const entities = new Proxy({}, {
  get(_t, name) {
    return {
      filter: (where = {}, sort, limit) => request('POST', `/api/entities/${name}/query`, { body: { where, sort, limit } }),
      list: (sort, limit) => request('POST', `/api/entities/${name}/query`, { body: { where: {}, sort, limit } }),
      get: (id) => request('GET', `/api/entities/${name}/${enc(id)}`),
      create: (obj) => request('POST', `/api/entities/${name}`, { body: obj }),
      update: (id, patch) => request('PATCH', `/api/entities/${name}/${enc(id)}`, { body: patch }),
      remove: (id) => request('DELETE', `/api/entities/${name}/${enc(id)}`),
    };
  },
});

export const auth = {
  me: () => request('GET', '/api/auth/me'),
  updateMe: (fields) => request('POST', '/api/auth/me', { body: fields || {} }),
  login: async (email, password) => {
    const r = await request('POST', '/api/auth/login', { body: { email, password } });
    if (r?.access_token) token.set(r.access_token);
    return r;
  },
  register: async (data) => { const r = await request('POST', '/api/auth/register', { body: data }); if (r?.access_token) token.set(r.access_token); return r; },
  verifyOtp: async (email, code) => {
    const r = await request('POST', '/api/auth/verify-otp', { body: { email, code } });
    if (r?.access_token) token.set(r.access_token);
    return r;
  },
  resendOtp: (email) => request('POST', '/api/auth/resend-otp', { body: { email } }),
  resetRequest: (email) => request('POST', '/api/auth/password/reset-request', { body: { email } }),
  reset: (resetToken, newPassword) => request('POST', '/api/auth/password/reset', { body: { resetToken, newPassword } }),
  logout: async () => { try { await request('POST', '/api/auth/logout'); } catch {} token.clear(); },
  googleUrl: (returnTo) => `${BASE}/api/auth/oauth/google?returnTo=${enc(returnTo || window.location.origin)}`,
  isAuthenticated: () => !!token.get(),
};

// functions.invoke(name, payload) → returns the raw JSON result.
export const fn = (name, payload = {}) => request('POST', `/api/functions/${name}`, { body: payload });

export const uploads = {
  file: (file) => { const fd = new FormData(); fd.append('file', file); return request('POST', '/api/integrations/core/upload-file', { formData: fd }); },
  privateFile: (file) => { const fd = new FormData(); fd.append('file', file); return request('POST', '/api/integrations/core/upload-private-file', { formData: fd }); },
  signedUrl: (file_uri, expires_in = 3600) => request('POST', '/api/integrations/core/create-file-signed-url', { body: { file_uri, expires_in } }),
};

export const analytics = { track: (evt) => { try { request('POST', '/api/analytics/track', { body: evt || {} }); } catch {} } };

export const api = { BASE, token, request, entities, auth, fn, uploads, analytics };
export default api;
