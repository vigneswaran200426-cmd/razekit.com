// @ts-nocheck
// Admin → Finance. The control point for the manual beta money flow.
//
// The ordering this file enforces, and refuses to shortcut:
//
//   CLIENT SENDS REAL MONEY → it lands in RazeKit's bank account
//   ADMIN SEES the funding request
//   ADMIN VERIFIES the actual receipt against the bank statement
//   LEDGER CREDIT is posted
//   CLIENT BALANCE updates
//   CONTEST PRIZE is reserved
//
// A client submitting a payment form creates no money. Only
// `financeVerifyFunding` does, it runs in one database transaction with a row
// lock, and it posts through ledger/events.ts rather than touching a balance.
//
// Every handler is gated on a SPECIFIC finance permission rather than on "is an
// admin", and writes an audit record whether it succeeds or fails.
import { json } from './context.js';
import { withTransaction, lockRecord } from '../db.js';
import { serviceClient } from '../entities/service.js';
import { toMajor, toMinor } from '../money/core.js';
import {
  FUNDING, FUNDING_IN_QUEUE, FUNDING_MONEY_RECEIVED, RECON,
  classifyReconciliation, assertFundingTransition, WITHDRAWAL,
} from '../payments/states.js';
import { paymentMode } from '../payments/config.js';
import { activeSettings, activeQrVersion, maskedSettings } from '../payments/settings.js';
import {
  FINANCE_PERMISSION, requireFinance, auditFinance, permissionsFor,
  grantPermission, revokePermission, ALL_FINANCE_PERMISSIONS,
} from '../finance/permissions.js';
import {
  recordFundingVerified, reservePrize, releasePrize, approveRefund, recordRefundPaid,
  balanceOf, reverseTransaction, postAdjustment, ACCOUNT_CLASS,
} from '../ledger/events.js';
import { projectBalance, razekitBalance } from '../finance/balances.js';
import { replayBalance } from '../ledger/accounts.js';
import { createSignedUrl } from '../integrations/storage.js';
import { sendEmail } from '../integrations/email.js';
import { publicFunding } from './funding.js';
import { notifyClientFundingVerified, notifyClientFundingRejected, displayName } from '../finance/notify.js';

const nowIso = () => new Date().toISOString();
const err = (code, message, status = 400, extra = {}) => json({ error: { code, message, ...extra } }, status);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

// ── financeOverview ─────────────────────────────────────────────────────────
/** Live operational KPIs, every one of them read from real records. */
export async function financeOverview(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.VIEW); if (denied) return denied;
  const svc = ctx.svc;

  const [fundings, withdrawals, accounts, recons, txns] = await Promise.all([
    svc.entities.ContestFunding.filter({}, '-created_date', 1000).catch(() => []),
    svc.entities.WithdrawalRequest.filter({}, '-created_date', 1000).catch(() => []),
    svc.entities.LedgerAccount.filter({}, '-created_date', 2000).catch(() => []),
    svc.entities.ReconciliationRecord.filter({}, '-created_date', 500).catch(() => []),
    svc.entities.LedgerTransaction.filter({}, '-created_date', 1000).catch(() => []),
  ]);

  const sumClass = (cls) => accounts
    .filter((a) => a.account_class === cls)
    .reduce((t, a) => t + Number(a.balance_minor || 0), 0);
  const byStatus = (rows) => rows.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {});

  const pendingFunding = fundings.filter((f) => FUNDING_IN_QUEUE.includes(f.status));
  const verified = fundings.filter((f) => FUNDING_MONEY_RECEIVED.includes(f.status));
  const today = startOfToday();
  const verifiedToday = verified.filter((f) => f.verified_at && Date.parse(f.verified_at) >= today);

  const pendingWithdrawals = withdrawals.filter((w) => [WITHDRAWAL.REQUESTED, WITHDRAWAL.UNDER_REVIEW, WITHDRAWAL.ON_HOLD].includes(w.status));
  const processingWithdrawals = withdrawals.filter((w) => [WITHDRAWAL.APPROVED, WITHDRAWAL.PROCESSING, WITHDRAWAL.TRANSFER_SENT, WITHDRAWAL.FAILED].includes(w.status));
  const paidWithdrawals = withdrawals.filter((w) => w.status === WITHDRAWAL.PAID);

  const unresolved = recons.filter((r) => ![RECON.MATCHED, RECON.RESOLVED].includes(r.status));

  // Ledger exceptions: things that should be impossible and must be seen if
  // they ever happen. Cheap to compute, and the first thing to check when a
  // number looks wrong.
  const exceptions = [];
  for (const f of fundings) {
    if (FUNDING_MONEY_RECEIVED.includes(f.status) && !f.ledger_txn_id) {
      exceptions.push({ kind: 'verified_funding_without_ledger', id: f.id, reference: f.reference });
    }
  }
  for (const w of withdrawals) {
    if (w.status === WITHDRAWAL.PAID && !w.paid_txn_id) {
      exceptions.push({ kind: 'paid_withdrawal_without_ledger', id: w.id, reference: w.reference });
    }
  }
  const reversedWithoutReason = txns.filter((t) => t.status === 'REVERSED' && !t.description);
  for (const t of reversedWithoutReason) exceptions.push({ kind: 'reversal_without_reason', id: t.id, reference: t.reference });

  const attention = [];
  if (pendingFunding.length) attention.push({ kind: 'funding_verification', severity: 'high', count: pendingFunding.length, message: 'Reported transfers waiting to be checked against the bank.' });
  if (pendingWithdrawals.length) attention.push({ kind: 'withdrawal_review', severity: 'high', count: pendingWithdrawals.length, message: 'Withdrawal requests waiting for review.' });
  if (processingWithdrawals.length) attention.push({ kind: 'withdrawal_transfer', severity: 'high', count: processingWithdrawals.length, message: 'Approved withdrawals awaiting a bank transfer or confirmation.' });
  if (unresolved.length) attention.push({ kind: 'reconciliation', severity: 'medium', count: unresolved.length, message: 'Reconciliation differences that need a decision.' });
  const refundPending = fundings.filter((f) => f.status === FUNDING.REFUND_PENDING);
  if (refundPending.length) attention.push({ kind: 'refund_pending', severity: 'medium', count: refundPending.length, message: 'Approved refunds not yet transferred.' });
  if (exceptions.length) attention.push({ kind: 'ledger_exception', severity: 'high', count: exceptions.length, message: 'Ledger exceptions that need investigation.' });

  const settings = await activeSettings(svc);
  const qr = await activeQrVersion(svc);

  return json({
    payment_mode: paymentMode(),
    // Masked, even for finance staff. Nobody needs the full number on a
    // dashboard, and a screenshot of a dashboard travels.
    destination: maskedSettings(settings, qr),
    kpis: {
      pending_funding: pendingFunding.length,
      pending_funding_minor: pendingFunding.reduce((a, f) => a + Number(f.total_amount_minor || 0), 0),
      verified_funding_today: verifiedToday.length,
      verified_funding_today_minor: verifiedToday.reduce((a, f) => a + Number(f.verified_amount_minor || f.total_amount_minor || 0), 0),
      total_verified_funding: verified.length,
      total_verified_funding_minor: verified.reduce((a, f) => a + Number(f.verified_amount_minor || f.total_amount_minor || 0), 0),
      reserved_contest_prizes_minor: sumClass(ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT),
      pending_withdrawals: pendingWithdrawals.length,
      pending_withdrawals_minor: pendingWithdrawals.reduce((a, w) => a + Number(w.amount_minor || 0), 0),
      processing_withdrawals: processingWithdrawals.length,
      processing_withdrawals_minor: processingWithdrawals.reduce((a, w) => a + Number(w.amount_minor || 0), 0),
      paid_withdrawals: paidWithdrawals.length,
      paid_withdrawals_minor: paidWithdrawals.reduce((a, w) => a + Number(w.amount_minor || 0), 0),
      unresolved_reconciliation: unresolved.length,
      ledger_exceptions: exceptions.length,
    },
    balances: {
      bank_settlement_minor: sumClass(ACCOUNT_CLASS.BANK_SETTLEMENT),
      client_funds_held_minor: sumClass(ACCOUNT_CLASS.CLIENT_FUNDS),
      contest_prize_committed_minor: sumClass(ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT),
      payout_liability_minor: sumClass(ACCOUNT_CLASS.PAYOUT_LIABILITY),
      withdrawal_pending_minor: sumClass(ACCOUNT_CLASS.WITHDRAWAL_PENDING),
      platform_fee_minor: sumClass(ACCOUNT_CLASS.PLATFORM_FEE),
      tax_payable_minor: sumClass(ACCOUNT_CLASS.TAX_PAYABLE),
      refund_clearing_minor: sumClass(ACCOUNT_CLASS.REFUND_CLEARING),
    },
    funding: { total: fundings.length, by_status: byStatus(fundings) },
    withdrawals: { total: withdrawals.length, by_status: byStatus(withdrawals) },
    reconciliation: { total: recons.length, unresolved: unresolved.length, by_status: byStatus(recons) },
    exceptions,
    attention,
    permissions: await permissionsFor(svc, ctx.user),
  });
}

