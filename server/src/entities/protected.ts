// Server-authoritative field guard.
//
// The document store gives every authenticated user a generic write path
// (PATCH /api/entities/:entity/:id) governed only by the per-entity RLS policy.
// RLS answers "may this user touch this ROW?" — it cannot express "…but not
// these FIELDS". That gap allowed two real forgeries:
//
//   • a brand could PATCH Contest.winner_user_id directly from the browser;
//   • a creator owns their Submission row, so they could set status = 'won'.
//
// Fields listed here are writable ONLY by the service role (server functions
// such as winnerFinalize, and the scoring engine). Admins are NOT exempt: an
// admin acting through the generic entity API is still a browser client. Admin
// corrections must go through an audited server function instead.
import { EntityError } from './service.js';

// Fields a browser client may never write, at create or update time.
export const PROTECTED_FIELDS: Record<string, string[]> = {
  Contest: [
    'winner_user_id', 'winner_submission_id', 'winner_selected_at', 'completed_at',
    'platform_fee', 'duration_rule_version', 'min_duration_days', 'max_duration_days',
    // Criteria confirmation is what unlocks payment — only the server sets it.
    'criteria_version_id', 'criteria_confirmed_at',
    // Funding state is decided by an admin verifying a real bank transfer.
    // A brand must never be able to mark its own contest funded.
    'funding_status', 'funding_id', 'funded_at', 'prize_committed_minor', 'payment_mode',
    // The lifecycle is advanced by the server as real events happen.
    'lifecycle_state', 'winner_verification_id', 'winner_verified_at',
    'submission_closed_at', 'review_started_at', 'scoring_config_version',
  ],
  Submission: [
    'engagement_score', 'traffic_score', 'final_score', 'rank',
    'scoring_version', 'scored_at', 'score_state',
    // Only an authorised review can disqualify an entry, and only with a reason.
    'disqualified', 'disqualification_id', 'disqualified_at', 'disqualification_reason',
    // The engine writes the breakdown; a browser must not be able to author
    // an explanation for a score it did not compute.
    'score_breakdown', 'scoring_config_version',
  ],
  WinnerPublish: ['published_at'],
  // A user files a ticket; only the server moves it through its lifecycle.
  SupportTicket: ['status', 'admin_response', 'priority', 'user_id'],
  // Contest rules and compliance results are written only by the server.
  // A client must never be able to post a PASS or forge eligibility.
  ContestCriteriaVersion: ['*'],
  ContestCriterion: ['*'],
  SubmissionCompliance: ['*'],
  SubmissionComplianceFinding: ['*'],
  ComplianceReview: ['*'],
  AgentRun: ['*'],
  // ── Money ────────────────────────────────────────────────────────────────
  // Every financial record is written by a server function under the service
  // role and nowhere else. The ledger is append-only: even the server never
  // updates or deletes an entry, it posts a reversal.
  LedgerAccount: ['*'],
  LedgerTransaction: ['*'],
  LedgerEntry: ['*'],
  ContestFunding: ['*'],
  FundingProof: ['*'],
  Payout: ['*'],
  // A creator submits bank details through payoutAccountSave, which validates
  // and masks them; the raw row is never client-writable.
  PayoutAccount: ['*'],
  ReconciliationRecord: ['*'],
  // Payment instructions (destination account, UPI, QR) are admin-configured
  // through an audited server function and never client-writable.
  PaymentSettings: ['*'],
  PaymentQrVersion: ['*'],
  FundingReceipt: ['*'],
  // Finance permissions are granted only through an audited admin function.
  AdminPermission: ['*'],
  // Balances are a projection of the ledger, not an input to it.
  Wallet: ['*'],
  WalletLedgerEntry: ['*'],
  Payment: ['*'],
  PaymentQuote: ['*'],
  PaymentTransaction: ['*'],
  // A creator files a withdrawal through a server function that reserves the
  // amount on the ledger; the row itself is never client-writable.
  WithdrawalRequest: ['*'],
  Fund: ['*'],
  FundsTransaction: ['*'],
  MoneyRule: ['*'],

  // Trust & Safety: a user may FILE a report (rls.create) but never set its
  // status, severity, risk score or resolution — those are staff decisions.
  TrustReport: ['status', 'severity', 'risk_score', 'signals', 'assigned_to',
    'reviewed_by', 'reviewed_at', 'resolution', 'resolution_notes', 'closed_at', 'source'],
  // Enforcement history is written only by an audited admin function.
  EnforcementAction: ['*'],

  // Winner verification is created only by winnerFinalize and advanced only by
  // the verification handlers. A creator may never mark themselves verified.
  WinnerVerification: ['*'],
  // A creator connects an account through a server function that validates the
  // handle and issues a challenge; the row is never client-writable.
  SocialAccount: ['*'],
  Disqualification: ['*'],
  ScoringConfig: ['*'],

  // Server-computed aggregates — never client-writable.
  CreatorStats: ['*'],
  PublicCreatorStats: ['*'],
  MonthlyLeaderboard: ['*'],
  SocialMetric: ['*'],
  SocialPost: ['*'],
  // Its two siblings above were locked and this one was not, which made it the
  // only writable input to a score that decides who gets paid.
  //
  // scoring/compute.ts:113 reads SocialCampaignPost for the contest, and
  // engagementInputs() takes views/likes/comments/shares/saves/watch_time/
  // follower_growth straight off `metrics`. That becomes engagement_score, half
  // of Final Score, which selects the winner. The entity's RLS lets
  // `user_role: client` create and the owning client update — so the brand
  // running a contest could write the numbers that decide which creator wins
  // it, and pick the winner by editing a JSON blob.
  //
  // Nothing in the application writes this entity: the only writers are
  // seed-simulation.ts and verify-e2e.ts, both of which run through
  // serviceClient() and bypass this check (service.ts:260, 311). So locking it
  // entirely costs nothing today and closes the hole. With no provider
  // integration there is no trustworthy engagement data anyway, and the scorer
  // already treats a missing metric as "Not measured" rather than zero.
  SocialCampaignPost: ['*'],
  ScoreSnapshot: ['*'],
  TrafficEvent: ['*'],
  TrackingLink: ['*'],
  AuditLog: ['*'],
  FraudAlert: ['*'],

  // ── Entities a user may CREATE, but whose verdict fields are not theirs ───
  // Each of these has rls.create === true, which is correct: a creator really
  // does file a report, open a handover, start an OTP check. What they must
  // never do is write the field that says the check PASSED. Found by sweeping
  // every entity with create:true against its own field names — none of these
  // were guarded before.

  // Footage access. OTP and download sessions are the gate on licensed
  // material, so self-verifying one is a direct route to material the creator
  // was not granted.
  OtpVerification: ['verified', 'verified_at', 'attempts', 'expires_at', 'code_hash', 'status'],
  // Same gate, other entity. OtpVerification.verified was closed above while
  // FootageAccessRequest.otp_verified — which is also what stands between a
  // creator and licensed footage — was left open, along with the status the
  // reviewer sets and the lockout counters that make brute force expensive.
  FootageAccessRequest: ['status', 'otp_verified', 'otp_attempts', 'otp_locked_until',
    'reviewed_at', 'rejection_reason', 'client_id', 'worker_id'],
  DownloadSession: ['status', 'downloads_used', 'max_downloads', 'expires_at', 'revoked_at', 'revoked_by'],
  DownloadLog: ['status', 'session_id', 'bytes'],

  // Handover completion gates payout eligibility. A winner marking their own
  // handover COMPLETED would be claiming they handed over an account nobody
  // confirmed receiving.
  Handover: ['status', 'winner_id', 'client_id', 'contest_id', 'verified_at',
    'verified_by', 'completed_at', 'otp_code', 'credentials_released_at'],
  HandoverMessage: ['sender_role', 'winner_id', 'client_id'],

  // Moderation verdicts and verification badges are staff decisions.
  Post: ['author_verified', 'moderation_status', 'moderated_by', 'moderated_at',
    'like_count', 'save_count', 'comment_count', 'view_count'],
  Comment: ['moderation_status', 'moderated_by', 'moderated_at'],
  // A user files a Report; its status and resolution belong to whoever reviews it.
  Report: ['status', 'reviewed_by', 'reviewed_at', 'resolution', 'resolution_notes', 'severity'],

  // A review is written BY one party ABOUT the other, and rls.update lets the
  // author, the creator and the client all write the row. `verified` is the
  // badge saying RazeKit confirmed this review came from a real completed
  // contest — a trust signal the reviewer was able to award themselves. The
  // ratings and the prose stay writable; only the badge and the lifecycle do not.
  Review: ['verified', 'status'],

  // Dormant today (nothing reads it), which is exactly when to close it: the
  // moment something trusts `verified`, a browser-set true becomes a forged
  // account-ownership claim.
  SocialConnection: ['verified', 'status', 'provider_account_id', 'owner_user_id',
    'scopes', 'last_synced_at', 'sync_error'],

  // A notification is emitted by the server in response to a real event. A
  // client writing one could fabricate "your payout completed".
  Notification: ['*'],
};

