import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Ban, CheckCircle2, ClipboardList, Lock, Save, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { canPerformAction } from '@/lib/enforcement-utils';
import { formatINR } from '@/lib/contest-utils';
import { platformById } from '@/lib/submission/platforms';
import { deriveRequirements, isContestOpen, buildChecklist, missingBeforeSubmit } from '@/lib/submission/requirements';
import { useSubmissionDraft } from '@/hooks/useSubmissionDraft';
import SubmissionHeader from '@/components/submission/workspace/SubmissionHeader';
import SubmissionProgress from '@/components/submission/workspace/SubmissionProgress';
import SubmissionChecklist from '@/components/submission/workspace/SubmissionChecklist';
import BriefStep from '@/components/submission/workspace/BriefStep';
import FinalCreativeSection from '@/components/submission/workspace/FinalCreativeSection';
import SourceFilesSection from '@/components/submission/workspace/SourceFilesSection';
import PlatformStep from '@/components/submission/workspace/PlatformStep';
import FinalCheckStep from '@/components/submission/workspace/FinalCheckStep';
import SubmissionSuccess from '@/components/submission/workspace/SubmissionSuccess';

export default function SubmitWork() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [contest, setContest] = useState(null);
  const [user, setUser] = useState(null);
  const [brandName, setBrandName] = useState('');
  const [versions, setVersions] = useState([]);
  const [currentSubmission, setCurrentSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState(null);
  const submittingRef = useRef(false);

  const { draft, updateDraft, clearDraft, savedAt, restored, ready } = useSubmissionDraft(id, user?.id);
  const state = draft || {};
  const step = Math.min(state.step || 0, 3);
  const reqs = useMemo(() => contest ? deriveRequirements(contest) : null, [contest]);
  const checklist = useMemo(() => reqs ? buildChecklist(reqs, state).filter((i) => !i.skip) : [], [reqs, draft]);
  const missing = useMemo(() => reqs && step === 3 ? missingBeforeSubmit(reqs, state) : [], [reqs, draft, step]);

  useEffect(() => {
    (async () => {
      try {
        const [c, me, subs] = await Promise.all([
          base44.entities.Contest.get(id),
          base44.auth.me().catch(() => null),
          base44.entities.Submission.filter({ contest_id: id }, '-created_date', 50).catch(() => []),
        ]);
        setContest(c);
        setUser(me);
        const mine = (subs || []).filter((s) => s.created_by_id === me?.id);
        setVersions(mine);
        setCurrentSubmission(mine.find((s) => !['withdrawn', 'lost'].includes(s.status)) || null);
        if (c?.created_by_id) {
          const prof = await base44.entities.UserProfile.filter({ user_id: c.created_by_id }, '-created_date', 1).catch(() => []);
          setBrandName(prof[0]?.company_name || prof[0]?.display_name || '');
        }
        base44.analytics.track({ eventName: 'submission_started' });
      } catch { /* handled below */ } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading || !ready) return <div className="page-shell grid place-items-center min-h-[55vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" role="status" aria-label="Loading submission workspace" /></div>;
  if (!contest || !reqs) return <div className="page-shell"><div className="rz-empty"><div><AlertTriangle className="w-7 h-7 text-muted-foreground/50 mx-auto mb-2" /><h1 className="font-heading text-xl font-bold">Contest not found</h1><p className="mt-1 text-sm text-muted-foreground">This submission workspace is unavailable.</p><Button asChild className="mt-4"><Link to="/explore">Discover contests</Link></Button></div></div></div>;

  if (!isContestOpen(contest)) return <ClosedState contest={contest} />;
  if (contest.submission_limit > 0 && versions.filter((v) => ['submitted', 'shortlisted', 'won'].includes(v.status)).length >= contest.submission_limit) return <div className="page-shell"><div className="rz-empty max-w-lg mx-auto"><div><Lock className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" /><p className="font-heading font-bold mb-1">Submission limit reached</p><p className="text-sm text-muted-foreground">This contest allows {contest.submission_limit} submission{contest.submission_limit === 1 ? '' : 's'} per creator.</p><Link to={`/contest/${id}`} className="text-sm font-medium text-primary hover:underline mt-4 inline-block">Back to contest</Link></div></div></div>;
  if (submittedRecord) return <SubmissionSuccess contest={contest} submission={submittedRecord} brandName={brandName} />;

  const goStep = (n) => updateDraft({ step: n });
  const handleSaveDraft = () => { toast({ title: 'Submission draft saved', description: 'Continue any time before the deadline.' }); navigate(`/contest/${id}`); };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    const miss = missingBeforeSubmit(reqs, state);
    if (miss.length) { toast({ title: 'Incomplete submission', description: miss[0], variant: 'destructive' }); return; }
    const gate = await canPerformAction(user, 'submit_work');
    if (!gate.ok) { toast({ title: 'Action blocked', description: gate.reason, variant: 'destructive' }); return; }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const fresh = await base44.entities.Contest.get(id).catch(() => contest);
      if (!isContestOpen(fresh)) { toast({ title: 'Submission closed', description: 'The contest is no longer accepting submissions.', variant: 'destructive' }); setContest(fresh); return; }

      // Re-read the creator's submissions immediately before create to reduce cross-tab duplicate finalization.
      const latestMine = await base44.entities.Submission.filter({ contest_id: id, created_by_id: user.id }, '-created_date', 50).catch(() => versions);
      const existingFinal = (latestMine || []).find((s) => ['submitted', 'shortlisted', 'won'].includes(s.status));
      if (existingFinal) { setSubmittedRecord(existingFinal); toast({ title: 'Submission already finalized', description: 'Your latest submitted version is already recorded.' }); return; }

      const entries = (state.platforms || []).filter((e) => e.platformId);
      const primary = entries[0] || {};
      const version = (latestMine || []).length + 1;
      const meta = state.final?.meta || {};
      const record = await base44.entities.Submission.create({
        contest_id: id,
        client_id: fresh.created_by_id,
        created_by_id: user.id,
        creator_id: user.id,
        status: 'submitted',
        media_kind: state.final?.kind || 'video',
        preview_asset: state.final?.file_uri || '',
        final_asset_uri: state.final?.file_uri || '',
        thumbnail: state.final?.thumbnail_uri || '',
        platform: primary.platformId || '',
        content_type: primary.contentType || '',
        live_url: primary.fields?.live_url || '',
        url_status: primary.fields?.live_url ? 'provided' : primary.notPublished ? 'not_published' : 'manual_verification',
        caption: primary.fields?.caption || '',
        hashtags: primary.fields?.hashtags || '',
        mentions: primary.fields?.mentions || '',
        platform_data: JSON.stringify({ entries }),
        source_assets: JSON.stringify(state.sourceFiles || []),
        title: `${fresh.title} — v${version}`,
        description: primary.fields?.description || '',
        version: String(version),
        notes_for_client: state.notes || '',
        duration: meta.duration || 0,
        resolution: meta.width && meta.height ? `${meta.width}x${meta.height}` : '',
        file_size: state.final?.size || 0,
        submitted_at: new Date().toISOString(),
      });

      // Submission creation is per-entry. Do not mutate the global contest lifecycle to "submitted"
      // merely because one creator submits; the contest can have many concurrent participants.
      const notifications = [
        base44.entities.Notification.create({ type: 'contest_submission_received', title: 'New submission received', description: `A new submission was received for "${fresh.title}".`, contest_id: id, recipient_user_id: fresh.created_by_id }),
        base44.entities.Notification.create({ type: 'submission_uploaded', title: 'Your submission has been sent for review', description: `"${fresh.title}" is now awaiting brand review.`, contest_id: id, recipient_user_id: user.id }),
      ];
      await Promise.allSettled(notifications);
      base44.analytics.track({ eventName: 'submission_submitted' });
      clearDraft();
      setVersions((prev) => [...prev, record]);
      setCurrentSubmission(record);
      setSubmittedRecord(record);
    } catch (e) {
      toast({ title: 'Submission failed', description: e?.message || 'Your work was not submitted. Your draft remains available for retry.', variant: 'destructive' });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const platformLabels = (reqs.freePlatformChoice ? [] : reqs.platforms).map((pid) => platformById(pid)?.label).filter(Boolean);

  return (
    <div className="page-shell pb-28 lg:pb-10">
      <div className="max-w-6xl mx-auto">
        <Link to={`/contest/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 press"><ArrowLeft className="w-4 h-4" /> Back to contest</Link>
        {restored && step < 3 && <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 mb-4"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /><p className="text-xs">Continue submission — your saved draft was restored.</p></div>}

        <div className="grid lg:grid-cols-[1fr_300px] gap-5">
          <div className="space-y-5">
            <section className="surface-2 p-4 md:p-5"><SubmissionHeader contest={contest} brandName={brandName} savedAt={savedAt} submission={currentSubmission} /><div className="mt-4 pt-4 border-t border-border/60"><SubmissionProgress current={step} /></div></section>
            <section className="surface-2 p-4 md:p-5">
              {step === 0 && <BriefStep contest={contest} reqs={reqs} versions={versions} onNext={() => goStep(1)} />}
              {step === 1 && <div className="space-y-6"><FinalCreativeSection reqs={reqs} value={state.final || null} onChange={(v) => updateDraft({ final: v })} /><div className="border-t border-border/60 pt-5"><SourceFilesSection reqs={reqs} value={state.sourceFiles || []} onChange={(v) => updateDraft({ sourceFiles: v })} /></div><div className="border-t border-border/60 pt-5"><label className="text-xs font-semibold mb-1.5 block" htmlFor="submission-notes">Notes for the brand (optional)</label><Textarea id="submission-notes" value={state.notes || ''} onChange={(e) => updateDraft({ notes: e.target.value })} rows={3} placeholder="Anything the brand should know about your submission…" className="text-sm" /></div></div>}
              {step === 2 && <PlatformStep reqs={reqs} value={state.platforms || []} onChange={(v) => updateDraft({ platforms: v })} onPlatformSelected={() => base44.analytics.track({ eventName: 'platform_selected' })} />}
              {step === 3 && <FinalCheckStep contest={contest} reqs={reqs} state={state} user={user} brandName={brandName} missing={missing} submitting={submitting} onTermsChange={(patch) => updateDraft({ terms: { ...(state.terms || {}), ...patch } })} onSubmit={handleSubmit} onSaveDraft={handleSaveDraft} />}
              {step < 3 && <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/60"><Button variant="ghost" disabled={step === 0} onClick={() => goStep(step - 1)}><ArrowLeft className="w-4 h-4" /> Back</Button><div className="flex items-center gap-2"><Button variant="outline" onClick={handleSaveDraft}><Save className="w-4 h-4" /> Save draft</Button><Button onClick={() => goStep(step + 1)}> {step === 2 ? 'Final check' : 'Continue'} <ArrowRight className="w-4 h-4" /></Button></div></div>}
            </section>
          </div>

          <aside className="hidden lg:block"><div className="sticky top-20 space-y-4"><section className="surface p-4"><p className="font-heading text-sm font-bold mb-3">Contest requirements</p><div className="space-y-2 text-xs"><SummaryRow label="Prize" value={formatINR(contest.prize_amount)} /><SummaryRow label="Platforms" value={platformLabels.length ? platformLabels.join(', ') : 'Your choice'} />{reqs.maxDurationSec && <SummaryRow label="Duration" value={`Up to ${reqs.maxDurationSec}s`} />}{reqs.aspectRatios.length > 0 && <SummaryRow label="Aspect ratio" value={reqs.aspectRatios.join(' or ')} />}<SummaryRow label="Live URL" value={reqs.requireLiveUrl ? 'Required' : 'Optional'} />{reqs.handover.required && <SummaryRow label="Post-win" value="Handover required" />}{reqs.collaboration.required && <SummaryRow label="Post-win" value="Collaboration required" />}</div></section><section className="surface p-4"><p className="font-heading text-sm font-bold flex items-center gap-1.5 mb-3"><ClipboardList className="w-4 h-4 text-primary" /> Checklist</p><SubmissionChecklist items={checklist} />{savedAt && <p className="text-[10px] text-muted-foreground mt-3">Draft autosaves as you work.</p>}</section></div></aside>
        </div>
      </div>

      {step < 3 && <div className="fixed bottom-14 inset-x-0 lg:hidden z-30 bg-background/90 backdrop-blur border-t border-border px-4 py-3 flex items-center gap-2"><Button variant="outline" size="sm" disabled={step === 0} onClick={() => goStep(step - 1)}><ArrowLeft className="w-4 h-4" /></Button><Button variant="outline" size="sm" className="flex-1" onClick={handleSaveDraft}>Save draft</Button><Button size="sm" className="flex-1" onClick={() => goStep(step + 1)}>{step === 2 ? 'Final check' : 'Continue'} <ArrowRight className="w-4 h-4" /></Button></div>}
    </div>
  );
}

function SummaryRow({ label, value }) { return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-medium text-right min-w-0 break-words">{value}</span></div>; }

function ClosedState({ contest }) { return <div className="page-shell"><div className="rz-empty max-w-lg mx-auto"><div><Ban className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" /><p className="font-heading font-bold mb-1">Submission closed</p><p className="text-sm text-muted-foreground">{contest ? `"${contest.title}" is no longer accepting submissions. The deadline has passed or a winner has been selected.` : 'This contest is no longer accepting submissions.'}</p><Link to={contest ? `/contest/${contest.id}` : '/explore'} className="text-sm font-medium text-primary hover:underline mt-4 inline-block">{contest ? 'Back to contest' : 'Discover contests'}</Link></div></div></div>; }
