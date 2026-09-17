// The notification centre.
//
// Everything here was persisted by the backend when a real event happened, so
// this page never invents a message, a name or a count. It answers four things
// for each row: what happened, when, what it relates to, and where to go next.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, Check, Inbox, RefreshCw } from 'lucide-react';
import { fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { Button, Card, EmptyState, PageHeader, Segmented, Skeleton } from '@/components/ui';
import {
  CATEGORY_META, actionLabel, categoryMeta, notificationTime, useNotifications,
} from '@/components/Notifications';

const ALL = 'all';

function dayLabel(iso) {
  if (!iso) return 'Earlier';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-IN', { weekday: 'long' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NotificationsPage() {
  const { status } = useAuth();
  const ctx = useNotifications();
  const authed = status === 'authenticated';
  // The provider owns read-state so the bell and this page never disagree. If
  // it is not mounted, talk to the API directly rather than pretending to work.
  const markRead = ctx.mounted ? ctx.markRead : (id) => fn('notificationRead', { ids: [id] }).catch(() => {});
  const markAllRead = ctx.mounted ? ctx.markAllRead : () => fn('notificationRead', { all: true }).catch(() => {});
  const { categories } = ctx;

  const [category, setCategory] = useState(ALL);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [marking, setMarking] = useState(false);
  const seenOnce = useRef(false);
  const localUnread = (items || []).filter((n) => !n.read).length;
  const unread = ctx.mounted ? ctx.unread : localUnread;

  // One fetch, re-run when the filter changes or a poll changes the unread
  // count. `items === null` is the only thing that shows the loading skeleton,
  // so a background refresh never blanks the list you are reading.
  useEffect(() => {
    if (!authed) return undefined;
    let alive = true;
    setBusy(true);
    fn('notificationFeed', {
      limit: 100,
      ...(category !== ALL ? { category } : {}),
      ...(unreadOnly ? { unread_only: true } : {}),
    })
      .then((r) => {
        if (!alive) return;
        setItems(r?.notifications || []);
        setTotal(r?.total || 0);
        setError('');
        seenOnce.current = true;
      })
      .catch((e) => {
        if (!alive) return;
        setItems((cur) => cur || []);
        setError(e?.status === 401
          ? 'Your session has ended. Sign in again to see your notifications.'
          : 'We could not load your notifications. Check your connection and try again.');
      })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [authed, category, unreadOnly, ctx.unread]);

  const open = (n) => {
    if (n.read) return;
    setItems((cur) => (cur ? cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)) : cur));
    markRead(n.id);
  };

  const markAll = async () => {
    setMarking(true);
    setItems((cur) => (cur ? cur.map((x) => ({ ...x, read: true })) : cur));
    try { await markAllRead(); } finally { setMarking(false); }
  };

  const groups = useMemo(() => {
    const out = [];
    for (const n of items || []) {
      const label = dayLabel(n.created_date);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [items]);

  const catKeys = (categories && categories.length ? categories : Object.keys(CATEGORY_META))
    .filter((c) => CATEGORY_META[c]);
  const activeLabel = category === ALL ? '' : categoryMeta(category).label.toLowerCase();

  if (!authed) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={Bell}
          title="Sign in to see your notifications"
          description="Campaign, submission, scoring and funding updates are tied to your account."
          action={<Button to="/login">Sign in</Button>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Notifications"
        description={
          unread > 0
            ? `${unread} unread of ${total} ${total === 1 ? 'notification' : 'notifications'}.`
            : 'Everything here is read. New updates arrive as they happen.'
        }
        actions={(
          <Button variant="secondary" size="sm" onClick={markAll} loading={marking} disabled={unread === 0}
            title={unread === 0 ? 'Nothing is unread' : undefined}>
            <Check className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Mark all read</span>
            <span className="sm:hidden">All read</span>
          </Button>
        )}
      />

      {/* One filter, not two.
          This was a horizontally scrolling wall of nine category chips, each with
          its own unread badge, plus a separate "Unread only" checkbox underneath
          — two filter systems stacked above a list that is usually short enough
          to just read. All / Unread is what a notification centre is expected to
          offer, so it is the control that gets the weight.

          Category still filters, because people with a lot of payout or support
          traffic genuinely use it; it is a compact select beside the refresh
          indicator rather than a row competing with the list. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={unreadOnly ? 'unread' : ALL}
          onChange={(k) => setUnreadOnly(k === 'unread')}
          tabs={[
            { key: ALL, label: 'All' },
            { key: 'unread', label: unread > 0 ? `Unread (${unread})` : 'Unread' },
          ]}
        />
        <div className="flex items-center gap-3">
          {busy && seenOnce.current && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-muted" aria-live="polite">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Refreshing
            </span>
          )}
          {catKeys.length > 1 && (
            <select
              aria-label="Filter by category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-[13px] font-medium text-ink [@media(pointer:coarse)]:h-11 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value={ALL}>All categories</option>
              {catKeys.map((c) => (
                <option key={c} value={c}>{categoryMeta(c).label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-danger/25 bg-danger/8 px-3.5 py-2.5 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {items === null ? (
        <Card className="overflow-hidden" aria-busy="true">
          <div className="divide-y divide-line">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={unreadOnly ? BellOff : Inbox}
          title={
            unreadOnly && category !== ALL ? `No unread ${activeLabel} notifications`
              : unreadOnly ? 'Nothing unread'
              : category !== ALL ? `No ${activeLabel} notifications yet`
              : 'No notifications yet'
          }
          description={
            unreadOnly ? 'You have read everything in this filter. Turn off "Unread only" to see the full history.'
              : category !== ALL ? `Updates in the ${activeLabel} category will appear here as they happen.`
              : 'Campaign, submission, scoring, funding and payout updates all arrive here.'
          }
          action={
            unreadOnly ? <Button variant="secondary" onClick={() => setUnreadOnly(false)}>Show all</Button>
              : category !== ALL ? <Button variant="secondary" onClick={() => setCategory(ALL)}>Show every category</Button>
              : <Button to="/discover" variant="secondary">Find a campaign</Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.label}</h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {g.items.map((n) => <Row key={n.id} n={n} onOpen={() => open(n)} onMarkRead={() => open(n)} />)}
                </ul>
              </Card>
            </section>
          ))}
          {total > items.length && (
            <p className="px-1 text-[12px] text-muted">
              Showing the {items.length} most recent of {total}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ n, onOpen, onMarkRead }) {
  const meta = categoryMeta(n.category);
  const Icon = meta.icon;
  const critical = n.persistent || n.severity === 'critical';
  const label = actionLabel(n.action_url);

  return (
    <li className={cn('relative flex items-start gap-3 px-4 py-3.5 transition-colors', !n.read && 'bg-primary/[0.03]', n.action_url && 'hover:bg-surface-2/60')}>
      <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-2', critical ? 'text-danger' : meta.tone)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        {n.action_url ? (
          <Link
            to={n.action_url}
            onClick={onOpen}
            className="text-sm font-semibold leading-snug text-ink after:absolute after:inset-0 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {n.title}
          </Link>
        ) : (
          <p className="text-sm font-semibold leading-snug text-ink">{n.title}</p>
        )}

        {n.body && <p className="mt-0.5 break-words text-[13px] leading-snug text-muted">{n.body}</p>}

        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-muted">
          <span className="font-semibold uppercase tracking-wide">{meta.label}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={n.created_date}>{notificationTime(n.created_date)}</time>
          {n.actor_name && (<><span aria-hidden="true">·</span><span className="truncate">{n.actor_name}</span></>)}
          {critical && (<><span aria-hidden="true">·</span><span className="font-semibold text-danger">Needs action</span></>)}
        </p>

        {n.action_url && label && (
          <span className="mt-1 inline-block text-[12px] font-semibold text-primary">{label}</span>
        )}
      </div>

      {!n.read && (
        <button
          type="button"
          onClick={onMarkRead}
          className="relative z-10 -mr-2 inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          <span className="sr-only">Unread — </span>
          <span className="hidden sm:inline">Mark read</span>
        </button>
      )}
    </li>
  );
}
