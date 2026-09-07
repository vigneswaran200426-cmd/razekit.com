import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Play, Check, ChevronLeft, ChevronRight, ArrowLeft, Film, Lock, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import StarRating from '@/components/reviews/StarRating';
import EmptyState from '@/components/ui/EmptyState';
import { SegmentedTabs } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/use-toast';

const RETENTION_DAYS = 30;
const STATUS_CHIP = {
  submitted: 'bg-secondary text-muted-foreground',
  shortlisted: 'bg-primary/10 text-primary',
};

/*
  CREATIVE REVIEW WORKSPACE
  Desktop: submission rail + large preview + decision panel.
  Mobile: immersive preview feed with swipe navigation + bottom controls.
  Creative work leads; tables never dominate.
*/
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
        const subs = await base44.entities.Submission.filter({ contest_id: id }, '-created_date', 50);
        setSubmissions(subs.filter((s) => s.status === 'submitted' || s.status === 'shortlisted'));
      } catch (e) {} finally { setLoading(false); }
    };
    fetchData();
  }, [id]);

  const visible = useMemo(() => {
    const list = submissions.filter((s) => statusFilter === 'all' || s.status === statusFilter);
    return sort === 'new' ? list : [...list].reverse();
  }, [submissions, statusFilter, sort]);
  const current = visible[currentIndex];

  // In-app playback via temporary signed URL from private storage (no Drive/external link).
  useEffect(() => {
    let active = true;
    (async () => {
      const sub = visible[currentIndex];
      if (!sub) { setPlaybackUrl(null); return; }
      const uri = sub.final_asset_uri || sub.preview_asset || sub.video_url;
      if (!uri) { if (active) setPlaybackUrl(null); return; }
      // Private storage URI → signed URL; legacy public URLs play directly.
      if (sub.final_asset_uri || !/^https?:\/\//.test(uri)) {
        try {
          const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 });
          if (active) setPlaybackUrl(signed_url);
        } catch { if (active) setPlaybackUrl(uri); }
      } else {
        if (active) setPlaybackUrl(uri);
      }
    })();
    return () => { active = false; };
  }, [visible, currentIndex]);

  // Keep index valid when filters change.
  useEffect(() => { setCurrentIndex((i) => Math.min(i, Math.max(0, visible.length - 1))); }, [statusFilter, sort]);

  const goNext = () => setCurrentIndex((i) => Math.min(visible.length - 1, i + 1));
  const goPrev = () => setCurrentIndex((i) => Math.max(0, i - 1));

  const handleShortlist = async () => {
    const sub = current;
    if (!sub) return;
    await base44.entities.Submission.update(sub.id, { status: 'shortlisted', client_feedback: feedback.trim() });
    setSubmissions((prev) => prev.map((s) => s.id === sub.id ? { ...s, status: 'shortlisted' } : s));
    goNext();
  };

  const handleSelectWinner = async () => {
    const sub = current;
    if (!sub) return;
    if (!rating) {
      toast({ title: 'Please rate the creator', description: 'Select a star rating before confirming', variant: 'destructive' });
      return;
    }
    setSelecting(true);
    try {
      const now = new Date().toISOString();
      const retentionUntil = new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString();

      // Winner
      await base44.entities.Submission.update(sub.id, { status: 'won', rating, client_feedback: feedback.trim(), delivery_status: 'deliverable' });
      await base44.entities.Contest.update(id, {
        status: 'winner_selected',
        winner_submission_id: sub.id,
        winner_user_id: sub.created_by_id,
        winner_selected_at: now,
        delivery_status: 'deliverable',
      });
      // Losers — retained temporarily
      for (const o of submissions) {
        if (o.id !== sub.id && o.status !== 'won') {
          await base44.entities.Submission.update(o.id, { status: 'lost', retention_until: retentionUntil }).catch(() => {});
        }
      }

      // Handover — dedicated stage opens at winner selection (additive; never blocks selection)
      await base44.entities.Handover.create({
        contest_id: id,
        contest_title: contest.title,
        client_id: contest.created_by_id,
        winner_id: sub.created_by_id,
        handover_type: 'both',
        status: 'not_started',
        handover_items: '[]',
        event_log: JSON.stringify([{ actor: 'system', actor_id: '', action: 'winner_selected', detail: '', time: now }]),
      }).catch(() => {});

      // Notifications — client + winning creator
      await base44.entities.Notification.create({
        type: 'winner_announced', title: 'Your winning project is ready',
        description: `Winner selected for "${contest.title}". Open Results to download the final file.`,
        contest_id: id,
      }).catch(() => {});
      await base44.entities.Notification.create({
        type: 'contest_win', title: 'You won the contest!',
        description: `Your submission was selected as the winner for "${contest.title}".`,
        contest_id: id,
      }).catch(() => {});

      toast({ title: 'Winner selected', description: 'Final asset is now ready for delivery.' });
      navigate(`/contest/${id}/results`);
    } catch (e) {
      toast({ title: 'Selection failed', description: 'Please try again.', variant: 'destructive' });
    } finally { setSelecting(false); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;
  if (!contest) return <div className="p-8 text-center text-muted-foreground">Contest not found</div>;
  if (submissions.length === 0) return (
    <div className="page-shell max-w-2xl mx-auto pb-8">
      <EmptyState icon={Film} title="No submissions yet" message="Creator entries appear here as soon as they submit." actionLabel="Back to contest" to={`/contest/${id}`} />
    </div>
  );

  const meta = (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <span className="font-heading text-sm font-bold text-primary">{(current?.created_by_id || '?').slice(-1).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{current?.title || `Version ${current?.version || ''}`}</p>
        <p className="text-xs text-muted-foreground">Creator #{current?.created_by_id?.slice(-4)?.toUpperCase()} · v{current?.version || '?'} · {current?.submitted_at ? new Date(current.submitted_at).toLocaleDateString('en-IN') : 'Pending'}</p>
      </div>
      {current?.final_asset_uri && (
        <span className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-secondary text-muted-foreground shrink-0">
          <Lock className="w-3 h-3" /> Final ready
        </span>
      )}
    </div>
  );

  const controls = (
    <>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">Rate this creator</p>
        <StarRating value={rating} onChange={setRating} size="lg" />
        <p className="text-xs text-muted-foreground mt-2">
          {rating === 0 ? 'Rate this submission' : `${rating} star${rating > 1 ? 's' : ''}`}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-4 mb-2">Feedback</p>
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="Leave feedback for the editor" className="w-full rounded-xl border border-input bg-white/60 px-3 py-2 text-sm resize-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/50" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 pt-1">
        <Button variant="outline" onClick={handleShortlist}>Shortlist</Button>
        <Button variant="outline" onClick={goNext} disabled={currentIndex >= visible.length - 1}>Next <ChevronRight className="w-4 h-4" /></Button>
      </div>
      <Button onClick={handleSelectWinner} disabled={selecting} className="w-full" size="lg">
        <Check className="w-4 h-4 mr-2" /> {selecting ? 'Selecting…' : 'Select winner'}
      </Button>
    </>
  );

  return (
    <div className="page-shell max-w-3xl lg:max-w-6xl mx-auto pb-8">
      <Link to={`/contest/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 press">
        <ArrowLeft className="w-4 h-4" /> {contest.title}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="font-heading text-xl font-bold tracking-tight">Review submissions</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground nums">{currentIndex + 1} / {visible.length}</span>
          <SegmentedTabs
            tabs={[{ key: 'all', label: 'All' }, { key: 'shortlisted', label: 'Shortlisted' }]}
            value={statusFilter}
            onChange={setStatusFilter}
            size="sm"
          />
          <button
            type="button"
            onClick={() => setSort((s) => (s === 'new' ? 'old' : 'new'))}
            aria-label={sort === 'new' ? 'Newest first' : 'Oldest first'}
            className="h-8 px-3 rounded-full bg-white/70 border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all press flex items-center gap-1"
          >
            <SlidersHorizontal className="w-3 h-3" /> {sort === 'new' ? 'Newest' : 'Oldest'}
          </button>
        </div>
      </div>

      {/* Desktop workspace: rail + preview + decision panel */}
      <div className="hidden lg:grid lg:grid-cols-[250px_minmax(0,1fr)_300px] gap-4 items-start">
        {/* Submission rail */}
        <div className="space-y-2 max-h-[70vh] overflow-y-auto scrollbar-hide pr-1">
          {visible.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrentIndex(i)}
              className={`w-full flex items-center gap-2.5 rounded-xl p-2.5 text-left transition-all duration-200 ease-brand
                ${i === currentIndex ? 'surface ring-1 ring-primary/30 elev-1' : 'surface hover:shadow-elev-1'}`}
            >
              <div className="w-12 h-9 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                {(s.preview_asset || s.video_url) ? <Play className="w-3.5 h-3.5 text-primary" /> : <Film className="w-3.5 h-3.5 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{s.title || `Version ${s.version || '?'}`}</p>
                <p className="text-[10px] text-muted-foreground">#{s.created_by_id?.slice(-4)?.toUpperCase()} · {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('en-IN') : 'Pending'}</p>
              </div>
              {s.status === 'shortlisted' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold shrink-0">Shortlisted</span>}
            </button>
          ))}
        </div>

        {/* Large creative preview */}
        <div className="space-y-3">
          <div className="aspect-video surface rounded-2xl flex items-center justify-center overflow-hidden elev-1 animate-fade-in">
            {playbackUrl ? (
              <video src={playbackUrl} controls className="w-full h-full rounded-2xl" />
            ) : (
              <div className="text-center">
                <Play className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No preview uploaded</p>
              </div>
            )}
          </div>
          {meta}
        </div>

        {/* Decision panel */}
        <div className="surface rounded-2xl p-5 space-y-4 sticky top-6 elev-1">
          {controls}
        </div>
      </div>

      {/* Mobile/tablet: immersive creative feed */}
      <div className="lg:hidden">
        <div
          className="aspect-video surface rounded-2xl flex items-center justify-center overflow-hidden elev-1 animate-fade-in relative"
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStartX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(dx) > 60) { dx < 0 ? goNext() : goPrev(); }
            touchStartX.current = null;
          }}
        >
          {playbackUrl ? (
            <video src={playbackUrl} controls className="w-full h-full rounded-2xl" />
          ) : (
            <div className="text-center">
              <Play className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No preview uploaded</p>
            </div>
          )}
          {visible.length > 1 && (
            <>
              <button onClick={goPrev} disabled={currentIndex === 0} aria-label="Previous submission"
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full glass-card flex items-center justify-center text-foreground disabled:opacity-30 press">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={goNext} disabled={currentIndex >= visible.length - 1} aria-label="Next submission"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full glass-card flex items-center justify-center text-foreground disabled:opacity-30 press">
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Thumbnail strip */}
        {visible.length > 1 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide mt-3 pb-0.5">
            {visible.map((s, i) => (
              <button key={s.id} onClick={() => setCurrentIndex(i)} aria-label={`View submission ${i + 1}`}
                className={`w-16 h-11 rounded-lg shrink-0 flex items-center justify-center transition-all ${i === currentIndex ? 'ring-2 ring-primary bg-secondary' : 'surface'}`}>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_CHIP[s.status] || STATUS_CHIP.submitted}`}>{i + 1}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4">{meta}</div>

        <div className="glass-card rounded-2xl p-4 mt-4 space-y-4 animate-fade-in">{controls}</div>
      </div>
    </div>
  );
}