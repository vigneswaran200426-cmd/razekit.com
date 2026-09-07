// RazeKit API client — the drop-in replacement for the Base44 SDK.
//
// Exposes the SAME surface the app already uses (base44.entities.*, base44.auth.*,
// base44.functions.invoke, base44.integrations.Core.*, base44.analytics.track),
// but talks to the self-hosted RazeKit backend (server/) instead of Base44.
// No app screens needed to change — only this file and the AuthContext bootstrap.

// Production sets VITE_API_URL (the deployed backend, e.g. https://api.razekit.com).
// VITE_API_BASE_URL is kept as a backward-compatible alias; localhost is the dev fallback.
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:4000'
).replace(/\/$/, '');
const TOKEN_KEY = 'base44_access_token'; // same key app-params/OAuth redirect use

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); } catch {}
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('token'); } catch {}
}

// Core HTTP helper. Throws an Error shaped like the old SDK's:
//   err.status                    (AuthContext checks 401/403)
//   err.response.data.error(.message)   (components read this)
async function http(method, path, { body, formData, headers } = {}) {
  const h = { ...(headers || {}) };
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;

  let payload;
  if (formData) {
    payload = formData; // browser sets multipart boundary
  } else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { method, headers: h, body: payload, credentials: 'include' });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const msg = (data && data.error && (data.error.message || data.error)) || res.statusText || 'Request failed';
    const err = new Error(typeof msg === 'string' ? msg : 'Request failed');
    err.status = res.status;
    err.response = { status: res.status, data };
    throw err;
  }
  return data;
}

const enc = encodeURIComponent;

// ── entities.<Name>.{filter,list,get,create,update,delete} ────────────────────
const entities = new Proxy({}, {
  get(_t, name) {
    return {
      filter: (where = {}, sort, limit) => http('POST', `/api/entities/${name}/query`, { body: { where, sort, limit } }),
      list: (sort, limit) => http('POST', `/api/entities/${name}/query`, { body: { where: {}, sort, limit } }),
      get: (id) => http('GET', `/api/entities/${name}/${enc(id)}`),
      create: (obj) => http('POST', `/api/entities/${name}`, { body: obj }),
      update: (id, patch) => http('PATCH', `/api/entities/${name}/${enc(id)}`, { body: patch }),
      delete: (id) => http('DELETE', `/api/entities/${name}/${enc(id)}`),
    };
  },
});

// ── auth.* ────────────────────────────────────────────────────────────────────
const auth = {
  me: () => http('GET', '/api/auth/me'),
  updateMe: (fields) => http('POST', '/api/auth/me', { body: fields || {} }),

  loginViaEmailPassword: async (email, password) => {
    const r = await http('POST', '/api/auth/login', { body: { email, password } });
    if (r?.access_token) setToken(r.access_token);
    return r;
  },
  register: (data) => http('POST', '/api/auth/register', { body: data }),
  verifyOtp: async ({ email, otpCode, code } = {}) => {
    const r = await http('POST', '/api/auth/verify-otp', { body: { email, code: otpCode || code } });
    if (r?.access_token) setToken(r.access_token);
    return r; // { access_token, user }
  },
  resendOtp: (email) => http('POST', '/api/auth/resend-otp', { body: { email } }),
  setToken: (t) => setToken(t),

  resetPasswordRequest: (email) => http('POST', '/api/auth/password/reset-request', { body: { email } }),
  resetPassword: ({ resetToken, newPassword } = {}) => http('POST', '/api/auth/password/reset', { body: { resetToken, newPassword } }),

  logout: async () => {
    try { await http('POST', '/api/auth/logout'); } catch {}
    clearToken();
    return { ok: true };
  },

  redirectToLogin: (returnTo) => {
    const q = returnTo ? `?returnTo=${enc(returnTo)}` : '';
    window.location.href = `/login${q}`;
  },
  loginWithProvider: (provider, returnTo) => {
    const rt = returnTo || window.location.origin;
    window.location.href = `${API_BASE_URL}/api/auth/oauth/${provider}?returnTo=${enc(rt)}`;
  },
  isAuthenticated: () => !!getToken(),
};

// ── functions.invoke(name, payload) → { data } ───────────────────────────────
const functions = {
  invoke: async (name, payload = {}) => {
    const data = await http('POST', `/api/functions/${name}`, { body: payload });
    return { data };
  },
};

// ── integrations.Core.* ───────────────────────────────────────────────────────
const integrations = {
  Core: {
    UploadFile: ({ file }) => {
      const fd = new FormData(); fd.append('file', file);
      return http('POST', '/api/integrations/core/upload-file', { formData: fd });
    },
    UploadPrivateFile: ({ file }) => {
      const fd = new FormData(); fd.append('file', file);
      return http('POST', '/api/integrations/core/upload-private-file', { formData: fd });
    },
    CreateFileSignedUrl: (body) => http('POST', '/api/integrations/core/create-file-signed-url', { body }),
    SendEmail: (body) => http('POST', '/api/integrations/core/send-email', { body }),
    InvokeLLM: (body) => http('POST', '/api/integrations/core/invoke-llm', { body }),
    GenerateImage: (body) => http('POST', '/api/integrations/core/generate-image', { body }),
  },
};

// ── analytics.track (fire-and-forget) ────────────────────────────────────────
const analytics = {
  track: (evt) => { try { http('POST', '/api/analytics/track', { body: evt || {} }); } catch {} },
};

export const base44 = { entities, auth, functions, integrations, analytics, apiBaseUrl: API_BASE_URL };
export default base44;
