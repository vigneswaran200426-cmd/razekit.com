import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ContestRow from '@/components/ContestRow';
import PageHeader, { SegmentedTabs } from '@/components/ui/PageHeader';
import AlertState from '@/components/alerts/AlertState';

const CREATOR_TABS = ['Working', 'Submitted', 'Waiting', 'Won', 'Lost', 'Archived'];
const CLIENT_TABS = ['Active', 'Reviewing', 'Completed', 'Draft'];

export default function MyContests() {
  const [user, setUser] = useState(null);
  const [contests, setContests] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData = await base44.auth.me().catch(() => null);
        setUser(userData);
        const [contestData, subData] = await Promise.all([
          base44.entities.Contest.list('-created_date', 100).catch(() => []),
          base44.entities.Submission.list('-created_date', 200).catch(() => []),
        ]);
        setContests(Array.isArray(contestData) ? contestData : []);
        setSubmissions(Array.isArray(subData) ? subData : []);
      } finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const isClient = user?.user_role === 'client';
  const tabs = isClient ? CLIENT_TABS : CREATOR_TABS;
  const mySubmissions = useMemo(() => submissions.filter((s) => s.created_by_id === user?.id || s.creator_id === user?.id), [submissions, user?.id]);
  const mySubmissionByContest = useMemo(() => Object.fromEntries(mySubmissions.map((s) => [s.contest_id, s])), [mySubmissions]);

  let filtered = [];
  if (isClient) {
    const mine = contests.filter((c) => c.created_by_id === user?.id);
    switch (tabs[tab]) {
      case 'Active': filtered = mine.filter((c) => ['scheduled', 'open', 'joined', 'working', 'paused', 'extended', 'ending'].includes(c.status)); break;
      case 'Reviewing': filtered = mine.filter((c) => ['submitted', 'reviewing', 'under_review'].includes(c.status)); break;
      case 'Completed': filtered = mine.filter((c) => ['winner_selected', 'completed'].includes(c.status)); break;
      case 'Draft': filtered = mine.filter((c) => c.status === 'draft'); break;
      default: break;
    }
  } else {
    const joined = contests.filter((c) => mySubmissionByContest[c.id]);
    switch (tabs[tab]) {
      case 'Working': filtered = joined.filter((c) => ['working', 'joined', 'in_progress'].includes(mySubmissionByContest[c.id]?.status)); break;
      case 'Submitted': filtered = joined.filter((c) => ['submitted', 'processing'].includes(mySubmissionByContest[c.id]?.status)); break;
      case 'Waiting': filtered = joined.filter((c) => ['shortlisted', 'reviewing'].includes(mySubmissionByContest[c.id]?.status) || ['submitted', 'reviewing'].includes(c.status)); break;
      case 'Won': filtered = joined.filter((c) => c.winner_user_id === user?.id || mySubmissionByContest[c.id]?.status === 'won'); break;
      case 'Lost': filtered = joined.filter((c) => mySubmissionByContest[c.id]?.status === 'lost'); break;
      case 'Archived': filtered = joined.filter((c) => ['completed', 'cancelled', 'expired'].includes(c.status)); break;
      default: break;
    }
  }

  return (
    <div className="page-shell pb-10">
      <div className="max-w-6xl mx-auto space-y-5">
        <PageHeader title="My contests" subtitle={isClient ? 'Manage your contest lifecycle.' : 'Track every entry from work to result.'} actions={isClient ? <Link to="/create-contest" className="rz-primary-action inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold"><Sparkles className="w-4 h-4" /> New contest</Link> : undefined} />
        <div className="flex items-center justify-between gap-3 overflow-x-auto"><SegmentedTabs tabs={tabs} value={tab} onChange={setTab} /><span className="text-xs text-muted-foreground nums whitespace-nowrap">{filtered.length} shown</span></div>
        {loading ? <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 surface animate-pulse" />)}</div> : filtered.length > 0 ? <div className="surface overflow-hidden divide-y divide-border/60">{filtered.map((contest) => <ContestRow key={contest.id} contest={contest} submission={mySubmissionByContest[contest.id]} />)}</div> : <AlertState type="empty" compact title="No contests here" description={isClient ? 'Create a contest or switch to another lifecycle view.' : 'Your entries will appear here as you join contests.'} className="my-2" />}
      </div>
    </div>
  );
}
