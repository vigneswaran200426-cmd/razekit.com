// @ts-nocheck
// Per-campaign scoring configuration.
//
// RazeKit's default is an equal split: Final = (VideoEngagement + BrandTraffic) / 2.
// That is the right default, but it is not right for every campaign — a brand
// running a pure awareness push and one running a traffic push are not measuring
// the same thing.
//
// A campaign may therefore set its own weights. Three rules make that safe:
//
//   1. Weights MUST total 100. A config that does not is rejected, not
//      silently normalized — silent normalization means the brand thinks they
//      configured one thing and the engine did another.
//   2. A config LOCKS when the contest opens. Changing how a contest is scored
//      while creators are competing in it changes the rules mid-game.
//   3. Every finalized score records the config version it used, so a past
//      result stays reproducible even after the campaign is re-configured.
//
// Absent config = the platform default. Nothing has to opt in.
import { clampScore, round2, SCORING_VERSION } from './index.js';

export const DEFAULT_CONFIG = {
  engagement_weight: 50,
  traffic_weight: 50,
  quality_weight: 0,
  winner_method: 'BRAND_SELECTED',
  tie_break: 'TRAFFIC_THEN_ENGAGEMENT',
  version: `default@${SCORING_VERSION}`,
};

export const WINNER_METHODS = {
  /** The brand chooses, informed by the ranking. RazeKit's default. */
  BRAND_SELECTED: 'BRAND_SELECTED',
  /** The top Final Score wins automatically. The brand cannot override. */
  TOP_SCORE: 'TOP_SCORE',
};

export const TIE_BREAKS = {
  TRAFFIC_THEN_ENGAGEMENT: 'TRAFFIC_THEN_ENGAGEMENT',
  ENGAGEMENT_THEN_TRAFFIC: 'ENGAGEMENT_THEN_TRAFFIC',
  EARLIEST_SUBMISSION: 'EARLIEST_SUBMISSION',
};

/**
 * Validate a proposed configuration.
 *
 * Returns { ok, errors, config }. Deliberately strict: a scoring rule that is
 * almost right produces a winner that is almost right.
 */
export function validateConfig(input = {}) {
  const errors = [];
  const num = (v, fallback) => (v === undefined || v === null || v === '' ? fallback : Number(v));

  const engagement = num(input.engagement_weight, DEFAULT_CONFIG.engagement_weight);
  const traffic = num(input.traffic_weight, DEFAULT_CONFIG.traffic_weight);
  const quality = num(input.quality_weight, DEFAULT_CONFIG.quality_weight);

  for (const [label, value] of [['Video Engagement', engagement], ['Brand Traffic', traffic], ['Content Quality', quality]]) {
    if (!Number.isFinite(value)) errors.push(`${label} weight must be a number.`);
    else if (value < 0 || value > 100) errors.push(`${label} weight must be between 0 and 100.`);
  }

  const total = engagement + traffic + quality;
  if (Number.isFinite(total) && Math.round(total) !== 100) {
    errors.push(`Weights must total 100%. They currently total ${round2(total)}%.`);
  }
  if (engagement === 0 && traffic === 0) {
    // Quality alone is a judged contest, not a measured one. RazeKit has no
    // quality signal wired in, so this would score everyone identically.
    errors.push('At least one measured dimension (Video Engagement or Brand Traffic) must carry weight.');
  }
  if (quality > 0) {
    errors.push('Content Quality scoring is not implemented yet, so it cannot carry weight. Set it to 0.');
  }

  const winnerMethod = input.winner_method || DEFAULT_CONFIG.winner_method;
  if (!WINNER_METHODS[winnerMethod]) errors.push(`Unknown winner method: ${winnerMethod}`);

  const tieBreak = input.tie_break || DEFAULT_CONFIG.tie_break;
  if (!TIE_BREAKS[tieBreak]) errors.push(`Unknown tie-break rule: ${tieBreak}`);

  return {
    ok: errors.length === 0,
    errors,
    config: {
      engagement_weight: engagement,
      traffic_weight: traffic,
      quality_weight: quality,
      winner_method: winnerMethod,
      tie_break: tieBreak,
      requires_verified_metrics: input.requires_verified_metrics === true,
      minimum_submissions: Math.max(0, num(input.minimum_submissions, 0)),
    },
  };
}

/**
 * The configuration in force for a contest.
 *
 * Falls back to the platform default, so a contest created before configurable
 * weights existed scores exactly as it always did.
 */
