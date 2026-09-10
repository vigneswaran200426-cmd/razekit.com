// @ts-nocheck
// Campaign scoring configuration and disqualification.
//
// Two things a brand genuinely needs to control, and two things they must not:
//
//   CAN configure   how much Video Engagement vs Brand Traffic counts, how ties
//                   break, and whether the top score wins automatically
//   CAN disqualify  an entry that broke the rules, with a recorded reason
//
//   CANNOT          type a score, change a score, or change the rules once
//                   creators are competing under them
//
// The config LOCKS when the contest opens. Changing how a contest is scored
// while people are competing in it changes the rules mid-game, and every
// finalized score records the config version that produced it so a past result
// stays reproducible afterwards.
import { json } from './context.js';
import {
  validateConfig, configFor, DEFAULT_CONFIG, explainScore,
  WINNER_METHODS, TIE_BREAKS,
} from '../scoring/weights.js';
import { SCORING_VERSION } from '../scoring/index.js';
import { LIFECYCLE, inferLifecycle } from '../contest/lifecycle.js';
import { displayName } from '../finance/notify.js';

const nowIso = () => new Date().toISOString();
const err = (code, message, status = 400, extra = {}) => json({ error: { code, message, ...extra } }, status);

/** States in which creators are already competing, so the rules are settled. */
const COMPETING = [
  LIFECYCLE.LIVE, LIFECYCLE.SUBMISSION_CLOSED, LIFECYCLE.UNDER_REVIEW,
  LIFECYCLE.WINNER_SELECTION, LIFECYCLE.WINNER_PENDING_VERIFICATION,
  LIFECYCLE.PAYMENT_PENDING, LIFECYCLE.COMPLETED,
];

async function ownedContest(ctx, contestId) {
  const contest = await ctx.svc.entities.Contest.get(contestId).catch(() => null);
  if (!contest) return { error: err('CONTEST_NOT_FOUND', 'Contest not found.', 404) };
  if (contest.created_by_id !== ctx.user.id && ctx.user.role !== 'admin') {
    return { error: err('FORBIDDEN', 'Only the brand that created this campaign can change it.', 403) };
  }
  return { contest };
}

// ── scoringConfigGet ────────────────────────────────────────────────────────
/** The scoring rules in force, plus what may still be changed. */
export async function scoringConfigGet(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { contest_id: contestId } = ctx.body || {};
  if (!contestId) return err('CONTEST_ID_REQUIRED', 'contest_id is required.');

  const contest = await ctx.svc.entities.Contest.get(contestId).catch(() => null);
  if (!contest) return err('CONTEST_NOT_FOUND', 'Contest not found.', 404);
  // Creators are entitled to know how they will be judged before they enter.
  const config = await configFor(ctx.svc, contestId);
  const lifecycle = inferLifecycle(contest);
  const isOwner = contest.created_by_id === ctx.user.id || ctx.user.role === 'admin';

  return json({
    config: {
      engagement_weight: config.engagement_weight,
      traffic_weight: config.traffic_weight,
      winner_method: config.winner_method,
      tie_break: config.tie_break,
      version: config.version,
      source: config.source,
    },
    locked: Boolean(config.locked) || COMPETING.includes(lifecycle),
    // Said plainly so a brand is never surprised by a greyed-out form.
    lock_reason: COMPETING.includes(lifecycle)
      ? 'Creators are already competing under these rules, so scoring can no longer change.'
      : null,
    editable: isOwner && !COMPETING.includes(lifecycle),
    scoring_version: SCORING_VERSION,
    options: {
      winner_methods: Object.values(WINNER_METHODS),
      tie_breaks: Object.values(TIE_BREAKS),
    },
    // A worked example, computed by the real engine, so the brand can see what
    // their weights actually do before committing to them.
    example: explainScore(92, 68, config),
  });
}

