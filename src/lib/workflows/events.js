// Canonical Razekit domain event catalog (WORKFLOWS §26).
// Every major business event maps to: label, owning actor, notification type,
// recipient and deep link. Features must emit catalogued events — no ad-hoc
// notification logic.

const REVIEW_ROUTE = (contestId) => `/contest/${contestId}/review`;
const WINNER_ROUTE = (contestId) => `/contest/${contestId}/winner`;

export const EVENTS = {
  'contest.created':          { label: 'Contest created', owner: 'brand', type: null, route: (id) => `/contest/${id}` },
  'contest.funded':           { label: 'Prize funded', owner: 'brand', type: null, route: (id) => `/contest/${id}` },
  'contest.published':        { label: 'Contest published', owner: 'brand', type: 'contest_joined', route: (id) => `/contest/${id}` },
  'contest.started':          { label: 'Contest live', owner: 'system', type: null, route: (id) => `/contest/${id}` },
  'contest.closed':           { label: 'Submissions closed', owner: 'system', type: 'contest_ended', route: (id) => REVIEW_ROUTE(id) },
  'submission.created':       { label: 'Submission created', owner: 'creator', type: 'submission_uploaded', route: (id) => `/contest/${id}` },
  'submission.submitted':     { label: 'Work submitted', owner: 'creator', type: 'contest_submission_received', route: (id) => REVIEW_ROUTE(id) },
  'submission.reviewed':      { label: 'Submission reviewed', owner: 'brand', type: null, route: (id) => `/contest/${id}` },
  'submission.shortlisted':   { label: 'Submission shortlisted', owner: 'brand', type: 'shortlisted', route: (id) => `/contest/${id}` },
  'winner.selected':          { label: 'Winner selected', owner: 'brand', type: 'winner_announced', route: (id) => WINNER_ROUTE(id) },
  'payment.created':           { label: 'Payment initiated', owner: 'system', type: null, route: (id) => WINNER_ROUTE(id) },
  'payment.processing':       { label: 'Payment processing', owner: 'system', type: null, route: (id) => WINNER_ROUTE(id) },
  'payment.completed':        { label: 'Payment completed', owner: 'system', type: 'payment_received', route: (id) => WINNER_ROUTE(id) },
  'payment.failed':           { label: 'Payment failed', owner: 'system', type: null, route: (id) => WINNER_ROUTE(id) },
  'handover.requested':       { label: 'Handover requested', owner: 'brand', type: null, route: (id) => `/contest/${id}/handover` },
  'handover.started':         { label: 'Handover started', owner: 'creator', type: null, route: (id) => `/contest/${id}/handover` },
  'handover.completed':       { label: 'Handover completed', owner: 'both', type: null, route: (id) => `/contest/${id}/completed` },
  'winner_content.requested': { label: 'Winner content requested', owner: 'system', type: 'winner_content_requested', route: (id) => WINNER_ROUTE(id) },
  'winner_content.submitted': { label: 'Winner content submitted', owner: 'creator', type: 'winner_content_submitted', route: (id) => WINNER_ROUTE(id) },
  'winner_content.revision_requested': { label: 'Revision requested', owner: 'brand', type: 'winner_content_revision', route: (id) => WINNER_ROUTE(id) },
  'winner_content.approved':  { label: 'Winner content approved', owner: 'brand', type: null, route: (id) => WINNER_ROUTE(id) },
  'winner_content.published': { label: 'Winner published to Winners Hub', owner: 'system', type: 'winner_content_published', route: (id) => `/winners-hub` },
  'review.requested':         { label: 'Review requested', owner: 'system', type: null, route: (id) => `/contest/${id}/completed` },
  'review.submitted':         { label: 'Review submitted', owner: 'both', type: null, route: (id) => `/contest/${id}/completed` },
  'review.published':         { label: 'Review published', owner: 'system', type: null, route: (id) => `/u` },
  'support.created':          { label: 'Support ticket created', owner: 'user', type: null, route: () => '/help' },
  'support.escalated':        { label: 'Escalated to support', owner: 'support', type: null, route: () => '/help' },
  'support.resolved':         { label: 'Support ticket resolved', owner: 'support', type: 'report_update', route: () => '/help' },
};

export function eventMeta(name) {
  return EVENTS[name] || null;
}