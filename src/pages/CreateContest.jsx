import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Save, ArrowLeft, ArrowRight, Rocket, Check, Loader2, Pencil, Wallet } from 'lucide-react';
import { canPerformAction } from '@/lib/enforcement-utils';
import AddFundsDialog from '@/components/AddFundsDialog';
import BasicInfoSection from '@/components/campaign/BasicInfoSection';
import CampaignBriefSection from '@/components/campaign/CampaignBriefSection';
import ResourcesSection from '@/components/campaign/ResourcesSection';
import DeliverablesSection from '@/components/campaign/DeliverablesSection';
import RequirementsSection from '@/components/campaign/RequirementsSection';
import AwardsSection from '@/components/campaign/AwardsSection';
import ParticipationSection from '@/components/campaign/ParticipationSection';
import TimelineSection from '@/components/campaign/TimelineSection';
import WinnerOutcomeSection from '@/components/campaign/WinnerOutcomeSection';
import { validateBrief, buildContestPayload, platformFee, gstOnFee, parseJSON, briefHasText } from '@/lib/campaign-brief';
import { formatPrize } from '@/lib/utils';

const STEPS = [
  { n: 1, label: 'Basic' }, { n: 2, label: 'Brief' }, { n: 3, label: 'Requirements' },
  { n: 4, label: 'Assets' }, { n: 5, label: 'Rules' }, { n: 6, label: 'Winner' },
  { n: 7, label: 'Prize' }, { n: 8, label: 'Review' },
];
// validateBrief section numbers that gate each step's Continue (4=optional -> not gated)
const STEP_GATE = { 1: [1], 2: [2], 3: [4], 5: [8], 7: [6] };
const OUTCOME_LABEL = { ACCOUNT_HANDOVER: 'Handover', CLIENT_COLLABORATION: 'Collaboration', NONE: 'Contest ends with winner' };

const makeInitial = () => ({
  contest_id: `CTST-${Date.now().toString(36).toUpperCase()}`,
  title: '', category: '', contest_type: '', short_description: '', cover_image_url: '', brief: '',
  resources: '[]', deliverables: '[]', custom_requirements: '[]',
  prize_amount: 0, number_of_winners: 1, prize_positions: '[]', settlement_region: 'IN', currency: 'INR',
  handover_required: false, verified_creators_only: false, private_contest: false,
  submission_limit: 0, start_date: '', start_time: '', deadline: '', timezone: 'UTC', preferred_software: 'Any',
  post_winner_action: '', handover_type: '', account_property_type: '', handover_notes: '', handover_deadline: '',
  collaboration_type: '', collaboration_duration: '', collaboration_responsibilities: '', collaboration_notes: '',
  additional_compensation: '', collaboration_communication: '',
});

const calcBalance = (txns) => txns.reduce((s, t) => (t.type === 'add' || t.type === 'release' ? s + t.amount : t.type === 'reserve' || t.type === 'payout' ? s - t.amount : s), 0);

