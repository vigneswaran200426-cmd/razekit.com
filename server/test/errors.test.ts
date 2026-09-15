// Proves the five properties that make persistent error capture safe to install:
// secrets never reach the store, internals never reach the client, every error
// is individually addressable, and capture survives its own storage failing.
//
// No database: every test injects a fake entity client, so a failure here is a
// failure of the capture logic and never of the environment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REDACT,
  captureError,
  errorMiddleware,
  recentErrors,
  newErrorId,
  ERROR_AGENT_NAME,
  GENERIC_MESSAGE,
} from '../src/errors/capture.js';

// ── Fakes ────────────────────────────────────────────────────────────────────

/** Records what would have been written, so tests can inspect the stored row. */
function fakeSvc() {
  const created: any[] = [];
  return {
    created,
    entities: {
      AgentRun: {
        async create(row: any) { created.push(row); return { id: `rec_${created.length}`, ...row }; },
        async filter() { return []; },
      },
    },
  };
}

/** A store that is down. */
const brokenSvc = {
  entities: {
    AgentRun: {
      async create() { throw new Error('connect ECONNREFUSED 10.0.0.4:5432'); },
      async filter() { throw new Error('connect ECONNREFUSED 10.0.0.4:5432'); },
    },
  },
};

function runMiddleware(mw: any, err: any, reqOverrides: any = {}) {
  const req: any = {
    method: 'POST',
    originalUrl: '/api/functions/winnerFinalize?token=sk_live_abcdef123456',
    headers: {},
    user: { id: 'u_1' },
    ...reqOverrides,
  };
  let status = 0;
  let body: any = null;
  let sent = false;
  const res: any = {
    get headersSent() { return sent; },
    status(code: number) { status = code; return this; },
    json(payload: any) { body = payload; sent = true; return this; },
  };
  let nextedWith: any;
  let nexted = false;
  mw(err, req, res, (e: any) => { nexted = true; nextedWith = e; });
  return { status, body, nexted, nextedWith };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// ── REDACT: keys ─────────────────────────────────────────────────────────────

test('a password in the error context is redacted', () => {
  const out: any = REDACT({
    email: 'creator@example.com',
    password: 'hunter2',
    db_password_2: 'hunter2',
    nested: { provider: { apiKey: 'sk_live_9', 'API-KEY': 'sk_live_9' } },
    credentials: { anything: 'sk_live_9' },
  });
  assert.equal(out.password, '[redacted]');
  assert.equal(out.db_password_2, '[redacted]');
  assert.equal(out.nested.provider.apiKey, '[redacted]');
  assert.equal(out.nested.provider['API-KEY'], '[redacted]');
  // A sensitive key takes its whole subtree with it, not just its leaves.
  assert.equal(out.credentials, '[redacted]');
  // Non-secrets survive, or the log is useless.
  assert.equal(out.email, 'creator@example.com');
  assert.ok(!JSON.stringify(out).includes('hunter2'));
  assert.ok(!JSON.stringify(out).includes('sk_live_9'));
});

test('payout and auth keys are redacted; ordinary keys are not', () => {
  const out: any = REDACT({
    account_number: '000123456789', ifsc: 'HDFC0001234', upi_id: 'creator@okhdfc',
    authorization: 'Bearer abc', Cookie: 'sid=1', otp_code: '445566',
    author_id: 'u_9', badge_key: 'first_win', contest_id: 'c_1',
  });
  for (const k of ['account_number', 'ifsc', 'upi_id', 'authorization', 'Cookie', 'otp_code']) {
    assert.equal(out[k], '[redacted]', `${k} must be redacted`);
  }
  assert.equal(out.author_id, 'u_9');
  assert.equal(out.badge_key, 'first_win');
  assert.equal(out.contest_id, 'c_1');
});

// ── REDACT: values ───────────────────────────────────────────────────────────

test('a DATABASE_URL inside a message string is redacted', () => {
  const msg =
    'Error: P1001 could not reach DATABASE_URL=postgresql://razekit_user:s3cr3tP4ss@ep-cool-db-123.ap-south-1.aws.neon.tech:5432/razekit?sslmode=require';
  const out = String(REDACT(msg));
  assert.ok(!out.includes('s3cr3tP4ss'), 'the password must not survive');
  assert.ok(!out.includes('razekit_user'), 'the db user must not survive');
  assert.ok(!out.includes('neon.tech'), 'the db host must not survive');
  assert.ok(out.includes('[redacted'), 'something must mark the removal');
});

test('a bare postgres URL, a JWT and a long hex blob are all redacted', () => {
  const out = String(REDACT([
    'postgres://db.internal:5432/razekit',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1XzEifQ.9dQm3kZ0pLxVbn7YtQwErTyUiOpAsDfGhJk',
    'sig=a3f9c2b1d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff',
  ].join(' ')));
  assert.ok(!out.includes('db.internal'));
  assert.ok(!out.includes('eyJhbGciOiJIUzI1NiJ9'));
  assert.ok(!out.includes('a3f9c2b1d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff'));
});

test('REDACT never throws, not even on a hostile object', () => {
  const cyclic: any = { name: 'loop' };
  cyclic.self = cyclic;
  const hostile = {
    get boom() { throw new Error('getter exploded'); },
    cyclic,
    when: new Date('2026-01-01T00:00:00.000Z'),
    fn() { return 1; },
  };
  const out: any = REDACT(hostile);
  assert.equal(out.boom, '[redaction-failed]');
  assert.equal(out.cyclic.self, '[circular]');
  assert.equal(out.when, '2026-01-01T00:00:00.000Z');
  assert.equal(out.fn, '[function]');
});

// ── Ids ──────────────────────────────────────────────────────────────────────

test('two different errors get two different ids', async () => {
  const svc = fakeSvc();
  const a = await captureError(svc, { error: new Error('first'), service: 'test' });
  const b = await captureError(svc, { error: new Error('second'), service: 'test' });
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{12}$/);
  assert.match(b, /^[0-9a-f]{12}$/);
  // The id is the trace handle: it must be on the stored record too.
  assert.equal(svc.created.length, 2);
  assert.equal(svc.created[0].run_id, a);
  assert.equal(svc.created[1].run_id, b);
  assert.notEqual(svc.created[0].run_id, svc.created[1].run_id);
});

