import { useEffect, useState } from 'react';
import { History, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SimpleModal from '@/components/ui/SimpleModal';
import { useToast } from '@/components/ui/use-toast';
import { METRIC_DEFS, platformById } from '@/lib/social-platforms';
import { buildMetricUpdate, safeJson, timeAgo } from '@/lib/social-tracker';

// Manual metric entry (§22–§26): only the platform's supported metrics are
// editable, every save appends a real snapshot, and history shows actual data only.
export default function MetricsDialog({ post, onClose, onSaved }) {
  const { toast } = useToast();
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const p = post ? platformById(post.platform) : null;

  useEffect(() => {
    if (post) setValues(safeJson(post.metrics, {}));
  }, [post]);

  if (!post) return null;
  const history = safeJson(post.metric_history, []);

  const save = async () => {
    setSaving(true);
    try {
      const update = buildMetricUpdate(post, values, post.tracking_mode === 'auto' ? 'api' : 'manual');
      await base44.entities.SocialCampaignPost.update(post.id, {
        ...update,
        status: post.status === 'PUBLISHED' ? 'TRACKING' : post.status,
      });
      toast({ title: 'Metrics updated', description: 'Snapshot saved to the performance timeline.' });
      onSaved?.();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <SimpleModal open onClose={onClose} title={`${p.name} performance`} subtitle={`${post.content_type || 'Post'} · manual tracking`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {p.metrics.map((key) => (
            <div key={key}>
              <label htmlFor={`m-${key}`} className="text-xs font-semibold text-muted-foreground mb-1 block">{METRIC_DEFS[key]}</label>
              <Input
                id={`m-${key}`}
                type="number" min="0" step="any"
                value={values[key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                placeholder="Not tracked"
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Enter real values from {p.name}. Empty fields stay “Not tracked” — Razekit never fills in numbers for you.
        </p>

        {history.length > 0 && (
          <div className="rounded-xl bg-secondary/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Performance timeline — actual snapshots</p>
            <div className="space-y-1.5">
              {[...history].reverse().slice(0, 4).map((snap, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{timeAgo(snap.at)}</span>
                  {' · '}
                  {Object.entries(snap.values || {}).filter(([, v]) => v != null).slice(0, 3)
                    .map(([k, v]) => `${METRIC_DEFS[k]} ${v.toLocaleString('en-IN')}`).join(' · ') || 'No values'}
                </p>
              ))}
            </div>
          </div>
        )}

        <Button className="w-full" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save snapshot'}</Button>
      </div>
    </SimpleModal>
  );
}