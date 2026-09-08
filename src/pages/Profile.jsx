import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { auth } from '@/lib/api';
import { PageHeader, Card, Button, Input, Label, Avatar, Badge } from '@/components/ui';

export default function Profile() {
  const { user, refresh } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true); setSaved(false);
    try { await auth.updateMe({ full_name: fullName.trim(), bio: bio.trim() }); await refresh(); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader eyebrow="Account" title="Profile" description="How you appear across RazeKit." />
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Avatar name={user?.full_name || user?.email} size={64} />
          <div><p className="font-display text-xl font-bold text-ink">{user?.full_name || 'Your name'}</p>
            <p className="text-sm text-muted">{user?.email}</p>
            <Badge tone="primary" className="mt-1.5 capitalize">{user?.user_role || 'visitor'}</Badge></div>
        </div>
        <div className="mt-6 space-y-4">
          <div><Label htmlFor="fn">Full name</Label><Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div><Label htmlFor="bio">Bio</Label>
            <textarea id="bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell brands about your work…"
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
          <div className="flex items-center gap-3">
            <Button loading={saving} onClick={save}>Save changes</Button>
            {saved && <span className="text-sm text-success font-medium">Saved ✓</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}
