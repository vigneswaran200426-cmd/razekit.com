// @ts-nocheck
// Campaign report, creator track record, and the anti-fraud signal foundation.
//
// Everything here is DERIVED from records that already exist. Nothing is
// estimated, projected or filled in — where a number is not measurable, the
// field says so rather than showing a plausible zero.
import { json } from './context.js';
import { round2 } from '../scoring/index.js';
import { configFor } from '../scoring/weights.js';
import { inferLifecycle, LIFECYCLE_COPY } from '../contest/lifecycle.js';
import { displayName } from '../finance/notify.js';

const err = (code, message, status = 400) => json({ error: { code, message } }, status);
const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const avg = (xs) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

// ── campaignReport ──────────────────────────────────────────────────────────
/**
 * The brand's report on a finished (or running) campaign.
 *
 * Deliberately absent: conversions, attributed revenue and ROI. RazeKit does
 * not measure them, so they are named as not-implemented rather than shown as
 * zero — a zero would read as "this campaign earned nothing".
 */
export async function campaignReport(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const contestId = ctx.body?.contest_id;
  if (!contestId) return err('CONTEST_ID_REQUIRED', 'contest_id is required.');
  const svc = ctx.svc;

  const contest = await svc.entities.Contest.get(contestId).catch(() => null);
  if (!contest) return err('CONTEST_NOT_FOUND', 'Contest not found.', 404);
  if (contest.created_by_id !== ctx.user.id && ctx.user.role !== 'admin') {
    return err('FORBIDDEN', 'Only the brand that ran this campaign can see its report.', 403);
  }

  const [subs, snaps, links, funding, verification, dqs] = await Promise.all([
    svc.entities.Submission.filter({ contest_id: contestId }, '-created_date', 500).catch(() => []),
    svc.entities.ScoreSnapshot.filter({ contest_id: contestId }, '-created_date', 500).catch(() => []),
    svc.entities.TrackingLink.filter({ contest_id: contestId }, '-created_date', 500).catch(() => []),
    contest.funding_id ? svc.entities.ContestFunding.get(contest.funding_id).catch(() => null) : null,
    svc.entities.WinnerVerification.filter({ contest_id: contestId }, '-created_date', 1).catch(() => []),
    svc.entities.Disqualification.filter({ contest_id: contestId, status: 'ACTIVE' }, '-created_date', 100).catch(() => []),
  ]);

  const config = await configFor(svc, contestId);
  const entered = subs.filter((s) => s.status !== 'working');
  const valid = entered.filter((s) => !s.disqualified);
  const snapBySub = new Map(snaps.map((s) => [s.submission_id, s]));

  const scored = valid
    .map((s) => {
      const snap = snapBySub.get(s.id);
      return {
        submission_id: s.id,
        creator_id: s.created_by_id,
        engagement_score: num(snap?.engagement_score ?? s.engagement_score),
        traffic_score: num(snap?.traffic_score ?? s.traffic_score),
        final_score: num(snap?.final_score ?? s.final_score),
        rank: snap?.rank ?? s.rank ?? null,
        is_winner: Boolean(snap?.is_winner) || s.id === contest.winner_submission_id,
      };
    })
    .filter((s) => s.final_score !== null)
    .sort((a, b) => (b.final_score ?? -1) - (a.final_score ?? -1));

  // Resolve names once, for the handful of rows the report actually shows.
  const top = [];
  for (const s of scored.slice(0, 10)) {
    const u = await svc.entities.User.get(s.creator_id).catch(() => null);
    top.push({ ...s, creator_name: displayName(u) });
  }

  const verifiedTraffic = links.reduce((a, l) => a + Number(l.unique_visitors || 0), 0);
  const excludedTraffic = links.reduce((a, l) => a + Number(l.suspicious_clicks || 0), 0);
  const lifecycle = inferLifecycle(contest);

  const winnerUser = contest.winner_user_id
    ? await svc.entities.User.get(contest.winner_user_id).catch(() => null) : null;

  return json({
    campaign: {
      id: contest.id, title: contest.title, category: contest.category || null,
      lifecycle_state: lifecycle,
      state_label: LIFECYCLE_COPY[lifecycle]?.label || lifecycle,
      created_date: contest.created_date, deadline: contest.deadline || null,
      completed_at: contest.completed_at || null,
      prize_amount: contest.prize_amount ?? null, currency: contest.currency || 'INR',
    },
    participation: {
      // "Entered" counts real entries; a draft that was never submitted is not
      // participation and is not counted as one.
      submissions: entered.length,
      valid_submissions: valid.length,
      disqualified: dqs.length,
      scored_submissions: scored.length,
      unscored_submissions: valid.length - scored.length,
    },
    performance: {
      scoring: {
        engagement_weight: config.engagement_weight,
        traffic_weight: config.traffic_weight,
        config_version: config.version,
      },
      average_engagement: avg(scored.map((s) => s.engagement_score).filter((n) => n !== null)),
      average_traffic: avg(scored.map((s) => s.traffic_score).filter((n) => n !== null)),
      average_final: avg(scored.map((s) => s.final_score).filter((n) => n !== null)),
      best_final: scored[0]?.final_score ?? null,
      verified_unique_visitors: verifiedTraffic,
      // Named rather than hidden: excluded traffic is a real signal about the
      // campaign, and concealing it would overstate reach.
      excluded_suspicious_clicks: excludedTraffic,
      tracking_links: links.length,
    },
    top_performers: top,
    winner: contest.winner_user_id ? {
      creator_id: contest.winner_user_id,
      creator_name: displayName(winnerUser),
      submission_id: contest.winner_submission_id || null,
      selected_at: contest.winner_selected_at || null,
      final_score: scored.find((s) => s.is_winner)?.final_score ?? null,
      verification_status: verification[0]?.status || null,
      verified_at: contest.winner_verified_at || null,
    } : null,
    funding: funding ? {
      status: funding.status,
      total_amount_minor: funding.total_amount_minor,
      prize_amount_minor: funding.prize_amount_minor,
      platform_fee_minor: funding.platform_fee_minor,
      verified_at: funding.verified_at || null,
    } : { status: contest.funding_status || 'FUNDING_REQUIRED' },
    // Stated explicitly so nobody reads a missing metric as a measured zero.
    not_measured: {
      clicks_to_conversion: 'RazeKit does not measure conversions.',
      attributed_revenue: 'RazeKit does not measure revenue attribution.',
      roi: 'Requires conversion and revenue data, which RazeKit does not collect.',
    },
    generated_at: new Date().toISOString(),
  });
}

