import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Trophy, Check, Film, ExternalLink } from 'lucide-react';
import { entities, uploads, fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { initials } from '@/lib/format';
import { Card, Button, Badge, Spinner, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';

const STATUS_TONE = { won: 'success', shortlisted: 'primary', not_selected: 'neutral', submitted: 'warning', working: 'neutral' };

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

  const rate = async (sub, rating) => { await entities.Submission.update(sub.id, { rating }).catch(() => {}); setSel((p) => ({ ...p, rating })); loadSubs(); };

  // Winner finalization is server-authoritative: the browser may only REQUEST it.
  // The backend re-checks ownership and contest state, applies the RazeKit
  // performance score (and refuses any override of it), writes the audit record
  // and notifies the winner. See server/src/functions/winner.ts.
  const pickWinner = async (sub) => {
    if (!confirm('Select this entry as the winner? This finalizes judging.')) return;
    setBusy(true); setErr('');
    try {
      const r = await fn('winnerFinalize', { contest_id: id, submission_id: sub.id });
      if (r?.error) { setErr(r.error.message || 'Could not finalize the winner.'); return; }
      navigate(`/contest/${id}`);
    } catch (e) {
      setErr(e?.data?.error?.message || e.message || 'Could not finalize the winner.');
    } finally { setBusy(false); }
  };

  if (subs === null) return <div className="min-h-[50vh] grid place-items-center"><Spinner className="w-7 h-7" /></div>;

  return (
    <div className="space-y-5">
      <Link to={`/contest/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="w-4 h-4" /> Contest</Link>
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Judging</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">{contest?.title}</h1>
          <p className="text-sm text-muted mt-0.5 nums">{subs.length} {subs.length === 1 ? 'entry' : 'entries'}</p></div>
      </div>

      {err && <div className="rounded-md bg-danger/8 text-danger text-sm px-3 py-2">{err}</div>}

      {subs.length === 0 ? (
        <EmptyState icon={Film} title="No entries yet" description="Submissions will appear here for you to review and judge." />
      ) : (
        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
          {/* List */}
          <div className="space-y-2 lg:max-h-[70vh] lg:overflow-y-auto no-scrollbar">
            {subs.map((s) => (
              <button key={s.id} onClick={() => setSel(s)}
                className={cn('w-full flex items-center gap-3 rounded-md border bg-surface p-2.5 text-left transition-all', sel?.id === s.id ? 'border-primary shadow-xs' : 'border-line hover:border-line-strong')}>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-white text-[11px] font-bold shrink-0">{initials('C ' + (s.created_by_id || '').slice(-3))}</span>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink truncate">{s.title || `Entry ${s.id.slice(-4).toUpperCase()}`}</p>
                  <p className="text-xs text-muted">{s.platform || '—'}</p></div>
                {s.status && s.status !== 'submitted' && <Badge tone={STATUS_TONE[s.status]} className="capitalize shrink-0">{s.status.replace('_', ' ')}</Badge>}
              </button>
            ))}
          </div>

          {/* Detail */}
          {sel && (
            <Card className="overflow-hidden">
              <div className="aspect-video bg-ink grid place-items-center">
                {media ? (media.match(/\.(mp4|webm|mov)/i) || sel.media_kind === 'video'
                  ? <video src={media} controls className="w-full h-full" />
                  : <img src={media} alt="" className="w-full h-full object-contain" />)
                  : sel.live_url ? <a href={sel.live_url} target="_blank" rel="noreferrer" className="text-white/80 hover:text-white flex items-center gap-2"><ExternalLink className="w-5 h-5" /> Open live entry</a>
                  : <Spinner className="w-6 h-6 text-white" />}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="font-display text-lg font-bold text-ink">{sel.title || 'Untitled entry'}</h2>
                    {sel.description && <p className="text-sm text-muted mt-1 leading-relaxed">{sel.description}</p>}</div>
                  {sel.status === 'won' && <Badge tone="success"><Trophy className="w-3 h-3" /> Winner</Badge>}
                </div>

                <div className="mt-4 flex items-center gap-1">
                  <span className="text-sm text-muted mr-2">Rate:</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => rate(sel, n)} aria-label={`${n} stars`}><Star className={cn('w-5 h-5', n <= (sel.rating || 0) ? 'fill-warning text-warning' : 'text-line-strong')} /></button>
                  ))}
                </div>

                {contest && !['winner_selected', 'completed'].includes(contest.status) && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button loading={busy} onClick={() => pickWinner(sel)}><Trophy className="w-4 h-4" /> Select as winner</Button>
                    <Button variant="secondary" loading={busy} onClick={() => setStatus(sel, sel.status === 'shortlisted' ? 'submitted' : 'shortlisted')}>
                      <Check className="w-4 h-4" /> {sel.status === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
