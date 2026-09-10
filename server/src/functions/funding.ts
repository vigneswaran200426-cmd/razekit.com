// @ts-nocheck
// Client-facing manual funding (beta).
//
// The whole flow rests on one honest statement: RazeKit cannot tell whether a
// client actually sent money. A bank transfer happens outside this system, so
// everything the client tells us is a CLAIM until a person opens the bank
// statement and matches it.
//
// Therefore nothing in this file marks a contest funded. `fundingReportTransfer`
// records the claim, puts it in the finance queue and stops. Only
// functions/finance.ts, behind finance.verify_funding, turns a claim into money
// — and even that posts through ledger/events.ts rather than touching a balance.
import { json } from './context.js';
import { toMinor, toMajor, makeRef } from '../money/core.js';
import { computeQuote, activeRule } from '../money/fees.js';
import { marketForContest, contestCurrency } from '../money/markets.js';
import { FUNDING, FUNDING_COPY, FUNDING_AWAITING_MONEY, assertFundingTransition } from '../payments/states.js';
import { betaNotice, paymentMode, acceptsNewFunding, PAYMENT_MODE } from '../payments/config.js';
import { activeSettings, activeQrVersion, instructionsFor, maskedSettings, enabledMethods } from '../payments/settings.js';
import { manualBetaReady } from '../payments/manualBeta.js';
import { createSignedUrl } from '../integrations/storage.js';
import { sendEmail } from '../integrations/email.js';
import { notifyAdminsFundingReported, displayName } from '../finance/notify.js';

const nowIso = () => new Date().toISOString();
const err = (code, message, status = 400, extra = {}) => json({ error: { code, message, ...extra } }, status);

/**
 * What the client owes. Prize + platform fee + tax.
 *
 * There is deliberately no processing fee in the beta: nobody is processing a
 * payment, so charging for one would be a lie. When a gateway is connected the
 * PROCESSING_FEE rule already exists and simply starts applying.
 */
export async function computeFundingAmounts(svc, contest) {
  const market = marketForContest(contest);
  const currency = contestCurrency(contest);
  const prizeMinor = toMinor(contest.prize_amount || 0, currency);

  const rules = await svc.entities.MoneyRule.filter({ active: true }, '-created_date', 100).catch(() => []);
  const platformRule = activeRule(rules, 'PLATFORM_FEE', market.key, currency);
  const taxRule = activeRule(rules, 'TAX', market.key, currency);

  const quote = computeQuote({
    subtotalMinor: prizeMinor,
    currency,
    platformRule,
    processingRule: null, // beta: no payment processor exists
    taxRule,
    discountMinor: 0,
  });

  return {
    currency,
    market: market.key,
    prize_amount_minor: quote.subtotalMinor,
    platform_fee_minor: quote.platformFeeMinor,
    tax_minor: quote.taxMinor,
    total_amount_minor: quote.totalMinor,
    fee_rule_version: quote.feeRuleVersion,
    fee_percentage_bps: quote.feePercentageBps,
  };
}

function publicFunding(f) {
  const copy = FUNDING_COPY[f.status] || {};
  return {
    id: f.id,
    reference: f.reference,
    contest_id: f.contest_id,
    status: f.status,
    status_label: copy.label || f.status,
    status_detail: copy.detail || '',
    status_tone: copy.tone || 'neutral',
    payment_mode: f.payment_mode,
    currency: f.currency,
    prize_amount_minor: f.prize_amount_minor,
    platform_fee_minor: f.platform_fee_minor,
    tax_minor: f.tax_minor,
    total_amount_minor: f.total_amount_minor,
    receipts_total_minor: f.receipts_total_minor ?? 0,
    shortfall_minor: f.shortfall_minor ?? null,
    overpaid_minor: f.overpaid_minor ?? null,
    instructions_shown_at: f.instructions_shown_at || null,
    reported_at: f.reported_at || null,
    reported_amount_minor: f.reported_amount_minor ?? null,
    reported_reference: f.reported_reference || null,
    reported_method: f.reported_method || null,
    reported_transfer_date: f.reported_transfer_date || null,
    verified_at: f.verified_at || null,
    rejected_at: f.rejected_at || null,
    // The client is always told WHY something was refused or paused.
    rejection_reason: f.rejection_reason || null,
    needs_information_reason: f.needs_information_reason || null,
    refunded_at: f.refunded_at || null,
    refund_amount_minor: f.refund_amount_minor ?? null,
    settings_version: f.settings_version ?? null,
    created_date: f.created_date,
  };
}

