// @ts-nocheck
// Winner verification — the flow that runs AFTER a winner is selected.
//
// RazeKit's hard business rule: a creator never connects a social account to
// enter a contest, to submit, or to be scored. Nothing in this file is reachable
// before `winnerFinalize` has named a winner, and only the named winner can
// reach it at all.
//
//   winner finalized
//     -> WinnerVerification created (PENDING)
//     -> winner picks the platform they published on   (CODE_ISSUED)
//     -> winner places a one-time code publicly, submits the link  (SUBMITTED)
//     -> RazeKit checks the public page                (VERIFIED / FAILED / MANUAL_REVIEW)
//     -> contest reaches PAYMENT_PENDING               (only on VERIFIED)
//
// Payout eligibility is gated on VERIFIED and nothing else. A failed or pending
// verification can never produce a payable state.
import { json } from './context.js';
import { LIFECYCLE, assertTransition, legacyStatus, inferLifecycle } from '../contest/lifecycle.js';
import {
  VERIFICATION_STATUS, VERIFICATION_COPY, isVerified,
  listPlatforms, platformFor, issueChallenge, validateUrl, checkPublicEvidence,
} from '../verification/platforms.js';
import { sendEmail } from '../integrations/email.js';
import { displayName } from '../finance/notify.js';

const nowIso = () => new Date().toISOString();
const err = (code, message, status = 400, extra = {}) => json({ error: { code, message, ...extra } }, status);

/** How long a challenge code stays valid. Long enough to be practical. */
const CHALLENGE_TTL_HOURS = 72;
const MAX_ATTEMPTS = 6;

function publicVerification(v) {
  const copy = VERIFICATION_COPY[v.status] || {};
  return {
    id: v.id,
    contest_id: v.contest_id,
    status: v.status,
    status_label: copy.label || v.status,
    status_detail: copy.detail || '',
    status_tone: copy.tone || 'neutral',
    method: v.method,
    platform: v.platform || null,
    challenge_code: v.challenge_code || null,
    challenge_expires_at: v.challenge_expires_at || null,
    profile_url: v.profile_url || null,
    post_url: v.post_url || null,
    handle: v.handle || null,
    attempts: v.attempts ?? 0,
    attempts_remaining: Math.max(0, MAX_ATTEMPTS - (v.attempts ?? 0)),
    submitted_at: v.submitted_at || null,
    verified_at: v.verified_at || null,
    failed_at: v.failed_at || null,
    // The creator is always told exactly why, so a retry is actionable.
    failure_reason: v.failure_reason || null,
    verification_note: v.verification_note || null,
    completed_at: v.completed_at || null,
    created_date: v.created_date,
  };
}

/**
 * Load the verification for a contest, checking the caller is entitled to see
 * it. The winner sees their own; the contest owner and admins see status only.
 */
async function loadFor(ctx, contestId, { winnerOnly = false } = {}) {
  const contest = await ctx.svc.entities.Contest.get(contestId).catch(() => null);
  if (!contest) return { error: err('CONTEST_NOT_FOUND', 'Contest not found.', 404) };

  // For the ACTING endpoints, answer the specific question first: are you the
  // winner? A bare "Forbidden" leaves a creator guessing whether they lost or
  // hit a bug.
  if (winnerOnly && contest.winner_user_id !== ctx.user.id && ctx.user.role !== 'admin') {
    return {
      error: err(
        'NOT_THE_WINNER',
        contest.winner_user_id
          ? 'Only the selected winner can verify an account for this contest.'
          : 'No winner has been selected for this contest yet.',
        403
      ),
    };
  }

  const rows = await ctx.svc.entities.WinnerVerification
    .filter({ contest_id: contestId }, '-created_date', 5).catch(() => []);
  const verification = rows[0] || null;

  const isWinner = contest.winner_user_id === ctx.user.id;
  const isOwner = contest.created_by_id === ctx.user.id;
  const isAdmin = ctx.user.role === 'admin';
  if (!isWinner && !isOwner && !isAdmin) {
    return { error: err('FORBIDDEN', 'You do not have access to this verification.', 403) };
  }
  return { contest, verification, isWinner, isOwner, isAdmin };
}

// ── ensureVerificationForWinner ─────────────────────────────────────────────
/**
 * Called by winnerFinalize. Creates the verification record and moves the
 * contest into WINNER_PENDING_VERIFICATION.
 *
 * Idempotent: finalizing twice cannot produce two verifications.
 */
