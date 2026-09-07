import { useMemo, useState } from 'react';
import { Copy, ExternalLink, ArrowUpRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SimpleModal from '@/components/ui/SimpleModal';
import { useToast } from '@/components/ui/use-toast';
import { platformById } from '@/lib/social-platforms';
import { validatePlatformUrl } from '@/lib/social-tracker';
import PlatformIcon from './PlatformIcon';

// Manual publishing flow (§20): copy caption → open the platform → paste the
// live URL → mark as published. Razekit never claims it published the content.
export default function PublishDialog({ post, onClose, onSaved }) {
  const { toast } = useToast();
  const [url, setUrl] = useState(post?.live_url || '');
  const [saving, setSaving] = useState(false);
  const open = !!post;
  const p = post ? platformById(post.platform) : null;
  const check = useMemo(() => (url ? validatePlatformUrl(post?.platform, url) : null), [url, post?.platform]);

  if (!post) return null;

  const publish = async () => {
    if (!check?.valid) return;
    setSaving(true);
    try {
      await base44.entities.SocialCampaignPost.update(post.id, {
        live_url: url.trim(),
        status: 'PUBLISHED',
        published_at: new Date().toISOString(),
        published_by: 'brand',
        tracking_mode: 'manual',
        last_checked_at: new Date().toISOString(),
      });
      toast({ title: 'Marked as published', description: `Recorded as manually published on ${p.name}.` });
      onSaved?.();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <SimpleModal open={open} onClose={onClose} title={`Publish on ${p.name}`} subtitle={`${post.content_type || 'Post'} — manual publishing`}>
      <div className="space-y-4">
        <div className="rounded-xl bg-secondary/60 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Publishing checklist</p>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => {
                navigator.clipboard?.writeText([post.caption, post.hashtags].filter(Boolean).join('\n\n') || '');
                toast({ title: 'Caption copied' });
              }}
              className="gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" /> Copy caption
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
            {p.webUrl ? (
              <Button type="button" variant="outline" size="sm" onClick={() => window.open(p.webUrl, '_blank', 'noopener')} className="gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> Open {p.name}
              </Button>
            ) : <span className="text-muted-foreground">Publish on the platform</span>}
          </div>
          <div className="flex items-start gap-2 text-xs pt-1">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
            <p className="text-muted-foreground leading-relaxed">
              Publish on {p.name}, then paste the live post URL below and mark it as published. Razekit records that <span className="font-semibold text-foreground">you</span> published — it does not publish for you.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="live-url" className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5"><PlatformIcon platform={post.platform} className="w-3.5 h-3.5" /> Live {p.name} post URL</label>
          <Input id="live-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`https://${post.platform === 'x' ? 'x.com' : post.platform + '.com'}/…`} />
          {check && !check.valid && <p className="text-xs text-destructive mt-1.5">{check.message}</p>}
          {check?.valid && <p className="text-xs text-success mt-1.5">Valid {p.name} post URL.</p>}
        </div>

        <Button className="w-full gap-1.5" disabled={!check?.valid || saving} onClick={publish}>
          {saving ? 'Saving…' : 'Mark as Published'} <ArrowUpRight className="w-4 h-4" />
        </Button>
      </div>
    </SimpleModal>
  );
}