async function loadOwnedContest(ctx, contestId) {
  const contest = await ctx.svc.entities.Contest.get(contestId).catch(() => null);
  if (!contest) return { error: err('CONTEST_NOT_FOUND', 'Contest not found.', 404) };
  const isAdmin = ctx.user.role === 'admin';
  if (contest.created_by_id !== ctx.user.id && !isAdmin) {
    return { error: err('FORBIDDEN', 'Only the client that created this contest can fund it.', 403) };
  }
  return { contest, isAdmin };
}

/** The newest funding request for a contest that is not cancelled/refunded. */
async function activeFundingFor(svc, contestId) {
  const rows = await svc.entities.ContestFunding.filter({ contest_id: contestId }, '-created_date', 20).catch(() => []);
  return rows.find((r) => ![FUNDING.CANCELLED, FUNDING.REFUNDED].includes(r.status)) || null;
}

// ── fundingQuote ────────────────────────────────────────────────────────────
/** What this contest will cost to fund. Contains no payment details. */
export async function fundingQuote(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { contest_id: contestId } = ctx.body || {};
  if (!contestId) return err('CONTEST_ID_REQUIRED', 'contest_id is required.');
  const loaded = await loadOwnedContest(ctx, contestId);
  if (loaded.error) return loaded.error;

  const amounts = await computeFundingAmounts(ctx.svc, loaded.contest);
  return json({
    ...amounts,
    payment_mode: paymentMode(),
    beta_notice: betaNotice(),
    breakdown: [
      { label: 'Contest prize', amount_minor: amounts.prize_amount_minor, note: 'Paid to the winning creator after the contest is finalised.' },
      { label: 'RazeKit platform fee', amount_minor: amounts.platform_fee_minor, note: `${(amounts.fee_percentage_bps / 100).toFixed(2)}% of the prize.` },
      { label: 'Tax on platform charges', amount_minor: amounts.tax_minor, note: 'Applied to RazeKit charges, not to the prize.' },
    ].filter((l) => l.amount_minor > 0),
  });
}

// ── fundingInstructions ─────────────────────────────────────────────────────
/**
 * The ONLY endpoint that returns the full payment details.
 *
 * Guarded three ways before the configuration is read: an authenticated user,
 * who owns this contest, with a funding request that is actually awaiting money.
 * Only methods the admin has enabled AND configured are returned, so a disabled
 * method cannot leak its details through this path either.
 */
