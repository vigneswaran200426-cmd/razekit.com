import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, Trophy, Wallet, Target, ShieldAlert, LifeBuoy } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateShort } from '@/lib/format';
import { PageHeader, Card, EmptyState, Skeleton, Button } from '@/components/ui';

// Operational notifications, not social ones — the icon carries the category.
const KIND = {
  contest_won:      { icon: Trophy,      tone: 'text-warning' },
  winner_announced: { icon: Trophy,      tone: 'text-warning' },
  payment_received: { icon: Wallet,      tone: 'text-success' },
  support_ticket:   { icon: LifeBuoy,    tone: 'text-primary' },
  security:         { icon: ShieldAlert, tone: 'text-danger' },
  contest:          { icon: Target,      tone: 'text-primary' },
};
const kindOf = (type) => KIND[type] || (String(type || '').startsWith('contest') ? KIND.contest : { icon: Bell, tone: 'text-primary' });

export default function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    entities.Notification.filter({ recipient_user_id: user.id }, '-created_date', 60).then((l) => setItems(l || [])).catch(() => { setErr('We could not load your notifications.'); setItems([]); });
  }, [user?.id]);

  const markAll = async () => {
    const unread = (items || []).filter((n) => !n.read);
    await Promise.all(unread.map((n) => entities.Notification.update(n.id, { read: true }).catch(() => {})));
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = (items || []).filter((n) => !n.read).length;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader title="Notifications" description={unreadCount ? `${unreadCount} unread` : 'You’re all caught up.'}
        actions={unreadCount > 0 && <Button variant="secondary" size="sm" onClick={markAll}><Check className="w-4 h-4" aria-hidden="true" />Mark all read</Button>} />
      {err && <div className="rounded-md bg-danger/8 text-danger text-sm px-3 py-2" role="alert">{err}</div>}
      {!items ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : items.length ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line" aria-label="Notifications">
            {items.map((n) => {
              const { icon: Icon, tone } = kindOf(n.type);
              const body = (
                <>
                  <span className={`mt-0.5 grid h-9 w-9 place-items-center rounded-md bg-surface-2 shrink-0 ${tone}`}>
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{n.title}</span>
                    {n.description && <span className="block text-sm text-muted mt-0.5 line-clamp-2">{n.description}</span>}
                    <span className="block text-xs text-muted mt-1">{dateShort(n.created_date)}</span>
                  </span>
                  {!n.read && <span className="mt-2 w-2 h-2 rounded-full bg-primary shrink-0"><span className="sr-only">Unread</span></span>}
                </>
              );
              const cls = `flex items-start gap-3 px-4 py-3.5 transition-colors ${!n.read ? 'bg-primary/[0.03]' : ''}`;
              return (
                <li key={n.id}>
                  {n.contest_id
                    ? <Link to={`/contest/${n.contest_id}`} className={`${cls} hover:bg-surface-2/60`}>{body}</Link>
                    : <div className={cls}>{body}</div>}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={Bell} title="You're all caught up"
          description="Contest, submission, scoring and payment updates will appear here as they happen."
          action={<Button to="/discover" variant="secondary">Find a contest</Button>} />
      )}
    </div>
  );
}
