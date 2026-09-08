import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Users, Trophy, ShieldCheck, Flag } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, timeLeft, dateShort } from '@/lib/format';
import { Card, Button, Badge, Spinner, EmptyState } from '@/components/ui';

function parseList(json) { try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; } }

function cover(id = '') { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return `linear-gradient(135deg, hsl(${h} 70% 60%), hsl(${(h + 40) % 360} 72% 46%))`; }

export default function ContestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [contest, setContest] = useState(null);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    entities.Contest.get(id).then((c) => { if (alive) setContest(c); })
      .catch(() => { if (alive) setContest(null); })
      .finally(() => { if (alive) setLoading(false); });
    entities.Submission.filter({ contest_id: id }).then((s) => alive && setSubs(s || [])).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  if (loading) return <div className="min-h-[50vh] grid place-items-center"><Spinner className="w-7 h-7" /></div>;
  if (!contest) return <EmptyState icon={Flag} title="Contest not found" description="This contest may have been removed." action={<Button to="/explore">Back to Explore</Button>} />;

  const isOwner = contest.created_by_id === user?.id;
  const isCreator = role === 'creator' || role === 'admin';
  const isWinner = contest.winner_user_id === user?.id;
  const ended = ['winner_selected', 'completed'].includes(contest.status);
  const deliverables = parseList(contest.deliverables);
  const mySub = subs.find((s) => s.created_by_id === user?.id);

  const join = async () => {
    if (!user) { navigate('/login'); return; }
    setBusy(true);
    try {
      if (!mySub) await entities.Submission.create({ contest_id: id, client_id: contest.created_by_id, status: 'working' });
      navigate(`/contest/${id}/submit`);
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4"><ArrowLeft className="w-4 h-4" /> Explore</Link>

      {/* Hero */}
      <Card className="overflow-hidden mb-6">
        <div className="relative aspect-[21/9]">
          {contest.cover_image_url ? <img src={contest.cover_image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: cover(contest.id) }} />}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 p-5 sm:p-6">
            {contest.category && <Badge tone="ink" className="mb-2">{contest.category}</Badge>}
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight max-w-3xl">{contest.title}</h1>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        {/* Main */}
        <div className="space-y-5 min-w-0">
          {contest.short_description && <p className="text-[15px] text-muted leading-relaxed">{contest.short_description}</p>}
          {contest.description && (
            <Card className="p-5"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2.5">Brief</h2>
              <p className="text-sm text-ink/90 leading-relaxed whitespace-pre-line">{contest.description}</p></Card>
          )}
          {deliverables.length > 0 && (
            <Card className="p-5"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Deliverables</h2>
              <div className="grid sm:grid-cols-2 gap-2.5">{deliverables.map((d, i) => (
                <div key={i} className="rounded-md bg-surface-2 px-3.5 py-3"><p className="text-sm font-medium text-ink">{d.name || d.content_type || 'Deliverable'}</p>
                  <p className="text-xs text-muted mt-0.5">{[d.platform, d.duration, d.ratio, d.resolution, d.format].filter(Boolean).join(' · ')}</p></div>))}</div></Card>
          )}
          {contest.contest_rules && (
            <Card className="p-5"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2.5">Rules</h2>
              <p className="text-sm text-ink/90 leading-relaxed whitespace-pre-line">{contest.contest_rules}</p></Card>
          )}
        </div>

        {/* Sticky action panel */}
        <aside className="lg:sticky lg:top-24 space-y-3">
          <Card className="p-5">
            <p className="text-[11px] uppercase tracking-wide text-muted font-medium">Winner prize</p>
            <p className="font-display text-3xl font-extrabold text-primary nums mt-0.5">{money(contest.prize_amount, contest.currency)}</p>
            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted flex items-center gap-1.5"><Clock className="w-4 h-4" />Ends in</span><span className="font-semibold text-ink nums">{timeLeft(contest.deadline)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted flex items-center gap-1.5"><Users className="w-4 h-4" />Entries</span><span className="font-semibold text-ink nums">{subs.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted flex items-center gap-1.5"><Trophy className="w-4 h-4" />Winners</span><span className="font-semibold text-ink nums">{contest.number_of_winners || 1}</span></div>
              {contest.deadline && <div className="flex items-center justify-between"><span className="text-muted">Deadline</span><span className="font-medium text-ink">{dateShort(contest.deadline)}</span></div>}
            </div>
            <div className="mt-5 space-y-2">
              {isOwner ? (
                <>
                  {['open', 'draft'].includes(contest.status) && <Button to={`/contest/${id}/fund`} className="w-full">Fund contest</Button>}
                  {subs.length > 0 && !ended && <Button to={`/contest/${id}/review`} className="w-full" variant={contest.status === 'open' ? 'secondary' : 'primary'}>Review entries ({subs.filter((s) => s.status !== 'working').length})</Button>}
                  {ended && <Button to={`/contest/${id}/handover`} className="w-full">Account handover</Button>}
                  {ended && <Button to={`/contest/${id}/review`} className="w-full" variant="secondary">View entries</Button>}
                </>
              ) : isCreator ? (
                <>
                  {contest.status === 'open' && !mySub && <Button className="w-full" loading={busy} onClick={join}>Join contest</Button>}
                  {mySub && ['working', 'joined', 'open'].includes(mySub.status || contest.status) && <Button to={`/contest/${id}/submit`} className="w-full">Submit work</Button>}
                  {mySub?.status === 'submitted' && <Button className="w-full" variant="secondary" disabled>Your entry is in review</Button>}
                  {ended && isWinner && <Button to={`/contest/${id}/handover`} className="w-full">Account handover</Button>}
                  {ended && !isWinner && <Button to="/explore" className="w-full" variant="secondary">Browse contests</Button>}
                </>
              ) : (
                <Button to="/explore" className="w-full" variant="secondary">Browse contests</Button>
              )}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted"><ShieldCheck className="w-3.5 h-3.5 text-success" /> Prize held securely until a winner is picked.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
