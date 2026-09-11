// Contest detail — the page a creator reads before deciding to compete.
//
// The problem it solves: a creator who loses on a rule they could not find was
// failed by this page. So the terms come first and in one place — prize,
// deadline, required platform, maximum video length, the mandatory criteria,
// whether the account is handed over, and how the winner is actually chosen.
// The brief follows the rules; it never stands in for them.
//
// What it refuses to do: state a number it cannot see. Entry counts are
// readable only by the brand running the contest, so for everyone else this
// page says that plainly instead of rendering a confident 0. It never claims a
// prize is funded, held or guaranteed — it reports the funding state the server
// gave it, and nothing more.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Clock, Users, Trophy, ShieldCheck, Flag, FileText, Film,
  CalendarDays, Smartphone, KeyRound, Scale, AlertCircle, ChevronRight,
} from 'lucide-react';
import { entities, fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, timeLeft, dateShort } from '@/lib/format';
import { Card, Button, Badge, Skeleton, EmptyState, PageHeader, Metric, Timeline } from '@/components/ui';

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

/** Loading view shaped like the real page: banner, title, rules, terms panel. */
function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="aspect-[16/9] w-full rounded-lg sm:aspect-[21/9]" />
      <div className="space-y-2.5">
        <Skeleton className="h-5 w-28 rounded-full" />
        <Skeleton className="h-7 w-2/3 max-w-lg" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-2 min-w-0 space-y-5 lg:order-1">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
        <div className="order-1 space-y-5 lg:order-2">
          <Skeleton className="h-96 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** One term of the contract, as a row that survives a 360px screen. */