// ── financeFundingQueue ─────────────────────────────────────────────────────
export async function financeFundingQueue(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.VIEW); if (denied) return denied;
  const svc = ctx.svc;
  const b = ctx.body || {};
  const rows = await svc.entities.ContestFunding.filter({}, '-created_date', 500).catch(() => []);

  let filtered = b.status ? rows.filter((r) => r.status === b.status)
    : b.all ? rows
    : rows.filter((r) => FUNDING_IN_QUEUE.includes(r.status));
  if (b.contest_id) filtered = filtered.filter((r) => r.contest_id === b.contest_id);
  if (b.from) filtered = filtered.filter((r) => Date.parse(r.created_date) >= Date.parse(b.from));
  if (b.to) filtered = filtered.filter((r) => Date.parse(r.created_date) <= Date.parse(b.to));
  if (b.q) {
    const q = String(b.q).toLowerCase();
    filtered = filtered.filter((r) => `${r.reference} ${r.reported_reference || ''}`.toLowerCase().includes(q));
  }

  const out = [];
  for (const f of filtered.slice(0, 200)) {
    const contest = await svc.entities.Contest.get(f.contest_id).catch(() => null);
    const client = await svc.entities.User.get(f.brand_id).catch(() => null);
    const proofCount = (await svc.entities.FundingProof.filter({ funding_id: f.id }, '-created_date', 5).catch(() => [])).length;
    out.push({
      ...publicFunding(f),
      contest_title: contest?.title || null,
      client_name: displayName(client),
      client_email: client?.email || null,
      expected_amount_minor: f.total_amount_minor,
      difference_minor: f.reported_amount_minor == null ? null : Number(f.reported_amount_minor) - Number(f.total_amount_minor),
      // Pre-classified so the reviewer sees the discrepancy before deciding.
      amount_match: f.reported_amount_minor == null ? null : classifyReconciliation(f.total_amount_minor, f.reported_amount_minor),
      reported_sender_name: f.reported_sender_name || null,
      reported_note: f.reported_note || null,
      duplicate_of_funding_id: f.duplicate_of_funding_id || null,
      proof_count: proofCount,
      submitted_at: f.reported_at || f.created_date,
      waiting_hours: f.reported_at ? Math.round((Date.now() - Date.parse(f.reported_at)) / 36e5) : null,
    });
  }
  return json({ queue: out, count: out.length, total: rows.length, permissions: await permissionsFor(svc, ctx.user) });
}

// ── financeFundingDetail ────────────────────────────────────────────────────
export async function financeFundingDetail(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.VIEW); if (denied) return denied;
  const { funding_id: id } = ctx.body || {};
  if (!id) return err('FUNDING_ID_REQUIRED', 'funding_id is required.');
  const svc = ctx.svc;
  const f = await svc.entities.ContestFunding.get(id).catch(() => null);
  if (!f) return err('FUNDING_NOT_FOUND', 'Funding request not found.', 404);

  const [contest, client, proofs, txns, receipts, recons] = await Promise.all([
    svc.entities.Contest.get(f.contest_id).catch(() => null),
    svc.entities.User.get(f.brand_id).catch(() => null),
    svc.entities.FundingProof.filter({ funding_id: f.id }, '-created_date', 10).catch(() => []),
    svc.entities.LedgerTransaction.filter({ funding_id: f.id }, 'created_date', 50).catch(() => []),
    svc.entities.FundingReceipt.filter({ funding_id: f.id }, 'created_date', 20).catch(() => []),
    svc.entities.ReconciliationRecord.filter({ funding_id: f.id }, '-created_date', 20).catch(() => []),
  ]);

  // Proof files are private objects; a short-lived signed URL is issued per view
  // rather than anything publicly reachable being stored.
  const withUrls = [];
  for (const p of proofs) {
    const signed = await createSignedUrl(p.file_uri, 900).catch(() => null);
    withUrls.push({
      id: p.id, file_name: p.file_name, mime_type: p.mime_type, size_bytes: p.size_bytes,
      uploaded_at: p.uploaded_at, storage_path: p.storage_path, signed_url: signed?.signed_url || null,
    });
  }

  const audits = (await svc.entities.AuditLog.filter({ user_id: f.brand_id }, '-created_date', 200).catch(() => []))
    .filter((a) => String(a.result || '').includes(f.id));

  const settings = await activeSettings(svc);
  const qr = await activeQrVersion(svc);

  return json({
    funding: {
      ...publicFunding(f),
      expected_amount_minor: f.total_amount_minor,
      reported_sender_name: f.reported_sender_name || null,
      reported_note: f.reported_note || null,
      bank_reference: f.bank_reference || null,
      verified_by: f.verified_by || null,
      verified_amount_minor: f.verified_amount_minor ?? null,
      verification_note: f.verification_note || null,
      amount_match: f.reported_amount_minor == null ? null : classifyReconciliation(f.total_amount_minor, f.reported_amount_minor),
    },
    contest: contest ? { id: contest.id, title: contest.title, status: contest.status, prize_amount: contest.prize_amount, deadline: contest.deadline } : null,
    client: client ? { id: client.id, name: displayName(client), email: client.email } : null,
    proofs: withUrls,
    receipts: receipts.map((r) => ({
      id: r.id, amount_minor: r.amount_minor, bank_reference: r.bank_reference,
      received_date: r.received_date || r.verified_at, verified_by: r.verified_by,
      match_class: r.match_class, note: r.note || null,
    })),
    ledger: txns.map((t) => ({ id: t.id, reference: t.reference, txn_type: t.txn_type, amount_minor: t.amount_minor, posted_at: t.posted_at, status: t.status })),
    reconciliation: recons.map((r) => ({ id: r.id, status: r.status, expected_amount_minor: r.expected_amount_minor, actual_amount_minor: r.actual_amount_minor, difference_minor: r.difference_minor, mismatch_summary: r.mismatch_summary })),
    audit: audits.map((a) => ({ id: a.id, action: a.action, actor: a.actor, status: a.status, reason: a.reason, created_date: a.created_date })),
    destination: maskedSettings(settings, qr),
    permissions: await permissionsFor(svc, ctx.user),
  });
}

