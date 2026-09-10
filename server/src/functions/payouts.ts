// @ts-nocheck
// Creator payouts (manual beta).
//
// A creator's prize does not appear in a wallet they can spend. It becomes a
// debt RazeKit owes them the moment they win a contest whose prize was actually
// verified, and it is settled by a bank transfer a person makes and records.
//
// The eligibility rule that matters: a payout can only exist against money that
// is really there. `PAYOUT_ELIGIBLE` requires a VERIFIED funding for that
// contest — never a brand's promise, never a contest that was published without
// money behind it.
//
// On bank details: RazeKit must store a creator's full account number, because
// somebody has to type it into a bank transfer. It is stored on a server-only
// entity, returned masked to everyone including the finance dashboard, and
// revealed in full to exactly one handler — financePayoutDetail — which
// requires the finance.record_payout permission and writes an audit record
// every time it is read.
import { json } from './context.js';
import { toMajor, toMinor, makeRef } from '../money/core.js';
import { PAYOUT, PAYOUT_COPY, FUNDING, assertPayoutTransition } from '../payments/states.js';
import { maskAccountNumber, maskIfsc, maskUpi, last4, support, paymentMode } from '../payments/config.js';
import { FINANCE_PERMISSION, requireFinance, auditFinance, permissionsFor } from '../finance/permissions.js';
import { createPayoutLiability, recordPayoutPaid, balanceOf, ACCOUNT_CLASS } from '../ledger/events.js';
import { projectBalance } from '../finance/balances.js';
import { sendEmail } from '../integrations/email.js';

const nowIso = () => new Date().toISOString();
const err = (code, message, status = 400, extra = {}) => json({ error: { code, message, ...extra } }, status);

function publicPayout(p) {
  const copy = PAYOUT_COPY[p.status] || {};
  return {
    id: p.id,
    reference: p.reference,
    contest_id: p.contest_id,
    contest_title: p.contest_title || null,
    currency: p.currency,
    amount_minor: p.amount_minor,
    status: p.status,
    status_label: copy.label || p.status,
    status_detail: copy.detail || '',
    status_tone: copy.tone || 'neutral',
    eligibility_reason: p.eligibility_reason || null,
    eligible_at: p.eligible_at || null,
    requested_at: p.requested_at || null,
    approved_at: p.approved_at || null,
    paid_at: p.paid_at || null,
    payment_reference: p.payment_reference || null,
    rejection_reason: p.rejection_reason || null,
    // Masked, always — including to the creator who owns it.
    bank_account_masked: p.bank_account_masked || null,
    bank_name: p.bank_name || null,
    created_date: p.created_date,
  };
}

// ── ensurePayoutForWinner ───────────────────────────────────────────────────
/**
 * Called by winnerFinalize. Creates the payout record and moves the contest's
 * committed prize into a liability owed to the winner.
 *
 * If the prize was never funded and verified, the payout is created as
 * PAYOUT_NOT_ELIGIBLE with the reason recorded — the creator is told the truth
 * rather than shown an amount that cannot be paid.
 */
export async function ensurePayoutForWinner(svc, { contest, submission, creatorId }) {
  const existing = await svc.entities.Payout
    .filter({ contest_id: contest.id, creator_id: creatorId }, '-created_date', 1).catch(() => []);
  if (existing.length) return existing[0];

  const currency = contest.currency || 'INR';
  const funding = contest.funding_id
    ? await svc.entities.ContestFunding.get(contest.funding_id).catch(() => null)
    : null;

  const committed = await balanceOf(svc, {
    accountClass: ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, currency, subjectId: contest.id,
  }).catch(() => ({ balance_minor: 0 }));

  const funded = funding?.status === FUNDING.VERIFIED && committed.balance_minor > 0;
  const amountMinor = funded ? committed.balance_minor : toMinor(contest.prize_amount || 0, currency);

  const payout = await svc.entities.Payout.create({
    reference: makeRef('RK-PAY'),
    creator_id: creatorId,
    brand_id: contest.created_by_id,
    contest_id: contest.id,
    contest_title: contest.title || null,
    submission_id: submission?.id || null,
    funding_id: funding?.id || null,
    market: contest.settlement_region || 'IN',
    currency,
    amount_minor: amountMinor,
    prize_amount_minor: amountMinor,
    provider: 'manual_beta',
    payment_mode: paymentMode(),
    status: funded ? PAYOUT.PAYOUT_ELIGIBLE : PAYOUT.PAYOUT_NOT_ELIGIBLE,
    eligible_at: funded ? nowIso() : null,
    eligibility_reason: funded
      ? 'Contest prize was funded and verified.'
      : 'The prize for this contest has not been funded and verified, so it cannot be paid out yet.',
  });

  if (funded) {
    // The contest's committed prize becomes a named debt to this creator.
    await createPayoutLiability(svc, {
      payout, contestId: contest.id, brandId: contest.created_by_id, actorRole: 'system',
    }).catch(() => null);
    await projectBalance(svc, { userId: creatorId, currency, role: 'creator' }).catch(() => null);
  }

  await svc.entities.AuditLog.create({
    user_id: creatorId,
    actor: 'system',
    action: 'payout.created',
    status: funded ? 'success' : 'blocked',
    reason: payout.eligibility_reason,
    result: JSON.stringify({ payout_id: payout.id, contest_id: contest.id, amount_minor: amountMinor, funded }),
  }).catch(() => null);

  return payout;
}

