import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Circle, Clock, IndianRupee } from 'lucide-react';
import StateBadge from '@/components/workflow/StateBadge';
import PlatformIcon from '@/components/social/PlatformIcon';
import { brandNextAction } from '@/lib/workflows';
import { campaignProgress, socialNextAction, timeAgo } from '@/lib/social-tracker';

const ACTIVE = ['open', 'joined', 'working', 'submitted', 'reviewing'];

// One command-center row per contest: stage, social distribution, content
// progress and the single most important next action — all derived from
// real records, never fabricated.
function rowModel(contest, { subs, posts, winnerPublishes, handovers }) {
  const subsFor = subs.filter((s) => s.contest_id === contest.id);
  const postsFor = posts.filter((p) => p.contest_id === contest.id);
  const progress = campaignProgress(contest, postsFor);
  const wp = winnerPublishes.find((w) => w.contest_id === contest.id);
  const hov = handovers.find((h) => h.contest_id === contest.id);
  const action = brandNextAction(contest, {
    winnerPublish: wp, handover: hov, submissionsCount: subsFor.length,
  });
  const social = socialNextAction(contest, postsFor);
  const rowAction = action && !(action.passive && social) ? action : social || action;
  const lastActivity = [contest, ...subsFor, ...postsFor, wp]
    .map((r) => r?.updated_date).filter(Boolean).sort().pop();
  const payment = contest.status === 'completed' ? 'Confirmed' : contest.winner_user_id ? 'In progress' : null;
  const postWin = hov
    ? `Handover: ${hov.status === 'completed' ? 'Completed' : hov.status.replace(/_/g, ' ')}`
    : contest.post_winner_action === 'CLIENT_COLLABORATION'
      ? (contest.status === 'completed' ? 'Collaboration: Completed' : 'Collaboration: Active')
      : null;
  return { subsFor, progress, rowAction, lastActivity, payment, postWin, wp };
}

function SocialPills({ progress }) {
  if (!progress.total) return <span className="text-xs text-muted-foreground/60">No destinations</span>;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {progress.platforms.map((p) => (
        <span key={p.platform} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <PlatformIcon platform={p.platform} className="w-3 h-3" />
          {p.published > 0 ? <CheckCircle2 className="w-3 h-3 text-success" aria-label="published" /> : <Circle className="w-3 h-3 text-muted-foreground/50" aria-label="pending" />}
        </span>
      ))}
      <span className="text-[11px] font-medium text-muted-foreground">{progress.publishedPlatforms}/{progress.total} published</span>
    </div>
  );
}

export default function CampaignCommandTable({ contests = [], subs = [], posts = [], winnerPublishes = [], handovers = [] }) {
  if (!contests.length) return null;
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block glass-card rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <th className="px-4 py-3 font-semibold">Campaign</th>
              <th className="px-3 py-3 font-semibold">Stage</th>
              <th className="px-3 py-3 font-semibold">Social</th>
              <th className="px-3 py-3 font-semibold">Next Action</th>
              <th className="px-3 py-3 font-semibold">Deadline</th>
              <th className="px-4 py-3 font-semibold text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            {contests.map((c) => {
              const m = rowModel(c, { subs, posts, winnerPublishes, handovers });
              return (
                <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/contest/${c.id}`} className="font-medium hover:text-primary truncate max-w-64 block">{c.title}</Link>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><IndianRupee className="w-3 h-3" />{c.prize_amount?.toLocaleString('en-IN')} · {m.subsFor.length} entries{m.subsFor.some((s) => s.status === 'shortlisted') ? ` · ${m.subsFor.filter((s) => s.status === 'shortlisted').length} shortlisted` : ''}</p>
                  </td>
                  <td className="px-3 py-3">
                    <StateBadge state={c.status} />
                    <p className="text-[11px] text-muted-foreground mt-1">Payment: {m.payment || '—'}</p>
                    {m.postWin && <p className="text-[11px] text-muted-foreground">{m.postWin}</p>}
                  </td>
                  <td className="px-3 py-3"><SocialPills progress={m.progress} /></td>
                  <td className="px-3 py-3 max-w-56">
                    {m.rowAction ? (
                      <>
                        <Link to={m.rowAction.to} className="text-xs font-semibold text-primary hover:underline">{m.rowAction.label}</Link>
                        {m.rowAction.hint && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{m.rowAction.hint}</p>}
                      </>
                    ) : <span className="text-xs text-muted-foreground/70">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {ACTIVE.includes(c.status) ? <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(c.deadline).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span> : m.lastActivity ? `Activity ${timeAgo(m.lastActivity)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right"><Link to={`/contest/${c.id}`} aria-label={`Open ${c.title}`} className="inline-flex w-7 h-7 rounded-lg bg-secondary items-center justify-center text-muted-foreground hover:text-foreground"><ArrowRight className="w-3.5 h-3.5" /></Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards — recomposed, not a shrunken table (§63) */}
      <div className="md:hidden space-y-3">
        {contests.map((c) => {
          const m = rowModel(c, { subs, posts, winnerPublishes, handovers });
          return (
            <div key={c.id} className="glass-card rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/contest/${c.id}`} className="font-heading font-semibold text-sm hover:text-primary">{c.title}</Link>
                <StateBadge state={c.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><IndianRupee className="w-3 h-3" />{c.prize_amount?.toLocaleString('en-IN')} · {m.subsFor.length} entries · Payment: {m.payment || '—'}</p>
              {m.postWin && <p className="text-[11px] text-muted-foreground">{m.postWin}</p>}
              <div className="mt-2"><SocialPills progress={m.progress} /></div>
              {m.rowAction && (
                <Link to={m.rowAction.to} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">{m.rowAction.label} <ArrowRight className="w-3 h-3" /></Link>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}