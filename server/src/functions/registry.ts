// @ts-nocheck
import { visualAssetRequest, visualAssetAdmin, visualAssetWorker } from './visual.js';
import { winnerFinalize } from './winner.js';
import { trackingLinkCreate, trackingLinkList } from './tracking.js';
import { criteriaLibrary, criteriaRecommend, criteriaConfirm, criteriaGet } from './criteria.js';
import { complianceEvaluate, complianceGet, complianceReview } from './compliance.js';
import { winnersShowcase, winnersLeaderboard, creatorPublicProfile } from './winners.js';
import { adminOverview, adminContests, adminTraffic, adminUsers, adminAudit } from './admin.js';
import { supportTicketCreate, supportTicketList, supportTicketUpdate, supportAsk, supportKnowledge } from './support.js';
import { trackerCreatorOverview, trackerCreatorContests, trackerBrandOverview, trackerBrandCampaigns, trackerCampaignDetail } from './tracker.js';
import { fundingQuote, fundingInstructions, fundingReportTransfer, fundingStatus, fundingCancel, paymentModeInfo } from './funding.js';
import {
  financeOverview, financeFundingQueue, financeFundingDetail, financeVerifyFunding,
  financeRejectFunding, financeUserBalances, financePrizeCommitments, financeLedger,
  financeReconcile, financeResolveReconciliation, financeRefund, financeAdjust,
  financeAudit, financePermissions,
} from './finance.js';
import {
  withdrawalRequest, withdrawalCancel, withdrawalList,
  financeWithdrawalQueue, financeWithdrawalDetail, financeWithdrawalReview,
  financeWithdrawalApprove, financeWithdrawalTransferSent, financeWithdrawalConfirm,
  financeWithdrawalFail, financeWithdrawalReverse,
} from './withdrawals.js';
import {
  payoutAccountSave, payoutOverview, payoutRequest,
  financePayoutQueue, financePayoutDetail, financeApprovePayout, financeRecordPayout,
} from './payouts.js';
import { paymentSettingsGet, paymentSettingsUpdate, paymentSettingsQr } from './paymentSettings.js';
import { balanceOverview } from './balance.js';
import { notificationFeed, notificationRead } from './notifications.js';
import { campaignReport, creatorTrackRecord, fraudSignals } from './reports.js';
import {
  scoringConfigGet, scoringConfigSave,
  submissionDisqualify, submissionReinstate, disqualificationList,
} from './scoring.js';
import {
  winnerVerificationStatus, winnerVerificationStart, winnerVerificationSubmit,
  winnerVerificationReview, winnerVerificationQueue,
} from './winnerVerification.js';
import { pollList, pollVote, pollAdminList } from './polls.js';
import {
  uropayAvailability, uropayCreateOrder, uropayOrderStatus, uropaySubmitUtr,
  uropayWebhook, uropayAdminHealth, uropayAdminRefresh,
} from './uropay.js';
import {
  adminUsersList, adminUserDetail, adminUserAction,
  adminTrustSafety, adminTrustAction, adminEnforcement, adminEnforcementAction,
  adminVisualAssets, adminSystemHealth, platformStats,
} from './adminConsole.js';

