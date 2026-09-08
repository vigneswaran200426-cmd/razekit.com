import { useEffect, useState } from 'react';
import { LineChart, Link2, Instagram, Youtube } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader, Card, EmptyState, Skeleton, Button, Badge } from '@/components/ui';

export default function Social() {
  const { user } = useAuth();
  const [conns, setConns] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    entities.SocialConnection.filter({ user_id: user.id }, '-created_date', 50).then((l) => setConns(l || [])).catch(() => setConns([]));
  }, [user?.id]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Brand" title="Social Tracker" description="Track connected accounts, reach and campaign performance. No estimated or fabricated numbers — only real connected data." />
      {!conns ? (
        <div className="grid sm:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : conns.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {conns.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-center justify-between"><span className="font-semibold text-ink capitalize">{c.platform || 'Account'}</span><Badge tone={c.status === 'connected' || c.connected ? 'success' : 'neutral'}>{c.status || (c.connected ? 'Connected' : 'Pending')}</Badge></div>
              <p className="text-sm text-muted mt-1">{c.handle || c.username || '—'}</p>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={Link2} title="No connected accounts" description="Connect your social platforms to track reach, engagement and campaign performance. Live OAuth sync is set up server-side per platform."
          action={<Button variant="secondary" disabled>Connect accounts (coming soon)</Button>} />
      )}
    </div>
  );
}
