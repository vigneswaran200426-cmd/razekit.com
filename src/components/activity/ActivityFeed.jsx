import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, IndianRupee, Star, FileVideo, CheckCircle2, Bell } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import GlassCard from '@/components/ui/GlassCard';
import { timeAgo } from '@/lib/social-tracker';

// Real activity feed — the user's own notification records, newest first.
// Each row links into the workflow it refers to.
const ICONS = {
  contest_win: Trophy, winner_announced: Trophy,
  payment_received: IndianRupee, withdraw_completed: IndianRupee,
  shortlisted: Star,
  submission_uploaded: FileVideo, contest_submission_received: FileVideo,
  footage_approved: CheckCircle2, winner_content_submitted: FileVideo,
};

export default function ActivityFeed({ limit = 5 }) {
  const { user } = useAuth();
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (!user?.id) { setItems([]); return; }
    base44.entities.Notification.filter({ recipient_user_id: user.id }, '-created_date', limit)
      .then((list) => setItems(list))
      .catch(() => setItems([]));
  }, [user?.id, limit]);

  if (items === null) {
    return <div className="glass-card rounded-2xl p-5 space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-xl bg-secondary/60 animate-pulse" />)}</div>;
  }
  if (!items.length) {
    return <GlassCard className="p-5"><p className="text-sm text-muted-foreground text-center">No activity yet — it will appear here as things happen.</p></GlassCard>;
  }
  return (
    <GlassCard className="p-2">
      {items.map((n) => {
        const Icon = ICONS[n.type] || Bell;
        const to = n.contest_id ? `/contest/${n.contest_id}` : (n.related_submission_id ? '/my-contests' : null);
        const body = (
          <>
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{n.title}</p>
              {n.description && <p className="text-xs text-muted-foreground truncate">{n.description}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] text-muted-foreground">{timeAgo(n.created_date)}</p>
            </div>
          </>
        );
        return to ? (
          <Link key={n.id} to={to} className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/60 transition-colors">{body}</Link>
        ) : (
          <div key={n.id} className="flex items-center gap-3 p-3">{body}</div>
        );
      })}
    </GlassCard>
  );
}