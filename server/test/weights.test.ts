// Configurable campaign scoring — unit tests.
//
// The guarantees here are about fairness and reproducibility: weights must be
// coherent, a dimension nobody had must not drag anyone down, and a past result
// must stay explainable after the rules change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateConfig, weightedFinalScore, explainScore, comparatorFor,
  DEFAULT_CONFIG, WINNER_METHODS, TIE_BREAKS,
} from '../src/scoring/weights.js';
import { finalScore } from '../src/scoring/index.js';

// ── Validation ──────────────────────────────────────────────────────────────

test('the platform default is an equal split that totals 100', () => {
  assert.equal(DEFAULT_CONFIG.engagement_weight + DEFAULT_CONFIG.traffic_weight, 100);
  const { ok } = validateConfig(DEFAULT_CONFIG);
  assert.equal(ok, true);
});

test('weights that do not total 100 are REFUSED, never silently normalized', () => {
  const under = validateConfig({ engagement_weight: 30, traffic_weight: 30 });
  assert.equal(under.ok, false);
  assert.match(under.errors[0], /total 100/i);

  const over = validateConfig({ engagement_weight: 70, traffic_weight: 60 });
  assert.equal(over.ok, false);
  assert.match(over.errors[0], /total 100/i);
});

test('a valid custom split is accepted', () => {
  const { ok, config } = validateConfig({ engagement_weight: 70, traffic_weight: 30 });
  assert.equal(ok, true);
  assert.equal(config.engagement_weight, 70);
  assert.equal(config.traffic_weight, 30);
});

test('a weight outside 0-100 is refused', () => {
  assert.equal(validateConfig({ engagement_weight: -10, traffic_weight: 110 }).ok, false);
  assert.equal(validateConfig({ engagement_weight: 150, traffic_weight: -50 }).ok, false);
});

test('a non-numeric weight is refused rather than coerced', () => {
  const r = validateConfig({ engagement_weight: 'lots', traffic_weight: 50 });
  assert.equal(r.ok, false);
});

test('a campaign cannot be scored on nothing measurable', () => {
  // 0/0 would score every creator identically, so the winner would be arbitrary.
  const r = validateConfig({ engagement_weight: 0, traffic_weight: 0, quality_weight: 100 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e: string) => /at least one measured dimension/i.test(e)));
});

test('an unimplemented dimension cannot carry weight', () => {
  // Content Quality has no signal wired in. Allowing weight on it would let a
  // brand configure a scoring rule the engine cannot honour.
  const r = validateConfig({ engagement_weight: 40, traffic_weight: 40, quality_weight: 20 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e: string) => /not implemented/i.test(e)));
});

test('unknown winner methods and tie-breaks are refused', () => {
  assert.equal(validateConfig({ engagement_weight: 50, traffic_weight: 50, winner_method: 'COIN_FLIP' }).ok, false);
  assert.equal(validateConfig({ engagement_weight: 50, traffic_weight: 50, tie_break: 'RANDOM' }).ok, false);
});

test('both supported winner methods are accepted', () => {
  for (const m of Object.values(WINNER_METHODS)) {
    assert.equal(validateConfig({ engagement_weight: 50, traffic_weight: 50, winner_method: m }).ok, true, m);
  }
});

// ── Weighted scoring ────────────────────────────────────────────────────────

test('an equal split matches the original formula exactly', () => {
  // Existing contests must score identically after this change.
  for (const [e, t] of [[95, 60], [75, 95], [88, 70], [0, 0], [100, 100]]) {
    assert.equal(weightedFinalScore(e, t, DEFAULT_CONFIG), finalScore(e, t), `${e}/${t}`);
  }
});

test('the spec worked examples still hold', () => {
  assert.equal(weightedFinalScore(95, 60, DEFAULT_CONFIG), 77.5);
  assert.equal(weightedFinalScore(75, 95, DEFAULT_CONFIG), 85);
  assert.equal(weightedFinalScore(88, 70, DEFAULT_CONFIG), 79);
});

test('custom weights change the outcome the way a brand would expect', () => {
  const trafficHeavy = { ...DEFAULT_CONFIG, engagement_weight: 20, traffic_weight: 80 };
  const engagementHeavy = { ...DEFAULT_CONFIG, engagement_weight: 80, traffic_weight: 20 };
  // A creator strong on traffic wins under a traffic-heavy campaign...
  assert.ok(weightedFinalScore(40, 90, trafficHeavy) > weightedFinalScore(90, 40, trafficHeavy));
  // ...and loses under an engagement-heavy one. Same numbers, different rules.
  assert.ok(weightedFinalScore(40, 90, engagementHeavy) < weightedFinalScore(90, 40, engagementHeavy));
});

test('a missing dimension is EXCLUDED and the rest re-proportioned', () => {
  // The bug this replaced scored this creator 50 — punishing the best traffic
  // performer for engagement data the campaign never collected.
  assert.equal(weightedFinalScore(null, 100, DEFAULT_CONFIG), 100);
  assert.equal(weightedFinalScore(80, null, DEFAULT_CONFIG), 80);
  // Re-proportioning holds under an uneven split too.
  assert.equal(weightedFinalScore(null, 60, { ...DEFAULT_CONFIG, engagement_weight: 90, traffic_weight: 10 }), 60);
});

