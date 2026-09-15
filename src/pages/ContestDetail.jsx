// Contest detail — the page a creator reads before deciding to compete.
//
// The problem it solves: a creator who loses on a rule they never saw was
// failed by this page. So the contract leads and the brief follows — prize,
// deadline, required platform, maximum length, whether winning means handing
// the account over, every mandatory rule, and how the winner is actually
// picked. On a phone that order IS the design: the terms sit above the story,
// because the story is what the brand wants and the terms are what the creator
// is held to. The one action that matters rides a sticky bar so it never has to
// be hunted for.
//
// What it refuses to do: state a number it cannot see. Entry counts are
// row-level-security scoped to the brand running the contest, so for everyone
// else this page says so instead of rendering a confident 0, and a score that
// has not been computed reads "Not measured" rather than zero. It never claims
// a prize is held, escrowed or guaranteed — it reports the funding state the
// server gave it and nothing more. It describes the default scoring split only
// while the contest is actually on the default.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ArrowLeft, ChevronRight, FileText, Film, Flag,
  KeyRound, Mail, MessageCircle, RotateCw, Scale, ShieldCheck, Smartphone,
} from 'lucide-react';
import { entities, fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { money, timeLeft, dateShort } from '@/lib/format';
import { SUPPORT } from '@/components/Footer';
import {
  Badge, Button, Card, EmptyState, Metric, PageHeader, ScoreBar, Skeleton, Timeline,
} from '@/components/ui';

function parseList(json) { try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; } }

function cover(id = '') { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return `linear-gradient(135deg, hsl(${h} 70% 60%), hsl(${(h + 40) % 360} 72% 46%))`; }