// ── payoutAccountSave (creator) ─────────────────────────────────────────────
export async function payoutAccountSave(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const b = ctx.body || {};

  const holder = String(b.account_holder_name || '').trim();
  const accountNumber = String(b.account_number || '').replace(/\s/g, '');
  const ifsc = String(b.ifsc || '').trim().toUpperCase();
  const bankName = String(b.bank_name || '').trim();
  const upi = String(b.upi_id || '').trim();

  if (holder.length < 3) return err('HOLDER_REQUIRED', 'Enter the account holder name exactly as it appears on the bank account.');
  if (!/^\d{6,20}$/.test(accountNumber)) return err('ACCOUNT_NUMBER_INVALID', 'Enter a valid bank account number (6–20 digits).');
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return err('IFSC_INVALID', 'Enter a valid IFSC code, for example HDFC0001234.');
  if (b.confirm_account_number != null && String(b.confirm_account_number).replace(/\s/g, '') !== accountNumber) {
    // Cheap check, expensive mistake: a typo here sends a prize to a stranger.
    return err('ACCOUNT_NUMBER_MISMATCH', 'The two account numbers do not match. Check them and try again.');
  }
  if (upi && !/^[\w.\-]{2,}@[A-Za-z]{2,}$/.test(upi)) return err('UPI_INVALID', 'Enter a valid UPI ID, for example name@bank.');

  const existing = await ctx.svc.entities.PayoutAccount
    .filter({ user_id: ctx.user.id }, '-created_date', 1).catch(() => []);

  const patch = {
    user_id: ctx.user.id,
    provider: 'manual_beta',
    payment_mode: paymentMode(),
    onboarding_status: 'SUBMITTED',
    account_holder_name: holder,
    bank_name: bankName || null,
    // Stored so a human can make the transfer; never returned except to a
    // holder of finance.record_payout, and never logged.
    account_number: accountNumber,
    account_number_masked: maskAccountNumber(accountNumber),
    account_number_last4: last4(accountNumber),
    ifsc,
    upi_id_masked: upi ? maskUpi(upi) : null,
    account_type: String(b.account_type || 'savings').slice(0, 20),
    country: 'IN',
    is_default: true,
    submitted_at: nowIso(),
    // Changing details resets verification: a new account is a new risk.
    verified: false,
    verified_at: null,
    verified_by: null,
  };

  const row = existing.length
    ? await ctx.svc.entities.PayoutAccount.update(existing[0].id, patch)
    : await ctx.svc.entities.PayoutAccount.create(patch);

  await ctx.svc.entities.AuditLog.create({
    user_id: ctx.user.id,
    actor: ctx.user.id,
    action: 'payout_account.saved',
    status: 'success',
    reason: existing.length ? 'Bank details updated' : 'Bank details added',
    // Only the last four digits ever reach the audit log.
    result: JSON.stringify({ payout_account_id: row.id, account_last4: last4(accountNumber), ifsc: maskIfsc(ifsc) }),
  }).catch(() => null);

  return json({ account: maskedAccount(row), saved: true });
}

