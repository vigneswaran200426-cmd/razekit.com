// @ts-nocheck
// Winners showcase + leaderboard (spec 7/8/9/43/50).
//
// Both read the SAME authoritative records the scoring engine wrote — there is
// no second ranking algorithm here. The leaderboard ranks by finalized
// performance, never by followers, views or popularity.
import { json } from './context.js';
import { SCORING_VERSION } from '../scoring/index.js';

const round1 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

/** Officially finalized winning work, newest first. */
export async function winnersShowcase(ctx) {
  const svc = ctx.svc;
  const limit = Math.min(Number(ctx.body?.limit) || 60, 120);

  // Snapshots are the authoritative winner record.
  const snaps = (await svc.entities.ScoreSnapshot.filter({ is_winner: true }, '-created_date', 500).catch(() => []))
    .filter((s) => s.contest_id);

  // Single query: the snapshot carries its own display fields (denormalised at
  // finalization). Previously this did a contest + two user lookups PER winner —
  // ~180 sequential round-trips, which left the page stuck on skeletons.
  const rows = [];
  for (const s of snaps.slice(0, limit)) {
    rows.push({
      contest_id: s.contest_id,
      submission_id: s.submission_id,
      title: s.contest_title || 'Contest',
      category: s.category || null,
      cover_image_url: s.cover_image_url || null,
      prize_amount: s.prize_amount || 0,
      currency: s.currency || 'INR',
      // Real identities (spec 17) — these are public winner results.
      creator_id: s.creator_id,
      creator_name: s.creator_name || null,
      brand_id: s.client_id,
      brand_name: s.brand_name || null,
      // Performance is part of the result, not a hidden detail (spec 43).
      final_score: round1(s.final_score),
      engagement_score: round1(s.engagement_score),
      traffic_score: round1(s.traffic_score),
      score_state: s.score_state || null,
      scoring_version: s.scoring_version || null,
      finalized_at: s.finalized_at || null,
    });
  }

  rows.sort((a, b) => Date.parse(b.finalized_at || 0) - Date.parse(a.finalized_at || 0));
  return json({ winners: rows, scoring_version: SCORING_VERSION });
}

/**
 * Leaderboard derived from finalized snapshots.
 *
 * Ranked by wins, then total prize, then average Final Score — all of which
 * come from the scoring engine. Deliberately NOT ranked by followers, views,
 * likes or any popularity signal (spec 9).
 */
export async function winnersLeaderboard(ctx) {
  const svc = ctx.svc;
  const snaps = await svc.entities.ScoreSnapshot.filter({}, '-created_date', 2000).catch(() => []);

  const byCreator = new Map();
  for (const s of snaps) {
    if (!s.creator_id) continue;
    const e = byCreator.get(s.creator_id) || { creator_id: s.creator_id, wins: 0, entries: 0, scoreSum: 0, scoreCount: 0, prize: 0 };
    e.entries += 1;
    if (typeof s.final_score === 'number') { e.scoreSum += s.final_score; e.scoreCount += 1; }
    if (s.is_winner) e.wins += 1;
    byCreator.set(s.creator_id, e);
  }

  // Prize + display name also come from the snapshot — no extra queries.
  for (const s of snaps.filter((x) => x.is_winner)) {
    const e = byCreator.get(s.creator_id);
    if (e) { e.prize += Number(s.prize_amount || 0); e.currency = s.currency || 'INR'; }
  }
  for (const s of snaps) {
    const e = byCreator.get(s.creator_id);
    if (e && !e.creator_name && s.creator_name) e.creator_name = s.creator_name;
  }

  const rows = [...byCreator.values()].filter((e) => e.entries > 0);
  for (const e of rows) {
    e.average_final_score = e.scoreCount ? Math.round((e.scoreSum / e.scoreCount) * 10) / 10 : null;
    e.win_rate = e.entries ? Math.round((e.wins / e.entries) * 1000) / 10 : null;
    delete e.scoreSum; delete e.scoreCount;
  }

  rows.sort((a, b) =>
    (b.wins - a.wins) ||
    (b.prize - a.prize) ||
    ((b.average_final_score ?? -1) - (a.average_final_score ?? -1)) ||
    String(a.creator_id).localeCompare(String(b.creator_id))  // deterministic
  );

  const top = rows.slice(0, Math.min(Number(ctx.body?.limit) || 50, 100));
  top.forEach((e, i) => { e.rank = i + 1; });

  return json({
    leaderboard: top,
    scoring_version: SCORING_VERSION,
    basis: 'Ranked by finalized contest performance — wins, prize value and average Final Score. Never by followers or popularity.',
  });
}
