import { base44 } from '@/api/base44Client';

// ─────────────────────────────────────────────────────────────
// Winner publishing workflow — connects winner selection to the
// public Winners Hub. Payment state stays on the Contest (source
// of truth); this record only tracks the showcase pipeline.
// ─────────────────────────────────────────────────────────────

export const WP_STATUS = {
  WINNER_SELECTED: 'winner_selected',
  CONTENT_REQUESTED: 'content_requested',
  SUBMITTED: 'submitted_for_approval',
  REVISION_REQUESTED: 'revision_requested',
  APPROVED: 'approved',
  PROCESSING: 'processing',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
};

export const WP_STATUS_LABEL = {
  winner_selected: 'Winner selected',
  content_requested: 'Winner content requested',
  submitted_for_approval: 'Awaiting brand approval',
  revision_requested: 'Revision requested',
  approved: 'Approved',
  processing: 'Preparing for Winners Hub',
  published: 'Published to Winners Hub',
  archived: 'Archived',
};

// Explicit, valid-transition-only state machine.
const TRANSITIONS = {
  winner_selected: ['content_requested'],
  content_requested: ['submitted_for_approval'],
  submitted_for_approval: ['revision_requested', 'approved'],
  revision_requested: ['submitted_for_approval'],
  approved: ['processing'],
  processing: ['published'],
  published: ['archived'],
  archived: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function placementLabel(placement) {
  const map = { 1: '1st Place', 2: '2nd Place', 3: '3rd Place' };
  return map[placement] || `${placement}th Place`;
}

async function notify(recipientId, type, title, description, contestId, extra = {}) {
  if (!recipientId) return;
  await base44.entities.Notification.create({
    type,
    title,
    description,
    contest_id: contestId || undefined,
    recipient_user_id: recipientId,
    ...extra,
  }).catch(() => {});
}

function track(step, publish) {
  base44.analytics.track({ eventName: 'winner_publish_flow', properties: { step, contest_id: publish?.contest_id, status: publish?.status } }).catch(() => {});
}

// One record per contest — never duplicates.
export async function getWinnerPublish(contestId) {
  const recs = await base44.entities.WinnerPublish.filter({ contest_id: contestId }, '-created_date', 5).catch(() => []);
  return recs[0] || null;
}

// Called from winner selection (Review flow). Idempotent.
export async function ensureWinnerPublishRecord({ contest, submission }) {
  const existing = await getWinnerPublish(contest.id);
  if (existing) return existing;
  track('winner_content_record_created', { contest_id: contest.id, status: 'winner_selected' });
  return base44.entities.WinnerPublish.create({
    contest_id: contest.id,
    submission_id: submission.id,
    creator_id: submission.created_by_id,
    client_id: contest.created_by_id,
    placement: 1,
    title: contest.title,
    category: contest.category || '',
    prize_amount: contest.prize_amount || 0,
    currency: contest.currency || 'INR',
    status: WP_STATUS.WINNER_SELECTED,
    revision_count: 0,
  });
}

// Called when the client confirms prize payment (existing Winner/payment flow).
// Opens the creator winner-content task.
export async function requestWinnerContent(publish) {
  if (!publish || publish.status !== WP_STATUS.WINNER_SELECTED) return publish;
  const updated = await base44.entities.WinnerPublish.update(publish.id, { status: WP_STATUS.CONTENT_REQUESTED });
  track('winner_content_requested', updated);
  await notify(
    publish.creator_id,
    'winner_content_requested',
    'Winner content is ready to submit',
    `Showcase your winning work from "${publish.title}" in the Razekit Winners Hub.`,
    publish.contest_id,
  );
  return updated;
}

// Creator submits (or resubmits after a revision) winner content for approval.
export async function submitWinnerContent(publish, fields) {
  if (![WP_STATUS.CONTENT_REQUESTED, WP_STATUS.REVISION_REQUESTED].includes(publish.status)) {
    throw new Error('Winner content cannot be submitted at this stage.');
  }
  const isRevision = publish.status === WP_STATUS.REVISION_REQUESTED;
  const updated = await base44.entities.WinnerPublish.update(publish.id, {
    ...fields,
    status: WP_STATUS.SUBMITTED,
    submitted_at: new Date().toISOString(),
    revision_count: isRevision ? (publish.revision_count || 0) + 1 : (publish.revision_count || 0),
    revision_feedback: '',
  });
  track(isRevision ? 'revision_submitted' : 'winner_content_submitted', updated);
  await notify(
    publish.client_id,
    'winner_content_submitted',
    'Winner content ready for approval',
    `Your winning creator submitted the Winners Hub entry for "${publish.title}". Review before it goes public.`,
    publish.contest_id,
    { related_winner_id: publish.id },
  );
  return updated;
}

// Save draft — persists form fields without a status transition.
export async function saveWinnerContentDraft(publish, fields) {
  return base44.entities.WinnerPublish.update(publish.id, fields);
}

// Client requests changes — creator gets a revision task, no full restart.
export async function requestWinnerRevision(publish, feedback) {
  if (publish.status !== WP_STATUS.SUBMITTED) {
    throw new Error('Revisions can only be requested on submitted content.');
  }
  const updated = await base44.entities.WinnerPublish.update(publish.id, {
    status: WP_STATUS.REVISION_REQUESTED,
    revision_feedback: feedback,
  });
  track('revision_requested', updated);
  await notify(
    publish.creator_id,
    'winner_content_revision',
    'Brand requested changes',
    `The brand requested changes to your winning work for "${publish.title}".`,
    publish.contest_id,
    { related_winner_id: publish.id },
  );
  return updated;
}

// Re-host a private asset to public storage (only used AFTER approval).
async function publishPrivateAsset(uri) {
  if (!uri) return null;
  if (/^https?:\/\//.test(uri)) return uri; // already public
  const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 });
  const res = await fetch(signed_url);
  if (!res.ok) throw new Error('Could not read approved media.');
  const blob = await res.blob();
  const file = new File([blob], 'winner-asset', { type: blob.type || 'application/octet-stream' });
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return file_url;
}

