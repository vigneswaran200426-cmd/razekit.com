import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoProtectedWrite } from '../src/entities/protected.js';

const throws = (fn: () => void) => {
  try { fn(); return false; } catch { return true; }
};

// Spec §4 — the browser must never be able to submit "winner = creator_id".
test('a brand cannot PATCH Contest.winner_user_id from the browser', () => {
  assert.ok(throws(() => assertNoProtectedWrite('Contest', { winner_user_id: 'attacker' }, {})));
  assert.ok(throws(() => assertNoProtectedWrite('Contest', { winner_submission_id: 'sub_1' }, {})));
  assert.ok(throws(() => assertNoProtectedWrite('Contest', { status: 'winner_selected' }, { status: 'open' })));
});

// A creator OWNS their submission row, so RLS alone let them self-declare a win.
test('a creator cannot mark their own submission as won', () => {
  assert.ok(throws(() => assertNoProtectedWrite('Submission', { status: 'won' }, { status: 'submitted' })));
  assert.ok(throws(() => assertNoProtectedWrite('Submission', { status: 'not_selected' }, { status: 'submitted' })));
});

test('scores cannot be written by a client', () => {
  assert.ok(throws(() => assertNoProtectedWrite('Submission', { final_score: 100 }, {})));
  assert.ok(throws(() => assertNoProtectedWrite('Submission', { engagement_score: 99 }, {})));
  assert.ok(throws(() => assertNoProtectedWrite('Submission', { traffic_score: 99 }, {})));
  assert.ok(throws(() => assertNoProtectedWrite('Submission', { scoring_version: 'fake' }, {})));
});

test('fully server-owned entities reject all client writes', () => {
  for (const e of ['CreatorStats', 'MonthlyLeaderboard', 'TrafficEvent', 'ScoreSnapshot', 'AuditLog', 'FraudAlert']) {
    assert.ok(throws(() => assertNoProtectedWrite(e, { anything: 1 }, {})), `${e} must be server-owned`);
  }
});

// Legitimate edits must still work — the guard must not break the product.
test('ordinary fields remain writable', () => {
  assert.ok(!throws(() => assertNoProtectedWrite('Contest', { title: 'New title', prize_amount: 25000 }, { title: 'Old' })));
  assert.ok(!throws(() => assertNoProtectedWrite('Submission', { caption: 'hi', status: 'submitted' }, { status: 'working' })));
});

test('re-sending an UNCHANGED protected field is allowed (naive PATCH clients)', () => {
  assert.ok(!throws(() => assertNoProtectedWrite('Contest', { winner_user_id: 'u1' }, { winner_user_id: 'u1' })));
  assert.ok(!throws(() => assertNoProtectedWrite('Submission', { status: 'won' }, { status: 'won' })));
});