// ── financeVerifyFunding ────────────────────────────────────────────────────
/**
 * A person confirms the transfer against the bank statement. THE moment a claim
 * becomes money.
 *
 * `verified_amount` is what the BANK shows, not what the client said. The whole
 * operation runs in one transaction with the funding row locked, so a double
 * click, a retried request or two admins acting at once produce exactly one
 * credit. If any step throws, nothing is written — no half-credited account.
 *
 * Outcomes:
 *   MATCHED   → credit, reserve the prize, contest goes live
 *   OVERPAID  → credit the real amount, reserve the prize, excess stays on the
 *               client's balance and is flagged as refundable
 *   PARTIAL   → credit the real money that arrived, do NOT reserve or publish;
 *               the shortfall is recorded and the client is asked to top up
 *   MISMATCH  → nothing is credited; reject it instead
 */
export async function financeVerifyFunding(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.VERIFY_FUNDING); if (denied) return denied;
  const b = ctx.body || {};
  const id = b.funding_id;
  if (!id) return err('FUNDING_ID_REQUIRED', 'funding_id is required.');

  const bankReference = String(b.bank_reference || '').trim();
  if (bankReference.length < 4) {
    return err('BANK_REFERENCE_REQUIRED', 'Enter the reference exactly as it appears on the bank statement. This is what makes the verification auditable.');
  }

  let outcome;
  try {
    outcome = await withTransaction(async (tx) => {
      const svc = serviceClient(tx);
      // The lock is what serialises two simultaneous verifications.
      await lockRecord(tx, id);
      const funding = await svc.entities.ContestFunding.get(id).catch(() => null);
      if (!funding) return { conflict: err('FUNDING_NOT_FOUND', 'Funding request not found.', 404) };

      // Re-read inside the lock: the second concurrent click lands here.
      if (funding.status === FUNDING.VERIFIED || funding.status === FUNDING.OVERPAID) {
        return { funding, already: true };
      }
      if (!FUNDING_IN_QUEUE.includes(funding.status)) {
        return { conflict: err('NOT_IN_QUEUE', `This funding request is ${funding.status} and cannot be verified.`, 409) };
      }

      // One bank reference credits the ledger once. A genuine top-up carries a
      // different UTR and is therefore a legitimate second receipt.
      const priorReceipts = await svc.entities.FundingReceipt
        .filter({ funding_id: funding.id }, 'created_date', 20).catch(() => []);
      if (priorReceipts.some((r) => String(r.bank_reference).toUpperCase() === bankReference.toUpperCase())) {
        return { conflict: err('DUPLICATE_BANK_REFERENCE', 'That bank reference has already been recorded against this funding request. No second credit was created.', 409) };
      }

      const expected = Number(funding.total_amount_minor);
      const priorTotal = priorReceipts.reduce((a, r) => a + Number(r.amount_minor || 0), 0);
      const thisReceipt = b.verified_amount != null
        ? toMinor(Number(b.verified_amount), funding.currency)
        : Number(funding.reported_amount_minor ?? expected) - priorTotal;

      if (!Number.isFinite(thisReceipt) || thisReceipt <= 0) {
        return { conflict: err('AMOUNT_REQUIRED', 'Enter the amount that actually appears on the bank statement.') };
      }

      const runningTotal = priorTotal + thisReceipt;
      const match = classifyReconciliation(expected, runningTotal);

      if (match === RECON.MISMATCH) {
        return { conflict: err('NO_MATCHING_CREDIT', 'No credit was recorded for this reference. Reject the request instead of verifying it.', 422) };
      }
      if (match === RECON.PARTIAL && b.accept_partial !== true) {
        return {
          conflict: err(
            'AMOUNT_SHORTFALL',
            `The bank shows ${toMajor(runningTotal, funding.currency)} but ${toMajor(expected, funding.currency)} is due. Record it as a part payment, or reject the request.`,
            422,
            { expected_amount_minor: expected, actual_amount_minor: runningTotal, difference_minor: runningTotal - expected }
          ),
        };
      }

      // ── Post the real money that arrived ───────────────────────────────
      const credit = await recordFundingVerified(svc, {
        funding, actorId: ctx.user.id, amountMinor: thisReceipt, bankReference,
        // Only the first receipt carries the platform fee and tax.
        bookFees: priorReceipts.length === 0,
      });

      await svc.entities.FundingReceipt.create({
        funding_id: funding.id,
        contest_id: funding.contest_id,
        brand_id: funding.brand_id,
        currency: funding.currency,
        amount_minor: thisReceipt,
        bank_reference: bankReference,
        received_date: String(b.received_date || '').slice(0, 32) || nowIso().slice(0, 10),
        verified_by: ctx.user.id,
        verified_at: nowIso(),
        note: String(b.note || '').slice(0, 500) || null,
        ledger_txn_id: credit.transaction.id,
        match_class: match,
      });

      await svc.entities.ReconciliationRecord.create({
        reference: `RECON-${funding.reference}-${priorReceipts.length + 1}`,
        entity_type: 'ContestFunding',
        internal_ref: funding.reference,
        internal_status: funding.status,
        provider: 'manual_beta',
        provider_ref: bankReference,
        provider_status: 'BANK_STATEMENT',
        contest_id: funding.contest_id,
        funding_id: funding.id,
        currency: funding.currency,
        expected_amount_minor: expected,
        actual_amount_minor: runningTotal,
        difference_minor: runningTotal - expected,
        bank_reference: bankReference,
        status: match,
        checked_by: ctx.user.id,
        checked_at: nowIso(),
        mismatch_summary: match === RECON.MATCHED ? '' : `Expected ${expected}, bank shows ${runningTotal} (${match}).`,
      }).catch(() => null);

      // A part payment credits the money that really arrived but does NOT fund
      // the contest — the prize is not fully covered, so nothing is reserved and
      // nothing goes live.
      if (match === RECON.PARTIAL) {
        const partial = await svc.entities.ContestFunding.update(funding.id, {
          status: assertFundingTransition(funding.status, FUNDING.PARTIAL),
          receipts_total_minor: runningTotal,
          shortfall_minor: expected - runningTotal,
          bank_reference: bankReference,
          last_receipt_reference: bankReference,
          verified_by: ctx.user.id,
          verification_note: String(b.note || '').slice(0, 500) || null,
          ledger_txn_id: funding.ledger_txn_id || credit.transaction.id,
        });
        await svc.entities.Contest.update(funding.contest_id, { funding_status: FUNDING.PARTIAL }).catch(() => null);
        return { funding: partial, match, credit, receiptMinor: thisReceipt, runningTotal, expected, partial: true };
      }

      // Fully covered (or more). Commit the prize to THIS contest so it can
      // never be spent on another one.
      const reservation = await reservePrize(svc, {
        funding, prizeMinor: Number(funding.prize_amount_minor), actorId: ctx.user.id,
      });

      const overpaid = Math.max(0, runningTotal - expected);
      const nextStatus = overpaid > 0 ? FUNDING.OVERPAID : FUNDING.VERIFIED;
      const saved = await svc.entities.ContestFunding.update(funding.id, {
        status: assertFundingTransition(funding.status, nextStatus),
        verified_by: ctx.user.id,
        verified_at: nowIso(),
        verified_amount_minor: runningTotal,
        receipts_total_minor: runningTotal,
        shortfall_minor: 0,
        overpaid_minor: overpaid,
        verification_note: String(b.note || '').slice(0, 500) || null,
        bank_reference: bankReference,
        last_receipt_reference: bankReference,
        ledger_txn_id: funding.ledger_txn_id || credit.transaction.id,
        reservation_txn_id: reservation.transaction.id,
      });

      const contest = await svc.entities.Contest.get(funding.contest_id).catch(() => null);
      await svc.entities.Contest.update(funding.contest_id, {
        funding_status: nextStatus,
        funding_id: funding.id,
        funded_at: nowIso(),
        prize_committed_minor: reservation.transaction.amount_minor,
        // Funding is the publication gate: a draft contest goes live here and
        // nowhere else.
        status: contest && contest.status === 'draft' ? 'open' : contest?.status,
      }).catch(() => null);

      return {
        funding: saved, match, credit, reservation, contest,
        receiptMinor: thisReceipt, runningTotal, expected, overpaid,
        published: Boolean(contest && contest.status === 'draft'),
      };
    });
  } catch (e) {
    await auditFinance(ctx.svc, {
      actorId: ctx.user.id, action: 'FUNDING_VERIFIED', permission: FINANCE_PERMISSION.VERIFY_FUNDING,
      status: 'error', reason: e?.code || e?.message || 'transaction failed', result: { funding_id: id },
    });
    if (String(e?.message || '').includes('ledger_txn_idempotency_uniq')) {
      return err('DUPLICATE_CREDIT_BLOCKED', 'That credit already exists. No second credit was created.', 409);
    }
    return err(e?.code || 'VERIFY_FAILED', e?.message || 'The verification could not be completed. Nothing was credited.', e?.status || 500);
  }

  if (outcome.conflict) {
    await auditFinance(ctx.svc, {
      actorId: ctx.user.id, action: 'FUNDING_VERIFIED', permission: FINANCE_PERMISSION.VERIFY_FUNDING,
      status: 'blocked', reason: outcome.conflict.json?.error?.code || 'blocked', result: { funding_id: id },
    });
    return outcome.conflict;
  }
  if (outcome.already) {
    return json({ funding: publicFunding(outcome.funding), already_verified: true, message: 'This funding was already verified. No second credit was created.' });
  }

  // Outside the transaction: projections and notifications must never be able
  // to roll back a committed financial fact.
  const f = outcome.funding;
  await projectBalance(ctx.svc, { userId: f.brand_id, currency: f.currency, role: 'client' }).catch(() => null);
  const client = await ctx.svc.entities.User.get(f.brand_id).catch(() => null);
  const contest = await ctx.svc.entities.Contest.get(f.contest_id).catch(() => null);

  await auditFinance(ctx.svc, {
    actorId: ctx.user.id,
    action: outcome.partial ? 'FUNDING_PARTIAL_RECEIVED' : 'FUNDING_VERIFIED',
    permission: FINANCE_PERMISSION.VERIFY_FUNDING,
    status: 'success',
    reason: b.note || 'Matched against bank statement',
    subjectUserId: f.brand_id,
    result: {
      funding_id: f.id, reference: f.reference, contest_id: f.contest_id,
      currency: f.currency,
      expected_amount_minor: outcome.expected,
      receipt_amount_minor: outcome.receiptMinor,
      running_total_minor: outcome.runningTotal,
      match: outcome.match,
      ledger_txn: outcome.credit.transaction.reference,
      reservation_txn: outcome.reservation?.transaction?.reference || null,
      bank_reference_last4: bankReference.slice(-4),
      accepted_shortfall: outcome.match === RECON.PARTIAL,
      overpaid_minor: outcome.overpaid || 0,
    },
  });

  if (outcome.partial) {
    await ctx.svc.entities.Notification.create({
      type: 'payment_received',
      title: 'Part payment received',
      description: `We received ${toMajor(outcome.runningTotal, f.currency)} of ${toMajor(outcome.expected, f.currency)} for "${contest?.title || f.reference}". Transfer the balance to make the contest live.`,
      recipient_user_id: f.brand_id,
      contest_id: f.contest_id,
      related_post_id: `client:funding_partial:${f.id}:${bankReference}`,
    }).catch(() => null);
    if (client?.email) {
      sendEmail({
        to: client.email,
        subject: `RazeKit — part payment received (${f.reference})`,
        body: [
          `Hi ${displayName(client)},`,
          '',
          `We matched ${toMajor(outcome.receiptMinor, f.currency)} ${f.currency} against our bank records.`,
          `Total received so far: ${toMajor(outcome.runningTotal, f.currency)} of ${toMajor(outcome.expected, f.currency)} ${f.currency}.`,
          `Still outstanding: ${toMajor(outcome.expected - outcome.runningTotal, f.currency)} ${f.currency}.`,
          '',
          'Your contest goes live once the full amount has been received and verified.',
        ].join('\n'),
      }).catch(() => null);
    }
  } else {
    await notifyClientFundingVerified(ctx.svc, {
      funding: f, client, contest, amountMinor: outcome.runningTotal,
    }).catch(() => null);
  }

  return json({
    funding: publicFunding(f),
    match: outcome.match,
    receipt_amount_minor: outcome.receiptMinor,
    running_total_minor: outcome.runningTotal,
    expected_amount_minor: outcome.expected,
    overpaid_minor: outcome.overpaid || 0,
    ledger: {
      credit_txn: outcome.credit.transaction.reference,
      reservation_txn: outcome.reservation?.transaction?.reference || null,
    },
    contest_published: Boolean(outcome.published),
  });
}