// All handlers (name → fn(ctx)).
//
// The beta manual payment system spans funding (client side), finance (admin
// control centre), withdrawals (creator side + admin transfer), payouts (per
// contest win) and paymentSettings (configurable instructions). The
// wallet/escrow/fees domain in money/*.ts is reused underneath, and ledger/*.ts
// is the single book of record — there is no second ledger.
export const HANDLERS = {
  visualAssetRequest, visualAssetAdmin, visualAssetWorker,
  winnerFinalize,
  trackingLinkCreate, trackingLinkList,
  trackerCreatorOverview, trackerCreatorContests,
  trackerBrandOverview, trackerBrandCampaigns, trackerCampaignDetail,
  supportTicketCreate, supportTicketList, supportTicketUpdate, supportAsk, supportKnowledge,
  adminOverview, adminContests, adminTraffic, adminUsers, adminAudit,
  winnersShowcase, winnersLeaderboard, creatorPublicProfile,
  criteriaLibrary, criteriaRecommend, criteriaConfirm, criteriaGet,
  complianceEvaluate, complianceGet, complianceReview,

  // Upcoming tournament polls. A separate system from contests on purpose:
  // these have no submissions, no winner and no money.
  pollList, pollVote, pollAdminList,

  // UroPay — India UPI collection. Importing this module is also what
  // registers the adapter with payments/gateway.ts.
  uropayAvailability, uropayCreateOrder, uropayOrderStatus, uropaySubmitUtr,
  uropayWebhook, uropayAdminHealth, uropayAdminRefresh,

  // Beta manual payment — client side.
  fundingQuote, fundingInstructions, fundingReportTransfer, fundingStatus, fundingCancel, paymentModeInfo,
  // Admin → Finance control centre.
  financeOverview, financeFundingQueue, financeFundingDetail, financeVerifyFunding,
  financeRejectFunding, financeUserBalances, financePrizeCommitments, financeLedger,
  financeReconcile, financeResolveReconciliation, financeRefund, financeAdjust,
  financeAudit, financePermissions,
  paymentSettingsGet, paymentSettingsUpdate, paymentSettingsQr,
  // Creator withdrawals + the admin side of the manual transfer.
  withdrawalRequest, withdrawalCancel, withdrawalList,
  financeWithdrawalQueue, financeWithdrawalDetail, financeWithdrawalReview,
  financeWithdrawalApprove, financeWithdrawalTransferSent, financeWithdrawalConfirm,
  financeWithdrawalFail, financeWithdrawalReverse,
  // Per-contest payout eligibility.
  payoutAccountSave, payoutOverview, payoutRequest,
  financePayoutQueue, financePayoutDetail, financeApprovePayout, financeRecordPayout,
  // The RazeKit balance, one definition for every surface.
  balanceOverview,
  // Winner verification. Reachable only AFTER a winner is finalized, and only
  // by that winner — a creator never connects an account to enter or submit.
  winnerVerificationStatus, winnerVerificationStart, winnerVerificationSubmit,
  winnerVerificationReview, winnerVerificationQueue,
  // Admin console — purpose-built endpoints so the operations UI never has to
  // read the generic entity API.
  adminUsersList, adminUserDetail, adminUserAction,
  adminTrustSafety, adminTrustAction, adminEnforcement, adminEnforcementAction,
  adminVisualAssets, adminSystemHealth,
  // Public, honest adoption counts for the homepage.
  platformStats,
};

