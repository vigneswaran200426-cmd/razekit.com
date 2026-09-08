import { useEffect, useState } from 'react';
import { Users, Flag, CreditCard, ShieldCheck } from 'lucide-react';
import { entities } from '@/lib/api';
import { PageHeader, StatTile, Card, Skeleton } from '@/components/ui';

export default function Admin() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      const [users, contests, payments] = await Promise.all([
        entities.User.list('-created_date', 500).catch(() => []),
        entities.Contest.list('-created_date', 500).catch(() => []),
        entities.Payment.filter({ status: 'CAPTURED' }, '-created_date', 500).catch(() => []),
      ]);
      setStats({ users: (users || []).length, contests: (contests || []).length, captured: (payments || []).length });
    })();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Platform" title="Admin" description="Operational overview. Full trust, payments and user tools live in the dedicated admin surface." />
      {!stats ? (
        <div className="grid sm:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          <StatTile label="Users" value={stats.users} icon={Users} />
          <StatTile label="Contests" value={stats.contests} icon={Flag} />
          <StatTile label="Captured payments" value={stats.captured} icon={CreditCard} />
        </div>
      )}
      <Card className="p-5 flex items-start gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-md bg-success/10 text-success shrink-0"><ShieldCheck className="w-4 h-4" /></span>
        <p className="text-sm text-muted">Trust &amp; safety, payment reconciliation, enforcement and user management run on the backend with server-authoritative RLS. Detailed admin tooling is a separate, access-controlled surface.</p>
      </Card>
    </div>
  );
}
