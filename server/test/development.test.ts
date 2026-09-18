// The RazeKit ↔ RazeKit DEV trust boundary.
//
// The Development area hands a user's identity to a separate engine that has no
// user table of its own. Everything that keeps that safe is in this file's
// scope: the principal is signed, it names the right tenant, it expires, the
// browser can never reach the engine's administrative surface, and one
// account's task is never reachable from another's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.DEV_ENGINE_URL = 'http://dev-engine.test';
process.env.DEV_PRINCIPAL_SECRET = 'test-principal-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
// Deliberately NOT setting DEV_AREA_ENABLED, so the default is what gets tested.

const { callDevEngine, DevEngineError, tenantIdFor, developmentConfigured } = await import(
  '../src/development/client.js'
);

type Capture = { url: string; init: RequestInit };

/** Replaces fetch for one call and hands back what the client actually sent. */
async function capture(
  fn: () => Promise<unknown>,
  respondWith: { status?: number; body?: unknown } = {}
): Promise<{ sent: Capture | null; error: unknown; result: unknown }> {
  const original = globalThis.fetch;
  let sent: Capture | null = null;

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent = { url: String(url), init };
    const status = respondWith.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(respondWith.body ?? { ok: true }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    // Awaited into a local first: an object literal reads `sent` before the
    // await resolves, which would capture it as null on every success.
    const result = await fn();
    return { sent, error: null, result };
  } catch (error) {
    return { sent, error, result: null };
  } finally {
    globalThis.fetch = original;
  }
}

function decodePrincipal(token: string) {
  const [payload, signature] = token.split('.');
  const expected = createHmac('sha256', 'test-principal-secret').update(payload).digest('base64url');
  return {
    claims: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    signatureValid: signature === expected,
  };
}

const creator = { id: 'user_creator_1', role: 'user', user_role: 'creator' };
const client = { id: 'user_client_2', role: 'user', user_role: 'client' };

test('the area reports itself configured only when it actually is', () => {
  assert.equal(developmentConfigured(), true);
});

test('the area is off unless a deployment deliberately turns it on', async () => {
  const { config } = await import('../src/config.js');

  // A fully-configured engine is NOT enough. Whether this area exists for users
  // is a product decision, and it defaults to no — which is also what keeps an
  // unfinished area off production if its code reaches main early.
  assert.equal(config.development.enabled, false);
  assert.ok(config.development.engineUrl, 'the engine is configured in this test');
  assert.ok(config.development.principalSecret, 'the secret is configured in this test');
});

test('only an exact opt-in turns the area on', async () => {
  const previous = process.env.DEV_AREA_ENABLED;
  // Anything other than the literal "true" leaves it off: a half-set variable
  // must not half-enable a feature.
  for (const value of ['', 'false', '1', 'yes', 'TRUE', 'on']) {
    process.env.DEV_AREA_ENABLED = value;
    const fresh = await import(`../src/config.js?enabled=${encodeURIComponent(value)}`);
    assert.equal(
      fresh.config.development.enabled,
      false,
      `DEV_AREA_ENABLED=${JSON.stringify(value)} must not enable the area`,
    );
  }

  process.env.DEV_AREA_ENABLED = 'true';
  const on = await import('../src/config.js?enabled=true-exact');
  assert.equal(on.config.development.enabled, true);

  if (previous === undefined) delete process.env.DEV_AREA_ENABLED;
  else process.env.DEV_AREA_ENABLED = previous;
});

test('a RazeKit account maps to exactly one development tenant', () => {
  assert.equal(tenantIdFor(creator), 'rk-user-user_creator_1');
  assert.notEqual(tenantIdFor(creator), tenantIdFor(client));
  // Prefixed, so a tenant id can never be mistaken for a bare RazeKit user id.
  assert.ok(tenantIdFor(creator).startsWith('rk-user-'));
});

