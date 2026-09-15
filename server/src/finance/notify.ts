// @ts-nocheck
// Finance notifications.
//
// Two audiences, deliberately different:
//
//   ADMINS get told when something needs a human — a reported transfer, a
//   withdrawal request. Without this the manual beta silently stalls: a client
//   pays, nobody looks, and the contest never goes live.
//
//   USERS get told what actually happened to their money, in plain language,
//   using their real name and the real contest title. "Brand" and "Creator" are
//   placeholders, not names, and a message about ₹50,000 is the wrong place for
//   a placeholder.
//
// Every notification is deduplicated on a stable key, so a retried handler or a
// double click does not produce two identical alerts.
import { sendEmail } from '../integrations/email.js';

/** Everyone who should see finance alerts: platform admins plus finance.view holders. */
export async function financeRecipients(svc) {
  const admins = await svc.entities.User.filter({ role: 'admin' }, '-created_date', 50).catch(() => []);
  const grants = await svc.entities.AdminPermission
    .filter({ permission: 'finance.view', active: true }, '-created_date', 50).catch(() => []);

  const byId = new Map();
  for (const a of admins) byId.set(a.id, a);
  for (const g of grants) {
    if (byId.has(g.user_id)) continue;
    const u = await svc.entities.User.get(g.user_id).catch(() => null);
    if (u) byId.set(u.id, u);
  }
  return [...byId.values()];
}

/**
 * Create a notification unless an identical one already exists.
 *
 * `dedupeKey` goes into the title-independent `related_post_id` slot so the
 * check is a single indexed lookup rather than a scan of recent rows.
 */
async function notifyOnce(svc, { recipientId, type, title, description, contestId, dedupeKey, actorName }) {
  if (!recipientId) return null;
  if (dedupeKey) {
    const existing = await svc.entities.Notification
      .filter({ recipient_user_id: recipientId, related_post_id: dedupeKey }, '-created_date', 1)
      .catch(() => []);
    if (existing.length) return existing[0];
  }
  return svc.entities.Notification.create({
    type,
    title,
    description,
    recipient_user_id: recipientId,
    contest_id: contestId || null,
    actor_name: actorName || null,
    related_post_id: dedupeKey || null,
  }).catch(() => null);
}

/** A person's display name, falling back to their email local part — never "Brand". */
export function displayName(user) {
  if (!user) return 'A RazeKit user';
  if (user.full_name && String(user.full_name).trim()) return String(user.full_name).trim();
  const email = String(user.email || '');
  return email.includes('@') ? email.split('@')[0] : 'A RazeKit user';
}

// ── Admin alerts ────────────────────────────────────────────────────────────

/** "New funding verification request from Acme Studios" */
export async function notifyAdminsFundingReported(svc, { funding, client, contest }) {
  const name = displayName(client);
  const recipients = await financeRecipients(svc);
  const amount = (Number(funding.reported_amount_minor || funding.total_amount_minor) / 100).toLocaleString('en-IN');
  for (const admin of recipients) {
    await notifyOnce(svc, {
      recipientId: admin.id,
      type: 'payment_received',
      title: `New funding verification request from ${name}`,
      description: `₹${amount} reported for "${contest?.title || funding.reference}". Reference ${funding.reference}. Check it against the bank statement before verifying.`,
      contestId: funding.contest_id,
      dedupeKey: `admin:funding_reported:${funding.id}:${funding.reported_reference || ''}`,
      actorName: name,
    });
  }
  const emails = recipients.map((a) => a.email).filter(Boolean);
  if (emails.length) {
    sendEmail({
      to: emails,
      subject: `RazeKit — funding verification needed (${funding.reference})`,
      body: [
        `${name} reported a transfer of ₹${amount}.`,
        '',
        `Contest: ${contest?.title || funding.contest_id}`,
        `Funding reference: ${funding.reference}`,
        `Bank reference reported: ${funding.reported_reference || '—'}`,
        '',
        'Open Admin → Finance → Deposit Verification and check this against the bank statement.',
        'Nothing is credited until you verify it.',
      ].join('\n'),
    }).catch(() => null);
  }
  return recipients.length;
}

/** "New withdrawal request from Priya Nair" */
export async function notifyAdminsWithdrawalRequested(svc, { withdrawal, creator }) {
  const name = displayName(creator);
  const recipients = await financeRecipients(svc);
  const amount = (Number(withdrawal.amount_minor) / 100).toLocaleString('en-IN');
  for (const admin of recipients) {
    await notifyOnce(svc, {
      recipientId: admin.id,
      type: 'payment_received',
      title: `New withdrawal request from ${name}`,
      description: `₹${amount} requested. Reference ${withdrawal.reference}. Review the request and bank details before approving.`,
      dedupeKey: `admin:withdrawal_requested:${withdrawal.id}`,
      actorName: name,
    });
  }
  const emails = recipients.map((a) => a.email).filter(Boolean);
  if (emails.length) {
    sendEmail({
      to: emails,
      subject: `RazeKit — withdrawal request from ${name} (${withdrawal.reference})`,
      body: [
        `${name} requested a withdrawal of ₹${amount}.`,
        '',
        `Reference: ${withdrawal.reference}`,
        `Account: ${withdrawal.bank_account_masked || '—'}`,
        '',
        'Open Admin → Finance → Withdrawal Requests to review it.',
        'The amount is reserved but has NOT left the creator’s balance — that happens only when you confirm the transfer.',
      ].join('\n'),
    }).catch(() => null);
  }
  return recipients.length;
}