export async function configFor(svc, contestId) {
  const rows = await svc.entities.ScoringConfig
    .filter({ contest_id: contestId }, '-created_date', 5).catch(() => []);
  const row = rows[0];
  if (!row) return { ...DEFAULT_CONFIG, source: 'platform_default' };
  return {
    engagement_weight: Number(row.engagement_weight ?? 50),
    traffic_weight: Number(row.traffic_weight ?? 50),
    quality_weight: Number(row.quality_weight ?? 0),
    winner_method: row.winner_method || DEFAULT_CONFIG.winner_method,
    tie_break: row.tie_break || DEFAULT_CONFIG.tie_break,
    requires_verified_metrics: Boolean(row.requires_verified_metrics),
    minimum_submissions: Number(row.minimum_submissions || 0),
    version: row.version,
    locked: Boolean(row.locked),
    source: 'campaign',
  };
}

/**
 * Weighted Final Score.
 *
 * A dimension with no data is EXCLUDED and the remaining weights are
 * re-proportioned, rather than counted as zero. Scoring a creator 0 for traffic
 * that nobody in the contest generated would punish them for the campaign's
 * setup rather than their work.
 */
export function weightedFinalScore(engagementScore, trafficScore, config = DEFAULT_CONFIG) {
  const parts = [];
  if (engagementScore !== null && engagementScore !== undefined && config.engagement_weight > 0) {
    parts.push([clampScore(engagementScore), config.engagement_weight]);
  }
  if (trafficScore !== null && trafficScore !== undefined && config.traffic_weight > 0) {
    parts.push([clampScore(trafficScore), config.traffic_weight]);
  }
  if (!parts.length) return null; // no measurable dimension — never fake a score

  const weightUsed = parts.reduce((a, [, w]) => a + w, 0);
  const total = parts.reduce((a, [v, w]) => a + v * w, 0);
  return round2(total / weightUsed);
}

/**
 * Explain a score, so the Brand Tracker can answer "why is this creator #1?"
 * without the browser recomputing anything.
 */
export function explainScore(engagementScore, trafficScore, config = DEFAULT_CONFIG) {
  const used = [];
  const excluded = [];
  if (config.engagement_weight > 0) {
    if (engagementScore === null || engagementScore === undefined) {
      excluded.push({ dimension: 'Video Engagement', weight: config.engagement_weight, reason: 'No engagement data recorded for this contest yet.' });
    } else {
      used.push({ dimension: 'Video Engagement', score: round2(engagementScore), weight: config.engagement_weight });
    }
  }
  if (config.traffic_weight > 0) {
    if (trafficScore === null || trafficScore === undefined) {
      excluded.push({ dimension: 'Brand Traffic', weight: config.traffic_weight, reason: 'No verified traffic recorded for this contest yet.' });
    } else {
      used.push({ dimension: 'Brand Traffic', score: round2(trafficScore), weight: config.traffic_weight });
    }
  }

  const weightUsed = used.reduce((a, p) => a + p.weight, 0);
  const final = weightedFinalScore(engagementScore, trafficScore, config);

  return {
    final_score: final,
    components: used.map((p) => ({
      ...p,
      // The effective share once excluded dimensions are removed. This is what
      // actually produced the number, so it is what gets shown.
      effective_weight: weightUsed ? round2((p.weight / weightUsed) * 100) : 0,
      contribution: weightUsed ? round2((p.score * p.weight) / weightUsed) : 0,
    })),
    excluded,
    weights_reproportioned: excluded.length > 0,
    config_version: config.version || DEFAULT_CONFIG.version,
    scoring_version: SCORING_VERSION,
  };
}

/** Tie-break comparator for a campaign's chosen rule. Always deterministic. */
export function comparatorFor(config = DEFAULT_CONFIG) {
  const byTime = (a, b) => {
    const ta = Date.parse(a.submitted_at || a.created_date || 0) || 0;
    const tb = Date.parse(b.submitted_at || b.created_date || 0) || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  };
  return (a, b) => {
    const fs = (b.final_score ?? -1) - (a.final_score ?? -1);
    if (fs !== 0) return fs;
    if (config.tie_break === TIE_BREAKS.ENGAGEMENT_THEN_TRAFFIC) {
      const en = (b.engagement_score ?? -1) - (a.engagement_score ?? -1);
      if (en !== 0) return en;
      const tr = (b.traffic_score ?? -1) - (a.traffic_score ?? -1);
      if (tr !== 0) return tr;
    } else if (config.tie_break === TIE_BREAKS.TRAFFIC_THEN_ENGAGEMENT) {
      const tr = (b.traffic_score ?? -1) - (a.traffic_score ?? -1);
      if (tr !== 0) return tr;
      const en = (b.engagement_score ?? -1) - (a.engagement_score ?? -1);
      if (en !== 0) return en;
    }
    return byTime(a, b);
  };
}
