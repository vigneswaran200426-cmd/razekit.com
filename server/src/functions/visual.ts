// @ts-nocheck
// Ported from base44/functions/{visualAssetRequest,visualAssetAdmin,visualAssetWorker}.
import { json } from './context.js';
import { serviceClient } from '../entities/service.js';
import {
  ensureAsset, processJob, getCurrentAsset, getVersionHistory, getLatestJobStatus,
  regenerateAsset, replaceWithCustomAsset, retryFailedAsset, archiveAsset, restoreAsset,
  fetchEntityData, processDueRetries, backfillMissingAssets, getMonitoringStats,
} from '../visual/engine.js';
import { isPlatformAdmin } from '../visual/authz.js';

// ── visualAssetRequest (user-facing) ──────────────────────────────────────────
export async function visualAssetRequest(ctx) {
  const user = ctx.user;
  if (!user || !user.id) return json({ error: 'Unauthorized' }, 401);
  const sr = ctx.svc;
  const body = ctx.body || {};
  const action = String(body.action || '');
  const entityType = String(body.entity_type || '');
  const entityId = String(body.entity_id || '');
  const assetType = String(body.asset_type || '');
  const isAdmin = isPlatformAdmin(user);

  const assertOwnerOrAdmin = async () => {
    if (isAdmin) return;
    const entity = await fetchEntityData(sr, entityType, entityId);
    if (entity.created_by_id !== user.id) {
      throw Object.assign(new Error('Forbidden: not the entity owner'), { status: 403 });
    }
  };

  if (action === 'get') {
    const [current, versions, job] = await Promise.all([
      getCurrentAsset(sr, entityType, entityId, assetType),
      getVersionHistory(sr, entityType, entityId, assetType),
      getLatestJobStatus(sr, entityType, entityId, assetType),
    ]);
    return json({ current, versions, job });
  }

  if (action === 'ensure') {
    const ensured = await ensureAsset(sr, { entityType, entityId, assetType, requestedBy: user.id, origin: 'auto' });
    let result = null;
    if (ensured.action === 'job_created' || ensured.action === 'retry_due') result = await processJob(sr, ensured.job);
    return json({ action: ensured.action, ok: result ? result.ok : true, asset: (result && result.asset) || ensured.asset || null, error: (result && result.error) || null });
  }

  if (action === 'regenerate') {
    await assertOwnerOrAdmin();
    const { result, version } = await regenerateAsset(sr, { entityType, entityId, assetType, requestedBy: user.id });
    return json({ ok: result.ok, asset: result.asset || null, error: result.error || null, version });
  }

  if (action === 'replace_custom') {
    await assertOwnerOrAdmin();
    if (!body.file_url) return json({ error: 'file_url is required' }, 400);
    const asset = await replaceWithCustomAsset(sr, { entityType, entityId, assetType, fileUrl: String(body.file_url), requestedBy: user.id });
    return json({ ok: true, asset });
  }

  if (action === 'retry') {
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);
    const { result } = await retryFailedAsset(sr, { entityType, entityId, assetType, requestedBy: user.id });
    return json({ ok: result.ok, asset: result.asset || null, error: result.error || null });
  }

  if (action === 'archive' || action === 'restore') {
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);
    if (!body.asset_id) return json({ error: 'asset_id is required' }, 400);
    const asset = action === 'archive' ? await archiveAsset(sr, String(body.asset_id)) : await restoreAsset(sr, String(body.asset_id));
    return json({ ok: true, asset });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}

// ── visualAssetAdmin (admin-only) ─────────────────────────────────────────────
export async function visualAssetAdmin(ctx) {
  const user = ctx.user;
  if (!user || !user.id) return json({ error: 'Unauthorized' }, 401);
  if (!isPlatformAdmin(user)) return json({ error: 'Forbidden' }, 403);
  const sr = ctx.svc;
  const body = ctx.body || {};
  const action = String(body.action || 'stats');

  if (action === 'backfill') {
    const result = await backfillMissingAssets(sr, {
      entityType: body.entity_type || 'CONTEST', assetType: body.asset_type || null,
      batch: Math.min(Number(body.batch) || 5, 20), requestedBy: user.id,
    });
    return json({ ok: true, result });
  }
  if (action === 'retry_due') {
    const result = await processDueRetries(sr, Math.min(Number(body.limit) || 20, 50));
    return json({ ok: true, result });
  }
  if (action === 'stats') {
    const stats = await getMonitoringStats(sr);
    return json({ ok: true, stats });
  }
  return json({ error: `Unknown action: ${action}` }, 400);
}

// ── visualAssetWorker (no auth; workflows/scheduler) ──────────────────────────
export async function visualAssetWorker(ctx) {
  const sr = ctx?.svc || serviceClient();
  const body = ctx?.body || {};
  const mode = body.mode || 'maintain';

  if (mode === 'ensure') {
    if (!body.entity_type || !body.entity_id) return json({ error: 'entity_type and entity_id are required' }, 400);
    const types = Array.isArray(body.asset_types) && body.asset_types.length ? body.asset_types : ['CONTEST_THUMBNAIL'];
    const results = [];
    for (const assetType of types) {
      const ensured = await ensureAsset(sr, { entityType: body.entity_type, entityId: body.entity_id, assetType, requestedBy: body.requested_by || 'system', origin: body.origin || 'auto' });
      if (ensured.action === 'job_created' || ensured.action === 'retry_due') {
        const result = await processJob(sr, ensured.job);
        results.push({ asset_type: assetType, action: ensured.action, ok: result.ok, asset_id: (result.asset && result.asset.id) || null, error: result.error || null });
      } else {
        results.push({ asset_type: assetType, action: ensured.action, ok: true });
      }
    }
    return json({ ok: true, mode, results });
  }

  if (mode === 'process_job') {
    if (!body.job_id) return json({ error: 'job_id is required' }, 400);
    const job = await sr.entities.VisualGenerationJob.get(body.job_id);
    const result = await processJob(sr, job);
    return json({ ok: result.ok, error: result.error || null, asset_id: (result.asset && result.asset.id) || null });
  }

  const retries = await processDueRetries(sr);
  const backfill = await backfillMissingAssets(sr, { requestedBy: 'system' });
  return json({ ok: true, mode: 'maintain', retries, backfill });
}
