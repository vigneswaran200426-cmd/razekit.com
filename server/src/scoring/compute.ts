// @ts-nocheck
// Turns raw signals into the two RazeKit score dimensions for one contest.
//
// Normalization is RELATIVE TO THE CONTEST'S OWN submissions (spec §22: never
// compare raw metrics directly), so a creator competes against the field they
// actually entered, not against platform-wide outliers.
import {
  videoEngagementScore, brandTrafficScore, finalScore, rankSubmissions,
  SCORING_VERSION, SCORE_STATES,
} from './index.js';

const ENGAGEMENT_KEYS = ['views', 'likes', 'comments', 'shares', 'saves', 'watch_time', 'follower_growth'];

/** Pull approved engagement inputs for a submission from its campaign post. */
function engagementInputs(post) {
  if (!post) return null;
  let m = post.metrics;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch { m = null; } }
  if (!m || typeof m !== 'object') return null;
  const out = {};
  let any = false;
  for (const k of ENGAGEMENT_KEYS) {
    const v = Number(m[k]);
    if (Number.isFinite(v) && v >= 0) { out[k] = v; any = true; }
  }
  return any ? out : null;
}

/**
 * Compute (but do not persist) scores for every submission in a contest.
 * Returns rows with engagement_score / traffic_score / final_score / rank.
 *
 * Only VERIFIED traffic contributes — fraud filtering already happened at
 * ingest, and TrackingLink.verified_clicks/unique_visitors hold the result.
 */
export function computeScores({ submissions, linksBySubmission, postsBySubmission }) {
  const rawEngagement = new Map();
  const rawTraffic = new Map();

  for (const s of submissions) {
    rawEngagement.set(s.id, engagementInputs(postsBySubmission.get(s.id)));
    const link = linksBySubmission.get(s.id);
    rawTraffic.set(s.id, link ? Number(link.unique_visitors || 0) : null);
  }

  // Population maxima drive the normalization.
  const popMax = {};
  for (const k of ENGAGEMENT_KEYS) {
    popMax[k] = Math.max(0, ...submissions.map((s) => rawEngagement.get(s.id)?.[k] || 0));
  }
  const trafficValues = submissions.map((s) => rawTraffic.get(s.id)).filter((v) => v !== null);
  const trafficMax = trafficValues.length ? Math.max(...trafficValues) : 0;

  const scored = submissions.map((s) => {
    const eng = rawEngagement.get(s.id);
    const trf = rawTraffic.get(s.id);

    const engagement_score = eng ? videoEngagementScore(eng, popMax) : null;
    const traffic_score = trf === null ? null : brandTrafficScore(trf, trafficMax);

    // Never invent a score from nothing (spec §28: no fake zeros).
    let score_state = SCORE_STATES.FINAL;
    let final_score = null;
    if (engagement_score === null && traffic_score === null) {
      score_state = SCORE_STATES.INSUFFICIENT_DATA;
    } else {
      // A dimension with no data yet contributes 0 but the state says provisional,
      // so the UI can be honest about what is still missing.
      if (engagement_score === null || traffic_score === null) score_state = SCORE_STATES.PROVISIONAL;
      final_score = finalScore(engagement_score ?? 0, traffic_score ?? 0);
    }

    return {
      ...s,
      engagement_score, traffic_score, final_score, score_state,
      scoring_version: SCORING_VERSION,
      metric_snapshot: JSON.stringify({ engagement: eng || null, verified_unique_visitors: trf, population: { engagement: popMax, trafficMax } }),
    };
  });

  const ranked = rankSubmissions(scored.filter((s) => s.final_score !== null));
  ranked.forEach((s, i) => { s.rank = i + 1; });
  const unscored = scored.filter((s) => s.final_score === null);
  return { ranked, unscored, scoredCount: ranked.length };
}

/** Load the inputs a contest needs, then compute. */
export async function computeContestScores(svc, contestId) {
  const subs = (await svc.entities.Submission.filter({ contest_id: contestId }, '-created_date', 500))
    .filter((s) => !s.deleted_at && s.status !== 'working');
  if (!subs.length) return { ranked: [], unscored: [], scoredCount: 0 };

  const links = await svc.entities.TrackingLink.filter({ contest_id: contestId }, '-created_date', 500).catch(() => []);
  const posts = await svc.entities.SocialCampaignPost.filter({ contest_id: contestId }, '-created_date', 500).catch(() => []);

  const linksBySubmission = new Map(links.filter((l) => l.submission_id).map((l) => [l.submission_id, l]));
  const postsBySubmission = new Map(posts.filter((p) => p.submission_id).map((p) => [p.submission_id, p]));

  return computeScores({ submissions: subs, linksBySubmission, postsBySubmission });
}