// ── financeRejectFunding / request information ──────────────────────────────
export async function financeRejectFunding(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.VERIFY_FUNDING); if (denied) return denied;
  const svc = ctx.svc;
  const b = ctx.body || {};
  const id = b.funding_id;
  const reason = b.reason;
  if (!id) return err('FUNDING_ID_REQUIRED', 'funding_id is required.');
  // A refusal the client cannot understand is a support ticket waiting to
  // happen, so a real reason is mandatory.
  if (!reason || String(reason).trim().length < 10) {
    return err('REASON_REQUIRED', 'Give a specific reason (at least 10 characters). The client is shown this text.');
  }

  const askOnly = b.action === 'request_information';
  const target = askOnly ? FUNDING.NEEDS_INFORMATION : FUNDING.REJECTED;

  const out = await withTransaction(async (tx) => {
    const s = serviceClient(tx);
    await lockRecord(tx, id);
    const funding = await s.entities.ContestFunding.get(id).catch(() => null);
    if (!funding) return { conflict: err('FUNDING_NOT_FOUND', 'Funding request not found.', 404) };
    if (FUNDING_MONEY_RECEIVED.includes(funding.status) && !askOnly) {
      return { conflict: err('MONEY_RECEIVED', 'Money has already been credited against this request. Refund it instead of rejecting it.', 409) };
    }
    let next;
    try { next = assertFundingTransition(funding.status, target); }
    catch { return { conflict: err('ILLEGAL_TRANSITION', `A ${funding.status} request cannot move to ${target}.`, 409) }; }

    const saved = await s.entities.ContestFunding.update(funding.id, {
      status: next,
      ...(askOnly
        ? { needs_information_reason: String(reason).slice(0, 500), needs_information_at: nowIso() }
        : { rejected_by: ctx.user.id, rejected_at: nowIso(), rejection_reason: String(reason).slice(0, 500) }),
    });
    await s.entities.Contest.update(funding.contest_id, { funding_status: next }).catch(() => null);
    return { funding: saved, previous: funding.status };
  }).catch((e) => ({ conflict: err(e?.code || 'REJECT_FAILED', e?.message || 'The request could not be updated.', e?.status || 500) }));

  if (out.conflict) return out.conflict;

  await auditFinance(svc, {
    actorId: ctx.user.id,
    action: askOnly ? 'FUNDING_INFORMATION_REQUESTED' : 'FUNDING_REJECTED',
    permission: FINANCE_PERMISSION.VERIFY_FUNDING,
    status: 'success', reason, subjectUserId: out.funding.brand_id,
    result: { funding_id: out.funding.id, reference: out.funding.reference, contest_id: out.funding.contest_id, from: out.previous },
  });

  const client = await svc.entities.User.get(out.funding.brand_id).catch(() => null);
  if (askOnly) {
    await svc.entities.Notification.create({
      type: 'payment_received',
      title: 'We need a bit more information',
      description: String(reason).slice(0, 240),
      recipient_user_id: out.funding.brand_id,
      contest_id: out.funding.contest_id,
      related_post_id: `client:funding_info:${out.funding.id}`,
    }).catch(() => null);
  } else {
    await notifyClientFundingRejected(svc, { funding: out.funding, client, reason }).catch(() => null);
  }

  return json({ funding: publicFunding(out.funding) });
}