export async function fundingInstructions(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { contest_id: contestId } = ctx.body || {};
  if (!contestId) return err('CONTEST_ID_REQUIRED', 'contest_id is required.');

  if (!acceptsNewFunding()) {
    return err('FUNDING_PAUSED', 'Contest funding is paused for maintenance. Existing contests are unaffected.', 503, { payment_mode: paymentMode() });
  }

  const loaded = await loadOwnedContest(ctx, contestId);
  if (loaded.error) return loaded.error;
  const { contest } = loaded;

  if (!contest.criteria_version_id) {
    return err('CRITERIA_NOT_CONFIRMED', 'Confirm the contest requirements before funding the prize.', 409);
  }

  const settings = await activeSettings(ctx.svc);
  const qr = await activeQrVersion(ctx.svc);
  const methods = enabledMethods(settings, qr);
  if (!Object.values(methods).some(Boolean)) {
    // Better an honest error than a transfer form with nothing on it.
    return err('PAYMENT_NOT_CONFIGURED', 'Manual funding is not configured yet. Please contact RazeKit support.', 503, {
      support: { phone: settings.support_phone, email: settings.support_email },
    });
  }

  const amounts = await computeFundingAmounts(ctx.svc, contest);
  let funding = await activeFundingFor(ctx.svc, contestId);

  if (funding && !FUNDING_AWAITING_MONEY.includes(funding.status)) {
    // Already reported or verified — don't hand out the details again.
    return json({
      funding: publicFunding(funding),
      instructions: null,
      already_in_progress: true,
      beta_notice: betaNotice(),
      masked_destination: maskedSettings(settings, qr),
    });
  }

  if (!funding) {
    try {
      funding = await ctx.svc.entities.ContestFunding.create({
      reference: makeRef('RK-FND'),
      contest_id: contestId,
      brand_id: contest.created_by_id,
      currency: amounts.currency,
      payment_mode: paymentMode(),
      prize_amount_minor: amounts.prize_amount_minor,
      platform_fee_minor: amounts.platform_fee_minor,
      tax_minor: amounts.tax_minor,
      total_amount_minor: amounts.total_amount_minor,
      fee_rule_version: amounts.fee_rule_version,
      fee_percentage_bps: amounts.fee_percentage_bps,
      status: FUNDING.FUNDING_REQUIRED,
      receipts_total_minor: 0,
      });
    } catch (e) {
      // A partial unique index allows only one live funding request per
      // contest. Two rapid clicks land here; re-read rather than creating a
      // second request the client could accidentally pay twice.
      funding = await activeFundingFor(ctx.svc, contestId);
      if (!funding) {
        return err('FUNDING_CREATE_FAILED', 'The funding request could not be created. Refresh and try again.', 500);
      }
    }
  }

  const next = assertFundingTransition(funding.status, FUNDING.PAYMENT_INSTRUCTIONS_SHOWN);
  funding = await ctx.svc.entities.ContestFunding.update(funding.id, {
    status: next,
    instructions_shown_at: funding.instructions_shown_at || nowIso(),
    // Stamped so this request stays explainable after the admin changes the
    // account or replaces the QR.
    settings_version: settings.version,
    qr_version: qr?.version || null,
  });

  await ctx.svc.entities.Contest.update(contestId, {
    funding_status: next,
    funding_id: funding.id,
    payment_mode: paymentMode(),
  }).catch(() => null);

  // Audit that the payment details were disclosed, and to whom.
  await ctx.svc.entities.AuditLog.create({
    user_id: contest.created_by_id,
    actor: ctx.user.id,
    action: 'FUNDING_INSTRUCTIONS_VIEWED',
    status: 'success',
    reason: 'Client viewed manual transfer instructions',
    result: JSON.stringify({
      funding_id: funding.id, contest_id: contestId, reference: funding.reference,
      settings_version: settings.version, qr_version: qr?.version || null,
      methods: Object.entries(methods).filter(([, v]) => v).map(([k]) => k),
    }),
  }).catch(() => null);

  const instructions = instructionsFor(settings, qr);
  // The QR image is a private object; a short-lived signed URL is issued per
  // view rather than anything publicly reachable being stored.
  for (const m of instructions.methods) {
    if (m._file_uri) {
      const signed = await createSignedUrl(m._file_uri, 900).catch(() => null);
      m.fields.qr_image_url = signed?.signed_url || null;
      delete m._file_uri;
    }
  }

  return json({
    funding: publicFunding(funding),
    // The one place the full payment details are returned.
    instructions,
    amount_minor: funding.total_amount_minor,
    amount_major: toMajor(funding.total_amount_minor, funding.currency),
    currency: funding.currency,
    // The client must put this on the transfer — it is how a human matches it.
    transfer_note: funding.reference,
    verification_window_hours: instructions.verification_hours,
    beta_notice: betaNotice(),
    steps: [
      `Transfer exactly ${toMajor(funding.total_amount_minor, funding.currency)} ${funding.currency} using one of the methods shown.`,
      `Put the reference ${funding.reference} in the payment remarks so we can match it.`,
      'Come back here and report the transfer with its UTR or transaction reference.',
      `A person at RazeKit checks it against our bank records, usually within ${instructions.verification_hours} hours on working days.`,
      'Your contest goes live only after that check succeeds.',
    ],
    warning: 'After completing the transfer, submit your transaction reference in RazeKit. Payment is confirmed only after admin verification of the actual bank receipt.',
  });
}

// ── fundingReportTransfer ───────────────────────────────────────────────────
/**
 * The client reports a transfer they say they made.
 *
 * This confirms nothing. It records the claim, runs duplicate protection, puts
 * the request in the finance queue and alerts the admins — without whom the
 * manual beta silently stalls.
 */
