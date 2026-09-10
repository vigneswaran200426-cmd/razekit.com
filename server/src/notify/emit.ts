// @ts-nocheck
// The single notification path.
//
// RazeKit had notifications, but they were created ad hoc: each handler wrote
// its own Notification row with its own wording, its own idea of a type, and no
// shared notion of category, severity or deduplication. That produces a feed
// nobody can filter and duplicate alerts on every retry.
//
// Everything now goes through emit(). One shape, one dedupe rule, one place
// where a category and a severity are decided.
//
//   backend event -> emit() -> persisted Notification -> feed + contextual toast
//
// Persistence first, delivery second: a refresh must never lose an important
// notification, so the record is written before anything is shown.
import { sendEmail } from '../integrations/email.js';

export const CATEGORY = {
  CONTEST: 'contest',
  SUBMISSION: 'submission',
  WINNER: 'winner',
  PAYMENT: 'payment',
  PAYOUT: 'payout',
  SUPPORT: 'support',
  SECURITY: 'security',
  SYSTEM: 'system',
};

export const SEVERITY = {
  /** Ordinary. Shows for ~3s and is removed. */
  INFO: 'info',
  /** Worth noticing. Shows for ~3s but stays prominent in the centre. */
  IMPORTANT: 'important',
  /**
   * Something is wrong and STAYS wrong until acted on — a failed payout, a
   * security event, a rejected payment. These do not disappear after three
   * seconds; hiding an active problem because a timer elapsed is how a user
   * misses the one message that mattered.
   */
  CRITICAL: 'critical',
};

/** Severities that must persist on screen while the issue is live. */
export const PERSISTENT = [SEVERITY.CRITICAL];

/**
 * Emit one notification.
 *
 * `dedupeKey` is the important argument: the same real-world event emitted
 * twice (a retry, a replayed job, a double click) produces one row, not two.
 * Callers build it from the entity and the transition, never from a timestamp.
 */
export async function emit(svc, {
  recipientId,
  category = CATEGORY.SYSTEM,
  severity = SEVERITY.INFO,
  title,
  body = '',
  contestId = null,
  submissionId = null,
  actorName = null,
  actionUrl = null,
  dedupeKey = null,
  email = null,
}) {
  if (!recipientId || !title) return null;

  if (dedupeKey) {
    const existing = await svc.entities.Notification
      .filter({ recipient_user_id: recipientId, related_post_id: dedupeKey }, '-created_date', 1)
      .catch(() => []);
    if (existing.length) return existing[0];
  }

  const row = await svc.entities.Notification.create({
    // `type` is kept for the surfaces that already read it; category and
    // severity are the new, filterable dimensions.
    type: category === CATEGORY.WINNER ? 'contest_won'
      : category === CATEGORY.PAYMENT || category === CATEGORY.PAYOUT ? 'payment_received'
      : category === CATEGORY.SUBMISSION ? 'submission_update'
      : 'system',
    category,
    severity,
    title: String(title).slice(0, 160),
    description: String(body).slice(0, 600),
    recipient_user_id: recipientId,
    contest_id: contestId,
    related_submission_id: submissionId,
    actor_name: actorName,
    action_url: actionUrl,
    related_post_id: dedupeKey,
    read: false,
  }).catch(() => null);

  // Email is best-effort and always secondary. A delivery failure must never
  // roll back the fact that the event happened.
  if (row && email?.to) {
    sendEmail({
      to: email.to,
      subject: email.subject || title,
      body: email.body || body,
    }).catch(() => null);
  }

  return row;
}

/** Emit the same notification to several people, deduped per recipient. */
export async function emitMany(svc, recipients, payload) {
  const out = [];
  for (const r of recipients) {
    const recipientId = typeof r === 'string' ? r : r?.id;
    if (!recipientId) continue;
    out.push(await emit(svc, {
      ...payload,
      recipientId,
      email: typeof r === 'object' && r?.email && payload.email ? { ...payload.email, to: r.email } : null,
    }));
  }
  return out.filter(Boolean);
}