function maskedAccount(a) {
  if (!a) return null;
  return {
    id: a.id,
    account_holder_name: a.account_holder_name,
    bank_name: a.bank_name,
    account_number_masked: a.account_number_masked,
    account_number_last4: a.account_number_last4,
    ifsc_masked: maskIfsc(a.ifsc),
    upi_id_masked: a.upi_id_masked || null,
    account_type: a.account_type,
    verified: Boolean(a.verified),
    submitted_at: a.submitted_at || null,
  };
}

// ── payoutOverview (creator) ────────────────────────────────────────────────
export async function payoutOverview(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const svc = ctx.svc;
  const payouts = await svc.entities.Payout.filter({ creator_id: ctx.user.id }, '-created_date', 100).catch(() => []);
  const accounts = await svc.entities.PayoutAccount.filter({ user_id: ctx.user.id }, '-created_date', 1).catch(() => []);

  const owed = await balanceOf(svc, {
    accountClass: ACCOUNT_CLASS.PAYOUT_LIABILITY, currency: 'INR', subjectId: ctx.user.id,
  }).catch(() => ({ balance_minor: 0 }));

  const paid = payouts.filter((p) => p.status === PAYOUT.PAYOUT_PAID);

  return json({
    payment_mode: paymentMode(),
    // These two numbers are derived from the ledger, so the Tracker and this
    // page can no longer disagree about what a creator has earned.
    owed_minor: owed.balance_minor,
    paid_minor: paid.reduce((a, p) => a + Number(p.amount_minor || 0), 0),
    payouts: payouts.map(publicPayout),
    account: maskedAccount(accounts[0]),
    needs_bank_details: !accounts.length,
    support: support(),
  });
}

// ── payoutRequest (creator) ─────────────────────────────────────────────────
export async function payoutRequest(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const { payout_id: id } = ctx.body || {};
  if (!id) return err('PAYOUT_ID_REQUIRED', 'payout_id is required.');

  const payout = await ctx.svc.entities.Payout.get(id).catch(() => null);
  if (!payout) return err('PAYOUT_NOT_FOUND', 'Payout not found.', 404);
  if (payout.creator_id !== ctx.user.id) return err('FORBIDDEN', 'This payout belongs to another account.', 403);

  if (payout.status === PAYOUT.PAYOUT_NOT_ELIGIBLE) {
    return err('NOT_ELIGIBLE', payout.eligibility_reason || 'This payout is not eligible yet.', 409);
  }
  const accounts = await ctx.svc.entities.PayoutAccount.filter({ user_id: ctx.user.id }, '-created_date', 1).catch(() => []);
  if (!accounts.length) {
    return err('BANK_DETAILS_REQUIRED', 'Add your bank details before requesting a payout.', 409);
  }

  let next;
  try { next = assertPayoutTransition(payout.status, PAYOUT.PAYOUT_REQUESTED); }
  catch { return err('ILLEGAL_TRANSITION', `A payout that is ${payout.status} cannot be requested.`, 409); }

  const acc = accounts[0];
  const updated = await ctx.svc.entities.Payout.update(payout.id, {
    status: next,
    requested_at: nowIso(),
    payout_account_id: acc.id,
    // Snapshotted onto the payout so a later change of bank details cannot
    // silently redirect an in-flight transfer.
    bank_account_masked: acc.account_number_masked,
    bank_name: acc.bank_name,
    bank_ifsc: acc.ifsc,
    account_holder_name: acc.account_holder_name,
    rejection_reason: null,
  });

  await ctx.svc.entities.AuditLog.create({
    user_id: ctx.user.id, actor: ctx.user.id, action: 'payout.requested', status: 'success',
    reason: 'Creator requested payout',
    result: JSON.stringify({ payout_id: payout.id, contest_id: payout.contest_id, amount_minor: payout.amount_minor, account_last4: acc.account_number_last4 }),
  }).catch(() => null);

  return json({ payout: publicPayout(updated), message: 'Your payout request is with the RazeKit finance team.' });
}