test('newErrorId does not repeat across many calls', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newErrorId()));
  assert.equal(ids.size, 500);
});

// ── Persistence ──────────────────────────────────────────────────────────────

test('capture never throws even when persistence fails', async () => {
  const id = await captureError(brokenSvc, { error: new Error('boom'), service: 'test' });
  assert.match(id, /^[0-9a-f]{12}$/, 'the id is still returned so the failure stays traceable');

  // Every shape of broken client: missing entity, missing method, throwing getter.
  assert.match(await captureError({}, { error: new Error('boom') }), /^[0-9a-f]{12}$/);
  assert.match(await captureError({ entities: {} }, { error: new Error('boom') }), /^[0-9a-f]{12}$/);
  assert.match(
    await captureError({ entities: { AgentRun: { create: 'not a function' } } }, { error: new Error('boom') }),
    /^[0-9a-f]{12}$/
  );
  const throwingSvc = { get entities(): any { throw new Error('client exploded'); } };
  assert.match(await captureError(throwingSvc, { error: new Error('boom') }), /^[0-9a-f]{12}$/);

  // And a non-Error thrown value must not break the describe step.
  assert.match(await captureError(brokenSvc, { error: { weird: true } as any }), /^[0-9a-f]{12}$/);
  assert.match(await captureError(brokenSvc, { error: null }), /^[0-9a-f]{12}$/);
});

test('the persisted record is distinguishable and carries no secret', async () => {
  const svc = fakeSvc();
  const err: any = new Error('write failed for postgres://u:p@db.internal:5432/razekit');
  err.config = { headers: { Authorization: 'Bearer sk_live_1234567890' } };
  await captureError(svc, {
    error: err,
    service: 'payments',
    route: 'POST /api/payments/funding',
    severity: 'fatal',
    userId: 'u_7',
    context: { password: 'hunter2', contest_id: 'c_1' },
  });

  const row = svc.created[0];
  assert.equal(row.agent_name, ERROR_AGENT_NAME, 'errors must be separable from real agent runs');
  assert.equal(row.provider, 'payments');
  assert.equal(row.triggered_by, 'u_7');

  const blob = JSON.stringify(row);
  assert.ok(!blob.includes('hunter2'));
  assert.ok(!blob.includes('sk_live_1234567890'));
  assert.ok(!blob.includes('db.internal'));
  assert.ok(blob.includes('c_1'), 'non-secret context must survive or the record is useless');
  const detail = JSON.parse(row.output_summary);
  assert.equal(detail.severity, 'fatal');
  assert.equal(detail.error_id, row.run_id);
});