// ── financeUserBalances ─────────────────────────────────────────────────────
/** Every account the ledger knows about, grouped by user. */
export async function financeUserBalances(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.VIEW); if (denied) return denied;
  const svc = ctx.svc;
  const b = ctx.body || {};

  if (b.user_id) {
    const user = await svc.entities.User.get(b.user_id).catch(() => null);
    if (!user) return err('USER_NOT_FOUND', 'User not found.', 404);
    const role = user.user_role === 'client' ? 'client' : 'creator';
    const balance = await razekitBalance(svc, { userId: user.id, currency: 'INR', role });
    const entries = await svc.entities.LedgerEntry.filter({ owner_id: user.id }, '-created_date', 200).catch(() => []);
    return json({
      user: { id: user.id, name: displayName(user), email: user.email, user_role: user.user_role },
      balance,
      entries: entries.map((e) => ({
        id: e.id, transaction_reference: e.transaction_reference, account_class: e.account_class,
        entry_type: e.entry_type, direction: e.direction, amount_minor: e.amount_minor,
        balance_after_minor: e.balance_after_minor, posted_at: e.posted_at, description: e.description,
      })),
    });
  }

  const accounts = await svc.entities.LedgerAccount.filter({}, '-created_date', 2000).catch(() => []);
  const byOwner = new Map();
  for (const a of accounts) {
    if (!a.owner_id || !['BRAND', 'CREATOR'].includes(a.owner_type)) continue;
    const row = byOwner.get(a.owner_id) || { owner_id: a.owner_id, owner_type: a.owner_type, available_minor: 0, pending_minor: 0 };
    if (a.account_class === ACCOUNT_CLASS.CLIENT_FUNDS || a.account_class === ACCOUNT_CLASS.PAYOUT_LIABILITY) {
      row.available_minor += Number(a.balance_minor || 0);
    }
    if (a.account_class === ACCOUNT_CLASS.WITHDRAWAL_PENDING) row.pending_minor += Number(a.balance_minor || 0);
    byOwner.set(a.owner_id, row);
  }

  const rows = [];
  for (const row of byOwner.values()) {
    const u = await svc.entities.User.get(row.owner_id).catch(() => null);
    rows.push({
      ...row,
      name: displayName(u),
      email: u?.email || null,
      user_role: u?.user_role || null,
      total_minor: row.available_minor + row.pending_minor,
    });
  }
  rows.sort((a, x) => x.total_minor - a.total_minor);
  return json({ balances: rows, count: rows.length });
}

// ── financePrizeCommitments ─────────────────────────────────────────────────
/** Money committed to specific contests and not spendable anywhere else. */
export async function financePrizeCommitments(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.VIEW); if (denied) return denied;
  const svc = ctx.svc;
  const accounts = await svc.entities.LedgerAccount
    .filter({ account_class: ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT }, '-created_date', 500).catch(() => []);

  const rows = [];
  for (const a of accounts) {
    const contest = await svc.entities.Contest.get(a.owner_id || a.contest_id).catch(() => null);
    const client = contest ? await svc.entities.User.get(contest.created_by_id).catch(() => null) : null;
    rows.push({
      account_id: a.id,
      contest_id: a.owner_id || a.contest_id,
      contest_title: contest?.title || null,
      contest_status: contest?.status || null,
      client_name: displayName(client),
      currency: a.currency,
      committed_minor: Number(a.balance_minor || 0),
      winner_user_id: contest?.winner_user_id || null,
      funded_at: contest?.funded_at || null,
      last_posted_at: a.last_posted_at || null,
    });
  }
  rows.sort((x, y) => y.committed_minor - x.committed_minor);
  return json({
    commitments: rows,
    total_minor: rows.reduce((a, r) => a + r.committed_minor, 0),
    open_count: rows.filter((r) => r.committed_minor > 0).length,
  });
}

