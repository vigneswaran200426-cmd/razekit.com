// Submit work — a creator's entry into one contest.
//
// The published post URL is the load-bearing field on this page, so it is asked
// for first and the reason is stated: it is what RazeKit measures engagement
// from, and it is the link the Winners Hub publishes if this entry wins. A
// creator who pastes the wrong link, or publishes on a platform this contest
// does not allow, finds out here rather than after judging.
//
// The contest's mandatory rules sit beside the form, not on a page the creator
// has to go back to, so work can be checked against them while it is being
// submitted. That checklist is the creator's own: ticking it sends nothing and
// proves nothing. RazeKit checks the entry itself, after submission.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, UploadCloud, CheckCircle2, Film, Loader2, AlertCircle, Trophy,
  Clock, Link2, Smartphone, ShieldCheck, RefreshCw,
} from 'lucide-react';
import { entities, uploads, fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, timeLeft } from '@/lib/format';
import { Card, Button, Input, Badge, Skeleton, PageHeader, EmptyState, Field } from '@/components/ui';
import { ComplianceResult } from '@/components/Requirements';

const PLATFORMS = ['Instagram', 'YouTube', 'TikTok', 'Facebook', 'X', 'LinkedIn', 'Other'];

const SELECT_CLS = 'h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60';
const TEXTAREA_CLS = 'w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-muted/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function isHttpUrl(v) {
  try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

/** The label to show for a platform a contest requires; the raw value if we
 *  do not recognise it, because inventing a nicer name would be a guess. */
function platformLabel(value) {
  if (!value) return null;
  return PLATFORMS.find((p) => p.toLowerCase() === String(value).toLowerCase()) || String(value);
}