export default function CreateContest() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState(makeInitial);
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [draftId, setDraftId] = useState(null);
  const [funds, setFunds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [publishing, setPublishing] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const dirty = useRef(false);
  const savingRef = useRef(false);

  const fetchFunds = useCallback(async () => {
    try { setFunds(calcBalance(await base44.entities.FundsTransaction.list('-created_date', 100))); } catch {}
  }, []);
  useEffect(() => { fetchFunds().finally(() => setLoading(false)); }, [fetchFunds]);

  const update = (u) => { dirty.current = true; setData((p) => ({ ...p, ...u })); };

  const saveDraft = useCallback(async (silent) => {
    if (savingRef.current) return;
    savingRef.current = true; setSaveStatus('saving');
    try {
      const payload = buildContestPayload(data, 'draft');
      if (draftId) await base44.entities.Contest.update(draftId, payload);
      else { const c = await base44.entities.Contest.create(payload); setDraftId(c.id); }
      dirty.current = false; setSaveStatus('saved');
      if (!silent) toast({ title: 'Draft saved' });
    } catch (err) { setSaveStatus('idle'); if (!silent) toast({ title: 'Could not save draft', description: err.message, variant: 'destructive' }); }
    finally { savingRef.current = false; }
  }, [data, draftId, toast]);

  // Persistent draft — autosaves while the creator types.
  useEffect(() => { if (!dirty.current) return; const t = setTimeout(() => saveDraft(true), 2500); return () => clearTimeout(t); }, [data, saveDraft]);

  const { warnings } = validateBrief(data, funds);

  const stepBlockers = (n) => {
    if (n === 6) return data.post_winner_action ? [] : ['Choose what happens after the winner is selected'];
    if (n === 8) return warnings.map((w) => w.message);
    const secs = STEP_GATE[n] || [];
    return warnings.filter((w) => secs.includes(w.section)).map((w) => w.message);
  };

  const goTo = (n) => { if (n <= maxStep) setStep(n); };
  const next = () => {
    const b = stepBlockers(step);
    if (b.length) { toast({ title: b[0], variant: 'destructive' }); return; }
    const n = Math.min(8, step + 1);
    setStep(n); setMaxStep((m) => Math.max(m, n));
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const handleLaunch = async () => {
    if (stepBlockers(8).length) { toast({ title: 'Complete all required fields first', variant: 'destructive' }); return; }
    setPublishing(true);
    try {
      const me = await base44.auth.me().catch(() => null);
      const gate = await canPerformAction(me, 'create_context');
      if (!gate.ok) { toast({ title: 'Cannot launch', description: gate.reason, variant: 'destructive' }); return; }
      const totalCost = (data.prize_amount || 0) + platformFee(data.prize_amount);
      await base44.entities.FundsTransaction.create({ type: 'reserve', amount: totalCost, description: `Reserved for contest: ${data.title}` });
      const payload = buildContestPayload(data, 'open');
      const contest = draftId ? await base44.entities.Contest.update(draftId, payload) : await base44.entities.Contest.create(payload);
      navigate(`/contest-published/${contest.id || draftId}`);
    } catch (err) { toast({ title: 'Failed to launch contest', description: err.message, variant: 'destructive' }); }
    finally { setPublishing(false); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;

  const pool = Number(data.prize_amount) || 0;
  const fee = platformFee(pool);
  const gst = gstOnFee(pool);
  const total = pool + fee + gst;
  const cur = data.currency;
  const blockers = stepBlockers(step);

  const StepButton = ({ s }) => {
    const done = s.n < step;
    const active = s.n === step;
    const reachable = s.n <= maxStep;
    return (
      <button onClick={() => goTo(s.n)} disabled={!reachable}
        className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-brand
          ${active ? 'bg-primary text-primary-foreground shadow-primary-glow' : done ? 'text-primary bg-primary/5' : 'text-muted-foreground'}
          ${reachable ? 'hover:bg-secondary/70' : 'opacity-50 cursor-not-allowed'}`}>
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${active ? 'bg-white/25' : done ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
          {done ? <Check className="w-3 h-3" /> : s.n}
        </span>
        {s.label}
      </button>
    );
  };

  return (
    <div className="page-shell min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="font-heading text-xl md:text-2xl font-bold tracking-tight">Create contest</h1>
            <p className="text-sm text-muted-foreground">Step {step} of 8 · {STEPS[step - 1].label}</p>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus !== 'idle' && <span className="text-xs text-muted-foreground">{saveStatus === 'saving' ? 'Saving…' : 'Saved'}</span>}
            <Button variant="outline" size="sm" onClick={() => saveDraft(false)}><Save className="w-4 h-4" /> Save draft</Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[230px_minmax(0,1fr)] gap-6 items-start">
          {/* Desktop workspace rail — full journey at a glance + contextual cost */}
          <aside className="hidden lg:flex flex-col gap-4 sticky top-6">
            <div className="surface rounded-2xl p-2.5 space-y-1 elev-1">
              {STEPS.map((s) => <StepButton key={s.n} s={s} />)}
            </div>
            <div className="surface rounded-2xl p-4 space-y-1.5 elev-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Estimated cost</p>
              <p className="font-heading text-xl font-bold nums">{formatPrize(total, cur)}</p>
              <p className="text-[11px] text-muted-foreground nums">Prize {formatPrize(pool, cur)} + fee {formatPrize(fee + gst, cur)}</p>
              <p className="text-[11px] text-muted-foreground nums">Wallet balance {formatPrize(funds, cur)}</p>
              {funds < total && <p className="text-[11px] font-medium text-warning">Add {formatPrize(total - funds, cur)} to publish</p>}
            </div>
          </aside>

          {/* Mobile/tablet horizontal stepper */}
          <div className="lg:hidden flex items-center gap-1 overflow-x-auto scrollbar-hide pb-1">
            {STEPS.map((s, i) => {
              const done = s.n < step;
              const active = s.n === step;
              const reachable = s.n <= maxStep;
              return (
                <div key={s.n} className="flex items-center shrink-0">
                  <button onClick={() => goTo(s.n)} disabled={!reachable}
                    className={`flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : done ? 'text-primary' : 'text-muted-foreground'} ${reachable ? 'hover:bg-secondary/70' : 'opacity-50 cursor-not-allowed'}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${active ? 'bg-white/25' : done ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                      {done ? <Check className="w-3 h-3" /> : s.n}
                    </span>
                    {s.label}
                  </button>
                  {i < STEPS.length - 1 && <span className="w-3 h-px bg-border mx-0.5" />}
                </div>
              );
            })}
          </div>

          {/* Step body — one logical section at a time on every viewport */}
          <div className="min-w-0">
            <div className="glass-card rounded-2xl p-5 md:p-6 min-h-[320px]">
              <AnimatePresence mode="wait">
                <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                  {step === 1 && <BasicInfoSection data={data} update={update} />}
                  {step === 2 && <CampaignBriefSection data={data} update={update} />}
                  {step === 3 && <div className="space-y-6"><DeliverablesSection data={data} update={update} /><RequirementsSection data={data} update={update} /></div>}
                  {step === 4 && <ResourcesSection data={data} update={update} />}
                  {step === 5 && <div className="space-y-6"><ParticipationSection data={data} update={update} /><TimelineSection data={data} update={update} /></div>}
                  {step === 6 && <WinnerOutcomeSection data={data} update={update} />}
                  {step === 7 && (
                    <div className="space-y-5">
                      <div>
                        <h3 className="font-heading text-lg font-semibold">Prize &amp; payment</h3>
                        <p className="text-sm text-muted-foreground">Choose the settlement region, then set the award.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => update({ settlement_region: 'IN', currency: 'INR' })}
                          className={`p-4 rounded-2xl border-2 text-left transition-all ease-brand ${data.settlement_region === 'IN' ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
                          <p className="font-heading font-semibold">India</p><p className="text-xs text-muted-foreground">INR ₹ · Razorpay</p>
                        </button>
                        <button type="button" disabled title="Coming soon"
                          className="p-4 rounded-2xl border-2 border-border bg-card text-left opacity-60 cursor-not-allowed">
                          <p className="font-heading font-semibold">Global</p><p className="text-xs text-muted-foreground">USD $ · Stripe · Coming soon</p>
                        </button>
                      </div>
                      <AwardsSection data={data} update={update} />
                      <FeeBreakdown pool={pool} fee={fee} gst={gst} total={total} cur={cur} />
                    </div>
                  )}
                  {step === 8 && (
                    <ReviewStep data={data} pool={pool} fee={fee} gst={gst} total={total} cur={cur} funds={funds} warnings={warnings} onEdit={goTo} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Missing-field detection — quiet inline guidance before the toast ever fires */}
            {blockers.length > 0 && step < 8 && (
              <p className="text-xs text-warning mt-2.5 px-1">Complete “{blockers[0]}” to continue.</p>
            )}

            {/* Footer nav */}
            <div className="flex items-center justify-between gap-3 mt-5">
              <Button variant="outline" onClick={back} disabled={step === 1}><ArrowLeft className="w-4 h-4" /> Back</Button>
              {step < 8 ? (
                <Button onClick={next}>Continue <ArrowRight className="w-4 h-4" /></Button>
              ) : (
                <div className="flex items-center gap-2">
                  {funds < total && <Button variant="outline" onClick={() => setShowAddFunds(true)}><Wallet className="w-4 h-4" /> Add to wallet</Button>}
                  <Button onClick={handleLaunch} disabled={publishing}>
                    {publishing ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</> : <><Rocket className="w-4 h-4" /> Fund &amp; Publish</>}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AddFundsDialog open={showAddFunds} onOpenChange={setShowAddFunds} onSuccess={fetchFunds} />
    </div>
  );
}

function FeeBreakdown({ pool, fee, gst, total, cur }) {
  const Row = ({ label, value, strong }) => (
    <div className="flex items-center justify-between py-1.5"><span className={`text-sm ${strong ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span><span className={`text-sm ${strong ? 'font-heading font-bold' : ''}`}>{value}</span></div>
  );
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">You pay</p>
      <div className="divide-y divide-border/60">
        <Row label="Prize pool" value={formatPrize(pool, cur)} />
        <Row label="Razekit platform fee (10%)" value={formatPrize(fee, cur)} />
        {cur !== 'USD' && <Row label="GST on fee (18%)" value={formatPrize(gst, cur)} />}
        <Row label="Total" value={formatPrize(total, cur)} strong />
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">The prize is reserved from your Razekit wallet balance. Live provider settlement is manual for now.</p>
    </div>
  );
}

function ReviewStep({ data, pool, fee, gst, total, cur, funds, warnings, onEdit }) {
  const resources = parseJSON(data.resources), deliverables = parseJSON(data.deliverables), reqs = parseJSON(data.custom_requirements), positions = parseJSON(data.prize_positions);
  const briefText = (() => { const d = document.createElement('div'); d.innerHTML = data.brief || ''; return (d.textContent || '').trim(); })();
  const Row = ({ label, value, step }) => (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-border/60 last:border-0">
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium truncate">{value || <span className="text-muted-foreground">—</span>}</p></div>
      <button onClick={() => onEdit(step)} className="text-xs text-primary font-medium inline-flex items-center gap-1 shrink-0"><Pencil className="w-3 h-3" /> Edit</button>
    </div>
  );
  return (
    <div className="space-y-4">
      <div><h3 className="font-heading text-lg font-semibold">Review your contest</h3><p className="text-sm text-muted-foreground">Check everything before funding and publishing.</p></div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <Row step={1} label="Basic details" value={data.title ? `${data.title} · ${data.category || '—'}${data.contest_type ? ` · ${data.contest_type}` : ''}` : ''} />
        <Row step={2} label="Brief" value={briefText ? `${briefText.slice(0, 80)}${briefText.length > 80 ? '…' : ''}` : ''} />
        <Row step={3} label="Requirements" value={`${deliverables.length} deliverable${deliverables.length === 1 ? '' : 's'} · ${reqs.length} custom rule${reqs.length === 1 ? '' : 's'}`} />
        <Row step={4} label="References & footage" value={`${resources.length} resource${resources.length === 1 ? '' : 's'}`} />
        <Row step={5} label="Rules & timeline" value={data.deadline ? `Deadline ${new Date(data.deadline).toLocaleDateString('en-IN')} · ${data.number_of_winners} winner(s)` : ''} />
        <Row step={6} label="After winner" value={OUTCOME_LABEL[data.post_winner_action] || ''} />
        <Row step={7} label="Prize & payment" value={pool ? `${formatPrize(pool, cur)} · ${positions.length} position(s)` : ''} />
      </div>
      <FeeBreakdown pool={pool} fee={fee} gst={gst} total={total} cur={cur} />
      {warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-700 mb-1">Fix {warnings.length} item{warnings.length === 1 ? '' : 's'} before publishing</p>
          <ul className="text-xs text-amber-700/90 list-disc pl-4 space-y-0.5">{warnings.slice(0, 6).map((w, i) => <li key={i}>{w.message}</li>)}</ul>
        </div>
      )}
    </div>
  );
}