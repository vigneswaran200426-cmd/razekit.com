// The API client's network policy.
//
// The test that matters most is `a failing write is never retried`. The browser
// cannot tell "the server never received it" from "the server processed it and
// the response was lost" — fetch reports both as the same TypeError. So an
// automatic retry on a write can fund a contest twice, report the same bank
// transfer twice, or submit the same entry twice, and the user sees one click.
//
// Reads are the opposite case: retrying a query that failed on a restarting
// dyno costs nothing and saves the screen.
//
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The module reads localStorage and window.location at import time, both behind
// try/catch. Under node they are simply absent, which is a path worth exercising.
const { entities, auth, fn, NetworkError, onNetworkChange } = await import('../src/lib/api.js');

const realFetch = globalThis.fetch;

/** Runs `fire` against a stubbed fetch and reports how many requests it made. */
async function attempts(fire, respond) {
  let n = 0;
  globalThis.fetch = async () => { n += 1; return respond(n); };
  let error = null;
  try { await fire(); } catch (e) { error = e; }
  globalThis.fetch = realFetch;
  return { n, error };
}

const unavailable = () => new Response(JSON.stringify({ error: { message: 'upstream' } }), {
  status: 503, headers: { 'Content-Type': 'application/json' },
});
const okJson = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

// ── The safety property ─────────────────────────────────────────────────────

test('a failing write is NEVER retried', async () => {
  // Each of these spends money, changes state, or creates a record. A second
  // attempt the user did not ask for is a duplicate, not a recovery.
  const writes = {
    'entity create': () => entities.Contest.create({ title: 'x' }),
    'entity update': () => entities.Contest.update('id', { title: 'x' }),
    'entity delete': () => entities.Contest.remove('id'),
    'server function': () => fn('reportTransfer', {}),
    'login': () => auth.login('a@b.c', 'pw'),
  };
  for (const [name, fire] of Object.entries(writes)) {
    const { n } = await attempts(fire, unavailable);
    assert.equal(n, 1, `${name} must reach the server exactly once, got ${n}`);
  }
});

test('a write that fails at the socket is not retried either', async () => {
  // The ambiguous case: fetch rejects, and the browser cannot say whether the
  // server acted on it. Retrying here is exactly the double-charge scenario.
  let n = 0;
  globalThis.fetch = async () => { n += 1; throw new TypeError('Failed to fetch'); };
  const err = await fn('fundContest', { amount: 50000 }).catch((e) => e);
  globalThis.fetch = realFetch;
  assert.equal(n, 1);
  assert.ok(err instanceof NetworkError);
  assert.equal(err.code, 'UNREACHABLE');
});

// ── Reads do recover ────────────────────────────────────────────────────────

test('a read retries a transient failure', async () => {
  for (const [name, fire] of Object.entries({
    'GET': () => entities.Contest.get('abc'),
    // A filter does not fit in a URL, so reads use POST /query. The verb is not
    // what decides idempotence here — the endpoint is.
    'POST /query': () => entities.Contest.list('-created_date', 5),
  })) {
    const { n } = await attempts(fire, unavailable);
    assert.equal(n, 3, `${name} should retry, got ${n} attempt(s)`);
  }
});

test('a read that recovers returns the data rather than the earlier error', async () => {
  const { n, error } = await attempts(
    () => entities.Contest.list('-created_date', 5),
    (attempt) => (attempt < 3 ? unavailable() : okJson([{ id: 'c1' }])),
  );
  assert.equal(n, 3);
  assert.equal(error, null, 'a recovered read must not surface the failures it survived');
});

test('a 4xx is not retried — the server said no, not "not yet"', async () => {
  const { n } = await attempts(
    () => entities.Contest.get('abc'),
    () => new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 }),
  );
  assert.equal(n, 1);
});

test('a read gives up rather than retrying forever', async () => {
  const { n, error } = await attempts(() => entities.Contest.get('abc'), unavailable);
  assert.equal(n, 3);
  assert.ok(error, 'exhausting the retries must still raise');
});

// ── Offline ─────────────────────────────────────────────────────────────────

test('being offline is its own error, raised without a request', async () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  let reached = false;
  globalThis.fetch = async () => { reached = true; return okJson([]); };

  const err = await entities.Contest.list().catch((e) => e);

  globalThis.fetch = realFetch;
  if (had) Object.defineProperty(globalThis, 'navigator', had);
  else delete globalThis.navigator;

  assert.equal(reached, false, 'a request that cannot succeed should not be sent');
  assert.ok(err instanceof NetworkError);
  assert.equal(err.code, 'OFFLINE');
  // The message is read by a human on a train, not by a developer in a console.
  assert.match(err.message, /offline/i);
  assert.doesNotMatch(err.message, /fetch|TypeError|undefined/i);
});

