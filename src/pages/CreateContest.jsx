// Contest creation (spec 1-6, 16).
//
// Three steps: brief -> requirements -> review & confirm. The contest is saved
// as a DRAFT after step 1 so the criteria agent has something real to analyse,
// and it cannot be confirmed until the brand agrees to its own requirements.
//
// The problems this screen solves, beyond collecting fields:
//   - A long form on a phone loses work. Every keystroke is mirrored into this
//     device's local storage under the signed-in user's key, so a mis-tapped
//     back gesture costs nothing. The draft is cleared the moment it is saved
//     for real.
//   - An error at the top of a form is an error the user has to hunt for. Each
//     one is attached to the field that caused it, and the first bad field is
//     focused.
//   - Confirming requirements is not funding. Nothing here says a contest is
//     funded, held or guaranteed — the prize is only ever described as
//     verified once the server says a person checked the transfer.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, ShieldCheck, CalendarClock, Sparkles, Lock,
  AlertTriangle, Plus, X, Info, Check, RotateCcw,
} from 'lucide-react';
import { entities, contestRules, fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { PageHeader, Card, Button, Input, Label, Badge, Skeleton, Field, Sheet } from '@/components/ui';
import { cn } from '@/lib/cn';

const CATEGORIES = ['Instagram Reel', 'YouTube Shorts', 'YouTube Video', 'Advertisement', 'Gaming', 'Wedding', 'Documentary', 'Corporate', 'Travel', 'Music Video'];
const MARKETS = {
  IN: { label: 'India (₹ INR)', currency: 'INR', region: 'IN', symbol: '₹' },
  GLOBAL: { label: 'International ($ USD)', currency: 'USD', region: 'GLOBAL', symbol: '$' },
};

const STEPS = ['Brief', 'Requirements', 'Review & confirm'];
const DRAFT_VERSION = 1;

// Wording the brand sees for statuses the agent returns.
const STATUS_NOTE = {
  UNVERIFIABLE: { tone: 'warning', text: 'Checked by a person' },
  AMBIGUOUS: { tone: 'warning', text: 'Needs clarity' },
  CONFLICTING: { tone: 'danger', text: 'Conflict' },
  RECOMMENDED: { tone: 'primary', text: 'Auto-checked' },
  OPTIONAL: { tone: 'neutral', text: 'Optional' },
};

const SELECT_CLS = 'h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const TEXTAREA_CLS = 'w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-muted/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function isHttpUrl(v) {
  try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

/* ── Progress ───────────────────────────────────────────────────────────────
   A bar and a plain "step 2 of 3" on a phone, the full labelled sequence once
   there is room for it. Both describe the same position; neither is decorative. */
function Stepper({ step }) {
  const pct = Math.round(((step - 1) / (STEPS.length - 1)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 sm:hidden">
        <p className="text-[13px] font-semibold text-ink">{STEPS[step - 1]}</p>
        <p className="nums text-[12px] text-muted">Step {step} of {STEPS.length}</p>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-2 sm:hidden">
        <div
          className="rk-bar h-full rounded-full bg-primary"
          style={{ width: `${Math.max(pct, 6)}%` }}
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-label={`Step ${step} of ${STEPS.length}: ${STEPS[step - 1]}`}
        />
      </div>

      <ol className="hidden items-center gap-2 sm:flex" aria-label="Progress">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          return (
            <li key={label} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
              <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                done ? 'bg-primary text-white' : current ? 'bg-primary/15 text-primary ring-2 ring-primary' : 'bg-surface-2 text-muted')}>
                {done ? <Check className="h-3 w-3" aria-hidden="true" /> : n}
                <span className="sr-only">{done ? 'completed' : current ? 'current step' : 'not started'}</span>
              </span>
              <span className={cn('text-[12px] font-medium', current ? 'text-ink' : 'text-muted')}>{label}</span>
              {i < STEPS.length - 1 && <span className="h-px w-6 bg-line" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The step's actions, reachable without scrolling back up on a phone.
 *  Labels shorten below 640px: the buttons never wrap, so a long label at
 *  360px would push the page sideways. */
function StepActions({ back, backLabel, shortBackLabel, children }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-md pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-lg sm:border sm:px-4 sm:pb-3">
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" size="lg" type="button" onClick={back}>
          <span className="sm:hidden">{shortBackLabel || backLabel}</span>
          <span className="hidden sm:inline">{backLabel}</span>
        </Button>
        {children}
      </div>
    </div>
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
          className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--primary))]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`inc-${rec.key}`} className="cursor-pointer break-words text-[14px] font-semibold text-ink">{rec.label}</label>
            <Badge tone={note.tone}>{note.text}</Badge>
            {state.mandatory && <Badge tone="danger">Mandatory</Badge>}
          </div>
          <p className="mt-1 break-words text-[13px] leading-snug text-muted">{rec.description}</p>

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
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                className="h-11"
                placeholder={rec.key === 'publishing.hashtags' ? '#razekit, #launch' : rec.key === 'publishing.mention' ? '@yourbrand' : 'shop now, link in bio'}
              />
              <p className="mt-1 text-[11px] leading-snug text-muted">
                Leave empty and RazeKit will send this to a person instead of checking it automatically.
              </p>
            </div>
          )}

          {state.included && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" checked={state.mandatory} onChange={(e) => onMandatory(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--primary))]" />
                Mandatory
              </label>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="inline-flex min-h-[44px] items-center text-[12px] font-medium text-primary hover:underline"
                aria-expanded={open}
              >
                Why RazeKit recommends this
              </button>
            </div>
          )}

          {open && rec.rationale && (
            <p className="mt-1 rounded-md bg-surface-2 p-3 text-[12px] leading-relaxed text-muted">{rec.rationale}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function CreateContest() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [contestId, setContestId] = useState(null);
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState({});
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const formRef = useRef(null);
  const hydrated = useRef(false);

  // ── step 1 ────────────────────────────────────────────────────────────────
  const [f, setF] = useState({ title: '', short_description: '', category: CATEGORIES[0], description: '', prize_amount: '', number_of_winners: 1, days: '', market: 'IN', brand_destination_url: '' });
  const [rules, setRules] = useState(null);
  const set = (k) => (e) => {
    const { value } = e.target;
    setF((s) => ({ ...s, [k]: value }));
    setFieldErr((s) => (s[k] ? { ...s, [k]: undefined } : s));
  };
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

  /* ── Draft persistence ────────────────────────────────────────────────────
     Keyed by user so a shared device never shows one brand another's brief.
     Local storage can throw (private mode, storage disabled); a draft is a
     convenience, so every access fails quietly. */
  const draftKey = user?.id ? `rk:create-contest:${user.id}` : null;

  const dirty = useMemo(
    () => Boolean(f.title.trim() || f.short_description.trim() || f.description.trim() || f.prize_amount || f.days || f.brand_destination_url.trim() || contestId),
    [f, contestId]
  );

  const clearDraft = useCallback(() => {
    try { if (draftKey) localStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
  }, [draftKey]);

  // Restore before the first render that matters, once we know who is signed in.
  useEffect(() => {
    if (hydrated.current || authLoading || !draftKey) return;
    hydrated.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || d.v !== DRAFT_VERSION) return;
      if (d.f) setF((s) => ({ ...s, ...d.f }));
      if (d.contestId) setContestId(d.contestId);
      if (d.customs) setCustoms(d.customs);
      if (d.sel) setSel(d.sel);
      if (typeof d.collab === 'boolean') setCollab(d.collab);
      if (typeof d.handover === 'boolean') setHandover(d.handover);
      // The brief is restorable; the agent's analysis is not, so a restored
      // draft always re-enters at step 1 rather than pretending step 2 is ready.
      setRestored(true);
    } catch { /* a corrupt draft is not worth surfacing */ }
  }, [authLoading, draftKey]);

  useEffect(() => {
    if (!hydrated.current || !draftKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ v: DRAFT_VERSION, f, contestId, customs, sel, collab, handover, at: Date.now() }));
    } catch { /* storage unavailable */ }
  }, [draftKey, f, contestId, customs, sel, collab, handover]);

  // A full page unload would take the in-flight step with it.
  useEffect(() => {
    if (!dirty) return undefined;
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const focusField = (name) => {
    const el = formRef.current?.querySelector(`#${name}`);
    if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };

  /** Everything wrong with step 1, keyed by the field it belongs to. */
  const validateBrief = () => {
    const e = {};
    if (!f.title.trim()) e.title = 'Give your contest a title creators will recognise.';
    else if (f.title.trim().length < 6) e.title = 'A little longer, please — this is the headline creators scan.';
    if (f.short_description.length > 140) e.short_description = 'Keep this under 140 characters.';

    const prize = Number(f.prize_amount);
    if (!f.prize_amount) e.prize_amount = 'Set the prize the winner receives.';
    else if (!Number.isFinite(prize) || prize <= 0) e.prize_amount = 'The prize must be more than zero.';

    const winners = Number(f.number_of_winners);
    if (!Number.isFinite(winners) || winners < 1) e.number_of_winners = 'At least one winner.';
    else if (!Number.isInteger(winners)) e.number_of_winners = 'Whole numbers only.';

    const days = Number(f.days);
    if (!f.days) e.days = 'Choose how many days the contest runs.';
    else if (!Number.isFinite(days) || days < 1) e.days = 'A contest runs for at least one day.';
    else if (window_ && (days < window_.min || days > window_.max)) {
      e.days = `A ${mkt.symbol}${Number(f.prize_amount).toLocaleString('en-IN')} prize allows a ${window_.min}–${window_.max} day contest.`;
    }

    if (f.brand_destination_url.trim() && !isHttpUrl(f.brand_destination_url.trim())) {
      e.brand_destination_url = 'Include the full address, starting with https://';
    }
    return e;
  };

  // Save the brief as a draft, then analyse it.
  const goToRequirements = async (e) => {
    e.preventDefault();
    setErr('');
    const bad = validateBrief();
    setFieldErr(bad);
    const first = Object.keys(bad)[0];
    if (first) { focusField(first); return; }

    setSaving(true);
    try {
      let id = contestId;
      const days = Number(f.days);
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
      setRestored(false);
      setAnalysing(true);
      const r = await fn('criteriaRecommend', { contest_id: id });
      setRecs(r.recommendations || []);
      setNotes(r.notes || []);
      setAgentStatus(r.agent_status);
      setAgentRunId(r.agent_run_id || null);
      // Pre-select recommendations, but nothing is mandatory until the brand
      // says so. Choices already made for a key that survived a re-analysis are
      // kept — re-editing the brief should not silently undo them.
      setSel((prev) => {
        const next = {};
        for (const rec of r.recommendations || []) {
          next[rec.key] = prev[rec.key] || { included: true, mandatory: false, configText: '' };
        }
        return next;
      });
    } catch (e2) {
      setErr(e2?.data?.error?.message || e2?.data?.error || e2.message || 'Could not save the contest.');
    } finally { setSaving(false); setAnalysing(false); }
  };

  const goToReview = () => {
    setErr('');
    const blank = customs.findIndex((c) => !c.text.trim());
    if (blank >= 0) {
      setFieldErr({ [`custom-${blank}`]: 'Write the instruction, or remove this row.' });
      focusField(`custom-${blank}`);
      return;
    }
    setFieldErr({});
    setStep(3);
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
    if (!confirmed) {
      setFieldErr({ confirm: 'Tick the box to confirm these requirements are accurate.' });
      focusField('confirm');
      return;
    }
    setFieldErr({});
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
      // Requirements are locked — the contest may now leave draft.
      await entities.Contest.update(contestId, { status: 'open' });
      clearDraft();
      navigate(`/contest/${contestId}`);
    } catch (e2) {
      setErr(e2?.data?.error?.message || e2?.data?.error || e2.message || 'Could not confirm the requirements.');
    } finally { setSaving(false); }
  };

  const back = () => {
    if (step > 1) { setStep(step - 1); setFieldErr({}); return; }
    if (dirty) { setLeaving(true); return; }
    navigate(-1);
  };

  return (
    <div ref={formRef} className="mx-auto w-full max-w-3xl space-y-5">
      <button
        onClick={back}
        className="-ml-1 inline-flex min-h-[44px] items-center gap-1.5 px-1 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {step === 1 ? 'Back' : STEPS[step - 2]}
      </button>

      <PageHeader title="Launch a contest" description="Brief the work, define what creators must deliver, then confirm the rules." />
      <Stepper step={step} />

      {restored && step === 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-2/70 px-3.5 py-3">
          <p className="text-[13px] text-ink">
            We restored the draft you left on this device. Nothing was published.
          </p>
          <button
            type="button"
            onClick={() => {
              clearDraft();
              setF({ title: '', short_description: '', category: CATEGORIES[0], description: '', prize_amount: '', number_of_winners: 1, days: '', market: 'IN', brand_destination_url: '' });
              setCustoms([]); setSel({}); setCollab(false); setHandover(false); setContestId(null); setRestored(false);
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Start fresh
          </button>
        </div>
      )}

      {err && <div className="rounded-md bg-danger/8 px-3 py-2.5 text-sm text-danger" role="alert">{err}</div>}

      {/* ── STEP 1 ─────────────────────────────────────────────────────────── */}
      {step === 1 && (
        <form onSubmit={goToRequirements} className="space-y-5" noValidate>
          <Card className="space-y-4 p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Basics</h2>

            <Field id="title" label="Contest title" required error={fieldErr.title} hint="Creators scan this first.">
              <Input
                id="title" value={f.title} onChange={set('title')} maxLength={120}
                enterKeyHint="next" autoComplete="off" className="h-11"
                aria-invalid={fieldErr.title ? 'true' : undefined}
                aria-describedby={fieldErr.title ? 'title-error' : undefined}
                placeholder="e.g. 30s launch reel for our new app"
              />
            </Field>

            <Field
              id="short_description" label="Short description" error={fieldErr.short_description}
              hint={`One line creators see first. ${140 - f.short_description.length} characters left.`}
            >
              <Input
                id="short_description" value={f.short_description} onChange={set('short_description')} maxLength={160}
                enterKeyHint="next" autoComplete="off" className="h-11"
                aria-invalid={fieldErr.short_description ? 'true' : undefined}
                aria-describedby={fieldErr.short_description ? 'short_description-error' : undefined}
                placeholder="One line creators see first"
              />
            </Field>

            <Field id="category" label="Category">
              <select id="category" value={f.category} onChange={set('category')} className={SELECT_CLS}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </Card>

          <Card className="space-y-4 p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Brief</h2>

            <Field
              id="description" label="What creators must make"
              hint="The more precise this is, the better RazeKit can suggest requirements — platform, duration, footage, call to action, and anything creators must not do."
            >
              <textarea
                id="description" rows={6} value={f.description} onChange={set('description')}
                className={TEXTAREA_CLS}
                placeholder="Describe the deliverable, duration, platform, footage, CTA, branding, and anything creators must not do…"
              />
            </Field>

            <Field
              id="brand_destination_url" label="Campaign destination URL" error={fieldErr.brand_destination_url}
              hint="Where creators send traffic. Without it, brand traffic cannot be measured for this contest."
            >
              <Input
                id="brand_destination_url" type="url" inputMode="url" value={f.brand_destination_url} onChange={set('brand_destination_url')}
                autoComplete="url" autoCapitalize="none" autoCorrect="off" spellCheck="false" enterKeyHint="next" className="h-11"
                aria-invalid={fieldErr.brand_destination_url ? 'true' : undefined}
                aria-describedby={fieldErr.brand_destination_url ? 'brand_destination_url-error' : undefined}
                placeholder="https://yourbrand.com/campaign"
              />
            </Field>
          </Card>

          <Card className="space-y-4 p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Prize &amp; timeline</h2>

            <Field id="market" label="Market &amp; currency">
              <select id="market" value={f.market} onChange={set('market')} className={SELECT_CLS}>
                {Object.entries(MARKETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="prize_amount" label={`Prize (${mkt.symbol})`} required error={fieldErr.prize_amount}>
                <Input
                  id="prize_amount" type="number" inputMode="numeric" min="1" step="1"
                  value={f.prize_amount} onChange={set('prize_amount')} className="nums h-11" enterKeyHint="next"
                  aria-invalid={fieldErr.prize_amount ? 'true' : undefined}
                  aria-describedby={fieldErr.prize_amount ? 'prize_amount-error' : undefined}
                  placeholder={f.market === 'GLOBAL' ? '300' : '25000'}
                />
              </Field>

              <Field id="number_of_winners" label="Winners" required error={fieldErr.number_of_winners}>
                <Input
                  id="number_of_winners" type="number" inputMode="numeric" min="1" step="1"
                  value={f.number_of_winners} onChange={set('number_of_winners')} className="nums h-11" enterKeyHint="next"
                  aria-invalid={fieldErr.number_of_winners ? 'true' : undefined}
                  aria-describedby={fieldErr.number_of_winners ? 'number_of_winners-error' : undefined}
                />
              </Field>

              <Field
                id="days" label="Duration (days)" required error={fieldErr.days}
                hint={window_ ? `${window_.min}–${window_.max} days for this prize.` : undefined}
              >
                <Input
                  id="days" type="number" inputMode="numeric" min={window_?.min || 1} max={window_?.max || 30} step="1"
                  value={f.days} onChange={set('days')} className="nums h-11" enterKeyHint="done"
                  aria-invalid={fieldErr.days ? 'true' : undefined}
                  aria-describedby={fieldErr.days ? 'days-error' : undefined}
                  placeholder={window_ ? String(window_.min) : '—'}
                  disabled={!window_ && f.market === 'IN'}
                />
              </Field>
            </div>

            {window_ && (
              <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-4">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Contest prize</p>
                    <p className="nums mt-0.5 font-display text-xl font-extrabold text-ink">{money(f.prize_amount, mkt.currency)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Allowed duration</p>
                    <p className="nums mt-0.5 font-display text-xl font-extrabold text-primary">{window_.min}–{window_.max} days</p>
                  </div>
                </div>
                <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-muted">
                  <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  <span><span className="font-semibold text-ink">Fair duration rule.</span> RazeKit sets the allowed contest duration from the prize value, so timelines stay predictable for creators.</span>
                </p>
              </div>
            )}
            {Number(f.prize_amount) > 0 && !window_ && f.market === 'IN' && (
              <p className="flex items-center gap-1.5 text-[12px] text-muted" aria-live="polite">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Loading the fair duration rule…
              </p>
            )}
          </Card>

          <StepActions back={back} backLabel="Cancel">
            <Button type="submit" size="lg" loading={saving} className="sm:min-w-[10rem]">
              <span className="sm:hidden">Continue</span>
              <span className="hidden sm:inline">Define requirements</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </StepActions>
        </form>
      )}

      {/* ── STEP 2 ─────────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <h2 className="flex items-start gap-2 font-display text-lg font-bold text-ink">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              Define exactly what creators must deliver.
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              RazeKit read your brief and suggested the requirements below. You decide which apply, and which are mandatory.
            </p>
            {agentStatus === 'agent_unavailable' && (
              <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-[13px] leading-relaxed text-ink" role="status">
                Automatic analysis is unavailable right now. You can still choose requirements yourself — nothing is lost.
              </p>
            )}
          </Card>

          {notes.length > 0 && (
            <Card className="border-warning/30 bg-warning/[0.05] p-4">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" /> Worth a look
              </h3>
              <ul className="mt-2 space-y-1">
                {notes.map((n, i) => <li key={i} className="text-[13px] leading-relaxed text-muted">{n.message}</li>)}
              </ul>
            </Card>
          )}

          {analysing || recs === null ? (
            <div className="space-y-3" aria-live="polite" aria-busy="true">
              <p className="text-[13px] text-muted">Reading your brief…</p>
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          ) : recs.length === 0 ? (
            <Card className="p-5">
              <h3 className="font-display text-base font-bold text-ink">No automatic suggestions for this brief</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                Nothing in the brief mapped to a requirement RazeKit can check. Add your own below, or go back and describe the deliverable in more detail.
              </p>
            </Card>
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
          <Card className="space-y-2 p-4 sm:p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Collaboration &amp; account handover</h3>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-ink">
              <input type="checkbox" checked={collab} onChange={(e) => setCollab(e.target.checked)} className="h-5 w-5 shrink-0 accent-[rgb(var(--primary))]" />
              Collaboration required
            </label>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-ink">
              <input type="checkbox" checked={handover} onChange={(e) => setHandover(e.target.checked)} className="h-5 w-5 shrink-0 accent-[rgb(var(--primary))]" />
              Account handover required
            </label>
            {handover && (
              <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-muted">
                <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                The winning creator completes RazeKit&rsquo;s handover flow, where both sides confirm the transfer before the contest closes. Creators see this on the contest page before they enter.
              </p>
            )}
          </Card>

          {/* Custom mandatory instructions (spec 4) */}
          <Card className="space-y-3 p-4 sm:p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Custom instructions</h3>
            <p className="text-[13px] leading-relaxed text-muted">Anything else creators must follow. Each becomes its own requirement.</p>
            {customs.map((c, i) => (
              <div key={i} className="rounded-md border border-line bg-surface-2/50 p-3">
                <Field id={`custom-${i}`} label={`Instruction ${i + 1}`} error={fieldErr[`custom-${i}`]}>
                  <Input
                    id={`custom-${i}`} value={c.text} className="h-11"
                    onChange={(e) => {
                      const { value } = e.target;
                      setCustoms((l) => l.map((x, j) => (j === i ? { ...x, text: value } : x)));
                      setFieldErr((s) => (s[`custom-${i}`] ? { ...s, [`custom-${i}`]: undefined } : s));
                    }}
                    aria-invalid={fieldErr[`custom-${i}`] ? 'true' : undefined}
                    aria-describedby={fieldErr[`custom-${i}`] ? `custom-${i}-error` : undefined}
                    placeholder="e.g. Show the product within the first 5 seconds"
                  />
                </Field>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] text-ink">
                    <input
                      type="checkbox" checked={c.mandatory} className="h-5 w-5 accent-[rgb(var(--primary))]"
                      onChange={(e) => setCustoms((l) => l.map((x, j) => (j === i ? { ...x, mandatory: e.target.checked } : x)))}
                    />
                    Mandatory
                  </label>
                  <Button
                    variant="ghost" type="button" size="sm" aria-label={`Remove instruction ${i + 1}`}
                    className="min-h-[44px]"
                    onClick={() => setCustoms((l) => l.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" aria-hidden="true" /> Remove
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="secondary" size="lg" type="button" onClick={() => setCustoms((l) => [...l, { text: '', mandatory: true }])}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add instruction
            </Button>
          </Card>

          <StepActions back={back} backLabel="Edit brief" shortBackLabel="Back">
            <Button size="lg" onClick={goToReview} disabled={!recs} className="sm:min-w-[10rem]">
              <span className="sm:hidden">Review</span>
              <span className="hidden sm:inline">Review requirements</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </StepActions>
        </div>
      )}

      {/* ── STEP 3 ─────────────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <Card className="space-y-4 p-4 sm:p-5">
            <h2 className="font-display text-lg font-bold text-ink">Confirm contest requirements</h2>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-surface-2 px-3.5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted">Prize</p>
                <p className="nums font-display text-lg font-extrabold text-primary">{money(f.prize_amount, mkt.currency)}</p>
              </div>
              <div className="rounded-md bg-surface-2 px-3.5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted">Duration</p>
                <p className="nums font-display text-lg font-extrabold text-ink">{f.days} days</p>
              </div>
              <div className="col-span-2 rounded-md bg-surface-2 px-3.5 py-3 sm:col-span-1">
                <p className="text-[11px] uppercase tracking-wider text-muted">Mandatory rules</p>
                <p className="nums font-display text-lg font-extrabold text-ink">{mandatoryCount}</p>
              </div>
            </div>

            {chosen.length === 0 && customs.filter((c) => c.text.trim()).length === 0 ? (
              <p className="rounded-md border border-dashed border-line-strong px-3.5 py-3 text-[13px] leading-relaxed text-muted">
                No requirements are attached to this contest. Creators will be judged on the brief and their performance alone.
              </p>
            ) : (
              <ul className="space-y-2">
                {chosen.map((rec) => (
                  <li key={rec.key} className="flex items-start justify-between gap-3 rounded-md bg-surface-2 px-3 py-2.5">
                    <span className="min-w-0 break-words text-[13px] text-ink">{rec.label}</span>
                    {sel[rec.key]?.mandatory ? <Badge tone="danger">Mandatory</Badge> : <Badge tone="neutral">Guidance</Badge>}
                  </li>
                ))}
                {customs.filter((c) => c.text.trim()).map((c, i) => (
                  <li key={`c${i}`} className="flex items-start justify-between gap-3 rounded-md bg-surface-2 px-3 py-2.5">
                    <span className="min-w-0 break-words text-[13px] text-ink">{c.text}</span>
                    {c.mandatory ? <Badge tone="danger">Mandatory</Badge> : <Badge tone="neutral">Guidance</Badge>}
                  </li>
                ))}
                {(collab || handover) && (
                  <li className="flex items-start justify-between gap-3 rounded-md bg-surface-2 px-3 py-2.5">
                    <span className="min-w-0 break-words text-[13px] text-ink">
                      {[collab && 'Collaboration required', handover && 'Account handover required'].filter(Boolean).join(' · ')}
                    </span>
                    <Badge tone="primary">Configured</Badge>
                  </li>
                )}
              </ul>
            )}

            <div className="space-y-1.5 rounded-lg border border-warning/30 bg-warning/[0.06] p-4">
              <p className="text-[13px] font-semibold text-ink">These requirements become the official rules for this contest.</p>
              <p className="text-[12px] leading-relaxed text-muted">
                Creators who fail a mandatory requirement may become ineligible for winner selection, even when their performance score is high.
              </p>
            </div>

            <Field id="confirm" label="Confirmation" error={fieldErr.confirm}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-3 text-[13px] leading-relaxed text-ink">
                <input
                  id="confirm" type="checkbox" checked={confirmed}
                  onChange={(e) => { setConfirmed(e.target.checked); setFieldErr((s) => ({ ...s, confirm: undefined })); }}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--primary))]"
                  aria-invalid={fieldErr.confirm ? 'true' : undefined}
                  aria-describedby={fieldErr.confirm ? 'confirm-error' : undefined}
                />
                I confirm that these requirements are accurate and mandatory for this contest.
              </label>
            </Field>

            {/* What actually happens next — stated as the server will do it. */}
            <div className="rounded-lg border border-line bg-surface-2/60 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">What happens after you confirm</h3>
              <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-muted">
                <li>1. The requirements lock. They cannot change while creators are competing.</li>
                <li>2. The contest leaves draft and creators can see it.</li>
                <li>3. You fund the prize. RazeKit checks the transfer with a person before any prize is paid — until then the contest page shows the prize as unverified.</li>
              </ol>
            </div>
          </Card>

          <StepActions back={back} backLabel="Edit requirements">
            <Button size="lg" onClick={confirmRequirements} loading={saving} className="min-w-[10rem]">
              <Lock className="h-4 w-4" aria-hidden="true" /> Confirm requirements
            </Button>
          </StepActions>
        </div>
      )}

      <Sheet
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Leave this contest?"
        description="Your draft stays on this device, so you can pick it up where you left off. Nothing has been published."
        footer={
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button size="lg" className="sm:flex-1" onClick={() => setLeaving(false)}>Keep editing</Button>
            <Button size="lg" variant="secondary" className="sm:flex-1" onClick={() => { setLeaving(false); navigate(-1); }}>Leave and keep draft</Button>
            <Button size="lg" variant="ghost" className="sm:flex-1" onClick={() => { clearDraft(); setLeaving(false); navigate(-1); }}>Discard draft</Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">
          A draft is only ever stored in this browser until you confirm its requirements.
        </p>
      </Sheet>
    </div>
  );
}