// ── scoringConfigSave ───────────────────────────────────────────────────────
export async function scoringConfigSave(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const b = ctx.body || {};
  const contestId = b.contest_id;
  if (!contestId) return err('CONTEST_ID_REQUIRED', 'contest_id is required.');

  const loaded = await ownedContest(ctx, contestId);
  if (loaded.error) return loaded.error;
  const { contest } = loaded;

  const lifecycle = inferLifecycle(contest);
  if (COMPETING.includes(lifecycle)) {
    return err(
      'SCORING_LOCKED',
      'Creators are already competing under the current rules, so scoring can no longer be changed.',
      409,
      { lifecycle_state: lifecycle }
    );
  }

  const { ok, errors, config } = validateConfig(b);
  if (!ok) {
    return err('SCORING_CONFIG_INVALID', errors[0], 422, { errors });
  }

  const existing = await ctx.svc.entities.ScoringConfig
    .filter({ contest_id: contestId }, '-created_date', 1).catch(() => []);
  const version = `c${contestId.slice(0, 8)}-v${(existing.length ? Number(existing[0].version?.split('-v')[1] || 0) : 0) + 1}@${SCORING_VERSION}`;

  const row = existing.length
    ? await ctx.svc.entities.ScoringConfig.update(existing[0].id, { ...config, version, created_by: ctx.user.id })
    : await ctx.svc.entities.ScoringConfig.create({ contest_id: contestId, ...config, version, created_by: ctx.user.id });

  await ctx.svc.entities.Contest.update(contestId, { scoring_config_version: version }).catch(() => null);

  await ctx.svc.entities.AuditLog.create({
    user_id: contest.created_by_id, actor: ctx.user.id, action: 'contest.scoring_configured', status: 'success',
    reason: `Weights set to ${config.engagement_weight}/${config.traffic_weight}`,
    result: JSON.stringify({ contest_id: contestId, version, ...config }),
  }).catch(() => null);

  return json({
    config: { ...config, version },
    example: explainScore(92, 68, { ...config, version }),
    message: 'Scoring saved. It locks when the campaign opens for entries.',
  });
}

// ── submissionDisqualify ────────────────────────────────────────────────────
/**
 * Remove an entry from the running, with a reason.
 *
 * Never a silent delete: the submission stays, its measured scores stay, and a
 * Disqualification record names who did it and why. A disqualified entry is
 * excluded from ranking and cannot win.
 */
export async function submissionDisqualify(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const b = ctx.body || {};
  const { submission_id: submissionId, reason, reason_code: reasonCode } = b;
  if (!submissionId) return err('SUBMISSION_ID_REQUIRED', 'submission_id is required.');
  if (!reason || String(reason).trim().length < 10) {
    return err('REASON_REQUIRED', 'Give a reason (at least 10 characters). The creator is shown this text.');
  }

  const submission = await ctx.svc.entities.Submission.get(submissionId).catch(() => null);
  if (!submission) return err('SUBMISSION_NOT_FOUND', 'Submission not found.', 404);

  const loaded = await ownedContest(ctx, submission.contest_id);
  if (loaded.error) return loaded.error;
  const { contest } = loaded;

  // Once a winner is final, removing an entry would rewrite a settled result.
  if (contest.winner_user_id && contest.winner_submission_id !== submissionId) {
    return err('CONTEST_FINALIZED', 'This contest already has a finalized winner, so entries can no longer be disqualified.', 409);
  }
  if (contest.winner_submission_id === submissionId) {
    return err('WINNER_DISQUALIFICATION', 'The winning entry cannot be disqualified here. Open a dispute so the result and any payment are handled together.', 409);
  }
  if (submission.disqualified) {
    return json({ submission_id: submissionId, already_disqualified: true, reason: submission.disqualification_reason });
  }

  const record = await ctx.svc.entities.Disqualification.create({
    submission_id: submissionId,
    contest_id: submission.contest_id,
    creator_id: submission.created_by_id,
    reason: String(reason).slice(0, 500),
    reason_code: String(reasonCode || 'RULE_VIOLATION').slice(0, 60),
    details: String(b.details || '').slice(0, 1000) || null,
    status: 'ACTIVE',
    actor_id: ctx.user.id,
    actor_role: ctx.user.role === 'admin' ? 'admin' : 'brand',
    applied_at: nowIso(),
    evidence: String(b.evidence || '').slice(0, 1000) || null,
  });

  await ctx.svc.entities.Submission.update(submissionId, {
    disqualified: true,
    disqualification_id: record.id,
    disqualified_at: nowIso(),
    disqualification_reason: String(reason).slice(0, 500),
    score_state: 'disqualified',
  });

  await ctx.svc.entities.Notification.create({
    type: 'submission_update', title: 'Your entry was disqualified',
    description: String(reason).slice(0, 240),
    recipient_user_id: submission.created_by_id, contest_id: submission.contest_id,
    related_submission_id: submissionId,
    related_post_id: `dq:${record.id}`,
  }).catch(() => null);

  await ctx.svc.entities.AuditLog.create({
    user_id: submission.created_by_id, actor: ctx.user.id, action: 'submission.disqualified', status: 'success',
    reason: String(reason).slice(0, 500),
    result: JSON.stringify({
      submission_id: submissionId, contest_id: submission.contest_id,
      disqualification_id: record.id, reason_code: reasonCode || 'RULE_VIOLATION',
    }),
  }).catch(() => null);

  return json({
    disqualification: { id: record.id, reason: record.reason, reason_code: record.reason_code, applied_at: record.applied_at },
    message: 'The entry is disqualified and excluded from ranking. Its record and scores are preserved.',
  });
}

