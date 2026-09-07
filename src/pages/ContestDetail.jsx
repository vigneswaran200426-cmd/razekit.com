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
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
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
      } catch (e) {} finally { setLoading(false); }
    };
    fetchData();
  }, [id]);

  const isClient = user?.user_role === 'client';
  const isCreator = !isClient;
  const isOwner = contest?.created_by_id === user?.id;

  const handlePause = async () => {
    setManaging(true);
    try {
      const updated = await base44.entities.Contest.update(id, { status: 'paused' });
      setContest(updated);
    } catch (e) {} finally { setManaging(false); }
  };

  const handleResume = async () => {
    setManaging(true);
    try {
      const updated = await base44.entities.Contest.update(id, { status: 'open' });
      setContest(updated);
    } catch (e) {} finally { setManaging(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete contest? This can\'t be undone.')) return;
    setManaging(true);
    try {
      await base44.entities.Contest.delete(id);
      navigate('/explore');
    } catch (e) {} finally { setManaging(false); }
  };

  const handleJoin = async () => {
    if (isClient) return;
    setJoining(true);
    try {
      await base44.entities.Contest.update(id, { status: 'joined' });
      await base44.entities.Submission.create({ contest_id: id, client_id: contest.created_by_id, status: 'working' });
      await base44.entities.Notification.create({
        type: 'contest_joined',
        title: 'Contest joined',
        description: contest.title,
        contest_id: id,
      });
      toast({ title: 'Joined contest', description: contest.title });
      navigate(`/contest/${id}/work`);
    } catch (e) {} finally { setJoining(false); }
  };

  const handleWithdraw = async () => {
    if (!confirm('Withdraw from this contest?')) return;
    setManaging(true);
    try {
      await base44.entities.Contest.update(id, { status: 'open' });
      const mySub = submissions.find((s) => s.created_by_id === user?.id);
      if (mySub) await base44.entities.Submission.delete(mySub.id).catch(() => {});
      toast({ title: 'Withdrew from contest' });
      setContest({ ...contest, status: 'open' });
    } catch (e) {} finally { setManaging(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!contest) {
    return <div className="p-8 text-center text-muted-foreground">Contest not found</div>;
  }

  const deliverables = parseList(contest.deliverables);

  // The single state-driven action stack — one source, rendered in the summary
  // panel on both desktop (sticky aside) and mobile (inline flow).
  const renderActions = () => (
    <>
      {contest.status === 'paused' && isCreator && (
        <AlertState type="warning" shape="pill" title="This contest is paused" description="The brand has temporarily paused this contest." />
      )}
      {contest.status === 'open' && isCreator && (
        <Button onClick={handleJoin} disabled={joining} className="w-full h-12 text-base font-semibold" size="lg">
          {joining ? 'Joining…' : 'Join contest'}
        </Button>
      )}
      {isClient && !isOwner && ['open', 'joined', 'working'].includes(contest.status) && (
        <AlertState type="info" shape="orbs" title="Browsing as brand" description="Only creators can participate in this contest." action={{ label: 'Explore contests', to: '/explore' }} />
      )}
      {(contest.status === 'joined' || contest.status === 'working') && isCreator && (
        <>
          <Button asChild className="w-full h-12 text-base font-semibold" size="lg">
            <Link to={`/contest/${id}/work`}><Play className="w-4 h-4 mr-2" /> Continue working</Link>
          </Button>
          <Button onClick={handleWithdraw} variant="outline" className="w-full text-destructive hover:text-destructive" disabled={managing}>
            Withdraw
          </Button>
        </>
      )}
      {contest.status === 'submitted' && isCreator && (
        <AlertState type="processing" shape="ring" title="Your entry is in review" action={{ label: 'View your entry', to: `/contest/${id}/work` }} />
      )}
      {(contest.status === 'submitted' || contest.status === 'reviewing') && isClient && (
        <Button asChild className="w-full h-12 text-base font-semibold" size="lg">
          <Link to={`/contest/${id}/review`}><Play className="w-4 h-4 mr-2" /> Review submissions</Link>
        </Button>
      )}
      {(contest.status === 'winner_selected' || contest.status === 'completed') && (
        <Button asChild className="w-full h-12 text-base font-semibold" size="lg">
          <Link to={`/contest/${id}/results`}><Trophy className="w-4 h-4 mr-2" /> View results</Link>
        </Button>
      )}
      {(contest.status === 'winner_selected' || contest.status === 'completed') && (isOwner || user?.id === contest.winner_user_id) && (
        <Button asChild variant="outline" className="w-full">
          <Link to={`/contest/${id}/handover`}><ArrowLeftRight className="w-4 h-4 mr-2" /> Handover</Link>
        </Button>
      )}
      {contest.status === 'completed' && (
        <AlertState type="completed" shape="ring" title="Contest completed" description="Thanks for participating." />
      )}
      {contest.status === 'draft' && isClient && (
        <Button asChild className="w-full h-12 text-base font-semibold" size="lg">
          <Link to="/create-contest"><Sparkles className="w-4 h-4 mr-2" /> Edit contest</Link>
        </Button>
      )}
      {isClient && isOwner && contest.status === 'open' && (
        <Button onClick={() => setShowInvite(true)} variant="outline" className="w-full">
          <Send className="w-4 h-4 mr-2" /> Invite creator
        </Button>
      )}
      {!isOwner && (
        <Button onClick={() => setShowReport(true)} variant="ghost" className="w-full text-muted-foreground">
          <Flag className="w-4 h-4 mr-2" /> Report
        </Button>
      )}
    </>
  );

  // Mobile sticky bar — the one obvious next action, kept in thumb reach above
  // the bottom navigation.
  const primaryCta = (() => {
    if (contest.status === 'open' && isCreator) return { label: 'Join contest', onClick: handleJoin, disabled: joining };
    if (['joined', 'working'].includes(contest.status) && isCreator) return { label: 'Continue', to: `/contest/${id}/work` };
    if (['submitted', 'reviewing'].includes(contest.status) && isClient) return { label: 'Review', to: `/contest/${id}/review` };
    if (['winner_selected', 'completed'].includes(contest.status)) return { label: 'Results', to: `/contest/${id}/results` };
    return null;
  })();

  const summaryPanel = (
    <ContestSummaryPanel contest={contest} entriesCount={submissions.length}>
      {renderActions()}
    </ContestSummaryPanel>
  );

  const sectionTitle = 'text-xs font-semibold uppercase tracking-widest text-muted-foreground';

  return (
    <div className="page-shell max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto pb-8">
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 press">
        <ArrowLeft className="w-4 h-4" /> Explore
      </Link>

      {/* Hero — media-first cover with category + status */}
      <div className="glass-card rounded-3xl overflow-hidden mb-5 shadow-glass-lg animate-fade-in">
        <div className="relative h-44 md:h-56 overflow-hidden">
          <VisualAssetImage
            entityType="CONTEST"
            entityId={contest.id}
            assetType="CONTEST_HERO"
            ensure
            fallbackAssetType="CONTEST_THUMBNAIL"
            alt={`${contest.title} — contest artwork`}
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-card/90 text-muted-foreground font-medium">{contest.category}</span>
            <span><ContestStatusBadge status={contest.status} /></span>
          </div>
        </div>
        <div className="px-5 py-5">
          <h1 className="font-heading text-xl md:text-2xl font-bold tracking-tight">{contest.title}</h1>
        </div>
      </div>

      {/* Desktop: two-column — brief as the star, sticky prize/action panel */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="space-y-4 min-w-0">
          {/* Mobile summary + actions inline; desktop hides this (aside below) */}
          <div className="lg:hidden">{summaryPanel}</div>

          {contest.description && (
            <section className="surface rounded-2xl p-5 elev-1">
              <h2 className={`${sectionTitle} mb-2.5`}>Brief</h2>
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{contest.description}</p>
            </section>
          )}

          {deliverables.length > 0 && (
            <section className="surface rounded-2xl p-5 elev-1">
              <h2 className={`${sectionTitle} mb-3`}>Deliverables</h2>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {deliverables.map((d, i) => (
                  <div key={i} className="rounded-xl bg-secondary/60 px-3.5 py-3">
                    <p className="text-sm font-medium">{d.name || d.content_type || 'Deliverable'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[d.platform, d.duration, d.ratio, d.resolution, d.format].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Footage / project files */}
          {contest.manual_approval ? (
            <>
              <SecureFootageSection contest={contest} user={user} isOwner={contest.created_by_id === user?.id} />
              {contest.created_by_id === user?.id && <FootageApprovalPanel contest={contest} user={user} />}
            </>
          ) : (
            <FootageAccessSection contest={contest} user={user} isOwner={contest.created_by_id === user?.id} />
          )}

          {contest.contest_rules && (
            <section className="surface rounded-2xl p-5 elev-1">
              <h2 className={`${sectionTitle} mb-2.5`}>Rules</h2>
              <p className="text-sm leading-relaxed whitespace-pre-line">{contest.contest_rules}</p>
            </section>
          )}

          {contest.reference_links && (
            <section className="surface rounded-2xl p-5 elev-1">
              <h2 className={`${sectionTitle} mb-2.5`}>References</h2>
              <p className="text-sm break-all">{contest.reference_links}</p>
            </section>
          )}

          {isOwner && <ContestArtworkControls entityType="CONTEST" entityId={contest.id} />}
          {isOwner && <ContestFinancialsPanel contest={contest} />}

          {isClient && ['submitted', 'reviewing', 'winner_selected', 'completed'].includes(contest.status) && submissions.length > 0 && (
            <section className="surface rounded-2xl p-5 elev-1">
              <h2 className={`${sectionTitle} mb-3`}>Submissions <span className="nums">({submissions.length})</span></h2>
              <div className="space-y-2">
                {submissions.slice(0, 6).map((s) => (
                  <Link key={s.id} to={`/contest/${id}/review`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className="w-14 h-10 rounded-md bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                      {s.preview_asset || s.video_url ? <Play className="w-4 h-4 text-primary" /> : <span className="text-[10px] text-muted-foreground">No prev</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">Creator #{s.created_by_id?.slice(-4)?.toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground">{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('en-IN') : 'Pending'}</p>
                    </div>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-secondary text-muted-foreground capitalize">{s.status}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {isClient && isOwner && !['winner_selected', 'completed'].includes(contest.status) && (
            <section className="surface rounded-2xl p-5 elev-1 space-y-3">
              <h2 className={sectionTitle}>Manage</h2>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/create-contest"><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Edit</Link>
                </Button>
                {contest.status === 'paused' ? (
                  <Button onClick={handleResume} disabled={managing} variant="outline" size="sm">
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Resume
                  </Button>
                ) : (
                  <Button onClick={handlePause} disabled={managing || contest.status === 'draft'} variant="outline" size="sm">
                    <Pause className="w-3.5 h-3.5 mr-1.5" /> Pause
                  </Button>
                )}
                <Button onClick={handleDelete} disabled={managing} variant="outline" size="sm" className="text-destructive hover:text-destructive col-span-2">
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete contest
                </Button>
              </div>
            </section>
          )}
        </div>

        {/* Desktop sticky panel — prize, deadline, entries, actions */}
        <aside className="hidden lg:block sticky top-6">
          {summaryPanel}
        </aside>
      </div>

      {/* Mobile sticky primary action — floats above the bottom nav */}
      {primaryCta && (
        <div className="lg:hidden sticky bottom-16 z-40 -mx-1 mt-5">
          {primaryCta.to ? (
            <Button asChild className="w-full h-12 text-base font-semibold shadow-elev-2" size="lg">
              <Link to={primaryCta.to}>{primaryCta.label}</Link>
            </Button>
          ) : (
            <Button onClick={primaryCta.onClick} disabled={primaryCta.disabled} className="w-full h-12 text-base font-semibold shadow-elev-2" size="lg">
              {primaryCta.disabled ? 'Joining…' : primaryCta.label}
            </Button>
          )}
        </div>
      )}

      {showInvite && <InviteCreatorModal contest={contest} user={user} onClose={() => setShowInvite(false)} />}
      {showReport && user && (
        <ReportModal open={showReport} onClose={() => setShowReport(false)} targetType="context" targetId={id} reportedUserId={contest?.created_by_id} user={user} />
      )}
    </div>
  );
}