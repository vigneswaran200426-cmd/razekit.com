// Brand judging screen (spec 27).
// Clients can inspect performance but cannot edit it: the winner is decided by
// the RazeKit scoring engine, and finalization is a server-side request.
import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Trophy, Check, Film, ExternalLink, ShieldCheck } from 'lucide-react';
import { entities, uploads, fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, Button, Badge, Spinner, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { ScoreBreakdown, ScorePill, ScoreStateBadge } from '@/components/Score';
import { ComplianceResult } from '@/components/Requirements';
import { cn } from '@/lib/cn';

const STATUS_TONE = { won: 'success', shortlisted: 'primary', not_selected: 'neutral', submitted: 'warning', working: 'neutral' };

const entryLabel = (s) => s.title || `Entry ${String(s.id).slice(-4).toUpperCase()}`;

/** Loading view shaped like the real two-column judging layout. */
function ReviewSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-4 w-20" />
      <div className="space-y-2"><Skeleton className="h-7 w-64" /><Skeleton className="h-4 w-24" /></div>
      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}</div>
        <Skeleton className="h-[420px] rounded-lg" />
      </div>
    </div>
  );
}

export default function Review() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contest, setContest] = useState(null);
  const [subs, setSubs] = useState(null);
  const [sel, setSel] = useState(null);
  const [media, setMedia] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadSubs = async () => {
    const s = await entities.Submission.filter({ contest_id: id }, '-created_date', 100).catch(() => []);
    const submitted = (s || []).filter((x) => x.status !== 'working');
    setSubs(submitted);
    if (submitted.length && !sel) setSel(submitted[0]);
    return submitted;
  };

  useEffect(() => { entities.Contest.get(id).then(setContest).catch(() => {}); loadSubs(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    setMedia(null);
    if (sel?.final_asset_uri) uploads.signedUrl(sel.final_asset_uri, 3600).then(({ signed_url }) => setMedia(signed_url)).catch(() => {});
  }, [sel?.id]);

  const setStatus = async (sub, status) => {
    setBusy(true);
    try { await entities.Submission.update(sub.id, { status }); await loadSubs(); setSel((p) => (p?.id === sub.id ? { ...p, status } : p)); }
    finally { setBusy(false); }
  };

  const rate = async (sub, rating) => {
    await entities.Submission.update(sub.id, { rating }).catch(() => {});
    setSel((p) => ({ ...p, rating }));
    loadSubs();
  };

  // Winner finalization is server-authoritative: the browser may only REQUEST it.
  // The backend re-checks ownership and contest state, applies the RazeKit
  // performance score (and refuses any override of it), writes the audit record
  // and notifies the winner. See server/src/functions/winner.ts.
  const pickWinner = async (sub) => {
    if (!confirm('Finalize this contest? The winner is decided by the RazeKit performance score and cannot be changed afterwards.')) return;
    setBusy(true); setErr('');
    try {
      const r = await fn('winnerFinalize', { contest_id: id, submission_id: sub.id });
      if (r?.error) { setErr(r.error.message || 'Could not finalize the winner.'); return; }
      navigate(`/contest/${id}`);
    } catch (e) {
      setErr(e?.data?.error?.message || e.message || 'Could not finalize the winner.');
    } finally { setBusy(false); }
  };

  if (subs === null) return <ReviewSkeleton />;

  const finalized = contest && ['winner_selected', 'completed'].includes(contest.status);
  const scored = subs.some((s) => typeof s.final_score === 'number');

  return (
    <div className="space-y-5">
      <Link to={`/contest/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Contest
      </Link>

      <PageHeader
        title={contest?.title || 'Judging'}
        description={`${subs.length} ${subs.length === 1 ? 'entry' : 'entries'} submitted${scored ? ' · ranked by performance score' : ''}`}
      />

      {err && <div className="rounded-md bg-danger/8 text-danger text-sm px-3 py-2" role="alert">{err}</div>}

      {subs.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No entries yet"
          description="Submissions appear here as creators enter. You can review and shortlist them before the contest closes."
          action={<Button to={`/contest/${id}`} variant="secondary">Back to contest</Button>}
        />
      ) : (
        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
          {/* Entry list */}
          <ul className="space-y-2 lg:max-h-[70vh] lg:overflow-y-auto no-scrollbar" aria-label="Submitted entries">
            {subs.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setSel(s)}
                  aria-current={sel?.id === s.id}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-md border bg-surface p-2.5 text-left transition-all duration-200',
                    sel?.id === s.id ? 'border-primary shadow-xs' : 'border-line hover:border-line-strong hover:shadow-xs'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{entryLabel(s)}</p>
                    <p className="text-xs text-muted">{s.platform || 'No platform set'}</p>
                  </div>
                  {typeof s.final_score === 'number' && (
                    <span className="shrink-0 text-right">
                      <span className="block text-[9px] uppercase tracking-wider text-muted leading-none">Final</span>
                      <ScorePill value={s.final_score} />
                    </span>
                  )}
                  {s.status && s.status !== 'submitted' && (
                    <Badge tone={STATUS_TONE[s.status]} className="capitalize shrink-0">{String(s.status).replace('_', ' ')}</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* Selected entry */}
          {sel && (
            <div className="space-y-4 min-w-0">
              <Card className="overflow-hidden">
                <div className="aspect-video bg-ink grid place-items-center">
                  {media
                    ? (media.match(/\.(mp4|webm|mov)/i) || sel.media_kind === 'video'
                        ? <video src={media} controls className="w-full h-full" />
                        : <img src={media} alt={entryLabel(sel)} className="w-full h-full object-contain" />)
                    : sel.live_url
                      ? <a href={sel.live_url} target="_blank" rel="noreferrer" className="text-white/80 hover:text-white flex items-center gap-2">
                          <ExternalLink className="w-5 h-5" aria-hidden="true" /> Open live entry
                        </a>
                      : <Spinner className="w-6 h-6 text-white" />}
                </div>

                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-bold text-ink">{entryLabel(sel)}</h2>
                      {sel.description && <p className="text-sm text-muted mt-1 leading-relaxed">{sel.description}</p>}
                    </div>
                    {sel.status === 'won' && <Badge tone="success"><Trophy className="w-3 h-3" aria-hidden="true" /> Winner</Badge>}
                  </div>

                  {/* Private note to the brand — does not affect the outcome. */}
                  <div className="flex items-center gap-1" role="group" aria-label="Your private rating">
                    <span className="text-sm text-muted mr-2">Your note:</span>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => rate(sel, n)} aria-label={`Rate ${n} of 5`} aria-pressed={n <= (sel.rating || 0)}>
                        <Star className={cn('w-5 h-5 transition-colors', n <= (sel.rating || 0) ? 'fill-warning text-warning' : 'text-line-strong hover:text-muted')} aria-hidden="true" />
                      </button>
                    ))}
                  </div>

                  {!finalized && (
                    <div className="flex flex-wrap gap-2">
                      <Button loading={busy} onClick={() => pickWinner(sel)}>
                        <Trophy className="w-4 h-4" aria-hidden="true" /> Finalize winner
                      </Button>
                      <Button variant="secondary" loading={busy} onClick={() => setStatus(sel, sel.status === 'shortlisted' ? 'submitted' : 'shortlisted')}>
                        <Check className="w-4 h-4" aria-hidden="true" /> {sel.status === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>

              {/* Requirement check comes BEFORE performance (spec 28). */}
              <ComplianceResult submissionId={sel.id} />

              {/* Performance — inspectable, not editable (spec 27). */}
              <Card className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Performance</h2>
                  {sel.score_state && <ScoreStateBadge state={sel.score_state} />}
                </div>
                {typeof sel.final_score === 'number' ? (
                  <ScoreBreakdown
                    engagement={sel.engagement_score}
                    traffic={sel.traffic_score}
                    final={sel.final_score}
                    state={sel.score_state || 'final'}
                  />
                ) : (
                  <p className="text-sm text-muted">
                    No performance data for this entry yet. Scores appear once the creator&rsquo;s work is published and verified activity is recorded.
                  </p>
                )}
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-success mt-px" aria-hidden="true" />
                  You can inspect performance, but scores are calculated by RazeKit and cannot be edited. The winner is the highest Final Score.
                </p>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
