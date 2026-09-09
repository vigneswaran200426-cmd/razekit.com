// Work — the creator's submissions and the brand's own contests, in one place.
// Presentation only: the data it reads is exactly what the list/filter calls return.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, Plus, Clock, Compass, Trophy, FileText } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, timeLeft } from '@/lib/format';
import { PageHeader, Segmented, EmptyState, Skeleton, Button, Badge, Card } from '@/components/ui';
import ContestCard from '@/components/ContestCard';

const CREATOR_TABS = [{ key: 'active', label: 'Active' }, { key: 'completed', label: 'Completed' }];
const CLIENT_TABS = [{ key: 'all', label: 'All' }, { key: 'live', label: 'Live' }, { key: 'draft', label: 'Drafts' }, { key: 'done', label: 'Completed' }];

/** One brand contest — a flat, scannable row. Same target as the card grid. */
function Row({ c }) {
  const isDraft = c.status === 'draft';
  const isDone = ['winner_selected', 'completed'].includes(c.status);
  const tone = isDraft ? 'neutral' : isDone ? 'success' : 'primary';
  const label = isDraft ? 'Draft' : isDone ? 'Completed' : 'Active';
  return (
    <Card
      as={Link}
      hover
      to={`/contest/${c.id}`}
      className="group flex items-center justify-between gap-3 px-4 py-3.5 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <div className="min-w-0">
        <p className="font-semibold text-sm text-ink truncate transition-colors group-hover:text-primary">{c.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
          <span className="font-display font-extrabold text-ink nums">{money(c.prize_amount, c.currency)}</span>
          {!isDraft && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 nums">
                <Clock className="w-3 h-3" aria-hidden="true" />{timeLeft(c.deadline)}
              </span>
            </>
          )}
        </p>
      </div>
      <Badge tone={tone}>{label}</Badge>
    </Card>
  );
}

/** Loading placeholders shaped like the content they replace. */
function RowSkeleton() {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 shadow-xs">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2 max-w-[240px]" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-5 w-16" />
    </li>
  );
}

function CardSkeleton() {
  return (
    <li className="rounded-lg border border-line bg-surface p-3 shadow-xs space-y-3">
      <Skeleton className="aspect-[16/9] w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="flex items-end justify-between gap-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-14" />
      </div>
      <Skeleton className="h-3 w-2/3" />
    </li>
  );
}

export default function Work() {
  const { user, role } = useAuth();
  const isClient = role === 'client';
  const [contests, setContests] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState(isClient ? 'all' : 'active');

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      let bad = false;
      const all = await entities.Contest.list('-created_date', 200).catch(() => { bad = true; return []; });
      if (isClient) { setContests((all || []).filter((c) => c.created_by_id === user.id)); }
      else {
        const subs = await entities.Submission.filter({ created_by_id: user.id }, '-created_date', 200).catch(() => { bad = true; return []; });
        const ids = new Set((subs || []).map((s) => s.contest_id));
        setContests((all || []).filter((c) => ids.has(c.id)));
      }
      setFailed(bad);
    })();
  }, [user?.id, isClient]);

  const list = useMemo(() => {
    if (!contests) return [];
    if (isClient) {
      if (tab === 'live') return contests.filter((c) => !['draft', 'completed', 'winner_selected'].includes(c.status));
      if (tab === 'draft') return contests.filter((c) => c.status === 'draft');
      if (tab === 'done') return contests.filter((c) => ['winner_selected', 'completed'].includes(c.status));
      return contests;
    }
    if (tab === 'completed') return contests.filter((c) => ['winner_selected', 'completed'].includes(c.status));
    return contests.filter((c) => ['open', 'joined', 'working', 'submitted', 'reviewing'].includes(c.status));
  }, [contests, tab, isClient]);

  // Empty copy is specific to who you are and which tab you're standing on.
  const empty = useMemo(() => {
    const none = !contests?.length;
    if (isClient) {
      if (none) {
        return {
          icon: FolderKanban,
          title: 'You haven’t launched a contest yet',
          description: 'Publish a prize-funded contest and creators can start submitting to it.',
          action: <Button to="/create-contest" variant="secondary"><Plus className="w-4 h-4" aria-hidden="true" />New contest</Button>,
        };
      }
      if (tab === 'live') {
        return {
          icon: FolderKanban,
          title: 'Nothing live right now',
          description: 'Contests show here while they’re open and creators are still submitting.',
          action: <Button variant="secondary" onClick={() => setTab('all')}>See all contests</Button>,
        };
      }
      if (tab === 'draft') {
        return {
          icon: FileText,
          title: 'No drafts saved',
          description: 'Drafts stay private here until you publish them — creators can’t see them yet.',
          action: <Button to="/create-contest" variant="secondary"><Plus className="w-4 h-4" aria-hidden="true" />New contest</Button>,
        };
      }
      return {
        icon: Trophy,
        title: 'No completed contests yet',
        description: 'A contest moves here once its winner is selected and the result is final.',
        action: <Button variant="secondary" onClick={() => setTab('all')}>See all contests</Button>,
      };
    }
    if (none) {
      return {
        icon: Compass,
        title: 'You haven’t joined a contest yet',
        description: 'Every contest you enter shows up here with its status and deadline.',
        action: <Button to="/explore">Explore contests</Button>,
      };
    }
    if (tab === 'completed') {
      return {
        icon: Trophy,
        title: 'No completed contests yet',
        description: 'Your entries move here once judging closes and the results are final.',
        action: <Button variant="secondary" onClick={() => setTab('active')}>See active contests</Button>,
      };
    }
    return {
      icon: Compass,
      title: 'Nothing active right now',
      description: 'Your entries are all wrapped up. Pick up a new contest to work on.',
      action: <Button to="/explore">Explore contests</Button>,
    };
  }, [contests, isClient, tab]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={isClient ? 'My contests' : 'My work'}
        description={isClient ? 'Every campaign you’ve launched.' : 'Contests you’ve joined and submitted to.'}
        actions={isClient && <Button to="/create-contest"><Plus className="w-4 h-4" aria-hidden="true" />New contest</Button>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
          <Segmented tabs={isClient ? CLIENT_TABS : CREATOR_TABS} value={tab} onChange={setTab} />
        </div>
        {contests && list.length > 0 && (
          <p className="text-xs text-muted nums">{list.length} {list.length === 1 ? 'contest' : 'contests'}</p>
        )}
      </div>

      {failed && (
        <div className="rounded-md bg-danger/8 text-danger text-sm px-3 py-2">
          Some contests couldn’t be loaded just now. Refresh to try again.
        </div>
      )}

      {!contests ? (
        isClient ? (
          <ul className="space-y-2.5">{Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)}</ul>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}</ul>
        )
      ) : list.length ? (
        isClient ? (
          <ul className="space-y-2.5">{list.map((c) => <li key={c.id}><Row c={c} /></li>)}</ul>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map((c, i) => <li key={c.id} className="h-full"><ContestCard contest={c} index={i} /></li>)}
          </ul>
        )
      ) : (
        <EmptyState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
      )}
    </div>
  );
}