// Functions callable over HTTP via the /api/functions/:name route.
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
  'adminUsersList', 'adminUserDetail', 'adminUserAction',
  'adminTrustSafety', 'adminTrustAction', 'adminEnforcement', 'adminEnforcementAction',
  'adminVisualAssets', 'adminSystemHealth',
  // Public adoption counts — no personal data, no financial data.
  'platformStats',
  // Public winner results + leaderboard (finalized data only).
  'winnersShowcase', 'winnersLeaderboard', 'creatorPublicProfile',
  // Contest Intelligence. Each handler enforces its own ownership check;
  // criteriaGet is readable by participants so creators can see the rules.
  'criteriaLibrary', 'criteriaRecommend', 'criteriaConfirm', 'criteriaGet',
  'complianceEvaluate', 'complianceGet', 'complianceReview',

  // Funding: every handler re-checks contest ownership. fundingInstructions is
  // the only one that returns the payment details, and it checks three things
  // before doing so.
  'fundingQuote', 'fundingInstructions', 'fundingReportTransfer', 'fundingStatus', 'fundingCancel',
  'paymentModeInfo',
  // UroPay. Each handler re-checks that the caller owns the funding request;
  // uropayWebhook is public because the provider cannot hold a session, and it
  // verifies an HMAC signature instead.
  'uropayAvailability', 'uropayCreateOrder', 'uropayOrderStatus', 'uropaySubmitUtr',
  'uropayWebhook', 'uropayAdminHealth', 'uropayAdminRefresh',
  // Polls. pollVote derives voter identity server-side and re-checks admin in
  // pollAdminList; the vote tally is never taken from the request.
  'pollList', 'pollVote', 'pollAdminList',
  // Creator money. Ownership is taken from the session, never from the payload.
  'balanceOverview', 'withdrawalRequest', 'withdrawalCancel', 'withdrawalList',
  // Winner verification. Each handler re-checks that the caller IS the winner;
  // winnerVerificationReview and ...Queue re-check admin.
  'winnerVerificationStatus', 'winnerVerificationStart', 'winnerVerificationSubmit',
  'winnerVerificationReview', 'winnerVerificationQueue',
  // scoringConfigGet is readable by any authenticated user: a creator is
  // entitled to know how they will be judged before entering. The rest
  // re-check contest ownership.
  'scoringConfigGet', 'scoringConfigSave',
  'submissionDisqualify', 'submissionReinstate', 'disqualificationList',
  'notificationFeed', 'notificationRead',
  // campaignReport re-checks contest ownership; creatorTrackRecord defaults to
  // the caller; fraudSignals re-checks admin.
  'campaignReport', 'creatorTrackRecord', 'fraudSignals',
  'payoutAccountSave', 'payoutOverview', 'payoutRequest',

  // Finance: deliberately NOT in ADMIN_ONLY, because these are gated on
  // granular finance permissions instead — an operator can hold finance.view
  // without being a platform admin. Each handler calls requireFinance() itself.
  'financeOverview', 'financeFundingQueue', 'financeFundingDetail', 'financeVerifyFunding',
  'financeRejectFunding', 'financeUserBalances', 'financePrizeCommitments', 'financeLedger',
  'financeReconcile', 'financeResolveReconciliation', 'financeRefund', 'financeAdjust',
  'financeAudit', 'financePermissions',
  'paymentSettingsGet', 'paymentSettingsUpdate', 'paymentSettingsQr',
  'financeWithdrawalQueue', 'financeWithdrawalDetail', 'financeWithdrawalReview',
  'financeWithdrawalApprove', 'financeWithdrawalTransferSent', 'financeWithdrawalConfirm',
  'financeWithdrawalFail', 'financeWithdrawalReverse',
  'financePayoutQueue', 'financePayoutDetail', 'financeApprovePayout', 'financeRecordPayout',
]);

// Callable WITHOUT authentication. Only finalized, intentionally public data:
// winning work, the leaderboard, and the fact that payments are manual — a
// visitor is entitled to know that before committing to a contest.
export const PUBLIC_FUNCTIONS = new Set([
  'winnersShowcase', 'winnersLeaderboard', 'creatorPublicProfile', 'paymentModeInfo',
  // Aggregate counts only, seed accounts excluded. Nothing identifying.
  'platformStats',
  // The upcoming-tournament banners are on the public home page, and a visitor
  // can vote — pollVote derives an anti-abuse voter key rather than requiring
  // an account, so both are reachable without a session.
  'pollList', 'pollVote',
  // Names no credential and returns no user data — a visitor deciding how to
  // pay is entitled to know whether UPI is available.
  'uropayAvailability',
  // The provider cannot authenticate as a user. Gated on an HMAC signature
  // inside the handler, and it trusts nothing in the body but an order id to
  // go and ask the provider about.
  'uropayWebhook',
]);

// Require platform admin at the route boundary (handlers also re-check).
// Finance handlers are absent by design — see the note above.
export const ADMIN_ONLY = new Set([
  'visualAssetAdmin', 'supportTicketUpdate',
  'adminOverview', 'adminContests', 'adminTraffic', 'adminUsers', 'adminAudit',
  'adminUsersList', 'adminUserDetail', 'adminUserAction',
  'adminTrustSafety', 'adminTrustAction', 'adminEnforcement', 'adminEnforcementAction',
  'adminVisualAssets', 'adminSystemHealth',
  'uropayAdminHealth', 'uropayAdminRefresh',
  'pollAdminList',
]);
