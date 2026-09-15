// Unit tests for the pure poll anti-abuse logic.
//
// Two properties are being defended here. First, that a voter identity is
// stable and non-reversible — a poll must be countable without keeping anything
// that points back at a person. Second, that the risk filter catches automation
// WITHOUT catching ordinary anonymous humans: a filter that quietly discards
// real people produces a number that is just as false as one an attacker
// inflated, in the other direction.
//
// No database here by design — everything under test is pure. The live path
// (tallies, one-vote-per-key, the target transition) is exercised by the
// separate verification script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  voterKey,
  voterIdentity,
  assessVoteRisk,
  countsTowardTally,
  COUNT_THRESHOLD,
} from '../src/polls/antiabuse.js';

// Pin the salt so keys are deterministic across runs and machines.
process.env.POLL_VOTE_SALT = 'test-poll-salt-do-not-use-in-production';

const IP = '203.0.113.44';
const BROWSER =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const reqWith = (ip: string | undefined, ua: string | undefined) => ({
  ip,
  headers: ua === undefined ? {} : { 'user-agent': ua },
});

const rowsAt = (n: number, at: number) =>
  Array.from({ length: n }, () => ({ voted_at: new Date(at).toISOString() }));

// ── Identity: stable ─────────────────────────────────────────────────────────

test('an authenticated voter gets the same key every time', () => {
  const a = voterKey({ user: { id: 'user-1' }, req: reqWith(IP, BROWSER) });
  const b = voterKey({ user: { id: 'user-1' }, req: reqWith(IP, BROWSER) });
  assert.equal(a, b);
});

test('the authenticated key follows the account, not the device', () => {
  // Same person on office wifi, then on mobile data, then in another browser.
  const a = voterKey({ user: { id: 'user-1' }, req: reqWith('203.0.113.1', BROWSER) });
  const b = voterKey({ user: { id: 'user-1' }, req: reqWith('198.51.100.9', DESKTOP) });
  const c = voterKey({ user: { id: 'user-1' }, req: null });
  assert.equal(a, b);
  assert.equal(b, c);
});

test('an anonymous voter gets the same key from the same device', () => {
  const a = voterKey({ user: null, req: reqWith(IP, BROWSER) });
  const b = voterKey({ user: null, req: reqWith(IP, BROWSER) });
  assert.equal(a, b);
});

test('the key survives a proxy: x-forwarded-for is what identifies the caller', () => {
  const direct = voterKey({ user: null, req: { ip: IP, headers: { 'user-agent': BROWSER } } });
  const proxied = voterKey({
    user: null,
    req: { ip: '10.0.0.7', headers: { 'x-forwarded-for': `${IP}, 10.0.0.7`, 'user-agent': BROWSER } },
  });
  assert.equal(direct, proxied);
});

// ── Identity: distinct ───────────────────────────────────────────────────────

test('different accounts get different keys', () => {
  assert.notEqual(
    voterKey({ user: { id: 'user-1' }, req: reqWith(IP, BROWSER) }),
    voterKey({ user: { id: 'user-2' }, req: reqWith(IP, BROWSER) })
  );
});

test('different anonymous devices get different keys', () => {
  const base = voterKey({ user: null, req: reqWith(IP, BROWSER) });
  assert.notEqual(base, voterKey({ user: null, req: reqWith('198.51.100.9', BROWSER) }));
  assert.notEqual(base, voterKey({ user: null, req: reqWith(IP, DESKTOP) }));
});

test('an account key can never collide with a derived key', () => {
  const account = voterKey({ user: { id: 'user-1' }, req: reqWith(IP, BROWSER) });
  const anon = voterKey({ user: null, req: reqWith(IP, BROWSER) });
  assert.ok(account.startsWith('u:'));
  assert.ok(anon.startsWith('a:'));
  assert.notEqual(account, anon);
});

test('a missing request does not throw — it fails closed onto one shared key', () => {
  const a = voterKey({ user: null, req: null });
  const b = voterKey({ user: null });
  assert.equal(a, b);
  assert.ok(a.startsWith('a:'));
});

// ── Identity: non-reversible ─────────────────────────────────────────────────

test('the key never contains the raw IP or user agent', () => {
  const key = voterKey({ user: null, req: reqWith(IP, BROWSER) });
  assert.ok(!key.includes(IP));
  assert.ok(!key.includes('iPhone'));
  assert.ok(!key.includes('Mozilla'));
  assert.match(key, /^a:[0-9a-f]{32}$/);
});

test('the stored hashes are hashes, and absent rather than empty when there is nothing to hash', () => {
  const full = voterIdentity({ user: null, req: reqWith(IP, BROWSER) });
  assert.equal(full.anonymous, true);
  assert.ok(full.ip_hash && !full.ip_hash.includes(IP));
  assert.ok(full.user_agent_hash && !full.user_agent_hash.includes('iPhone'));

  const bare = voterIdentity({ user: { id: 'user-1' }, req: { headers: {} } });
  assert.equal(bare.anonymous, false);
  assert.equal(bare.ip_hash, null);
  assert.equal(bare.user_agent_hash, null);
});

test('rotating the salt re-anonymises everyone', () => {
  const before = voterKey({ user: null, req: reqWith(IP, BROWSER) });
  const original = process.env.POLL_VOTE_SALT;
  try {
    process.env.POLL_VOTE_SALT = 'a-completely-different-salt-value';
    assert.notEqual(voterKey({ user: null, req: reqWith(IP, BROWSER) }), before);
  } finally {
    process.env.POLL_VOTE_SALT = original;
  }
  assert.equal(voterKey({ user: null, req: reqWith(IP, BROWSER) }), before);
});

// ── Risk: ordinary people must still count ───────────────────────────────────

