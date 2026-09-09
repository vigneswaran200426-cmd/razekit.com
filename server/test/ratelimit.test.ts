import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, __resetRateLimits } from '../src/middleware/rateLimit.js';

function run(mw: any, ip = '1.2.3.4', user?: string) {
  const req: any = { headers: { 'x-forwarded-for': ip }, ip, user: user ? { id: user } : undefined };
  let status = 200; let body: any = null; const headers: any = {};
  const res: any = {
    setHeader: (k: string, v: string) => { headers[k] = v; },
    status(c: number) { status = c; return this; },
    json(b: any) { body = b; return this; },
  };
  let nexted = false;
  mw(req, res, () => { nexted = true; });
  return { status, body, headers, nexted };
}

test('requests inside the limit pass through', () => {
  __resetRateLimits();
  const mw = rateLimit('t1', 3, 60_000);
  for (let i = 0; i < 3; i++) assert.equal(run(mw).nexted, true, `request ${i + 1}`);
});

// Spec 20: rate limits on login/OTP/reset to stop credential stuffing.
test('exceeding the limit returns 429 with Retry-After', () => {
  __resetRateLimits();
  const mw = rateLimit('t2', 2, 60_000);
  run(mw); run(mw);
  const r = run(mw);
  assert.equal(r.nexted, false);
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers['Retry-After']) > 0);
});

test('the 429 message does not confirm whether an account exists', () => {
  __resetRateLimits();
  const mw = rateLimit('t3', 1, 60_000);
  run(mw);
  const r = run(mw);
  assert.match(r.body.error, /too many requests/i);
  assert.doesNotMatch(r.body.error, /account|user|email|password|exist/i);
});

test('limits are per client, not global', () => {
  __resetRateLimits();
  const mw = rateLimit('t4', 1, 60_000);
  assert.equal(run(mw, '10.0.0.1').nexted, true);
  assert.equal(run(mw, '10.0.0.1').nexted, false);  // same IP blocked
  assert.equal(run(mw, '10.0.0.2').nexted, true);   // different IP unaffected
});

test('per-user scoping survives a shared/NAT IP', () => {
  __resetRateLimits();
  const mw = rateLimit('t5', 1, 60_000, true);
  assert.equal(run(mw, '9.9.9.9', 'userA').nexted, true);
  assert.equal(run(mw, '9.9.9.9', 'userA').nexted, false);
  assert.equal(run(mw, '9.9.9.9', 'userB').nexted, true);
});
