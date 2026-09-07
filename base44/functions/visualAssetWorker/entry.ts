// visualAssetWorker — the Visual Asset Engine's background worker.
// Invoked by workflows (contest-created event, scheduled maintenance) — no user
// auth; every mode is idempotent and retry-bounded so repeated invocation
// (page refreshes, workflow retries, direct calls) can never cause duplicate
// or unbounded generation.
//
//   mode: "ensure"       → ensure + process the given entity's asset types
//   mode: "process_job"  → re-process a specific job (guarded, idempotent)
//   mode: "maintain"     → due automatic retries + backfill of missing assets
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { ensureAsset, processJob, processDueRetries, backfillMissingAssets } from "../../shared/visual/engine.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "maintain";

    if (mode === "ensure") {
      if (!body.entity_type || !body.entity_id) {
        return Response.json({ error: "entity_type and entity_id are required" }, { status: 400 });
      }
      const types = Array.isArray(body.asset_types) && body.asset_types.length
        ? body.asset_types
        : ["CONTEST_THUMBNAIL"];
      const results = [];
      for (const assetType of types) {
        const ensured = await ensureAsset(sr, {
          entityType: body.entity_type,
          entityId: body.entity_id,
          assetType,
          requestedBy: body.requested_by || "system",
          origin: body.origin || "auto",
        });
        if (ensured.action === "job_created" || ensured.action === "retry_due") {
          const result = await processJob(sr, ensured.job);
          results.push({
            asset_type: assetType,
            action: ensured.action,
            ok: result.ok,
            asset_id: (result.asset && result.asset.id) || null,
            error: result.error || null,
          });
        } else {
          results.push({ asset_type: assetType, action: ensured.action, ok: true });
        }
      }
      return Response.json({ ok: true, mode, results });
    }

    if (mode === "process_job") {
      if (!body.job_id) return Response.json({ error: "job_id is required" }, { status: 400 });
      const job = await sr.entities.VisualGenerationJob.get(body.job_id);
      const result = await processJob(sr, job);
      return Response.json({ ok: result.ok, error: result.error || null, asset_id: (result.asset && result.asset.id) || null });
    }

    // maintain
    const retries = await processDueRetries(sr);
    const backfill = await backfillMissingAssets(sr, { requestedBy: "system" });
    return Response.json({
      ok: true,
      mode: "maintain",
      retries: { scanned: retries.scanned, processed: retries.processed, results: retries.results },
      backfill: { scanned: backfill.scanned, missing: backfill.missing, processed: backfill.processed, remaining: backfill.remaining },
    });
  } catch (error) {
    return Response.json({ error: String((error && error.message) || error) }, { status: 500 });
  }
}