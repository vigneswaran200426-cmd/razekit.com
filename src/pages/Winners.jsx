// Winners (spec 7/8/9/43) — a verified results showcase, not a social feed.
// The leaderboard is integrated here rather than living on its own page, and
// both read finalized data from the scoring engine. Nothing ranks by popularity.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, BarChart3, ShieldCheck, Medal } from 'lucide-react';
import { fn } from '@/lib/api';
import { money, dateShort, initials } from '@/lib/format';
import { PageHeader, Segmented, EmptyState, Skeleton, Badge, Card, Avatar } from '@/components/ui';
import { cn } from '@/lib/cn';

const cover = (id = '') => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 60%), hsl(${(h + 40) % 360} 72% 46%))`;
};

const score = (n) => (typeof n === 'number' ? n.toFixed(1) : null);

/** Winner card — the work first, then who made it, then the result. */
function WinnerCard({ w }) {
  const f = score(w.final_score);
  return (
    <Link
      to={`/contest/${w.contest_id}`}
      className="group flex flex-col rounded-xl border border-line bg-surface overflow-hidden shadow-xs transition-all duration-200 hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {w.cover_image_url
          ? <img src={w.cover_image_url} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          : <div className="w-full h-full" style={{ background: cover(w.contest_id) }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        <Badge tone="success" className="absolute top-2.5 left-2.5">
          <Trophy className="w-3 h-3" aria-hidden="true" /> Winner
        </Badge>

        {/* Final Score is part of the result, not a hidden detail (spec 43). */}
        {f && (
          <div className="absolute top-2.5 right-2.5 rounded-lg bg-white/95 px-2 py-1 text-center shadow-sm">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted leading-none">Final</p>
            <p className="font-display text-sm font-extrabold text-ink nums leading-tight">{f}</p>
          </div>
        )}

        <div className="absolute bottom-2.5 left-3 right-3">
          <p className="font-display font-bold text-white text-[15px] leading-snug line-clamp-2">{w.title}</p>
          {w.brand_name && <p className="text-[11px] text-white/75 mt-0.5">for {w.brand_name}</p>}
        </div>
      </div>

      <div className="p-3.5 space-y-2.5 flex-1 flex flex-col">
        {w.creator_name && (
          <div className="flex items-center gap-2">
            <Avatar name={w.creator_name} size={24} />
            <span className="text-[13px] font-medium text-ink truncate">{w.creator_name}</span>
          </div>
        )}

        {/* Both dimensions, so the result is explainable at a glance. */}
        {(w.engagement_score !== null || w.traffic_score !== null) && (
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-md bg-surface-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wider text-muted">Engagement</p>
              <p className="font-display text-[13px] font-extrabold text-ink nums">{score(w.engagement_score) ?? '—'}</p>
            </div>
            <div className="rounded-md bg-surface-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wider text-muted">Traffic</p>
              <p className="font-display text-[13px] font-extrabold text-ink nums">{score(w.traffic_score) ?? '—'}</p>
            </div>
          </div>
        )}

        <div className="mt-auto flex items-end justify-between pt-1">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted font-medium">Prize won</p>
            <p className="font-display text-lg font-extrabold text-primary nums">{money(w.prize_amount, w.currency)}</p>
          </div>
          {w.finalized_at && <p className="text-[11px] text-muted">{dateShort(w.finalized_at)}</p>}
        </div>
      </div>
    </Link>
  );
}

function Showcase() {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('recent');

  useEffect(() => {
    fn('winnersShowcase', { limit: 60 })
      .then((d) => setItems(d.winners || []))
      .catch(() => setItems([]));
  }, []);

  const sorted = useMemo(() => {
    if (!items) return [];
    const a = [...items];
    if (tab === 'prize') a.sort((x, y) => (y.prize_amount || 0) - (x.prize_amount || 0));
    else if (tab === 'score') a.sort((x, y) => (y.final_score ?? -1) - (x.final_score ?? -1));
    else a.sort((x, y) => Date.parse(y.finalized_at || 0) - Date.parse(x.finalized_at || 0));
    return a;
  }, [items, tab]);

  return (
    <div className="space-y-4">
      <Segmented
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'recent', label: 'Recent' },
          { key: 'score', label: 'Top score' },
          { key: 'prize', label: 'Highest prize' },
        ]}
      />
      {!items ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-xl" />)}
        </div>
      ) : sorted.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((w) => <WinnerCard key={w.submission_id || w.contest_id} w={w} />)}
        </div>
      ) : (
        <EmptyState icon={Trophy} title="No finalized winners yet" description="Winning work appears here once a contest is officially finalized." />
      )}
    </div>
  );
}

const RANK_TONE = ['text-warning', 'text-[#9aa4b2]', 'text-[#b06a2c]'];

function LeaderboardPanel() {
  const [d, setD] = useState(null);
  useEffect(() => { fn('winnersLeaderboard', { limit: 50 }).then(setD).catch(() => setD({ leaderboard: [] })); }, []);

  if (!d) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>;
  const rows = d.leaderboard || [];
  if (!rows.length) return <EmptyState icon={BarChart3} title="No ranked creators yet" description="The leaderboard fills in as contests are finalized." />;

  const top = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="space-y-5">
      {/* Podium */}
      <div className="grid grid-cols-3 gap-3 items-end">
        {[1, 0, 2].map((idx) => {
          const r = top[idx];
          if (!r) return <div key={idx} />;
          const first = idx === 0;
          return (
            <Link key={r.creator_id} to={`/u/${r.creator_id}`}
              className={cn('rounded-xl border bg-surface p-4 text-center shadow-xs transition-all hover:shadow-md hover:-translate-y-0.5',
                first ? 'border-primary/40 bg-gradient-to-b from-primary/[0.06] to-transparent' : 'border-line')}>
              <div className="relative inline-block">
                <Avatar name={r.creator_name || initials(r.creator_id)} size={first ? 60 : 48} className="mx-auto" />
                <span className={cn('absolute -bottom-1 -right-1 grid place-items-center w-6 h-6 rounded-full bg-surface border border-line font-display font-extrabold text-[13px]', RANK_TONE[idx])}>
                  {idx + 1}
                </span>
              </div>
              <p className="mt-2.5 font-display font-bold text-ink text-sm truncate">{r.creator_name || 'Creator'}</p>
              <p className="text-[11px] text-muted nums">{r.wins} {r.wins === 1 ? 'win' : 'wins'} · avg {r.average_final_score ?? '—'}</p>
              <p className={cn('font-display font-extrabold nums mt-1 text-primary', first && 'text-lg')}>{money(r.prize, r.currency || 'INR')}</p>
            </Link>
          );
        })}
      </div>

      {rest.length > 0 && (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 border-b border-line">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">Creator</th>
                <th className="px-3 py-2.5 font-semibold text-right">Wins</th>
                <th className="px-3 py-2.5 font-semibold text-right">Avg score</th>
                <th className="px-4 py-2.5 font-semibold text-right">Prize</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((r) => (
                <tr key={r.creator_id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 nums text-muted">{r.rank}</td>
                  <td className="px-3 py-2.5">
                    <Link to={`/u/${r.creator_id}`} className="font-medium text-ink hover:text-primary">{r.creator_name || 'Creator'}</Link>
                  </td>
                  <td className="px-3 py-2.5 text-right nums">{r.wins}</td>
                  <td className="px-3 py-2.5 text-right nums text-muted">{r.average_final_score ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right nums font-semibold text-primary">{money(r.prize, r.currency || 'INR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-success mt-px" aria-hidden="true" />
        {d.basis}
      </p>
    </div>
  );
}

export default function Winners() {
  const [view, setView] = useState('showcase');
  return (
    <div className="space-y-5">
      <PageHeader
        title="Winners"
        description="Officially finalized winning work, and the creators ranked by real contest performance."
      />
      <Segmented
        value={view}
        onChange={setView}
        tabs={[
          { key: 'showcase', label: 'Winning work' },
          { key: 'leaderboard', label: 'Leaderboard' },
        ]}
      />
      {view === 'showcase' ? <Showcase /> : <LeaderboardPanel />}
    </div>
  );
}
