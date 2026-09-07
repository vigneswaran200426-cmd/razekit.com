import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ensureVisualAsset, getCurrentVisualAsset } from '@/lib/visual-assets/client';

// useVisualAsset — live view of an entity's current artwork for one asset type.
// Realtime-subscribed: cards update automatically when generation completes,
// a brand uploads custom artwork, or an admin regenerates.
// `ensure: true` requests idempotent on-demand generation (server keys on the
// generation key, so this can never generate twice for the same entity+type).
export default function useVisualAsset(entityType, entityId, assetType, { ensure = false } = {}) {
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(!!entityId);
  const ensuredRef = useRef(false);

  useEffect(() => {
    if (!entityId) {
      setAsset(null);
      setLoading(false);
      return;
    }
    let alive = true;

    const load = async () => {
      const current = await getCurrentVisualAsset(entityType, entityId, assetType).catch(() => null);
      if (!alive) return;
      if (current) {
        setAsset(current);
        setLoading(false);
        return;
      }
      if (ensure && !ensuredRef.current) {
        ensuredRef.current = true;
        const res = await ensureVisualAsset(entityType, entityId, assetType).catch(() => null);
        if (!alive) return;
        if (res && res.asset) setAsset(res.asset);
      }
      if (alive) setLoading(false);
    };

    load();
    const unsubscribe = base44.entities.VisualAsset.subscribe((event) => {
      const d = event && event.data;
      if (d && d.entity_type === entityType && d.entity_id === entityId && d.asset_type === assetType) {
        load();
      }
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [entityType, entityId, assetType, ensure]);

  return {
    asset,
    url: asset?.storage_url || null,
    status: asset?.status || null,
    version: asset?.generation_version || null,
    loading,
  };
}