// Razekit canonical workflow engine — single source of truth for lifecycle
// stages, state derivation and role-specific next actions. UI DERIVES from
// these states; nothing here mutates data. See WORKFLOWS.md for the spec.

export const STAGES = [
  { id: 'created', label: 'Contest Created', owner: 'brand' },
  { id: 'funded', label: 'Prize Funded', owner: 'system' },
  { id: 'published', label: 'Live', owner: 'brand' },
  { id: 'submissions', label: 'Submissions', owner: 'creator' },
  { id: 'review', label: 'Review & Shortlist', owner: 'brand' },
  { id: 'winner', label: 'Winner Selected', owner: 'brand' },
  { id: 'payment', label: 'Winner Payment', owner: 'system' },
  { id: 'handover', label: 'Account Handover', owner: 'both' },
  { id: 'winner_content', label: 'Winner Content', owner: 'both' },
  { id: 'winners_hub', label: 'Winners Hub', owner: 'system' },
  { id: 'completed', label: 'Completed', owner: 'system' },
];

export const CONTEST_STATE_LABELS = {
  draft: 'Draft', open: 'Live', paused: 'Paused', joined: 'Creators Joined',
  working: 'Work In Progress', submitted: 'Submissions In', reviewing: 'Under Review',
  winner_selected: 'Winner Selected', completed: 'Completed',
};

const SUBMISSION_ACTIVE = ['working', 'upload_pending', 'uploading', 'processing', 'upload_failed', 'processing_failed'];

// Derives the full lifecycle state of one contest from its source-of-truth records.
// Returns { stages: [{ id, label, owner, status: done|current|pending|skipped, meta }],
//           current, next, isComplete }.
export function deriveContestWorkflow({ contest, submissions = [], winnerPublish, handover, paymentStatus }) {
  const s = contest?.status || 'draft';
  const wp = winnerPublish?.status;
  const handoverRequired = Boolean(contest?.handover_required || (contest?.post_winner_action && contest.post_winner_action !== 'NONE'));
  const handoverDone = handover?.status === 'completed';
  const paid = paymentStatus === 'paid' || contest?.delivery_status === 'delivered' || s === 'completed';
  const published = wp === 'published';
  const hasWinner = Boolean(contest?.winner_user_id);
  const collecting = ['open', 'joined', 'working'].includes(s);

  const doneMap = {
    created: true,
    funded: s !== 'draft',
    published: s !== 'draft',
    submissions: ['submitted', 'reviewing', 'winner_selected', 'completed'].includes(s),
    review: hasWinner,
    payment: paid,
    handover: handoverDone,
    winner_content: published,
    winners_hub: published,
    completed: s === 'completed',
  };
  const meta = {
    submissions: submissions.length ? `${submissions.length} submission${submissions.length === 1 ? '' : 's'}` : 'Awaiting submissions',
    payment: paymentStatus || (paid ? 'paid' : 'pending'),
    handover: handover?.status || (handoverRequired ? 'required' : null),
    winner_content: wp || null,
  };

  let currentIdx = -1;
  const stages = STAGES.map((st, i) => {
    const skipped = st.id === 'handover' && !handoverRequired;
    const done = doneMap[st.id] === true;
    const status = skipped ? 'skipped' : done ? 'done' : currentIdx === -1 ? (currentIdx = i, 'current') : 'pending';
    return { ...st, status, meta: meta[st.id] || null };
  });
  return {
    stages,
    current: stages[currentIdx] || null,
    next: STAGES[currentIdx + 1] || null,
    isComplete: s === 'completed',
  };
}

