import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, IndianRupee, Bell, FolderOpen, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

import ContestCard from '@/components/ContestCard';
import CountdownTimer from '@/components/CountdownTimer';
import PageHeader, { SegmentedTabs } from '@/components/ui/PageHeader';
import AlertState from '@/components/alerts/AlertState';
import FilterBar from '@/components/explore/FilterBar';
import DiscoveryRails from '@/components/explore/DiscoveryRails';

const EDITOR_TABS = ['Available', 'Joined', 'Completed'];
const CLIENT_TABS = ['Active', 'Drafts', 'Completed'];

const SORTS = [
  { key: 'newest', label: 'Newest' },
  { key: 'prize', label: 'Top prize' },
  { key: 'deadline', label: 'Closing soon' },
];

const sortContests = (list, sort) => {
  const arr = [...list];
  if (sort === 'prize') arr.sort((a, b) => (b.prize_amount || 0) - (a.prize_amount || 0));
  else if (sort === 'deadline') arr.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  else arr.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  return arr;
};

const SUB_STATUS = {
  joined: { label: 'Working', cls: 'text-blue-500' },
  working: { label: 'Working', cls: 'text-blue-500' },
  submitted: { label: 'Submitted', cls: 'text-amber-500' },
  reviewing: { label: 'In review', cls: 'text-orange-500' },
  winner_selected: { label: 'Winner selected', cls: 'text-purple-500' },
  completed: { label: 'Completed', cls: 'text-muted-foreground' },
};