export async function fundingReportTransfer(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const b = ctx.body || {};
  const fundingId = b.funding_id;
  if (!fundingId) return err('FUNDING_ID_REQUIRED', 'funding_id is required.');

  const funding = await ctx.svc.entities.ContestFunding.get(fundingId).catch(() => null);
  if (!funding) return err('FUNDING_NOT_FOUND', 'Funding request not found.', 404);
  if (funding.brand_id !== ctx.user.id && ctx.user.role !== 'admin') {
    return err('FORBIDDEN', 'This funding request belongs to another account.', 403);
  }

  const reference = String(b.reference || '').trim();
  if (reference.length < 4) {
    return err('REFERENCE_REQUIRED', 'Enter the UTR or transaction reference from your bank. We need it to match your transfer.');
  }
  if (reference.length > 64) return err('REFERENCE_TOO_LONG', 'That reference is too long to be a bank UTR.');

  const amountMajor = Number(b.amount);
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return err('AMOUNT_REQUIRED', 'Enter the amount you transferred.');
  }
  const reportedMinor = toMinor(amountMajor, funding.currency);

  // ── Duplicate protection ───────────────────────────────────────────────
  // A bank reference identifies exactly one transfer. Seeing it twice means
  // either a double submission or an attempt to claim one payment for two
  // contests. Both are refused, and the second is recorded.
  const sameRef = await ctx.svc.entities.ContestFunding
    .filter({ reported_reference: reference }, '-created_date', 5).catch(() => []);
  const clash = sameRef.find((r) => r.id !== funding.id && ![FUNDING.REJECTED, FUNDING.CANCELLED].includes(r.status));
  if (clash) {
    await ctx.svc.entities.ContestFunding.update(funding.id, { duplicate_of_funding_id: clash.id }).catch(() => null);
    await ctx.svc.entities.AuditLog.create({
      user_id: funding.brand_id,
      actor: ctx.user.id,
      action: 'FUNDING_DUPLICATE_REFERENCE_BLOCKED',
      status: 'blocked',
      reason: 'Transfer reference already reported on another funding request',
      result: JSON.stringify({ funding_id: funding.id, clashes_with: clash.id }),
    }).catch(() => null);
    return err(
      'DUPLICATE_TRANSFER_REFERENCE',
      'That transaction reference has already been reported for another contest. If this is a mistake, contact support.',
      409
    );
  }

  // Replaying the same report on the same request is a no-op, not a second row.
  if (funding.reported_reference === reference && ![FUNDING.REJECTED, FUNDING.NEEDS_INFORMATION].includes(funding.status)) {
    return json({ funding: publicFunding(funding), already_reported: true, beta_notice: betaNotice() });
  }

  const next = assertFundingTransition(funding.status, FUNDING.TRANSFER_REPORTED);
  let updated;
  try {
    updated = await ctx.svc.entities.ContestFunding.update(funding.id, {
    status: next,
    reported_at: nowIso(),
    reported_amount_minor: reportedMinor,
    reported_reference: reference,
    reported_method: String(b.method || 'BANK_TRANSFER').slice(0, 32),
    reported_transfer_date: String(b.transfer_date || '').slice(0, 32) || null,
    reported_sender_name: String(b.sender_name || '').slice(0, 120) || null,
    reported_note: String(b.note || '').slice(0, 500) || null,
    // A prior rejection or information request is history: clear the active
    // flag, keep the record.
    rejection_reason: null,
    needs_information_reason: null,
    });
  } catch (e) {
    // The database enforces one live funding request per bank reference. If a
    // concurrent report claimed it first, refuse rather than half-writing.
    if (String(e?.message || '').includes('funding_reported_reference_uniq')) {
      return err('DUPLICATE_TRANSFER_REFERENCE', 'That transaction reference has already been reported. If this is a mistake, contact support.', 409);
    }
    throw e;
  }

  // Straight into the queue — there is no state where a claim waits unqueued.
  updated = await ctx.svc.entities.ContestFunding.update(updated.id, {
    status: assertFundingTransition(updated.status, FUNDING.PENDING_VERIFICATION),
  });

  await ctx.svc.entities.Contest.update(funding.contest_id, { funding_status: FUNDING.PENDING_VERIFICATION }).catch(() => null);

  await ctx.svc.entities.AuditLog.create({
    user_id: funding.brand_id,
    actor: ctx.user.id,
    action: 'FUNDING_REPORTED',
    status: 'success',
    reason: 'Client reported a manual bank transfer (unverified)',
    result: JSON.stringify({
      funding_id: funding.id,
      contest_id: funding.contest_id,
      reported_amount_minor: reportedMinor,
      expected_amount_minor: funding.total_amount_minor,
      currency: funding.currency,
      reference_last4: reference.slice(-4),
    }),
  }).catch(() => null);

  const contest = await ctx.svc.entities.Contest.get(funding.contest_id).catch(() => null);
  const client = await ctx.svc.entities.User.get(funding.brand_id).catch(() => null);

  // Without this the beta stalls: a client pays and nobody knows to look.
  await notifyAdminsFundingReported(ctx.svc, { funding: updated, client, contest }).catch(() => null);

  await ctx.svc.entities.Notification.create({
    type: 'payment_received',
    title: 'Transfer reported',
    description: `We have your transfer details for "${contest?.title || funding.reference}". A person will verify it against our bank records.`,
    recipient_user_id: funding.brand_id,
    contest_id: funding.contest_id,
    related_post_id: `client:funding_reported:${funding.id}:${reference}`,
  }).catch(() => null);

  const settings = await activeSettings(ctx.svc);
  if (client?.email) {
    sendEmail({
      to: client.email,
      subject: `RazeKit — we received your transfer details (${funding.reference})`,
      body: [
        `Hi ${displayName(client)},`,
        '',
        `Thanks — we have your transfer details for reference ${funding.reference}.`,
        '',
        'This is not a confirmation of payment. A member of the RazeKit team will check it against our bank records',
        `and update you, usually within ${settings.verification_hours || 24} hours on working days. Your contest goes live only after that check succeeds.`,
        '',
        `Amount you reported: ${toMajor(reportedMinor, funding.currency)} ${funding.currency}`,
        `Reference: ${reference}`,
        '',
        `Questions? ${settings.support_email || ''} ${settings.support_phone ? `/ ${settings.support_phone}` : ''}`.trim(),
      ].join('\n'),
    }).catch(() => null);
  }

  return json({
    funding: publicFunding(updated),
    queued: true,
    verification_window_hours: Number(settings.verification_hours) || 24,
    beta_notice: betaNotice(),
    message: 'We have your transfer details. A person will verify them against our bank records — nothing is confirmed automatically.',
  });
}

