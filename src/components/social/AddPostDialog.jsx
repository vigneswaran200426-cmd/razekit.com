import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SimpleModal from '@/components/ui/SimpleModal';
import { useToast } from '@/components/ui/use-toast';
import { SOCIAL_PLATFORMS, platformById } from '@/lib/social-platforms';
import { CONTENT_SOURCE_LABELS } from '@/lib/social-tracker';
import PlatformIcon from './PlatformIcon';

const inputCls = 'w-full rounded-xl border border-border bg-white/70 backdrop-blur-sm px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

// Create a planned social post for a contest destination. Prefills from the
// approved winner content when it exists (§15 — no manual campaign re-entry).
export default function AddPostDialog({ open, onClose, contests = [], winnerPublishes = [], onCreated }) {
  const { toast } = useToast();
  const [contestId, setContestId] = useState('');
  const [platform, setPlatform] = useState('instagram');
  const [contentType, setContentType] = useState(SOCIAL_PLATFORMS[0].contentTypes[0]);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [contentSource, setContentSource] = useState('winner_content');
  const [saving, setSaving] = useState(false);

  const contest = contests.find((c) => c.id === contestId);
  const wp = useMemo(() => winnerPublishes.find((w) => w.contest_id === contestId), [winnerPublishes, contestId]);
  const p = platformById(platform);

  const pickContest = (id) => {
    setContestId(id);
    const w = winnerPublishes.find((x) => x.contest_id === id);
    if (w) { setTitle(w.title || ''); setCaption(w.caption || ''); }
  };

  const create = async () => {
    if (!contestId || !title.trim()) return;
    setSaving(true);
    try {
      await base44.entities.SocialCampaignPost.create({
        client_id: contest.created_by_id,
        contest_id: contestId,
        creator_id: contest.winner_user_id || '',
        winner_publish_id: wp?.id || '',
        platform,
        content_type: contentType,
        title: title.trim(),
        caption,
        content_source: contentSource,
        media_uri: wp?.media_uri || '',
        thumbnail_url: wp?.thumbnail_url || '',
        status: wp ? 'APPROVED' : 'PLANNED',
        tracking_mode: 'manual',
      });
      toast({ title: 'Social post added', description: `Planned for ${p.name}. Publish it when the content is ready.` });
      onCreated?.();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <SimpleModal open={open} onClose={onClose} title="Add social destination" subtitle="Track where this campaign's content goes">
      <div className="space-y-3.5">
        <div>
          <label htmlFor="ap-contest" className="text-xs font-semibold text-muted-foreground mb-1 block">Contest</label>
          <select id="ap-contest" className={inputCls} value={contestId} onChange={(e) => pickContest(e.target.value)}>
            <option value="">Select a contest…</option>
            {contests.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ap-platform" className="text-xs font-semibold text-muted-foreground mb-1 block">Platform</label>
            <select id="ap-platform" className={inputCls} value={platform} onChange={(e) => { setPlatform(e.target.value); setContentType(platformById(e.target.value).contentTypes[0]); }}>
              {SOCIAL_PLATFORMS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ap-type" className="text-xs font-semibold text-muted-foreground mb-1 block">Content type</label>
            <select id="ap-type" className={inputCls} value={contentType} onChange={(e) => setContentType(e.target.value)}>
              {p.contentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="ap-source" className="text-xs font-semibold text-muted-foreground mb-1 block">Content source</label>
          <select id="ap-source" className={inputCls} value={contentSource} onChange={(e) => setContentSource(e.target.value)}>
            {Object.entries(CONTENT_SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {wp && contentSource === 'winner_content' && <p className="text-[11px] text-success mt-1">Prefilled from the approved winner content.</p>}
        </div>
        <div>
          <label htmlFor="ap-title" className="text-xs font-semibold text-muted-foreground mb-1 block">Content label</label>
          <Input id="ap-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bali Reel — Instagram" />
        </div>
        <div>
          <label htmlFor="ap-caption" className="text-xs font-semibold text-muted-foreground mb-1 block">Caption</label>
          <textarea id="ap-caption" className={`${inputCls} min-h-20`} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Post caption / copy" />
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <PlatformIcon platform={platform} className="w-3.5 h-3.5" /> Tracking mode: Manual — you publish, paste the live URL, and enter metrics.
        </p>
        <Button className="w-full" disabled={!contestId || !title.trim() || saving} onClick={create}>{saving ? 'Adding…' : 'Add to social tracker'}</Button>
      </div>
    </SimpleModal>
  );
}