export default function Explore() {
  // Identity comes from the session provider — no separate local auth state.
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('newest');
  const [contests, setContests] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Contest.list('-created_date', 50)
      .then(setContests)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Submissions are private — fetched only for the authenticated account.
  useEffect(() => {
    if (!user?.id) { setSubmissions([]); return; }
    base44.entities.Submission.list('-created_date', 50)
      .then(setSubmissions)
      .catch(() => {});
  }, [user?.id]);

  const isClient = user?.user_role === 'client';
  // A visitor browses public contests only — no private tabs.
  const TABS = !user ? ['Available'] : isClient ? CLIENT_TABS : EDITOR_TABS;

  const searchMatch = (c) => !search || c.title?.toLowerCase().includes(search.toLowerCase()) || c.category?.toLowerCase().includes(search.toLowerCase());

  // Discovery base — all open contests (real data only).
  const openContests = contests.filter((c) => c.status === 'open');
  const categories = ['All', ...new Set(openContests.map((c) => c.category).filter(Boolean))];

  const available = openContests.filter((c) => searchMatch(c) && (category === 'All' || c.category === category));

  const mySubContestIds = submissions.map((s) => s.contest_id);
  const myContests = isClient
    ? contests.filter((c) => c.created_by_id === user?.id)
    : contests.filter((c) => mySubContestIds.includes(c.id));

  // Creator tabs
  const joined = myContests.filter((c) =>
    ['joined', 'working', 'submitted', 'reviewing'].includes(c.status) && searchMatch(c)
  );
  const creatorCompleted = myContests.filter((c) =>
    ['winner_selected', 'completed'].includes(c.status) && searchMatch(c)
  );

  // Client tabs
  const clientActive = myContests.filter((c) => !['draft', 'completed', 'winner_selected'].includes(c.status) && searchMatch(c));
  const clientDrafts = myContests.filter((c) => c.status === 'draft' && searchMatch(c));
  const clientCompleted = myContests.filter((c) => ['winner_selected', 'completed'].includes(c.status) && searchMatch(c));

  const getWonStatus = (contest) => {
    if (contest.status === 'winner_selected') return SUB_STATUS.winner_selected;
    if (contest.status === 'completed') {
      const mySub = submissions.find((s) => s.contest_id === contest.id);
      if (mySub && contest.winner_submission_id === mySub.id) return { label: 'Won', cls: 'text-success' };
      return { label: 'Closed', cls: 'text-muted-foreground' };
    }
    return null;
  };

  const renderContestItem = (c, statusOverride) => {
    const status = statusOverride || SUB_STATUS[c.status];
    return (
      <Link key={c.id} to={`/contest/${c.id}`} className="flex items-center justify-between glass-card rounded-2xl px-4 py-3.5 hover-lift">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{c.title}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center nums"><IndianRupee className="w-3 h-3 mr-0.5" />{c.prize_amount?.toLocaleString('en-IN')}</span>
            {!isClient && <span className="flex items-center nums"><Clock className="w-3 h-3 mr-0.5" /><CountdownTimer deadline={c.deadline} /></span>}
            {isClient && c.status === 'draft' && <span>Not published</span>}
          </div>
        </div>
        {status && <span className={`text-xs font-medium ${status.cls} shrink-0 ml-3`}>{status.label}</span>}
      </Link>
    );
  };

  const renderClientItem = (c) => {
    const isDraft = c.status === 'draft';
    const isCompleted = ['winner_selected', 'completed'].includes(c.status);
    const label = isDraft ? 'Draft' : isCompleted ? 'Completed' : 'Active';
    const cls = isDraft ? 'text-muted-foreground' : isCompleted ? 'text-success' : 'text-primary';
    return renderContestItem(c, { label, cls });
  };

  const EmptyState = ({ title, sub }) => (
    <AlertState type="empty" compact title={title} description={sub} className="my-2" />
  );

  const renderTab = () => {
    if (loading) {
      return (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-72 surface rounded-2xl overflow-hidden">
              <div className="h-40 bg-secondary/70 animate-pulse" />
              <div className="p-4 space-y-2.5">
                <div className="h-4 w-3/4 rounded bg-secondary animate-pulse" />
                <div className="h-4 w-1/2 rounded bg-secondary animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    const current = TABS[tab];
    if (isClient) {
      switch (current) {
        case 'Active':
          return clientActive.length > 0
            ? <div className="space-y-2">{clientActive.map(renderClientItem)}</div>
            : <EmptyState title="No active contests" sub="Create your first contest to get started." />;
        case 'Drafts':
          return clientDrafts.length > 0
            ? <div className="space-y-2">{clientDrafts.map(renderClientItem)}</div>
            : <EmptyState title="No drafts" sub="Unpublished drafts appear here." />;
        case 'Completed':
          return clientCompleted.length > 0
            ? <div className="space-y-2">{clientCompleted.map(renderClientItem)}</div>
            : <EmptyState title="No completed contests" sub="Finished contests appear here." />;
      }
    } else {
      switch (current) {
        case 'Available':
          return available.length > 0 ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-heading text-base font-bold tracking-tight">
                  All contests <span className="text-muted-foreground font-medium nums">· {available.length}</span>
                </h2>
                <SegmentedTabs tabs={SORTS} value={sort} onChange={setSort} size="sm" />
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {sortContests(available, sort).map((c, i) => <ContestCard key={c.id} contest={c} index={i} />)}
              </div>
            </div>
          ) : (
            <EmptyState title="No contests yet" sub="New opportunities land here — check back soon." />
          );
        case 'Joined':
          return joined.length > 0
            ? <div className="space-y-2">{joined.map((c) => renderContestItem(c))}</div>
            : <EmptyState title="No contests joined yet" sub="Find a contest and start creating." />;
        case 'Completed':
          return creatorCompleted.length > 0
            ? <div className="space-y-2">{creatorCompleted.map((c) => renderContestItem(c, getWonStatus(c)))}</div>
            : <EmptyState title="No completed contests" sub="Your finished contests appear here." />;
      }
    }
  };

  const showDiscovery = !isClient && TABS[tab] === 'Available' && !loading
    && !search && category === 'All' && openContests.length > 3;

  return (
    <div className="page-shell max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto space-y-5 pb-8">
      <PageHeader
        title="Explore"
        subtitle={isClient ? 'Manage your contests.' : 'Find your next win.'}
        actions={user && (
          <Link to="/notifications" aria-label="Notifications" className="w-9 h-9 rounded-full border border-border/70 bg-white/60 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground press transition-colors">
            <Bell className="w-4 h-4" />
          </Link>
        )}
      />

      {/* My contests — authenticated entry */}
      {user && (
        <Link to="/my-contests" className="flex items-center justify-between surface rounded-xl px-4 py-3 hover-lift">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-[18px] h-[18px] text-primary" />
            <p className="text-sm font-medium">My contests</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>
      )}

      {/* Discovery filters — open-contest browsing only */}
      {!isClient && TABS[tab] === 'Available' && (
        <FilterBar
          search={search}
          onSearch={setSearch}
          categories={categories}
          category={category}
          onCategory={setCategory}
        />
      )}

      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />

      {showDiscovery && <DiscoveryRails contests={openContests} />}

      {renderTab()}
    </div>
  );
}