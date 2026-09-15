// @ts-nocheck
// The MANUAL_BETA adapter.
//
// It plugs into the same boundary a real gateway will use (payments/gateway.ts),
// so switching to an automated provider later means writing one adapter — not
// rewriting Contest, Winner, Tracker, Ledger, Admin, Finance or Audit.
//
// What makes this adapter different from a gateway is the one thing that must
// never change: it CANNOT confirm a payment. `verifyPayment` always answers
// "a human must check this". There is no code path in RazeKit that turns a
// brand's claim into money.
import { defineAdapter, registerAdapter, PAYMENT_STATE } from './gateway.js';
import { bankConfigured, verificationHours, support, isBeta } from './config.js';
import { FUNDING } from './states.js';

/** Internal funding status → the normalized payment state used by the core. */
export function fundingToPaymentState(status) {
  switch (status) {
    case FUNDING.FUNDING_REQUIRED: return PAYMENT_STATE.CREATED;
    case FUNDING.PAYMENT_INSTRUCTIONS_SHOWN: return PAYMENT_STATE.REQUIRES_ACTION;
    case FUNDING.TRANSFER_REPORTED:
    case FUNDING.PENDING_VERIFICATION: return PAYMENT_STATE.PROCESSING;
    case FUNDING.VERIFIED: return PAYMENT_STATE.PAID;
    case FUNDING.REJECTED: return PAYMENT_STATE.FAILED;
    case FUNDING.CANCELLED: return PAYMENT_STATE.CANCELLED;
    case FUNDING.REFUND_PENDING: return PAYMENT_STATE.PROCESSING;
    case FUNDING.REFUNDED: return PAYMENT_STATE.REFUNDED;
    default: return PAYMENT_STATE.PENDING;
  }
}

export const manualBetaAdapter = defineAdapter({
  id: 'manual_beta',
  label: 'Manual bank transfer (beta)',
  capabilities: {
    // It can take money — through a bank, with a person in the loop.
    supportsPayment: true,
    supportsRefund: true,
    supportsPartialRefund: true,
    supportsPayout: true,
    // There is no provider to call back, so there is no webhook to trust.
    supportsWebhook: false,
    supportedCurrencies: ['INR'],
    // Declared honestly so the core never promises speed it cannot deliver.
    manualVerification: true,
    instantConfirmation: false,
  },

  configured: () => bankConfigured(),

  /**
   * "Creating a payment" here means preparing instructions. No external call is
   * made, no order is reserved, and nothing about this implies the money moved.
   */
  createPayment: async ({ amountMinor, currency, reference }) => ({
    provider: 'manual_beta',
    provider_order_id: reference,
    provider_payment_id: null,
    state: PAYMENT_STATE.REQUIRES_ACTION,
    requires_manual_verification: true,
    expected_amount_minor: amountMinor,
    currency,
    verification_window_hours: verificationHours(),
    support: support(),
  }),

  /**
   * A gateway would answer this from the provider. RazeKit cannot: the only
   * source of truth is the bank statement, which a person reads.
   *
   * Returning PROCESSING (never PAID) is deliberate — an accidental call from
   * future code cannot mark a contest funded.
   */
  verifyPayment: async () => ({
    state: PAYMENT_STATE.PROCESSING,
    verified: false,
    requires_human: true,
    reason: 'MANUAL_VERIFICATION_REQUIRED',
  }),

  /** Refunds are bank transfers made by a person and recorded here afterwards. */
  refund: async () => ({ state: PAYMENT_STATE.PROCESSING, requires_human: true, reason: 'MANUAL_REFUND_REQUIRED' }),

  /** Payouts are bank transfers made by a person and recorded here afterwards. */
  payout: async () => ({ state: 'PAYOUT_PROCESSING', requires_human: true, reason: 'MANUAL_PAYOUT_REQUIRED' }),

  /** No webhook exists, so nothing can pretend to be one. */
  verifyWebhook: () => false,

  mapStatus: (s) => fundingToPaymentState(s),
});

registerAdapter(manualBetaAdapter);

/**
 * True when the platform is running the manual beta flow and the destination
 * account is actually configured. If the account is missing we must say so
 * rather than show a brand an empty transfer form.
 */
export function manualBetaReady() {
  return isBeta() && manualBetaAdapter.configured();
}
