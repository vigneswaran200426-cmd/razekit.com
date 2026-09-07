/*
  Razekit central alert-state registry.
  Each semantic state defines its visual, default copy and recommended action.
  Pages pass the key to <AlertState state="NO_CONTESTS" /> and override copy only when needed.
  One mark, one sentence, one action. Never an apology.
*/
export const ALERT_STATES = {
  // ── Empty ──
  NO_CONTESTS:        { type: 'empty', shape: 'blob', title: 'No contests yet', description: 'Launch your first contest and let creators compete for your prize.', actionLabel: 'Create a contest' },
  NO_FILTER_RESULTS: { type: 'empty', shape: 'pill', title: 'Nothing matches these filters', description: 'Widen the prize range or clear the category.', actionLabel: 'Clear filters' },
  NO_CONTEST_ENTRIES:{ type: 'empty', shape: 'square', title: 'No entries yet', description: 'Creators submit most in the final 48 hours of a contest.', actionLabel: 'View contest' },
  NO_SUBMISSIONS:     { type: 'empty', shape: 'blob', title: 'No submissions yet', description: 'Your submitted work will appear here.', actionLabel: 'Find contests' },
  NO_WINNERS:         { type: 'empty', shape: 'diamond', title: 'No winners yet', description: 'Your wins will appear here after a Brand selects your work.', actionLabel: 'Find contests' },
  NO_MESSAGES:        { type: 'empty', shape: 'square', title: 'No messages', description: 'Conversations open once you join a contest.', actionLabel: 'Find contests' },
  NO_REVIEWS:         { type: 'empty', shape: 'circle', title: 'No reviews yet', description: 'Verified reviews appear after your first completed contest.', actionLabel: 'Find contests' },
  NO_COLLABORATIONS:  { type: 'empty', shape: 'orbs', title: 'No collaborations', description: 'Active collaborations will appear here.', actionLabel: 'Find contests' },
  NO_HANDOVER:        { type: 'empty', shape: 'square', title: 'No handover', description: 'Handover steps appear once a winner is selected.', actionLabel: 'View contest' },
  NO_WINNER_CONTENT:  { type: 'empty', shape: 'blob', title: 'No winner content yet', description: 'Winner content appears here after a winner is selected.', actionLabel: 'View contests' },
  NO_SOCIAL_POSTS:    { type: 'empty', shape: 'pill', title: 'No posts yet', description: 'Published and planned posts will appear here.', actionLabel: 'Add post' },
  NO_CONNECTED_ACCOUNTS: { type: 'empty', shape: 'orbs', title: 'No connected accounts', description: 'Connect a social account to track performance automatically.', actionLabel: 'Connect account' },
  NO_SEARCH_RESULTS:  { type: 'empty', shape: 'pill', title: 'No results found', description: 'Try another search term.', actionLabel: 'Clear search' },
  NO_NOTIFICATIONS:   { type: 'empty', shape: 'circle', title: 'All caught up', description: 'No new notifications. We only interrupt for money and deadlines.' },

  // ── Errors ──
  UPLOAD_FAILED:   { type: 'error', shape: 'square', title: 'Upload failed', description: 'The file couldn\u2019t be uploaded.', actionLabel: 'Try again' },
  NETWORK_ERROR:   { type: 'error', shape: 'orbs', title: 'Connection lost', description: 'Check your connection and try again.', actionLabel: 'Try again' },
  SERVER_ERROR:    { type: 'error', shape: 'square', title: 'Something isn\u2019t available right now', description: 'Try again in a moment.', actionLabel: 'Try again' },
  PERMISSION_DENIED: { type: 'locked', shape: 'ring', title: 'Access unavailable', description: 'You don\u2019t have permission to view this page.', actionLabel: 'Go back' },
  NOT_FOUND:       { type: 'not-found', shape: 'diamond', title: 'Page not found', description: 'This page may have moved or no longer exists.', actionLabel: 'Go back' },

  // ── Lifecycle ──
  CONTEST_EXPIRED:  { type: 'expired', shape: 'ring', title: 'Contest expired', description: 'The submission deadline has passed.', actionLabel: 'View contest' },
  CONTEST_COMPLETED:{ type: 'completed', shape: 'square', title: 'Contest completed', description: 'Winner selected and prize released. Everything stays archived.', actionLabel: 'View winner' },
  PROCESSING:       { type: 'processing', shape: 'orbs', title: 'Processing', description: 'This may take a moment.' },
  ACTION_REQUIRED:  { type: 'action-required', shape: 'diamond', title: 'Needs attention', description: 'This item is waiting on your action.' },
  SUBMITTED:         { type: 'success', shape: 'circle', title: 'Submission received', description: 'Your work was successfully submitted.', actionLabel: 'View submission' },
  ALL_CAUGHT_UP:     { type: 'completed', shape: 'circle', title: 'All caught up', description: 'Nothing needs your action right now.' },
};