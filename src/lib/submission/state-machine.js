// Submission state machine — one place that knows which states exist,
// which transitions are legal, and what a given submission's timeline is.
// UI renders THIS; nothing mutates state ad-hoc in components.

export const SUBMISSION_STATUS_LABELS = {
  working: 'Draft', upload_pending: 'Draft', uploading: 'Uploading', processing: 'Processing',
  ready_to_review: 'Ready to review', submitted: 'Submitted', under_review: 'Under Brand review',
  shortlisted: 'Shortlisted', won: 'Winner', lost: 'Not selected', not_selected: 'Not selected',
  withdrawn: 'Withdrawn', processing_failed: 'Processing failed', upload_failed: 'Upload failed',
};

// Legal transitions — every action goes through canTransition.
export const TRANSITIONS = {
  working: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'shortlisted', 'not_selected', 'won', 'withdrawn', 'working'], // working = revision requested by brand
  under_review: ['shortlisted', 'not_selected', 'won', 'working'],
  shortlisted: ['won', 'not_selected', 'working'],
  won: [], not_selected: [], lost: [], withdrawn: [],
};

export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

// ── Timeline ────────────────────────────────────────────────────────────
// Dynamically shows only the states relevant to THIS submission and the
// contest's configured post-win path (handover / collaboration / winner
// content / none). Status is never communicated by color alone — labels
// always render next to each node.

export function submissionTimeline({ submission, contest, winnerPublish, handover }) {
  const st = submission?.status || 'working';
  const postWin = contest?.post_winner_action || 'NONE';
  const won = st === 'won';
  const decided = ['not_selected', 'lost', 'withdrawn'].includes(st);

  const steps = [
    { id: 'draft', label: 'Draft' },
    { id: 'submitted', label: 'Submitted' },
    { id: 'review', label: 'Under Brand review' },
    { id: 'decision', label: won ? 'Winner Selected' : decided ? SUBMISSION_STATUS_LABELS[st] : 'Decision' },
  ];

  if (won) {
    steps.push({ id: 'payment', label: 'Winner payment' });
    if (postWin === 'ACCOUNT_HANDOVER') steps.push({ id: 'handover', label: 'Account handover' });
    if (postWin === 'CLIENT_COLLABORATION') steps.push({ id: 'collab', label: 'Collaboration' });
    steps.push({ id: 'winner_content', label: 'Winner content' });
    steps.push({ id: 'hub', label: 'Winners Hub' });
    steps.push({ id: 'completed', label: 'Completed' });
  }

  // Map live state to how far the submission has progressed.
  const wp = winnerPublish?.status;
  const handoverDone = handover?.status === 'completed';
  const paid = contest?.delivery_status === 'delivered' || contest?.status === 'completed';
  const published = wp === 'published';
  const completed = contest?.status === 'completed' && published;

  let doneUpTo;
  if (st === 'working') doneUpTo = 'draft';
  else if (st === 'submitted') doneUpTo = 'submitted';
  else if (st === 'under_review') doneUpTo = 'review';
  else if (st === 'shortlisted') doneUpTo = 'review';
  else if (won) {
    if (completed) doneUpTo = 'completed';
    else if (published) doneUpTo = 'hub';
    else if (['approved', 'processing', 'submitted_for_approval', 'revision_requested'].includes(wp)) doneUpTo = 'winner_content';
    else if (handoverDone) doneUpTo = 'handover';
    else if (postWin === 'ACCOUNT_HANDOVER' && handover && !handoverDone) doneUpTo = 'payment';
    else if (postWin === 'CLIENT_COLLABORATION') doneUpTo = 'payment';
    else doneUpTo = 'payment';
  } else if (decided) doneUpTo = 'decision';
  else doneUpTo = 'submitted';

  const idx = steps.findIndex((s) => s.id === doneUpTo);
  return steps.map((s, i) => ({
    ...s,
    status: i < idx ? 'done' : i === idx ? 'current' : 'pending',
  }));
}