/** Maximum video length as the contest recorded it. Null = the contest set none. */
function maxLength(c) {
  if (Number(c?.max_video_seconds) > 0) {
    const s = Number(c.max_video_seconds);
    return s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} seconds`;
  }
  return c?.video_duration || c?.custom_duration || null;
}

/* ── The rules, as a checklist the creator can work through ─────────────────
   Its own fetch, its own loading, empty and error states. A failure here is
   said out loud: "we could not load the rules" is safe, an empty list that
   looks like "there are no rules" is not.                                   */
function RuleChecklist({ contestId }) {
  const [state, setState] = useState('loading'); // 'loading' | 'error' | data
  const [ticked, setTicked] = useState({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState('loading');
    fn('criteriaGet', { contest_id: contestId })
      .then((d) => alive && setState(d || { confirmed: false, criteria: [] }))
      .catch(() => alive && setState('error'));
    return () => { alive = false; };
  }, [contestId, attempt]);

  if (state === 'loading') {
    return (
      <Card className="p-5" aria-busy="true">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Check your work against the rules</h2>
        <div className="mt-3 space-y-2" aria-live="polite">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </Card>
    );
  }

  if (state === 'error') {
    return (
      <Card className="p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Check your work against the rules</h2>
        <p className="mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-ink" role="alert">
          <AlertCircle className="mt-px h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          We could not load this contest&rsquo;s requirements. Do not assume there are none — try again, or open the contest page before you submit.
        </p>
        <Button variant="secondary" size="lg" className="mt-3 w-full" onClick={() => setAttempt((a) => a + 1)}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
        </Button>
      </Card>
    );
  }

  const criteria = state.confirmed ? (state.criteria || []) : [];
  const mandatory = criteria.filter((c) => c.mandatory);
  const guidance = criteria.filter((c) => !c.mandatory);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Check your work against the rules</h2>
        {mandatory.length > 0 && <Badge tone="primary">{mandatory.length} mandatory</Badge>}
      </div>

      {mandatory.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {criteria.length === 0
            ? 'This contest has no locked requirements. Your entry is judged on the brief and on how the post performs.'
            : 'Nothing is mandatory here. The points below are what the brand expects, not what it enforces.'}
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {mandatory.map((c, i) => {
            const key = c.id || c.key || `m${i}`;
            return (
              <li key={key}>
                <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-md px-1 py-1.5 transition-colors hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={Boolean(ticked[key])}
                    onChange={(e) => setTicked((s) => ({ ...s, [key]: e.target.checked }))}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--primary))]"
                  />
                  <span className="min-w-0 text-[13px] leading-snug text-ink">
                    <span className="break-words">{c.label}</span>
                    {c.description && <span className="mt-0.5 block break-words text-[12px] leading-relaxed text-muted">{c.description}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {guidance.length > 0 && (
        <>
          <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">Also expected</h3>
          <ul className="mt-1.5 space-y-1">
            {guidance.map((c, i) => (
              <li key={c.id || c.key || `g${i}`} className="break-words text-[13px] leading-relaxed text-muted">{c.label}</li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 rounded-md bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
        This checklist is yours alone — ticking a box sends nothing. RazeKit checks your entry against these rules itself, right after you submit.
      </p>
    </Card>
  );
}

export default function SubmitWork() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileRef = useRef(null);
  const rootRef = useRef(null);
  const [contest, setContest] = useState(null);
  const [contestErr, setContestErr] = useState('');
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [f, setF] = useState({ title: '', description: '', platform: 'Instagram', live_url: '', final_asset_uri: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState({});
  const [submittedId, setSubmittedId] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      let c = null;
      try { c = await entities.Contest.get(id); }
      catch (e) { if (alive) setContestErr(e?.data?.error?.message || e?.message || ''); }
      if (!alive) return;
      setContest(c);
      const mine = await entities.Submission.filter({ contest_id: id, created_by_id: user.id }, '-created_date', 1).catch(() => []);
      if (!alive) return;
      const s = (mine || [])[0] || null;
      setSub(s);
      setF((p) => ({
        ...p,
        title: s?.title || '',
        description: s?.description || '',
        // A contest that names its platform decides this field; echoing the
        // contest's own value back is what the server will accept.
        platform: c?.required_platform || s?.platform || 'Instagram',
        live_url: s?.live_url || '',
        final_asset_uri: s?.final_asset_uri || '',
      }));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [id, user?.id]);

  const requiredPlatform = contest?.required_platform || null;
  const platformFixed = Boolean(requiredPlatform) || Boolean(sub?.platform_locked);
  const length = useMemo(() => maxLength(contest), [contest]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const { file_uri } = await uploads.privateFile(file);
      setF((p) => ({ ...p, final_asset_uri: file_uri }));
      try { const { signed_url } = await uploads.signedUrl(file_uri, 3600); setPreview({ url: signed_url, type: file.type }); } catch { /* preview is a nicety */ }
    } catch (e2) {
      setErr(e2?.data?.error?.message || e2?.message || 'That file could not be uploaded. Check the size and format, then try again.');
    } finally { setUploading(false); }
  };

  const focusField = (name) => {
    const el = rootRef.current?.querySelector(`#${name}`);
    if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };

  const submit = async () => {
    setErr('');
    const bad = {};
    const url = f.live_url.trim();
    if (url && !isHttpUrl(url)) bad.live_url = 'Paste the full link to the post, starting with https://';
    if (!f.final_asset_uri && !url) bad.live_url = 'Paste the link to your published post, or attach your final file below.';
    setFieldErr(bad);
    if (Object.keys(bad).length) { focusField('live_url'); return; }

    setSubmitting(true);
    try {
      const payload = { title: f.title.trim(), description: f.description.trim(), platform: f.platform, live_url: url,
        final_asset_uri: f.final_asset_uri, status: 'submitted', submitted_at: new Date().toISOString() };
      let s = sub;
      if (s) await entities.Submission.update(s.id, payload);
      else s = await entities.Submission.create({ contest_id: id, client_id: contest?.created_by_id, ...payload });
      if (contest && ['open', 'joined', 'working'].includes(contest.status)) await entities.Contest.update(id, { status: 'submitted' }).catch(() => {});
      // Check the entry against the contest's locked requirements straight away
      // so the creator learns about a problem now, not at judging time.
      setSubmittedId(s.id);
      await fn('complianceEvaluate', { submission_id: s.id }).catch(() => {});
      await entities.Notification.create({ type: 'submission_uploaded', title: 'New submission', description: contest?.title, contest_id: id, recipient_user_id: contest?.created_by_id }).catch(() => {});
      setDone(true);
    } catch (e2) {
      setErr(e2?.data?.error?.message || e2?.message || 'Your entry could not be submitted. Nothing was lost — try again.');
    } finally { setSubmitting(false); }
  };

  /* Loading — shaped like the page that is about to appear. */
  if (loading) return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-2 space-y-5 lg:order-1">
          <Skeleton className="h-52 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
        <Skeleton className="order-1 h-72 rounded-lg lg:order-2" />
      </div>
    </div>
  );

  if (done) return (
    <div className="mx-auto w-full max-w-lg py-12 text-center sm:py-16">
      <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden="true" />
      <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">Entry submitted</h1>
      <p className="mt-2 text-muted">Your work is in for &ldquo;{contest?.title}&rdquo;. You&rsquo;ll be notified when the brand reviews it.</p>
      {/* Requirement check result — the creator finds out now, not at judging. */}
      {submittedId && <div className="mt-6 text-left"><ComplianceResult submissionId={submittedId} /></div>}
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Button to="/work" size="lg">My work</Button>
        <Button to={`/contest/${id}`} size="lg" variant="secondary">Contest</Button>
      </div>
    </div>
  );

  /* The contest could not be loaded — there is nothing to submit against. */
  if (!contest) return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <Link to="/discover" className="-ml-1 inline-flex min-h-[44px] items-center gap-1.5 px-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Discover
      </Link>
      {contestErr && <div className="rounded-md bg-danger/8 px-3 py-2 text-sm text-danger" role="alert">{contestErr}</div>}
      <EmptyState
        icon={AlertCircle}
        title="This contest is no longer available"
        description="It may have been closed or removed, so entries can’t be submitted to it any more."
        action={<Button to="/discover" size="lg">Browse open contests</Button>}
      />
    </div>
  );

  const incomplete = !f.final_asset_uri && !f.live_url.trim();

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-5xl space-y-5">
      <Link to={`/contest/${id}`} className="-ml-1 inline-flex min-h-[44px] items-center gap-1.5 px-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Contest
      </Link>

      <PageHeader
        eyebrow="Submit your work"
        title={contest.title}
        description={sub
          ? 'You already have an entry here. Update the link, replace the file, then submit again.'
          : 'Tell RazeKit where you published, attach the file the brand should see, then submit.'}
      />

      {/* The facts that decide whether an entry is even valid. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {contest.prize_amount ? (
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="text-[12px] text-muted">Prize</span>
            <span className="nums font-display text-base font-extrabold text-primary">{money(contest.prize_amount, contest.currency)}</span>
          </div>
        ) : null}
        {contest.deadline ? (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="text-[12px] text-muted">Closes in</span>
            <span className="nums font-display text-base font-extrabold text-ink">{timeLeft(contest.deadline)}</span>
          </div>
        ) : null}
        {requiredPlatform ? (
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="text-[12px] text-muted">Platform</span>
            <span className="text-[13px] font-semibold text-ink">{platformLabel(requiredPlatform)} only</span>
          </div>
        ) : null}
        {length ? (
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="text-[12px] text-muted">Max length</span>
            <span className="text-[13px] font-semibold text-ink">{length}</span>
          </div>
        ) : null}
        {sub && <Badge tone="primary">Editing your entry</Badge>}
      </div>

      {err && <div className="rounded-md bg-danger/8 px-3 py-2.5 text-sm text-danger" role="alert">{err}</div>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── The rules. Above the form on a phone, beside it on a desktop. ── */}
        <aside className="order-1 lg:order-2 lg:sticky lg:top-24">
          <RuleChecklist contestId={id} />
        </aside>

        <div className="order-2 min-w-0 space-y-5 lg:order-1">
          {/* ── Where it was published ─────────────────────────────────────── */}
          <Card className="space-y-4 p-4 sm:p-5">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
                <Link2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> Your published post
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                This link is how RazeKit measures your video engagement, and it is the link the Winners Hub publishes if you win.
                Without it your entry can be reviewed by the brand, but it cannot be scored.
              </p>
            </div>

            <Field
              id="live_url"
              label="Link to the published post"
              error={fieldErr.live_url}
              hint="Paste the public post URL — not a profile, a story or a private draft."
            >
              <Input
                id="live_url"
                type="url"
                inputMode="url"
                value={f.live_url}
                onChange={(e) => { setF({ ...f, live_url: e.target.value }); setFieldErr((s) => ({ ...s, live_url: undefined })); }}
                autoComplete="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                enterKeyHint="done"
                className="h-11"
                aria-invalid={fieldErr.live_url ? 'true' : undefined}
                aria-describedby={fieldErr.live_url ? 'live_url-error' : undefined}
                placeholder="https://www.instagram.com/reel/…"
              />
            </Field>

            <Field
              id="platform"
              label="Platform"
              hint={requiredPlatform
                ? 'This contest only accepts entries published here. An entry from anywhere else is rejected.'
                : sub?.platform_locked
                  ? 'Locked to the platform your entry was first checked on.'
                  : 'Where the post above lives.'}
            >
              {platformFixed ? (
                // Read-only rather than disabled: a creator can still read it
                // with a keyboard or a screen reader, and it is plainly not
                // theirs to change.
                <div className="relative">
                  <Input
                    id="platform" readOnly value={platformLabel(f.platform)} aria-readonly="true"
                    className="h-11 bg-surface-2 pr-10 font-semibold"
                  />
                  <ShieldCheck className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success" aria-hidden="true" />
                </div>
              ) : (
                <select
                  id="platform"
                  value={f.platform}
                  onChange={(e) => setF({ ...f, platform: e.target.value })}
                  className={SELECT_CLS}
                >
                  {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                </select>
              )}
            </Field>

            {/* Anything the server already said about this URL, said back plainly. */}
            {sub?.url_check_reason && (
              <p className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2.5 text-[13px] leading-relaxed text-ink" role="status">
                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <span>
                  <span className="font-semibold">Last check on this link:</span> {sub.url_check_reason}
                </span>
              </p>
            )}
          </Card>

          {/* ── The file ───────────────────────────────────────────────────── */}
          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-base font-bold text-ink">Final creative</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              The file the brand reviews. Only the brand running this contest can open it.
              {length ? ` This contest allows ${length} at most.` : ''}
            </p>
            <input ref={fileRef} id="asset" type="file" accept="video/*,image/*" onChange={onFile} aria-label="Upload your final video or image" className="hidden" />
            {preview?.url && preview.type?.startsWith('image') ? (
              <div className="mb-3 mt-3 overflow-hidden rounded-md border border-line">
                <img src={preview.url} alt="Preview of the file you uploaded" className="max-h-64 w-full bg-surface-2 object-contain" />
              </div>
            ) : null}
            <button
              type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-busy={uploading || undefined}
              className="mt-3 flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed border-line-strong bg-surface-2/40 py-8 text-muted transition-all duration-200 hover:border-primary/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                : f.final_asset_uri ? <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />
                : <UploadCloud className="h-6 w-6" aria-hidden="true" />}
              <span className="text-sm font-medium">{uploading ? 'Uploading…' : f.final_asset_uri ? 'File uploaded — replace' : 'Upload video or image'}</span>
              <span className="px-4 text-center text-[11px] leading-snug text-muted">Video or image, straight from your phone or desktop.</span>
            </button>
            {f.final_asset_uri && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                <Film className="h-3.5 w-3.5" aria-hidden="true" /> Private file attached
              </p>
            )}
          </Card>

          {/* ── Context for the reviewer ───────────────────────────────────── */}
          <Card className="space-y-4 p-4 sm:p-5">
            <h2 className="font-display text-base font-bold text-ink">Tell the brand what they are looking at</h2>

            <Field id="title" label="Entry title" hint="How this entry is listed for the brand.">
              <Input
                id="title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}
                className="h-11" maxLength={120} enterKeyHint="next" autoComplete="off" placeholder="Name your entry"
              />
            </Field>

            <Field id="notes" label="Notes for the brand" hint="Optional. Anything the reviewer should know before they watch.">
              <textarea
                id="notes" rows={3} value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })}
                className={TEXTAREA_CLS}
                placeholder="Anything the reviewer should know…"
              />
            </Field>
          </Card>

          {/* Stays reachable on a phone without scrolling back to the top. */}
          <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-md pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-lg sm:border sm:px-4 sm:pb-3">
            {incomplete && (
              <p className="mb-2 text-[12px] leading-snug text-muted">
                Paste your published link, or attach a file, to submit.
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" size="lg" to={`/contest/${id}`} className="min-w-[6rem]">Cancel</Button>
              <Button size="lg" loading={submitting} disabled={incomplete} onClick={submit} className="min-w-[9rem]">
                {sub?.status === 'submitted' ? 'Resubmit entry' : 'Submit entry'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
