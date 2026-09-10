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
import { computeContestScores } from '../scoring/compute.js';
import { SCORING_VERSION } from '../scoring/index.js';
import { loadLockedCriteria } from './compliance.js';
import { ELIGIBILITY, ENGINE_VERSION as COMPLIANCE_ENGINE_VERSION } from '../compliance/engine.js';
import { ensurePayoutForWinner } from './payouts.js';

const SCORED_STATES = ['submitted', 'shortlisted', 'won', 'not_selected'];

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

  // ── COMPLIANCE GATE (spec 11/28) ────────────────────────────────────────
  // Rules come BEFORE performance: only submissions that satisfy the contest's
  // locked mandatory requirements may enter scoring at all.
  const { version: criteriaVersion } = await loadLockedCriteria(svc, contestId);
  const complianceBySubmission = new Map();
  let unresolved = 0;

  if (criteriaVersion) {
    for (const s of eligible) {
      const rows = await svc.entities.SubmissionCompliance
        .filter({ submission_id: s.id }, '-created_date', 5).catch(() => []);
      const latest = rows.find((r) => r.criteria_version_id === criteriaVersion.id) || null;
      complianceBySubmission.set(s.id, latest);
      // Never silently finalize while a mandatory requirement is unevaluated
      // or awaiting review (spec 23).
      if (!latest || latest.status === ELIGIBILITY.REVIEW_REQUIRED || latest.status === ELIGIBILITY.PENDING) unresolved++;
    }

    if (unresolved > 0) {
      return json({
        error: {
          code: 'COMPLIANCE_INCOMPLETE',
          message: `${unresolved} submission(s) still need a requirement check or review before a winner can be finalized.`,
          unresolved,
        },
      }, 409);
    }
  }

  const compliant = criteriaVersion
    ? eligible.filter((s) => complianceBySubmission.get(s.id)?.status === ELIGIBILITY.ELIGIBLE)
    : eligible;

  if (criteriaVersion && !compliant.length) {
    return json({
      error: {
        code: 'NO_ELIGIBLE_SUBMISSIONS',
        message: 'No submission met the mandatory contest requirements, so a winner cannot be finalized.',
      },
    }, 409);
  }

  const compliantIds = new Set(compliant.map((s) => s.id));

  // Recompute from authoritative signals at finalization time — never trust a
  // stored score that could be stale. The scoring engine is the only source.
  const computed = await computeContestScores(svc, contestId).catch(() => ({ ranked: [], scoredCount: 0 }));
  // Ineligible submissions are excluded from ranking entirely.
  const scored = (computed.ranked || []).filter((r) => !criteriaVersion || compliantIds.has(r.id));

  let winner;
  let method;
  let ranked;

  if (scored.length) {
    // Authoritative path — the score decides, not the brand.
    ranked = scored;
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
    winner = compliant.find((s) => s.id === submissionId);
    if (!winner) {
      // Either not in this contest, or it failed a mandatory requirement.
      const exists = eligible.some((s) => s.id === submissionId);
      return json({
        error: exists
          ? { code: 'SUBMISSION_INELIGIBLE', message: 'That submission did not meet the mandatory contest requirements and cannot be selected.' }
          : 'Submission does not belong to this contest.',
      }, exists ? 422 : 400);
    }
    ranked = [winner, ...compliant.filter((s) => s.id !== winner.id)];
    method = 'manual_pre_scoring';
  }

  const now = new Date().toISOString();

  // Write results (service role — bypasses the browser-facing field guard).
  for (const [i, s] of ranked.entries()) {
    const patch = { rank: i + 1 };
    if (method === 'scored') {
      patch.engagement_score = s.engagement_score ?? null;
      patch.traffic_score = s.traffic_score ?? null;
      patch.final_score = s.final_score ?? null;
      patch.scoring_version = SCORING_VERSION;
      patch.score_state = s.score_state ?? null;
      patch.scored_at = now;
    }
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

  // Immutable scoring snapshot (spec §11/§33) so historical results stay
  // reproducible even as live metrics keep moving.
  // Denormalise display fields onto the snapshot so the public Winners page is
  // a single query instead of a contest + two user lookups per winner.
  const winnerUser = await svc.entities.User.get(winner.created_by_id).catch(() => null);
  const brandUser = await svc.entities.User.get(contest.created_by_id).catch(() => null);

  for (const s of ranked) {
    const su = s.id === winner.id ? winnerUser : await svc.entities.User.get(s.created_by_id).catch(() => null);
    await svc.entities.ScoreSnapshot.create({
      contest_id: contestId,
      contest_title: contest.title || null,
      category: contest.category || null,
      cover_image_url: contest.cover_image_url || null,
      prize_amount: contest.prize_amount || 0,
      currency: contest.currency || 'INR',
      creator_name: su?.full_name || null,
      brand_name: brandUser?.full_name || null,
      submission_id: s.id,
      creator_id: s.created_by_id,
      client_id: contest.created_by_id,
      engagement_score: s.engagement_score ?? null,
      traffic_score: s.traffic_score ?? null,
      final_score: s.final_score ?? null,
      rank: s.rank ?? null,
      is_winner: s.id === winner.id,
      tie_break_applied: Boolean(
        s.final_score !== null && ranked.some((o) => o.id !== s.id && o.final_score === s.final_score)
      ),
      scoring_version: SCORING_VERSION,
      selection_method: method,
      // Compliance context, so a finalized result stays reproducible.
      criteria_version_id: criteriaVersion?.id || null,
      compliance_status: complianceBySubmission.get(s.id)?.status || null,
      compliance_id: complianceBySubmission.get(s.id)?.id || null,
      compliance_evaluation_version: criteriaVersion ? COMPLIANCE_ENGINE_VERSION : null,
      metric_snapshot: s.metric_snapshot || null,
      score_state: s.score_state || null,
      finalized_at: now,
    }).catch(() => null);
  }

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
      criteria_version_id: criteriaVersion?.id || null,
      excluded_for_compliance: criteriaVersion ? eligible.length - compliant.length : 0,
      finalized_at: now,
    }),
  }).catch(() => null);

  // Turn the contest's committed prize into a debt owed to this creator.
  // Deliberately after the winner is recorded and deliberately best-effort:
  // a bookkeeping problem must not undo a finalised, audited result. If it
  // fails, the payout is created on first read of the payout overview and the
  // contest still shows a correct winner.
  const payoutRecord = await ensurePayoutForWinner(svc, {
    contest: { ...contest, funding_id: contest.funding_id, id: contestId },
    submission: winner,
    creatorId: winner.created_by_id,
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
    // Says plainly whether the prize can actually be paid, rather than
    // implying a payout that no verified money stands behind.
    payout: payoutRecord
      ? { id: payoutRecord.id, status: payoutRecord.status, reason: payoutRecord.eligibility_reason || null }
      : null,
  });
}
