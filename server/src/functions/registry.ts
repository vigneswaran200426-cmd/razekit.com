// @ts-nocheck
import { visualAssetRequest, visualAssetAdmin, visualAssetWorker } from './visual.js';
import { winnerFinalize } from './winner.js';
import { trackingLinkCreate, trackingLinkList } from './tracking.js';
import { winnersShowcase, winnersLeaderboard } from './winners.js';
import { adminOverview, adminContests, adminTraffic, adminUsers, adminAudit } from './admin.js';
import { supportTicketCreate, supportTicketList, supportTicketUpdate, supportAsk, supportKnowledge } from './support.js';
import { trackerCreatorOverview, trackerCreatorContests, trackerBrandOverview, trackerBrandCampaigns, trackerCampaignDetail } from './tracker.js';

// All handlers (name → fn(ctx)).
// NOTE: payment/payout/reconciliation handlers were removed with the payment
// gateways. The wallet/escrow/fees/payout DOMAIN (money/*.ts + entities) remains.
export const HANDLERS = {
  visualAssetRequest, visualAssetAdmin, visualAssetWorker,
  winnerFinalize,
  trackingLinkCreate, trackingLinkList,
  trackerCreatorOverview, trackerCreatorContests,
  trackerBrandOverview, trackerBrandCampaigns, trackerCampaignDetail,
  supportTicketCreate, supportTicketList, supportTicketUpdate, supportAsk, supportKnowledge,
  adminOverview, adminContests, adminTraffic, adminUsers, adminAudit,
  winnersShowcase, winnersLeaderboard,
};

// Functions callable over HTTP via base44.functions.invoke(name, payload).
// visualAssetWorker is intentionally NOT here — it runs only from the scheduler.
export const HTTP_ALLOWED = new Set([
  'visualAssetRequest', 'visualAssetAdmin',
  // winnerFinalize does its own owner/admin check and is the ONLY way a winner
  // is set, so it is exposed to authenticated callers rather than admin-only.
  'winnerFinalize',
  'trackingLinkCreate', 'trackingLinkList',
  // Tracker is read-only; each handler enforces its own ownership check.
  'trackerCreatorOverview', 'trackerCreatorContests',
  'trackerBrandOverview', 'trackerBrandCampaigns', 'trackerCampaignDetail',
  // Support: ownership is taken from the session, admin actions re-check role.
  'supportTicketCreate', 'supportTicketList', 'supportTicketUpdate', 'supportAsk', 'supportKnowledge',
  // Admin control center — gated below AND re-checked inside each handler.
  'adminOverview', 'adminContests', 'adminTraffic', 'adminUsers', 'adminAudit',
  // Public winner results + leaderboard (finalized data only).
  'winnersShowcase', 'winnersLeaderboard',
]);

// Callable WITHOUT authentication. Only finalized, intentionally public data:
// winning work and the leaderboard (a visitor can browse these before joining).
// Everything else stays behind requireAuth.
export const PUBLIC_FUNCTIONS = new Set(['winnersShowcase', 'winnersLeaderboard']);

// Require platform admin at the route boundary (handlers also re-check).
export const ADMIN_ONLY = new Set([
  'visualAssetAdmin', 'supportTicketUpdate',
  'adminOverview', 'adminContests', 'adminTraffic', 'adminUsers', 'adminAudit',
]);
