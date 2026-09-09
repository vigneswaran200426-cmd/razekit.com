import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDestinationUrl } from '../src/traffic/url.js';
import { classifyClick, countsTowardScore, dedupeKey, visitorHash, STATE } from '../src/traffic/fraud.js';

const link = { id: 'l1', code: 'abc123', status: 'active', creator_id: 'creator-1' };

// ---- Open redirect / SSRF (spec §5, §22) ----
test('rejects non-http protocols (open redirect / XSS vectors)', () => {
  for (const u of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'ftp://x.com']) {
    assert.equal(validateDestinationUrl(u).ok, false, u);
  }
});

test('rejects internal / private / metadata hosts (SSRF)', () => {
  for (const u of ['http://localhost/x', 'http://127.0.0.1', 'http://10.0.0.5', 'http://192.168.1.1',
                   'http://172.16.0.1', 'http://169.254.169.254/latest/meta-data',
                   'http://metadata.google.internal', 'http://0.0.0.0', 'http://api.internal']) {
    assert.equal(validateDestinationUrl(u).ok, false, u);
  }
});

test('rejects embedded credentials and junk', () => {
  assert.equal(validateDestinationUrl('https://user:pass@evil.com').ok, false);
  assert.equal(validateDestinationUrl('').ok, false);
  assert.equal(validateDestinationUrl('not a url').ok, false);
});

test('accepts real public brand destinations', () => {
  const r = validateDestinationUrl('https://nike.com/launch?utm_source=razekit');
  assert.equal(r.ok, true);
  assert.match(r.url, /^https:\/\/nike\.com\/launch/);
  assert.equal(validateDestinationUrl('http://example.co.uk/a/b').ok, true);
});

// ---- Fraud filtering (spec §21) ----
test('bots and automated agents are rejected', () => {
  for (const ua of ['Googlebot/2.1', 'curl/8.0', 'python-requests/2.31', 'HeadlessChrome', 'Scrapy']) {
    assert.equal(classifyClick(link, { userAgent: ua }).state, STATE.REJECTED, ua);
  }
});

test('a creator clicking their own link earns nothing', () => {
  const r = classifyClick(link, { userAgent: 'Mozilla/5.0', viewerUserId: 'creator-1' });
  assert.equal(r.state, STATE.REJECTED);
  assert.equal(countsTowardScore(r.state), false);
});

test('duplicate click in the same window does not count twice', () => {
  const r = classifyClick(link, { userAgent: 'Mozilla/5.0', seenDedupeKey: true });
  assert.equal(r.state, STATE.DUPLICATE);
  assert.equal(countsTowardScore(r.state), false);
});

test('burst from one visitor is suspicious, not counted', () => {
  const r = classifyClick(link, { userAgent: 'Mozilla/5.0', recentByVisitor: 12 });
  assert.equal(r.state, STATE.SUSPICIOUS);
  assert.equal(countsTowardScore(r.state), false);
});

test('disabled or unknown links are rejected', () => {
  assert.equal(classifyClick({ ...link, status: 'disabled' }, { userAgent: 'Mozilla/5.0' }).state, STATE.REJECTED);
  assert.equal(classifyClick(null, { userAgent: 'Mozilla/5.0' }).state, STATE.REJECTED);
});

test('a genuine human visitor is verified and counts', () => {
  const r = classifyClick(link, {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1',
    viewerUserId: 'someone-else', recentByVisitor: 0, seenDedupeKey: false,
  });
  assert.equal(r.state, STATE.VERIFIED);
  assert.equal(countsTowardScore(r.state), true);
});

// ---- Privacy (spec §5: do not over-collect) ----
test('visitor identity is a salted hash, never the raw IP', () => {
  const h = visitorHash('203.0.113.9', 'Mozilla/5.0', 'salt');
  assert.equal(h.length, 32);
  assert.ok(!h.includes('203.0.113.9'));
  assert.equal(h, visitorHash('203.0.113.9', 'Mozilla/5.0', 'salt'));       // stable
  assert.notEqual(h, visitorHash('203.0.113.10', 'Mozilla/5.0', 'salt'));   // distinct
});

test('dedupe key is stable inside a window and rolls over', () => {
  const t = 1_700_000_000_000;
  assert.equal(dedupeKey('c', 'v', t), dedupeKey('c', 'v', t + 60_000));
  assert.notEqual(dedupeKey('c', 'v', t), dedupeKey('c', 'v', t + 31 * 60_000));
});