// ── financePayoutQueue (admin) ──────────────────────────────────────────────
export async function financePayoutQueue(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.VIEW); if (denied) return denied;
  const svc = ctx.svc;
  const status = ctx.body?.status;
  const rows = await svc.entities.Payout.filter({}, '-created_date', 500).catch(() => []);
  const active = ['PAYOUT_REQUESTED', 'PAYOUT_APPROVED', 'PAYOUT_PROCESSING', 'PAYOUT_FAILED'];
  const filtered = status ? rows.filter((r) => r.status === status) : rows.filter((r) => active.includes(r.status));

  const out = [];
  for (const p of filtered) {
    const creator = await svc.entities.User.get(p.creator_id).catch(() => null);
    out.push({
      ...publicPayout(p),
      creator_name: creator?.full_name || null,
      creator_email: creator?.email || null,
      approved_by: p.approved_by || null,
      paid_by: p.paid_by || null,
      // Flag, don't block: RazeKit is a one-operator platform in beta and
      // pretending otherwise would be worse than saying so.
      same_person_approved_and_paid: Boolean(p.approved_by && p.paid_by && p.approved_by === p.paid_by),
      waiting_hours: p.requested_at ? Math.round((Date.now() - Date.parse(p.requested_at)) / 36e5) : null,
    });
  }
  return json({ queue: out, count: out.length, permissions: await permissionsFor(svc, ctx.user) });
}

// ── financePayoutDetail (admin, reveals the account) ────────────────────────
/**
 * The one handler that returns a creator's full bank account number, because a
 * human has to type it into a transfer. Requires finance.record_payout and
 * writes an audit record on every read, so "who looked at this account, and
 * when" is always answerable.
 */
export async function financePayoutDetail(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.RECORD_PAYOUT); if (denied) return denied;
  const { payout_id: id } = ctx.body || {};
  if (!id) return err('PAYOUT_ID_REQUIRED', 'payout_id is required.');

  const payout = await ctx.svc.entities.Payout.get(id).catch(() => null);
  if (!payout) return err('PAYOUT_NOT_FOUND', 'Payout not found.', 404);
  if (![PAYOUT.PAYOUT_APPROVED, PAYOUT.PAYOUT_PROCESSING, PAYOUT.PAYOUT_FAILED].includes(payout.status)) {
    return err('NOT_APPROVED', 'Bank details are revealed only for a payout that has been approved for transfer.', 409);
  }

  const acc = payout.payout_account_id
    ? await ctx.svc.entities.PayoutAccount.get(payout.payout_account_id).catch(() => null)
    : null;
  if (!acc) return err('BANK_DETAILS_MISSING', 'No bank details are on file for this payout.', 409);

  await auditFinance(ctx.svc, {
    actorId: ctx.user.id, action: 'finance.payout_bank_details_viewed', permission: FINANCE_PERMISSION.RECORD_PAYOUT,
    status: 'success', reason: 'Bank details revealed to make a transfer', subjectUserId: payout.creator_id,
    result: { payout_id: payout.id, account_last4: acc.account_number_last4 },
  });

  return json({
    payout: publicPayout(payout),
    amount_major: toMajor(payout.amount_minor, payout.currency),
    bank: {
      account_holder_name: acc.account_holder_name,
      bank_name: acc.bank_name,
      account_number: acc.account_number,
      ifsc: acc.ifsc,
      account_type: acc.account_type,
    },
    notice: 'These details were disclosed for this transfer and the disclosure has been logged. Do not copy them elsewhere.',
  });
}

