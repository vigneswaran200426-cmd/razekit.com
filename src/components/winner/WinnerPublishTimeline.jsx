import { useEffect, useState } from 'react';
import { Check, Trophy, Upload, Star, Sparkles, Circle } from 'lucide-react';
import { WP_STATUS } from '@/lib/winner-publish';

// Shared post-contest timeline — each role sees the same honest progress,
// with only its own next action highlighted.
// stageStates: computed by callers from contest + winner publish record.
export function computeWinnerStages({ contest, publish }) {
  const paymentConfirmed = contest?.status === 'completed';
  const st = publish?.status;
  const stages = [
    { key: 'winner', label: 'Winner Selected', done: !!contest?.winner_user_id },
    { key: 'payment', label: 'Prize Confirmed', done: paymentConfirmed },
    {
      key: 'content',
      label: 'Winner Content Submitted',
      done: [WP_STATUS.SUBMITTED, WP_STATUS.APPROVED, WP_STATUS.PROCESSING, WP_STATUS.PUBLISHED].includes(st),
      active: st === WP_STATUS.REVISION_REQUESTED,
      revision: st === WP_STATUS.REVISION_REQUESTED,
    },
    {
      key: 'approval',
      label: 'Brand Approval',
      done: [WP_STATUS.APPROVED, WP_STATUS.PROCESSING, WP_STATUS.PUBLISHED].includes(st),
      active: st === WP_STATUS.SUBMITTED,
    },
    {
      key: 'published',
      label: 'Winners Hub Published',
      done: st === WP_STATUS.PUBLISHED,
      active: st === WP_STATUS.PROCESSING,
    },
  ];
  const activeIdx = stages.findIndex((s) => s.active);
  const firstUndone = stages.findIndex((s) => !s.done && !s.active);
  stages.forEach((s, i) => {
    if (!s.done && !s.active) s.active = i === firstUndone;
    if (s.done) s.active = false;
    if (activeIdx >= 0 && !s.done && i !== activeIdx) s.active = false;
  });
  return stages;
}

export default function WinnerPublishTimeline({ contest, publish, role }) {
  const stages = computeWinnerStages({ contest, publish });
  return (
    <div className="glass-card rounded-2xl p-4 animate-fade-in">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Contest Completion</p>
      <ol className="space-y-2.5">
        {stages.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-sm">
            {s.done ? (
              <span className="w-5 h-5 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0"><Check className="w-3 h-3" /></span>
            ) : s.active ? (
              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0"><Circle className="w-2.5 h-2.5 fill-primary text-primary" /></span>
            ) : (
              <span className="w-5 h-5 rounded-full border-2 border-border shrink-0" />
            )}
            <span className={s.done ? 'text-foreground font-medium' : s.active ? 'text-foreground font-semibold' : 'text-muted-foreground'}>
              {s.label}
            </span>
            {s.revision && (
              <span className="text-[10px] font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full">Revision requested</span>
            )}
            {role === 'creator' && s.key === 'content' && s.active && !s.revision && (
              <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full ml-auto">Your step</span>
            )}
            {role === 'client' && s.key === 'approval' && s.active && (
              <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full ml-auto">Your step</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Status pill for winner publish records.
export function WinnerPublishStatusPill({ status }) {
  const map = {
    [WP_STATUS.WINNER_SELECTED]: { label: 'Awaiting prize confirmation', cls: 'bg-secondary text-muted-foreground' },
    [WP_STATUS.CONTENT_REQUESTED]: { label: 'Winner content requested', cls: 'bg-primary/10 text-primary' },
    [WP_STATUS.SUBMITTED]: { label: 'Awaiting brand approval', cls: 'bg-warning/10 text-[#D78C05]' },
    [WP_STATUS.REVISION_REQUESTED]: { label: 'Revision requested', cls: 'bg-warning/10 text-[#D78C05]' },
    [WP_STATUS.APPROVED]: { label: 'Approved', cls: 'bg-success/10 text-success' },
    [WP_STATUS.PROCESSING]: { label: 'Preparing for Winners Hub', cls: 'bg-primary/10 text-primary' },
    [WP_STATUS.PUBLISHED]: { label: 'Published', cls: 'bg-success/10 text-success' },
    [WP_STATUS.ARCHIVED]: { label: 'Archived', cls: 'bg-secondary text-muted-foreground' },
  };
  const s = map[status] || { label: status, cls: 'bg-secondary text-muted-foreground' };
  return <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>;
}

// Role-aware "next step" summary used by creator + client winner screens.
export function nextStepCopy({ publish, role }) {
  const st = publish?.status;
  if (role === 'creator') {
    switch (st) {
      case WP_STATUS.WINNER_SELECTED:
        return { icon: Trophy, title: 'Prize confirmation in progress', body: 'Your winner content task opens once the prize is confirmed.' };
      case WP_STATUS.CONTENT_REQUESTED:
        return { icon: Upload, title: 'Your next step: upload winning work', body: 'Showcase the work that won — upload it for Winners Hub.' };
      case WP_STATUS.REVISION_REQUESTED:
        return { icon: Upload, title: 'Your next step: apply brand changes', body: 'The brand requested changes before publishing.' };
      case WP_STATUS.SUBMITTED:
        return { icon: Star, title: 'Waiting for brand approval', body: 'Your winning work is with the brand for review.' };
      case WP_STATUS.PROCESSING:
        return { icon: Sparkles, title: 'Preparing your winning work...', body: 'Razekit is preparing your Winners Hub entry.' };
      default:
        return null;
    }
  }
  switch (st) {
    case WP_STATUS.SUBMITTED:
      return { icon: Star, title: 'Your next step: review winning content', body: 'The winning creator submitted content for the Winners Hub.' };
    case WP_STATUS.REVISION_REQUESTED:
      return { icon: Sparkles, title: 'Waiting for the creator', body: 'Revision request sent. The creator is updating the content.' };
    case WP_STATUS.PROCESSING:
      return { icon: Sparkles, title: 'Preparing for Winners Hub', body: 'Approved content is being processed.' };
    default:
      return null;
  }
}

// Tiny hook resolving a private media URI into a playable URL.
export function useSignedMediaUrl(uri) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!uri) { setUrl(null); return; }
      if (/^https?:\/\//.test(uri)) { setUrl(uri); return; }
      try {
        const { base44 } = await import('@/api/base44Client');
        const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 });
        if (active) setUrl(signed_url);
      } catch { if (active) setUrl(null); }
    })();
    return () => { active = false; };
  }, [uri]);
  return url;
}