// ── fundingStatus ───────────────────────────────────────────────────────────
/** Where a funding request stands. Returns MASKED payment details only. */
export async function fundingStatus(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { contest_id: contestId, funding_id: fundingId } = ctx.body || {};

  let funding = null;
  if (fundingId) funding = await ctx.svc.entities.ContestFunding.get(fundingId).catch(() => null);
  else if (contestId) funding = await activeFundingFor(ctx.svc, contestId);
  else return err('CONTEST_ID_REQUIRED', 'contest_id or funding_id is required.');

  if (!funding) {
    const contest = contestId ? await ctx.svc.entities.Contest.get(contestId).catch(() => null) : null;
    if (contest && (contest.created_by_id === ctx.user.id || ctx.user.role === 'admin')) {
      const amounts = await computeFundingAmounts(ctx.svc, contest);
      return json({ funding: null, status: FUNDING.FUNDING_REQUIRED, ...amounts, beta_notice: betaNotice() });
    }
    return err('FUNDING_NOT_FOUND', 'No funding request found.', 404);
  }
  if (funding.brand_id !== ctx.user.id && ctx.user.role !== 'admin') {
    return err('FORBIDDEN', 'This funding request belongs to another account.', 403);
  }

  const [proofs, receipts, settings, qr] = await Promise.all([
    ctx.svc.entities.FundingProof.filter({ funding_id: funding.id }, '-created_date', 10).catch(() => []),
    ctx.svc.entities.FundingReceipt.filter({ funding_id: funding.id }, 'created_date', 20).catch(() => []),
    activeSettings(ctx.svc),
    activeQrVersion(ctx.svc),
  ]);

  return json({
    funding: publicFunding(funding),
    // Masked, so a client can confirm they paid the right place without the
    // full account being re-served on every status poll.
    masked_destination: maskedSettings(settings, qr),
    proofs: proofs.map((p) => ({ id: p.id, file_name: p.file_name, uploaded_at: p.uploaded_at, size_bytes: p.size_bytes })),
    receipts: receipts.map((r) => ({
      amount_minor: r.amount_minor, received_date: r.received_date || r.verified_at,
      match_class: r.match_class || null,
    })),
    timeline: buildTimeline(funding),
    beta_notice: betaNotice(),
    support: { phone: settings.support_phone, email: settings.support_email },
  });
}