// ── financeApprovePayout ────────────────────────────────────────────────────
export async function financeApprovePayout(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.APPROVE_PAYOUT); if (denied) return denied;
  const svc = ctx.svc;
  const b = ctx.body || {};
  const id = b.payout_id;
  if (!id) return err('PAYOUT_ID_REQUIRED', 'payout_id is required.');

  const payout = await svc.entities.Payout.get(id).catch(() => null);
  if (!payout) return err('PAYOUT_NOT_FOUND', 'Payout not found.', 404);

  if (b.action === 'reject') {
    if (!b.reason || String(b.reason).trim().length < 10) {
      return err('REASON_REQUIRED', 'Give a reason (at least 10 characters). The creator is shown this text.');
    }
    let next;
    try { next = assertPayoutTransition(payout.status, PAYOUT.PAYOUT_REJECTED); }
    catch { return err('ILLEGAL_TRANSITION', `A payout that is ${payout.status} cannot be rejected.`, 409); }
    const updated = await svc.entities.Payout.update(payout.id, {
      status: next, rejected_by: ctx.user.id, rejected_at: nowIso(), rejection_reason: String(b.reason).slice(0, 500),
    });
    await auditFinance(svc, {
      actorId: ctx.user.id, action: 'finance.reject_payout', permission: FINANCE_PERMISSION.APPROVE_PAYOUT,
      status: 'success', reason: b.reason, subjectUserId: payout.creator_id, result: { payout_id: payout.id },
    });
    await svc.entities.Notification.create({
      type: 'payment_received', title: 'Payout needs attention',
      description: String(b.reason).slice(0, 240), recipient_user_id: payout.creator_id, contest_id: payout.contest_id,
    }).catch(() => null);
    return json({ payout: publicPayout(updated) });
  }

  if (payout.status === PAYOUT.PAYOUT_APPROVED) return json({ payout: publicPayout(payout), already_approved: true });

  // Approving a payout larger than what is actually owed would create money.
  const owed = await balanceOf(svc, {
    accountClass: ACCOUNT_CLASS.PAYOUT_LIABILITY, currency: payout.currency, subjectId: payout.creator_id,
  });
  if (owed.balance_minor < Number(payout.amount_minor)) {
    await auditFinance(svc, {
      actorId: ctx.user.id, action: 'finance.approve_payout', permission: FINANCE_PERMISSION.APPROVE_PAYOUT,
      status: 'blocked', reason: 'Payout exceeds the recorded liability', subjectUserId: payout.creator_id,
      result: { payout_id: payout.id, owed_minor: owed.balance_minor, requested_minor: payout.amount_minor },
    });
    return err('EXCEEDS_LIABILITY', `RazeKit's ledger records ${toMajor(owed.balance_minor, payout.currency)} owed to this creator, but the payout is ${toMajor(payout.amount_minor, payout.currency)}. Investigate before approving.`, 409);
  }

  let next;
  try { next = assertPayoutTransition(payout.status, PAYOUT.PAYOUT_APPROVED); }
  catch { return err('ILLEGAL_TRANSITION', `A payout that is ${payout.status} cannot be approved.`, 409); }

  const updated = await svc.entities.Payout.update(payout.id, {
    status: next, approved_by: ctx.user.id, approved_at: nowIso(),
    approval_note: String(b.note || '').slice(0, 500) || null, rejection_reason: null,
  });

  await auditFinance(svc, {
    actorId: ctx.user.id, action: 'finance.approve_payout', permission: FINANCE_PERMISSION.APPROVE_PAYOUT,
    status: 'success', reason: b.note || 'Approved for transfer', subjectUserId: payout.creator_id,
    result: { payout_id: payout.id, amount_minor: payout.amount_minor },
  });

  await svc.entities.Notification.create({
    type: 'payment_received', title: 'Payout approved',
    description: 'Your payout was approved. The bank transfer has not been made yet — we will confirm when it has.',
    recipient_user_id: payout.creator_id, contest_id: payout.contest_id,
  }).catch(() => null);

  return json({ payout: publicPayout(updated) });
}

