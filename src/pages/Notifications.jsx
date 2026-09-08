import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateShort } from '@/lib/format';
import { PageHeader, Card, EmptyState, Skeleton, Button } from '@/components/ui';

export default function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    entities.Notification.filter({ recipient_user_id: user.id }, '-created_date', 60).then((l) => setItems(l || [])).catch(() => setItems([]));
  }, [user?.id]);

  const markAll = async () => {
    const unread = (items || []).filter((n) => !n.read);
    await Promise.all(unread.map((n) => entities.Notification.update(n.id, { read: true }).catch(() => {})));
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = (items || []).filter((n) => !n.read).length;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader eyebrow="Activity" title="Notifications" description={unreadCount ? `${unreadCount} unread` : 'You’re all caught up.'}
        actions={unreadCount > 0 && <Button variant="secondary" size="sm" onClick={markAll}><Check className="w-4 h-4" />Mark all read</Button>} />
      {!items ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : items.length ? (
        <Card className="divide-y divide-line">
          {items.map((n) => (
            <Link key={n.id} to={n.contest_id ? `/contest/${n.contest_id}` : '/notifications'}
              className={`flex items-start gap-3 px-4 py-3.5 hover:bg-surface-2/60 transition-colors ${!n.read ? 'bg-primary/[0.03]' : ''}`}>
              <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-md bg-surface-2 text-primary shrink-0"><Bell className="w-4 h-4" /></span>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">{n.title}</p>{n.description && <p className="text-sm text-muted mt-0.5 line-clamp-2">{n.description}</p>}<p className="text-xs text-muted mt-1">{dateShort(n.created_date)}</p></div>
              {!n.read && <span className="mt-2 w-2 h-2 rounded-full bg-primary shrink-0" />}
            </Link>
          ))}
        </Card>
      ) : (
        <EmptyState icon={Bell} title="No notifications" description="Contest, submission and payment updates will appear here." />
      )}
    </div>
  );
}
