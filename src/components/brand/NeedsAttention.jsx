import { Link } from 'react-router-dom';
import { FileVideo, CheckCircle2, FolderOpen, Trophy, Share2, ArrowRight, CheckCircle2 as CaughtIcon } from 'lucide-react';

/*
  Brand "Needs attention" — a compact task list, not a card of rows.
  Every item is derived from current workflow state and carries exactly one
  quiet action. Historical events never appear here. When there is nothing
  to do, it collapses to a single quiet line — never a half-screen empty state.
*/
export default function NeedsAttention({ contests = [], subs = [], winnerPublishes = [], handovers = [], connections = [] }) {
  const items = [];

  // Submissions waiting for review, grouped per contest
  const byContest = new Map();
  subs.filter((s) => ['ready_to_review', 'submitted'].includes(s.status)).forEach((s) => {
    byContest.set(s.contest_id, (byContest.get(s.contest_id) || 0) + 1);
  });
  byContest.forEach((n, cid) => {
    const c = contests.find((x) => x.id === cid);
    items.push({
      key: `rev-${cid}`, icon: FileVideo, tone: 'text-primary bg-primary/10',
      title: `${n} submission${n > 1 ? 's' : ''} waiting for review`,
      meta: c?.title,
      actionLabel: 'Review', to: `/contest/${cid}/review`,
    });
  });

  // Winner content waiting on the brand's approval
  winnerPublishes.filter((w) => w.status === 'submitted_for_approval').forEach((w) => {
    items.push({
      key: `appr-${w.id}`, icon: CheckCircle2, tone: 'text-[#D78C05] bg-[#FFF9E6]',
      title: 'Winner content awaiting your approval',
      meta: w.title,
      actionLabel: 'Approve', to: `/contest/${w.contest_id}/winner`,
    });
  });

  // Handover waiting on the brand
  handovers.filter((h) => ['initiated', 'in_progress', 'winner_confirmed'].includes(h.status)).forEach((h) => {
    items.push({
      key: `hov-${h.id}`, icon: FolderOpen, tone: 'text-primary bg-primary/10',
      title: h.status === 'winner_confirmed' ? 'Confirm the completed handover' : 'Handover in progress',
      meta: h.contest_title,
      actionLabel: 'Open', to: `/contest/${h.contest_id}/handover`,
    });
  });

  // Deadline passed with entries in — pick a winner
  const now = new Date();
  contests.filter((c) => ['submitted', 'reviewing'].includes(c.status) && new Date(c.deadline) < now).forEach((c) => {
    items.push({
      key: `win-${c.id}`, icon: Trophy, tone: 'text-[#D78C05] bg-[#FFF9E6]',
      title: 'Select a winner',
      meta: c.title,
      actionLabel: 'Choose winner', to: `/contest/${c.id}/winner`,
    });
  });

  // Social account that lost authorization
  connections.filter((cn) => cn.status === 'needs_reconnect').forEach((cn) => {
    items.push({
      key: `soc-${cn.id}`, icon: Share2, tone: 'text-destructive bg-destructive/5',
      title: `Reconnect your ${cn.platform} account`,
      meta: 'Social tracking is paused for this platform',
      actionLabel: 'Reconnect', to: '/social-accounts',
    });
  });

  if (!items.length) {
    return (
      <div className="flex items-center gap-2 px-1 py-2.5">
        <CaughtIcon className="w-4 h-4 text-success shrink-0" />
        <p className="text-sm font-medium">All caught up</p>
        <p className="text-xs text-muted-foreground">Nothing waiting</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60 -mx-1">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Link key={it.key} to={it.to} className="group flex items-center gap-3 px-1 py-2.5 transition-colors hover:bg-secondary/40 rounded-lg">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${it.tone}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{it.title}</p>
              {it.meta && <p className="text-xs text-muted-foreground truncate">{it.meta}</p>}
            </div>
            <span className="flex items-center gap-0.5 text-xs font-semibold text-primary shrink-0 transition-all duration-200 ease-brand group-hover:gap-1.5">
              {it.actionLabel} <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}