// RazeKit API client — talks to the self-hosted RazeKit backend (razekit-api).
// One small, typed-ish surface: entities, auth, functions, uploads.
// `import.meta.env` is guarded rather than assumed: Vite defines it at build
// time, but this module is also loaded directly by the network-policy test
// under plain node, where it does not exist.
const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const BASE = (ENV.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
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

/* ── Network policy ──────────────────────────────────────────────────────────
   Three failures this client used to have no answer for:

     1. A hung request never resolved. On a flaky mobile connection a request
        can stall indefinitely, and the screen sits on a spinner forever with
        no error and no way back. Every request now has a deadline.

     2. A single transient blip — a 503 while a dyno restarts, a dropped
        packet — failed the whole screen. Reads now retry.

     3. An offline request produced "Failed to fetch", which tells the user
        nothing. Offline is now its own error, so the UI can say so.

   RETRY IS READS-ONLY, AND THIS IS THE IMPORTANT PART. The browser cannot
   distinguish "the server never received it" from "the server processed it and
   the response was lost" — both surface as the same TypeError. So a retried
   write could fund a contest twice, report the same bank transfer twice, or
   submit an entry twice. Writes get a deadline and a clear error; they never
   get an automatic second attempt. */

const TIMEOUT_MS = 20_000;
/** The ceiling on the WHOLE call, retries and backoff included. Three attempts
 *  at a 20s deadline each is a minute of spinner before the user learns
 *  anything, so the budget — not the attempt count — is what actually ends it.
 *  Patience is the real constraint; attempts are just how it gets spent. */
export const TOTAL_BUDGET_MS = 28_000;
/** Uploads move real files over real uplinks. A 20s deadline would fail honest
 *  large submissions on a slow connection, which is worse than waiting. */
const UPLOAD_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

/** Statuses worth a second attempt: the server said "not now", not "no". */
const RETRY_STATUS = new Set([429, 502, 503, 504]);

export class NetworkError extends Error {
  constructor(message, code, cause) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;       // OFFLINE | TIMEOUT | UNREACHABLE | ABORTED
    this.cause = cause;
    this.isNetwork = true;
  }
}

/** `navigator.onLine === false` is authoritative: the OS knows there is no
 *  interface. `true` is NOT proof of internet — a captive portal reports true —
 *  so it is only ever used to skip a request that cannot possibly succeed. */
const definitelyOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** A read, whatever the verb. The entity API uses POST /query for reads because
 *  a filter does not fit in a URL, so the method alone cannot decide this. */
function isIdempotent(method, path) {
  if (method === 'GET' || method === 'HEAD') return true;
  if (method === 'POST' && /\/query$/.test(path)) return true;
  return false;
}

/** Exponential with jitter. Without jitter, every screen that failed together
 *  retries together and lands on the recovering server in lockstep. */
const backoffMs = (attempt) => Math.round((300 * 2 ** (attempt - 1)) * (0.7 + Math.random() * 0.6));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(method, path, { body, formData, headers, signal } = {}) {
  const h = { ...(headers || {}) };
  const t = token.get();
  if (t) h.Authorization = `Bearer ${t}`;
  let payload;
  if (formData) payload = formData;
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  const retryable = isIdempotent(method, path);
  const perAttempt = formData ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS;
  const budget = formData ? UPLOAD_TIMEOUT_MS : TOTAL_BUDGET_MS;
  const startedAt = Date.now();
  const remaining = () => budget - (Date.now() - startedAt);
  const attempts = retryable ? MAX_ATTEMPTS : 1;
  let lastErr;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // Whatever is left of the budget, capped at the per-attempt deadline. The
    // last attempt therefore gets the remainder rather than a fresh 20s.
    const deadline = Math.min(perAttempt, Math.max(1000, remaining()));
    // Checked per attempt, not once: the connection can drop between retries.
    if (definitelyOffline()) {
      throw new NetworkError('You appear to be offline. Check your connection and try again.', 'OFFLINE');
    }

    // The timeout must abort the socket, not just stop waiting for it, or a
    // stalled request keeps a connection open behind every screen the user visits.
    const timer = new AbortController();
    const onAbort = () => timer.abort();
    if (signal) {
      if (signal.aborted) throw new NetworkError('Request cancelled', 'ABORTED');
      signal.addEventListener('abort', onAbort, { once: true });
    }
    const timeoutId = setTimeout(() => timer.abort(), deadline);

    let res;
    try {
      res = await fetch(`${BASE}${path}`, { method, headers: h, body: payload, signal: timer.signal });
    } catch (e) {
      // A caller navigating away is not a failure to report.
      if (signal?.aborted) throw new NetworkError('Request cancelled', 'ABORTED', e);
      lastErr = timer.signal.aborted
        ? new NetworkError('This is taking longer than expected. Check your connection and try again.', 'TIMEOUT', e)
        : new NetworkError('Could not reach RazeKit. Check your connection and try again.', 'UNREACHABLE', e);
      // Retry only if there is enough budget left for the attempt to be worth
      // making. Backing off into a deadline we cannot meet just delays the error.
      const wait = backoffMs(attempt);
      if (attempt < attempts && remaining() - wait > 1500) { await sleep(wait); continue; }
      throw lastErr;
    } finally {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onAbort);
    }

    if (RETRY_STATUS.has(res.status) && attempt < attempts) {
      // Honour Retry-After when the server states one; it knows better than the curve.
      const stated = Number(res.headers.get('Retry-After'));
      const wait = Number.isFinite(stated) && stated > 0 ? Math.min(stated * 1000, 8000) : backoffMs(attempt);
      if (remaining() - wait > 1500) { await sleep(wait); continue; }
    }

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
  throw lastErr || new NetworkError('Request failed', 'UNREACHABLE');
}

