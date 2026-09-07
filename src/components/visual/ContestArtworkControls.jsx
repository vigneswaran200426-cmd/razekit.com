import { useRef, useState } from 'react';
import { RefreshCw, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useVisualAsset from '@/hooks/useVisualAsset';
import {
  ASSET_TYPE_LABELS,
  regenerateVisualAsset,
  uploadCustomVisualAsset,
} from '@/lib/visual-assets/client';
import { useToast } from '@/components/ui/use-toast';

const STATUS_PILL = {
  ready: 'bg-success/10 text-success',
  custom_active: 'bg-primary/10 text-primary',
  failed: 'bg-destructive/10 text-destructive',
  processing: 'bg-warning/10 text-warning',
};

function ArtworkRow({ entityType, entityId, assetType, onChanged }) {
  const { status, version } = useVisualAsset(entityType, entityId, assetType);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const { toast } = useToast();

  const handleRegenerate = async () => {
    setBusy(true);
    try {
      const res = await regenerateVisualAsset(entityType, entityId, assetType);
      if (res?.ok) toast({ title: `${ASSET_TYPE_LABELS[assetType] || assetType} regenerated`, description: `Version ${res.version} is now live` });
      else toast({ title: 'Generation failed', description: res?.error || 'Please try again or contact support.', variant: 'destructive' });
      onChanged?.();
    } catch (e) {
      toast({ title: 'Generation failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await uploadCustomVisualAsset(entityType, entityId, assetType, file);
      toast({ title: 'Custom artwork uploaded', description: 'Your artwork is now live. Automatic generation will not overwrite it.' });
      onChanged?.();
    } catch (err) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{ASSET_TYPE_LABELS[assetType] || assetType}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {status && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_PILL[status] || 'bg-secondary text-muted-foreground'}`}>
              {status === 'custom_active' ? 'Custom' : status === 'ready' ? 'AI generated' : status}
            </span>
          )}
          {version != null && <span className="text-[11px] text-muted-foreground">v{version}</span>}
          {busy && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={busy}>
        <RefreshCw className="w-3.5 h-3.5" /> Regenerate
      </Button>
      <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
        <Upload className="w-3.5 h-3.5" /> Upload
      </Button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  );
}

// ContestArtworkControls — Brand control over an entity's artwork:
// view current state, regenerate (new version), or upload custom artwork.
// Rendered only for the entity owner.
export default function ContestArtworkControls({ entityType, entityId, assetTypes = ['CONTEST_THUMBNAIL', 'CONTEST_HERO'] }) {
  return (
    <div className="glass-card rounded-2xl p-4 mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Contest Artwork</h3>
      <p className="text-[11px] text-muted-foreground mb-1">AI artwork updates instantly across the marketplace. Custom uploads are never overwritten.</p>
      <div className="divide-y divide-border/60">
        {assetTypes.map((at) => (
          <ArtworkRow key={at} entityType={entityType} entityId={entityId} assetType={at} />
        ))}
      </div>
    </div>
  );
}