function buildTimeline(f) {
  const t = [];
  t.push({ key: 'created', label: 'Funding request created', at: f.created_date, done: true });
  t.push({ key: 'instructions', label: 'Payment instructions issued', at: f.instructions_shown_at, done: Boolean(f.instructions_shown_at) });
  t.push({ key: 'reported', label: 'Transfer reported by you', at: f.reported_at, done: Boolean(f.reported_at) });
  t.push({
    key: 'verification',
    label: 'Checked against RazeKit bank records',
    at: f.verified_at || f.rejected_at,
    done: Boolean(f.verified_at || f.rejected_at),
    failed: Boolean(f.rejected_at && !f.verified_at),
  });
  t.push({ key: 'funded', label: 'Prize committed to the contest', at: f.verified_at, done: Boolean(f.verified_at) });
  if (f.refund_requested_at || f.refunded_at) {
    t.push({ key: 'refund', label: 'Refund', at: f.refunded_at || f.refund_requested_at, done: Boolean(f.refunded_at) });
  }
  return t;
}

// ── fundingCancel ───────────────────────────────────────────────────────────
/** Abandon a funding request that has not been verified. */
export async function fundingCancel(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { funding_id: fundingId, reason } = ctx.body || {};
  if (!fundingId) return err('FUNDING_ID_REQUIRED', 'funding_id is required.');

  const funding = await ctx.svc.entities.ContestFunding.get(fundingId).catch(() => null);
  if (!funding) return err('FUNDING_NOT_FOUND', 'Funding request not found.', 404);
  if (funding.brand_id !== ctx.user.id && ctx.user.role !== 'admin') {
    return err('FORBIDDEN', 'This funding request belongs to another account.', 403);
  }
  if ([FUNDING.VERIFIED, FUNDING.OVERPAID, FUNDING.PARTIAL].includes(funding.status)) {
    // Money that arrived is refunded, not cancelled. The distinction matters:
    // one is "never happened", the other is "happened and must come back".
    return err('MONEY_RECEIVED', 'We have already received money against this request. Ask for a refund instead of cancelling.', 409);
  }

  let next;
  try {
    next = assertFundingTransition(funding.status, FUNDING.CANCELLED);
  } catch (e) {
    return err(e.code || 'ILLEGAL_TRANSITION', `This funding request cannot be cancelled from ${funding.status}.`, 409);
  }

  const updated = await ctx.svc.entities.ContestFunding.update(funding.id, {
    status: next,
    cancelled_at: nowIso(),
    cancelled_by: ctx.user.id,
    reported_note: String(reason || funding.reported_note || '').slice(0, 500) || null,
  });
  await ctx.svc.entities.Contest.update(funding.contest_id, {
    funding_status: FUNDING.FUNDING_REQUIRED, funding_id: null,
  }).catch(() => null);

  await ctx.svc.entities.AuditLog.create({
    user_id: funding.brand_id,
    actor: ctx.user.id,
    action: 'FUNDING_CANCELLED',
    status: 'success',
    reason: String(reason || 'Cancelled by client').slice(0, 500),
    result: JSON.stringify({ funding_id: funding.id, contest_id: funding.contest_id, from: funding.status }),
  }).catch(() => null);

  return json({ funding: publicFunding(updated) });
}

// ── paymentModeInfo (public) ────────────────────────────────────────────────
/**
 * What payment mode the platform is in, plus the beta wording.
 *
 * Deliberately public and deliberately free of payment details: every visitor is
 * entitled to know that payments here are manual before they commit to a
 * contest.
 */
export async function paymentModeInfo(ctx) {
  const settings = await activeSettings(ctx.svc).catch(() => null);
  const qr = await activeQrVersion(ctx.svc).catch(() => null);
  const methods = settings ? enabledMethods(settings, qr) : {};
  return json({
    payment_mode: paymentMode(),
    accepts_funding: acceptsNewFunding(),
    manual_beta_ready: manualBetaReady() || Object.values(methods).some(Boolean),
    // Method availability only — no account numbers, no UPI ID, no QR.
    methods_available: Object.entries(methods).filter(([, v]) => v).map(([k]) => k),
    verification_window_hours: Number(settings?.verification_hours) || 24,
    beta_notice: betaNotice(),
    support: { phone: settings?.support_phone || '', email: settings?.support_email || '' },
  });
}

export { publicFunding, activeFundingFor, buildTimeline };