export async function ensureVerificationForWinner(svc, { contest, submission, creatorId, payoutId }) {
  const existing = await svc.entities.WinnerVerification
    .filter({ contest_id: contest.id }, '-created_date', 1).catch(() => []);
  if (existing.length) return existing[0];

  const verification = await svc.entities.WinnerVerification.create({
    contest_id: contest.id,
    submission_id: submission?.id || null,
    creator_id: creatorId,
    brand_id: contest.created_by_id,
    payout_id: payoutId || null,
    status: VERIFICATION_STATUS.PENDING,
    method: 'CHALLENGE_CODE',
    requires_payout_account: true,
  });

  const lifecycle = inferLifecycle(contest);
  await svc.entities.Contest.update(contest.id, {
    lifecycle_state: LIFECYCLE.WINNER_PENDING_VERIFICATION,
    status: legacyStatus(LIFECYCLE.WINNER_PENDING_VERIFICATION),
    winner_verification_id: verification.id,
  }).catch(() => null);

  await svc.entities.AuditLog.create({
    user_id: creatorId, actor: 'system', action: 'winner.verification_started', status: 'success',
    reason: 'Winner selected; account verification required before payout',
    result: JSON.stringify({ contest_id: contest.id, verification_id: verification.id, from_lifecycle: lifecycle }),
  }).catch(() => null);

  return verification;
}

// ── winnerVerificationStatus ────────────────────────────────────────────────
/** Where the winner's verification stands. Readable by winner, brand and admin. */
export async function winnerVerificationStatus(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { contest_id: contestId } = ctx.body || {};
  if (!contestId) return err('CONTEST_ID_REQUIRED', 'contest_id is required.');

  const loaded = await loadFor(ctx, contestId);
  if (loaded.error) return loaded.error;
  const { contest, verification, isWinner } = loaded;

  if (!verification) {
    return json({
      verification: null,
      is_winner: isWinner,
      lifecycle_state: inferLifecycle(contest),
      message: contest.winner_user_id
        ? 'Verification has not been created for this contest yet.'
        : 'No winner has been selected for this contest yet.',
    });
  }

  return json({
    verification: publicVerification(verification),
    is_winner: isWinner,
    lifecycle_state: inferLifecycle(contest),
    // The brand and admins see the state, never the winner's challenge code.
    ...(isWinner ? {} : { verification: { ...publicVerification(verification), challenge_code: null } }),
    platforms: isWinner ? listPlatforms() : undefined,
    contest: { id: contest.id, title: contest.title, prize_amount: contest.prize_amount, currency: contest.currency || 'INR' },
  });
}

// ── winnerVerificationStart ─────────────────────────────────────────────────
/**
 * The winner chooses the platform they published on and receives a one-time
 * code. Only the winner can call this — a non-winner gets 403.
 */
export async function winnerVerificationStart(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { contest_id: contestId, platform: platformKey, handle } = ctx.body || {};
  if (!contestId) return err('CONTEST_ID_REQUIRED', 'contest_id is required.');

  const loaded = await loadFor(ctx, contestId, { winnerOnly: true });
  if (loaded.error) return loaded.error;
  const { contest, verification } = loaded;
  if (!verification) return err('VERIFICATION_NOT_FOUND', 'Verification has not been created for this contest yet.', 404);
  if (isVerified(verification.status)) {
    return json({ verification: publicVerification(verification), already_verified: true });
  }

  const platform = platformFor(platformKey);
  if (!platform) {
    return err('PLATFORM_REQUIRED', 'Choose the platform you published your entry on.', 400, { platforms: listPlatforms() });
  }

  const code = verification.challenge_code && verification.platform === platform.key
    // Re-issuing for the same platform keeps the code the creator may already
    // have placed, rather than invalidating their work.
    ? verification.challenge_code
    : issueChallenge();

  const updated = await ctx.svc.entities.WinnerVerification.update(verification.id, {
    status: VERIFICATION_STATUS.CODE_ISSUED,
    platform: platform.key,
    handle: String(handle || '').trim().slice(0, 80) || verification.handle || null,
    challenge_code: code,
    challenge_issued_at: nowIso(),
    challenge_expires_at: new Date(Date.now() + CHALLENGE_TTL_HOURS * 3600_000).toISOString(),
    failure_reason: null,
  });

  await ctx.svc.entities.AuditLog.create({
    user_id: ctx.user.id, actor: ctx.user.id, action: 'winner.verification_code_issued', status: 'success',
    reason: `Challenge issued for ${platform.label}`,
    result: JSON.stringify({ contest_id: contestId, verification_id: verification.id, platform: platform.key }),
  }).catch(() => null);

  return json({
    verification: publicVerification(updated),
    platform: {
      key: platform.key, label: platform.label,
      automatic: platform.autoCheck,
      // Said plainly up front rather than discovered after a wait.
      api_integration: platform.apiIntegration,
      placement: platform.placement,
      url_hint: platform.urlHint,
    },
    instructions: [
      `Add this code where it is publicly visible on your ${platform.label} account: ${code}`,
      platform.placement,
      'Save it, then come back and paste the public link below.',
      platform.autoCheck
        ? 'We will check the page for your code straight away.'
        : `RazeKit cannot read ${platform.label} pages automatically, so a person will check it. You do not need to do anything else after submitting.`,
      'You can remove the code once you are verified.',
    ],
    expires_in_hours: CHALLENGE_TTL_HOURS,
  });
}

