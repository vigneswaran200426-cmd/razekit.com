// Settings — grouped into labelled sections rather than hidden behind tabs.
//
// Notification and privacy preferences were stored server-side long before this
// screen surfaced them: UserPreference has carried eleven fields that no part of
// the product could read or change. Every account was silently on whatever the
// server defaulted to, with no way to see it, let alone opt out.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Eye, KeyRound, Languages, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { auth, entities } from '@/lib/api';
import { PageHeader, Card, Button, Avatar, Spinner, Switch, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

const LANGS = [
  { code: 'en', label: 'English' }, { code: 'hi', label: 'हिन्दी (Hindi)' }, { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'te', label: 'తెలుగు (Telugu)' }, { code: 'es', label: 'Español' },
];

/**
 * How the product names each role out loud.
 *
 * `user_role` holds 'client' and 'creator'. The navigation has always said
 * "Brand" for a client; this screen used to print the raw value with a
 * capitalize class, so the same account was a Brand in the header and a "Client"
 * in its own settings. The stored value is an implementation detail and belongs
 * nowhere a person can read it.
 */
const ROLE_LABEL = {
  client: 'Brand account',
  creator: 'Creator account',
  admin: 'Admin account',
};

/** The notification switches, in the order a person would look for them. */
const NOTIF = [
  { key: 'notif_contests', label: 'New contests', description: 'When a brief opens that matches what you do.' },
  { key: 'notif_submissions', label: 'Submissions', description: 'When work is submitted to a contest you run.' },
  { key: 'notif_winners', label: 'Winners', description: 'When a winner is selected on a contest you are part of.' },
  { key: 'notif_payments', label: 'Payments', description: 'Funding, verification and payment status changes.' },
  { key: 'notif_payouts', label: 'Payouts', description: 'When a withdrawal changes state.' },
  { key: 'notif_messages', label: 'Messages', description: 'Replies in a handover conversation.' },
  { key: 'notif_support', label: 'Support', description: 'Updates on a support ticket you opened.' },
];

const PRIVACY = [
  { key: 'allow_messages', label: 'Allow messages', description: 'Let brands you have worked with start a conversation.' },
  { key: 'show_earnings', label: 'Show earnings on my profile', description: 'Display total prize money won. Off by default.' },
];

/** One settings group: icon, heading, supporting line, then its controls. */
function Section({ icon: Icon, title, description, children }) {
  return (
    <Card as="section" className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-2 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function Field({ label, value, className = '' }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line py-3 first:pt-0 last:border-0 last:pb-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={cn('text-sm font-medium text-ink break-words', className)}>{value || '—'}</dd>
    </div>
  );
}

/** Matches the switch rows it replaces, so the section does not resize on load. */
function SwitchSkeleton({ rows }) {
  return (
    <div aria-busy="true" role="status">
      <span className="sr-only">Loading your preferences</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start justify-between gap-4 border-b border-line py-3.5 first:pt-0 last:border-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1.5 h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * The preference switches.
 *
 * Each toggle writes immediately, and the UI only moves once the server has
 * accepted it. Flipping optimistically and reverting on failure would show the
 * wrong state for as long as the request takes, on a screen whose entire purpose
 * is to tell you what the server currently holds.
 */
function Preferences({ userId, onError }) {
  const [prefs, setPrefs] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [pending, setPending] = useState('');

  const load = useCallback(async () => {
    setLoadErr('');
    try {
      const rows = await entities.UserPreference.filter({ user_id: userId }, '-created_date', 1);
      // No row yet is normal for an account that has never opened this screen —
      // an empty object means "server defaults", not an error.
      setPrefs(rows?.[0] || {});
    } catch (e) {
      setLoadErr(e?.message || 'We could not load your preferences.');
    }
  }, [userId]);

  useEffect(() => { if (userId) load(); }, [userId, load]);

  const set = async (key, value) => {
    setPending(key);
    onError('');
    try {
      const next = prefs?.id
        ? await entities.UserPreference.update(prefs.id, { [key]: value })
        : await entities.UserPreference.create({ user_id: userId, [key]: value });
      setPrefs((p) => ({ ...(p || {}), ...(next || {}), [key]: value }));
    } catch (e) {
      onError(e?.data?.error?.message || e?.message || 'That change could not be saved. Nothing was altered.');
    } finally {
      setPending('');
    }
  };

  const rows = (list) => list.map((f) => (
    <Switch
      key={f.key}
      id={`pref-${f.key}`}
      label={f.label}
      description={f.description}
      // A field the server has never written is undefined. Notifications are on
      // unless turned off; visibility switches are off unless turned on.
      checked={prefs?.[f.key] ?? f.defaultOn ?? false}
      busy={pending === f.key}
      onChange={(v) => set(f.key, v)}
    />
  ));

  if (loadErr) {
    return (
      <div className="rounded-md border border-line-strong bg-surface-2 p-4">
        <p className="text-sm text-ink">{loadErr}</p>
        <p className="mt-1 text-[13px] text-muted">Your existing preferences are unchanged.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={load}>Try again</Button>
      </div>
    );
  }

  return (
    <>
      <Section icon={Bell} title="Notifications" description="Which of these RazeKit should tell you about. Saved as you change them.">
        {prefs === null
          ? <SwitchSkeleton rows={NOTIF.length} />
          : rows(NOTIF.map((f) => ({ ...f, defaultOn: true })))}
      </Section>

      <Section icon={Eye} title="Privacy" description="What other people on RazeKit can see and do.">
        {prefs === null
          ? <SwitchSkeleton rows={PRIVACY.length} />
          : rows(PRIVACY.map((f) => ({ ...f, defaultOn: f.key === 'allow_messages' })))}
      </Section>
    </>
  );
}

export default function Settings() {
  const { user, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [lang, setLang] = useState(user?.language || 'en');
  const [saving, setSaving] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [resetting, setResetting] = useState(false);

  const setLanguage = async (code) => {
    setLang(code);
    setErr('');
    setSaving(code);
    try {
      await auth.updateMe({ language: code });
      await refresh();
      setNote('Language updated.');
      setTimeout(() => setNote(''), 2000);
    } catch (e) {
      setErr(e?.data?.error?.message || e?.message || 'Could not save your language. Please try again.');
    } finally {
      setSaving('');
    }
  };

  /**
   * Previously this set "Password reset link sent to your email." synchronously,
   * before the request had resolved — so the screen claimed an email was on its
   * way while it was still in flight, and said so even when it was about to
   * fail. It now waits for the server.
   */
  const requestReset = async () => {
    setErr(''); setNote(''); setResetting(true);
    try {
      await auth.resetRequest(user?.email);
      setNote('Password reset link sent to your email.');
      setTimeout(() => setNote(''), 4000);
    } catch (e) {
      setErr(e?.data?.error?.message || e?.message || 'Could not send the reset link. Please try again.');
    } finally {
      setResetting(false);
    }
  };

  const displayName = user?.full_name || user?.email?.split('@')[0] || 'Your account';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader title="Settings" description="Manage your account and preferences." />

      {err && (
        <div role="alert" className="rounded-md bg-danger/8 text-danger text-sm px-3 py-2">{err}</div>
      )}
      {note && (
        <div role="status" className="rounded-md bg-success/8 text-success text-sm font-medium px-3 py-2">{note}</div>
      )}

      <Section icon={UserRound} title="Account" description="The details we hold for this account.">
        <div className="flex items-center gap-3 pb-4 mb-1 border-b border-line">
          <Avatar name={user?.full_name || user?.email} size={44} />
          <p className="font-display text-[15px] font-bold text-ink truncate">{displayName}</p>
        </div>
        <dl>
          <Field label="Email" value={user?.email} />
          <Field label="Account type" value={ROLE_LABEL[user?.user_role] || '—'} />
          <Field
            label="Member since"
            value={user?.created_date ? new Date(user.created_date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '—'}
          />
        </dl>
      </Section>

      {user?.id && <Preferences userId={user.id} onError={setErr} />}

      <Section
        icon={Languages}
        title="Display language"
        description="Choose how RazeKit reads for you. Saved as soon as you pick one."
      >
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {LANGS.map((l) => {
            const active = lang === l.code;
            return (
              <li key={l.code}>
                <button
                  type="button"
                  onClick={() => setLanguage(l.code)}
                  aria-pressed={active}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md border px-4 py-3 text-left text-sm font-medium transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    active
                      ? 'border-primary bg-primary/5 text-ink'
                      : 'border-line text-muted hover:border-line-strong hover:text-ink'
                  )}
                >
                  <span className="truncate">{l.label}</span>
                  {saving === l.code
                    ? <Spinner className="w-4 h-4 shrink-0" />
                    : active && <Check className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section icon={KeyRound} title="Security" description="Reset your password via email, or sign out of this device.">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="primary" loading={resetting} onClick={requestReset}>
            <KeyRound className="w-4 h-4" aria-hidden="true" />
            Reset password
          </Button>
          <Button variant="outlineDanger" onClick={() => signOut().then(() => navigate('/'))}>
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </Section>
    </div>
  );
}