/** Subscribe to connectivity changes. Returns an unsubscribe function.
 *  Used by the offline banner; exported so anything else can react too. */
export function onNetworkChange(cb) {
  if (typeof window === 'undefined') return () => {};
  const online = () => cb(true);
  const offline = () => cb(false);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
}

const enc = encodeURIComponent;

// entities.<Name>.{list,filter,get,create,update,delete}
export const entities = new Proxy({}, {
  get(_t, name) {
    return {
      // `opts` carries an AbortSignal so a screen the user has already left can
      // cancel its own in-flight reads — both to stop a stale response
      // overwriting fresh state, and to free the connection.
      filter: (where = {}, sort, limit, opts) => request('POST', `/api/entities/${name}/query`, { body: { where, sort, limit }, ...opts }),
      list: (sort, limit, opts) => request('POST', `/api/entities/${name}/query`, { body: { where: {}, sort, limit }, ...opts }),
      get: (id, opts) => request('GET', `/api/entities/${name}/${enc(id)}`, { ...opts }),
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
export const fn = (name, payload = {}, opts) => request('POST', `/api/functions/${name}`, { body: payload, ...opts });

export const uploads = {
  file: (file) => { const fd = new FormData(); fd.append('file', file); return request('POST', '/api/integrations/core/upload-file', { formData: fd }); },
  privateFile: (file) => { const fd = new FormData(); fd.append('file', file); return request('POST', '/api/integrations/core/upload-private-file', { formData: fd }); },
  signedUrl: (file_uri, expires_in = 3600) => request('POST', '/api/integrations/core/create-file-signed-url', { body: { file_uri, expires_in } }),
};

// Contest fairness rule table (server-owned data; the server is the enforcer).
export const contestRules = () => request('GET', '/api/contest-rules');

// ── Development area ────────────────────────────────────────────────────────
// The autonomous build area. These go to RazeKit's own API like everything
// else — the browser never talks to the development engine directly, because
// the signed principal that identifies the account is minted server-side.
export const development = {
  status: (opts) => request('GET', '/api/development/status', { ...opts }),
  analyze: (input) => request('POST', '/api/development/tasks/analyze', { body: input }),
  list: (opts) => request('GET', '/api/development/tasks', { ...opts }),
  create: (input) => request('POST', '/api/development/tasks', { body: input }),
  get: (id, opts) => request('GET', `/api/development/tasks/${enc(id)}`, { ...opts }),
  update: (id, patch) => request('PATCH', `/api/development/tasks/${enc(id)}`, { body: patch }),
  dashboard: (id, opts) => request('GET', `/api/development/tasks/${enc(id)}/dashboard`, { ...opts }),
  acceptance: (id, opts) => request('GET', `/api/development/tasks/${enc(id)}/acceptance`, { ...opts }),
  command: (id, content) => request('POST', `/api/development/tasks/${enc(id)}/commands`, { body: { content } }),
  approveChange: (id, changeId, maxBudget) =>
    request('POST', `/api/development/tasks/${enc(id)}/changes/${enc(changeId)}/approve`, { body: { maxBudget } }),
  denyChange: (id, changeId, reason) =>
    request('POST', `/api/development/tasks/${enc(id)}/changes/${enc(changeId)}/deny`, { body: { reason } }),
  cancel: (id) => request('POST', `/api/development/tasks/${enc(id)}/cancel`),
};

export const analytics = { track: (evt) => { try { request('POST', '/api/analytics/track', { body: evt || {} }); } catch {} } };

export const api = { BASE, token, request, entities, auth, fn, uploads, analytics, contestRules, development, onNetworkChange, NetworkError };
export default api;