// ── winnerVerificationSubmit ────────────────────────────────────────────────
/**
 * The winner says the code is live and gives us a public link.
 *
 * RazeKit checks the page where it genuinely can. Where it cannot, the record
 * goes to MANUAL_REVIEW — never to VERIFIED on the creator's word alone.
 */
export async function winnerVerificationSubmit(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const b = ctx.body || {};
  const contestId = b.contest_id;
  if (!contestId) return err('CONTEST_ID_REQUIRED', 'contest_id is required.');

  const loaded = await loadFor(ctx, contestId, { winnerOnly: true });
  if (loaded.error) return loaded.error;
  const { contest, verification } = loaded;
  if (!verification) return err('VERIFICATION_NOT_FOUND', 'Verification has not been created yet.', 404);
  if (isVerified(verification.status)) {
    return json({ verification: publicVerification(verification), already_verified: true });
  }
  if (!verification.challenge_code || !verification.platform) {
    return err('NOT_STARTED', 'Choose your platform first to get a verification code.', 409);
  }
  if (verification.challenge_expires_at && Date.parse(verification.challenge_expires_at) < Date.now()) {
    await ctx.svc.entities.WinnerVerification.update(verification.id, { status: VERIFICATION_STATUS.EXPIRED });
    return err('CHALLENGE_EXPIRED', 'That verification code expired. Start again to get a new one.', 409);
  }
  if ((verification.attempts ?? 0) >= MAX_ATTEMPTS) {
    // Stop an endless retry loop, but hand the creator to a person rather than
    // dead-ending them.
    await ctx.svc.entities.WinnerVerification.update(verification.id, {
      status: VERIFICATION_STATUS.MANUAL_REVIEW,
      manual_review_requested_at: nowIso(),
      verification_note: 'Automatic checks exhausted; escalated for manual review.',
    });
    return err('TOO_MANY_ATTEMPTS', 'We could not verify automatically after several tries, so a person will review it. You do not need to do anything else.', 409);
  }

  const check = validateUrl(verification.platform, b.url);
  if (!check.ok) return err('URL_INVALID', check.message);

  const attempts = (verification.attempts ?? 0) + 1;
  await ctx.svc.entities.WinnerVerification.update(verification.id, {
    status: VERIFICATION_STATUS.SUBMITTED,
    post_url: check.url,
    profile_url: String(b.profile_url || '').trim().slice(0, 500) || verification.profile_url || null,
    handle: String(b.handle || '').trim().slice(0, 80) || verification.handle || null,
    submitted_at: nowIso(),
    attempts,
    last_attempt_at: nowIso(),
  });

  const result = await checkPublicEvidence(verification.platform, check.url, verification.challenge_code);

  const patch = { attempts, last_attempt_at: nowIso() };
  if (result.outcome === 'VERIFIED') {
    patch.status = VERIFICATION_STATUS.VERIFIED;
    patch.verified_at = nowIso();
    patch.verified_by = 'system';
    patch.verification_note = result.reason;
    patch.verification_evidence = String(result.evidence || '').slice(0, 500);
    patch.failure_reason = null;
  } else if (result.outcome === 'FAILED') {
    patch.status = VERIFICATION_STATUS.FAILED;
    patch.failed_at = nowIso();
    patch.failure_reason = result.reason;
  } else {
    patch.status = VERIFICATION_STATUS.MANUAL_REVIEW;
    patch.manual_review_requested_at = nowIso();
    patch.verification_note = result.reason;
  }

  const updated = await ctx.svc.entities.WinnerVerification.update(verification.id, patch);

  if (patch.status === VERIFICATION_STATUS.VERIFIED) {
    await completeVerification(ctx.svc, { contest, verification: updated, actorId: 'system' });
  }

  await ctx.svc.entities.AuditLog.create({
    user_id: ctx.user.id, actor: ctx.user.id, action: 'winner.verification_submitted', status: 'success',
    reason: result.reason,
    result: JSON.stringify({
      contest_id: contestId, verification_id: verification.id,
      platform: verification.platform, outcome: result.outcome, attempt: attempts,
    }),
  }).catch(() => null);

  return json({
    verification: publicVerification(updated),
    outcome: result.outcome,
    message: result.reason,
  });
}

