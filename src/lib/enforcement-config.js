// Trusted enforcement threshold config.
// Changeable only by admin/system (this is a server-side config module, not a user-writable field).
// A user can never modify these values or their own warning count / account status.
export const CLIENT_WARNING_LIMIT = 3;
export const CREATOR_WARNING_LIMIT = 5;

export function warningLimit(role) {
  return role === 'client' ? CLIENT_WARNING_LIMIT : CREATOR_WARNING_LIMIT;
}

// Actions that get revoked when an account reaches the threshold (role-scoped).
export const CLIENT_BLOCKED_ACTIONS = ['create_context', 'fund_context', 'manage_context', 'invite_creator'];
export const CREATOR_BLOCKED_ACTIONS = ['join_context', 'submit_work', 'request_footage', 'new_withdrawal'];