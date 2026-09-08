import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, Trophy, Sparkles, Pause, RotateCcw, Trash2, Send, Flag, ArrowLeftRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ContestStatusBadge from '@/components/ContestStatusBadge';
import FootageAccessSection from '@/components/footage/FootageAccessSection';
import SecureFootageSection from '@/components/footage/SecureFootageSection';
import FootageApprovalPanel from '@/components/footage/FootageApprovalPanel';
import InviteCreatorModal from '@/components/notifications/InviteCreatorModal';
import ReportModal from '@/components/community/ReportModal';
import ContestFinancialsPanel from '@/components/contest/ContestFinancialsPanel';
import ContestSummaryPanel from '@/components/contest/ContestSummaryPanel';
import VisualAssetImage from '@/components/visual/VisualAssetImage';
import ContestArtworkControls from '@/components/visual/ContestArtworkControls';
import AlertState from '@/components/alerts/AlertState';
import { useToast } from '@/components/ui/use-toast';

const parseList = (json) => {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export default function ContestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contest, setContest] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [managing, setManaging] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [contestData, userData] = await Promise.all([
          base44.entities.Contest.get(id),
          base44.auth.me().catch(() => null),
        ]);
        setContest(contestData);
        setUser(userData);
        const subs = await base44.entities.Submission.filter({ contest_id: id }).catch(() => []);
        setSubmissions(subs);
      } catch {
        setContest(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const isClient = user?.user_role === 'client';
  const isCreator = !!user && !isClient;
  const isOwner = contest?.created_by_id === user?.id;
  const mySubmission = submissions.find((s) => s.created_by_id === user?.id || s.creator_id === user?.id);

  const handlePause = async () => {
    setManaging(true);
    try {
      const updated = await base44.entities.Contest.update(id, { status: 'paused' });
      setContest(updated);
      toast({ title: 'Contest paused' });
    } catch (e) {
      toast({ title: 'Could not pause contest', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setManaging(false);
    }
  };

  const handleResume = async () => {
    setManaging(true);
    try {
      const updated = await base44.entities.Contest.update(id, { status: 'open' });
      setContest(updated);
      toast({ title: 'Contest resumed' });
    } catch (e) {
      toast({ title: 'Could not resume contest', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setManaging(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this contest? This cannot be undone.')) return;
    setManaging(true);
    try {
      await base44.entities.Contest.delete(id);
      navigate('/explore');
    } catch (e) {
      toast({ title: 'Could not delete contest', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setManaging(false);
    }
  };

  const handleJoin = async () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/contest/${id}`)}`);
      return;
    }
    if (isClient || isOwner || !['open'].includes(contest?.status) || mySubmission) return;
    setJoining(true);
    try {
      // Joining creates the creator's working entry. Contest status is global and must remain open.
      const submission = await base44.entities.Submission.create({
        contest_id: id,
        client_id: contest.created_by_id,
        created_by_id: user.id,
        creator_id: user.id,
        status: 'working',
      });
      await base44.entities.Notification.create({
        type: 'contest_joined',
        title: 'Contest joined',
        description: contest.title,
        contest_id: id,
        recipient_user_id: user.id,
      }).catch(() => {});
      setSubmissions((current) => [...current, submission]);
      toast({ title: 'Joined contest', description: contest.title });
      navigate(`/contest/${id}/work`);
    } catch (e) {
      toast({ title: 'Could not join contest', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setJoining(false);
    }
  };

  const handleWithdraw = async () => {
    if (!mySubmission) return;
    if (!window.confirm('Withdraw your entry from this contest? Your draft entry will be removed.')) return;
    setManaging(true);
    try {
      await base44.entities.Submission.delete(mySubmission.id);
      setSubmissions((current) => current.filter((s) => s.id !== mySubmission.id));
      toast({ title: 'Entry withdrawn' });
      setContest({ ...contest });
    } catch (e) {
      toast({ title: 'Could not withdraw entry', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setManaging(false);
    }
  };

  if (loading) {
    return (
      <div className="page-shell grid place-items-center min-h-[55vh]">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" role="status" aria-label="Loading contest" />
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="page-shell">
        <div className="rz-empty">
          <div>
            <h1 className="font-heading text-xl font-bold">Contest not found</h1>
            <p className="mt-1 text-sm text-muted-foreground">The contest may have been removed or you may not have access to it.</p>
            <Button asChild className="mt-4"><Link to="/explore">Back to Explore</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  const deliverables = parseList(contest.deliverables);

  const renderActions = () => (
    <div className="space-y-2.5">
      {contest.status === 'paused' && isCreator && (
        <AlertState type="warning" shape="pill" title="This contest is paused" description="The brand has temporarily paused participation." />
      )}
      {contest.status === 'open' && isCreator && !mySubmission && (
        <Button onClick={handleJoin} disabled={joining} className="rz-primary-action w-full h-12 text-base font-semibold" size="lg">
          {joining ? 'Joining…' : 'Join contest'}
        </Button>
      )}
      {!user && contest.status === 'open' && (
        <Button onClick={handleJoin} className="rz-primary-action w-full h-12 text-base font-semibold" size="lg">
          Sign in to join
        </Button>
      )}
      {isCreator && mySubmission && ['working', 'joined'].includes(mySubmission.status || contest.status) && (
        <>
          <Button asChild className="rz-primary-action w-full h-12 text-base font-semibold" size="lg">
            <Link to={`/contest/${id}/work`}><Play className="w-4 h-4 mr-2" /> Continue working</Link>
          </Button>
          <Button onClick={handleWithdraw} variant="outline" className="rz-danger-action w-full" disabled={managing}>Withdraw entry</Button>
        </>
      )}
      {contest.status === 'submitted' && isCreator && (
        <AlertState type="processing" shape="ring" title="Your entry is in review" action={{ label: 'View your entry', to: `/contest/${id}/work` }} />
      )}
      {(contest.status === 'submitted' || contest.status === 'reviewing') && isClient && (
        <Button asChild className="rz-primary-action w-full h-12 text-base font-semibold" size="lg">
          <Link to={`/contest/${id}/review`}><Play className="w-4 h-4 mr-2" /> Review submissions</Link>
        </Button>
      )}
      {(contest.status === 'winner_selected' || contest.status === 'completed') && (
        <Button asChild className="rz-primary-action w-full h-12 text-base font-semibold" size="lg">
          <Link to={`/contest/${id}/results`}><Trophy className="w-4 h-4 mr-2" /> View results</Link>
        </Button>
      )}
      {(contest.status === 'winner_selected' || contest.status === 'completed') && (isOwner || user?.id === contest.winner_user_id) && (
        <Button asChild variant="outline" className="rz-secondary-action w-full">
          <Link to={`/contest/${id}/handover`}><ArrowLeftRight className="w-4 h-4 mr-2" /> Handover</Link>
        </Button>
      )}
      {contest.status === 'completed' && <AlertState type="completed" shape="ring" title="Contest completed" description="This contest has completed its workflow." />}
      {contest.status === 'draft' && isOwner && isClient && (
        <Button asChild className="rz-primary-action w-full h-12 text-base font-semibold" size="lg">
          <Link to="/create-contest"><Sparkles className="w-4 h-4 mr-2" /> Edit contest</Link>
        </Button>
      )}
      {isClient && isOwner && contest.status === 'open' && (
        <Button onClick={() => setShowInvite(true)} variant="outline" className="rz-secondary-action w-full"><Send className="w-4 h-4 mr-2" /> Invite creator</Button>
      )}
      {!isOwner && user && <Button onClick={() => setShowReport(true)} variant="ghost" className="w-full text-muted-foreground"><Flag className="w-4 h-4 mr-2" /> Report</Button>}
    </div>
  );

  const primaryCta = (() => {
    if (!user && contest.status === 'open') return { label: 'Sign in to join', to: `/login?returnTo=${encodeURIComponent(`/contest/${id}`)}` };
    if (contest.status === 'open' && isCreator && !mySubmission) return { label: 'Join contest', onClick: handleJoin, disabled: joining };
    if (mySubmission && ['working', 'joined'].includes(mySubmission.status || contest.status) && isCreator) return { label: 'Continue working', to: `/contest/${id}/work` };
    if (['submitted', 'reviewing'].includes(contest.status) && isClient) return { label: 'Review submissions', to: `/contest/${id}/review` };
    if (['winner_selected', 'completed'].includes(contest.status)) return { label: 'View results', to: `/contest/${id}/results` };
    return null;
  })();

  const summaryPanel = <ContestSummaryPanel contest={contest} entriesCount={submissions.length}>{renderActions()}</ContestSummaryPanel>;
  const sectionTitle = 'text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground';

  return (
    <div className="page-shell pb-8">
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 press"><ArrowLeft className="w-4 h-4" /> Explore</Link>

      <div className="surface-2 overflow-hidden mb-5 animate-fade-in">
        <div className="rz-media-cover relative min-h-[220px] md:min-h-[320px]">
          <VisualAssetImage entityType="CONTEST" entityId={contest.id} assetType="CONTEST_HERO" ensure fallbackAssetType="CONTEST_THUMBNAIL" alt={`${contest.title} — contest artwork`} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/90 text-slate-700 font-semibold">{contest.category || 'Contest'}</span>
            <ContestStatusBadge status={contest.status} />
          </div>
          <div className="absolute inset-x-0 bottom-0 p-5 md:p-7 text-white">
            <div className="max-w-4xl">
              <p className="text-[11px] uppercase tracking-[.16em] font-semibold text-white/75 mb-1">Prize-funded creative contest</p>
              <h1 className="font-heading text-2xl md:text-4xl font-bold tracking-tight leading-tight">{contest.title}</h1>
              {contest.short_description && <p className="mt-2 max-w-2xl text-sm md:text-base text-white/85">{contest.short_description}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="space-y-4 min-w-0">
          <div className="lg:hidden">{summaryPanel}</div>

          {contest.description && <section className="surface p-5"><h2 className={`${sectionTitle} mb-2.5`}>Brief</h2><p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{contest.description}</p></section>}

          {deliverables.length > 0 && (
            <section className="surface p-5">
              <h2 className={`${sectionTitle} mb-3`}>Deliverables</h2>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {deliverables.map((d, i) => <div key={i} className="rounded-lg bg-secondary/55 px-3.5 py-3 border border-border/50"><p className="text-sm font-semibold">{d.name || d.content_type || 'Deliverable'}</p><p className="text-xs text-muted-foreground mt-0.5">{[d.platform, d.duration, d.ratio, d.resolution, d.format].filter(Boolean).join(' · ')}</p></div>)}
              </div>
            </section>
          )}

          {contest.manual_approval ? (
            <><SecureFootageSection contest={contest} user={user} isOwner={isOwner} />{isOwner && <FootageApprovalPanel contest={contest} user={user} />}</>
          ) : <FootageAccessSection contest={contest} user={user} isOwner={isOwner} />}

          {contest.contest_rules && <section className="surface p-5"><h2 className={`${sectionTitle} mb-2.5`}>Rules</h2><p className="text-sm leading-relaxed whitespace-pre-line">{contest.contest_rules}</p></section>}
          {contest.reference_links && <section className="surface p-5"><h2 className={`${sectionTitle} mb-2.5`}>References</h2><p className="text-sm break-all whitespace-pre-line">{contest.reference_links}</p></section>}

          {isOwner && <ContestArtworkControls entityType="CONTEST" entityId={contest.id} />}
          {isOwner && <ContestFinancialsPanel contest={contest} />}

          {isClient && ['submitted', 'reviewing', 'winner_selected', 'completed'].includes(contest.status) && submissions.length > 0 && (
            <section className="surface p-5">
              <h2 className={`${sectionTitle} mb-3`}>Submissions <span className="nums">({submissions.length})</span></h2>
              <div className="space-y-1">
                {submissions.slice(0, 8).map((s) => (
                  <Link key={s.id} to={`/contest/${id}/review`} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className="w-14 h-10 rounded-md bg-secondary flex items-center justify-center overflow-hidden shrink-0">{s.preview_asset || s.video_url ? <Play className="w-4 h-4 text-primary" /> : <span className="text-[10px] text-muted-foreground">No preview</span>}</div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">Creator #{s.created_by_id?.slice(-4)?.toUpperCase() || '—'}</p><p className="text-xs text-muted-foreground">{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('en-IN') : 'Pending'}</p></div>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-secondary text-muted-foreground capitalize">{s.status}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {isOwner && isClient && !['winner_selected', 'completed'].includes(contest.status) && (
            <section className="surface p-5 space-y-3">
              <h2 className={sectionTitle}>Manage contest</h2>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" size="sm" className="rz-secondary-action"><Link to="/create-contest"><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Edit</Link></Button>
                {contest.status === 'paused' ? <Button onClick={handleResume} disabled={managing} variant="outline" size="sm" className="rz-secondary-action"><RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Resume</Button> : <Button onClick={handlePause} disabled={managing || contest.status === 'draft'} variant="outline" size="sm" className="rz-secondary-action"><Pause className="w-3.5 h-3.5 mr-1.5" /> Pause</Button>}
                <Button onClick={handleDelete} disabled={managing} variant="outline" size="sm" className="rz-danger-action col-span-2"><Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete contest</Button>
              </div>
            </section>
          )}
        </div>

        <aside className="hidden lg:block sticky top-20">{summaryPanel}</aside>
      </div>

      {primaryCta && (
        <div className="lg:hidden sticky bottom-16 z-40 mt-4">
          {primaryCta.to ? <Button asChild className="rz-primary-action w-full h-12 text-base font-semibold shadow-elev-2" size="lg"><Link to={primaryCta.to}>{primaryCta.label}</Link></Button> : <Button onClick={primaryCta.onClick} disabled={primaryCta.disabled} className="rz-primary-action w-full h-12 text-base font-semibold shadow-elev-2" size="lg">{primaryCta.disabled ? 'Joining…' : primaryCta.label}</Button>}
        </div>
      )}

      {showInvite && <InviteCreatorModal contest={contest} user={user} onClose={() => setShowInvite(false)} />}
      {showReport && user && <ReportModal open={showReport} onClose={() => setShowReport(false)} targetType="context" targetId={id} reportedUserId={contest?.created_by_id} user={user} />}
    </div>
  );
}
