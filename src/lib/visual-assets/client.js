// Visual Asset Engine — client facade.
// UI components never touch generation, prompts, storage or retry logic;
// they ask the engine for the current asset and render it.
import { base44 } from '@/api/base44Client';

export const ASSET_TYPE_LABELS = {
  CONTEST_THUMBNAIL: 'Thumbnail',
  CONTEST_HERO: 'Hero',
  CONTEST_BANNER: 'Banner',
  CONTEST_AD: 'Ad Creative',
  FEATURED_CONTEST_ART: 'Featured Art',
  WINNER_HUB_COVER: 'Hub Cover',
};

export const ENTITY_TYPE_LABELS = {
  CONTEST: 'Contest',
};

const inflight = new Set();
const inflightKey = (entityType, entityId, assetType) => `${entityType}:${entityId}:${assetType}`;

export async function getCurrentVisualAsset(entityType, entityId, assetType) {
  if (!entityId) return null;
  const list = await base44.entities.VisualAsset.filter(
    { entity_type: entityType, entity_id: entityId, asset_type: assetType, is_current: true },
    '-created_date',
    10
  );
  return list.find((a) => a.is_current && (a.status === 'ready' || a.status === 'custom_active')) || null;
}

async function invokeEngine(payload) {
  const res = await base44.functions.invoke('visualAssetRequest', payload);
  return res.data;
}

// Idempotent generate-if-missing. Server-side keyed on generation_key, so
// refreshes / rerenders / concurrent mounts never trigger duplicate generation.
export function ensureVisualAsset(entityType, entityId, assetType) {
  const key = inflightKey(entityType, entityId, `ensure:${assetType}`);
  if (inflight.has(key)) return Promise.resolve(null);
  inflight.add(key);
  return invokeEngine({ action: 'ensure', entity_type: entityType, entity_id: entityId, asset_type: assetType })
    .finally(() => inflight.delete(key));
}

export function regenerateVisualAsset(entityType, entityId, assetType) {
  return invokeEngine({ action: 'regenerate', entity_type: entityType, entity_id: entityId, asset_type: assetType });
}

export function retryVisualAsset(entityType, entityId, assetType) {
  return invokeEngine({ action: 'retry', entity_type: entityType, entity_id: entityId, asset_type: assetType });
}

export function archiveVisualAsset(assetId) {
  return invokeEngine({ action: 'archive', asset_id: assetId });
}

export function restoreVisualAsset(assetId) {
  return invokeEngine({ action: 'restore', asset_id: assetId });
}

export function getVisualAssetStatus(entityType, entityId, assetType) {
  return invokeEngine({ action: 'get', entity_type: entityType, entity_id: entityId, asset_type: assetType });
}

// Brand custom artwork: upload → becomes the current version; auto-generation
// never overwrites a custom asset.
export async function uploadCustomVisualAsset(entityType, entityId, assetType, file) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return invokeEngine({
    action: 'replace_custom',
    entity_type: entityType,
    entity_id: entityId,
    asset_type: assetType,
    file_url,
  });
}

// Admin maintenance/monitoring (admin-only backend)
export function adminVisualAssets(action, extra = {}) {
  return base44.functions.invoke('visualAssetAdmin', { action, ...extra }).then((r) => r.data);
}