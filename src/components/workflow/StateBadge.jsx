import StatusPill from '@/components/ui/StatusPill';
import { CONTEST_STATE_LABELS } from '@/lib/workflows';

// Maps workflow states to Razekit status tones (WORKFLOWS §31/§36 — no gaming visuals).
const TONES = {
  draft: 'neutral', open: 'info', paused: 'warning', joined: 'info',
  working: 'accent', submitted: 'info', reviewing: 'accent',
  winner_selected: 'success', completed: 'success',
  winner_selected_w: 'success', content_requested: 'info', submitted_for_approval: 'accent',
  revision_requested: 'warning', approved: 'info', processing: 'accent', published: 'success',
};

export default function StateBadge({ state, label, className }) {
  return (
    <StatusPill tone={TONES[state] || 'neutral'} className={className}>
      {label || CONTEST_STATE_LABELS[state] || String(state || '').replace(/_/g, ' ')}
    </StatusPill>
  );
}