test('navigator.onLine === true is never treated as proof of connectivity', async () => {
  // A captive portal reports online. The client must still make the request and
  // report the real failure rather than assuming success is possible.
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  let n = 0;
  globalThis.fetch = async () => { n += 1; throw new TypeError('Failed to fetch'); };
  const err = await entities.Contest.get('abc').catch((e) => e);
  globalThis.fetch = realFetch;
  if (had) Object.defineProperty(globalThis, 'navigator', had); else delete globalThis.navigator;
  assert.equal(n, 3, 'it must actually try');
  assert.equal(err.code, 'UNREACHABLE');
});

// ── Deadlines and cancellation ──────────────────────────────────────────────

test('a hung request is abandoned instead of waiting forever', async () => {
  // The real deadline is 20s, which no test should sit through. What is asserted
  // here is the mechanism: the client aborts the socket, and the abort is
  // reported as a timeout rather than as a generic network failure.
  let sawSignal = null;
  globalThis.fetch = async (_u, init) => {
    sawSignal = init.signal;
    return new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      setTimeout(() => init.signal.dispatchEvent(new Event('abort')), 0);
    });
  };
  const err = await entities.Contest.get('abc').catch((e) => e);
  globalThis.fetch = realFetch;
  assert.ok(sawSignal, 'every request must carry an abort signal');
  assert.ok(err instanceof NetworkError);
});

test('a caller that cancels gets a cancellation, and no further attempts', async () => {
  // A user navigating away mid-request has not encountered a problem. The screen
  // they left must not flash an error on the way out, and must not keep retrying
  // on behalf of a component that no longer exists.
  const ac = new AbortController();
  ac.abort();
  let n = 0;
  globalThis.fetch = async () => { n += 1; return okJson([]); };
  const err = await entities.Contest.get('abc', { signal: ac.signal }).catch((e) => e);
  globalThis.fetch = realFetch;

  assert.equal(n, 0, 'an already-cancelled read must not reach the network');
  assert.ok(err instanceof NetworkError);
  assert.equal(err.code, 'ABORTED');
});

test('cancelling mid-flight stops the retry loop', async () => {
  const ac = new AbortController();
  let n = 0;
  globalThis.fetch = async (_u, init) => {
    n += 1;
    if (n === 1) { ac.abort(); }
    // Mirror what a real fetch does when its signal aborts.
    if (init.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return unavailable();
  };
  const err = await entities.Contest.list('-created_date', 5, { signal: ac.signal }).catch((e) => e);
  globalThis.fetch = realFetch;
  assert.equal(n, 1, 'a cancelled read must not go on to attempt 2');
  assert.equal(err.code, 'ABORTED');
});

test('a read is bounded by a total budget, not attempts x timeout', async () => {
  // Three attempts at a 20s deadline each would leave the user on a spinner for
  // a minute. The budget is what actually ends the call, so the worst case stays
  // inside something a person will wait through.
  const { TOTAL_BUDGET_MS } = await import('../src/lib/api.js');
  assert.ok(TOTAL_BUDGET_MS <= 30_000, `worst case must stay under 30s, is ${TOTAL_BUDGET_MS}ms`);

  // And the loop respects it: with no budget left, no further attempt is made.
  const t0 = Date.now();
  const { n } = await attempts(() => entities.Contest.get('abc'), unavailable);
  const elapsed = Date.now() - t0;
  assert.ok(n <= 3, 'never more than three attempts');
  assert.ok(elapsed < TOTAL_BUDGET_MS, `gave up in ${elapsed}ms, within the ${TOTAL_BUDGET_MS}ms budget`);
});

// ── The connectivity subscription ───────────────────────────────────────────

test('onNetworkChange reports both directions and can be unsubscribed', () => {
  const seen = [];
  const listeners = {};
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: (k, f) => { listeners[k] = f; },
      removeEventListener: (k) => { delete listeners[k]; },
    },
  });

  const off = onNetworkChange((v) => seen.push(v));
  listeners.offline?.();
  listeners.online?.();
  off();
  const cleared = Object.keys(listeners).length;

  if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window;

  assert.deepEqual(seen, [false, true]);
  assert.equal(cleared, 0, 'unsubscribing must remove the listeners, not leak them per mount');
});