// ── financeLedger ───────────────────────────────────────────────────────────
/** Read the book. Transactions with their entries, or one account's history. */
export async function financeLedger(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.VIEW); if (denied) return denied;
  const svc = ctx.svc;
  const b = ctx.body || {};

  if (b.account_id) {
    const account = await svc.entities.LedgerAccount.get(b.account_id).catch(() => null);
    if (!account) return err('ACCOUNT_NOT_FOUND', 'Ledger account not found.', 404);
    const entries = await svc.entities.LedgerEntry.filter({ account_id: account.id }, '-created_date', 200).catch(() => []);
    const replay = await replayBalance(svc, account);
    return json({
      account,
      entries,
      // The cached column and the replayed truth are shown side by side. If they
      // ever differ, that is a bug worth seeing, not hiding.
      cached_balance_minor: Number(account.balance_minor || 0),
      replayed_balance_minor: replay.balance_minor,
      consistent: Number(account.balance_minor || 0) === replay.balance_minor,
    });
  }

  const query = {};
  for (const k of ['contest_id', 'funding_id', 'payout_id', 'withdrawal_id', 'txn_type']) {
    if (b[k]) query[k] = b[k];
  }
  const txns = await svc.entities.LedgerTransaction.filter(query, '-created_date', Number(b.limit) || 100).catch(() => []);
  const out = [];
  for (const t of txns) {
    const entries = await svc.entities.LedgerEntry.filter({ transaction_id: t.id }, 'sequence', 20).catch(() => []);
    const d = entries.filter((e) => e.direction === 'DEBIT').reduce((a, e) => a + Number(e.amount_minor), 0);
    const c = entries.filter((e) => e.direction === 'CREDIT').reduce((a, e) => a + Number(e.amount_minor), 0);
    out.push({
      ...t,
      entries: entries.map((e) => ({
        id: e.id, account_code: e.account_code, account_class: e.account_class,
        entry_type: e.entry_type, direction: e.direction, amount_minor: e.amount_minor,
        balance_after_minor: e.balance_after_minor,
      })),
      balanced: d === c,
    });
  }

  const accounts = await svc.entities.LedgerAccount.filter({}, '-created_date', 500).catch(() => []);
  return json({
    transactions: out,
    accounts: accounts.map((a) => ({
      id: a.id, account_code: a.account_code, account_class: a.account_class,
      label: a.label, owner_type: a.owner_type, owner_id: a.owner_id,
      currency: a.currency, balance_minor: Number(a.balance_minor || 0),
    })),
  });
}

// ── financeReconcile ────────────────────────────────────────────────────────
/**
 * Compare the ledger with itself and with what was reported.
 *
 * Three checks, each of which would catch a real class of bug: every
 * transaction must balance, every account's cached balance must equal its
 * replay, and money that was verified must have a ledger entry behind it.
 */
export async function financeReconcile(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.RECONCILE); if (denied) return denied;
  const svc = ctx.svc;

  const [txns, accounts, fundings, withdrawals] = await Promise.all([
    svc.entities.LedgerTransaction.filter({}, '-created_date', 1000).catch(() => []),
    svc.entities.LedgerAccount.filter({}, '-created_date', 500).catch(() => []),
    svc.entities.ContestFunding.filter({}, '-created_date', 1000).catch(() => []),
    svc.entities.WithdrawalRequest.filter({}, '-created_date', 1000).catch(() => []),
  ]);

  const unbalanced = [];
  for (const t of txns) {
    const entries = await svc.entities.LedgerEntry.filter({ transaction_id: t.id }, 'sequence', 50).catch(() => []);
    const d = entries.filter((e) => e.direction === 'DEBIT').reduce((a, e) => a + Number(e.amount_minor), 0);
    const c = entries.filter((e) => e.direction === 'CREDIT').reduce((a, e) => a + Number(e.amount_minor), 0);
    if (d !== c) unbalanced.push({ id: t.id, reference: t.reference, debits: d, credits: c });
  }

  const drifted = [];
  for (const a of accounts) {
    const replay = await replayBalance(svc, a);
    if (replay.balance_minor !== Number(a.balance_minor || 0)) {
      drifted.push({ id: a.id, account_code: a.account_code, cached: Number(a.balance_minor || 0), replayed: replay.balance_minor });
    }
  }

  const unbooked = fundings
    .filter((f) => FUNDING_MONEY_RECEIVED.includes(f.status) && !f.ledger_txn_id)
    .map((f) => ({ id: f.id, reference: f.reference, contest_id: f.contest_id, amount_minor: f.total_amount_minor }));

  const unbookedPayouts = withdrawals
    .filter((w) => w.status === WITHDRAWAL.PAID && !w.paid_txn_id)
    .map((w) => ({ id: w.id, reference: w.reference, amount_minor: w.amount_minor }));

  const recons = await svc.entities.ReconciliationRecord.filter({}, '-created_date', 200).catch(() => []);

  await auditFinance(svc, {
    actorId: ctx.user.id, action: 'RECONCILIATION_RUN', permission: FINANCE_PERMISSION.RECONCILE,
    status: 'success', reason: 'Reconciliation run',
    result: { transactions: txns.length, unbalanced: unbalanced.length, drifted: drifted.length, unbooked: unbooked.length + unbookedPayouts.length },
  });

  return json({
    checked_at: nowIso(),
    transactions_checked: txns.length,
    accounts_checked: accounts.length,
    unbalanced_transactions: unbalanced,
    drifted_accounts: drifted,
    verified_funding_without_ledger: unbooked,
    paid_withdrawals_without_ledger: unbookedPayouts,
    healthy: unbalanced.length === 0 && drifted.length === 0 && unbooked.length === 0 && unbookedPayouts.length === 0,
    records: recons.map((r) => ({
      id: r.id, reference: r.reference, status: r.status, entity_type: r.entity_type,
      internal_ref: r.internal_ref, expected_amount_minor: r.expected_amount_minor,
      actual_amount_minor: r.actual_amount_minor, difference_minor: r.difference_minor,
      mismatch_summary: r.mismatch_summary, resolution_notes: r.resolution_notes,
      bank_reference: r.bank_reference, checked_at: r.checked_at, resolved_at: r.resolved_at,
      created_date: r.created_date,
    })),
  });
}

export async function financeResolveReconciliation(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.RECONCILE); if (denied) return denied;
  const { reconciliation_id: id, notes } = ctx.body || {};
  if (!id) return err('RECONCILIATION_ID_REQUIRED', 'reconciliation_id is required.');
  if (!notes || String(notes).trim().length < 10) {
    return err('NOTES_REQUIRED', 'Explain how this difference was resolved (at least 10 characters).');
  }
  const rec = await ctx.svc.entities.ReconciliationRecord.get(id).catch(() => null);
  if (!rec) return err('RECONCILIATION_NOT_FOUND', 'Reconciliation record not found.', 404);

  const updated = await ctx.svc.entities.ReconciliationRecord.update(id, {
    status: RECON.RESOLVED,
    resolution_notes: String(notes).slice(0, 1000),
    resolved_by: ctx.user.id,
    resolved_at: nowIso(),
  });
  await auditFinance(ctx.svc, {
    actorId: ctx.user.id, action: 'RECONCILIATION_RESOLVED', permission: FINANCE_PERMISSION.RECONCILE,
    status: 'success', reason: notes, result: { reconciliation_id: id, previous_status: rec.status },
  });
  return json({ reconciliation: updated });
}