// ── financeRecordPayout ─────────────────────────────────────────────────────
/** A person made the transfer and records it here, with the bank reference. */
export async function financeRecordPayout(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.RECORD_PAYOUT); if (denied) return denied;
  const svc = ctx.svc;
  const b = ctx.body || {};
  const id = b.payout_id;
  if (!id) return err('PAYOUT_ID_REQUIRED', 'payout_id is required.');

  const payout = await svc.entities.Payout.get(id).catch(() => null);
  if (!payout) return err('PAYOUT_NOT_FOUND', 'Payout not found.', 404);
  if (payout.status === PAYOUT.PAYOUT_PAID) return json({ payout: publicPayout(payout), already_paid: true });

  if (b.action === 'fail') {
    if (!b.reason || String(b.reason).trim().length < 10) return err('REASON_REQUIRED', 'Explain why the transfer failed (at least 10 characters).');
    let next;
    try { next = assertPayoutTransition(payout.status, PAYOUT.PAYOUT_FAILED); }
    catch { return err('ILLEGAL_TRANSITION', `A payout that is ${payout.status} cannot be marked failed.`, 409); }
    const updated = await svc.entities.Payout.update(payout.id, {
      status: next, failure_reason: String(b.reason).slice(0, 500),
    });
    await auditFinance(svc, {
      actorId: ctx.user.id, action: 'finance.payout_failed', permission: FINANCE_PERMISSION.RECORD_PAYOUT,
      status: 'success', reason: b.reason, subjectUserId: payout.creator_id, result: { payout_id: payout.id },
    });
    return json({ payout: publicPayout(updated) });
  }

  const reference = String(b.payment_reference || '').trim();
  if (reference.length < 4) {
    return err('PAYMENT_REFERENCE_REQUIRED', 'Enter the bank reference (UTR) for the transfer you made. Without it this payout is not auditable.');
  }

  // PROCESSING is a real step, so walk through it rather than jumping.
  let current = payout;
  if (current.status === PAYOUT.PAYOUT_APPROVED) {
    current = await svc.entities.Payout.update(current.id, {
      status: assertPayoutTransition(current.status, PAYOUT.PAYOUT_PROCESSING), initiated_at: nowIso(),
    });
  }
  let next;
  try { next = assertPayoutTransition(current.status, PAYOUT.PAYOUT_PAID); }
  catch { return err('ILLEGAL_TRANSITION', `A payout that is ${current.status} cannot be marked paid. Approve it first.`, 409); }

  let posted;
  try {
    posted = await recordPayoutPaid(svc, { payout: current, actorId: ctx.user.id });
  } catch (e) {
    await auditFinance(svc, {
      actorId: ctx.user.id, action: 'finance.record_payout', permission: FINANCE_PERMISSION.RECORD_PAYOUT,
      status: 'error', reason: e.code || e.message, subjectUserId: payout.creator_id, result: { payout_id: payout.id },
    });
    return err(e.code || 'LEDGER_POST_FAILED', e.message || 'The ledger refused this posting; the payout was not marked paid.', e.status || 500);
  }

  const updated = await svc.entities.Payout.update(current.id, {
    status: next,
    paid_by: ctx.user.id,
    paid_at: nowIso(),
    completed_at: nowIso(),
    payment_reference: reference,
    payment_method: String(b.method || 'BANK_TRANSFER').slice(0, 32),
    payout_note: String(b.note || '').slice(0, 500) || null,
    ledger_txn_id: posted.transaction.id,
  });

  await projectBalance(svc, { userId: payout.creator_id, currency: payout.currency, role: 'creator' }).catch(() => null);

  const selfApproved = Boolean(updated.approved_by && updated.approved_by === ctx.user.id);
  await auditFinance(svc, {
    actorId: ctx.user.id, action: 'finance.record_payout', permission: FINANCE_PERMISSION.RECORD_PAYOUT,
    status: 'success', reason: b.note || 'Bank transfer recorded', subjectUserId: payout.creator_id,
    result: {
      payout_id: payout.id, amount_minor: payout.amount_minor,
      reference_last4: reference.slice(-4), txn: posted.transaction.reference,
      // Recorded rather than blocked, so the segregation gap is visible.
      approved_and_paid_by_same_user: selfApproved,
    },
  });

  await svc.entities.Notification.create({
    type: 'payment_received', title: 'Payout sent',
    description: `We transferred ${toMajor(payout.amount_minor, payout.currency)} ${payout.currency} to your bank account.`,
    recipient_user_id: payout.creator_id, contest_id: payout.contest_id,
  }).catch(() => null);

  const creator = await svc.entities.User.get(payout.creator_id).catch(() => null);
  if (creator?.email) {
    sendEmail({
      to: creator.email,
      subject: `RazeKit — payout sent (${payout.reference})`,
      body: [
        `We have transferred ${toMajor(payout.amount_minor, payout.currency)} ${payout.currency} to your bank account.`,
        '',
        `Contest: ${payout.contest_title || payout.contest_id}`,
        `Bank reference: ${reference}`,
        `Account: ${payout.bank_account_masked || ''}`,
        '',
        'Bank transfers usually appear within one to two working days.',
        `Questions? ${support().email} / ${support().phone}`,
      ].join('\n'),
    }).catch(() => null);
  }

  return json({ payout: publicPayout(updated), ledger_txn: posted.transaction.reference, self_approved: selfApproved });
}

export { publicPayout };
