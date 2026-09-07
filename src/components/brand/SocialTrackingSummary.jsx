import { Link } from 'react-router-dom';
import { ArrowRight, Share2 } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import PlatformIcon from '@/components/social/PlatformIcon';
import { PUBLISHED_LIKE } from '@/lib/social-tracker';

/*
  Compact social tracking summary for the Brand Dashboard — real counts from
  SocialCampaignPost records only, grouped per platform. Detailed tracking
  lives on the Social Tracker page; account/connection diagnostics live in
  Settings → Social Accounts. Never fabricated metrics, never health states.
*/
export default function SocialTrackingSummary({ posts = [] }) {
  const byPlatform = new Map();
  posts.forEach((p) => {
    const entry = byPlatform.get(p.platform) || { platform: p.platform, published: 0, pending: 0 };
    if (PUBLISHED_LIKE.includes(p.status)) entry.published += 1;
    else entry.pending += 1;
    byPlatform.set(p.platform, entry);
  });
  const rows = [...byPlatform.values()];

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="font-heading font-semibold text-sm">Social Tracking</p>
        <Link to="/social" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          View Social Tracker <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {rows.length ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {rows.map((r) => (
            <div key={r.platform} className="flex items-center gap-2.5 rounded-xl bg-secondary/50 px-3 py-2.5">
              <span className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shrink-0">
                <PlatformIcon platform={r.platform} className="w-3.5 h-3.5" />
              </span>
              <span className="font-medium capitalize text-sm">{r.platform}</span>
              <span className="ml-auto text-xs text-muted-foreground text-right">
                {r.published} published{r.pending ? ` · ${r.pending} pending` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Share2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Published winner content and campaign posts will appear here per platform.
        </p>
      )}
    </GlassCard>
  );
}