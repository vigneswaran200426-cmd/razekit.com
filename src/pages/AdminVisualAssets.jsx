import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, RotateCcw, Archive, ArchiveRestore, ChevronDown, ChevronRight, Image as ImageIcon, Loader2, DatabaseBackup } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import {
  ASSET_TYPE_LABELS,
  ENTITY_TYPE_LABELS,
  adminVisualAssets,
  archiveVisualAsset,
  restoreVisualAsset,
  retryVisualAsset,
  getVisualAssetStatus,
} from '@/lib/visual-assets/client';
import { useToast } from '@/components/ui/use-toast';

const STATUS_PILL = {
  ready: 'bg-success/10 text-success',
  custom_active: 'bg-primary/10 text-primary',
  failed: 'bg-destructive/10 text-destructive',
  archived: 'bg-muted text-muted-foreground',
  processing: 'bg-warning/10 text-warning',
};

function Stat({ label, value }) {
  return (
    <div className="glass-card rounded-xl p-3.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-heading text-xl font-bold mt-0.5">{value}</p>
    </div>
  );
}

function AssetRow({ asset, onAction }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { toast } = useToast();

  const loadHistory = async () => {
    setOpen(!open);
    if (!open && !history.length) {
      setLoadingHistory(true);
      try {
        const res = await getVisualAssetStatus(asset.entity_type, asset.entity_id, asset.asset_type);
        setHistory(res?.versions || []);
      } catch (e) {} finally { setLoadingHistory(false); }
    }
  };

  const act = async (label, fn) => {
    try {
      await fn();
      toast({ title: label });
      onAction();
    } catch (e) {
      toast({ title: `${label} failed`, description: e.message, variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40">
        <button onClick={loadHistory} className="text-muted-foreground hover:text-foreground shrink-0">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {ENTITY_TYPE_LABELS[asset.entity_type] || asset.entity_type} · {ASSET_TYPE_LABELS[asset.asset_type] || asset.asset_type}
            {asset.is_current && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold">CURRENT</span>}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            v{asset.generation_version} · {asset.provider}/{asset.model} · {asset.origin}
            {asset.error_message ? ` · ${asset.error_message.slice(0, 60)}` : ''}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full font-semibold shrink-0 ${STATUS_PILL[asset.status] || 'bg-secondary text-muted-foreground'}`}>{asset.status}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {asset.status === 'failed' && (
            <Button variant="outline" size="sm" onClick={() => act('Retry queued', () => retryVisualAsset(asset.entity_type, asset.entity_id, asset.asset_type))}>
              <RotateCcw className="w-3.5 h-3.5" /> Retry
            </Button>
          )}
          {asset.status === 'archived' ? (
            <Button variant="ghost" size="sm" onClick={() => act('Restored', () => restoreVisualAsset(asset.id))}>
              <ArchiveRestore className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => act('Archived', () => archiveVisualAsset(asset.id))}>
              <Archive className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div className="px-4 pb-3 pl-12 space-y-1.5">
          {loadingHistory ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading versions…</p>
          ) : (
            history.map((v) => (
              <div key={v.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">v{v.generation_version}</span>
                <span className={`px-1.5 py-0.5 rounded-full ${STATUS_PILL[v.status] || 'bg-secondary'}`}>{v.status}</span>
                <span>{v.provider}{v.error_message ? ` · ${v.error_message.slice(0, 50)}` : ''}</span>
                {v.is_current && <span className="text-primary font-semibold">current</span>}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}

export default function AdminVisualAssets() {
  const [stats, setStats] = useState(null);
  const [assets, setAssets] = useState([]);
  const [busy, setBusy] = useState('');
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    const [s, a] = await Promise.all([
      adminVisualAssets('stats').catch(() => null),
      base44.entities.VisualAsset.list('-created_date', 100).catch(() => []),
    ]);
    setStats(s?.stats || null);
    setAssets(a);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const runAdmin = async (label, action, extra) => {
    setBusy(action);
    try {
      const res = await adminVisualAssets(action, extra);
      toast({
        title: label,
        description: action === 'backfill'
          ? `${res?.result?.missing ?? 0} missing · ${res?.result?.processed ?? 0} processed${res?.result?.remaining ? ` · ${res.result.remaining} remaining` : ''}`
          : `${res?.result?.processed ?? 0} retried`,
      });
      refresh();
    } catch (e) {
      toast({ title: `${label} failed`, description: e.message, variant: 'destructive' });
    } finally { setBusy(''); }
  };

  const j = stats?.jobs || {};
  const a = stats?.assets || {};

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <ImageIcon className="w-5 h-5 text-primary" />
          <h1 className="font-heading text-xl font-bold">Visual Assets</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => runAdmin('Backfill started', 'backfill', { batch: 5 })} disabled={!!busy}>
            {busy === 'backfill' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseBackup className="w-3.5 h-3.5" />} Backfill missing
          </Button>
          <Button variant="outline" size="sm" onClick={() => runAdmin('Retries processed', 'retry_due')} disabled={!!busy}>
            {busy === 'retry_due' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Retry due
          </Button>
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Monitoring */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
        <Stat label="Assets" value={a.total ?? '—'} />
        <Stat label="Ready" value={a.byStatus?.ready ?? 0} />
        <Stat label="Custom" value={a.byStatus?.custom_active ?? 0} />
        <Stat label="Failed" value={a.byStatus?.failed ?? 0} />
        <Stat label="Pending jobs" value={j.pending ?? '—'} />
        <Stat label="Success rate" value={j.successRate != null ? `${j.successRate}%` : '—'} />
        <Stat label="Avg generation" value={j.avgDurationMs ? `${(j.avgDurationMs / 1000).toFixed(1)}s` : '—'} />
        <Stat label="Retried jobs" value={j.retries ?? 0} />
      </div>

      {/* Recent provider errors */}
      {stats?.recentErrors?.length > 0 && (
        <div className="glass-card rounded-2xl p-4 mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Provider Errors</h3>
          <div className="space-y-1.5">
            {stats.recentErrors.slice(0, 5).map((e, i) => (
              <p key={i} className="text-xs text-muted-foreground truncate">
                <span className="text-destructive font-medium">{e.entity_type}/{e.asset_type}</span> · attempt {e.attempts} · {e.error}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Assets */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Generation History & Status</h3>
        </div>
        <div className="divide-y divide-border/50 max-h-[55vh] overflow-y-auto">
          {assets.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No visual assets yet — they generate automatically as contests are created.</p>
          ) : assets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} onAction={refresh} />
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Need the contest behind an asset? Open it from <Link to="/admin/users" className="text-primary hover:underline">user management</Link> or the marketplace.
      </p>
    </div>
  );
}