// ── creatorTrackRecord ──────────────────────────────────────────────────────
/**
 * A creator's own history. Their full record for themselves; the public view
 * (creatorPublicProfile) stays narrower.
 */
export async function creatorTrackRecord(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const svc = ctx.svc;
  const targetId = ctx.body?.creator_id || ctx.user.id;
  const isSelf = targetId === ctx.user.id;
  if (!isSelf && ctx.user.role !== 'admin') {
    return err('FORBIDDEN', 'You can only view your own track record.', 403);
  }

  const [subs, snaps, payouts] = await Promise.all([
    svc.entities.Submission.filter({ created_by_id: targetId }, '-created_date', 500).catch(() => []),
    svc.entities.ScoreSnapshot.filter({ creator_id: targetId }, '-created_date', 500).catch(() => []),
    svc.entities.Payout.filter({ creator_id: targetId }, '-created_date', 200).catch(() => []),
  ]);

  const entered = subs.filter((s) => s.status !== 'working');
  const wins = snaps.filter((s) => s.is_winner);
  const scoredSnaps = snaps.filter((s) => s.final_score !== null && s.final_score !== undefined);

  const history = [];
  for (const s of snaps.slice(0, 50)) {
    history.push({
      contest_id: s.contest_id,
      contest_title: s.contest_title || null,
      brand_name: s.brand_name || null,
      category: s.category || null,
      final_score: num(s.final_score),
      engagement_score: num(s.engagement_score),
      traffic_score: num(s.traffic_score),
      rank: s.rank ?? null,
      is_winner: Boolean(s.is_winner),
      prize_amount: s.prize_amount ?? null,
      currency: s.currency || 'INR',
      finalized_at: s.finalized_at || null,
    });
  }

  const paid = payouts.filter((p) => p.status === 'PAYOUT_PAID');

  return json({
    creator_id: targetId,
    is_self: isSelf,
    totals: {
      contests_entered: entered.length,
      contests_completed: snaps.length,
      wins: wins.length,
      // Only meaningful once results exist; null rather than a misleading 0%.
      win_rate: snaps.length ? round2((wins.length / snaps.length) * 100) : null,
      disqualified: entered.filter((s) => s.disqualified).length,
    },
    averages: {
      final_score: avg(scoredSnaps.map((s) => Number(s.final_score))),
      engagement: avg(scoredSnaps.filter((s) => s.engagement_score !== null).map((s) => Number(s.engagement_score))),
      traffic: avg(scoredSnaps.filter((s) => s.traffic_score !== null).map((s) => Number(s.traffic_score))),
      best_final_score: scoredSnaps.length ? Math.max(...scoredSnaps.map((s) => Number(s.final_score))) : null,
    },
    earnings: isSelf ? {
      // Only the creator sees their own money.
      prizes_won_minor: paid.reduce((a, p) => a + Number(p.amount_minor || 0), 0),
      payouts_paid: paid.length,
      payouts_pending: payouts.filter((p) => p.status !== 'PAYOUT_PAID').length,
    } : null,
    history,
    generated_at: new Date().toISOString(),
  });
}