// ── submissionReinstate ─────────────────────────────────────────────────────
/** Undo a disqualification. The original record stays, marked reverted. */
export async function submissionReinstate(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const b = ctx.body || {};
  const { submission_id: submissionId, reason } = b;
  if (!submissionId) return err('SUBMISSION_ID_REQUIRED', 'submission_id is required.');
  if (!reason || String(reason).trim().length < 10) {
    return err('REASON_REQUIRED', 'Explain why this entry is being reinstated (at least 10 characters).');
  }

  const submission = await ctx.svc.entities.Submission.get(submissionId).catch(() => null);
  if (!submission) return err('SUBMISSION_NOT_FOUND', 'Submission not found.', 404);
  if (!submission.disqualified) return err('NOT_DISQUALIFIED', 'That entry is not disqualified.', 409);

  const loaded = await ownedContest(ctx, submission.contest_id);
  if (loaded.error) return loaded.error;
  const { contest } = loaded;
  if (contest.winner_user_id) {
    return err('CONTEST_FINALIZED', 'This contest already has a finalized winner, so entries can no longer be reinstated.', 409);
  }

  if (submission.disqualification_id) {
    await ctx.svc.entities.Disqualification.update(submission.disqualification_id, {
      status: 'REVERTED', reverted_at: nowIso(), reverted_by: ctx.user.id,
      revert_reason: String(reason).slice(0, 500),
    }).catch(() => null);
  }
  await ctx.svc.entities.Submission.update(submissionId, {
    disqualified: false, disqualification_id: null, disqualified_at: null,
    disqualification_reason: null, score_state: null,
  });

  await ctx.svc.entities.Notification.create({
    type: 'submission_update', title: 'Your entry was reinstated',
    description: 'Your entry is back in the running for this campaign.',
    recipient_user_id: submission.created_by_id, contest_id: submission.contest_id,
    related_submission_id: submissionId,
  }).catch(() => null);

  await ctx.svc.entities.AuditLog.create({
    user_id: submission.created_by_id, actor: ctx.user.id, action: 'submission.reinstated', status: 'success',
    reason: String(reason).slice(0, 500),
    result: JSON.stringify({ submission_id: submissionId, contest_id: submission.contest_id }),
  }).catch(() => null);

  return json({ submission_id: submissionId, reinstated: true });
}

// ── disqualificationList ────────────────────────────────────────────────────
export async function disqualificationList(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { contest_id: contestId } = ctx.body || {};
  if (!contestId) return err('CONTEST_ID_REQUIRED', 'contest_id is required.');

  const loaded = await ownedContest(ctx, contestId);
  if (loaded.error) return loaded.error;

  const rows = await ctx.svc.entities.Disqualification
    .filter({ contest_id: contestId }, '-created_date', 100).catch(() => []);
  const out = [];
  for (const r of rows) {
    const creator = await ctx.svc.entities.User.get(r.creator_id).catch(() => null);
    out.push({
      id: r.id, submission_id: r.submission_id,
      creator_name: displayName(creator),
      reason: r.reason, reason_code: r.reason_code, details: r.details || null,
      status: r.status, applied_at: r.applied_at,
      reverted_at: r.reverted_at || null, revert_reason: r.revert_reason || null,
    });
  }
  return json({ disqualifications: out, count: out.length, active: out.filter((d) => d.status === 'ACTIVE').length });
}
