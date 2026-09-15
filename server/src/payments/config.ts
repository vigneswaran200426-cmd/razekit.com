// Beta payment configuration and masking. SERVER-ONLY.
//
// RazeKit is in BETA. There is no payment gateway: a brand transfers the prize
// to RazeKit's bank account and a human verifies it. Nothing here may ever
// reach a client bundle, a public endpoint or a log line.
//
// Two functions expose the destination account, and only two:
//   • fundingInstructions()  → the FULL account, to the authenticated brand
//                              that owns an active funding request
//   • maskedBank()           → the masked account, for admin lists and audit
//
// Everything else in the codebase must use maskedBank().
import { config } from '../config.js';

export const PAYMENT_MODE = {
  /** Manual bank transfer, verified by a human. The current mode. */
  MANUAL_BETA: 'MANUAL_BETA',
  /** Automated provider. Not enabled; the adapter boundary is already in place. */
  GATEWAY: 'GATEWAY',
  /** Funding paused. Existing records stay readable; nothing new is accepted. */
  MAINTENANCE: 'MAINTENANCE',
} as const;

export type PaymentMode = (typeof PAYMENT_MODE)[keyof typeof PAYMENT_MODE];

export function paymentMode(): PaymentMode {
  const m = String(config.payments.mode || '').toUpperCase();
  return (PAYMENT_MODE as any)[m] ? (m as PaymentMode) : PAYMENT_MODE.MANUAL_BETA;
}

export function isBeta(): boolean {
  return paymentMode() === PAYMENT_MODE.MANUAL_BETA;
}

export function acceptsNewFunding(): boolean {
  return paymentMode() !== PAYMENT_MODE.MAINTENANCE;
}

/**
 * Mask an account number: six X's then the last five digits
 * (12345678901234 → XXXXXX01234). Length is deliberately NOT preserved so the
 * mask leaks neither the digits nor the account's length.
 */
export function maskAccountNumber(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 5) return 'XXXXXX' + digits;
  return 'XXXXXX' + digits.slice(-5);
}

export function last4(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.slice(-4);
}

/** IFSC is a public branch code, but there is no reason to print it in full in a list. */
export function maskIfsc(raw?: string | null): string {
  const v = String(raw || '').trim().toUpperCase();
  if (v.length < 8) return v ? '****' : '';
  return `${v.slice(0, 4)}***${v.slice(-4)}`;
}

export function maskUpi(raw?: string | null): string {
  const v = String(raw || '').trim();
  const at = v.indexOf('@');
  if (at < 1) return v ? '****' : '';
  const handle = v.slice(0, at);
  const domain = v.slice(at);
  if (handle.length <= 4) return `${handle[0]}***${domain}`;
  return `${handle.slice(0, 2)}${'*'.repeat(Math.max(3, handle.length - 5))}${handle.slice(-3)}${domain}`;
}

/** Safe everywhere: admin UI, audit records, emails, logs. */
export function maskedBank() {
  const b = config.payments.bank;
  return {
    account_name: b.accountName,
    bank_name: b.bankName + (b.branch ? ` - ${b.branch}` : ''),
    account_number_masked: maskAccountNumber(b.accountNumber),
    ifsc_masked: maskIfsc(b.ifsc),
    upi_masked: maskUpi(b.upiId),
  };
}

/**
 * The FULL destination account. The only legitimate caller is the funding
 * instructions handler, after it has confirmed:
 *   • an authenticated user,
 *   • who owns the contest,
 *   • with a funding request in a state that expects a transfer.
 * It is never cached, never logged and never returned in a list response.
 */
export function fullBankForInstructions() {
  const b = config.payments.bank;
  return {
    account_name: b.accountName,
    bank_name: b.bankName,
    branch: b.branch,
    account_number: b.accountNumber,
    ifsc: b.ifsc,
    upi_id: b.upiId,
  };
}

export function bankConfigured(): boolean {
  const b = config.payments.bank;
  return Boolean(b.accountNumber && b.ifsc && b.accountName);
}

export function support() {
  return { phone: config.payments.support.phone, email: config.payments.support.email };
}

export function verificationHours(): number {
  const h = Number(config.payments.verificationHours);
  return Number.isFinite(h) && h > 0 ? h : 24;
}

/**
 * The beta notice. One source of truth for wording that appears on the funding
 * page, in emails and in the API response.
 *
 * It states what is true and nothing more. RazeKit is not a bank, not an escrow
 * service and not a regulated wallet; funding is a manual bank transfer that a
 * person checks. Every word here was chosen to avoid implying otherwise.
 */
export function betaNotice() {
  const h = verificationHours();

  // Payments are parked while an automated provider is being connected. Saying
  // so plainly is better than describing a manual flow nobody can use.
  if (paymentMode() === PAYMENT_MODE.MAINTENANCE) {
    return {
      mode: paymentMode(),
      title: 'Prize funding is not open yet',
      body: [
        'RazeKit is connecting an automated payment provider. Contest funding will open once that is live.',
        'You can create and prepare a contest now; it goes live when its prize has been funded.',
      ],
      disclaimers: [
        'RazeKit is not a bank, an escrow service or a regulated payment institution.',
        'No payment method is currently accepting funds.',
      ],
      support: support(),
    };
  }

  return {
    mode: paymentMode(),
    title: 'RazeKit is in beta — payments are handled manually',
    body: [
      'Prize funding is currently a direct bank transfer to RazeKit. There is no automated payment gateway connected yet.',
      `After you transfer the amount and report it, a member of the RazeKit team checks it against our bank records. Verification is usually completed within ${h} hours on working days.`,
      'Your contest goes live only after that check succeeds. Nothing is confirmed automatically.',
    ],
    disclaimers: [
      'RazeKit is not a bank, an escrow service or a regulated payment institution.',
      'Funds are held in an ordinary business bank account, not a segregated client account.',
      'Payouts to creators are made manually by bank transfer after a winner is finalised.',
      'Verification and payout times are targets, not guarantees.',
    ],
    support: support(),
  };
}
