// Settings — a thin account page, grouped into labelled sections rather than
// hidden behind tabs. Presentation only: every call and value is unchanged.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, KeyRound, Languages, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { auth } from '@/lib/api';
import { PageHeader, Card, Button, Avatar, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

const LANGS = [
  { code: 'en', label: 'English' }, { code: 'hi', label: 'हिन्दी (Hindi)' }, { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'te', label: 'తెలుగు (Telugu)' }, { code: 'es', label: 'Español' },
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

export default function Settings() {
  const { user, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [lang, setLang] = useState(user?.language || 'en');
  const [saving, setSaving] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

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
          <Field label="Role" value={user?.user_role} className="capitalize" />
          <Field
            label="Member since"
            value={user?.created_date ? new Date(user.created_date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '—'}
          />
        </dl>
      </Section>

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
          <Button
            variant="primary"
            onClick={() => {
              setErr('');
              auth.resetRequest(user?.email).catch(() => {
                setNote('');
                setErr('Could not send the reset link. Please try again.');
              });
              setNote('Password reset link sent to your email.');
              setTimeout(() => setNote(''), 3000);
            }}
          >
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
