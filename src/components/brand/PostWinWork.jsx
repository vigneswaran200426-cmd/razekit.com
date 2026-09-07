import { Link } from 'react-router-dom';
import { FolderOpen, Users, CheckCircle2, ArrowRight } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import AlertState from '@/components/alerts/AlertState';

const HANDOVER_ACTIVE = ['initiated', 'in_progress', 'winner_confirmed', 'client_confirmed'];

/*
  Compact post-win summary: Handover / Collaboration / Winner Content progress.
  Contest lifecycle stages — kept separate from social tracking. Every value is
  derived from real workflow records.
*/
export default function PostWinWork({ handovers = [], contests = [], winnerPublishes = [] }) {
  const activeHandovers = handovers.filter((h) => HANDOVER_ACTIVE.includes(h.status));
  const collabs = contests.filter((c) => c.status === 'winner_selected' && c.post_winner_action === 'CLIENT_COLLABORATION');
  const doneContent = winnerPublishes.filter((w) => ['approved', 'published'].includes(w.status));
  const openContent = winnerPublishes.find((w) => !['approved', 'published'].includes(w.status));

  const rows = [];
  if (handovers.length) {
    rows.push({
      key: 'handover', icon: FolderOpen, label: 'Handover',
      value: activeHandovers.length ? `${activeHandovers.length} in progress` : 'Completed',
      active: activeHandovers.length > 0,
      to: activeHandovers[0] ? `/contest/${activeHandovers[0].contest_id}/handover` : null,
    });
  }
  if (collabs.length) {
    rows.push({
      key: 'collab', icon: Users, label: 'Collaboration',
      value: `${collabs.length} active`, active: true,
      to: `/contest/${collabs[0].id}/winner`,
    });
  }
  if (winnerPublishes.length) {
    rows.push({
      key: 'content', icon: CheckCircle2, label: 'Winner Content',
      value: `${doneContent.length} / ${winnerPublishes.length} complete`,
      active: doneContent.length < winnerPublishes.length,
      to: openContent ? `/contest/${openContent.contest_id}/winner` : null,
    });
  }

  if (!rows.length) {
    return <AlertState state="ALL_CAUGHT_UP" className="max-w-none" />;
  }

  return (
    <GlassCard className="p-5 space-y-2.5">
      {rows.map((r) => {
        const Icon = r.icon;
        return (
          <div key={r.key} className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${r.active ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.value}</p>
            </div>
            {r.to && (
              <Link to={r.to} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0">
                Open <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        );
      })}
    </GlassCard>
  );
}