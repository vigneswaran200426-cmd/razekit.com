import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScores } from '../src/scoring/compute.js';

const sub = (id: string, extra: any = {}) => ({ id, created_by_id: 'u_' + id, submitted_at: '2026-01-0' + id, ...extra });

function build(rows: Array<{ id: string; unique?: number | null; metrics?: any }>) {
  const submissions = rows.map((r) => sub(r.id));
  const linksBySubmission = new Map(
    rows.filter((r) => r.unique !== undefined && r.unique !== null)
        .map((r) => [r.id, { submission_id: r.id, unique_visitors: r.unique }])
  );
  const postsBySubmission = new Map(
    rows.filter((r) => r.metrics).map((r) => [r.id, { submission_id: r.id, metrics: r.metrics }])
  );
  return { submissions, linksBySubmission, postsBySubmission };
}

test('normalizes relative to the contest field, top performer scores 100', () => {
  const { ranked } = computeScores(build([
    { id: '1', unique: 100, metrics: { views: 1000, likes: 100, shares: 50, comments: 10, saves: 10, watch_time: 100, follower_growth: 10 } },
    { id: '2', unique: 25,  metrics: { views: 250,  likes: 25,  shares: 12, comments: 2,  saves: 2,  watch_time: 25,  follower_growth: 2 } },
  ]));
  assert.equal(ranked[0].id, '1');
  assert.equal(ranked[0].traffic_score, 100);      // highest unique visitors
  assert.equal(ranked[0].engagement_score, 100);   // highest on every input
  assert.equal(ranked[0].final_score, 100);
  assert.ok(ranked[1].final_score < ranked[0].final_score);
});

test('brand traffic can beat raw engagement — the 50/50 model holds', () => {
  const { ranked } = computeScores(build([
    { id: 'popular', unique: 5,   metrics: { views: 1000, likes: 1000, shares: 1000, comments: 1000, saves: 1000, watch_time: 1000, follower_growth: 1000 } },
    { id: 'driver',  unique: 100, metrics: { views: 100,  likes: 100,  shares: 100,  comments: 100,  saves: 100,  watch_time: 100,  follower_growth: 100 } },
  ]));
  // 'popular' = (100 + ~22)/2 ; 'driver' = (~32 + 100)/2 -> driver wins
  assert.equal(ranked[0].id, 'driver');
});

test('no data anywhere => insufficient_data, never a fake zero winner', () => {
  const { ranked, unscored } = computeScores(build([{ id: '1' }, { id: '2' }]));
  assert.equal(ranked.length, 0);
  assert.equal(unscored.length, 2);
  assert.equal(unscored[0].final_score, null);
  assert.equal(unscored[0].score_state, 'insufficient_data');
});

test('a missing dimension is EXCLUDED, not scored as zero', () => {
  const { ranked } = computeScores(build([
    { id: '1', unique: 10 },            // traffic only — no engagement anywhere
    { id: '2', unique: 5 },
  ]));
  assert.equal(ranked[0].score_state, 'provisional', 'the gap is still flagged');
  assert.equal(ranked[0].engagement_score, null, 'no engagement data is not a zero');
  assert.equal(ranked[0].traffic_score, 100);
  // Previously this produced (0 + 100)/2 = 50, which punished the best
  // performer in the contest for a dimension the CAMPAIGN never tracked.
  // Engagement is excluded and traffic carries the full re-proportioned
  // weight, so the top traffic performer scores 100.
  assert.equal(ranked[0].final_score, 100);
  const breakdown = JSON.parse(ranked[0].score_breakdown);
  assert.equal(breakdown.weights_reproportioned, true);
  assert.equal(breakdown.components.length, 1);
  assert.equal(breakdown.components[0].effective_weight, 100);
  assert.equal(breakdown.excluded[0].dimension, 'Video Engagement');
});

test('a creator is never ranked below a rival for data neither of them had', () => {
  // Both have traffic only. Their relative order must come from traffic alone.
  const { ranked } = computeScores(build([
    { id: 'low', unique: 5 }, { id: 'high', unique: 20 },
  ]));
  assert.equal(ranked[0].id, 'high');
  assert.ok(ranked[0].final_score > ranked[1].final_score);
  // And the winner's score reflects their actual standing, not a halved one.
  assert.equal(ranked[0].final_score, ranked[0].traffic_score);
});

test('ranks are dense and ordered', () => {
  const { ranked } = computeScores(build([
    { id: '1', unique: 10 }, { id: '2', unique: 30 }, { id: '3', unique: 20 },
  ]));
  assert.deepEqual(ranked.map((r) => [r.id, r.rank]), [['2', 1], ['3', 2], ['1', 3]]);
});

test('a metric snapshot is captured for reproducibility', () => {
  const { ranked } = computeScores(build([{ id: '1', unique: 7, metrics: { views: 5 } }]));
  const snap = JSON.parse(ranked[0].metric_snapshot);
  assert.equal(snap.verified_unique_visitors, 7);
  assert.equal(snap.engagement.views, 5);
  assert.ok(snap.population);
});
