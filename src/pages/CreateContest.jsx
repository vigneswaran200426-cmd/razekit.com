// Contest creation (spec 1-6, 16).
//
// Three steps: brief -> requirements -> review & publish. The contest is saved
// as a DRAFT after step 1 so the criteria agent has something real to analyse,
// and it cannot be published until the brand confirms its requirements.
//
// Payments are handled off-platform today, so the gate that spec 5 places on
// "Prize + Payment Setup" is applied to publication: an unconfirmed contest
// never goes live.
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, ShieldCheck, CalendarClock, Sparkles, Lock,
  AlertTriangle, Plus, X, Info, Check,
} from 'lucide-react';
import { entities, contestRules, fn } from '@/lib/api';
import { money } from '@/lib/format';
import { PageHeader, Card, Button, Input, Label, Badge, Spinner, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

const CATEGORIES = ['Instagram Reel', 'YouTube Shorts', 'YouTube Video', 'Advertisement', 'Gaming', 'Wedding', 'Documentary', 'Corporate', 'Travel', 'Music Video'];
const MARKETS = {
  IN: { label: 'India (₹ INR)', currency: 'INR', region: 'IN', symbol: '₹' },
  GLOBAL: { label: 'International ($ USD)', currency: 'USD', region: 'GLOBAL', symbol: '$' },
};

const STEPS = ['Brief', 'Requirements', 'Review & publish'];

// Wording the brand sees for statuses the agent returns.
const STATUS_NOTE = {
  UNVERIFIABLE: { tone: 'warning', text: 'Checked by a person' },
  AMBIGUOUS: { tone: 'warning', text: 'Needs clarity' },
  CONFLICTING: { tone: 'danger', text: 'Conflict' },
  RECOMMENDED: { tone: 'primary', text: 'Auto-checked' },
  OPTIONAL: { tone: 'neutral', text: 'Optional' },
};

function Stepper({ step }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className={cn('grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold',
              done ? 'bg-primary text-white' : current ? 'bg-primary/15 text-primary ring-2 ring-primary' : 'bg-surface-2 text-muted')}>
              {done ? <Check className="w-3 h-3" aria-hidden="true" /> : n}
            </span>
            <span className={cn('text-[12px] font-medium', current ? 'text-ink' : 'text-muted')}>{label}</span>
            {i < STEPS.length - 1 && <span className="w-6 h-px bg-line" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

/** One recommended requirement the brand can accept, make mandatory, or drop. */
function RequirementCard({ rec, state, onToggle, onMandatory, onParam }) {
  const [open, setOpen] = useState(false);
  const note = STATUS_NOTE[rec.status] || STATUS_NOTE.OPTIONAL;
  const needsConfig =
    (rec.key === 'publishing.hashtags' && !(rec.params?.tags || []).length) ||
    (rec.key === 'publishing.mention' && !(rec.params?.handles || []).length) ||
    (rec.key === 'content.cta' && !(rec.params?.phrases || []).length);

  return (
    <Card className={cn('p-4 transition-all duration-200', state.included ? 'border-primary/30' : 'opacity-70')}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={state.included}
          onChange={(e) => onToggle(e.target.checked)}
          id={`inc-${rec.key}`}
          className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`inc-${rec.key}`} className="font-semibold text-ink text-[14px] cursor-pointer">{rec.label}</label>
            <Badge tone={note.tone}>{note.text}</Badge>
            {state.mandatory && <Badge tone="danger">Mandatory</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-muted leading-snug">{rec.description}</p>

          {state.included && needsConfig && (
            <div className="mt-3">
              <Label htmlFor={`cfg-${rec.key}`}>
                {rec.key === 'publishing.hashtags' ? 'Required hashtags (comma separated)'
                  : rec.key === 'publishing.mention' ? 'Required @handles (comma separated)'
                  : 'Exact wording creators must include (comma separated)'}
              </Label>
              <Input
                id={`cfg-${rec.key}`}
                value={state.configText || ''}
                onChange={(e) => onParam(e.target.value)}
                placeholder={rec.key === 'publishing.hashtags' ? '#razekit, #launch' : rec.key === 'publishing.mention' ? '@yourbrand' : 'shop now, link in bio'}
              />
              <p className="mt-1 text-[11px] text-muted">
                Leave empty and RazeKit will send this to a person instead of checking it automatically.
              </p>
            </div>
          )}

          {state.included && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-[13px] text-ink cursor-pointer">
                <input type="checkbox" checked={state.mandatory} onChange={(e) => onMandatory(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
                Mandatory
              </label>
              <button type="button" onClick={() => setOpen((o) => !o)} className="text-[12px] font-medium text-primary hover:underline" aria-expanded={open}>
                Why RazeKit recommends this
              </button>
            </div>
          )}

          {open && rec.rationale && (
            <p className="mt-2 rounded-md bg-surface-2 p-3 text-[12px] leading-relaxed text-muted">{rec.rationale}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function CreateContest() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [contestId, setContestId] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  // ── step 1 ────────────────────────────────────────────────────────────────
  const [f, setF] = useState({ title: '', short_description: '', category: CATEGORIES[0], description: '', prize_amount: '', number_of_winners: 1, days: '', market: 'IN', brand_destination_url: '' });
  const [rules, setRules] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const mkt = MARKETS[f.market] || MARKETS.IN;

  useEffect(() => { contestRules().then(setRules).catch(() => {}); }, []);

  const window_ = useMemo(() => {
    const prize = Number(f.prize_amount);
    if (!rules || !prize || f.market !== 'IN') return null;
    const t = rules.tiers.find((x) => x.maxPrize === null || prize <= x.maxPrize);
    return t ? { min: t.minDays, max: Math.min(t.maxDays, rules.globalMaxDays) } : null;
  }, [rules, f.prize_amount, f.market]);

  // ── step 2 ────────────────────────────────────────────────────────────────
  const [analysing, setAnalysing] = useState(false);
  const [recs, setRecs] = useState(null);
  const [notes, setNotes] = useState([]);
  const [agentStatus, setAgentStatus] = useState(null);
  const [agentRunId, setAgentRunId] = useState(null);
  const [sel, setSel] = useState({});          // key -> { included, mandatory, configText }
  const [customs, setCustoms] = useState([]);  // { text, mandatory }
  const [collab, setCollab] = useState(false);
  const [handover, setHandover] = useState(false);

  // ── step 3 ────────────────────────────────────────────────────────────────
  const [confirmed, setConfirmed] = useState(false);

  const chosen = useMemo(
    () => (recs || []).filter((r) => sel[r.key]?.included),
    [recs, sel]
  );
  const mandatoryCount =
    chosen.filter((r) => sel[r.key]?.mandatory).length + customs.filter((c) => c.mandatory).length;

  // Save the brief as a draft, then analyse it.
  const goToRequirements = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.title.trim()) return setErr('Give your contest a title.');
    if (!Number(f.prize_amount)) return setErr('Set a prize amount.');
    const days = Number(f.days);
    if (!days) return setErr('Choose how many days the contest runs.');
    if (window_ && (days < window_.min || days > window_.max)) {
      return setErr(`A ${mkt.symbol}${Number(f.prize_amount).toLocaleString('en-IN')} prize allows a ${window_.min}–${window_.max} day contest.`);
    }

    setSaving(true);
    try {
      let id = contestId;
      const payload = {
        title: f.title.trim(), short_description: f.short_description.trim(), category: f.category,
        description: f.description.trim(), prize_amount: Number(f.prize_amount),
        number_of_winners: Number(f.number_of_winners) || 1,
        deadline: new Date(Date.now() + days * 86400000).toISOString(),
        currency: mkt.currency, settlement_region: mkt.region,
        brand_destination_url: f.brand_destination_url.trim() || undefined,
        status: 'draft', // stays a draft until requirements are confirmed
      };
      if (id) await entities.Contest.update(id, payload);
      else { const c = await entities.Contest.create(payload); id = c.id; setContestId(id); }

      setStep(2);
      setAnalysing(true);
      const r = await fn('criteriaRecommend', { contest_id: id });
      setRecs(r.recommendations || []);
      setNotes(r.notes || []);
      setAgentStatus(r.agent_status);
      setAgentRunId(r.agent_run_id || null);
      // Pre-select recommendations, but nothing is mandatory until the brand says so.
      const initial = {};
      for (const rec of r.recommendations || []) {
        initial[rec.key] = { included: true, mandatory: false, configText: '' };
      }
      setSel(initial);
    } catch (e2) {
      setErr(e2?.data?.error?.message || e2?.data?.error || e2.message || 'Could not save the contest.');
    } finally { setSaving(false); setAnalysing(false); }
  };

  const paramsFor = (rec) => {
    const text = sel[rec.key]?.configText || '';
    const list = text.split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length) return rec.params || {};
    if (rec.key === 'publishing.hashtags') return { ...rec.params, tags: list };
    if (rec.key === 'publishing.mention') return { ...rec.params, handles: list };
    if (rec.key === 'content.cta') return { ...rec.params, phrases: list };
    return rec.params || {};
  };

  const confirmRequirements = async () => {
    setErr('');
    if (!confirmed) return setErr('Please confirm that these requirements are accurate and mandatory.');
    setSaving(true);
    try {
      const r = await fn('criteriaConfirm', {
        contest_id: contestId,
        confirmed: true,
        agent_run_id: agentRunId,
        collaboration_required: collab,
        handover_required: handover,
        criteria: chosen.map((rec) => ({
          key: rec.key,
          mandatory: Boolean(sel[rec.key]?.mandatory),
          params: paramsFor(rec),
          rationale: rec.rationale,
        })),
        custom_instructions: customs.filter((c) => c.text.trim()).map((c) => ({ text: c.text.trim(), mandatory: c.mandatory })),
      });
      if (r?.error) { setErr(r.error.message || r.error); return; }
      // Requirements are locked — the contest may now go live.
      await entities.Contest.update(contestId, { status: 'open' });
      navigate(`/contest/${contestId}`);
    } catch (e2) {
      setErr(e2?.data?.error?.message || e2?.data?.error || e2.message || 'Could not confirm the requirements.');
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <button onClick={() => (step === 1 ? navigate(-1) : setStep(step - 1))} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {step === 1 ? 'Back' : STEPS[step - 2]}
      </button>

      <PageHeader title="Launch a contest" description="Brief the work, define what creators must deliver, then publish." />
      <Stepper step={step} />

      {err && <div className="rounded-md bg-danger/8 text-danger text-sm px-3 py-2" role="alert">{err}</div>}

      {/* ── STEP 1 ─────────────────────────────────────────────────────────── */}
      {step === 1 && (
        <form onSubmit={goToRequirements} className="space-y-5">
          <Card className="p-5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Basics</h2>
            <div><Label htmlFor="t">Contest title</Label><Input id="t" value={f.title} onChange={set('title')} placeholder="e.g. 30s launch reel for our new app" /></div>
            <div><Label htmlFor="sd">Short description</Label><Input id="sd" value={f.short_description} onChange={set('short_description')} placeholder="One line creators see first" /></div>
            <div><Label htmlFor="cat">Category</Label>
              <select id="cat" value={f.category} onChange={set('category')} className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Brief</h2>
            <p className="text-[12px] text-muted -mt-2">The more precise this is, the better RazeKit can suggest requirements.</p>
            <textarea rows={6} value={f.description} onChange={set('description')} aria-label="Contest brief"
              placeholder="Describe the deliverable, duration, platform, footage, CTA, branding, and anything creators must not do…"
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            <div><Label htmlFor="dest">Campaign destination URL</Label>
              <Input id="dest" value={f.brand_destination_url} onChange={set('brand_destination_url')} placeholder="https://yourbrand.com/campaign" />
              <p className="mt-1 text-[11px] text-muted">Where creators send traffic. Without it, Brand Traffic cannot be measured.</p></div>
          </Card>

          <Card className="p-5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Prize &amp; timeline</h2>
            <div><Label htmlFor="mk">Market &amp; currency</Label>
              <select id="mk" value={f.market} onChange={set('market')} className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                {Object.entries(MARKETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div><Label htmlFor="p">Prize ({mkt.symbol})</Label><Input id="p" type="number" min="0" value={f.prize_amount} onChange={set('prize_amount')} placeholder={f.market === 'GLOBAL' ? '300' : '25000'} className="nums" /></div>
              <div><Label htmlFor="w">Winners</Label><Input id="w" type="number" min="1" value={f.number_of_winners} onChange={set('number_of_winners')} className="nums" /></div>
              <div><Label htmlFor="d">Duration (days)</Label>
                <Input id="d" type="number" min={window_?.min || 1} max={window_?.max || 30} value={f.days} onChange={set('days')} placeholder={window_ ? String(window_.min) : '—'} className="nums" disabled={!window_ && f.market === 'IN'} /></div>
            </div>
            {window_ && (
              <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-4">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                  <div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Contest prize</p>
                    <p className="mt-0.5 font-display text-xl font-extrabold text-ink nums">{money(f.prize_amount, mkt.currency)}</p></div>
                  <div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Allowed duration</p>
                    <p className="mt-0.5 font-display text-xl font-extrabold text-primary nums">{window_.min}–{window_.max} days</p></div>
                </div>
                <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-muted">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-success mt-px" aria-hidden="true" />
                  <span><span className="font-semibold text-ink">Fair duration rule.</span> RazeKit automatically sets the allowed contest duration based on prize value, so timelines stay fair and predictable.</span>
                </p>
              </div>
            )}
            {Number(f.prize_amount) > 0 && !window_ && f.market === 'IN' && (
              <p className="flex items-center gap-1.5 text-[12px] text-muted"><CalendarClock className="w-3.5 h-3.5" aria-hidden="true" /> Loading the fair duration rule…</p>
            )}
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" loading={saving}>Define requirements <ArrowRight className="w-4 h-4" aria-hidden="true" /></Button>
          </div>
        </form>
      )}

      {/* ── STEP 2 ─────────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
              <Sparkles className="w-4.5 h-4.5 text-primary" aria-hidden="true" /> Let&rsquo;s define exactly what creators must deliver.
            </h2>
            <p className="mt-1 text-sm text-muted">
              RazeKit read your brief and suggested the requirements below. You decide which ones apply and which are mandatory.
            </p>
            {agentStatus === 'agent_unavailable' && (
              <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-[13px] text-[#8a5300]">
                Automatic analysis is unavailable right now. You can still choose requirements yourself.
              </p>
            )}
          </Card>

          {notes.length > 0 && (
            <Card className="p-4 border-warning/30 bg-warning/[0.05]">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" aria-hidden="true" /> Worth a look
              </h3>
              <ul className="mt-2 space-y-1">
                {notes.map((n, i) => <li key={i} className="text-[13px] text-muted">{n.message}</li>)}
              </ul>
            </Card>
          )}

          {analysing || recs === null ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
          ) : (
            <div className="space-y-3">
              {recs.map((rec) => (
                <RequirementCard
                  key={rec.key}
                  rec={rec}
                  state={sel[rec.key] || { included: false, mandatory: false }}
                  onToggle={(v) => setSel((s) => ({ ...s, [rec.key]: { ...(s[rec.key] || {}), included: v, mandatory: v ? s[rec.key]?.mandatory || false : false } }))}
                  onMandatory={(v) => setSel((s) => ({ ...s, [rec.key]: { ...(s[rec.key] || {}), mandatory: v } }))}
                  onParam={(v) => setSel((s) => ({ ...s, [rec.key]: { ...(s[rec.key] || {}), configText: v } }))}
                />
              ))}
            </div>
          )}

          {/* Collaboration / handover (spec 3) */}
          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Collaboration &amp; account handover</h3>
            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input type="checkbox" checked={collab} onChange={(e) => setCollab(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
              Collaboration required
            </label>
            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input type="checkbox" checked={handover} onChange={(e) => setHandover(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
              Account handover required
            </label>
            {handover && (
              <p className="flex items-start gap-1.5 text-[12px] text-muted">
                <Info className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
                The winning creator completes RazeKit&rsquo;s handover flow, where both sides confirm the transfer before the contest closes.
              </p>
            )}
          </Card>

          {/* Custom mandatory instructions (spec 4) */}
          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Custom instructions</h3>
            <p className="text-[13px] text-muted">Add anything else creators must follow. Each becomes its own requirement.</p>
            {customs.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input value={c.text} aria-label={`Custom instruction ${i + 1}`}
                  onChange={(e) => setCustoms((l) => l.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  placeholder="e.g. Show the product within the first 5 seconds" className="flex-1" />
                <label className="inline-flex items-center gap-1.5 text-[12px] text-ink whitespace-nowrap pt-2.5">
                  <input type="checkbox" checked={c.mandatory} onChange={(e) => setCustoms((l) => l.map((x, j) => (j === i ? { ...x, mandatory: e.target.checked } : x)))} className="h-4 w-4 accent-[rgb(var(--primary))]" />
                  Mandatory
                </label>
                <Button variant="secondary" type="button" aria-label={`Remove instruction ${i + 1}`} onClick={() => setCustoms((l) => l.filter((_, j) => j !== i))}>
                  <X className="w-4 h-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button variant="secondary" type="button" onClick={() => setCustoms((l) => [...l, { text: '', mandatory: true }])}>
              <Plus className="w-4 h-4" aria-hidden="true" /> Add instruction
            </Button>
          </Card>

          <div className="flex justify-between gap-3">
            <Button variant="secondary" onClick={() => setStep(1)}>Edit brief</Button>
            <Button onClick={() => setStep(3)} disabled={!recs}>Review requirements <ArrowRight className="w-4 h-4" aria-hidden="true" /></Button>
          </div>
        </div>
      )}

      {/* ── STEP 3 ─────────────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <Card className="p-5 space-y-4">
            <h2 className="font-display text-lg font-bold text-ink">Confirm contest requirements</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <div><p className="text-[11px] uppercase tracking-wider text-muted">Prize</p><p className="font-display text-lg font-extrabold text-primary nums">{money(f.prize_amount, mkt.currency)}</p></div>
              <div><p className="text-[11px] uppercase tracking-wider text-muted">Duration</p><p className="font-display text-lg font-extrabold text-ink nums">{f.days} days</p></div>
              <div><p className="text-[11px] uppercase tracking-wider text-muted">Mandatory rules</p><p className="font-display text-lg font-extrabold text-ink nums">{mandatoryCount}</p></div>
            </div>

            <ul className="space-y-2">
              {chosen.map((rec) => (
                <li key={rec.key} className="flex items-start justify-between gap-3 rounded-md bg-surface-2 px-3 py-2">
                  <span className="text-[13px] text-ink">{rec.label}</span>
                  {sel[rec.key]?.mandatory ? <Badge tone="danger">Mandatory</Badge> : <Badge tone="neutral">Guidance</Badge>}
                </li>
              ))}
              {customs.filter((c) => c.text.trim()).map((c, i) => (
                <li key={`c${i}`} className="flex items-start justify-between gap-3 rounded-md bg-surface-2 px-3 py-2">
                  <span className="text-[13px] text-ink">{c.text}</span>
                  {c.mandatory ? <Badge tone="danger">Mandatory</Badge> : <Badge tone="neutral">Guidance</Badge>}
                </li>
              ))}
              {(collab || handover) && (
                <li className="flex items-start justify-between gap-3 rounded-md bg-surface-2 px-3 py-2">
                  <span className="text-[13px] text-ink">{[collab && 'Collaboration required', handover && 'Account handover required'].filter(Boolean).join(' · ')}</span>
                  <Badge tone="primary">Configured</Badge>
                </li>
              )}
            </ul>

            <div className="rounded-lg border border-warning/30 bg-warning/[0.06] p-4 space-y-1.5">
              <p className="text-[13px] font-semibold text-ink">These requirements become the official rules for this contest.</p>
              <p className="text-[12px] leading-relaxed text-muted">
                Creators who fail a mandatory requirement may become ineligible for winner selection, even when their performance score is high.
              </p>
            </div>

            <label className="flex items-start gap-2.5 text-[13px] text-ink cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--primary))]" />
              I confirm that these requirements are accurate and mandatory for this contest.
            </label>
          </Card>

          <div className="flex justify-between gap-3">
            <Button variant="secondary" onClick={() => setStep(2)}>Edit requirements</Button>
            <Button onClick={confirmRequirements} loading={saving} disabled={!confirmed}>
              <Lock className="w-4 h-4" aria-hidden="true" /> Confirm &amp; publish contest
            </Button>
          </div>
          {!confirmed && (
            <p className="text-right text-[12px] text-muted">Publishing stays locked until you confirm the requirements.</p>
          )}
        </div>
      )}
    </div>
  );
}