test('every call carries a signed principal naming that caller', async () => {
  const { sent } = await capture(() =>
    callDevEngine({ method: 'GET', path: '/api/tasks', user: creator })
  );

  assert.ok(sent, 'the client should have called the engine');
  const headers = sent!.init.headers as Record<string, string>;
  const token = headers['x-razekit-principal'];
  assert.ok(token, 'a principal must be sent');

  const { claims, signatureValid } = decodePrincipal(token);
  assert.equal(signatureValid, true, 'the principal must be signed with the shared secret');
  assert.equal(claims.userId, creator.id);
  assert.equal(claims.tenantId, tenantIdFor(creator));
  assert.ok(claims.exp > Date.now(), 'the principal must not be issued already expired');
  assert.ok(claims.exp - Date.now() <= 10 * 60_000, 'a per-request principal must be short-lived');
});

test('two accounts never present the same principal', async () => {
  const a = await capture(() => callDevEngine({ method: 'GET', path: '/api/tasks', user: creator }));
  const b = await capture(() => callDevEngine({ method: 'GET', path: '/api/tasks', user: client }));

  const tokenA = (a.sent!.init.headers as Record<string, string>)['x-razekit-principal'];
  const tokenB = (b.sent!.init.headers as Record<string, string>)['x-razekit-principal'];

  assert.notEqual(tokenA, tokenB);
  assert.notEqual(decodePrincipal(tokenA).claims.tenantId, decodePrincipal(tokenB).claims.tenantId);
});

test('a user request can never reach the engine internal surface', async () => {
  // /internal/* registers workers, leases credentials and invokes tools
  // directly. Nothing a browser asks for may be routed there, whatever the
  // caller puts in the URL.
  for (const path of [
    '/internal/agents/agent_1/tools/invoke',
    '/internal/infrastructure/workers/register',
    '/internal/admin/audit',
  ]) {
    const { sent, error } = await capture(() =>
      callDevEngine({ method: 'POST', path, user: creator })
    );
    assert.equal(sent, null, `${path} must not be sent to the engine at all`);
    assert.ok(error instanceof DevEngineError);
    assert.match((error as Error).message, /public task API/);
  }
});

test('the principal secret never leaves the server', async () => {
  const { sent } = await capture(() =>
    callDevEngine({ method: 'POST', path: '/api/tasks', user: creator, body: { taskType: 'website' } })
  );

  const serialised = JSON.stringify(sent);
  assert.ok(
    !serialised.includes('test-principal-secret'),
    'the signing secret must never appear in an outbound request'
  );
});

test('a tenant rejection is reported as forbidden, not as a bad request', async () => {
  // The engine answers 400 for everything. Passing that through would tell a
  // user their request was malformed when in fact it was another tenant's task.
  const { error } = await capture(
    () => callDevEngine({ method: 'GET', path: '/api/tasks/task_other', user: creator }),
    { status: 400, body: { error: 'Tenant access denied' } }
  );

  assert.ok(error instanceof DevEngineError);
  assert.equal((error as DevEngineError).status, 403);
});

test('a missing task is reported as missing', async () => {
  const { error } = await capture(
    () => callDevEngine({ method: 'GET', path: '/api/tasks/task_gone', user: creator }),
    { status: 400, body: { error: 'Task not found' } }
  );

  assert.equal((error as DevEngineError).status, 404);
});

test('an unreachable engine fails the request rather than the process', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('ECONNREFUSED');
  }) as typeof globalThis.fetch;

  try {
    await assert.rejects(
      () => callDevEngine({ method: 'GET', path: '/api/tasks', user: creator }),
      (e: unknown) => e instanceof DevEngineError && (e as DevEngineError).status === 504
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('the request reaches the engine unchanged apart from identity', async () => {
  const body = { taskType: 'game', title: 'Platformer', maxBudget: 40 };
  const { sent } = await capture(() =>
    callDevEngine({ method: 'POST', path: '/api/tasks', user: client, body })
  );

  assert.equal(sent!.url, 'http://dev-engine.test/api/tasks');
  assert.equal(sent!.init.method, 'POST');
  // taskType must survive untouched: it is what routes a game to Konami and an
  // app or website to Niomi, and RazeKit never picks the agent itself.
  assert.deepEqual(JSON.parse(String(sent!.init.body)), body);
});
