import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Compass, Flame, TrendingUp, AlertCircle, Clock } from 'lucide-react';
import { entities } from '@/lib/api';
import { money, timeLeft } from '@/lib/format';
import { PageHeader, Input, Segmented, EmptyState, Skeleton, Button } from '@/components/ui';
import ContestCard from '@/components/ContestCard';

const SORTS = [{ key: 'newest', label: 'Newest' }, { key: 'prize', label: 'Top prize' }, { key: 'deadline', label: 'Closing soon' }];

function sortBy(list, key) {
  const a = [...list];
  if (key === 'prize') a.sort((x, y) => (y.prize_amount || 0) - (x.prize_amount || 0));
  else if (key === 'deadline') a.sort((x, y) => new Date(x.deadline) - new Date(y.deadline));
  else a.sort((x, y) => new Date(y.created_date) - new Date(x.created_date));
  return a;
}

function RailCard({ c }) {
  return (
    <Link to={`/contest/${c.id}`} className="group shrink-0 w-[220px] rounded-lg border border-line bg-surface p-3.5 shadow-xs hover:shadow-md hover:border-line-strong transition-all">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-surface-2 text-muted truncate max-w-[120px]">{c.category || 'Contest'}</span>
        <span className="text-[11px] text-muted nums flex items-center gap-1"><Clock className="w-3 h-3" />{timeLeft(c.deadline)}</span>
      </div>
      <h4 className="mt-2.5 font-display font-semibold text-[15px] leading-snug line-clamp-2 text-ink group-hover:text-primary transition-colors">{c.title}</h4>
      <p className="mt-2.5 font-display text-lg font-extrabold text-primary nums">{money(c.prize_amount, c.currency)}</p>
    </Link>
  );
}

function Rail({ icon: Icon, title, items }) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-ink"><Icon className="w-[18px] h-[18px] text-primary" />{title}</h2>
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">{items.map((c) => <RailCard key={c.id} c={c} />)}</div>
    </section>
  );
}

export default function Explore() {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    entities.Contest.filter({ status: 'open' }, '-created_date', 60)
      .then((l) => { if (alive) setContests(l || []); })
      .catch(() => { if (alive) setError('We couldn’t load contests. Try again.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const cats = useMemo(() => ['All', ...Array.from(new Set(contests.map((c) => c.category).filter(Boolean)))], [contests]);
  const filtered = useMemo(() => sortBy(contests.filter((c) =>
    (cat === 'All' || c.category === cat) &&
    (!q.trim() || `${c.title} ${c.category} ${c.short_description}`.toLowerCase().includes(q.toLowerCase()))), sort),
    [contests, q, cat, sort]);
  const featured = useMemo(() => sortBy(contests, 'prize').slice(0, 8), [contests]);
  const soon = useMemo(() => sortBy(contests.filter((c) => new Date(c.deadline) > Date.now()), 'deadline').slice(0, 8), [contests]);
  const showRails = !loading && !error && !q.trim() && cat === 'All' && contests.length > 3;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Explore" title="Discover contests" description="Prize-funded creative contests from real brands. Find your next win." />

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contests by title or category…" className="pl-9 h-11" />
      </div>

      {cats.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium border transition-all ${cat === c ? 'bg-ink text-white border-ink' : 'bg-surface text-muted border-line hover:border-line-strong hover:text-ink'}`}>{c}</button>
          ))}
        </div>
      )}

      {showRails && <div className="space-y-6"><Rail icon={TrendingUp} title="Featured — biggest prizes" items={featured} /><Rail icon={Flame} title="Closing soon" items={soon} /></div>}

      {error ? (
        <EmptyState icon={AlertCircle} title="Something went wrong" description={error} action={<Button onClick={() => window.location.reload()}>Try again</Button>} />
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="rounded-lg border border-line overflow-hidden"><Skeleton className="aspect-[16/9] rounded-none" /><div className="p-3.5 space-y-2.5"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-6 w-2/5" /></div></div>)}
        </div>
      ) : filtered.length ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">{q.trim() || cat !== 'All' ? 'Results' : 'All contests'}<span className="ml-2 text-muted font-medium nums text-base">· {filtered.length}</span></h2>
            <Segmented tabs={SORTS} value={sort} onChange={setSort} size="sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{filtered.map((c, i) => <ContestCard key={c.id} contest={c} index={i} />)}</div>
        </section>
      ) : (
        <EmptyState icon={Compass} title={q.trim() || cat !== 'All' ? 'No matches' : 'No open contests yet'} description={q.trim() || cat !== 'All' ? 'Try a different search or category.' : 'New prize-funded contests land here — check back soon.'} />
      )}
    </div>
  );
}
