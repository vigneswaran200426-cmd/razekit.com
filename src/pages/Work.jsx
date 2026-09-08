import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, Plus, Clock, IndianRupee } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, timeLeft } from '@/lib/format';
import { PageHeader, Segmented, EmptyState, Skeleton, Button, Badge } from '@/components/ui';
import ContestCard from '@/components/ContestCard';

const CREATOR_TABS = [{ key: 'active', label: 'Active' }, { key: 'completed', label: 'Completed' }];
const CLIENT_TABS = [{ key: 'all', label: 'All' }, { key: 'live', label: 'Live' }, { key: 'draft', label: 'Drafts' }, { key: 'done', label: 'Completed' }];

function Row({ c }) {
  const isDraft = c.status === 'draft';
  const isDone = ['winner_selected', 'completed'].includes(c.status);
  const tone = isDraft ? 'neutral' : isDone ? 'success' : 'primary';
  const label = isDraft ? 'Draft' : isDone ? 'Completed' : 'Active';
  return (
    <Link to={`/contest/${c.id}`} className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3.5 hover:border-line-strong hover:shadow-xs transition-all">
      <div className="min-w-0"><p className="font-semibold text-sm text-ink truncate">{c.title}</p>
        <p className="text-xs text-muted mt-0.5 nums flex items-center gap-1"><IndianRupee className="w-3 h-3" />{Number(c.prize_amount || 0).toLocaleString('en-IN')}{!isDraft && <> · <Clock className="w-3 h-3" />{timeLeft(c.deadline)}</>}</p></div>
      <Badge tone={tone}>{label}</Badge>
    </Link>
  );
}

export default function Work() {
  const { user, role } = useAuth();
  const isClient = role === 'client';
  const [contests, setContests] = useState(null);
  const [tab, setTab] = useState(isClient ? 'all' : 'active');

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const all = await entities.Contest.list('-created_date', 200).catch(() => []);
      if (isClient) { setContests((all || []).filter((c) => c.created_by_id === user.id)); }
      else {
        const subs = await entities.Submission.filter({ created_by_id: user.id }, '-created_date', 200).catch(() => []);
        const ids = new Set((subs || []).map((s) => s.contest_id));
        setContests((all || []).filter((c) => ids.has(c.id)));
      }
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

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={isClient ? 'Brand' : 'Creator'} title={isClient ? 'My contests' : 'My work'} description={isClient ? 'Every campaign you’ve launched.' : 'Contests you’ve joined and submitted to.'}
        actions={isClient && <Button to="/create-contest"><Plus className="w-4 h-4" />New contest</Button>} />
      <Segmented tabs={isClient ? CLIENT_TABS : CREATOR_TABS} value={tab} onChange={setTab} />
      {!contests ? (
        <div className="space-y-2.5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : list.length ? (
        isClient ? <div className="space-y-2.5">{list.map((c) => <Row key={c.id} c={c} />)}</div>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{list.map((c, i) => <ContestCard key={c.id} contest={c} index={i} />)}</div>
      ) : (
        <EmptyState icon={FolderKanban} title="Nothing here yet" description={isClient ? 'Launch a contest to get started.' : 'Join a contest from Explore to see it here.'}
          action={<Button to={isClient ? '/create-contest' : '/explore'}>{isClient ? 'New contest' : 'Explore contests'}</Button>} />
      )}
    </div>
  );
}
