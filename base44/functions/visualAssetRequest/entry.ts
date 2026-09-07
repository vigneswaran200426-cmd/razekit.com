// visualAssetRequest — user-facing API of the Visual Asset Engine.
// Called by UI components (cards, detail pages, brand controls). All writes go
// through the service role AFTER auth + ownership checks; generation itself is
// idempotent (keyed on generation_key), so refreshing a page can never trigger
// a duplicate generation.
//
//   action: get           → current asset + version history + latest job status
//   action: ensure        → idempotent generate-if-missing (any authenticated user)
//   action: regenerate    → explicit new version (entity owner or admin)
//   action: replace_custom → brand custom artwork becomes current (owner/admin)
//   action: retry         → manual retry of a failed generation (admin)
//   action: archive        → archive an asset version (admin)
//   action: restore        → restore an archived version (admin)
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import {
  ensureAsset,
  processJob,
  getCurrentAsset,
  getVersionHistory,
  getLatestJobStatus,
  regenerateAsset,
  replaceWithCustomAsset,
  retryFailedAsset,
  archiveAsset,
  restoreAsset,
  fetchEntityData,
} from "../../shared/visual/engine.ts";
import { isPlatformAdmin } from "../../shared/visual/authz.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !user.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const sr = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));

    const action = String(body.action || "");
    const entityType = String(body.entity_type || "");
    const entityId = String(body.entity_id || "");
    const assetType = String(body.asset_type || "");
    const isAdmin = isPlatformAdmin(user);

    const assertOwnerOrAdmin = async () => {
      if (isAdmin) return;
      const entity = await fetchEntityData(sr, entityType, entityId);
      if (entity.created_by_id !== user.id) {
        throw Object.assign(new Error("Forbidden: not the entity owner"), { status: 403 });
      }
    };

    if (action === "get") {
      const [current, versions, job] = await Promise.all([
        getCurrentAsset(sr, entityType, entityId, assetType),
        getVersionHistory(sr, entityType, entityId, assetType),
        getLatestJobStatus(sr, entityType, entityId, assetType),
      ]);
      return Response.json({ current, versions, job });
    }

    if (action === "ensure") {
      const ensured = await ensureAsset(sr, { entityType, entityId, assetType, requestedBy: user.id, origin: "auto" });
      let result = null;
      if (ensured.action === "job_created" || ensured.action === "retry_due") {
        result = await processJob(sr, ensured.job);
      }
      return Response.json({
        action: ensured.action,
        ok: result ? result.ok : true,
        asset: (result && result.asset) || ensured.asset || null,
        error: (result && result.error) || null,
      });
    }

    if (action === "regenerate") {
      await assertOwnerOrAdmin();
      const { result, version } = await regenerateAsset(sr, { entityType, entityId, assetType, requestedBy: user.id });
      return Response.json({ ok: result.ok, asset: result.asset || null, error: result.error || null, version });
    }

    if (action === "replace_custom") {
      await assertOwnerOrAdmin();
      if (!body.file_url) return Response.json({ error: "file_url is required" }, { status: 400 });
      const asset = await replaceWithCustomAsset(sr, {
        entityType, entityId, assetType, fileUrl: String(body.file_url), requestedBy: user.id,
      });
      return Response.json({ ok: true, asset });
    }

    if (action === "retry") {
      if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
      const { result } = await retryFailedAsset(sr, { entityType, entityId, assetType, requestedBy: user.id });
      return Response.json({ ok: result.ok, asset: result.asset || null, error: result.error || null });
    }

    if (action === "archive" || action === "restore") {
      if (!isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
      if (!body.asset_id) return Response.json({ error: "asset_id is required" }, { status: 400 });
      const asset = action === "archive"
        ? await archiveAsset(sr, String(body.asset_id))
        : await restoreAsset(sr, String(body.asset_id));
      return Response.json({ ok: true, asset });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    const status = error && error.status ? error.status : 500;
    return Response.json({ error: String((error && error.message) || error) }, { status });
  }
}