// ── Middleware: what the client sees ─────────────────────────────────────────

test('a stack trace never reaches the client body', async () => {
  const svc = fakeSvc();
  const err: any = new Error('Cannot read properties of undefined (reading \'prize_amount_minor\')');
  err.stack = [
    "TypeError: Cannot read properties of undefined (reading 'prize_amount_minor')",
    '    at settleContest (/home/app/server/src/finance/settle.ts:212:34)',
    '    at Layer.handle (/home/app/server/node_modules/express/lib/router/layer.js:95:5)',
  ].join('\n');

  const r = runMiddleware(errorMiddleware({ service: 'api', svc }), err);
  await tick();

  const body = JSON.stringify(r.body);
  assert.equal(r.status, 500);
  assert.equal(r.body.error, GENERIC_MESSAGE);
  assert.ok(!body.includes('    at '), 'no stack frames');
  assert.ok(!body.includes('/home/app'), 'no server filesystem path');
  assert.ok(!body.includes('node_modules'));
  assert.ok(!body.includes('settle.ts'));
  assert.ok(!body.includes('prize_amount_minor'), 'no internal field names');
  assert.deepEqual(Object.keys(r.body).sort(), ['error', 'error_id'], 'the body carries nothing else');

  // The stack is not lost — it is kept where only an admin can read it.
  const detail = JSON.parse(svc.created[0].output_summary);
  assert.ok(String(detail.stack).includes('settle.ts'), 'the stack is preserved for debugging');
  assert.equal(svc.created[0].run_id, r.body.error_id, 'the response id finds the record');
});

test('a SQL fragment and a connection string never reach the client body', async () => {
  const svc = fakeSvc();
  const err = new Error(
    'insert into "records" ("id","data") values ($1,$2) failed: connection to postgresql://razekit:s3cr3t@db.internal:5432/razekit refused'
  );
  const r = runMiddleware(errorMiddleware({ service: 'api', svc }), err);
  await tick();
  const body = JSON.stringify(r.body);
  assert.equal(r.body.error, GENERIC_MESSAGE);
  assert.ok(!body.includes('insert into'));
  assert.ok(!body.includes('s3cr3t'));
  assert.ok(!body.includes('db.internal'));
});

test('a deliberate 4xx message still reaches the user, with its id', async () => {
  const svc = fakeSvc();
  const err: any = new Error('Contest deadline has passed.');
  err.status = 400;
  const r = runMiddleware(errorMiddleware({ service: 'api', svc }), err);
  await tick();
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'Contest deadline has passed.');
  assert.match(r.body.error_id, /^[0-9a-f]{12}$/);
});

test('a 4xx message that describes our internals is replaced, not trimmed', async () => {
  const svc = fakeSvc();
  const cases = [
    'ENOTFOUND db.internal',
    'Invalid `prisma.record.findMany()` invocation',
    'failed reading /home/app/server/src/config.ts',
    'token=sk_live_abcdef1234567890 was rejected',
  ];
  for (const message of cases) {
    const err: any = new Error(message);
    err.status = 400;
    const r = runMiddleware(errorMiddleware({ service: 'api', svc }), err);
    assert.equal(r.body.error, GENERIC_MESSAGE, `must not echo: ${message}`);
  }
  await tick();
});

test('the middleware answers the request even when the error store is down', async () => {
  const r = runMiddleware(errorMiddleware({ service: 'api', svc: brokenSvc }), new Error('boom'));
  await tick();
  assert.equal(r.status, 500);
  assert.equal(r.body.error, GENERIC_MESSAGE);
  assert.match(r.body.error_id, /^[0-9a-f]{12}$/);
  assert.equal(r.nexted, false);
});

test('the middleware answers even when building the entity client throws', async () => {
  const mw = errorMiddleware({ service: 'api', svc: () => { throw new Error('no client'); } });
  const r = runMiddleware(mw, new Error('boom'));
  await tick();
  assert.equal(r.status, 500);
  assert.match(r.body.error_id, /^[0-9a-f]{12}$/);
});

