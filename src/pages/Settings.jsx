import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { auth } from '@/lib/api';
import { PageHeader, Card, Button, Segmented } from '@/components/ui';

const LANGS = [
  { code: 'en', label: 'English' }, { code: 'hi', label: 'हिन्दी (Hindi)' }, { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'te', label: 'తెలుగు (Telugu)' }, { code: 'es', label: 'Español' },
];

export default function Settings() {
  const { user, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('account');
  const [lang, setLang] = useState(user?.language || 'en');
  const [note, setNote] = useState('');

  const setLanguage = async (code) => {
    setLang(code);
    try { await auth.updateMe({ language: code }); await refresh(); setNote('Language updated.'); setTimeout(() => setNote(''), 2000); } catch {}
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader eyebrow="Account" title="Settings" description="Manage your account and preferences." />
      <Segmented tabs={[{ key: 'account', label: 'Account' }, { key: 'security', label: 'Security' }, { key: 'language', label: 'Language' }]} value={tab} onChange={setTab} />

      {tab === 'account' && (
        <Card className="p-6 space-y-4">
          <Field label="Email" value={user?.email} />
          <Field label="Role" value={user?.user_role} className="capitalize" />
          <Field label="Member since" value={user?.created_date ? new Date(user.created_date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '—'} />
        </Card>
      )}

      {tab === 'security' && (
        <Card className="p-6 space-y-4">
          <p className="text-sm text-muted">Reset your password via email, or sign out of this device.</p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => { auth.resetRequest(user?.email); setNote('Password reset link sent to your email.'); setTimeout(() => setNote(''), 3000); }}>Reset password</Button>
            <Button variant="outlineDanger" onClick={() => signOut().then(() => navigate('/'))}>Sign out</Button>
          </div>
        </Card>
      )}

      {tab === 'language' && (
        <Card className="p-6">
          <p className="text-sm font-medium text-ink mb-3">Display language</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {LANGS.map((l) => (
              <button key={l.code} onClick={() => setLanguage(l.code)}
                className={`text-left rounded-md border px-4 py-3 text-sm font-medium transition-all ${lang === l.code ? 'border-primary bg-primary/5 text-ink' : 'border-line text-muted hover:border-line-strong hover:text-ink'}`}>{l.label}</button>
            ))}
          </div>
        </Card>
      )}

      {note && <p className="text-sm text-success font-medium text-center">{note}</p>}
    </div>
  );
}

function Field({ label, value, className = '' }) {
  return <div className="flex items-center justify-between border-b border-line pb-3 last:border-0 last:pb-0"><span className="text-sm text-muted">{label}</span><span className={`text-sm font-medium text-ink ${className}`}>{value || '—'}</span></div>;
}
