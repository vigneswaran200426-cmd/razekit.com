// @ts-nocheck
import { visualAssetRequest, visualAssetAdmin, visualAssetWorker } from './visual.js';
import { winnerFinalize } from './winner.js';
import { trackingLinkCreate, trackingLinkList } from './tracking.js';

// All handlers (name → fn(ctx)).
// NOTE: payment/payout/reconciliation handlers were removed with the payment
// gateways. The wallet/escrow/fees/payout DOMAIN (money/*.ts + entities) remains.
export const HANDLERS = {
  visualAssetRequest, visualAssetAdmin, visualAssetWorker,
  winnerFinalize,
  trackingLinkCreate, trackingLinkList,
};

// Functions callable over HTTP via base44.functions.invoke(name, payload).
// visualAssetWorker is intentionally NOT here — it runs only from the scheduler.
export const HTTP_ALLOWED = new Set([
  'visualAssetRequest', 'visualAssetAdmin',
  // winnerFinalize does its own owner/admin check and is the ONLY way a winner
  // is set, so it is exposed to authenticated callers rather than admin-only.
  'winnerFinalize',
  'trackingLinkCreate', 'trackingLinkList',
]);

// Require platform admin at the route boundary (handlers also re-check).
export const ADMIN_ONLY = new Set(['visualAssetAdmin']);
