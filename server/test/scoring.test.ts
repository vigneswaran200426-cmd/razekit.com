import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalScore, clampScore, rankSubmissions, videoEngagementScore, brandTrafficScore } from '../src/scoring/index.js';

// Spec §56 / §23 — the canonical worked example.
test('final score = (engagement + traffic) / 2', () => {
  assert.equal(finalScore(95, 60), 77.5);  // Creator A
  assert.equal(finalScore(75, 95), 85.0);  // Creator B
  assert.equal(finalScore(88, 70), 79.0);  // Creator C
  assert.equal(finalScore(82.4, 91.7), 87.05);
});

test('Creator B wins the specification example', () => {
  const subs = [
    { id: 'A', engagement_score: 95, traffic_score: 60, final_score: finalScore(95, 60) },
    { id: 'B', engagement_score: 75, traffic_score: 95, final_score: finalScore(75, 95) },
    { id: 'C', engagement_score: 88, traffic_score: 70, final_score: finalScore(88, 70) },
  ];
  const ranked = rankSubmissions(subs);
  assert.equal(ranked[0].id, 'B');
  assert.equal(ranked[0].final_score, 85.0);
  assert.deepEqual(ranked.map((s) => s.id), ['B', 'C', 'A']);
});

test('popularity alone cannot win: high engagement loses to better balance', () => {
  const ranked = rankSubmissions([
    { id: 'popular', engagement_score: 100, traffic_score: 10, final_score: finalScore(100, 10) }, // 55
    { id: 'balanced', engagement_score: 70, traffic_score: 70, final_score: finalScore(70, 70) },  // 70
  ]);
  assert.equal(ranked[0].id, 'balanced');
});

test('tie-break is deterministic: traffic, then engagement, then earliest', () => {
  // Equal final score (77.5) -> higher Brand Traffic wins.
  const t = rankSubmissions([
    { id: 'x', engagement_score: 95, traffic_score: 60, final_score: 77.5, submitted_at: '2026-01-01' },
    { id: 'y', engagement_score: 60, traffic_score: 95, final_score: 77.5, submitted_at: '2026-01-02' },
  ]);
  assert.equal(t[0].id, 'y');

  // Identical scores -> earliest submission wins, never random.
  const e = rankSubmissions([
    { id: 'late', engagement_score: 80, traffic_score: 80, final_score: 80, submitted_at: '2026-02-02' },
    { id: 'early', engagement_score: 80, traffic_score: 80, final_score: 80, submitted_at: '2026-01-01' },
  ]);
  assert.equal(e[0].id, 'early');
  // Stable across repeated runs.
  for (let i = 0; i < 20; i++) assert.equal(rankSubmissions(e)[0].id, 'early');
});

test('scores clamp to 0-100', () => {
  assert.equal(clampScore(-5), 0);
  assert.equal(clampScore(150), 100);
  assert.equal(finalScore(200, 200), 100);
  assert.equal(finalScore(-50, 0), 0);
});

test('missing data yields null, never a fake zero', () => {
  assert.equal(brandTrafficScore(0, 0), null);          // no traffic collected yet
  assert.equal(videoEngagementScore({}, {}), null);      // no engagement signal
  assert.equal(brandTrafficScore(0, 100), 0);            // real zero out of real max
});

test('zero traffic and zero engagement are handled', () => {
  assert.equal(finalScore(0, 0), 0);
  assert.equal(finalScore(90, 0), 45);
});
