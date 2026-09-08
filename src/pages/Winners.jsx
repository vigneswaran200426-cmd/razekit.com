import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, BarChart3 } from 'lucide-react';
import { entities } from '@/lib/api';
import { money, dateShort } from '@/lib/format';
import { PageHeader, Segmented, EmptyState, Skeleton, Badge, Button } from '@/components/ui';

function cover(id = '') { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return `linear-gradient(135deg, hsl(${h} 70% 60%), hsl(${(h + 40) % 360} 72% 46%))`; }

function WinnerCard({ c }) {
  return (
    <Link to={`/contest/${c.id}`} className="group rounded-lg border border-line bg-surface overflow-hidden shadow-xs hover:shadow-md hover:border-line-strong transition-all">
      <div className="relative aspect-[16/10]">
        {c.cover_image_url ? <img src={c.cover_image_url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="w-full h-full" style={{ background: cover(c.id) }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/55 to-transparent" />
        <Badge tone="success" className="absolute top-2.5 left-2.5"><Trophy className="w-3 h-3" /> Winner</Badge>
        <div className="absolute bottom-2.5 left-2.5 right-2.5">
          <p className="font-display font-bold text-white text-[15px] leading-snug line-clamp-2">{c.title}</p>
        </div>
      </div>
      <div className="p-3.5 flex items-center justify-between">
        <div><p className="text-[10px] uppercase tracking-wide text-muted font-medium">Prize won</p><p className="font-display text-lg font-extrabold text-primary nums">{money(c.prize_amount, c.currency)}</p></div>
        {c.completed_at && <p className="text-xs text-muted">{dateShort(c.completed_at)}</p>}
      </div>
    </Link>
  );
}

export default function Winners() {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('recent');

  useEffect(() => {
    Promise.all([
      entities.Contest.filter({ status: 'completed' }, '-created_date', 60).catch(() => []),
      entities.Contest.filter({ status: 'winner_selected' }, '-created_date', 60).catch(() => []),
    ]).then(([a, b]) => setItems([...(a || []), ...(b || [])].filter((c) => c.winner_user_id)));
  }, []);

  const sorted = useMemo(() => {
    if (!items) return [];
    const a = [...items];
    if (tab === 'prize') a.sort((x, y) => (y.prize_amount || 0) - (x.prize_amount || 0));
    else a.sort((x, y) => new Date(y.completed_at || y.winner_selected_at || y.created_date) - new Date(x.completed_at || x.winner_selected_at || x.created_date));
    return a;
  }, [items, tab]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Winners Hub" title="The work that won" description="Winning creative from across the RazeKit marketplace."
        actions={<Button to="/leaderboard" variant="secondary"><BarChart3 className="w-4 h-4" />Leaderboard</Button>} />
      <Segmented tabs={[{ key: 'recent', label: 'Recent' }, { key: 'prize', label: 'Highest prize' }]} value={tab} onChange={setTab} />
      {!items ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : sorted.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{sorted.map((c) => <WinnerCard key={c.id} c={c} />)}</div>
      ) : (
        <EmptyState icon={Trophy} title="No winners yet" description="Winning work will be showcased here once contests complete." />
      )}
    </div>
  );
}
