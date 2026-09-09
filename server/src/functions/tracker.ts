// @ts-nocheck
// RazeKit Tracker — performance intelligence, READ ONLY.
//
// Tracker never computes a second version of the winner algorithm and never
// mutates authoritative state (spec 5/9/49). It reads contests, submissions,
// score snapshots, tracking-link aggregates and payout records, and returns
// role-scoped views.
//
// Authorization is explicit on every path: we use the service client for
// aggregation, so each handler MUST filter by the caller's own id. Never trust
// a contest/creator id from the request without an ownership check (IDOR).
import { json } from './context.js';
import { SCORING_VERSION } from '../scoring/index.js';

const freshest = (rows) => {
  const t = rows
    .map((r) => Date.parse(r.last_click_at || r.updated_date || r.created_date || 0) || 0)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  return t ? new Date(t).toISOString() : null;
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const sum = (rows, key) => rows.reduce((a, r) => a + Number(r[key] || 0), 0);

// Aggregate traffic counters. Raw events are never exposed here (spec 13/37);
// the fraud reasoning stays admin-only and only a coarse exclusion count leaks.
const trafficBlock = (links) => ({
  total_clicks: sum(links, 'total_clicks'),
  verified_clicks: sum(links, 'verified_clicks'),
  unique_visitors: sum(links, 'unique_visitors'),
  excluded_clicks: sum(links, 'suspicious_clicks'),
  updated_at: freshest(links),
});

// ── CREATOR ───────────────────────────────────────────────────────────────────

export async function trackerCreatorOverview(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;

  const subs = await svc.entities.Submission.filter({ created_by_id: user.id }, '-created_date', 500);
  const contestIds = [...new Set(subs.map((s) => s.contest_id).filter(Boolean))];
  const contests = [];
  for (const id of contestIds) {
    const c = await svc.entities.Contest.get(id).catch(() => null);
    if (c) contests.push(c);
  }
  const byId = new Map(contests.map((c) => [c.id, c]));

  const snaps = await svc.entities.ScoreSnapshot.filter({ creator_id: user.id }, '-created_date', 500).catch(() => []);
  const links = await svc.entities.TrackingLink.filter({ creator_id: user.id }, '-created_date', 500).catch(() => []);

  const wins = subs.filter((s) => s.status === 'won');
  const completed = subs.filter((s) => ['won', 'not_selected'].includes(s.status));
  const active = subs.filter((s) => {
    const c = byId.get(s.contest_id);
    return c && ['open', 'draft'].includes(c.status);
  });

  const finals = snaps.map((s) => num(s.final_score)).filter((v) => v !== null);
  const earned = wins.reduce((a, s) => a + Number(byId.get(s.contest_id)?.prize_amount || 0), 0);

  return json({
    role: 'creator',
    kpis: {
      contests_joined: contestIds.length,
      active_contests: active.length,
      completed_contests: completed.length,
      submissions: subs.length,
      wins: wins.length,
      win_rate: completed.length ? Math.round((wins.length / completed.length) * 1000) / 10 : null,
      prizes_earned: earned,
      currency: contests[0]?.currency || 'INR',
      average_final_score: avg(finals),
    },
    traffic: trafficBlock(links),
    scoring_version: SCORING_VERSION,
  });
}

export async function trackerCreatorContests(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;

  const subs = await svc.entities.Submission.filter({ created_by_id: user.id }, '-created_date', 500);
  const snaps = await svc.entities.ScoreSnapshot.filter({ creator_id: user.id }, '-created_date', 500).catch(() => []);
  const links = await svc.entities.TrackingLink.filter({ creator_id: user.id }, '-created_date', 500).catch(() => []);
  const snapBySub = new Map(snaps.map((s) => [s.submission_id, s]));
  const linkBySub = new Map(links.filter((l) => l.submission_id).map((l) => [l.submission_id, l]));

  const rows = [];
  for (const s of subs) {
    const c = await svc.entities.Contest.get(s.contest_id).catch(() => null);
    if (!c) continue;
    const snap = snapBySub.get(s.id);
    const link = linkBySub.get(s.id);
    rows.push({
      submission_id: s.id,
      contest_id: c.id,
      contest_title: c.title,
      category: c.category || null,
      prize_amount: c.prize_amount || 0,
      currency: c.currency || 'INR',
      deadline: c.deadline || null,
      contest_status: c.status,
      submission_status: s.status,
      submitted_at: s.submitted_at || null,
      engagement_score: num(snap?.engagement_score ?? s.engagement_score),
      traffic_score: num(snap?.traffic_score ?? s.traffic_score),
      final_score: num(snap?.final_score ?? s.final_score),
      rank: snap?.rank ?? s.rank ?? null,
      score_state: snap?.score_state ?? s.score_state ?? 'not_started',
      is_winner: s.status === 'won',
      prize_earned: s.status === 'won' ? Number(c.prize_amount || 0) : 0,
      verified_visitors: link ? Number(link.unique_visitors || 0) : null,
      scoring_version: snap?.scoring_version || null,
    });
  }
  return json({ contests: rows });
}

// ── BRAND ─────────────────────────────────────────────────────────────────────

export async function trackerBrandOverview(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;

  const contests = await svc.entities.Contest.filter({ created_by_id: user.id }, '-created_date', 500);

  const allSubs = [];
  for (const c of contests) {
    const s = await svc.entities.Submission.filter({ contest_id: c.id }, '-created_date', 500).catch(() => []);
    allSubs.push(...s);
  }
  const links = await svc.entities.TrackingLink.filter({ client_id: user.id }, '-created_date', 1000).catch(() => []);

  const awaitingReview = allSubs.filter((s) => s.status === 'submitted').length;
  const pastDeadline = contests.filter(
    (c) => c.status === 'open' && c.deadline && Date.parse(c.deadline) < Date.now()
  ).length;
  const noDestination = contests.filter((c) => !c.brand_destination_url).length;

  const attention = [];
  if (awaitingReview) {
    attention.push({ kind: 'review', count: awaitingReview, message: awaitingReview + ' submissions awaiting review.' });
  }
  if (pastDeadline) {
    attention.push({ kind: 'finalize', count: pastDeadline, message: pastDeadline + ' campaigns past deadline await winner finalization.' });
  }
  if (noDestination) {
    attention.push({ kind: 'destination', count: noDestination, message: noDestination + ' campaigns have no destination URL, so Brand Traffic cannot be measured.' });
  }

  return json({
    role: 'client',
    kpis: {
      total_campaigns: contests.length,
      active_campaigns: contests.filter((c) => c.status === 'open').length,
      completed_campaigns: contests.filter((c) => ['winner_selected', 'completed'].includes(c.status)).length,
      participants: new Set(allSubs.map((s) => s.created_by_id).filter(Boolean)).size,
      submissions: allSubs.length,
      winners: contests.filter((c) => c.winner_user_id).length,
      total_prize_value: contests.reduce((a, c) => a + Number(c.prize_amount || 0), 0),
      currency: contests[0]?.currency || 'INR',
    },
    traffic: trafficBlock(links),
    attention,
    scoring_version: SCORING_VERSION,
  });
}

export async function trackerBrandCampaigns(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;
  const contests = await svc.entities.Contest.filter({ created_by_id: user.id }, '-created_date', 500);

  const rows = [];
  for (const c of contests) {
    const subs = await svc.entities.Submission.filter({ contest_id: c.id }, '-created_date', 500).catch(() => []);
    const links = await svc.entities.TrackingLink.filter({ contest_id: c.id }, '-created_date', 500).catch(() => []);
    const snaps = await svc.entities.ScoreSnapshot.filter({ contest_id: c.id }, '-created_date', 500).catch(() => []);
    const finals = snaps.map((s) => num(s.final_score)).filter((v) => v !== null);
    rows.push({
      contest_id: c.id,
      title: c.title,
      status: c.status,
      prize_amount: c.prize_amount || 0,
      currency: c.currency || 'INR',
      deadline: c.deadline || null,
      category: c.category || null,
      min_duration_days: c.min_duration_days ?? null,
      max_duration_days: c.max_duration_days ?? null,
      participants: new Set(subs.map((s) => s.created_by_id)).size,
      submissions: subs.length,
      has_destination: Boolean(c.brand_destination_url),
      verified_visitors: sum(links, 'unique_visitors'),
      excluded_clicks: sum(links, 'suspicious_clicks'),
      average_final_score: avg(finals),
      top_final_score: finals.length ? Math.max(...finals) : null,
      winner_user_id: c.winner_user_id || null,
      winner_selected_at: c.winner_selected_at || null,
    });
  }
  return json({ campaigns: rows });
}

// Per-campaign detail. Ownership enforced: a brand cannot read another's campaign.
export async function trackerCampaignDetail(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;
  const contestId = ctx.body?.contest_id;
  if (!contestId) return json({ error: 'contest_id is required' }, 400);

  const c = await svc.entities.Contest.get(contestId).catch(() => null);
  if (!c) return json({ error: 'Contest not found' }, 404);
  if (c.created_by_id !== user.id && user.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const subs = await svc.entities.Submission.filter({ contest_id: contestId }, '-created_date', 500);
  const links = await svc.entities.TrackingLink.filter({ contest_id: contestId }, '-created_date', 500).catch(() => []);
  const snaps = await svc.entities.ScoreSnapshot.filter({ contest_id: contestId }, '-created_date', 500).catch(() => []);
  const snapBySub = new Map(snaps.map((s) => [s.submission_id, s]));
  const linkBySub = new Map(links.filter((l) => l.submission_id).map((l) => [l.submission_id, l]));

  const entries = subs
    .map((s) => {
      const snap = snapBySub.get(s.id);
      const link = linkBySub.get(s.id);
      return {
        submission_id: s.id,
        creator_id: s.created_by_id,
        title: s.title || null,
        status: s.status,
        submitted_at: s.submitted_at || null,
        engagement_score: num(snap?.engagement_score ?? s.engagement_score),
        traffic_score: num(snap?.traffic_score ?? s.traffic_score),
        final_score: num(snap?.final_score ?? s.final_score),
        rank: snap?.rank ?? s.rank ?? null,
        score_state: snap?.score_state ?? s.score_state ?? 'not_started',
        verified_visitors: link ? Number(link.unique_visitors || 0) : null,
        is_winner: s.id === c.winner_submission_id,
      };
    })
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  return json({
    campaign: {
      contest_id: c.id,
      title: c.title,
      status: c.status,
      category: c.category || null,
      prize_amount: c.prize_amount || 0,
      currency: c.currency || 'INR',
      deadline: c.deadline || null,
      start_date: c.start_date || null,
      min_duration_days: c.min_duration_days ?? null,
      max_duration_days: c.max_duration_days ?? null,
      duration_rule_version: c.duration_rule_version || null,
      has_destination: Boolean(c.brand_destination_url),
      winner_submission_id: c.winner_submission_id || null,
      winner_selected_at: c.winner_selected_at || null,
    },
    traffic: trafficBlock(links),
    entries,
    scoring_version: SCORING_VERSION,
  });
}
