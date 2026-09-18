import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import type { RlsUser } from '../entities/rls.js';

// The client half of the RazeKit ↔ RazeKit DEV boundary.
//
// RazeKit owns identity; the DEV engine owns autonomous execution. Rather than
// giving the engine a second user table, RazeKit vouches for the caller with a
// short-lived signed principal, and the engine treats that as its tenant/user.
// A RazeKit account therefore maps to exactly one DEV tenant, and nobody signs
// in twice.
//
// The browser never reaches the engine. Every call goes through RazeKit's own
// API, which is why the signing secret and the engine's admin token can stay
// server-side.

export class DevEngineError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DevEngineError';
    this.status = status;
  }
}

export function developmentConfigured(): boolean {
  return Boolean(config.development.engineUrl && config.development.principalSecret);
}

/**
 * The DEV tenant for a RazeKit account.
 *
 * Prefixed rather than bare so a DEV tenant id can never be confused with a
 * RazeKit user id in a log, and so a future org-level tenant can be introduced
 * without colliding with the per-user ones already in the engine's store.
 */
export function tenantIdFor(user: RlsUser): string {
  return `rk-user-${user.id}`;
}

/**
 * Mints the signed principal the engine verifies.
 *
 * Mirrors issuePrincipalToken() in razekit-dev/src/tenant-security.js: a
 * base64url payload and an HMAC-SHA256 signature over it, joined with a dot.
 * The TTL is deliberately short — the token is minted per request, so it never
 * needs to outlive one.
 */
function signPrincipal(user: RlsUser): string {
  const secret = config.development.principalSecret;
  if (!secret) throw new Error('DEV_PRINCIPAL_SECRET is not configured');

  const payload = Buffer.from(
    JSON.stringify({
      tenantId: tenantIdFor(user),
      userId: user.id,
      exp: Date.now() + config.development.principalTtlMs,
    })
  ).toString('base64url');

  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

type DevRequest = {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  user: RlsUser;
  body?: unknown;
  requestId?: string;
};

/**
 * Calls the DEV engine as the given RazeKit user.
 *
 * `path` must be one of the engine's public task routes. The internal
 * (`/internal/...`) surface is administrative — worker registration, credential
 * leases, raw tool invocation — and is never reachable through a user request,
 * so it is rejected here rather than relying on the caller to be careful.
 */
export async function callDevEngine<T = unknown>({
  method,
  path,
  user,
  body,
  requestId,
}: DevRequest): Promise<T> {
  if (!developmentConfigured()) {
    throw new DevEngineError('The Development area is not configured on this deployment', 503);
  }
  if (!path.startsWith('/api/')) {
    throw new DevEngineError('Only the public task API may be called on behalf of a user', 500);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.development.timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${config.development.engineUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        // The engine is configured with RAZEKIT_REQUIRE_SIGNED_PRINCIPAL=true in
        // production, so the unsigned tenant/user headers it also understands
        // are ignored — a caller cannot assert an identity by asking for one.
        'x-razekit-principal': signPrincipal(user),
        ...(requestId ? { 'x-razekit-request-id': requestId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    throw new DevEngineError(
      aborted ? 'The development engine did not respond in time' : 'The development engine is unreachable',
      504
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new DevEngineError('The development engine returned an unreadable response', 502);
    }
  }

  if (!response.ok) {
    const message = (payload as { error?: string } | null)?.error || 'The development engine rejected the request';
    // The engine answers 400 for everything from a validation failure to a
    // tenant mismatch. A tenant or access failure is a 403 to the user, not a
    // "bad request" — and it must not read as "this task does not exist",
    // because that is a different, checkable fact.
    const status = /access denied|suspended/i.test(message)
      ? 403
      : /not found/i.test(message)
        ? 404
        : response.status;
    throw new DevEngineError(message, status);
  }

  return payload as T;
}
