import { Link } from 'react-router-dom';
import { ExternalLink, TrendingUp, ArrowUpRight } from 'lucide-react';
import StatusPill from '@/components/ui/StatusPill';
import PlatformIcon from './PlatformIcon';
import {
  PUBLISHED_LIKE, SOCIAL_POST_STATE_LABELS, SOCIAL_POST_STATE_TONES,
  engagementOf, formatMetric, getPostMetric, timeAgo,
} from '@/lib/social-tracker';

// Metric semantics: real value / "Not tracked" / "—" (not available on platform).
function MetricCell({ result, suffix = '' }) {
  if (result.state === 'available') return <span className="font-semibold">{formatMetric(result.value)}{suffix}</span>;
  if (result.state === 'not_tracked') return <span className="text-muted-foreground/70 text-xs">Not tracked</span>;
  return <span className="text-muted-foreground/40">—</span>;
}

function Actions({ post, onPublish, onMetrics }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {post.live_url && (
        <a href={post.live_url} target="_blank" rel="noopener" aria-label="Open live post" className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
      {!PUBLISHED_LIKE.includes(post.status) && !['REMOVED', 'ARCHIVED'].includes(post.status) && (
        <button onClick={() => onPublish(post)} className="text-xs font-semibold text-primary hover:underline">Publish</button>
      )}
      {PUBLISHED_LIKE.includes(post.status) && (
        <button onClick={() => onMetrics(post)} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> Update
        </button>
      )}
      <Link to={`/contest/${post.contest_id}`} className="text-xs text-muted-foreground hover:text-foreground" aria-label="Open contest">View</Link>
    </div>
  );
}

// Professional data table (§30) — desktop. Mobile gets stacked cards.
export default function PostTable({ posts, contestsById, creatorsById, onPublish, onMetrics }) {
  return (
    <div className="glass-card rounded-2xl overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
            <th className="px-4 py-3 font-semibold">Content</th>
            <th className="px-3 py-3 font-semibold">Platform</th>
            <th className="px-3 py-3 font-semibold">Creator</th>
            <th className="px-3 py-3 font-semibold">Status</th>
            <th className="px-3 py-3 font-semibold">Published</th>
            <th className="px-3 py-3 font-semibold">Views</th>
            <th className="px-3 py-3 font-semibold">Engagement</th>
            <th className="px-3 py-3 font-semibold">Updated</th>
            <th className="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
              <td className="px-4 py-3">
                <p className="font-medium truncate max-w-56">{post.title || 'Untitled post'}</p>
                <p className="text-xs text-muted-foreground truncate max-w-56">{contestsById[post.contest_id]?.title || '—'}</p>
              </td>
              <td className="px-3 py-3">
                <span className="inline-flex items-center gap-1.5"><PlatformIcon platform={post.platform} className="w-3.5 h-3.5" />{post.content_type || ''}</span>
              </td>
              <td className="px-3 py-3 text-xs text-muted-foreground">{creatorsById[post.creator_id]?.display_name || creatorsById[post.creator_id]?.username || '—'}</td>
              <td className="px-3 py-3"><StatusPill tone={SOCIAL_POST_STATE_TONES[post.status]}>{SOCIAL_POST_STATE_LABELS[post.status]}</StatusPill></td>
              <td className="px-3 py-3 text-xs text-muted-foreground">{post.published_at ? timeAgo(post.published_at) : '—'}</td>
              <td className="px-3 py-3"><MetricCell result={getPostMetric(post, 'views')} /></td>
              <td className="px-3 py-3"><MetricCell result={engagementOf(post)} suffix="%" /></td>
              <td className="px-3 py-3 text-xs text-muted-foreground">{timeAgo(post.last_checked_at)}</td>
              <td className="px-4 py-3"><Actions post={post} onPublish={onPublish} onMetrics={onMetrics} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Compact card list (§31) — small screens.
export function PostCards({ posts, contestsById, creatorsById, onPublish, onMetrics }) {
  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <div key={post.id} className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><PlatformIcon platform={post.platform} className="w-3.5 h-3.5" /> {post.content_type || platformLabel(post)}</span>
            <StatusPill tone={SOCIAL_POST_STATE_TONES[post.status]}>{SOCIAL_POST_STATE_LABELS[post.status]}</StatusPill>
          </div>
          <p className="font-heading font-semibold text-sm mt-1.5 truncate">{post.title || 'Untitled post'}</p>
          <p className="text-xs text-muted-foreground truncate">{contestsById[post.contest_id]?.title || ''}{creatorsById[post.creator_id]?.display_name ? ` · ${creatorsById[post.creator_id].display_name}` : ''}</p>
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border/50">
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Views</p><p className="text-sm"><MetricCell result={getPostMetric(post, 'views')} /></p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Engagement</p><p className="text-sm"><MetricCell result={engagementOf(post)} suffix="%" /></p></div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-muted-foreground">Updated {timeAgo(post.last_checked_at)}</span>
            <div className="flex items-center gap-2">
              {post.live_url && (
                <a href={post.live_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">View post <ArrowUpRight className="w-3 h-3" /></a>
              )}
              {!PUBLISHED_LIKE.includes(post.status) && !['REMOVED', 'ARCHIVED'].includes(post.status) && (
                <button onClick={() => onPublish(post)} className="text-xs font-semibold text-primary hover:underline">Publish</button>
              )}
              {PUBLISHED_LIKE.includes(post.status) && (
                <button onClick={() => onMetrics(post)} className="text-xs font-semibold text-primary hover:underline">Update</button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const platformLabel = (post) => post.platform;