function Term({ icon: Icon, label, value, hint, tone = 'default' }) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="flex min-w-0 shrink-0 items-center gap-2 text-[13px] text-muted">
        {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="min-w-0 text-right">
        <span
          className={[
            'block break-words text-[13px] font-semibold',
            missing ? 'font-normal text-muted/80' : tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-ink',
          ].join(' ')}
        >
          {missing ? 'Not specified' : value}
        </span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-muted">{hint}</span>}
      </dd>
    </div>
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
  }, [id]);

  const rank = useMemo(() => lifecycleRank(contest), [contest]);

  if (loading) return <DetailSkeleton />;
  if (!contest) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-3">
        {err && <div className="rounded-md bg-danger/8 px-3 py-2 text-sm text-danger" role="alert">{err}</div>}
        <EmptyState icon={Flag} title="Contest not found" description="This contest may have been removed." action={<Button to="/explore" size="lg">Back to Explore</Button>} />
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

  // Entry counts are row-level-security scoped: a creator can only read their
  // own entry. Showing subs.length to them would be a fabricated total.
  const canCountEntries = isOwner || isAdmin;
  const entryCount = canCountEntries && subsReady ? subs.length : null;

  const criteria = rules !== 'loading' && rules !== 'error' && rules.confirmed ? (rules.criteria || []) : [];
  const mandatory = criteria.filter((c) => c.mandatory);
  const guidance = criteria.filter((c) => !c.mandatory);
  const rulesLoading = rules === 'loading';
  const rulesFailed = rules === 'error';

  const length = maxLength(contest);
  const platform = contest.required_platform || null;
  // A campaign may set its own weights. We can only honestly describe the split
  // when the contest is still on the platform default.
  const customScoring = Boolean(contest.scoring_config_version) && !String(contest.scoring_config_version).startsWith('default@');
  const fundingConfirmed = FUNDING_CONFIRMED.includes(contest.funding_status);

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
    rulesHeading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    rulesHeading.current?.focus({ preventScroll: true });
  };

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
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Link to="/explore" className="-ml-1 inline-flex min-h-[44px] items-center gap-1.5 px-1 text-sm text-muted transition-colors hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Explore
      </Link>

      {/* Cover. Short and cinematic on a wide screen; taller on a phone so it
          is a picture rather than a stripe. */}
      <Card className="overflow-hidden">
        <div className="relative aspect-[16/9] sm:aspect-[21/9]">
          {contest.cover_image_url
            ? <img src={contest.cover_image_url} alt="" className="h-full w-full object-cover" />
            : <div className="h-full w-full" style={{ background: cover(contest.id) }} aria-hidden="true" />}
        </div>
      </Card>

      <div className="space-y-3">
        {(contest.category || status || contest.promotional) && (
          <div className="flex flex-wrap items-center gap-2">
            {contest.category && <Badge tone="neutral">{contest.category}</Badge>}
            {status && <Badge tone={status.tone}>{status.label}</Badge>}
            {contest.promotional && <Badge tone="primary">Promotional</Badge>}
          </div>
        )}
        <PageHeader title={contest.title} description={contest.short_description} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── The terms. First thing on a phone, sticky on a desktop. ───────── */}
        <aside className="order-1 space-y-5 lg:order-2 lg:sticky lg:top-24">
          <Card className="p-5">
            <div className="rounded-md border border-primary/15 bg-primary/5 px-4 py-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Winner prize</p>
              <p className="nums mt-1.5 font-display text-[30px] font-extrabold leading-none text-primary sm:text-[32px]">
                {money(contest.prize_amount, contest.currency)}
              </p>
              <p className="mt-1.5 text-[11px] leading-snug text-muted">
                {contest.number_of_winners > 1 ? `Shared across ${contest.number_of_winners} winners.` : 'Paid to one winner.'}
              </p>
            </div>

            <h2 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">The terms</h2>
            <dl className="mt-1 divide-y divide-line">
              <Term
                icon={Clock}
                label="Ends in"
                value={<span className="nums font-display font-extrabold">{timeLeft(contest.deadline)}</span>}
                tone={ended || cancelled ? 'default' : 'default'}
              />
              <Term icon={CalendarDays} label="Deadline" value={contest.deadline ? dateShort(contest.deadline) : null} />
              <Term
                icon={Smartphone}
                label="Required platform"
                value={platform || 'Any platform'}
                hint={platform ? 'An entry published anywhere else is rejected.' : 'This contest does not restrict where you publish.'}
              />
              <Term icon={Film} label="Maximum length" value={length} hint={length ? 'Longer entries can be rejected.' : undefined} />
              <Term
                icon={KeyRound}
                label="Account handover"
                value={contest.handover_required ? 'Required' : 'Not required'}
                tone={contest.handover_required ? 'warning' : 'default'}
                hint={contest.handover_required
                  ? `The winner transfers the ${contest.account_property_type || 'publishing account'} to the brand through RazeKit.`
                  : 'You keep the account you publish from.'}
              />
              <Term icon={Trophy} label="Winners" value={<span className="nums">{contest.number_of_winners || 1}</span>} />
              <Term
                icon={Users}
                label="Entries"
                value={canCountEntries ? (subsReady ? <span className="nums">{entryCount}</span> : '…') : null}
                hint={canCountEntries ? undefined : 'Only the brand running this contest can see the entry count.'}
              />
              <Term
                icon={Scale}
                label="Judged on"
                value="Video engagement + brand traffic"
                hint={customScoring
                  ? 'This contest uses its own weighting. The exact split is shown with your score.'
                  : 'Averaged equally into one final score out of 100.'}
              />
            </dl>

            <button
              type="button"
              onClick={focusRules}
              className="mt-3 inline-flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md border border-line bg-surface-2/60 px-3 text-[13px] font-medium text-ink transition-colors hover:border-primary/40"
            >
              Read the full rules
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            </button>

            {/* ── Actions ─────────────────────────────────────────────────── */}
            <div className="mt-5 space-y-2">
              {joinErr && <div className="rounded-md bg-danger/8 px-3 py-2 text-[13px] text-danger" role="alert">{joinErr}</div>}

              {isOwner ? (
                <>
                  {/* Funding is the publication gate: a contest only goes live
                      once a person has verified the transfer against the bank.
                      The owner needs a route to that screen from here. */}
                  {!fundingConfirmed && !ended && (
                    payments && payments.accepts_funding === false ? (
                      // Funding is closed platform-wide. Offering a button that
                      // can only 503 would waste the client's time.
                      <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5">
                        <p className="text-[12px] font-medium text-ink">{payments.beta_notice?.title || 'Prize funding is not open yet'}</p>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                          {payments.beta_notice?.body?.[0] || 'Contest funding will open once a payment provider is connected.'}
                        </p>
                      </div>
                    ) : (
                      <>
                        <Button to={`/contest/${id}/fund`} className="w-full" size="lg">
                          {['TRANSFER_REPORTED', 'PENDING_VERIFICATION', 'PARTIAL'].includes(contest.funding_status)
                            ? 'View funding status'
                            : 'Fund this contest'}
                        </Button>
                        <p className="text-center text-[12px] leading-relaxed text-muted">
                          {contest.funding_status === 'PENDING_VERIFICATION'
                            ? 'We are checking your transfer against our bank records.'
                            : 'Your contest goes live once the prize funding is verified.'}
                        </p>
                      </>
                    )
                  )}
                  {subs.length > 0 && !ended && (
                    <Button to={`/contest/${id}/review`} className="w-full" size="lg" variant={contest.status === 'open' ? 'secondary' : 'primary'}>
                      Review entries ({subs.filter((s) => s.status !== 'working').length})
                    </Button>
                  )}
                  {ended && <Button to={`/contest/${id}/handover`} className="w-full" size="lg">Account handover</Button>}
                  {ended && <Button to={`/contest/${id}/review`} className="w-full" size="lg" variant="secondary">View entries</Button>}
                  {!ended && subsReady && subs.length === 0 && (
                    <p className="text-center text-[12px] leading-relaxed text-muted">No entries yet. Creators can join until the deadline closes.</p>
                  )}
                </>
              ) : isCreator ? (
                <>
                  {contest.status === 'open' && !mySub && !cancelled && (
                    <Button className="w-full" size="lg" loading={busy} onClick={join}>Join contest</Button>
                  )}
                  {contest.status === 'open' && !mySub && !cancelled && (
                    <p className="text-center text-[12px] leading-relaxed text-muted">
                      Joining does not submit anything. You upload your work on the next screen.
                    </p>
                  )}
                  {/* Winning is the only thing that surfaces verification.
                      A creator never sees it before that. */}
                  {isWinner && !contest.winner_verified_at && (
                    <>
                      <Button to={`/contest/${id}/verify`} className="w-full" size="lg">
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Verify your account
                      </Button>
                      <p className="text-center text-[12px] leading-relaxed text-muted">
                        You won. Confirm you control the account you published from to release your prize.
                      </p>
                    </>
                  )}
                  {isWinner && contest.winner_verified_at && (
                    <p className="flex items-center justify-center gap-1.5 text-center text-[12px] leading-relaxed text-success">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified — your payout is being arranged.
                    </p>
                  )}
                  {mySub && ['working', 'joined', 'open'].includes(mySub.status || contest.status) && (
                    <Button to={`/contest/${id}/submit`} className="w-full" size="lg">Submit work</Button>
                  )}
                  {mySub?.status === 'submitted' && <Button className="w-full" size="lg" variant="secondary" disabled>Your entry is in review</Button>}
                  {ended && isWinner && <Button to={`/contest/${id}/handover`} className="w-full" size="lg">Account handover</Button>}
                  {ended && !isWinner && <Button to="/explore" className="w-full" size="lg" variant="secondary">Browse contests</Button>}
                </>
              ) : (
                <>
                  <Button to="/register" className="w-full" size="lg">Create an account to enter</Button>
                  <Button to="/explore" className="w-full" size="lg" variant="secondary">Browse contests</Button>
                </>
              )}
            </div>

            {/* Funding, stated as the record has it — never as a guarantee. */}
            <p className="mt-4 flex items-start gap-1.5 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
              <ShieldCheck
                className={`mt-px h-3.5 w-3.5 shrink-0 ${fundingConfirmed ? 'text-success' : 'text-muted'}`}
                aria-hidden="true"
              />
              {fundingConfirmed
                ? <span>RazeKit verified the brand&rsquo;s prize transfer against its bank records{contest.funded_at ? ` on ${dateShort(contest.funded_at)}` : ''}.</span>
                : <span>The prize transfer has not been verified yet. RazeKit checks every transfer with a person before a prize is paid.</span>}
            </p>
          </Card>

          {/* Where the contest actually is. */}
          <Card className="p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Contest progress</h2>
            {rank < 0 && !cancelled ? (
              // Better to say we do not know than to draw a progression we made up.
              <p className="text-[13px] text-muted">This contest&rsquo;s stage is not published yet.</p>
            ) : (
              <Timeline steps={steps} />
            )}
          </Card>
        </aside>

        {/* ── The rules, then the brief. In that order, deliberately. ──────── */}
        <div className="order-2 min-w-0 space-y-5 lg:order-1">
          <Card className="p-5">
            <h2
              ref={rulesHeading}
              tabIndex={-1}
              className="scroll-mt-24 font-display text-lg font-bold text-ink focus:outline-none"
            >
              The rules
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Everything an entry is held to. A mandatory rule that is not met makes an entry ineligible, however well it performs.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-surface-2 px-3.5 py-3">
                <Metric label="Platform" value={platform || 'Any'} />
              </div>
              <div className="rounded-md bg-surface-2 px-3.5 py-3">
                <Metric label="Max length" value={length} empty="Not specified" />
              </div>
              <div className="rounded-md bg-surface-2 px-3.5 py-3">
                <Metric
                  label="Mandatory rules"
                  value={rulesLoading || rulesFailed ? null : mandatory.length}
                  empty={rulesFailed ? 'Could not load' : 'Loading…'}
                />
              </div>
            </div>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Must be met</h3>
            {rulesLoading ? (
              <div className="mt-2 space-y-2" aria-live="polite">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-4/5" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            ) : rulesFailed ? (
              <p className="mt-2 flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2.5 text-[13px] leading-relaxed text-ink" role="alert">
                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                We could not load this contest&rsquo;s requirements. Reload the page before you enter — do not assume there are none.
              </p>
            ) : mandatory.length === 0 ? (
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                {criteria.length === 0
                  ? 'This brand has not locked any automatic requirements. The brief below is what you are judged against.'
                  : 'No rule is mandatory. Everything below is guidance the brand expects but does not enforce.'}
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {mandatory.map((c) => (
                  <li key={c.id || c.key} className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    <span className="min-w-0 text-sm leading-snug text-ink">
                      <span className="break-words">{c.label}</span>
                      {c.description && <span className="mt-0.5 block break-words text-[12px] leading-relaxed text-muted">{c.description}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {guidance.length > 0 && (
              <>
                <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Also expected</h3>
                <ul className="mt-2 space-y-1.5">
                  {guidance.map((c) => (
                    <li key={c.id || c.key} className="break-words text-[13px] leading-relaxed text-muted">{c.label}</li>
                  ))}
                </ul>
              </>
            )}

            {/* How the winner is chosen — the part creators most often cannot find. */}
            <div className="mt-5 rounded-lg border border-line bg-surface-2/60 p-4">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink">
                <Scale className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> How the winner is chosen
              </h3>
              <dl className="mt-2.5 space-y-2 text-[13px] leading-relaxed">
                <div>
                  <dt className="font-semibold text-ink">Video engagement</dt>
                  <dd className="text-muted">Measured from the post you publish, after the URL you submit is checked.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Brand traffic</dt>
                  <dd className="text-muted">
                    {contest.brand_destination_url
                      ? 'Measured from the visits your post sends to the brand’s campaign link.'
                      : 'This contest has not set a campaign link, so brand traffic may not be measurable for it.'}
                  </dd>
                </div>
              </dl>
              <p className="mt-2.5 border-t border-line pt-2.5 text-[12px] leading-relaxed text-muted">
                {customScoring
                  ? 'This contest sets its own weighting between the two. The split that was locked when it opened is shown with your score.'
                  : 'The two are averaged equally into one final score out of 100. The brand chooses the winner from that ranking.'}
                {' '}An entry that fails a mandatory rule is excluded before any of this.
              </p>
            </div>
          </Card>

          {contest.description && (
            <Card className="p-5">
              <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Brief</h2>
              <p className="whitespace-pre-line break-words text-sm leading-relaxed text-ink/90">{contest.description}</p>
            </Card>
          )}

          {deliverables.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Deliverables</h2>
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
            <Card className="p-5">
              <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Rules from the brand</h2>
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
      </div>
    </div>
  );
}
