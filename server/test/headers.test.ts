// Security header tests.
//
// These assert the headers are actually emitted, because a security header is
// the kind of thing that gets refactored away silently: nothing breaks when it
// disappears, and nobody notices until it matters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { securityHeaders } from '../src/security/headers.js';

function run(reqOverrides: any = {}) {
  const headers: Record<string, string> = {};
  const removed: string[] = [];
  const req: any = { headers: {}, secure: false, ...reqOverrides };
  const res: any = {
    setHeader: (k: string, v: string) => { headers[k] = v; },
    removeHeader: (k: string) => { removed.push(k); },
  };
  let nexted = false;
  securityHeaders()(req, res, () => { nexted = true; });
  return { headers, removed, nexted };
}

test('the framework does not announce itself', () => {
  const { removed } = run();
  assert.ok(removed.includes('X-Powered-By'));
});

test('a JSON response cannot be sniffed as HTML', () => {
  assert.equal(run().headers['X-Content-Type-Options'], 'nosniff');
});

test('the API cannot be framed', () => {
  const { headers } = run();
  assert.equal(headers['X-Frame-Options'], 'DENY');
  // Two mechanisms on purpose: X-Frame-Options for old clients, CSP for current
  // ones. frame-ancestors is what modern browsers actually honour.
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
});

test('the CSP denies everything by default', () => {
  const csp = run().headers['Content-Security-Policy'];
  assert.match(csp, /default-src 'none'/);
  // base-uri and form-action close the two holes default-src does not cover.
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /form-action 'none'/);
});

test('ids do not leak through the Referer header', () => {
  assert.equal(run().headers['Referrer-Policy'], 'no-referrer');
});

test('HSTS is sent behind a TLS-terminating proxy', () => {
  // Render terminates TLS and forwards x-forwarded-proto, so req.secure is false
  // even on a genuinely https request. Reading only req.secure would mean HSTS
  // never shipped in production — which is exactly where it is needed.
  const { headers } = run({ headers: { 'x-forwarded-proto': 'https' } });
  assert.match(headers['Strict-Transport-Security'], /max-age=31536000/);
  assert.match(headers['Strict-Transport-Security'], /includeSubDomains/);
});

test('HSTS is NOT sent over plain http', () => {
  // Pinning localhost to https for a year is a genuinely painful thing to
  // debug, so a dev server must never emit this.
  assert.equal(run().headers['Strict-Transport-Security'], undefined);
  assert.equal(
    run({ headers: { 'x-forwarded-proto': 'http' } }).headers['Strict-Transport-Security'],
    undefined,
  );
});

test('the middleware always continues the chain', () => {
  assert.equal(run().nexted, true);
  assert.equal(run({ headers: { 'x-forwarded-proto': 'https' } }).nexted, true);
});
