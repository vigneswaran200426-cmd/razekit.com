// @ts-nocheck
import { visualAssetRequest, visualAssetAdmin, visualAssetWorker } from './visual.js';

// All handlers (name → fn(ctx)).
// NOTE: payment/payout/reconciliation handlers were removed with the payment
// gateways. The wallet/escrow/fees/payout DOMAIN (money/*.ts + entities) remains.
export const HANDLERS = {
  visualAssetRequest, visualAssetAdmin, visualAssetWorker,
};

// Functions callable over HTTP via base44.functions.invoke(name, payload).
// visualAssetWorker is intentionally NOT here — it runs only from the scheduler.
export const HTTP_ALLOWED = new Set([
  'visualAssetRequest', 'visualAssetAdmin',
]);

// Require platform admin at the route boundary (handlers also re-check).
export const ADMIN_ONLY = new Set(['visualAssetAdmin']);