// Status is already known from the record — surfacing it saves a guess.
const STATUS = {
  open: { tone: 'primary', label: 'Open for entries' },
  draft: { tone: 'neutral', label: 'Draft' },
  winner_selected: { tone: 'success', label: 'Winner selected' },
  completed: { tone: 'neutral', label: 'Completed' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
};

// The server's lifecycle machine, in order. Mirrored here only to place a
// contest on a progression the reader can see; the server remains the only
// thing that can move it.
const LIFECYCLE_ORDER = [
  'DRAFT', 'FUNDING_REQUIRED', 'FUNDED', 'SCHEDULED', 'LIVE', 'SUBMISSION_CLOSED',
  'UNDER_REVIEW', 'WINNER_SELECTION', 'WINNER_PENDING_VERIFICATION', 'PAYMENT_PENDING', 'COMPLETED',
];
const FUNDING_CONFIRMED = ['VERIFIED', 'OVERPAID', 'REFUNDED'];
const FUNDING_IN_FLIGHT = ['TRANSFER_REPORTED', 'PENDING_VERIFICATION', 'PARTIAL'];

/** Where this contest sits, from the finer lifecycle if present and the coarse
 *  status if not. Returns -1 when we genuinely cannot tell. */
function lifecycleRank(c) {
  const i = LIFECYCLE_ORDER.indexOf(c?.lifecycle_state);
  if (i >= 0) return i;
  const ended = c?.deadline ? new Date(c.deadline).getTime() <= Date.now() : false;
  switch (c?.status) {
    case 'draft': return FUNDING_CONFIRMED.includes(c?.funding_status) ? 2 : 0;
    case 'open': return ended ? 5 : 4;
    case 'winner_selected': return 8;
    case 'completed': return 10;
    default: return -1;
  }
}

/** Maximum video length, as the contest actually recorded it. Null = unset. */
function maxLength(c) {
  if (Number(c?.max_video_seconds) > 0) {
    const s = Number(c.max_video_seconds);
    return s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} seconds`;
  }
  return c?.video_duration || c?.custom_duration || null;
}

/** A smooth scroll is a nicety; to a reader who asked for less motion it is
 *  noise. The CSS media query cannot cancel a behaviour passed in JS, so the
 *  preference is read here instead. */
function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Loading view shaped like the real page: band, title, stakes, rules, aside. */
function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl" aria-busy="true">
      <span className="sr-only" role="status">Loading this contest</span>
      <Skeleton className="h-4 w-20" />
      <Card className="mt-3 overflow-hidden">
        <Skeleton className="h-20 w-full rounded-none sm:h-36 lg:h-52" />
        <div className="space-y-2.5 p-4 sm:p-5">
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-7 w-2/3 max-w-lg" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-[86px] w-full rounded-lg" />
        </div>
      </Card>
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** One hard term of the contract, as a tile. An unset term says it is unset —
 *  it never quietly reads as "no restriction", because those are different
 *  claims and only one of them is safe to act on. */
function RuleTile({ icon: Icon, label, value, hint, empty = 'Not specified', tone = 'default', className }) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        tone === 'warning' ? 'border-warning/40 bg-warning/[0.07]' : 'border-line bg-surface-2/60',
        className
      )}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span className="min-w-0 truncate">{label}</span>
      </p>
      <p
        className={cn(
          'mt-1 break-words font-display leading-snug',
          missing ? 'text-[13px] font-medium text-muted' : 'text-[15px] font-bold',
          !missing && (tone === 'warning' ? 'text-warning' : 'text-ink')
        )}
      >
        {missing ? empty : value}
      </p>
      {hint && <p className="mt-1 break-words text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

/** One numbered step of the judging method. */
function JudgeStep({ n, title, body, tone = 'default' }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'nums mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
          tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary'
        )}
      >
        {n}
      </span>
      <span className="min-w-0">
        <span className="block break-words text-[13px] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block break-words text-[12px] leading-relaxed text-muted">{body}</span>
      </span>
    </li>
  );
}

export default function ContestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [contest, setContest] = useState(null);
  const [subs, setSubs] = useState([]);
  const [subsReady, setSubsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [joinErr, setJoinErr] = useState('');
  // Bumped by the error screen's retry, so a failed load is recoverable in
  // place instead of costing the reader a full page reload.
  const [reloadKey, setReloadKey] = useState(0);
  // 'loading' | { confirmed, criteria } | 'error'
  const [rules, setRules] = useState('loading');
  // Whether the platform is accepting prize funding at all. Public endpoint,
  // no payment details in it — just the mode and the honest notice.
  const [payments, setPayments] = useState(null);
  const rulesHeading = useRef(null);

  useEffect(() => {
    let alive = true;
    fn('paymentModeInfo').then((p) => alive && setPayments(p)).catch(() => alive && setPayments(null));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    setSubsReady(false);
    setRules('loading');
    entities.Contest.get(id).then((c) => { if (alive) setContest(c); })
      .catch((e) => { if (alive) { setContest(null); setErr(e?.data?.error?.message || e?.message || 'We could not load this contest.'); } })
      .finally(() => { if (alive) setLoading(false); });
    entities.Submission.filter({ contest_id: id }).then((s) => alive && setSubs(s || [])).catch(() => {})
      .finally(() => { if (alive) setSubsReady(true); });
    fn('criteriaGet', { contest_id: id })
      .then((d) => alive && setRules(d || { confirmed: false, criteria: [] }))
      .catch(() => alive && setRules('error'));
    return () => { alive = false; };
  }, [id, reloadKey]);

  const rank = useMemo(() => lifecycleRank(contest), [contest]);

  if (loading) return <DetailSkeleton />;

  if (!contest) {
    return (
      <div className="mx-auto w-full max-w-lg">
        <Link to="/explore" className="-ml-1 inline-flex min-h-[44px] items-center gap-1.5 px-1 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Explore
        </Link>
        {err ? (
          <Card className="mt-2 p-5" role="alert">
            <h1 className="font-display text-lg font-bold text-ink">This contest did not load</h1>
            <p className="mt-1.5 break-words text-[13px] leading-relaxed text-muted">{err}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="lg" onClick={() => { setErr(''); setReloadKey((k) => k + 1); }}>
                <RotateCw className="h-4 w-4" aria-hidden="true" /> Try again
              </Button>
              <Button size="lg" variant="secondary" to="/explore">Back to Explore</Button>
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
              <span>Still stuck?</span>
              <a
                href={SUPPORT.whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[32px] items-center gap-1.5 text-ink underline decoration-line-strong underline-offset-2 hover:decoration-primary"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp support
              </a>
              <a
                href={SUPPORT.emailHref}
                className="inline-flex min-h-[32px] items-center gap-1.5 break-all text-ink underline decoration-line-strong underline-offset-2 hover:decoration-primary"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {SUPPORT.email}
              </a>
            </p>
          </Card>
        ) : (
          <EmptyState
            className="mt-2"
            icon={Flag}
            title="Contest not found"
            description="This contest may have been removed."
            action={<Button to="/explore" size="lg">Back to Explore</Button>}
          />
        )}
      </div>
    );
  }

  const isOwner = contest.created_by_id === user?.id;
  const isAdmin = role === 'admin';
  const isCreator = role === 'creator' || role === 'admin';
  const isWinner = contest.winner_user_id === user?.id;
  const ended = ['winner_selected', 'completed'].includes(contest.status);
  const cancelled = contest.status === 'cancelled' || contest.lifecycle_state === 'CANCELLED';
  const disputed = contest.lifecycle_state === 'DISPUTED';
  const deliverables = parseList(contest.deliverables);
  const mySub = subs.find((s) => s.created_by_id === user?.id);
  const status = STATUS[contest.status];
  const hasBrief = Boolean(contest.description || contest.contest_rules || deliverables.length);
  const winners = Number(contest.number_of_winners) > 0 ? Number(contest.number_of_winners) : 1;

  // Entry counts are row-level-security scoped: a creator can only read their
  // own entry. Showing subs.length to them would be a fabricated total.
  const canCountEntries = isOwner || isAdmin;
  const entryCount = canCountEntries && subsReady ? subs.length : null;
  const readyEntries = subs.filter((s) => s.status !== 'working').length;

  const criteria = rules !== 'loading' && rules !== 'error' && rules.confirmed ? (rules.criteria || []) : [];
  const mandatory = criteria.filter((c) => c.mandatory);
  const guidance = criteria.filter((c) => !c.mandatory);
  const rulesLoading = rules === 'loading';
  const rulesFailed = rules === 'error';
  const rulesKnown = !rulesLoading && !rulesFailed;

  const length = maxLength(contest);
  const platform = contest.required_platform || null;
  // Handover is the largest commitment on this page, and two records can carry
  // it: the contest itself, and the criteria version that locked when the rules
  // were confirmed. If either says the account is handed over, the creator is
  // told so — under-stating a commitment this size is the worse failure.
  const handover = contest.handover_required === true
    || (rulesKnown && rules.criteria_version?.handover_required === true);
  const collaboration = rulesKnown && rules.criteria_version?.collaboration_required === true;
  const propertyType = contest.account_property_type || 'publishing account';
  // A campaign may set its own weights, tie-break and winner method. We can
  // only honestly describe the split while the contest is on the default.
  const customScoring = Boolean(contest.scoring_config_version) && !String(contest.scoring_config_version).startsWith('default@');
  const fundingConfirmed = FUNDING_CONFIRMED.includes(contest.funding_status);

  const deadlinePassed = contest.deadline ? new Date(contest.deadline).getTime() <= Date.now() : false;
  const left = contest.deadline ? timeLeft(contest.deadline) : null;
  const leftLabel = !contest.deadline ? 'No deadline published' : deadlinePassed ? 'Entries closed' : `${left} left`;

  const join = async () => {
    if (!user) { navigate('/login'); return; }
    setBusy(true);
    setJoinErr('');
    try {
      if (!mySub) await entities.Submission.create({ contest_id: id, client_id: contest.created_by_id, status: 'working' });
      navigate(`/contest/${id}/submit`);
    } catch (e) {
      setJoinErr(e?.data?.error?.message || e?.message || 'We could not add you to this contest. Try again in a moment.');
    } finally { setBusy(false); }
  };

  const focusRules = () => {
    rulesHeading.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    rulesHeading.current?.focus({ preventScroll: true });
  };

  // ── What this viewer can do ───────────────────────────────────────────────
  // One ordered list, most important first. The panel renders all of it; the
  // sticky bar on a phone renders the first entry. Deriving both from one list
  // is what stops them disagreeing about what the main action is.
  const actions = [];
  let idleNote = '';
  let fundingClosed = false;
  let statusLine = '';

  if (isOwner) {
    if (!fundingConfirmed && !ended) {
      if (payments && payments.accepts_funding === false) {
        // Funding is closed platform-wide. Offering a button that can only 503
        // would waste the client's time.
        fundingClosed = true;
      } else {
        const inFlight = FUNDING_IN_FLIGHT.includes(contest.funding_status);
        actions.push({
          key: 'fund',
          label: inFlight ? 'View funding status' : 'Fund this contest',
          short: inFlight ? 'Funding' : 'Fund',
          to: `/contest/${id}/fund`,
          note: contest.funding_status === 'PENDING_VERIFICATION'
            ? 'We are checking your transfer against our bank records.'
            : 'Your contest goes live once the prize funding is verified.',
        });
      }
    }
    if (subs.length > 0 && !ended) {
      actions.push({
        key: 'review',
        label: `Review entries (${readyEntries})`,
        short: `Review (${readyEntries})`,
        to: `/contest/${id}/review`,
        variant: contest.status === 'open' ? 'secondary' : 'primary',
      });
    }
    if (ended) {
      actions.push({ key: 'handover', label: 'Account handover', short: 'Handover', to: `/contest/${id}/handover` });
      actions.push({ key: 'entries', label: 'View entries', short: 'Entries', to: `/contest/${id}/review`, variant: 'secondary' });
    }
    if (!ended && subsReady && subs.length === 0) idleNote = 'No entries yet. Creators can join until the deadline closes.';
  } else if (isCreator) {
    // Winning is the only thing that surfaces verification. A creator never
    // sees it before that.
    if (isWinner && !contest.winner_verified_at) {
      actions.push({
        key: 'verify',
        label: 'Verify your account',
        short: 'Verify',
        to: `/contest/${id}/verify`,
        icon: ShieldCheck,
        note: 'You won. Confirm you control the account you published from to release your prize.',
      });
    }
    if (isWinner && contest.winner_verified_at) statusLine = 'Verified — your payout is being arranged.';
    if (contest.status === 'open' && !mySub && !cancelled) {
      actions.push({
        key: 'join',
        label: 'Join contest',
        short: 'Join',
        onClick: join,
        loading: busy,
        note: 'Joining does not submit anything. You upload your work on the next screen.',
      });
    }
    if (mySub && ['working', 'joined', 'open'].includes(mySub.status || contest.status)) {
      actions.push({
        key: 'submit',
        label: 'Submit work',
        short: 'Submit',
        to: `/contest/${id}/submit`,
        variant: actions.length ? 'secondary' : 'primary',
      });
    }
    if (mySub?.status === 'submitted') {
      actions.push({ key: 'in-review', label: 'Your entry is in review', short: 'In review', disabled: true, variant: 'secondary' });
    }
    if (ended && isWinner) actions.push({ key: 'handover', label: 'Account handover', short: 'Handover', to: `/contest/${id}/handover` });
    if (ended && !isWinner) actions.push({ key: 'browse', label: 'Browse contests', short: 'Browse', to: '/explore', variant: 'secondary' });
    if (actions.length === 0) {
      idleNote = cancelled
        ? 'This contest was cancelled. It is not accepting entries.'
        : 'This contest is not open for entries.';
    }
  } else {
    actions.push({ key: 'register', label: 'Create an account to enter', short: 'Create account', to: '/register' });
    actions.push({ key: 'explore', label: 'Browse contests', short: 'Browse', to: '/explore', variant: 'secondary' });
  }

  const primary = actions[0] || null;
  const actionProps = (a) => (a.to ? { to: a.to } : { onClick: a.onClick, disabled: a.disabled, loading: a.loading });
  const panelTitle = isOwner ? 'Manage this contest' : ended ? 'This contest' : 'Enter this contest';

  // The creator's own entry, if they have one. Every score here can legitimately
  // be absent, and absence is rendered as absence.
  const myEngagement = typeof mySub?.engagement_score === 'number' ? mySub.engagement_score : null;
  const myTraffic = typeof mySub?.traffic_score === 'number' ? mySub.traffic_score : null;
  const myFinal = typeof mySub?.final_score === 'number' ? mySub.final_score : null;
  const myScored = myEngagement !== null || myTraffic !== null || myFinal !== null;

  const steps = [
    {
      key: 'funded',
      label: 'Prize funding verified',
      detail: fundingConfirmed ? 'A person checked the transfer against the bank.' : 'The contest goes live to creators once the transfer is verified.',
      at: contest.funded_at ? dateShort(contest.funded_at) : null,
      doneAt: 2, activeFrom: 0,
    },
    { key: 'live', label: 'Open for entries', detail: contest.deadline ? `Closes ${dateShort(contest.deadline)}` : null, doneAt: 5, activeFrom: 4 },
    { key: 'closed', label: 'Entries closed', at: contest.submission_closed_at ? dateShort(contest.submission_closed_at) : null, doneAt: 6, activeFrom: 5 },
    { key: 'review', label: 'Scored and reviewed', detail: 'Entries are checked against the mandatory rules, then scored.', at: contest.review_started_at ? dateShort(contest.review_started_at) : null, doneAt: 8, activeFrom: 6 },
    { key: 'winner', label: 'Winner selected and verified', detail: 'The winner proves they control the account they published from.', at: contest.winner_selected_at ? dateShort(contest.winner_selected_at) : null, doneAt: 9, activeFrom: 8 },
    { key: 'paid', label: 'Prize paid, contest closed', at: contest.completed_at ? dateShort(contest.completed_at) : null, doneAt: 10, activeFrom: 9 },
  ].map((s) => ({
    key: s.key,
    label: s.label,
    detail: s.detail,
    at: s.at,
    done: rank >= s.doneAt,
    current: rank >= 0 && rank < s.doneAt && rank >= s.activeFrom && !cancelled,
  }));

  if (cancelled) steps.push({ key: 'cancelled', label: 'Contest cancelled', failed: true, detail: 'No winner will be selected for this contest.' });
  if (disputed) steps.push({ key: 'disputed', label: 'Under dispute', current: true, detail: 'Results and payment are frozen until this is resolved.' });

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link to="/explore" className="-ml-1 inline-flex min-h-[44px] items-center gap-1.5 px-1 text-sm text-muted transition-colors hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Explore
      </Link>

      {/* ── Identity and stakes ──────────────────────────────────────────────
          The cover is a band on a phone, not a picture: it costs vertical space
          that the rules below need more than the artwork does. */}
      <Card className="mt-1 overflow-hidden">
        <div className="relative h-20 sm:h-36 lg:h-52">
          {contest.cover_image_url
            ? <img src={contest.cover_image_url} alt="" className="h-full w-full object-cover" />
            : <div className="h-full w-full" style={{ background: cover(contest.id) }} aria-hidden="true" />}
        </div>

        <div className="p-4 sm:p-5">
          {(contest.category || status || contest.promotional || disputed) && (
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              {contest.category && <Badge tone="neutral">{contest.category}</Badge>}
              {status && <Badge tone={status.tone}>{status.label}</Badge>}
              {contest.promotional && <Badge tone="primary">Promotional</Badge>}
              {disputed && <Badge tone="warning">Under dispute</Badge>}
            </div>
          )}

          <PageHeader title={contest.title} description={contest.short_description} />

          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/[0.06] p-3.5 sm:p-4">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Winner prize</p>
                <p className="nums mt-1 break-words font-display text-[30px] font-extrabold leading-none text-primary sm:text-[34px]">
                  {money(contest.prize_amount, contest.currency)}
                </p>
              </div>
              <div className="shrink-0">
                <Metric
                  label="Ends in"
                  value={contest.deadline ? left : null}
                  empty="Not set"
                  className="text-right"
                />
              </div>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-primary/15 pt-2.5 text-[11px] leading-snug text-muted">
              <span>{winners > 1 ? `Shared across ${winners} winners` : 'Paid to one winner'}</span>
              <span aria-hidden="true">&middot;</span>
              <span>
                {contest.deadline
                  ? `${deadlinePassed ? 'Closed' : 'Closes'} ${dateShort(contest.deadline)}`
                  : 'No deadline published'}
              </span>
            </p>
          </div>

          {/* The three terms that decide whether the work counts at all sit
              with the prize, not a screen below it. On a 360px phone this is
              what the reader sees without scrolling, which is the point. */}
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">Required of every entry</p>
          <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <RuleTile
              icon={Smartphone}
              label="Platform"
              value={platform || 'Any platform'}
              hint={platform ? 'Published anywhere else is rejected.' : 'No restriction on where you publish.'}
            />
            <RuleTile
              icon={Film}
              label="Max length"
              value={length}
              hint={length ? 'A longer video can be rejected.' : 'No maximum was set for this contest.'}
            />
            <RuleTile
              icon={KeyRound}
              label="Account handover"
              value={handover ? 'Required if you win' : 'Not required'}
              tone={handover ? 'warning' : 'default'}
              hint={handover ? 'You give the account up. See the rules below.' : 'You keep the account you publish from.'}
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>
      </Card>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── The rules, the judging, then the brief. In that order. ──────── */}
        <div className="min-w-0 space-y-5">
          <Card as="section" aria-labelledby="rules-heading" className="p-4 sm:p-5">
            <h2
              id="rules-heading"
              ref={rulesHeading}
              tabIndex={-1}
              className="scroll-mt-24 font-display text-lg font-bold text-ink focus:outline-none sm:text-xl"
            >
              Before you enter
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Every rule this contest locked, and what happens to an entry that misses one.
            </p>

            {/* The largest commitment on the page. It does not get a row in a
                list; it gets a block of its own. */}
            {handover && (
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/[0.07] p-3.5">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="text-[13px] font-bold text-ink">Winning means handing over the account</h3>
                  <p className="mt-1 break-words text-[12px] leading-relaxed text-muted">
                    If you win, you transfer the {propertyType} you entered with to the brand through RazeKit. You do not keep it
                    afterwards. Enter only if you are willing to give it up.
                  </p>
                </div>
              </div>
            )}

            {collaboration && (
              <p className="mt-3 break-words rounded-md border border-line bg-surface-2/60 px-3 py-2.5 text-[12px] leading-relaxed text-ink">
                This contest also requires a collaboration post with the brand&rsquo;s account.
              </p>
            )}

            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Mandatory rules</h3>
                {rulesKnown && criteria.length > 0 && <Badge tone="neutral">{mandatory.length} to meet</Badge>}
              </div>

              <p className="mt-2 flex items-start gap-2 rounded-md border border-danger/25 bg-danger/[0.05] px-3 py-2.5 text-[12px] font-medium leading-relaxed text-ink">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                <span>
                  Miss one of these and the entry is <strong className="font-bold">ineligible</strong>. It is removed before ranking,
                  however well the video performs.
                </span>
              </p>

              {rulesLoading ? (
                <div className="mt-3 space-y-2" aria-live="polite" aria-busy="true">
                  <span className="sr-only">Loading this contest&rsquo;s mandatory rules</span>
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-4/5" />
                  <Skeleton className="h-5 w-2/3" />
                </div>
              ) : rulesFailed ? (
                <p className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-[13px] leading-relaxed text-ink" role="alert">
                  <AlertCircle className="mt-px h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <span>We could not load this contest&rsquo;s requirements. Reload the page before you enter — do not assume there are none.</span>
                </p>
              ) : mandatory.length === 0 ? (
                <p className="mt-3 text-[13px] leading-relaxed text-muted">
                  {criteria.length === 0
                    ? 'This brand has not locked any automatic requirements. The brief below is what you are judged against.'
                    : 'No rule is mandatory for this contest. Everything below is guidance the brand expects but does not enforce.'}
                </p>
              ) : (
                <ol className="mt-3 space-y-2.5">
                  {mandatory.map((c, i) => (
                    <li key={c.id || c.key || i} className="flex items-start gap-2.5">
                      <span aria-hidden="true" className="nums mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-bold text-ink">
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium leading-snug text-ink">{c.label}</span>
                        {c.description && <span className="mt-0.5 block break-words text-[12px] leading-relaxed text-muted">{c.description}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {guidance.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Also expected, but not enforced</h3>
                <ul className="mt-2 space-y-1.5">
                  {guidance.map((c, i) => (
                    <li key={c.id || c.key || i} className="flex items-start gap-2 break-words text-[13px] leading-relaxed text-muted">
                      <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
                      <span className="min-w-0">{c.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* ── How the winner is chosen. A creator is entitled to know this
                before spending a day on the video, not after losing. ─────── */}
          <Card as="section" aria-labelledby="judging-heading" className="p-4 sm:p-5">
            <h2 id="judging-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink sm:text-xl">
              <Scale className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />
              How the winner is chosen
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Two scores, out of 100 each. Nothing else decides it.
            </p>

            <ol className="mt-4 space-y-3.5">
              <JudgeStep
                n={1}
                title="Video Engagement Score"
                body="Measured from the post you publish, once the link you submit has been checked."
              />
              <JudgeStep
                n={2}
                title="Brand Traffic Score"
                body={contest.brand_destination_url
                  ? 'Measured from the verified visits your post sends to the brand’s campaign link.'
                  : 'Measured from verified visits to the brand’s campaign link. This contest has not published one, so brand traffic may not be measurable for it.'}
              />
              <JudgeStep
                n={3}
                title="Final score"
                body={customScoring
                  ? 'This contest set its own weighting between the two when it opened. The split it locked is shown with your score.'
                  : 'The two scores averaged equally into one score out of 100.'}
              />
              <JudgeStep
                n={4}
                title={customScoring ? 'Ties' : 'A tie is broken on Brand Traffic'}
                body={customScoring
                  ? 'This contest locked its own tie-break rule as well. It is shown with your score.'
                  : 'If two entries finish on the same final score, the higher Brand Traffic Score wins.'}
              />
              <JudgeStep
                n={5}
                tone="danger"
                title="Ineligible entries are removed first"
                body="An entry that misses a mandatory rule is excluded before any of this ranking happens."
              />
            </ol>

            {!customScoring && (
              <p className="mt-3.5 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
                The brand picks the winner from that ranking.
              </p>
            )}

            {/* The creator's own entry — scored, or honestly not yet. */}
            {mySub && (
              <div className="mt-4 rounded-lg border border-line bg-surface-2/60 p-3.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Your entry</h3>
                {myScored ? (
                  <div className="mt-3 space-y-3">
                    <ScoreBar
                      label="Video engagement"
                      score={myEngagement}
                      weight={customScoring ? null : 50}
                      reason="Not measured yet for your entry."
                    />
                    <ScoreBar
                      label="Brand traffic"
                      score={myTraffic}
                      weight={customScoring ? null : 50}
                      reason={contest.brand_destination_url
                        ? 'No verified visits have been attributed to your post yet.'
                        : 'This contest has no campaign link, so brand traffic may not be measurable.'}
                    />
                    <div className="border-t border-line pt-3">
                      <Metric
                        label="Final score"
                        value={myFinal}
                        hint={myFinal === null ? 'A final score is set only once both parts are in.' : undefined}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                    {mySub.status === 'submitted'
                      ? 'Nothing is measured yet. Your scores appear here once your published post has been checked.'
                      : 'You have joined. Nothing is measured until you submit your entry.'}
                  </p>
                )}
              </div>
            )}
          </Card>

          {contest.description && (
            <Card as="section" aria-labelledby="brief-heading" className="p-4 sm:p-5">
              <h2 id="brief-heading" className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Brief</h2>
              <p className="whitespace-pre-line break-words text-sm leading-relaxed text-ink/90">{contest.description}</p>
            </Card>
          )}

          {deliverables.length > 0 && (
            <Card as="section" aria-labelledby="deliverables-heading" className="p-4 sm:p-5">
              <h2 id="deliverables-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Deliverables</h2>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {deliverables.map((d, i) => (
                  <li key={i} className="rounded-md bg-surface-2 px-3.5 py-3">
                    <p className="break-words text-sm font-medium text-ink">{d.name || d.content_type || 'Deliverable'}</p>
                    <p className="mt-0.5 break-words text-xs text-muted">{[d.platform, d.duration, d.ratio, d.resolution, d.format].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {contest.contest_rules && (
            <Card as="section" aria-labelledby="brand-rules-heading" className="p-4 sm:p-5">
              <h2 id="brand-rules-heading" className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Rules from the brand</h2>
              <p className="whitespace-pre-line break-words text-sm leading-relaxed text-ink/90">{contest.contest_rules}</p>
            </Card>
          )}

          {!hasBrief && (
            <EmptyState
              icon={FileText}
              title="No detailed brief yet"
              description="This contest has not published a brief, deliverables or extra rules. The terms and the rules above are the confirmed ones."
            />
          )}
        </div>

        {/* ── Acting on it, and where the contest actually is. ──────────────
            The height cap matters: a sticky column taller than the viewport
            pins its top and puts its own bottom out of reach forever. Capped,
            it scrolls internally only on the short screens that need it. */}
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
          <Card className="p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{panelTitle}</h2>

            {handover && !isOwner && !ended && (
              <p className="mt-2.5 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/[0.07] px-3 py-2 text-[12px] leading-snug text-ink">
                <KeyRound className="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                <span>Winning means handing your {propertyType} to the brand.</span>
              </p>
            )}

            {/* The same failure is announced once: here on a wide screen, and
                in the sticky bar on a phone, beside the button that failed. */}
            {joinErr && (
              <div className="mt-2.5 hidden rounded-md bg-danger/8 px-3 py-2 text-[13px] leading-snug text-danger lg:block" role="alert">
                {joinErr}
              </div>
            )}

            {fundingClosed && (
              <div className="mt-2.5 rounded-md border border-line bg-surface-2 px-3 py-2.5">
                <p className="text-[12px] font-medium text-ink">{payments?.beta_notice?.title || 'Prize funding is not open yet'}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                  {payments?.beta_notice?.body?.[0] || 'Contest funding will open once a payment provider is connected.'}
                </p>
              </div>
            )}

            {actions.length > 0 && (
              <div className="mt-3 space-y-2.5">
                {actions.map((a) => {
                  const Icon = a.icon;
                  return (
                    <div key={a.key}>
                      <Button className="w-full" size="lg" variant={a.variant || 'primary'} {...actionProps(a)}>
                        {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                        {a.label}
                      </Button>
                      {a.note && <p className="mt-1.5 text-center text-[12px] leading-relaxed text-muted">{a.note}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {statusLine && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] leading-relaxed text-success">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {statusLine}
              </p>
            )}

            {idleNote && <p className="mt-3 text-center text-[12px] leading-relaxed text-muted">{idleNote}</p>}

            <button
              type="button"
              onClick={focusRules}
              className="mt-3 inline-flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md border border-line bg-surface-2/60 px-3 text-[13px] font-medium text-ink transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Rules and eligibility
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            </button>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <Metric label="Winners" value={winners} hint={winners > 1 ? 'The prize is shared.' : 'One winner takes the prize.'} />
              <Metric
                label="Entries"
                value={entryCount}
                empty={canCountEntries ? 'Loading…' : 'Brand only'}
                hint={canCountEntries ? undefined : 'Only the brand running this contest can see the entry count.'}
              />
            </div>

            {/* Funding, stated as the record has it — never as a guarantee. */}
            <p className="mt-4 flex items-start gap-1.5 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
              <ShieldCheck
                className={cn('mt-px h-3.5 w-3.5 shrink-0', fundingConfirmed ? 'text-success' : 'text-muted')}
                aria-hidden="true"
              />
              {fundingConfirmed
                ? <span>RazeKit verified the brand&rsquo;s prize transfer against its bank records{contest.funded_at ? ` on ${dateShort(contest.funded_at)}` : ''}.</span>
                : <span>The prize transfer has not been verified yet. RazeKit checks every transfer with a person before a prize is paid.</span>}
            </p>
          </Card>

          <Card as="section" aria-labelledby="progress-heading" className="p-4 sm:p-5">
            <h2 id="progress-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Contest progress</h2>
            {rank < 0 && !cancelled ? (
              // Better to say we do not know than to draw a progression we made up.
              <p className="text-[13px] text-muted">This contest&rsquo;s stage is not published yet.</p>
            ) : (
              <Timeline steps={steps} />
            )}
          </Card>
        </aside>
      </div>

      {/* ── The action, always within thumb reach on a phone ────────────────
          Sticky rather than fixed, and the last child of the page: it hovers
          over the content while there is content left, then settles below the
          final line instead of covering it. */}
      {primary && (
        <div className="sticky bottom-0 z-30 mt-6 -mx-4 border-t border-line bg-surface/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:mx-0 sm:rounded-lg sm:border sm:pb-3 lg:hidden">
          {joinErr && <p className="mb-2 break-words text-[12px] leading-snug text-danger" role="alert">{joinErr}</p>}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="nums truncate font-display text-[17px] font-extrabold leading-none text-primary">
                {money(contest.prize_amount, contest.currency)}
              </p>
              <p className="mt-1.5 truncate text-[11px] leading-none text-muted">{leftLabel}</p>
            </div>
            <Button size="lg" className="min-w-[8.5rem] shrink-0" variant={primary.variant || 'primary'} {...actionProps(primary)}>
              {primary.short || primary.label}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