test('a signed-in person on a real browser raises nothing at all', () => {
  const r = assessVoteRisk({ user: { id: 'user-1' }, req: reqWith(IP, DESKTOP) });
  assert.deepEqual(r.reasons, []);
  assert.equal(r.score, 0);
  assert.equal(countsTowardTally(r.score), true);
});

test('an ordinary anonymous visitor is noted but still counted', () => {
  const r = assessVoteRisk({ user: null, req: reqWith(IP, BROWSER) });
  assert.deepEqual(r.reasons, ['no_account']);
  assert.ok(r.score > 0, 'voting without an account is a signal');
  assert.ok(r.score < COUNT_THRESHOLD, 'but never enough on its own to discard a real opinion');
  assert.equal(countsTowardTally(r.score), true);
});

test('a busy poll does not make every visitor suspicious', () => {
  const now = Date.now();
  const r = assessVoteRisk({
    user: null,
    req: reqWith(IP, BROWSER),
    recentVotesInPoll: rowsAt(400, now),
    now,
  });
  assert.ok(r.reasons.includes('poll_wide_burst'));
  assert.equal(countsTowardTally(r.score), true);
});

// ── Risk: automation must not count ──────────────────────────────────────────

test('a client that announces itself as software is not counted', () => {
  for (const ua of ['curl/8.4.0', 'python-requests/2.31.0', 'Scrapy/2.11', 'HeadlessChrome/120', 'Googlebot/2.1']) {
    const r = assessVoteRisk({ user: { id: 'user-1' }, req: reqWith(IP, ua) });
    assert.ok(r.reasons.includes('automated_agent'), ua);
    assert.ok(r.score >= COUNT_THRESHOLD, ua);
    assert.equal(countsTowardTally(r.score), false, ua);
  }
});

test('an anonymous caller sending no user agent is not counted', () => {
  const r = assessVoteRisk({ user: null, req: reqWith(IP, undefined) });
  assert.ok(r.reasons.includes('missing_user_agent'));
  assert.ok(r.reasons.includes('no_account'));
  assert.equal(countsTowardTally(r.score), false);
});

test('a user agent too short to be a browser is flagged', () => {
  const r = assessVoteRisk({ user: { id: 'user-1' }, req: reqWith(IP, 'X/1') });
  assert.deepEqual(r.reasons, ['unusual_user_agent']);
});

test('one key cycling votes escalates, and eventually stops counting', () => {
  const now = Date.now();
  const three = assessVoteRisk({ user: null, req: reqWith(IP, BROWSER), recentVotesByKey: rowsAt(3, now), now });
  // Three poll campaigns exist, so three votes from one key is the honest case.
  assert.deepEqual(three.reasons, ['no_account']);

  const many = assessVoteRisk({ user: null, req: reqWith(IP, BROWSER), recentVotesByKey: rowsAt(5, now), now });
  assert.ok(many.reasons.includes('repeat_votes_from_key'));

  const flood = assessVoteRisk({ user: null, req: reqWith(IP, BROWSER), recentVotesByKey: rowsAt(40, now), now });
  assert.ok(flood.reasons.includes('rapid_repeat_votes'));
  assert.equal(countsTowardTally(flood.score), false);
});

test('old activity is not recent activity', () => {
  const now = Date.now();
  const old = rowsAt(40, now - 6 * 60 * 60 * 1000); // six hours ago
  const r = assessVoteRisk({ user: null, req: reqWith(IP, BROWSER), recentVotesByKey: old, now });
  assert.deepEqual(r.reasons, ['no_account']);
});

test('a plain count of recent votes works as well as the rows', () => {
  const rows = assessVoteRisk({ user: null, req: reqWith(IP, BROWSER), recentVotesByKey: rowsAt(9, Date.now()) });
  const count = assessVoteRisk({ user: null, req: reqWith(IP, BROWSER), recentVotesByKey: 9 });
  assert.deepEqual(count.reasons, rows.reasons);
  assert.equal(count.score, rows.score);
});

test('a vote row with no timestamp still counts as recent, so repeats cannot be hidden', () => {
  const r = assessVoteRisk({
    user: null,
    req: reqWith(IP, BROWSER),
    recentVotesByKey: [{}, {}, {}, {}, {}, {}, {}, {}, {}] as any,
  });
  assert.ok(r.reasons.includes('rapid_repeat_votes'));
});

// ── Risk: shape of the output ────────────────────────────────────────────────

test('the score stays inside 0..100 however many signals fire', () => {
  const worst = assessVoteRisk({
    user: null,
    req: reqWith(undefined, undefined),
    recentVotesByKey: 500,
    recentVotesInPoll: 5000,
  });
  assert.ok(worst.score <= 100 && worst.score >= 0);
  assert.equal(countsTowardTally(worst.score), false);

  const best = assessVoteRisk({ user: { id: 'u' }, req: reqWith(IP, DESKTOP), recentVotesByKey: -5 });
  assert.equal(best.score, 0);
});

test('reasons are opaque slugs — they never leak a numeric limit', () => {
  const r = assessVoteRisk({
    user: null,
    req: reqWith(undefined, 'curl/8.4.0'),
    recentVotesByKey: 99,
    recentVotesInPoll: 9999,
  });
  assert.ok(r.reasons.length > 0);
  for (const reason of r.reasons) assert.match(reason, /^[a-z_]+$/);
});

test('the counting threshold is a real cut-off, applied at or above', () => {
  assert.ok(Number.isInteger(COUNT_THRESHOLD));
  assert.ok(COUNT_THRESHOLD > 0 && COUNT_THRESHOLD <= 100);
  assert.equal(countsTowardTally(COUNT_THRESHOLD), false);
  assert.equal(countsTowardTally(COUNT_THRESHOLD - 1), true);
});
