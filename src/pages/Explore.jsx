import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search, Bell, Compass, Flame, TrendingUp, Plus, FolderOpen,
  ChevronRight, AlertCircle, Sparkles, Clock, IndianRupee,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import ContestCard from '@/components/ContestCard';
import CountdownTimer from '@/components/CountdownTimer';
import { EASE } from '@/lib/motion';

const SORTS = [
  { key: 'newest', label: 'Newest' },
  { key: 'prize', label: 'Top prize' },
  { key: 'deadline', label: 'Closing soon' },
];

const SYMBOL = { INR: '₹', USD: '$' };
const money = (n, c = 'INR') => (SYMBOL[c] || '₹') + Number(n || 0).toLocaleString(c === 'USD' ? 'en-US' : 'en-IN');

function sortContests(list, sort) {
  const arr = [...list];
  if (sort === 'prize') arr.sort((a, b) => (b.prize_amount || 0) - (a.prize_amount || 0));
  else if (sort === 'deadline') arr.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  else arr.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  return arr;
}

/* ── Local chrome (self-contained, design-token driven) ───────────────────── */

function Segmented({ tabs, value, onChange, size = 'md' }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-secondary/70 p-1">
      {tabs.map((t, i) => {
        const key = t.key ?? i;
        const label = t.label ?? t;
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`relative rounded-full font-semibold transition-colors ease-brand ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} ${active ? 'text-ink' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {active && (
              <motion.span layoutId="seg-active" className="absolute inset-0 rounded-full bg-card shadow-elev-1" transition={{ duration: 0.3, ease: EASE }} />
            )}
            <span className="relative z-10">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CategoryPills({ categories, value, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
      {categories.map((c) => {
        const active = value === c;
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium border transition-all ease-brand ${active ? 'bg-ink text-white border-ink' : 'bg-card text-muted-foreground border-border/70 hover:border-primary/40 hover:text-foreground'}`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-card border border-border/60 overflow-hidden">
          <div className="aspect-[16/10] bg-secondary/70 animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="h-4 w-4/5 rounded bg-secondary animate-pulse" />
            <div className="h-4 w-2/5 rounded bg-secondary animate-pulse" />
            <div className="h-10 rounded bg-secondary/60 animate-pulse mt-4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyBlock({ icon: Icon = Compass, title, sub, action }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-card/50 py-10 px-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-heading text-base font-bold text-ink">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{sub}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* Compact horizontal rail card for the "Featured" / "Closing soon" strips. */
function RailCard({ contest }) {
  return (
    <Link
      to={`/contest/${contest.id}`}
      className="group shrink-0 w-[230px] rounded-xl bg-card border border-border/60 p-4 shadow-elev-1 hover:shadow-elev-2 hover:border-primary/30 transition-all ease-brand"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground truncate max-w-[130px]">{contest.category || 'Contest'}</span>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1 nums"><Clock className="w-3 h-3" /><CountdownTimer deadline={contest.deadline} /></span>
      </div>
      <h4 className="mt-3 font-heading font-semibold text-[15px] leading-snug line-clamp-2 text-ink group-hover:text-primary transition-colors">{contest.title}</h4>
      <p className="mt-3 font-heading text-lg font-extrabold text-primary nums">{money(contest.prize_amount, contest.currency)}</p>
    </Link>
  );
}

function Rail({ icon: Icon, title, contests }) {
  if (!contests.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-[18px] h-[18px] text-primary" />
        <h2 className="font-heading text-base font-bold tracking-tight text-ink">{title}</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        {contests.map((c) => <RailCard key={c.id} contest={c} />)}
      </div>
    </section>
  );
}

/* Client management row. */
function ClientRow({ contest }) {
  const isDraft = contest.status === 'draft';
  const isDone = ['winner_selected', 'completed'].includes(contest.status);
  const label = isDraft ? 'Draft' : isDone ? 'Completed' : 'Active';
  const cls = isDraft ? 'text-muted-foreground bg-secondary' : isDone ? 'text-success bg-success/10' : 'text-primary bg-primary/10';
  return (
    <Link to={`/contest/${contest.id}`} className="flex items-center justify-between rounded-xl bg-card border border-border/60 px-4 py-3.5 hover:border-primary/30 hover:shadow-elev-1 transition-all ease-brand">
      <div className="min-w-0">
        <p className="font-semibold text-sm text-ink truncate">{contest.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 nums flex items-center gap-1">
          <IndianRupee className="w-3 h-3" />{Number(contest.prize_amount || 0).toLocaleString('en-IN')}
          {!isDraft && <>· <Clock className="w-3 h-3" /><CountdownTimer deadline={contest.deadline} /></>}
        </p>
      </div>
      <span className={`shrink-0 ml-3 text-[11px] font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>
    </Link>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Explore() {
  const { user } = useAuth();
  const isClient = user?.user_role === 'client';

  const [contests, setContests] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('newest');
  const [tab, setTab] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    base44.entities.Contest.list('-created_date', 60)
      .then((list) => { if (alive) setContests(list || []); })
      .catch(() => { if (alive) setError('We couldn’t load contests. Check your connection and try again.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!user?.id) { setSubmissions([]); return; }
    base44.entities.Submission.list('-created_date', 60).then((l) => setSubmissions(l || [])).catch(() => {});
  }, [user?.id]);

  const openContests = useMemo(() => contests.filter((c) => c.status === 'open'), [contests]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(openContests.map((c) => c.category).filter(Boolean)))], [openContests]);

  const searchMatch = (c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.title?.toLowerCase().includes(q) || c.category?.toLowerCase().includes(q) || c.short_description?.toLowerCase().includes(q);
  };

  const available = useMemo(
    () => sortContests(openContests.filter((c) => searchMatch(c) && (category === 'All' || c.category === category)), sort),
    [openContests, search, category, sort]
  );

  const featured = useMemo(() => sortContests(openContests, 'prize').slice(0, 8), [openContests]);
  const closingSoon = useMemo(
    () => sortContests(openContests.filter((c) => new Date(c.deadline).getTime() > Date.now()), 'deadline').slice(0, 8),
    [openContests]
  );

  // My contests (private, authenticated)
  const mySubIds = submissions.map((s) => s.contest_id);
  const myContests = isClient
    ? contests.filter((c) => c.created_by_id === user?.id)
    : contests.filter((c) => mySubIds.includes(c.id));

  const joined = myContests.filter((c) => ['joined', 'working', 'submitted', 'reviewing'].includes(c.status) && searchMatch(c));
  const creatorCompleted = myContests.filter((c) => ['winner_selected', 'completed'].includes(c.status) && searchMatch(c));
  const clientActive = myContests.filter((c) => !['draft', 'completed', 'winner_selected'].includes(c.status) && searchMatch(c));
  const clientDrafts = myContests.filter((c) => c.status === 'draft' && searchMatch(c));
  const clientCompleted = myContests.filter((c) => ['winner_selected', 'completed'].includes(c.status) && searchMatch(c));

  const TABS = !user
    ? [{ key: 0, label: 'Discover' }]
    : isClient
      ? [{ key: 0, label: 'Active' }, { key: 1, label: 'Drafts' }, { key: 2, label: 'Completed' }]
      : [{ key: 0, label: 'Discover' }, { key: 1, label: 'Joined' }, { key: 2, label: 'Completed' }];

  const showDiscoveryExtras = !isClient && tab === 0 && !loading && !error && !search.trim() && category === 'All' && openContests.length > 3;

  const heading = isClient ? 'Your contests' : 'Discover contests';
  const subheading = isClient ? 'Manage your live campaigns, drafts and results.' : 'Prize-funded creative contests from real brands. Find your next win.';

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="w-3.5 h-3.5" /> {isClient ? 'Brand' : 'Explore'}
            </div>
            <h1 className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{heading}</h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground max-w-xl">{subheading}</p>
          </div>
          <div className="flex items-center gap-2">
            {isClient && (
              <Link to="/create-contest" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-primary-glow hover:brightness-105 active:scale-95 transition-all ease-brand">
                <Plus className="w-4 h-4" /> New contest
              </Link>
            )}
          </div>
        </header>

        {/* Search + filters (discovery only) */}
        {!isClient && tab === 0 && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contests by title or category…"
                className="w-full rounded-xl border border-border/70 bg-card pl-11 pr-4 py-3 text-sm text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary/40 transition"
              />
            </div>
            {categories.length > 1 && <CategoryPills categories={categories} value={category} onChange={setCategory} />}
          </div>
        )}

        {/* Tabs */}
        {user && <Segmented tabs={TABS} value={tab} onChange={setTab} />}

        {/* Discovery rails */}
        {showDiscoveryExtras && (
          <div className="space-y-7">
            <Rail icon={TrendingUp} title="Featured — biggest prizes" contests={featured} />
            <Rail icon={Flame} title="Closing soon" contests={closingSoon} />
          </div>
        )}

        {/* Main content */}
        {error ? (
          <EmptyBlock icon={AlertCircle} title="Something went wrong" sub={error}
            action={<button onClick={() => window.location.reload()} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white">Try again</button>} />
        ) : loading ? (
          <SkeletonGrid />
        ) : isClient ? (
          <ClientPanel tab={tab} active={clientActive} drafts={clientDrafts} completed={clientCompleted} />
        ) : tab === 0 ? (
          available.length ? (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-heading text-lg font-bold tracking-tight text-ink">
                  {search.trim() || category !== 'All' ? 'Results' : 'All contests'}
                  <span className="ml-2 text-muted-foreground font-medium nums text-base">· {available.length}</span>
                </h2>
                <Segmented tabs={SORTS} value={sort} onChange={setSort} size="sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {available.map((c, i) => <ContestCard key={c.id} contest={c} index={i} />)}
              </div>
            </section>
          ) : (
            <EmptyBlock title={search.trim() || category !== 'All' ? 'No matches' : 'No open contests yet'}
              sub={search.trim() || category !== 'All' ? 'Try a different search or category.' : 'New prize-funded contests land here — check back soon.'} />
          )
        ) : tab === 1 ? (
          joined.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{joined.map((c, i) => <ContestCard key={c.id} contest={c} index={i} />)}</div>
            : <EmptyBlock icon={Compass} title="No contests joined yet" sub="Find a contest and start creating to see it here." />
        ) : (
          creatorCompleted.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{creatorCompleted.map((c, i) => <ContestCard key={c.id} contest={c} index={i} />)}</div>
            : <EmptyBlock title="No completed contests" sub="Your finished contests will appear here." />
        )}
      </div>
    </div>
  );
}

function ClientPanel({ tab, active, drafts, completed }) {
  const list = tab === 0 ? active : tab === 1 ? drafts : completed;
  const empties = [
    { title: 'No active contests', sub: 'Publish a contest to start receiving entries.' },
    { title: 'No drafts', sub: 'Unpublished contest drafts appear here.' },
    { title: 'No completed contests', sub: 'Finished campaigns appear here.' },
  ];
  if (!list.length) return <EmptyBlock icon={FolderOpen} title={empties[tab].title} sub={empties[tab].sub}
    action={tab !== 1 ? <Link to="/create-contest" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white"><Plus className="w-4 h-4" /> New contest</Link> : null} />;
  return <div className="space-y-2.5">{list.map((c) => <ClientRow key={c.id} contest={c} />)}</div>;
}
