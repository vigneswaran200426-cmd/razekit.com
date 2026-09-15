// Winner verification.
//
// This screen exists only after a creator has WON. RazeKit never asks a creator
// to connect an account to enter a contest, to submit, or to be scored — so the
// first time they see any of this, they have already won something.
//
// The tone follows from that: acknowledge the win, then explain plainly what is
// being asked and why, and never imply RazeKit has access it does not have.
import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Trophy, ShieldCheck, Copy, Check, ExternalLink, AlertTriangle,
  Clock, Loader2, XCircle, Lock,
} from 'lucide-react';
import { fn } from '@/lib/api';
import { money } from '@/lib/format';
import { Card, Button, Input, Label, Badge, Skeleton, EmptyState, PageHeader } from '@/components/ui';
import { cn } from '@/lib/cn';

const TONE = { success: 'success', danger: 'danger', warning: 'warning', primary: 'primary', neutral: 'neutral' };
const errText = (e) => e?.data?.error?.message || e?.message || 'Something went wrong.';
const errCode = (e) => e?.data?.error?.code || null;

/** Copy-to-clipboard that confirms itself, because a silent copy is a guess. */
function CopyValue({ value, label, className }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — the value is selectable on screen anyway */ }
  };
  return (
    <div className={cn('flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2.5', className)}>
      <span className="min-w-0 flex-1 font-mono text-sm text-ink break-all select-all">{value}</span>
      <Button size="sm" variant="secondary" onClick={copy} aria-label={`Copy ${label || 'value'}`}>
        {copied ? <><Check className="w-3.5 h-3.5" aria-hidden="true" /> Copied</> : <><Copy className="w-3.5 h-3.5" aria-hidden="true" /> Copy</>}
      </Button>
    </div>
  );
}

function StatusBanner({ verification }) {
  const tone = TONE[verification.status_tone] || 'neutral';
  const Icon = verification.status === 'VERIFIED' ? ShieldCheck
    : verification.status === 'FAILED' ? XCircle
    : verification.status === 'MANUAL_REVIEW' ? Clock
    : Loader2;
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4',
        tone === 'success' && 'border-success/25 bg-success/[0.05]',
        tone === 'danger' && 'border-danger/25 bg-danger/[0.05]',
        tone === 'warning' && 'border-warning/30 bg-warning/[0.06]',
        (tone === 'primary' || tone === 'neutral') && 'border-line bg-surface-2'
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className={cn('w-5 h-5 shrink-0 mt-px', `text-${tone}`)} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{verification.status_label}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{verification.status_detail}</p>
        {verification.failure_reason && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-danger">{verification.failure_reason}</p>
        )}
      </div>
    </div>
  );
}