// ── financeRefund ───────────────────────────────────────────────────────────
/**
 * Refund verified funding. Two explicit steps:
 *   action=approve → money leaves the client pot into refund clearing
 *   action=record  → the transfer was made; clearing settles against the bank
 */
export async function financeRefund(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.REFUND); if (denied) return denied;
  const b = ctx.body || {};
  const id = b.funding_id;
  const action = b.action || 'approve';
  if (!id) return err('FUNDING_ID_REQUIRED', 'funding_id is required.');
  if (!b.reason || String(b.reason).trim().length < 10) {
    return err('REASON_REQUIRED', 'Give a reason for this refund (at least 10 characters).');
  }

  const out = await withTransaction(async (tx) => {
    const svc = serviceClient(tx);
    await lockRecord(tx, id);
    const funding = await svc.entities.ContestFunding.get(id).catch(() => null);
    if (!funding) return { conflict: err('FUNDING_NOT_FOUND', 'Funding request not found.', 404) };
    const contest = await svc.entities.Contest.get(funding.contest_id).catch(() => null);

    if (action === 'approve') {
      if (!FUNDING_MONEY_RECEIVED.includes(funding.status)) {
        return { conflict: err('NOT_REFUNDABLE', `Only funding where money was received can be refunded (this is ${funding.status}).`, 409) };
      }
      // Once a creator has won, the prize is owed to them. Refunding it would be
      // taking money back out of someone else's pocket.
      if (contest?.winner_user_id) {
        return { conflict: err('WINNER_SELECTED', 'A winner has been finalised for this contest, so the prize can no longer be refunded.', 409) };
      }

      const committed = await balanceOf(svc, {
        accountClass: ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT, currency: funding.currency, subjectId: funding.contest_id,
      });
      if (committed.balance_minor > 0) {
        await releasePrize(svc, { funding, prizeMinor: committed.balance_minor, actorId: ctx.user.id, reason: b.reason });
      }

      const refundFees = b.refund_fees === true;
      const available = await balanceOf(svc, {
        accountClass: ACCOUNT_CLASS.CLIENT_FUNDS, currency: funding.currency, subjectId: funding.brand_id,
      });
      const clientPart = b.amount != null ? toMinor(Number(b.amount), funding.currency) : available.balance_minor;
      if (clientPart <= 0) return { conflict: err('NOTHING_TO_REFUND', 'There is no client balance to refund.', 422) };
      if (clientPart > available.balance_minor) {
        return { conflict: err('EXCEEDS_BALANCE', `The ledger shows ${toMajor(available.balance_minor, funding.currency)} available to refund, not ${toMajor(clientPart, funding.currency)}.`, 422) };
      }

      const posted = await approveRefund(svc, { funding, amountMinor: clientPart, refundFees, actorId: ctx.user.id });
      const saved = await svc.entities.ContestFunding.update(funding.id, {
        status: assertFundingTransition(funding.status, FUNDING.REFUND_PENDING),
        refund_requested_at: nowIso(),
        refund_reason: String(b.reason).slice(0, 500),
        refund_amount_minor: posted.transaction.amount_minor,
      });
      await svc.entities.Contest.update(funding.contest_id, { funding_status: FUNDING.REFUND_PENDING }).catch(() => null);
      return { funding: saved, txn: posted.transaction, approved: true };
    }

    if (action === 'record') {
      if (funding.status !== FUNDING.REFUND_PENDING) {
        return { conflict: err('NOT_PENDING_REFUND', `This funding is ${funding.status}; approve the refund first.`, 409) };
      }
      const ref = String(b.payment_reference || '').trim();
      if (ref.length < 4) return { conflict: err('PAYMENT_REFERENCE_REQUIRED', 'Enter the bank reference for the refund transfer.') };

      const amount = Number(funding.refund_amount_minor || 0);
      const posted = await recordRefundPaid(svc, { funding, amountMinor: amount, actorId: ctx.user.id });
      const saved = await svc.entities.ContestFunding.update(funding.id, {
        status: assertFundingTransition(funding.status, FUNDING.REFUNDED),
        refunded_at: nowIso(), refunded_by: ctx.user.id, refund_reference: ref,
      });
      await svc.entities.Contest.update(funding.contest_id, { funding_status: FUNDING.REFUNDED, funding_id: null }).catch(() => null);
      return { funding: saved, txn: posted.transaction, recorded: true, amount, reference: ref };
    }

    return { conflict: err('UNKNOWN_ACTION', "action must be 'approve' or 'record'.") };
  }).catch((e) => ({ conflict: err(e?.code || 'REFUND_FAILED', e?.message || 'The refund could not be completed. Nothing was changed.', e?.status || 500) }));

  if (out.conflict) return out.conflict;

  await projectBalance(ctx.svc, { userId: out.funding.brand_id, currency: out.funding.currency, role: 'client' }).catch(() => null);
  await auditFinance(ctx.svc, {
    actorId: ctx.user.id,
    action: out.approved ? 'REFUND_APPROVED' : 'REFUND_COMPLETED',
    permission: FINANCE_PERMISSION.REFUND,
    status: 'success', reason: b.reason, subjectUserId: out.funding.brand_id,
    result: {
      funding_id: out.funding.id, reference: out.funding.reference,
      amount_minor: out.funding.refund_amount_minor, currency: out.funding.currency,
      txn: out.txn.reference,
      payment_reference_last4: out.reference ? String(out.reference).slice(-4) : null,
    },
  });

  if (out.recorded) {
    const client = await ctx.svc.entities.User.get(out.funding.brand_id).catch(() => null);
    if (client?.email) {
      sendEmail({
        to: client.email,
        subject: `RazeKit — refund transferred (${out.funding.reference})`,
        body: [
          `Hi ${displayName(client)},`,
          '',
          `We have transferred your refund of ${toMajor(out.amount, out.funding.currency)} ${out.funding.currency}.`,
          `Bank reference: ${out.reference}`,
          '',
          `Reason: ${b.reason}`,
        ].join('\n'),
      }).catch(() => null);
    }
  }

  return json({ funding: publicFunding(out.funding), ledger_txn: out.txn.reference });
}

