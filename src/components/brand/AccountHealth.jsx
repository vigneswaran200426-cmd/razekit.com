import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { SOCIAL_PLATFORMS, SOCIAL_CONNECTIONS_LIVE } from '@/lib/social-platforms';
import { timeAgo } from '@/lib/social-tracker';
import GlassCard from '@/components/ui/GlassCard';
import PlatformIcon from '@/components/social/PlatformIcon';

// Account health (§40): connection state per platform — only claims a
// connection when a real connected account record exists.
export default function AccountHealth({ connections = [] }) {
  return (
    <GlassCard className="p-2">
      {SOCIAL_PLATFORMS.filter((p) => p.id !== 'other').map((p) => {
        const conn = connections.find((c) => c.provider === p.id && c.owner_type === 'client');
        let tone = 'text-muted-foreground';
        let label = 'Manual tracking';
        let sub = 'Enter live URLs and metrics yourself';
        if (conn?.status === 'connected') {
          tone = 'text-success font-semibold';
          label = 'Connected';
          sub = `Last sync ${timeAgo(conn.last_synced_at)}`;
        } else if (conn?.status === 'error') {
          tone = 'text-[#D78C05] font-semibold';
          label = 'Needs reauthorization';
          sub = conn.sync_error || 'Reconnect this account';
        } else if (conn) {
          label = 'Not connected';
          sub = SOCIAL_CONNECTIONS_LIVE ? 'Connect this account' : 'Manual tracking available';
        }
        return (
          <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl">
            <span className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0"><PlatformIcon platform={p.id} className="w-4 h-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{p.name}{conn?.username ? <span className="text-muted-foreground font-normal"> · {conn.username}</span> : ''}</p>
              <p className="text-[11px] text-muted-foreground truncate">{sub}</p>
            </div>
            <span className={`text-xs ${tone} shrink-0`}>{label}</span>
          </div>
        );
      })}
      <Link to="/social-accounts" className="flex items-center gap-1 p-3 text-xs font-semibold text-primary hover:underline">Manage accounts <ArrowRight className="w-3 h-3" /></Link>
    </GlassCard>
  );
}