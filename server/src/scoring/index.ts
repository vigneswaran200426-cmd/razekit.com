// @ts-nocheck
// RazeKit scoring engine — THE single source of truth for winner performance.
// Nothing else (frontend, Tracker, Admin, Leaderboard) may recompute these.
//
// Spec: FinalScore = (VideoEngagementScore + BrandTrafficScore) / 2,
// each dimension normalized 0-100, equal 50/50 weighting.

// Bump when the formula or normalization changes. Finalized snapshots store the
// version so historical results stay reproducible.
export const SCORING_VERSION = 'rk-score-1.0.0';

export const SCORE_STATES = {
  NOT_STARTED: 'not_started',
  INSUFFICIENT_DATA: 'insufficient_data',
  CALCULATING: 'calculating',
  PROVISIONAL: 'provisional',
  FINAL: 'final',
  DISQUALIFIED: 'disqualified',
};

// Weighting of each approved engagement INPUT inside the Video Engagement
// dimension. Centralized here on purpose (spec §18: "Do not scatter scoring
// weights throughout the codebase"). Inputs are signals, never win criteria.
export const ENGAGEMENT_WEIGHTS = {
  views: 0.20,
  likes: 0.15,
  comments: 0.15,
  shares: 0.20,
  saves: 0.15,
  watch_time: 0.10,
  follower_growth: 0.05,
};

export function clampScore(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

/** Round to 2dp without float drift (77.5, 85.0, 87.05). */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** FinalScore = (engagement + traffic) / 2. Both clamped to 0-100. */
export function finalScore(engagementScore, trafficScore) {
  return round2((clampScore(engagementScore) + clampScore(trafficScore)) / 2);
}

/**
 * Normalize a raw metric against a population using min-max against the
 * observed maximum. Outlier dampening (spec §22: "minimize unfair advantage
 * caused purely by massive outliers") uses a square-root curve so a creator
 * with 100x the views does not get 100x the score.
 */
export function normalizeAgainstMax(value, max) {
  const v = Math.max(0, Number(value) || 0);
  const m = Math.max(0, Number(max) || 0);
  if (m <= 0) return 0;
  return clampScore(Math.sqrt(v / m) * 100);
}

/**
 * Video Engagement Score from raw approved inputs, normalized across the
 * contest's own submission population (relative competition, not absolute).
 */
export function videoEngagementScore(rawMetrics, populationMax) {
  let total = 0;
  let weightUsed = 0;
  for (const [key, weight] of Object.entries(ENGAGEMENT_WEIGHTS)) {
    const max = populationMax?.[key];
    if (!max || max <= 0) continue; // no signal in this contest — skip, don't zero
    total += normalizeAgainstMax(rawMetrics?.[key], max) * weight;
    weightUsed += weight;
  }
  if (weightUsed === 0) return null; // insufficient data — never fake a 0
  return round2(clampScore(total / weightUsed));
}

/** Brand Traffic Score from VERIFIED traffic only (fraud already filtered out). */
export function brandTrafficScore(verifiedUnique, populationMaxUnique) {
  if (!populationMaxUnique || populationMaxUnique <= 0) return null; // no traffic yet
  return round2(normalizeAgainstMax(verifiedUnique, populationMaxUnique));
}

/**
 * Deterministic ranking. Spec §25 tie-break order:
 *   final score -> Brand Traffic -> Video Engagement -> earliest submission -> id.
 * Never random.
 */
export function compareForRank(a, b) {
  const fs = (b.final_score ?? -1) - (a.final_score ?? -1);
  if (fs !== 0) return fs;
  const tr = (b.traffic_score ?? -1) - (a.traffic_score ?? -1);
  if (tr !== 0) return tr;
  const en = (b.engagement_score ?? -1) - (a.engagement_score ?? -1);
  if (en !== 0) return en;
  const ta = Date.parse(a.submitted_at || a.created_date || 0) || 0;
  const tb = Date.parse(b.submitted_at || b.created_date || 0) || 0;
  if (ta !== tb) return ta - tb;
  return String(a.id).localeCompare(String(b.id));
}

export function rankSubmissions(subs) {
  return [...subs].sort(compareForRank);
}