/**
 * The catalogue of real domain events.
 *
 * Wording lives here rather than at each call site so a creator is told the
 * same thing in the same voice wherever the event surfaces — and so no handler
 * can invent a message that claims something the backend has not confirmed.
 *
 * Every template takes real names. "Brand" and "Creator" are placeholders, not
 * names, and never reach a user when an identity is known.
 */
export const EVENTS = {
  contest_published: ({ brandName, contestTitle, contestId }) => ({
    category: CATEGORY.CONTEST, severity: SEVERITY.INFO,
    title: `${brandName} published a campaign`,
    body: `"${contestTitle}" is open for entries.`,
    contestId, actionUrl: `/contest/${contestId}`,
  }),
  contest_joined: ({ contestTitle, contestId }) => ({
    category: CATEGORY.CONTEST, severity: SEVERITY.INFO,
    title: `You joined ${contestTitle}`,
    body: 'Your entry is in progress. Submit before the deadline to compete.',
    contestId, actionUrl: `/contest/${contestId}`,
  }),
  contest_closing: ({ contestTitle, contestId, hours }) => ({
    category: CATEGORY.CONTEST, severity: SEVERITY.IMPORTANT,
    title: `${contestTitle} closes soon`,
    body: `Entries close in about ${hours} hours.`,
    contestId, actionUrl: `/contest/${contestId}`,
  }),
  submission_received: ({ contestTitle, contestId, submissionId }) => ({
    category: CATEGORY.SUBMISSION, severity: SEVERITY.INFO,
    title: 'Your submission was received',
    body: `We have your entry for "${contestTitle}". It is being checked against the campaign requirements.`,
    contestId, submissionId, actionUrl: `/contest/${contestId}`,
  }),
  submission_to_brand: ({ creatorName, contestTitle, contestId, submissionId }) => ({
    category: CATEGORY.SUBMISSION, severity: SEVERITY.INFO,
    title: `${creatorName} submitted to ${contestTitle}`,
    body: 'Open the campaign to review the entry.',
    contestId, submissionId, actorName: creatorName, actionUrl: `/contest/${contestId}/review`,
  }),
  submission_eligible: ({ contestTitle, contestId, submissionId }) => ({
    category: CATEGORY.SUBMISSION, severity: SEVERITY.INFO,
    title: 'Your submission met the requirements',
    body: `Your entry for "${contestTitle}" is eligible for winner selection.`,
    contestId, submissionId, actionUrl: `/contest/${contestId}`,
  }),
  submission_ineligible: ({ contestTitle, contestId, submissionId, reason }) => ({
    category: CATEGORY.SUBMISSION, severity: SEVERITY.CRITICAL,
    title: 'Your submission did not meet a requirement',
    body: reason || `Your entry for "${contestTitle}" did not meet a mandatory requirement.`,
    contestId, submissionId, actionUrl: `/contest/${contestId}`,
  }),
  submission_disqualified: ({ contestTitle, contestId, submissionId, reason }) => ({
    category: CATEGORY.SUBMISSION, severity: SEVERITY.CRITICAL,
    title: 'Your entry was disqualified',
    body: reason, contestId, submissionId, actionUrl: `/contest/${contestId}`,
  }),
  funding_reported: ({ contestTitle, contestId, reference }) => ({
    category: CATEGORY.PAYMENT, severity: SEVERITY.IMPORTANT,
    title: 'Your contest funding is awaiting verification',
    body: `We have your transfer details for "${contestTitle}" (${reference}). A person will check them against our bank records — nothing is confirmed automatically.`,
    contestId, actionUrl: `/contest/${contestId}/fund`,
  }),
  funding_verified: ({ contestTitle, contestId }) => ({
    category: CATEGORY.PAYMENT, severity: SEVERITY.IMPORTANT,
    title: 'Your contest funding has been verified',
    body: `We matched your transfer. "${contestTitle}" is live.`,
    contestId, actionUrl: `/contest/${contestId}`,
  }),
  funding_rejected: ({ contestTitle, contestId, reason }) => ({
    category: CATEGORY.PAYMENT, severity: SEVERITY.CRITICAL,
    title: 'We could not verify your transfer',
    body: reason, contestId, actionUrl: `/contest/${contestId}/fund`,
  }),
  admin_funding_pending: ({ clientName, amount, reference }) => ({
    category: CATEGORY.PAYMENT, severity: SEVERITY.IMPORTANT,
    title: `New funding verification request from ${clientName}`,
    body: `${amount} reported. Reference ${reference}. Check it against the bank statement before verifying.`,
    actorName: clientName, actionUrl: '/admin',
  }),
  admin_withdrawal_requested: ({ creatorName, amount, reference }) => ({
    category: CATEGORY.PAYOUT, severity: SEVERITY.IMPORTANT,
    title: `New withdrawal request from ${creatorName}`,
    body: `${amount} requested. Reference ${reference}. Review the request and bank details before approving.`,
    actorName: creatorName, actionUrl: '/admin',
  }),
  withdrawal_requested: ({ amount }) => ({
    category: CATEGORY.PAYOUT, severity: SEVERITY.INFO,
    title: 'Your payout request was received',
    body: `We have your request for ${amount}. The amount is held on your RazeKit balance while the finance team reviews it.`,
    actionUrl: '/balance',
  }),
  withdrawal_paid: ({ amount, reference }) => ({
    category: CATEGORY.PAYOUT, severity: SEVERITY.IMPORTANT,
    title: 'Your payout has been processed',
    body: `We transferred ${amount} to your bank account. Reference ${reference}.`,
    actionUrl: '/balance',
  }),
  withdrawal_failed: ({ amount, reason }) => ({
    category: CATEGORY.PAYOUT, severity: SEVERITY.CRITICAL,
    title: 'Your payout could not be completed',
    body: `The transfer of ${amount} did not go through. Your balance was not reduced. ${reason || ''}`.trim(),
    actionUrl: '/balance',
  }),
  winner_selected: ({ contestTitle, contestId }) => ({
    category: CATEGORY.WINNER, severity: SEVERITY.CRITICAL,
    title: `You've been selected as the winner of ${contestTitle}`,
    body: 'Verify the account you published from to release your prize.',
    contestId, actionUrl: `/contest/${contestId}/verify`,
  }),
  winner_verification_required: ({ contestTitle, contestId }) => ({
    category: CATEGORY.WINNER, severity: SEVERITY.CRITICAL,
    title: 'Verification required to release your prize',
    body: `Confirm you control the account you published "${contestTitle}" from.`,
    contestId, actionUrl: `/contest/${contestId}/verify`,
  }),
  winner_verified: ({ contestTitle, contestId }) => ({
    category: CATEGORY.WINNER, severity: SEVERITY.IMPORTANT,
    title: 'Account verified',
    body: `Your account is verified for "${contestTitle}". Your payout is being arranged.`,
    contestId, actionUrl: '/balance',
  }),
  not_selected: ({ contestTitle, contestId }) => ({
    category: CATEGORY.CONTEST, severity: SEVERITY.INFO,
    title: `${contestTitle} has a winner`,
    body: 'Your entry was not selected this time. Your performance still counts toward your track record.',
    contestId, actionUrl: `/contest/${contestId}`,
  }),
  security_alert: ({ title, body }) => ({
    category: CATEGORY.SECURITY, severity: SEVERITY.CRITICAL,
    title, body, actionUrl: '/settings',
  }),
};

/** Emit a catalogued event. The only way handlers should create notifications. */
export async function emitEvent(svc, eventName, { recipientId, email, dedupeKey, ...params }) {
  const template = EVENTS[eventName];
  if (!template) return null;
  const payload = template(params);
  return emit(svc, { ...payload, recipientId, email, dedupeKey: dedupeKey || null });
}