// Status values that only the server may assign (the client may still move a
// row through its own non-terminal states).
export const PROTECTED_STATUS: Record<string, { field: string; serverOnly: string[] }> = {
  Submission: { field: 'status', serverOnly: ['won', 'not_selected'] },
  Contest: { field: 'status', serverOnly: ['winner_selected', 'completed'] },
};

/**
 * Throws if `patch` touches a server-authoritative field.
 * `prev` is the pre-existing row data (undefined on create) so we only reject a
 * value that actually CHANGES — re-sending an unchanged field is harmless and
 * keeps naive "PATCH the whole object" clients working.
 */
export function assertNoProtectedWrite(
  entity: string,
  patch: Record<string, unknown>,
  prev?: Record<string, unknown>
) {
  const fields = PROTECTED_FIELDS[entity];
  if (fields) {
    const all = fields.includes('*');
    for (const key of Object.keys(patch)) {
      if (!all && !fields.includes(key)) continue;
      if (all && key === 'demo') continue; // seed marker is harmless
      const before = prev ? prev[key] : undefined;
      if (JSON.stringify(before) === JSON.stringify(patch[key])) continue; // unchanged
      throw new EntityError(
        `'${key}' on ${entity} is set by RazeKit and cannot be written directly.`,
        403
      );
    }
  }

  const st = PROTECTED_STATUS[entity];
  if (st && Object.prototype.hasOwnProperty.call(patch, st.field)) {
    const next = patch[st.field];
    const before = prev ? prev[st.field] : undefined;
    if (next !== before && typeof next === 'string' && st.serverOnly.includes(next)) {
      throw new EntityError(
        `${entity}.${st.field} = '${next}' is decided by RazeKit and cannot be set directly.`,
        403
      );
    }
  }
}
