// @ts-nocheck
import { paymentQuote, paymentCreate, paymentConfirm, payoutCreate } from './payments.js';
import { visualAssetRequest, visualAssetAdmin, visualAssetWorker } from './visual.js';
import { moneyReconciliation } from './reconciliation.js';

// All handlers (name → fn(ctx)).
export const HANDLERS = {
  paymentQuote, paymentCreate, paymentConfirm, payoutCreate,
  visualAssetRequest, visualAssetAdmin, visualAssetWorker,
  moneyReconciliation,
};

// Functions callable over HTTP via base44.functions.invoke(name, payload).
// visualAssetWorker is intentionally NOT here — it runs only from the scheduler.
export const HTTP_ALLOWED = new Set([
  'paymentQuote', 'paymentCreate', 'paymentConfirm', 'payoutCreate',
  'visualAssetRequest', 'visualAssetAdmin', 'moneyReconciliation',
]);

// Require platform admin at the route boundary (handlers also re-check).
export const ADMIN_ONLY = new Set(['payoutCreate', 'visualAssetAdmin', 'moneyReconciliation']);