// Client approves → Razekit processes → auto-publishes to Winners Hub.
// Idempotent: safe to re-run; never double-publishes.
export async function approveAndPublishWinner(publish) {
  if (!publish) throw new Error('Winner record not found.');
  if (publish.status === WP_STATUS.PUBLISHED) return publish;
  if (publish.status !== WP_STATUS.SUBMITTED) {
    throw new Error('Only submitted winner content can be approved.');
  }
  const now = new Date().toISOString();
  const approved = await base44.entities.WinnerPublish.update(publish.id, {
    status: WP_STATUS.APPROVED,
    client_approved_at: now,
  });
  track('approval_completed', approved);

  // Processing — prepare public media. Failures surface as a retryable state.
  let processing = await base44.entities.WinnerPublish.update(publish.id, { status: WP_STATUS.PROCESSING, publish_error: '' });
  track('processing', processing);
  try {
    const [mediaUrl, thumbUrl] = await Promise.all([
      publishPrivateAsset(publish.media_uri),
      publishPrivateAsset(publish.thumbnail_uri),
    ]);
    if (!mediaUrl) throw new Error('No approved media found.');

    // Re-check to stay idempotent under a concurrent run.
    const fresh = await base44.entities.WinnerPublish.get(publish.id).catch(() => null);
    if (fresh?.status === WP_STATUS.PUBLISHED) return fresh;

    const published = await base44.entities.WinnerPublish.update(publish.id, {
      status: WP_STATUS.PUBLISHED,
      published_at: new Date().toISOString(),
      media_url: mediaUrl,
      thumbnail_url: thumbUrl || mediaUrl,
    });
    track('winner_published', published);
    await notify(
      publish.creator_id,
      'winner_content_published',
      'Your winning work is live in Winners Hub',
      `Your winning entry for "${publish.title}" is now publicly showcased on Razekit.`,
      publish.contest_id,
      { related_winner_id: publish.id },
    );
    await notify(
      publish.client_id,
      'winner_content_published',
      'Winner published',
      `The winning work for "${publish.title}" is now live in the Winners Hub.`,
      publish.contest_id,
      { related_winner_id: publish.id },
    );
    return published;
  } catch (e) {
    // Leave the record in processing with a visible, retryable error state.
    await base44.entities.WinnerPublish.update(publish.id, {
      status: WP_STATUS.PROCESSING,
      publish_error: e?.message || 'Processing failed.',
    }).catch(() => {});
    throw e;
  }
}

// Retry hook for processing failures (client can retry, admin can too).
export async function retryWinnerPublishing(publish) {
  if (publish?.status !== WP_STATUS.PROCESSING) throw new Error('Nothing to retry.');
  const fresh = { ...publish, status: WP_STATUS.SUBMITTED };
  return approveAndPublishWinner(fresh);
}