// ── completeVerification ────────────────────────────────────────────────────
/**
 * Verification succeeded: record the social account, move the contest to
 * PAYMENT_PENDING, and tell everyone who needs to know.
 *
 * The SocialAccount stores only public information — platform, handle, public
 * URL. No token, no password, no email.
 */
async function completeVerification(svc, { contest, verification, actorId }) {
  const existing = await svc.entities.SocialAccount
    .filter({ user_id: verification.creator_id, platform: verification.platform }, '-created_date', 1)
    .catch(() => []);

  const accountPatch = {
    user_id: verification.creator_id,
    platform: verification.platform,
    handle: verification.handle || verification.post_url || verification.platform,
    profile_url: verification.profile_url || verification.post_url || null,
    status: 'CONNECTED',
    verified: true,
    verified_at: nowIso(),
    verified_by: actorId,
    verification_id: verification.id,
    connected_at: existing[0]?.connected_at || nowIso(),
    last_checked_at: nowIso(),
  };
  if (existing.length) await svc.entities.SocialAccount.update(existing[0].id, accountPatch).catch(() => null);
  else await svc.entities.SocialAccount.create(accountPatch).catch(() => null);

  await svc.entities.WinnerVerification.update(verification.id, { completed_at: nowIso() }).catch(() => null);

  // Only now may the contest move toward payment.
  const from = inferLifecycle(contest);
  let next = from;
  try { next = assertTransition(from, LIFECYCLE.PAYMENT_PENDING); } catch { /* already past it */ }
  await svc.entities.Contest.update(contest.id, {
    lifecycle_state: next,
    status: legacyStatus(next),
    winner_verified_at: nowIso(),
  }).catch(() => null);

  const [creator, brand] = await Promise.all([
    svc.entities.User.get(verification.creator_id).catch(() => null),
    svc.entities.User.get(contest.created_by_id).catch(() => null),
  ]);

  await svc.entities.Notification.create({
    type: 'contest_won', title: 'Account verified',
    description: `Your account is verified for "${contest.title}". Your payout is being arranged.`,
    recipient_user_id: verification.creator_id, contest_id: contest.id,
    related_post_id: `winner:verified:${verification.id}`,
  }).catch(() => null);

  await svc.entities.Notification.create({
    type: 'contest_won', title: 'Winner verified',
    description: `${displayName(creator)} verified their account for "${contest.title}".`,
    recipient_user_id: contest.created_by_id, contest_id: contest.id,
    related_post_id: `brand:winner_verified:${verification.id}`,
  }).catch(() => null);

  if (creator?.email) {
    sendEmail({
      to: creator.email,
      subject: `RazeKit — your account is verified for "${contest.title}"`,
      body: [
        `Hi ${displayName(creator)},`,
        '',
        'We confirmed you control the account you published from. Your prize payout is now being arranged.',
        '',
        `Campaign: ${contest.title}`,
        'You can remove the verification code from your post or bio now.',
      ].join('\n'),
    }).catch(() => null);
  }

  await svc.entities.AuditLog.create({
    user_id: verification.creator_id, actor: actorId, action: 'winner.verification_completed', status: 'success',
    reason: 'Account ownership verified; payout unlocked',
    result: JSON.stringify({
      contest_id: contest.id, verification_id: verification.id,
      platform: verification.platform, lifecycle: next,
    }),
  }).catch(() => null);
}