// ── User messages ───────────────────────────────────────────────────────────

export async function notifyClientFundingVerified(svc, { funding, client, contest, amountMinor }) {
  const amount = (Number(amountMinor ?? funding.total_amount_minor) / 100).toLocaleString('en-IN');
  await notifyOnce(svc, {
    recipientId: funding.brand_id,
    type: 'payment_received',
    title: 'Your contest funding has been verified',
    description: `We matched your ₹${amount} transfer for "${contest?.title || funding.reference}". Your contest is live.`,
    contestId: funding.contest_id,
    dedupeKey: `client:funding_verified:${funding.id}`,
  });
  if (client?.email) {
    sendEmail({
      to: client.email,
      subject: `RazeKit — contest funding verified (${funding.reference})`,
      body: [
        `Hi ${displayName(client)},`,
        '',
        `We checked our bank records and matched your transfer of ₹${amount}.`,
        `Contest: ${contest?.title || funding.contest_id}`,
        `Reference: ${funding.reference}`,
        '',
        'Your contest is now live and creators can enter.',
      ].join('\n'),
    }).catch(() => null);
  }
}

export async function notifyClientFundingRejected(svc, { funding, client, reason }) {
  await notifyOnce(svc, {
    recipientId: funding.brand_id,
    type: 'payment_received',
    title: 'We could not verify your transfer',
    description: String(reason).slice(0, 240),
    contestId: funding.contest_id,
    dedupeKey: `client:funding_rejected:${funding.id}:${funding.reported_reference || ''}`,
  });
  if (client?.email) {
    sendEmail({
      to: client.email,
      subject: `RazeKit — we could not verify your transfer (${funding.reference})`,
      body: [
        `Hi ${displayName(client)},`,
        '',
        'We checked our bank records and could not match the transfer you reported.',
        '',
        `Reason: ${reason}`,
        '',
        'You can correct the details and report the transfer again from your contest page.',
      ].join('\n'),
    }).catch(() => null);
  }
}

export async function notifyCreatorWithdrawal(svc, { withdrawal, creator, stage, extra = {} }) {
  const amount = (Number(withdrawal.amount_minor) / 100).toLocaleString('en-IN');
  const name = displayName(creator);

  const COPY = {
    requested: {
      title: 'Withdrawal requested',
      body: `We have your request for ₹${amount}. The amount is held on your RazeKit balance while the finance team reviews it.`,
    },
    approved: {
      title: 'Withdrawal approved',
      body: `Your withdrawal of ₹${amount} was approved. The bank transfer has not been made yet — we will confirm when it has.`,
    },
    processing: {
      title: 'Withdrawal processing',
      body: `We are making the bank transfer for ₹${amount}.`,
    },
    paid: {
      title: 'Your payout has been processed',
      body: `We transferred ₹${amount} to your bank account. Your transfer reference is available in your account.`,
    },
    failed: {
      title: 'Withdrawal could not be completed',
      body: `The bank transfer for ₹${amount} did not go through. Your balance was not reduced. ${extra.reason || ''}`.trim(),
    },
    rejected: {
      title: 'Withdrawal needs attention',
      body: String(extra.reason || 'Please check your details and request again.'),
    },
    on_hold: {
      title: 'Withdrawal on hold',
      body: String(extra.reason || 'Your withdrawal is on hold. RazeKit will contact you.'),
    },
    cancelled: {
      title: 'Withdrawal cancelled',
      body: `Your request for ₹${amount} was cancelled and the amount returned to your available balance.`,
    },
  };
  const copy = COPY[stage] || COPY.requested;

  await notifyOnce(svc, {
    recipientId: withdrawal.user_id,
    type: 'payment_received',
    title: copy.title,
    description: copy.body,
    dedupeKey: `creator:withdrawal_${stage}:${withdrawal.id}`,
  });

  if (creator?.email && ['approved', 'paid', 'failed', 'rejected'].includes(stage)) {
    sendEmail({
      to: creator.email,
      subject: `RazeKit — ${copy.title.toLowerCase()} (${withdrawal.reference})`,
      body: [
        `Hi ${name},`,
        '',
        copy.body,
        '',
        `Reference: ${withdrawal.reference}`,
        extra.payment_reference ? `Bank reference: ${extra.payment_reference}` : '',
        withdrawal.bank_account_masked ? `Account: ${withdrawal.bank_account_masked}` : '',
        '',
        stage === 'paid' ? 'Bank transfers usually appear within one to two working days.' : '',
      ].filter(Boolean).join('\n'),
    }).catch(() => null);
  }
}

export { notifyOnce };
