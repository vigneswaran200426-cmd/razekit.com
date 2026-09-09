// @ts-nocheck
// Server-authoritative winner finalization.
//
// Before this existed, Review.jsx wrote Submission.status='won' and
// Contest.winner_user_id straight from the browser: any brand could name any
// winner, and (because a creator owns their own Submission row) a creator could
// mark themselves the winner. Those fields are now blocked by
// entities/protected.ts, and this function is the ONLY way a winner is set.
//
// Selection rule (spec §7): FinalScore = (VideoEngagement + BrandTraffic) / 2,
// both 0-100, highest wins. Tie-break: Brand Traffic -> Video Engagement ->
// earliest submission -> id (fully deterministic, never random).
import { json } from './context.js';

const SCORED_STATES = ['submitted', 'shortlisted', 'won', 'not_selected'];

// A submission counts as scored once the engine has written a final_score.
const isScored = (s) => typeof s.final_score === 'number' && !Number.isNaN(s.final_score);

export function rankSubmissions(subs) {
  return [...subs].sort((a, b) => {
    const fs = (b.final_score ?? -1) - (a.final_score ?? -1);
    if (fs !== 0) return fs;
    const tr = (b.traffic_score ?? -1) - (a.traffic_score ?? -1);
    if (tr !== 0) return tr;
    const en = (b.engagement_score ?? -1) - (a.engagement_score ?? -1);
    if (en !== 0) return en;
    const ta = Date.parse(a.submitted_at || a.created_date || 0) || 0;
    const tb = Date.parse(b.submitted_at || b.created_date || 0) || 0;
    if (ta !== tb) return ta - tb; // earlier submission wins a dead tie
    return String(a.id).localeCompare(String(b.id));
  });
}

export async function winnerFinalize(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const svc = ctx.svc;
  const { contest_id: contestId, submission_id: submissionId } = ctx.body || {};
  if (!contestId) return json({ error: 'contest_id is required' }, 400);

  const contest = await svc.entities.Contest.get(contestId).catch(() => null);
  if (!contest) return json({ error: 'Contest not found' }, 404);

  // Only the brand that owns the contest, or a platform admin.
  const isAdmin = user.role === 'admin';
  if (contest.created_by_id !== user.id && !isAdmin) return json({ error: 'Forbidden' }, 403);

  if (contest.winner_user_id) {
    return json({ error: { code: 'ALREADY_FINALIZED', message: 'A winner has already been finalized for this contest.' } }, 409);
  }
  if (['cancelled', 'draft'].includes(contest.status)) {
    return json({ error: { code: 'INVALID_STATE', message: `A winner cannot be finalized while the contest is ${contest.status}.` } }, 409);
  }

  const all = await svc.entities.Submission.filter({ contest_id: contestId }, '-created_date', 500);
  const eligible = all.filter((s) => SCORED_STATES.includes(s.status) && !s.deleted_at && !s.dispute_hold);
  if (!eligible.length) {
    return json({ error: { code: 'NO_SUBMISSIONS', message: 'This contest has no eligible submissions to finalize.' } }, 409);
  }

  const scored = eligible.filter(isScored);
  let winner;
  let method;
  let ranked;

  if (scored.length) {
    // Authoritative path — the score decides, not the brand.
    ranked = rankSubmissions(scored);
    winner = ranked[0];
    method = 'scored';
    // A brand may not override the computed winner.
    if (submissionId && submissionId !== winner.id) {
      return json({
        error: {
          code: 'OVERRIDE_REJECTED',
          message: 'The winner is determined by the RazeKit performance score and cannot be overridden.',
        },
      }, 422);
    }
  } else {
    // Transitional path: performance scoring has no data yet (Brand Traffic
    // collection is not live). Rather than invent scores, the brand's pick is
    // recorded explicitly as a manual selection and audited as such.
    if (!submissionId) {
      return json({ error: { code: 'SELECTION_REQUIRED', message: 'Select a submission to finalize.' } }, 400);
    }
    winner = eligible.find((s) => s.id === submissionId);
    if (!winner) return json({ error: 'Submission does not belong to this contest.' }, 400);
    ranked = [winner, ...eligible.filter((s) => s.id !== winner.id)];
    method = 'manual_pre_scoring';
  }

  const now = new Date().toISOString();

  // Write results (service role — bypasses the browser-facing field guard).
  for (const [i, s] of ranked.entries()) {
    const patch = { rank: i + 1 };
    if (s.id === winner.id) patch.status = 'won';
    else if (s.status !== 'not_selected') patch.status = 'not_selected';
    await svc.entities.Submission.update(s.id, patch).catch(() => {});
  }

  await svc.entities.Contest.update(contestId, {
    winner_user_id: winner.created_by_id,
    winner_submission_id: winner.id,
    winner_selected_at: now,
    status: 'winner_selected',
  });

  await svc.entities.AuditLog.create({
    user_id: winner.created_by_id,
    action: 'winner.finalize',
    actor: user.id,
    status: 'success',
    reason: method,
    result: JSON.stringify({
      contest_id: contestId,
      submission_id: winner.id,
      selection_method: method,
      final_score: winner.final_score ?? null,
      scoring_version: winner.scoring_version ?? null,
      candidates: ranked.length,
      finalized_at: now,
    }),
  }).catch(() => null);

  await svc.entities.Notification.create({
    type: 'contest_won',
    title: 'You won!',
    description: `Your submission won "${contest.title}".`,
    recipient_user_id: winner.created_by_id,
    contest_id: contestId,
  }).catch(() => null);

  return json({
    ok: true,
    contest_id: contestId,
    winner_submission_id: winner.id,
    winner_user_id: winner.created_by_id,
    selection_method: method,
    final_score: winner.final_score ?? null,
    finalized_at: now,
  });
}