// ── financeAdjust / reversal ────────────────────────────────────────────────
export async function financeAdjust(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.ADJUST); if (denied) return denied;
  const b = ctx.body || {};

  if (b.reverse_transaction_id) {
    if (!b.reason || String(b.reason).trim().length < 10) {
      return err('REASON_REQUIRED', 'Explain why this transaction is being reversed (at least 10 characters).');
    }
    try {
      const posted = await withTransaction(async (tx) => reverseTransaction(serviceClient(tx), {
        transactionId: b.reverse_transaction_id, reason: b.reason, actorId: ctx.user.id, actorRole: 'admin',
      }));
      await auditFinance(ctx.svc, {
        actorId: ctx.user.id, action: 'LEDGER_ADJUSTMENT', permission: FINANCE_PERMISSION.ADJUST,
        status: 'success', reason: b.reason,
        result: { kind: 'reversal', original: b.reverse_transaction_id, reversal: posted.transaction.reference },
      });
      return json({ transaction: posted.transaction, replayed: Boolean(posted.replayed) });
    } catch (e) {
      return err(e.code || 'REVERSAL_FAILED', e.message || 'Could not reverse the transaction.', e.status || 400);
    }
  }

  if (!Array.isArray(b.lines) || b.lines.length < 2) {
    return err('LINES_REQUIRED', 'An adjustment needs at least one debit and one credit line.');
  }
  try {
    const posted = await withTransaction(async (tx) => postAdjustment(serviceClient(tx), {
      currency: b.currency || 'INR', lines: b.lines, reason: b.reason,
      actorId: ctx.user.id, contestId: b.contest_id || null, idempotencyKey: b.idempotency_key || null,
    }));
    await auditFinance(ctx.svc, {
      actorId: ctx.user.id, action: 'LEDGER_ADJUSTMENT', permission: FINANCE_PERMISSION.ADJUST,
      status: 'success', reason: b.reason, result: { txn: posted.transaction.reference, lines: b.lines.length },
    });
    return json({ transaction: posted.transaction, entries: posted.entries });
  } catch (e) {
    await auditFinance(ctx.svc, {
      actorId: ctx.user.id, action: 'LEDGER_ADJUSTMENT', permission: FINANCE_PERMISSION.ADJUST,
      status: 'error', reason: e.message, result: {},
    });
    return err(e.code || 'ADJUSTMENT_FAILED', e.message || 'The adjustment was refused.', e.status || 400);
  }
}

// ── financeAudit ────────────────────────────────────────────────────────────
/** The financial audit trail. Never deleted, only appended to. */
export async function financeAudit(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.VIEW); if (denied) return denied;
  const svc = ctx.svc;
  const b = ctx.body || {};

  const FINANCIAL_ACTIONS = new Set([
    'FUNDING_REPORTED', 'FUNDING_VERIFIED', 'FUNDING_PARTIAL_RECEIVED', 'FUNDING_REJECTED',
    'FUNDING_INFORMATION_REQUESTED', 'FUNDING_CANCELLED', 'FUNDING_INSTRUCTIONS_VIEWED',
    'FUNDING_DUPLICATE_REFERENCE_BLOCKED',
    'PRIZE_RESERVED', 'PRIZE_RELEASED',
    'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_UNDER_REVIEW', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED',
    'WITHDRAWAL_ON_HOLD', 'WITHDRAWAL_CANCELLED', 'WITHDRAWAL_BANK_DETAILS_VIEWED',
    'TRANSFER_SENT', 'PAYOUT_PAID', 'PAYOUT_FAILED', 'PAYOUT_REVERSED',
    'REFUND_APPROVED', 'REFUND_COMPLETED', 'LEDGER_ADJUSTMENT',
    'RECONCILIATION_RUN', 'RECONCILIATION_RESOLVED',
    'PAYMENT_METHOD_ENABLED', 'PAYMENT_METHOD_DISABLED', 'BANK_DETAILS_UPDATED',
    'UPI_ID_UPDATED', 'UPI_QR_UPLOADED', 'UPI_QR_REPLACED', 'UPI_QR_REMOVED',
    'PAYMENT_SETTINGS_UPDATED', 'PAYMENT_SETTINGS_REVEALED', 'PAYMENT_METHOD_TOGGLED',
    'payout.created',
  ]);

  const rows = await svc.entities.AuditLog.filter({}, '-created_date', Number(b.limit) || 500).catch(() => []);
  let events = rows.filter((a) => FINANCIAL_ACTIONS.has(a.action));
  if (b.action) events = events.filter((a) => a.action === b.action);
  if (b.actor) events = events.filter((a) => a.actor === b.actor);
  if (b.user_id) events = events.filter((a) => a.user_id === b.user_id);
  if (b.from) events = events.filter((a) => Date.parse(a.created_date) >= Date.parse(b.from));
  if (b.to) events = events.filter((a) => Date.parse(a.created_date) <= Date.parse(b.to));

  const out = [];
  for (const a of events.slice(0, 300)) {
    let result = {};
    try { result = JSON.parse(a.result || '{}'); } catch {}
    const actor = a.actor && a.actor !== 'system' ? await svc.entities.User.get(a.actor).catch(() => null) : null;
    out.push({
      id: a.id,
      action: a.action,
      actor_id: a.actor,
      actor_name: a.actor === 'system' ? 'RazeKit system' : displayName(actor),
      subject_user_id: a.user_id,
      status: a.status,
      reason: a.reason,
      amount_minor: result.amount_minor ?? result.receipt_amount_minor ?? null,
      currency: result.currency || null,
      reference: result.reference || result.ledger_txn || null,
      entity_id: result.funding_id || result.withdrawal_id || result.payout_id || result.reconciliation_id || null,
      permission: result.permission || null,
      created_date: a.created_date,
    });
  }
  return json({ events: out, count: out.length, actions: [...FINANCIAL_ACTIONS] });
}

// ── financePermissions ──────────────────────────────────────────────────────
export async function financePermissions(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.MANAGE); if (denied) return denied;
  const svc = ctx.svc;
  const b = ctx.body || {};

  if (b.action === 'grant' || b.action === 'revoke') {
    if (!b.user_id || !b.permission) return err('USER_AND_PERMISSION_REQUIRED', 'user_id and permission are required.');
    if (!ALL_FINANCE_PERMISSIONS.includes(b.permission)) return err('UNKNOWN_PERMISSION', `Unknown permission: ${b.permission}`);
    try {
      const row = b.action === 'grant'
        ? await grantPermission(svc, { userId: b.user_id, permission: b.permission, grantedBy: ctx.user.id, note: b.note })
        : await revokePermission(svc, { userId: b.user_id, permission: b.permission, revokedBy: ctx.user.id, note: b.note });
      await auditFinance(svc, {
        actorId: ctx.user.id, action: `finance.permission_${b.action}`, permission: FINANCE_PERMISSION.MANAGE,
        status: 'success', reason: b.note || '', subjectUserId: b.user_id, result: { permission: b.permission },
      });
      return json({ ok: true, permission: row });
    } catch (e) {
      return err(e.code || 'PERMISSION_CHANGE_FAILED', e.message, e.status || 400);
    }
  }

  const rows = await svc.entities.AdminPermission.filter({}, '-created_date', 500).catch(() => []);
  const out = [];
  for (const r of rows) {
    const u = await svc.entities.User.get(r.user_id).catch(() => null);
    out.push({ ...r, user_email: u?.email || null, user_name: displayName(u) });
  }
  return json({ permissions: out, catalog: ALL_FINANCE_PERMISSIONS });
}