// ── winnerVerificationReview (admin) ────────────────────────────────────────
/**
 * A person decides a verification that could not be checked automatically.
 *
 * This is the honest half of the design: where RazeKit cannot read a platform,
 * a human looks at the evidence and records a decision with a reason.
 */
export async function winnerVerificationReview(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  if (ctx.user.role !== 'admin') return err('FORBIDDEN', 'Admin access is required.', 403);

  const b = ctx.body || {};
  const { verification_id: id, decision, reason } = b;
  if (!id || !decision) return err('DECISION_REQUIRED', 'verification_id and decision are required.');
  if (!['verify', 'fail'].includes(decision)) return err('UNKNOWN_DECISION', "decision must be 'verify' or 'fail'.");
  if (String(reason || '').trim().length < 10) {
    return err('REASON_REQUIRED', 'Give a reason (at least 10 characters). The creator is shown this text.');
  }

  const verification = await ctx.svc.entities.WinnerVerification.get(id).catch(() => null);
  if (!verification) return err('VERIFICATION_NOT_FOUND', 'Verification not found.', 404);
  if (isVerified(verification.status)) {
    return json({ verification: publicVerification(verification), already_verified: true });
  }

  const contest = await ctx.svc.entities.Contest.get(verification.contest_id).catch(() => null);
  if (!contest) return err('CONTEST_NOT_FOUND', 'Contest not found.', 404);

  if (decision === 'verify') {
    const updated = await ctx.svc.entities.WinnerVerification.update(id, {
      status: VERIFICATION_STATUS.VERIFIED,
      verified_at: nowIso(),
      verified_by: ctx.user.id,
      verification_note: String(reason).slice(0, 500),
      failure_reason: null,
    });
    await completeVerification(ctx.svc, { contest, verification: updated, actorId: ctx.user.id });
    return json({ verification: publicVerification(updated), decision: 'verified' });
  }

  const updated = await ctx.svc.entities.WinnerVerification.update(id, {
    status: VERIFICATION_STATUS.FAILED,
    failed_at: nowIso(),
    failure_reason: String(reason).slice(0, 500),
  });

  await ctx.svc.entities.Notification.create({
    type: 'contest_won', title: 'Verification could not be completed',
    description: String(reason).slice(0, 240),
    recipient_user_id: verification.creator_id, contest_id: contest.id,
    related_post_id: `winner:verification_failed:${id}`,
  }).catch(() => null);

  await ctx.svc.entities.AuditLog.create({
    user_id: verification.creator_id, actor: ctx.user.id, action: 'winner.verification_failed', status: 'success',
    reason, result: JSON.stringify({ contest_id: contest.id, verification_id: id, decided_by: 'admin' }),
  }).catch(() => null);

  return json({ verification: publicVerification(updated), decision: 'failed' });
}

// ── winnerVerificationQueue (admin) ─────────────────────────────────────────
export async function winnerVerificationQueue(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  if (ctx.user.role !== 'admin') return err('FORBIDDEN', 'Admin access is required.', 403);

  const rows = await ctx.svc.entities.WinnerVerification.filter({}, '-created_date', 200).catch(() => []);
  const status = ctx.body?.status;
  const filtered = status
    ? rows.filter((r) => r.status === status)
    : rows.filter((r) => [VERIFICATION_STATUS.MANUAL_REVIEW, VERIFICATION_STATUS.SUBMITTED, VERIFICATION_STATUS.NOT_SUPPORTED].includes(r.status));

  const out = [];
  for (const v of filtered.slice(0, 100)) {
    const [creator, contest] = await Promise.all([
      ctx.svc.entities.User.get(v.creator_id).catch(() => null),
      ctx.svc.entities.Contest.get(v.contest_id).catch(() => null),
    ]);
    out.push({
      ...publicVerification(v),
      creator_name: displayName(creator),
      creator_email: creator?.email || null,
      contest_title: contest?.title || null,
      prize_amount: contest?.prize_amount ?? null,
      // The reviewer needs the code to look for it on the page.
      challenge_code: v.challenge_code || null,
      waiting_hours: v.submitted_at ? Math.round((Date.now() - Date.parse(v.submitted_at)) / 36e5) : null,
    });
  }
  return json({ queue: out, count: out.length, statuses: Object.values(VERIFICATION_STATUS) });
}

export { publicVerification, isVerified };
