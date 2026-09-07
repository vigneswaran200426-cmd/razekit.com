import { base44 } from '@/api/base44Client';

export const HANDOVER_DEADLINE_HOURS = 24;

export const HANDOVER_TYPE_LABELS = {
  account_access: 'Account access',
  assets: 'Assets / files',
  both: 'Account access + Assets',
};

export const HANDOVER_TYPE_OPTIONS = [
  { value: 'account_access', label: 'Account access', desc: 'Grant the winner managed access to a platform account.' },
  { value: 'assets', label: 'Assets / files', desc: 'The winner delivers final and source files.' },
  { value: 'both', label: 'Both', desc: 'Managed account access plus file delivery.' },
];

export const HANDOVER_ITEM_OPTIONS = [
  'Instagram Account',
  'YouTube Channel',
  'TikTok Account',
  'Facebook Page',
  'Final Video',
  'Source / Project Files',
  'Thumbnails',
  'Captions / Subtitles',
];

export const EVENT_LABELS = {
  winner_selected: 'Winner selected',
  initiated: 'Handover initiated',
  message_posted: 'Handover in progress',
  winner_confirmed: 'Winner confirmed access',
  client_confirmed: 'Brand confirmed handover',
  payment_released: 'Payment released',
  completed: 'Handover closed',
  extension_requested: 'Deadline extended',
  problem_reported: 'Problem reported',
};

export const HANDOVER_STATUS_LABELS = {
  not_started: 'Not started',
  initiated: 'Initiated',
  in_progress: 'In progress',
  winner_confirmed: 'Winner confirmed',
  client_confirmed: 'Brand confirmed',
  completed: 'Completed',
  expired: 'Expired',
  disputed: 'Disputed',
};

export function parseEventLog(handover) {
  try {
    const log = JSON.parse(handover?.event_log || '[]');
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

export function parseHandoverItems(handover) {
  try {
    const items = JSON.parse(handover?.handover_items || '[]');
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export async function getHandover(contestId) {
  const list = await base44.entities.Handover.filter({ contest_id: contestId }, '-created_date', 1).catch(() => []);
  return list[0] || null;
}

// Append-only audit trail: never rewrites or removes existing entries.
export async function logHandoverEvent(handover, { actor = 'system', actorId = '', action, detail = '' }) {
  if (!handover?.id || !action) return null;
  const log = parseEventLog(handover);
  log.push({ actor, actor_id: actorId, action, detail, time: new Date().toISOString() });
  return base44.entities.Handover.update(handover.id, { event_log: JSON.stringify(log) }).catch(() => null);
}

export function isHandoverExpired(handover) {
  if (!handover?.deadline || !handover.started_at) return false;
  if (['completed', 'client_confirmed', 'winner_confirmed'].includes(handover.status)) return false;
  return new Date(handover.deadline) < new Date();
}

// Payment may only be released after BOTH sides have confirmed.
// Contests created before handover existed have no record and are unaffected.
export function handoverUnlocksPayment(handover) {
  return !handover || (!!handover.creator_confirmation && !!handover.client_confirmation);
}

// Called by the existing payment-release step: marks the handover completed
// and records the payment/handover-closed events in one append.
export async function markHandoverCompleted(handover, actorId) {
  if (!handover?.id) return null;
  const log = parseEventLog(handover);
  const now = new Date().toISOString();
  log.push({ actor: 'client', actor_id: actorId || '', action: 'payment_released', detail: '', time: now });
  log.push({ actor: 'system', actor_id: '', action: 'completed', detail: '', time: now });
  return base44.entities.Handover.update(handover.id, {
    status: 'completed',
    completed_at: now,
    event_log: JSON.stringify(log),
  });
}