test('no measurable dimension yields null, never a fabricated zero', () => {
  assert.equal(weightedFinalScore(null, null, DEFAULT_CONFIG), null);
  assert.equal(weightedFinalScore(undefined, undefined, DEFAULT_CONFIG), null);
});

test('a dimension weighted at zero is ignored even when data exists', () => {
  const trafficOnly = { ...DEFAULT_CONFIG, engagement_weight: 0, traffic_weight: 100 };
  assert.equal(weightedFinalScore(10, 90, trafficOnly), 90);
});

test('scores are clamped to 0-100 whatever the input', () => {
  assert.equal(weightedFinalScore(500, 500, DEFAULT_CONFIG), 100);
  assert.equal(weightedFinalScore(-50, -50, DEFAULT_CONFIG), 0);
});

// ── Explanation ─────────────────────────────────────────────────────────────

test('a score explains itself, and the parts add up to the whole', () => {
  const x = explainScore(92, 68, DEFAULT_CONFIG);
  assert.equal(x.final_score, 80);
  assert.equal(x.components.length, 2);
  const sum = x.components.reduce((a: number, c: any) => a + c.contribution, 0);
  assert.ok(Math.abs(sum - x.final_score) < 0.02, `${sum} vs ${x.final_score}`);
  assert.equal(x.weights_reproportioned, false);
});

test('an explanation names what was excluded and why', () => {
  const x = explainScore(null, 75, DEFAULT_CONFIG);
  assert.equal(x.weights_reproportioned, true);
  assert.equal(x.excluded.length, 1);
  assert.equal(x.excluded[0].dimension, 'Video Engagement');
  assert.ok(x.excluded[0].reason.length > 10);
  // The surviving dimension carries the full effective weight.
  assert.equal(x.components[0].effective_weight, 100);
});

test('an explanation records the versions that produced it', () => {
  const x = explainScore(50, 50, DEFAULT_CONFIG);
  assert.ok(x.scoring_version);
  assert.ok(x.config_version);
});

// ── Tie-breaks ──────────────────────────────────────────────────────────────

const entry = (o: any) => ({ id: o.id, final_score: o.f, traffic_score: o.t, engagement_score: o.e, submitted_at: o.at });

test('a tie breaks on traffic first under the default rule', () => {
  const rows = [
    entry({ id: 'a', f: 80, t: 60, e: 100, at: '2026-01-01T00:00:00Z' }),
    entry({ id: 'b', f: 80, t: 90, e: 70, at: '2026-01-02T00:00:00Z' }),
  ].sort(comparatorFor(DEFAULT_CONFIG));
  assert.equal(rows[0].id, 'b', 'higher traffic wins the tie');
});

test('a campaign can choose to break ties on engagement instead', () => {
  const cfg = { ...DEFAULT_CONFIG, tie_break: TIE_BREAKS.ENGAGEMENT_THEN_TRAFFIC };
  const rows = [
    entry({ id: 'a', f: 80, t: 60, e: 100, at: '2026-01-01T00:00:00Z' }),
    entry({ id: 'b', f: 80, t: 90, e: 70, at: '2026-01-02T00:00:00Z' }),
  ].sort(comparatorFor(cfg));
  assert.equal(rows[0].id, 'a', 'higher engagement wins the tie');
});

test('a total tie falls to the earliest submission, never to chance', () => {
  const rows = [
    entry({ id: 'late', f: 80, t: 80, e: 80, at: '2026-02-01T00:00:00Z' }),
    entry({ id: 'early', f: 80, t: 80, e: 80, at: '2026-01-01T00:00:00Z' }),
  ].sort(comparatorFor(DEFAULT_CONFIG));
  assert.equal(rows[0].id, 'early');
});

test('ranking is deterministic — the same input always gives the same order', () => {
  const build = () => [
    entry({ id: 'a', f: 80, t: 80, e: 80, at: '2026-01-01T00:00:00Z' }),
    entry({ id: 'b', f: 80, t: 80, e: 80, at: '2026-01-01T00:00:00Z' }),
    entry({ id: 'c', f: 90, t: 70, e: 99, at: '2026-01-01T00:00:00Z' }),
  ];
  const first = build().sort(comparatorFor(DEFAULT_CONFIG)).map((r) => r.id).join(',');
  for (let i = 0; i < 20; i++) {
    assert.equal(build().sort(comparatorFor(DEFAULT_CONFIG)).map((r) => r.id).join(','), first);
  }
});

test('an unscored entry never outranks a scored one', () => {
  const rows = [
    entry({ id: 'unscored', f: null, t: null, e: null, at: '2026-01-01T00:00:00Z' }),
    entry({ id: 'scored', f: 1, t: 1, e: 1, at: '2026-02-01T00:00:00Z' }),
  ].sort(comparatorFor(DEFAULT_CONFIG));
  assert.equal(rows[0].id, 'scored');
});
