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
  post_liked: { icon: Heart, cls: 'text-rose-500', bg: 'bg-rose-500/10' },
  post_commented: { icon: MessageCircle, cls: 'text-blue-500', bg: 'bg-blue-500/10' },
  comment_replied: { icon: MessageCircle, cls: 'text-blue-500', bg: 'bg-blue-500/10' },
  user_mentioned: { icon: AtSign, cls: 'text-violet-500', bg: 'bg-violet-500/10' },
  post_trending: { icon: TrendingUp, cls: 'text-orange-500', bg: 'bg-orange-500/10' },
  contest_invitation: { icon: Mail, cls: 'text-accent', bg: 'bg-accent/10' },
  submission_uploaded: { icon: Upload, cls: 'text-blue-500', bg: 'bg-blue-500/10' },
  contest_submission_received: { icon: Upload, cls: 'text-blue-500', bg: 'bg-blue-500/10' },
  shortlisted: { icon: Sparkles, cls: 'text-violet-500', bg: 'bg-violet-500/10' },
  contest_win: { icon: Trophy, cls: 'text-amber-500', bg: 'bg-amber-500/10' },
  winner_announced: { icon: Trophy, cls: 'text-amber-500', bg: 'bg-amber-500/10' },
  deadline_tomorrow: { icon: Clock, cls: 'text-orange-500', bg: 'bg-orange-500/10' },
  contest_ended: { icon: Trophy, cls: 'text-amber-500', bg: 'bg-amber-500/10' },
  footage_approved: { icon: CheckCheck, cls: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  contest_joined: { icon: Trophy, cls: 'text-primary', bg: 'bg-primary/10' },
  payment_received: { icon: IndianRupee, cls: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  withdraw_completed: { icon: IndianRupee, cls: 'text-emerald-500', bg: 'bg-emerald-500/10' },
};

const FILTERS = [
  { k: 'all', label: 'All' },
  { k: 'social', label: 'Social' },
  { k: 'context', label: 'Contest' },
  { k: 'money', label: 'Money' },
];

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try {
      const user = await base44.auth.me().catch(() => null);
      if (!user) { setItems([]); return; }
      const list = await base44.entities.Notification.filter({ recipient_user_id: user.id }, '-created_date', 100).catch(() => []);
      setItems(list);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const allowed = items.filter((n) => isAllowed(n.type));
  const grouped = useMemo(() => groupNotifications(allowed), [allowed]);
  const filtered = grouped.filter((n) => {
    if (filter === 'all') return true;
    if (filter === 'social') return ALLOWED_TYPES.social.includes(n.type);
    if (filter === 'context') return ALLOWED_TYPES.context.includes(n.type);
    if (filter === 'money') return ALLOWED_TYPES.money.includes(n.type);
    return true;
  });
  const unread = allowed.filter((n) => !n.read).length;

  const markAllRead = () => {
    items.filter((n) => !n.read).forEach((n) => base44.entities.Notification.update(n.id, { read: true }).catch(() => {}));
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };
  const markRead = (n) => {
    if (n.read) return;
    base44.entities.Notification.update(n.id, { read: true }).catch(() => {});
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
  };
  const onRowClick = (n) => {
    markRead(n);
    const link = notifLink(n);
    if (link) navigate(link);
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-8">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-bold">Notifications</h1>
          {unread > 0 && <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">{unread}</span>}
        </div>
        <div className="flex items-center gap-1">
          {unread > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 text-xs text-primary hover:underline px-2 py-1">
              <CheckCheck className="w-4 h-4" /> Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="mb-4">
        <SegmentedTabs tabs={FILTERS.map((f) => ({ key: f.k, label: f.label }))} value={filter} onChange={setFilter} size="sm" />
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-14 glass-card rounded-xl animate-pulse" />)}</div>
      ) : filtered.length > 0 ? (
        <MotionList className="space-y-1.5">
          {filtered.map((n) => {
            if (n.type === 'contest_invitation') return <InvitationCard key={n.id} n={n} />;
            const cfg = ICON[n.type] || { icon: Bell, cls: 'text-muted-foreground', bg: 'bg-secondary' };
            const Icon = cfg.icon;
            const link = notifLink(n);
            const inner = (
              <>
                <div className={`w-9 h-9 rounded-full ${cfg.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 ${cfg.cls}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{groupedTitle(n)}</p>
                  {n.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{n.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{timeAgo(n.created_date)}</span>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-primary" />}
                </div>
              </>
            );
            const cls = `flex items-center gap-3 rounded-xl p-2.5 border text-left transition-colors ${n.read ? 'glass-card' : 'glass-card bg-primary/[0.04] ring-1 ring-primary/15'}`;
            return (
              <MotionChild key={n.id}>
                {link ? (
                  <button onClick={() => onRowClick(n)} className={`${cls} w-full hover:shadow-glass-lg`}>{inner}</button>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </MotionChild>
            );
          })}
        </MotionList>
      ) : (
        <AlertState type="empty" shape="circle" title="All caught up" description="No new notifications. Money and deadlines will interrupt." className="mt-8" />
      )}
    </div>
  );
}