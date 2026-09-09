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
  ],
  Submission: [
    'engagement_score', 'traffic_score', 'final_score', 'rank',
    'scoring_version', 'scored_at', 'score_state',
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
  // Server-computed aggregates — never client-writable.
  CreatorStats: ['*'],
  PublicCreatorStats: ['*'],
  MonthlyLeaderboard: ['*'],
  SocialMetric: ['*'],
  SocialPost: ['*'],
  ScoreSnapshot: ['*'],
  TrafficEvent: ['*'],
  TrackingLink: ['*'],
  AuditLog: ['*'],
  FraudAlert: ['*'],
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
