// @ts-nocheck
// Gateway abstraction (spec 10).
//
// The payment CORE is RazeKit's permanent asset; a gateway is replaceable.
// Core code must depend on normalized events (PaymentVerified, RefundCompleted,
// PayoutCompleted) and never on provider-specific statuses or conditionals.
// All provider code lives behind this boundary, in exactly one place.

// Normalized internal payment states (spec 9). Providers map INTO these.
export const PAYMENT_STATE = {
  CREATED: 'CREATED',
  PENDING: 'PENDING',
  REQUIRES_ACTION: 'REQUIRES_ACTION',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REVERSED: 'REVERSED',
  DISPUTED: 'DISPUTED',
  SETTLED: 'SETTLED',
};

// Only these transitions are legal. Enforced so a webhook or retry can never
// walk a payment backwards (e.g. PAID -> PENDING) or resurrect a dead order.
const TRANSITIONS = {
  CREATED: ['PENDING', 'REQUIRES_ACTION', 'CANCELLED', 'FAILED', 'EXPIRED'],
  PENDING: ['REQUIRES_ACTION', 'PROCESSING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'],
  REQUIRES_ACTION: ['PROCESSING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'],
  PROCESSING: ['PAID', 'FAILED', 'EXPIRED'],
  PAID: ['REFUNDED', 'PARTIALLY_REFUNDED', 'REVERSED', 'DISPUTED', 'SETTLED'],
  SETTLED: ['REFUNDED', 'PARTIALLY_REFUNDED', 'REVERSED', 'DISPUTED'],
  PARTIALLY_REFUNDED: ['REFUNDED', 'DISPUTED', 'REVERSED'],
  DISPUTED: ['REVERSED', 'REFUNDED', 'SETTLED'],
  // Terminal.
  FAILED: [], EXPIRED: [], CANCELLED: [], REFUNDED: [], REVERSED: [],
};

export function canTransition(from, to) {
  if (!from) return to === PAYMENT_STATE.CREATED;
  if (from === to) return true; // idempotent replay of the same event
  return (TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`ILLEGAL_PAYMENT_TRANSITION:${from}->${to}`);
  }
  return to;
}

// Admin-controlled gateway lifecycle (spec 10).
export const GATEWAY_STATE = {
  ACTIVE: 'ACTIVE',             // accepts new operations
  DISABLED: 'DISABLED',         // no new operations; history preserved
  MAINTENANCE: 'MAINTENANCE',   // paused; records still visible
  DEPRECATED: 'DEPRECATED',     // replacement planned; history preserved
};

export function acceptsNewOperations(state) {
  return state === GATEWAY_STATE.ACTIVE;
}

/**
 * Adapter contract. A provider implements this and nothing else in the codebase
 * knows the provider exists.
 *
 * Capabilities are declared, not assumed, so the core can degrade honestly
 * instead of calling an operation the provider does not support.
 */
export function defineAdapter(spec) {
  return {
    id: spec.id,
    label: spec.label,
    capabilities: {
      supportsPayment: false,
      supportsRefund: false,
      supportsPartialRefund: false,
      supportsPayout: false,
      supportsWebhook: false,
      supportedCurrencies: [],
      ...(spec.capabilities || {}),
    },
    configured: spec.configured || (() => false),
    createPayment: spec.createPayment || null,
    verifyPayment: spec.verifyPayment || null,
    refund: spec.refund || null,
    payout: spec.payout || null,
    verifyWebhook: spec.verifyWebhook || null,
    mapStatus: spec.mapStatus || (() => PAYMENT_STATE.PENDING),
  };
}

/**
 * The "no gateway" adapter. This is the ACTIVE adapter today: every payment
 * gateway was removed at the platform owner's instruction, and prize funding /
 * payouts are handled off-platform.
 *
 * It exists so the core has a real, honest implementation to talk to rather
 * than null checks scattered through the codebase. It never fabricates success.
 */
export const offPlatformAdapter = defineAdapter({
  id: 'off_platform',
  label: 'Off-platform (no gateway configured)',
  capabilities: {
    supportsPayment: false,
    supportsRefund: false,
    supportsPartialRefund: false,
    supportsPayout: false,
    supportsWebhook: false,
    supportedCurrencies: [],
  },
  configured: () => true,
});

const REGISTRY = new Map([[offPlatformAdapter.id, offPlatformAdapter]]);

export function registerAdapter(adapter) {
  REGISTRY.set(adapter.id, adapter);
  return adapter;
}

export function listAdapters() {
  return [...REGISTRY.values()].map((a) => ({
    id: a.id, label: a.label, capabilities: a.capabilities, configured: a.configured(),
  }));
}

/**
 * Resolve the active adapter. PAYMENT_GATEWAY selects it; PAYMENT_GATEWAY_STATE
 * controls whether it accepts new operations. Disabling is therefore a single
 * env/admin change that stops new operations while leaving every historical
 * record, ledger entry and payout untouched (spec 10 removal rule).
 */
function defaultAdapterId() {
  // PAYMENT_MODE is the product-level switch; PAYMENT_GATEWAY names a specific
  // provider adapter and wins when set. MANUAL_BETA is a real, configured way
  // to take money (a bank transfer with a person in the loop), so it resolves
  // to its own adapter rather than to "no gateway".
  //
  // The registry check matters: the manual adapter only exists once
  // payments/manualBeta.js has been loaded. If it has not been, the honest
  // answer is "no gateway", not a dangling id — the core must degrade to
  // something that provably cannot take money.
  const mode = String(process.env.PAYMENT_MODE || 'MANUAL_BETA').toUpperCase();
  if (mode === 'MANUAL_BETA' && REGISTRY.has('manual_beta')) return 'manual_beta';
  return offPlatformAdapter.id;
}

export function activeGateway() {
  const id = process.env.PAYMENT_GATEWAY || defaultAdapterId();
  // PAYMENT_MODE=MAINTENANCE pauses new operations everywhere at once while
  // leaving every historical record, ledger entry and payout readable.
  const maintenance = String(process.env.PAYMENT_MODE || '').toUpperCase() === 'MAINTENANCE';
  const state = maintenance
    ? GATEWAY_STATE.MAINTENANCE
    : process.env.PAYMENT_GATEWAY_STATE || GATEWAY_STATE.ACTIVE;
  const adapter = REGISTRY.get(id) || offPlatformAdapter;
  // "Configured" is not the same as "can take money": the off-platform adapter
  // is a valid, configured choice that deliberately supports no payments.
  const canPay = adapter.configured() && adapter.capabilities.supportsPayment === true;
  return {
    adapter,
    state,
    accepts: acceptsNewOperations(state) && canPay,
    reason: !REGISTRY.has(id) ? 'unknown_adapter'
      : !canPay ? 'not_configured'
      : !acceptsNewOperations(state) ? `gateway_${String(state).toLowerCase()}`
      : null,
  };
}
