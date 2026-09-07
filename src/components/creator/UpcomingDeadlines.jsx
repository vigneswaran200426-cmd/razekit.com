import { Link } from 'react-router-dom';
import { CalendarClock, ArrowRight } from 'lucide-react';
import CountdownTimer from '@/components/CountdownTimer';
import GlassCard from '@/components/ui/GlassCard';

// Actionable deadlines only (§13): submissions, handovers and winner flows —
// each row opens the workflow it belongs to.
export default function UpcomingDeadlines({ contests = [], subs = [], handovers = [], winnerPublishes = [] }) {
  const now = Date.now();
  const items = [];

  contests.forEach((c) => {
    if (!['open', 'joined', 'working'].includes(c.status)) return;
    const mySub = subs.find((s) => s.contest_id === c.id);
    const inFlight = mySub && ['working', 'upload_pending', 'uploading', 'processing', 'upload_failed', 'processing_failed'].includes(mySub.status);
    if (mySub && !inFlight) return;
    if (new Date(c.deadline).getTime() > now) {
      items.push({ key: `c-${c.id}`, label: c.title, kind: 'Submission', due: c.deadline, to: `/contest/${c.id}${inFlight ? '/work' : ''}` });
    }
  });

  handovers.forEach((h) => {
    if (['completed', 'expired', 'disputed'].includes(h.status)) return;
    if (h.deadline && new Date(h.deadline).getTime() > now) {
      items.push({ key: `h-${h.id}`, label: h.contest_title || 'Handover', kind: 'Handover', due: h.deadline, to: `/contest/${h.contest_id}/handover` });
    }
  });

  winnerPublishes.forEach((w) => {
    if (w.status !== 'revision_requested') return;
    const contest = contests.find((c) => c.id === w.contest_id);
    if (contest && new Date(contest.deadline).getTime() > now) {
      items.push({ key: `w-${w.id}`, label: contest.title, kind: 'Winner content revision', due: contest.deadline, to: `/contest/${w.contest_id}/winner` });
    }
  });

  const sorted = items.sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 4);

  if (!sorted.length) {
    return (
      <GlassCard className="p-5 text-center">
        <p className="text-sm text-muted-foreground">No upcoming deadlines — you're all clear.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-2">
      {sorted.map((d) => {
        const hoursLeft = (new Date(d.due).getTime() - now) / 3600000;
        const soon = hoursLeft <= 48;
        return (
          <Link key={d.key} to={d.to} className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/60 transition-colors">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${soon ? 'bg-warning/10 text-[#D78C05]' : 'bg-primary/10 text-primary'}`}>
              <CalendarClock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{d.label}</p>
              <p className="text-xs text-muted-foreground">{d.kind}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-xs font-semibold ${soon ? 'text-[#D78C05]' : 'text-foreground'}`}><CountdownTimer deadline={d.due} /></p>
              <p className="text-[11px] text-muted-foreground">{new Date(d.due).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </Link>
        );
      })}
    </GlassCard>
  );
}