export default function WinnerVerify() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [platform, setPlatform] = useState('');
  const [handle, setHandle] = useState('');
  const [url, setUrl] = useState('');
  const [started, setStarted] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(() => {
    fn('winnerVerificationStatus', { contest_id: id })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) {
    const code = errCode(error);
    return (
      <div className="max-w-lg mx-auto py-8">
        <EmptyState
          icon={code === 'NOT_THE_WINNER' ? Lock : AlertTriangle}
          title={code === 'NOT_THE_WINNER' ? 'This is not your verification' : 'We could not load this'}
          description={errText(error)}
          action={<Button to="/dashboard" variant="secondary">Back to dashboard</Button>}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const v = data.verification;
  const contest = data.contest;

  if (!data.is_winner) {
    return (
      <div className="max-w-lg mx-auto py-8">
        <EmptyState
          icon={Lock}
          title="This is not your verification"
          description="Only the creator selected as the winner can verify an account for this campaign."
          action={<Button to={`/contest/${id}`} variant="secondary">Back to the campaign</Button>}
        />
      </div>
    );
  }

  if (!v) {
    return (
      <div className="max-w-lg mx-auto py-8">
        <EmptyState
          icon={Trophy}
          title="No verification yet"
          description={data.message || 'A winner has not been selected for this campaign yet.'}
          action={<Button to={`/contest/${id}`} variant="secondary">Back to the campaign</Button>}
        />
      </div>
    );
  }

  const verified = v.status === 'VERIFIED';
  const chosen = data.platforms?.find((p) => p.key === (started?.platform?.key || v.platform));

  const start = async () => {
    setBusy(true); setActionError(null);
    try {
      const r = await fn('winnerVerificationStart', { contest_id: id, platform, handle: handle || undefined });
      setStarted(r);
      setData((d) => ({ ...d, verification: r.verification }));
    } catch (e) { setActionError(e); } finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true); setActionError(null);
    try {
      const r = await fn('winnerVerificationSubmit', { contest_id: id, url, handle: handle || undefined });
      setData((d) => ({ ...d, verification: r.verification }));
      if (r.verification.status === 'VERIFIED') setStarted(null);
    } catch (e) { setActionError(e); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link to={`/contest/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Campaign
      </Link>

      {/* The win comes first. Restrained — this is a professional moment, not confetti. */}
      <Card className="p-6 bg-ink text-white border-ink">
        <div className="flex items-start gap-3">
          <Trophy className="w-6 h-6 shrink-0 text-warning mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">You won</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight">{contest?.title}</h1>
            {contest?.prize_amount != null && (
              <p className="mt-1.5 text-lg font-bold nums">{money(contest.prize_amount, contest.currency)}</p>
            )}
          </div>
        </div>
      </Card>

      <StatusBanner verification={v} />

      {verified ? (
        <Card className="p-5 space-y-3">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <ShieldCheck className="w-5 h-5 text-success" aria-hidden="true" /> Verified
          </h2>
          <p className="text-[13px] leading-relaxed text-muted">
            We confirmed you control the account you published from. Your payout is being arranged — you can follow it
            on your balance page.
          </p>
          <p className="text-[13px] leading-relaxed text-muted">
            You can remove the verification code from your post or bio now.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button to="/balance">View my balance</Button>
            <Button to={`/contest/${id}`} variant="secondary">Back to the campaign</Button>
          </div>
        </Card>
      ) : v.status === 'MANUAL_REVIEW' ? (
        <Card className="p-5 space-y-3">
          <h2 className="font-display text-base font-bold text-ink">A person is checking this</h2>
          <p className="text-[13px] leading-relaxed text-muted">
            {v.verification_note
              || 'We could not check this automatically, so a member of the RazeKit team is reviewing it.'}
          </p>
          <p className="text-[13px] leading-relaxed text-muted">
            You do not need to do anything else. We will let you know as soon as it is done. Leave the verification
            code in place until then.
          </p>
          <Button variant="secondary" onClick={load}>Refresh status</Button>
        </Card>
      ) : (
        <>
          {/* Why this is being asked. Answering it up front is the difference
              between a trustworthy request and a suspicious one. */}
          <Card className="p-5 space-y-2">
            <h2 className="font-display text-base font-bold text-ink">Why we ask for this</h2>
            <p className="text-[13px] leading-relaxed text-muted">
              Before RazeKit pays a prize, we confirm the winner controls the account the entry was published from.
              It protects your win from anyone claiming your work.
            </p>
            <ul className="space-y-1.5 pt-1 text-[13px] text-muted">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 text-success mt-px" aria-hidden="true" />
                We give you a one-time code to place somewhere public on your account.
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 text-success mt-px" aria-hidden="true" />
                You send us the public link. We look for the code — that is all.
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 text-success mt-px" aria-hidden="true" />
                <span>
                  <strong className="text-ink">We never ask for your password</strong> and we do not connect to your
                  account. RazeKit stores only your platform, handle and public link.
                </span>
              </li>
            </ul>
          </Card>

          {actionError && (
            <div className="rounded-md bg-danger/8 px-3 py-2.5 text-sm text-danger" role="alert">
              {errText(actionError)}
            </div>
          )}

          {/* Step 1 — platform */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">1</span>
              <h2 className="font-display text-base font-bold text-ink">Where did you publish your entry?</h2>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {(data.platforms || []).map((p) => {
                const active = (started?.platform?.key || v.platform || platform) === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setPlatform(p.key)}
                    aria-pressed={active}
                    className={cn(
                      'flex min-h-[44px] items-start gap-2 rounded-md border bg-surface p-3 text-left transition-all duration-200',
                      active ? 'border-primary shadow-xs' : 'border-line hover:border-line-strong'
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{p.label}</span>
                      {/* Set the expectation before they invest effort. */}
                      <span className="block text-[11px] leading-snug text-muted">
                        {p.automatic ? 'Checked automatically' : 'Checked by a person'}
                      </span>
                    </span>
                    {active && <Check className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            <div>
              <Label htmlFor="wv-handle">Your handle on that platform (optional)</Label>
              <Input id="wv-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@yourhandle" />
            </div>

            <Button loading={busy} disabled={!platform && !v.platform} onClick={start}>
              {v.challenge_code ? 'Get a new code' : 'Get my verification code'}
            </Button>
          </Card>

          {/* Step 2 — place the code */}
          {v.challenge_code && (
            <Card className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">2</span>
                <h2 className="font-display text-base font-bold text-ink">Add this code where we can see it</h2>
              </div>

              <CopyValue value={v.challenge_code} label="verification code" />

              <p className="text-[13px] leading-relaxed text-muted">
                {started?.platform?.placement || chosen?.placement
                  || 'Add the code somewhere publicly visible on the account you published from.'}
              </p>
              {v.challenge_expires_at && (
                <p className="text-[12px] text-muted">
                  This code is valid until {new Date(v.challenge_expires_at).toLocaleString()}.
                </p>
              )}
            </Card>
          )}

          {/* Step 3 — submit the link */}
          {v.challenge_code && (
            <Card className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">3</span>
                <h2 className="font-display text-base font-bold text-ink">Send us the public link</h2>
              </div>

              <div>
                <Label htmlFor="wv-url">Public link to your entry or profile *</Label>
                <Input
                  id="wv-url" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder={started?.platform?.url_hint || chosen?.url_hint || 'https://…'}
                  inputMode="url" autoComplete="off"
                />
                <p className="mt-1 text-[12px] text-muted">
                  Make sure the page is public — we can only see what anyone else can see.
                </p>
              </div>

              {v.attempts > 0 && v.attempts_remaining > 0 && (
                <p className="text-[12px] text-muted">
                  {v.attempts_remaining} automatic {v.attempts_remaining === 1 ? 'attempt' : 'attempts'} remaining.
                  After that a person reviews it for you.
                </p>
              )}

              <Button loading={busy} disabled={url.trim().length < 8} onClick={submit}>
                Verify my account
              </Button>

              {v.post_url && (
                <a
                  href={v.post_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Open the link you submitted
                </a>
              )}
            </Card>
          )}
        </>
      )}

      <p className="text-center text-[12px] leading-relaxed text-muted">
        RazeKit never asks for your password and cannot post on your behalf.
      </p>
    </div>
  );
}