test('an already-started response is handed to Express instead of being double-written', () => {
  const svc = fakeSvc();
  const mw = errorMiddleware({ service: 'api', svc });
  const err = new Error('boom');
  const res: any = { headersSent: true, status() { return this; }, json() { return this; } };
  let nextedWith: any;
  mw(err, { method: 'GET', headers: {} } as any, res, (e: any) => { nextedWith = e; });
  assert.equal(nextedWith, err);
});

test('the stored route drops the query string', async () => {
  const svc = fakeSvc();
  const r = runMiddleware(errorMiddleware({ service: 'api', svc }), new Error('boom'));
  await tick();
  const detail = JSON.parse(svc.created[0].output_summary);
  assert.equal(detail.route, 'POST /api/functions/winnerFinalize');
  assert.ok(!JSON.stringify(svc.created[0]).includes('sk_live_abcdef123456'));
  assert.equal(r.status, 500);
});

test('a request id is used when the caller sent one, and is null otherwise', async () => {
  const svc = fakeSvc();
  runMiddleware(errorMiddleware({ service: 'api', svc }), new Error('a'), { headers: { 'x-request-id': 'req-77' } });
  runMiddleware(errorMiddleware({ service: 'api', svc }), new Error('b'), { headers: {} });
  await tick();
  assert.equal(svc.created[0].input_ref, 'req-77');
  assert.equal(svc.created[1].input_ref, null, 'never invented');
});

// ── Read side ────────────────────────────────────────────────────────────────

test('recentErrors reports unavailability instead of an empty list', async () => {
  const r = await recentErrors(brokenSvc, { limit: 10 });
  assert.equal(r.ok, false);
  assert.equal(r.returned, null, 'an unread store is not zero errors');
  assert.equal(r.total, null);
  assert.deepEqual(r.errors, []);
  assert.ok(r.reason);

  const missing = await recentErrors({}, { limit: 10 });
  assert.equal(missing.ok, false);
  assert.equal(missing.returned, null);
});

test('recentErrors maps stored rows and hides the stack by default', async () => {
  const row = {
    id: 'rec_1',
    run_id: 'a3f9c2b1d4e5',
    provider: 'api',
    input_ref: 'req-1',
    triggered_by: 'u_1',
    error: 'boom',
    output_summary: JSON.stringify({
      kind: 'error', error_id: 'a3f9c2b1d4e5', severity: 'error', service: 'api',
      route: 'POST /api/x', name: 'TypeError', message: 'boom', status: 500,
      context: { contest_id: 'c_1' }, stack: 'at /home/app/src/x.ts:1:1',
      captured_at: '2026-09-15T10:00:00.000Z',
    }),
  };
  const svc = { entities: { AgentRun: { async filter() { return [row]; } } } };

  const r = await recentErrors(svc, { limit: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.returned, 1);
  assert.equal(r.total, null, 'a total was never measured');
  assert.equal(r.errors[0].error_id, 'a3f9c2b1d4e5');
  assert.equal(r.errors[0].route, 'POST /api/x');
  assert.equal(r.errors[0].stack, undefined, 'stacks are opt-in');

  const withStack = await recentErrors(svc, { limit: 10, includeStack: true });
  assert.ok(String(withStack.errors[0].stack).includes('x.ts'));
});

test('recentErrors queries only error records and filters by severity', async () => {
  let seenQuery: any = null;
  const rows = [
    { run_id: '1', output_summary: JSON.stringify({ severity: 'fatal', captured_at: '2026-09-15T10:00:00.000Z' }) },
    { run_id: '2', output_summary: JSON.stringify({ severity: 'warn', captured_at: '2026-09-15T10:00:00.000Z' }) },
  ];
  const svc = {
    entities: {
      AgentRun: {
        async filter(query: any, sort: string, limit: number) {
          seenQuery = { query, sort, limit };
          return rows;
        },
      },
    },
  };
  const r = await recentErrors(svc, { limit: 10, severity: 'fatal', service: 'payments' });
  assert.equal(seenQuery.query.agent_name, ERROR_AGENT_NAME);
  assert.equal(seenQuery.query.provider, 'payments');
  assert.equal(seenQuery.sort, '-created_date');
  assert.equal(r.returned, 1);
  assert.equal(r.errors[0].error_id, '1');
});
