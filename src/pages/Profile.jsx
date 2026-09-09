// Profile — the one place a member edits how they appear across RazeKit.
// Presentation only: same two fields, same single updateMe call, same refresh.
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { auth } from '@/lib/api';
import { PageHeader, Card, Button, Input, Label, Avatar, Badge } from '@/components/ui';

export default function Profile() {
  const { user, refresh } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  // Display-only: tells the member their edits are not committed yet.
  const dirty = fullName !== (user?.full_name || '') || bio !== (user?.bio || '');

  const save = async () => {
    setSaving(true); setSaved(false); setErr('');
    try {
      await auth.updateMe({ full_name: fullName.trim(), bio: bio.trim() });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e?.data?.error?.message || e.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader title="Profile" description="How you appear across RazeKit." />

      {/* Identity — the account as it stands, read only. */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Avatar name={user?.full_name || user?.email} size={64} className="shrink-0" />
          <div className="min-w-0">
            <p className="font-display text-xl font-bold text-ink truncate">{user?.full_name || 'Your name'}</p>
            <p className="text-sm text-muted truncate">{user?.email}</p>
            <Badge tone="primary" className="mt-1.5 capitalize">{user?.user_role || 'visitor'}</Badge>
          </div>
        </div>
      </Card>

      {/* The editable half — one card, one primary action. */}
      <Card className="p-5 sm:p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Your details</h2>

        <div className="mt-4 space-y-5">
          <div>
            <Label htmlFor="fn">Full name</Label>
            <Input
              id="fn"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              aria-describedby="fn-help"
            />
            <p id="fn-help" className="mt-1.5 text-[12px] text-muted">
              Shown wherever your work appears: entries, results and winner cards.
            </p>
          </div>

          <div>
            <Label htmlFor="bio">Bio</Label>
            <textarea
              id="bio"
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell brands about your work…"
              aria-describedby="bio-help"
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 transition-colors focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p id="bio-help" className="mt-1.5 text-[12px] text-muted">
              A line or two on what you make and who you make it for.
            </p>
          </div>
        </div>

        {err && <div className="mt-5 rounded-md bg-danger/8 text-danger text-sm px-3 py-2">{err}</div>}

        <div className="mt-6 pt-5 border-t border-line flex flex-wrap items-center gap-3">
          <Button loading={saving} onClick={save}>Save changes</Button>
          <p role="status" aria-live="polite" className="text-sm">
            {saved ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-success">
                <Check className="w-4 h-4" aria-hidden="true" />
                Saved
              </span>
            ) : dirty ? (
              <span className="text-muted">Unsaved changes</span>
            ) : null}
          </p>
        </div>
      </Card>
    </div>
  );
}