// Brand's single most important action for one contest, derived from real state.
export function brandNextAction(contest, { winnerPublish, handover, submissionsCount = 0 } = {}) {
  if (!contest) return null;
  const s = contest.status;
  const wp = winnerPublish?.status;
  if (s === 'draft') return { label: 'Complete & publish your contest', hint: 'Finish the brief, fund the prize and go live.', to: `/contest/${contest.id}`, priority: 2 };
  if (s === 'paused') return { label: 'Resume or cancel this contest', hint: 'The contest is paused for creators.', to: `/contest/${contest.id}`, priority: 3 };
  if (['submitted', 'reviewing'].includes(s)) return { label: 'Review submissions & select a winner', hint: `${submissionsCount} submission${submissionsCount === 1 ? '' : 's'} awaiting your review.`, to: `/contest/${contest.id}/review`, priority: 0 };
  if (s === 'winner_selected') {
    if (wp === 'submitted_for_approval') return { label: 'Review & approve winner content', hint: 'The creator submitted the winning work for approval.', to: `/contest/${contest.id}/winner`, priority: 0 };
    if (handover && !['completed', 'expired', 'disputed'].includes(handover.status)) return { label: 'Complete the account handover', hint: 'Confirm the handover to finish this contest.', to: `/contest/${contest.id}/handover/complete`, priority: 1 };
    if (wp === 'revision_requested') return { label: 'Waiting on creator revision', hint: 'You asked for changes. You will be notified when it resubmits.', to: `/contest/${contest.id}/winner`, priority: 4, passive: true };
    return { label: 'Track winner payment & publishing', hint: 'Payment and Winners Hub publishing are in progress.', to: `/contest/${contest.id}/winner`, priority: 4, passive: true };
  }
  if (s === 'completed') return { label: 'View contest summary', hint: 'See the final outcome of this contest.', to: `/contest/${contest.id}/completed`, priority: 5, passive: true };
  return { label: 'Promote your contest to creators', hint: 'Invite creators or share the contest to get more submissions.', to: `/contest/${contest.id}`, priority: 4, passive: true };
}

// Creator's single most important action for one contest they're in.
export function creatorNextAction(contest, submission, { winnerPublish, handover, userId } = {}) {
  if (!contest || !userId) return null;
  const s = contest.status;
  const wp = winnerPublish?.status;
  const isWinner = contest.winner_user_id === userId;

  if (!submission && ['open', 'joined'].includes(s)) return { label: 'Participate now', hint: 'Read the brief, check the requirements and join.', to: `/contest/${contest.id}`, priority: 2 };
  const st = submission?.status;
  if (st && SUBMISSION_ACTIVE.includes(st)) return { label: 'Continue your submission', hint: 'Your draft is saved — finish and submit before the deadline.', to: `/contest/${contest.id}/work`, priority: 1 };
  if (isWinner) {
    if (handover && ['initiated', 'in_progress', 'winner_confirmed'].includes(handover.status)) return { label: 'Complete your handover step', hint: 'Transfer the required access to the brand.', to: `/contest/${contest.id}/handover`, priority: 0, celebrate: true };
    if (wp === 'content_requested') return { label: 'Upload your winning content', hint: 'Add title, description and thumbnail, then submit for approval.', to: `/contest/${contest.id}/winner`, priority: 0, celebrate: true };
    if (wp === 'revision_requested') return { label: 'Apply the revision feedback', hint: 'The brand requested changes to your winner content.', to: `/contest/${contest.id}/winner`, priority: 0, celebrate: true };
    if (wp === 'submitted_for_approval') return { label: 'Awaiting brand approval', hint: 'Your winner content is with the brand for review.', to: `/contest/${contest.id}/winner`, priority: 3, passive: true, celebrate: true };
    if (wp === 'published') return { label: 'View your work in Winners Hub', hint: 'Your winning work is now public.', to: '/winners-hub', priority: 3, passive: true, celebrate: true };
    const handoverRequired = Boolean(contest.handover_required || (contest.post_winner_action && contest.post_winner_action !== 'NONE'));
    if (handoverRequired) return { label: 'Start the handover', hint: 'You won — complete the next step with the brand.', to: `/contest/${contest.id}/handover`, priority: 0, celebrate: true };
    if (['winner_selected', 'approved', 'processing'].includes(wp)) return { label: 'Track payment & publishing', hint: 'Your prize and Winners Hub publishing are in progress.', to: `/contest/${contest.id}/winner`, priority: 3, passive: true, celebrate: true };
    return { label: 'Upload your winning content', hint: 'Add title, description and thumbnail, then submit for approval.', to: `/contest/${contest.id}/winner`, priority: 0, celebrate: true };
  }
  if (st === 'shortlisted') return { label: 'View shortlist status', hint: 'Your submission is shortlisted — the brand is deciding.', to: `/contest/${contest.id}`, priority: 3, passive: true };
  if (st === 'under_review' || st === 'submitted' || st === 'ready_to_review') return { label: 'Track review status', hint: 'The brand is reviewing your submission.', to: `/contest/${contest.id}`, priority: 3, passive: true };
  if (st === 'won') return { label: 'View winning work', hint: 'You won this contest.', to: `/contest/${contest.id}`, priority: 3, passive: true, celebrate: true };
  if (['not_selected', 'lost', 'withdrawn'].includes(st)) return null;
  return null;
}