// ── fraudSignals ────────────────────────────────────────────────────────────
/**
 * The anti-fraud foundation.
 *
 * This computes REAL signals from records that exist — repeated URLs, unusual
 * traffic ratios, rapid resubmission. It deliberately does NOT score, rank or
 * judge: a signal is something for a person to look at, not a verdict. Building
 * a confident-looking fraud score on top of these would be exactly the fake
 * detection the spec warns against.
 */
export async function fraudSignals(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  if (ctx.user.role !== 'admin') return err('FORBIDDEN', 'Admin access is required.', 403);
  const svc = ctx.svc;
  const contestId = ctx.body?.contest_id || null;

  const query = contestId ? { contest_id: contestId } : {};
  const [subs, links, alerts] = await Promise.all([
    svc.entities.Submission.filter(query, '-created_date', 1000).catch(() => []),
    svc.entities.TrackingLink.filter(query, '-created_date', 1000).catch(() => []),
    svc.entities.FraudAlert.filter({}, '-created_date', 200).catch(() => []),
  ]);

  const signals = [];

  // 1. The same published URL claimed by more than one entry.
  const byUrl = new Map();
  for (const s of subs) {
    const url = String(s.live_url || '').trim().toLowerCase();
    if (!url) continue;
    byUrl.set(url, [...(byUrl.get(url) || []), s]);
  }
  for (const [url, group] of byUrl) {
    if (group.length < 2) continue;
    signals.push({
      kind: 'duplicate_content_url', severity: 'high',
      detail: `${group.length} entries share the same published URL.`,
      evidence: { url, submission_ids: group.map((s) => s.id), creator_ids: [...new Set(group.map((s) => s.created_by_id))] },
    });
  }

  // 2. Traffic where almost every click was filtered as suspicious. The filter
  //    already excluded it from scoring; this surfaces the pattern.
  for (const l of links) {
    const total = Number(l.total_clicks || 0);
    const suspicious = Number(l.suspicious_clicks || 0);
    if (total < 20 || suspicious / total < 0.6) continue;
    signals.push({
      kind: 'high_excluded_traffic_ratio', severity: 'medium',
      detail: `${Math.round((suspicious / total) * 100)}% of clicks on this link were excluded as suspicious.`,
      evidence: { tracking_link_id: l.id, contest_id: l.contest_id, total_clicks: total, excluded: suspicious },
    });
  }

  // 3. One creator entering the same contest many times in quick succession.
  const byCreatorContest = new Map();
  for (const s of subs) {
    const key = `${s.created_by_id}:${s.contest_id}`;
    byCreatorContest.set(key, [...(byCreatorContest.get(key) || []), s]);
  }
  for (const [key, group] of byCreatorContest) {
    if (group.length < 3) continue;
    const times = group.map((s) => Date.parse(s.created_date)).filter(Boolean).sort();
    const spanHours = times.length > 1 ? (times[times.length - 1] - times[0]) / 36e5 : 0;
    if (spanHours > 24) continue;
    signals.push({
      kind: 'rapid_resubmission', severity: 'low',
      detail: `${group.length} entries from one creator within ${Math.max(1, Math.round(spanHours))}h.`,
      evidence: { creator_id: key.split(':')[0], contest_id: key.split(':')[1], count: group.length },
    });
  }

  return json({
    signals,
    counts: {
      total: signals.length,
      high: signals.filter((s) => s.severity === 'high').length,
      medium: signals.filter((s) => s.severity === 'medium').length,
      low: signals.filter((s) => s.severity === 'low').length,
    },
    existing_alerts: alerts.slice(0, 50).map((a) => ({
      id: a.id, user_id: a.user_id, alert_type: a.alert_type,
      severity: a.severity, status: a.status, created_date: a.created_date,
    })),
    // Said plainly: these are leads, not conclusions.
    disclaimer: 'These are signals for a person to review, not automated fraud findings. RazeKit does not automatically penalise an account on the basis of a signal.',
    scope: contestId ? { contest_id: contestId } : { contest_id: null, scope: 'platform-wide' },
    generated_at: new Date().toISOString(),
  });
}
