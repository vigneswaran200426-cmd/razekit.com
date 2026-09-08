import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Play, Check, ChevronLeft, ChevronRight, ArrowLeft, Film, Lock, SlidersHorizontal } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import StarRating from '@/components/reviews/StarRating';
import EmptyState from '@/components/ui/EmptyState';
import { SegmentedTabs } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/use-toast';
import WorkflowSteps from '@/components/redesign/WorkflowSteps';

const RETENTION_DAYS = 30;
const STATUS_CHIP = { submitted: 'bg-secondary text-muted-foreground', shortlisted: 'bg-primary/10 text-primary' };
const FLOW = [{ label: 'Review' }, { label: 'Shortlist' }, { label: 'Winner' }];

export default function Review() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contest, setContest] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('new');
  const { toast } = useToast();
  const touchStartX = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const contestData = await base44.entities.Contest.get(id);
        setContest(contestData);
        const subs = await base44.entities.Submission.filter({ contest_id: id }, '-created_date', 100);
        setSubmissions(subs.filter((s) => ['submitted', 'shortlisted'].includes(s.status)));
      } catch {
        setContest(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const visible = useMemo(() => {
    const list = submissions.filter((s) => statusFilter === 'all' || s.status === statusFilter);
    return sort === 'new' ? list : [...list].reverse();
  }, [submissions, statusFilter, sort]);
  const current = visible[currentIndex];

  useEffect(() => {
    let active = true;
    (async () => {
      const sub = visible[currentIndex];
      if (!sub) { setPlaybackUrl(null); return; }
      const uri = sub.final_asset_uri || sub.preview_asset || sub.video_url;
      if (!uri) { if (active) setPlaybackUrl(null); return; }
      if (sub.final_asset_uri || !/^https?:\/\//.test(uri)) {
        try {
          const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 });
          if (active) setPlaybackUrl(signed_url);
        } catch { if (active) setPlaybackUrl(null); }
      } else if (active) setPlaybackUrl(uri);
    })();
    return () => { active = false; };
  }, [visible, currentIndex]);

  useEffect(() => { setCurrentIndex((i) => Math.min(i, Math.max(0, visible.length - 1))); }, [statusFilter, sort, visible.length]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.target?.tagName || '').match(/INPUT|TEXTAREA|SELECT/)) return;
      if (e.key === 'ArrowRight') setCurrentIndex((i) => Math.min(visible.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setCurrentIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible.length]);

  const goNext = () => setCurrentIndex((i) => Math.min(visible.length - 1, i + 1));
  const goPrev = () => setCurrentIndex((i) => Math.max(0, i - 1));

  const handleShortlist = async () => {
    const sub = current;
    if (!sub) return;
    try {
      await base44.entities.Submission.update(sub.id, { status: 'shortlisted', client_feedback: feedback.trim() });
      setSubmissions((prev) => prev.map((s) => s.id === sub.id ? { ...s, status: 'shortlisted' } : s));
      toast({ title: 'Added to shortlist' });
      goNext();
    } catch (e) {
      toast({ title: 'Could not shortlist submission', description: e?.message || 'Please try again.', variant: 'destructive' });
    }
  };

  const handleSelectWinner = async () => {
    const sub = current;
    if (!sub || selecting) return;
    if (!rating) {
      toast({ title: 'Rating required', description: 'Rate the submission before selecting the winner.', variant: 'destructive' });
      return;
    }
    const confirmed = window.confirm(`Select this creator as the winner? This will finalize the contest winner and start the handover workflow.`);
    if (!confirmed) return;
    setSelecting(true);
    try {
      const latest = await base44.entities.Contest.get(id);
      if (!['reviewing', 'submitted', 'open'].includes(latest.status)) {
        toast({ title: 'Winner selection unavailable', description: `Contest is currently ${latest.status}.`, variant: 'destructive' });
        return;
      }
      const now = new Date().toISOString();
      const retentionUntil = new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString();
      await base44.entities.Submission.update(sub.id, { status: 'won', rating, client_feedback: feedback.trim(), delivery_status: 'deliverable' });
      await base44.entities.Contest.update(id, {
        status: 'winner_selected', winner_submission_id: sub.id, winner_user_id: sub.created_by_id,
        winner_selected_at: now, delivery_status: 'deliverable',
      });
      await Promise.all(submissions.filter((o) => o.id !== sub.id && o.status !== 'won').map((o) => base44.entities.Submission.update(o.id, { status: 'lost', retention_until: retentionUntil }).catch(() => {})));
      await base44.entities.Handover.create({
        contest_id: id, contest_title: latest.title, client_id: latest.created_by_id, winner_id: sub.created_by_id,
        handover_type: 'both', status: 'not_started', handover_items: '[]',
        event_log: JSON.stringify([{ actor: 'system', actor_id: '', action: 'winner_selected', detail: '', time: now }]),
      }).catch(() => {});
      await base44.entities.Notification.create({ type: 'contest_win', title: 'You won the contest', description: `Your submission was selected for "${latest.title}".`, contest_id: id, recipient_user_id: sub.created_by_id }).catch(() => {});
      toast({ title: 'Winner selected', description: 'The handover workflow is now ready.' });
      navigate(`/contest/${id}/winner`);
    } catch (e) {
      toast({ title: 'Winner selection failed', description: e?.message || 'No winner state was confirmed. Please retry.', variant: 'destructive' });
    } finally {
      setSelecting(false);
    }
  };

  if (loading) return <div className="page-shell grid place-items-center min-h-[55vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" role="status" aria-label="Loading submissions" /></div>;
  if (!contest) return <div className="page-shell"><div className="rz-empty"><div><h1 className="font-heading text-xl font-bold">Contest not found</h1><p className="mt-1 text-sm text-muted-foreground">The review workspace is unavailable for this contest.</p><Button asChild className="mt-4"><Link to="/explore">Back to Explore</Link></Button></div></div></div>;
  if (submissions.length === 0) return <div className="page-shell max-w-2xl mx-auto pb-8"><EmptyState icon={Film} title="No submissions yet" message="Creator entries appear here as soon as they submit." actionLabel="Back to contest" to={`/contest/${id}`} /></div>;

  const meta = (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><span className="font-heading text-sm font-bold text-primary">{(current?.created_by_id || '?').slice(-1).toUpperCase()}</span></div>
      <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{current?.title || `Version ${current?.version || ''}`}</p><p className="text-xs text-muted-foreground">Creator #{current?.created_by_id?.slice(-4)?.toUpperCase()} · v{current?.version || '?'} · {current?.submitted_at ? new Date(current.submitted_at).toLocaleDateString('en-IN') : 'Pending'}</p></div>
      {current?.final_asset_uri && <span className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-secondary text-muted-foreground shrink-0"><Lock className="w-3 h-3" /> Final ready</span>}
    </div>
  );

  const controls = (
    <div className="space-y-4">
      <div><p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Rate this creator</p><StarRating value={rating} onChange={setRating} size="lg" /><p className="text-xs text-muted-foreground mt-2">{rating === 0 ? 'Rating is required for winner selection' : `${rating} star${rating > 1 ? 's' : ''}`}</p></div>
      <div><label htmlFor="review-feedback" className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">Feedback</label><textarea id="review-feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="Leave clear feedback for the creator" className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm resize-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" /></div>
      <div className="grid grid-cols-2 gap-2.5"><Button variant="outline" onClick={handleShortlist} disabled={current?.status === 'shortlisted'}>Shortlist</Button><Button variant="outline" onClick={goNext} disabled={currentIndex >= visible.length - 1}>Next <ChevronRight className="w-4 h-4" /></Button></div>
      <Button onClick={handleSelectWinner} disabled={selecting} className="rz-primary-action w-full h-11">{selecting ? 'Finalizing winner…' : <><Check className="w-4 h-4 mr-2" /> Select winner</>}</Button>
      <p className="text-[11px] text-muted-foreground">Winner selection is final for this workflow and opens handover. Review the creator, rating and feedback before confirming.</p>
    </div>
  );

  return (
    <div className="page-shell pb-8">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <Link to={`/contest/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-1 press"><ArrowLeft className="w-4 h-4" /> {contest.title}</Link>
        <WorkflowSteps steps={FLOW} current={contest.status === 'winner_selected' ? 2 : submissions.some((s) => s.status === 'shortlisted') ? 1 : 0} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="font-heading text-2xl font-bold tracking-tight">Review submissions</h1><p className="text-sm text-muted-foreground mt-0.5">Compare work quickly, shortlist strong entries, then make one deliberate winner decision.</p></div>
          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground nums">{currentIndex + 1} / {visible.length}</span><SegmentedTabs tabs={[{ key: 'all', label: 'All' }, { key: 'shortlisted', label: 'Shortlisted' }]} value={statusFilter} onChange={setStatusFilter} size="sm" /><button type="button" onClick={() => setSort((s) => s === 'new' ? 'old' : 'new')} className="h-8 px-3 rounded-full bg-white/70 border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all press flex items-center gap-1" aria-label={`Sort ${sort === 'new' ? 'oldest first' : 'newest first'}`}><SlidersHorizontal className="w-3 h-3" /> {sort === 'new' ? 'Newest' : 'Oldest'}</button></div>
        </div>

        <div className="hidden lg:grid lg:grid-cols-[250px_minmax(0,1fr)_300px] gap-4 items-start">
          <div className="space-y-2 max-h-[70vh] overflow-y-auto scrollbar-hide pr-1">{visible.map((s, i) => <button key={s.id} onClick={() => setCurrentIndex(i)} className={`w-full flex items-center gap-2.5 rounded-xl p-2.5 text-left transition-all duration-200 ease-brand ${i === currentIndex ? 'surface ring-1 ring-primary/30' : 'surface hover:shadow-elev-1'}`} aria-label={`View ${s.title || `submission ${i + 1}`}`}><div className="w-12 h-9 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden">{s.preview_asset || s.video_url ? <Play className="w-3.5 h-3.5 text-primary" /> : <Film className="w-3.5 h-3.5 text-muted-foreground" />}</div><div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{s.title || `Version ${s.version || '?'}`}</p><p className="text-[10px] text-muted-foreground">#{s.created_by_id?.slice(-4)?.toUpperCase()} · {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('en-IN') : 'Pending'}</p></div>{s.status === 'shortlisted' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold shrink-0">Shortlisted</span>}</button>)}</div>

          <div className="space-y-3"><div className="aspect-video surface rounded-xl flex items-center justify-center overflow-hidden elev-1">{playbackUrl ? <video src={playbackUrl} controls className="w-full h-full" /> : <div className="text-center"><Play className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No preview available</p></div>}</div>{meta}</div>
          <div className="surface p-5 sticky top-20">{controls}</div>
        </div>

        <div className="lg:hidden space-y-4"><div className="aspect-video surface rounded-xl flex items-center justify-center overflow-hidden relative" onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }} onTouchEnd={(e) => { if (touchStartX.current == null) return; const dx = e.changedTouches[0].clientX - touchStartX.current; if (Math.abs(dx) > 60) dx < 0 ? goNext() : goPrev(); touchStartX.current = null; }}>{playbackUrl ? <video src={playbackUrl} controls className="w-full h-full" /> : <div className="text-center"><Play className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No preview available</p></div>}{visible.length > 1 && <><button onClick={goPrev} disabled={currentIndex === 0} aria-label="Previous submission" className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full glass-card flex items-center justify-center disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button><button onClick={goNext} disabled={currentIndex >= visible.length - 1} aria-label="Next submission" className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full glass-card flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button></>}</div>{meta}<div className="surface p-4">{controls}</div></div>
      </div>
    </div>
  );
}
