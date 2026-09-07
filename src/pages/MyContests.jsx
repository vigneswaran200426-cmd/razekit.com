import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ContestRow from '@/components/ContestRow';
import PageHeader, { SegmentedTabs } from '@/components/ui/PageHeader';
import AlertState from '@/components/alerts/AlertState';

const EDITOR_TABS = ['Working', 'Submitted', 'Waiting', 'Won', 'Lost', 'Archived'];
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
        const contestData = await base44.entities.Contest.list('-created_date', 50);
        setContests(contestData);
        const subData = await base44.entities.Submission.list('-created_date', 50).catch(() => []);
        setSubmissions(subData);
      } catch (e) {} finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const isClient = user?.user_role === 'client';
  const tabs = isClient ? CLIENT_TABS : EDITOR_TABS;

  let filtered = [];
  if (isClient) {
    const myContests = contests.filter(c => c.created_by_id === user?.id);
    switch (tabs[tab]) {
      case 'Active': filtered = myContests.filter(c => ['open', 'joined', 'working'].includes(c.status)); break;
      case 'Reviewing': filtered = myContests.filter(c => ['submitted', 'reviewing'].includes(c.status)); break;
      case 'Completed': filtered = myContests.filter(c => ['winner_selected', 'completed'].includes(c.status)); break;
      case 'Draft': filtered = myContests.filter(c => c.status === 'draft'); break;
    }
  } else {
    const mySubContestIds = submissions.map(s => s.contest_id);
    const myContests = contests.filter(c => mySubContestIds.includes(c.id));
    switch (tabs[tab]) {
      case 'Working': filtered = myContests.filter(c => ['joined', 'working'].includes(c.status)); break;
      case 'Submitted': filtered = myContests.filter(c => c.status === 'submitted'); break;
      case 'Waiting': filtered = myContests.filter(c => c.status === 'reviewing'); break;
      case 'Won': filtered = myContests.filter(c => c.status === 'winner_selected' || (c.status === 'completed' && c.winner_submission_id && submissions.find(s => s.contest_id === c.id && s.id === c.winner_submission_id))); break;
      case 'Lost': filtered = myContests.filter(c => c.status === 'completed' && (!c.winner_submission_id || !submissions.find(s => s.contest_id === c.id && s.id === c.winner_submission_id))); break;
      case 'Archived': filtered = myContests.filter(c => c.status === 'completed'); break;
    }
  }

  return (
    <div className="page-shell max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto space-y-5 pb-8">
      <PageHeader
        title="My contests"
        subtitle={isClient ? 'Created, in review, completed.' : 'Joined, submitted, won.'}
        actions={isClient && (
          <Link to="/create-contest" className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-sm hover:bg-[#0B48E8] hover:shadow-primary-glow hover:-translate-y-px transition-all press">
            <Sparkles className="w-4 h-4" /> New
          </Link>
        )}
      />

      <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 glass-card rounded-xl animate-pulse" />)}</div>
      ) : filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map(c => <ContestRow key={c.id} contest={c} />)}
        </div>
      ) : (
        <AlertState type="empty" compact title="No contests here" description="Nothing in this tab yet." className="my-2" />
      )}
    </div>
  );
}