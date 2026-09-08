import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, AtSign, TrendingUp, Trophy, Upload, Clock, IndianRupee, Mail, CheckCheck, Bell, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ALLOWED_TYPES, isAllowed, notifLink, timeAgo, groupNotifications, groupedTitle } from '@/lib/notification-utils';
import InvitationCard from '@/components/notifications/InvitationCard';
import { MotionList, MotionChild } from '@/components/ui/PageFade';
import { SegmentedTabs } from '@/components/ui/PageHeader';
import AlertState from '@/components/alerts/AlertState';

const ICON = {
  post_liked: { icon: Heart, cls: 'text-rose-500', bg: 'bg-rose-500/10' }, post_commented: { icon: MessageCircle, cls: 'text-blue-500', bg: 'bg-blue-500/10' }, comment_replied: { icon: MessageCircle, cls: 'text-blue-500', bg: 'bg-blue-500/10' }, user_mentioned: { icon: AtSign, cls: 'text-violet-500', bg: 'bg-violet-500/10' }, post_trending: { icon: TrendingUp, cls: 'text-orange-500', bg: 'bg-orange-500/10' }, contest_invitation: { icon: Mail, cls: 'text-primary', bg: 'bg-primary/10' }, submission_uploaded: { icon: Upload, cls: 'text-primary', bg: 'bg-primary/10' }, contest_submission_received: { icon: Upload, cls: 'text-primary', bg: 'bg-primary/10' }, shortlisted: { icon: Sparkles, cls: 'text-violet-500', bg: 'bg-violet-500/10' }, contest_win: { icon: Trophy, cls: 'text-amber-500', bg: 'bg-amber-500/10' }, winner_announced: { icon: Trophy, cls: 'text-amber-500', bg: 'bg-amber-500/10' }, deadline_tomorrow: { icon: Clock, cls: 'text-orange-500', bg: 'bg-orange-500/10' }, contest_ended: { icon: Trophy, cls: 'text-amber-500', bg: 'bg-amber-500/10' }, footage_approved: { icon: CheckCheck, cls: 'text-emerald-500', bg: 'bg-emerald-500/10' }, contest_joined: { icon: Trophy, cls: 'text-primary', bg: 'bg-primary/10' }, payment_received: { icon: IndianRupee, cls: 'text-emerald-500', bg: 'bg-emerald-500/10' }, withdraw_completed: { icon: IndianRupee, cls: 'text-emerald-500', bg: 'bg-emerald-500/10' },
};

const FILTERS = [{ k: 'all', label: 'All' }, { k: 'social', label: 'Social' }, { k: 'context', label: 'Contest' }, { k: 'money', label: 'Money' }];

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const user = await base44.auth.me().catch(() => null);
      if (!user) { setItems([]); return; }
      const list = await base44.entities.Notification.filter({ recipient_user_id: user.id }, '-created_date', 100).catch(() => []);
      setItems(Array.isArray(list) ? list : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const allowed = items.filter((n) => isAllowed(n.type));
  const grouped = useMemo(() => groupNotifications(allowed), [allowed]);
  const filtered = grouped.filter((n) => filter === 'all' || (filter === 'social' ? ALLOWED_TYPES.social.includes(n.type) : filter === 'context' ? ALLOWED_TYPES.context.includes(n.type) : ALLOWED_TYPES.money.includes(n.type)));
  const unread = allowed.filter((n) => !n.read).length;
  const actionRequired = allowed.filter((n) => !n.read && ['payment_received', 'deadline_tomorrow', 'contest_invitation', 'shortlisted', 'contest_win', 'submission_uploaded', 'contest_submission_received'].includes(n.type)).length;

  const markAllRead = async () => {
    const unreadItems = items.filter((n) => !n.read);
    await Promise.all(unreadItems.map((n) => base44.entities.Notification.update(n.id, { read: true }).catch(() => null)));
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };
  const markRead = (n) => {
    if (n.read) return;
    base44.entities.Notification.update(n.id, { read: true }).catch(() => {});
    setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
  };
  const onRowClick = (n) => { markRead(n); const link = notifLink(n); if (link) navigate(link); };

  return (
    <div className="page-shell pb-10">
      <div className="max-w-4xl mx-auto space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-primary">Activity center</p><h1 className="mt-1 font-heading text-2xl md:text-3xl font-bold tracking-tight">Notifications</h1><p className="mt-1 text-sm text-muted-foreground">Important contest, submission, winner and payment events in one place.</p></div>
          {unread > 0 && <button type="button" onClick={markAllRead} className="rz-secondary-action inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"><CheckCheck className="w-4 h-4" /> Mark all read</button>}
        </header>

        <div className="flex flex-wrap items-center gap-2"><SegmentedTabs tabs={FILTERS.map((f) => ({ key: f.k, label: f.label }))} value={filter} onChange={setFilter} size="sm" />{unread > 0 && <span className="rz-status rz-status--info">{unread} unread</span>}{actionRequired > 0 && <span className="rz-status rz-status--warning">{actionRequired} action required</span>}</div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 surface animate-pulse" />)}</div>
        ) : filtered.length > 0 ? (
          <MotionList className="space-y-1.5">
            {filtered.map((n) => {
              if (n.type === 'contest_invitation') return <InvitationCard key={n.id} n={n} />;
              const cfg = ICON[n.type] || { icon: Bell, cls: 'text-muted-foreground', bg: 'bg-secondary' };
              const Icon = cfg.icon;
              const link = notifLink(n);
              const urgent = !n.read && ['payment_received', 'deadline_tomorrow', 'shortlisted', 'contest_win'].includes(n.type);
              const inner = <><div className={`w-9 h-9 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}><Icon className={`w-4 h-4 ${cfg.cls}`} /></div><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><p className="text-sm leading-snug font-medium">{groupedTitle(n)}</p>{urgent && <span className="rz-status rz-status--warning">Action</span>}</div>{n.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.description}</p>}</div><div className="flex items-center gap-2 shrink-0"><span className="text-[10px] text-muted-foreground">{timeAgo(n.created_date)}</span>{!n.read && <span className="w-2 h-2 rounded-full bg-primary" aria-label="Unread" />}</div></>;
              const cls = `flex items-center gap-3 rounded-xl p-3 border text-left transition-all ${n.read ? 'surface' : 'surface bg-primary/[0.035] ring-1 ring-primary/10'}`;
              return <MotionChild key={n.id}>{link ? <button onClick={() => onRowClick(n)} className={`${cls} w-full hover:shadow-elev-1`} aria-label={`${groupedTitle(n)}${n.read ? '' : ', unread'}`}>{inner}</button> : <div className={cls}>{inner}</div>}</MotionChild>;
            })}
          </MotionList>
        ) : <AlertState type="empty" shape="circle" title="All caught up" description="There are no notifications in this category right now." className="mt-8" />}
      </div>
    </div>
  );
}
