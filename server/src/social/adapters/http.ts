// Shared HTTP for every adapter.
//
// Each provider signals the same conditions in a different dialect — Meta uses
// error.code, TikTok a nested error.code string, Reddit a bare 429 with
// X-Ratelimit headers, X a `status` on a problem object. The sync layer must
// not care: it needs to know only "reconnect", "back off", "gone", or "broken",
// so every adapter maps into AdapterError here rather than leaking provider
// shapes upward.
import { AdapterError, type AdapterErrorKind } from './types.js';

/** Providers are a dependency, not a hang. Nothing waits longer than this. */
const TIMEOUT_MS = 12_000;

export interface HttpOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  timeoutMs?: number;
}

function kindFromStatus(status: number): AdapterErrorKind {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status === 404 || status === 410) return 'not_found';
  return 'provider_error';
}

/** Retry-After is seconds or an HTTP-date; both appear in the wild. */
function retryAfter(res: Response): number | undefined {
  const raw = res.headers.get('retry-after');
  if (!raw) {
    // Reddit does not send Retry-After; it sends a reset countdown instead.
    const reset = res.headers.get('x-ratelimit-reset');
    const n = Number(reset);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  const secs = Number(raw);
  if (Number.isFinite(secs)) return secs;
  const when = Date.parse(raw);
  return Number.isFinite(when) ? Math.max(0, Math.round((when - Date.now()) / 1000)) : undefined;
}

/**
 * JSON request with a deadline and uniform error mapping.
 *
 * Returns parsed JSON on 2xx and throws AdapterError otherwise. It never
 * returns a partial or a null body dressed up as success — a caller that gets a
 * value from this function can trust the provider actually answered.
 */
export async function requestJson<T = any>(url: string, opts: HttpOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method || 'GET',
      headers: { accept: 'application/json', ...(opts.headers || {}) },
      body: opts.body as any,
      signal: controller.signal,
    });
  } catch (e: any) {
    // An aborted request and a DNS failure are both "the provider did not
    // answer" — neither is evidence about the creator's post.
    throw new AdapterError('provider_error', e?.name === 'AbortError' ? 'Provider timed out' : `Network error: ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text().catch(() => '');
  let json: any = null;
  if (text) { try { json = JSON.parse(text); } catch { /* non-JSON error body */ } }

  if (!res.ok) {
    const detail =
      json?.error?.message            // Meta, Instagram, Threads
      || json?.error?.error_description
      || json?.error_description       // Reddit token endpoint
      || json?.error?.code             // TikTok
      || json?.detail || json?.title   // X problem objects
      || json?.message
      || text.slice(0, 200)
      || res.statusText;
    throw new AdapterError(kindFromStatus(res.status), `${res.status}: ${detail}`, retryAfter(res));
  }

  // TikTok answers 200 with an error object inside; treat that as a failure.
  const tiktokErr = json?.error?.code;
  if (tiktokErr && String(tiktokErr).toLowerCase() !== 'ok') {
    const kind: AdapterErrorKind =
      /access_token|scope|unauthor/i.test(String(tiktokErr)) ? 'unauthorized'
        : /rate|limit/i.test(String(tiktokErr)) ? 'rate_limited'
          : 'provider_error';
    throw new AdapterError(kind, `TikTok: ${tiktokErr} ${json?.error?.message || ''}`.trim());
  }

  return json as T;
}

/** Form-encoded POST, which is what every one of these token endpoints wants. */
export function form(params: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) p.set(k, v);
  return p;
}

/** HTTP Basic, used by Reddit and X for token exchange. */
export const basicAuth = (id: string, secret: string): string =>
  'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');

/** A finite non-negative number, or undefined. Never coerces absence to 0. */
export function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
