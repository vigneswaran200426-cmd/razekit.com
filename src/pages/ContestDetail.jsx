import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Users, Trophy, ShieldCheck, Flag, FileText } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, timeLeft, dateShort } from '@/lib/format';
import { Card, Button, Badge, Skeleton, EmptyState, PageHeader } from '@/components/ui';
import { ContestRequirements } from '@/components/Requirements';

function parseList(json) { try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; } }

function cover(id = '') { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return `linear-gradient(135deg, hsl(${h} 70% 60%), hsl(${(h + 40) % 360} 72% 46%))`; }

// Status is already known from the record — surfacing it saves a guess.
const STATUS = {
  open: { tone: 'primary', label: 'Open for entries' },
  winner_selected: { tone: 'success', label: 'Winner selected' },
  completed: { tone: 'neutral', label: 'Completed' },
};

/** Loading view shaped like the real page: banner, title, brief column, action panel. */
function DetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="w-full aspect-[21/9] rounded-lg" />
      <div className="space-y-2.5">
        <Skeleton className="h-5 w-28 rounded-full" />
        <Skeleton className="h-7 w-2/3 max-w-lg" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div className="space-y-5 min-w-0">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </div>
  );
}

export default function ContestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [contest, setContest] = useState(null);
  const [subs, setSubs] = useState([]);
  const [subsReady, setSubsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    setSubsReady(false);
    entities.Contest.get(id).then((c) => { if (alive) setContest(c); })
      .catch((e) => { if (alive) { setContest(null); setErr(e?.data?.error?.message || e?.message || 'We could not load this contest.'); } })
      .finally(() => { if (alive) setLoading(false); });
    entities.Submission.filter({ contest_id: id }).then((s) => alive && setSubs(s || [])).catch(() => {})
      .finally(() => { if (alive) setSubsReady(true); });
    return () => { alive = false; };
  }, [id]);

  if (loading) return <DetailSkeleton />;
  if (!contest) {
    return (
      <div className="max-w-lg mx-auto space-y-3">
        {err && <div className="rounded-md bg-danger/8 text-danger text-sm px-3 py-2">{err}</div>}
        <EmptyState icon={Flag} title="Contest not found" description="This contest may have been removed." action={<Button to="/explore">Back to Explore</Button>} />
      </div>
    );
  }

  const isOwner = contest.created_by_id === user?.id;
  const isCreator = role === 'creator' || role === 'admin';
  const isWinner = contest.winner_user_id === user?.id;
  const ended = ['winner_selected', 'completed'].includes(contest.status);
  const deliverables = parseList(contest.deliverables);
  const mySub = subs.find((s) => s.created_by_id === user?.id);
  const status = STATUS[contest.status];
  const hasBrief = Boolean(contest.description || contest.contest_rules || deliverables.length);

  const join = async () => {
    if (!user) { navigate('/login'); return; }
    setBusy(true);
    try {
      if (!mySub) await entities.Submission.create({ contest_id: id, client_id: contest.created_by_id, status: 'working' });
      navigate(`/contest/${id}/submit`);
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Explore
      </Link>

      {/* Cover */}
      <Card className="overflow-hidden">
        <div className="relative aspect-[21/9]">
          {contest.cover_image_url
            ? <img src={contest.cover_image_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full" style={{ background: cover(contest.id) }} aria-hidden="true" />}
        </div>
      </Card>

      <div className="space-y-3">
        {(contest.category || status) && (
          <div className="flex flex-wrap items-center gap-2">
            {contest.category && <Badge tone="neutral">{contest.category}</Badge>}
            {status && <Badge tone={status.tone}>{status.label}</Badge>}
          </div>
        )}
        <PageHeader title={contest.title} description={contest.short_description} />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        {/* Main */}
        <div className="order-2 lg:order-1 space-y-5 min-w-0">
          {contest.description && (
            <Card className="p-5"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2.5">Brief</h2>
              <p className="text-sm text-ink/90 leading-relaxed whitespace-pre-line">{contest.description}</p></Card>
          )}
          <ContestRequirements contestId={id} />
          {deliverables.length > 0 && (
            <Card className="p-5"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Deliverables</h2>
              <ul className="grid sm:grid-cols-2 gap-2.5">{deliverables.map((d, i) => (
                <li key={i} className="rounded-md bg-surface-2 px-3.5 py-3"><p className="text-sm font-medium text-ink">{d.name || d.content_type || 'Deliverable'}</p>
                  <p className="text-xs text-muted mt-0.5">{[d.platform, d.duration, d.ratio, d.resolution, d.format].filter(Boolean).join(' · ')}</p></li>))}</ul></Card>
          )}
          {contest.contest_rules && (
            <Card className="p-5"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2.5">Rules</h2>
              <p className="text-sm text-ink/90 leading-relaxed whitespace-pre-line">{contest.contest_rules}</p></Card>
          )}
          {!hasBrief && (
            <EmptyState
              icon={FileText}
              title="No detailed brief yet"
              description="This contest has not published a brief, deliverables or rules. The prize, deadline and winner count on the right are the confirmed terms."
            />
          )}
        </div>

        {/* Action panel */}
        <aside className="order-1 lg:order-2 lg:sticky lg:top-24 space-y-3">
          <Card className="p-5">
            <div className="rounded-md border border-primary/15 bg-primary/5 px-4 py-3.5">
              <p className="text-[11px] uppercase tracking-wide text-muted font-medium">Winner prize</p>
              <p className="font-display text-[32px] leading-none font-extrabold text-primary nums mt-1.5">{money(contest.prize_amount, contest.currency)}</p>
            </div>

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted flex items-center gap-1.5"><Clock className="w-4 h-4" aria-hidden="true" />Ends in</dt>
                <dd className={`font-display font-extrabold nums ${ended ? 'text-muted' : 'text-ink'}`}>{timeLeft(contest.deadline)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted flex items-center gap-1.5"><Users className="w-4 h-4" aria-hidden="true" />Entries</dt>
                <dd className="font-semibold text-ink nums">{subsReady ? subs.length : '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted flex items-center gap-1.5"><Trophy className="w-4 h-4" aria-hidden="true" />Winners</dt>
                <dd className="font-semibold text-ink nums">{contest.number_of_winners || 1}</dd>
              </div>
              {contest.deadline && (
                <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
                  <dt className="text-muted">Deadline</dt>
                  <dd className="font-medium text-ink nums">{dateShort(contest.deadline)}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 space-y-2">
              {isOwner ? (
                <>
                  {subs.length > 0 && !ended && <Button to={`/contest/${id}/review`} className="w-full" size="lg" variant={contest.status === 'open' ? 'secondary' : 'primary'}>Review entries ({subs.filter((s) => s.status !== 'working').length})</Button>}
                  {ended && <Button to={`/contest/${id}/handover`} className="w-full" size="lg">Account handover</Button>}
                  {ended && <Button to={`/contest/${id}/review`} className="w-full" variant="secondary">View entries</Button>}
                  {!ended && subsReady && subs.length === 0 && (
                    <p className="text-center text-[12px] text-muted leading-relaxed">No entries yet. Creators can join until the deadline closes.</p>
                  )}
                </>
              ) : isCreator ? (
                <>
                  {contest.status === 'open' && !mySub && <Button className="w-full" size="lg" loading={busy} onClick={join}>Join contest</Button>}
                  {mySub && ['working', 'joined', 'open'].includes(mySub.status || contest.status) && <Button to={`/contest/${id}/submit`} className="w-full" size="lg">Submit work</Button>}
                  {mySub?.status === 'submitted' && <Button className="w-full" variant="secondary" disabled>Your entry is in review</Button>}
                  {ended && isWinner && <Button to={`/contest/${id}/handover`} className="w-full" size="lg">Account handover</Button>}
                  {ended && !isWinner && <Button to="/explore" className="w-full" variant="secondary">Browse contests</Button>}
                </>
              ) : (
                <Button to="/explore" className="w-full" variant="secondary">Browse contests</Button>
              )}
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-success mt-px" aria-hidden="true" /> Prize held securely until a winner is picked.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
