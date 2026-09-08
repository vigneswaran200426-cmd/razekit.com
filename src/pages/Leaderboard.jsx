import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Medal } from 'lucide-react';
import { entities } from '@/lib/api';
import { money } from '@/lib/format';
import { PageHeader, Card, Segmented, EmptyState, Skeleton, Avatar } from '@/components/ui';
import { cn } from '@/lib/cn';

const RANK_STYLE = ['text-warning', 'text-[#9aa4b2]', 'text-[#b06a2c]'];

function Podium({ rows }) {
  const top = rows.slice(0, 3);
  const order = [1, 0, 2]; // 2nd, 1st, 3rd
  return (
    <div className="grid grid-cols-3 gap-3 items-end">
      {order.map((idx) => {
        const r = top[idx]; if (!r) return <div key={idx} />;
        const first = idx === 0;
        return (
          <Link key={r.userId} to={r.userId ? `/u/${r.userId}` : '#'} className={cn('rounded-lg border bg-surface p-4 text-center shadow-xs hover:shadow-md transition-all', first ? 'border-primary/40' : 'border-line')}>
            <div className="relative inline-block">
              <Avatar name={r.name} src={r.avatar} size={first ? 64 : 52} className="mx-auto" />
              <span className={cn('absolute -bottom-1 -right-1 grid place-items-center w-6 h-6 rounded-full bg-surface border border-line font-display font-extrabold text-[13px]', RANK_STYLE[idx])}>{idx + 1}</span>
            </div>
            <p className="mt-2.5 font-display font-bold text-ink text-sm truncate">{r.name}</p>
            <p className="text-xs text-muted nums">{r.wins} {r.wins === 1 ? 'win' : 'wins'}</p>
            <p className={cn('font-display font-extrabold nums mt-1', first ? 'text-lg text-primary' : 'text-primary')}>{money(r.prize)}</p>
          </Link>
        );
      })}
    </div>
  );
}

export default function Leaderboard() {
  const [tab, setTab] = useState('all');
  const [contests, setContests] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [monthly, setMonthly] = useState(null);

  useEffect(() => {
    Promise.all([
      entities.Contest.filter({ status: 'completed' }, '-created_date', 200).catch(() => []),
      entities.Contest.filter({ status: 'winner_selected' }, '-created_date', 200).catch(() => []),
    ]).then(([a, b]) => setContests([...(a || []), ...(b || [])].filter((c) => c.winner_user_id)));
    entities.UserProfile.list('-created_date', 500).then((l) => {
      const m = {}; (l || []).forEach((p) => { m[p.user_id] = p; }); setProfiles(m);
    }).catch(() => {});
    const month = new Date().toISOString().slice(0, 7);
    entities.MonthlyLeaderboard.filter({ month }, 'rank', 100).then((l) => setMonthly(l || [])).catch(() => setMonthly([]));
  }, []);

  const allTime = useMemo(() => {
    if (!contests) return [];
    const by = {};
    contests.forEach((c) => { const u = c.winner_user_id; if (!u) return; by[u] = by[u] || { userId: u, wins: 0, prize: 0 }; by[u].wins++; by[u].prize += Number(c.prize_amount || 0); });
    return Object.values(by).map((r) => { const p = profiles[r.userId]; return { ...r, name: p?.display_name || p?.username || `Creator ${r.userId.slice(-4).toUpperCase()}`, avatar: p?.avatar_url }; })
      .sort((a, b) => b.wins - a.wins || b.prize - a.prize);
  }, [contests, profiles]);

  const monthlyRows = useMemo(() => (monthly || []).map((m) => ({ userId: m.user_id, name: m.display_name || m.username || 'Creator', avatar: m.avatar_url, wins: m.verified_wins || 0, prize: m.monthly_earnings || 0 })), [monthly]);

  const rows = tab === 'month' ? monthlyRows : allTime;
  const loading = tab === 'month' ? monthly === null : contests === null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Rankings" title="Leaderboard" description="Ranked by verified wins and prize value — real performance, no points system." />
      <Segmented tabs={[{ key: 'all', label: 'All time' }, { key: 'month', label: 'This month' }]} value={tab} onChange={setTab} />

      {loading ? (
        <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>
      ) : rows.length ? (
        <div className="space-y-5">
          {rows.length >= 3 && <Podium rows={rows} />}
          <Card className="overflow-hidden">
            <div className="grid grid-cols-[48px_1fr_80px_120px] gap-3 px-4 py-2.5 border-b border-line text-[11px] font-semibold uppercase tracking-wide text-muted">
              <span>Rank</span><span>Creator</span><span className="text-right">Wins</span><span className="text-right">Prize value</span>
            </div>
            {rows.map((r, i) => (
              <Link key={r.userId} to={r.userId ? `/u/${r.userId}` : '#'} className="grid grid-cols-[48px_1fr_80px_120px] gap-3 px-4 py-3 items-center hover:bg-surface-2/60 transition-colors border-b border-line last:border-0">
                <span className={cn('font-display font-extrabold nums', i < 3 ? RANK_STYLE[i] : 'text-muted')}>{i < 3 ? <Medal className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} /> : i + 1}</span>
                <span className="flex items-center gap-2.5 min-w-0"><Avatar name={r.name} src={r.avatar} size={32} /><span className="font-medium text-sm text-ink truncate">{r.name}</span></span>
                <span className="text-right text-sm font-semibold text-ink nums">{r.wins}</span>
                <span className="text-right text-sm font-semibold text-primary nums">{money(r.prize)}</span>
              </Link>
            ))}
          </Card>
        </div>
      ) : (
        <EmptyState icon={Trophy} title={tab === 'month' ? 'No ranking this month yet' : 'No winners yet'} description="Rankings appear as creators win contests." />
      )}
    </div>
  );
}
