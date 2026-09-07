// visualAssetAdmin — admin-only maintenance & monitoring endpoint for the
// Visual Asset System. Verifies the caller is a platform admin (app semantics:
// role === 'admin' with no onboarded user_role).
//
//   action: backfill       → enqueue + process missing assets (controlled batches)
//   action: stats          → generation success rate, failures, pending, durations
//   action: retry_due     → process failed jobs whose retry time has arrived
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { backfillMissingAssets, getMonitoringStats, processDueRetries } from "../../shared/visual/engine.ts";
import { isPlatformAdmin } from "../../shared/visual/authz.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !user.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!isPlatformAdmin(user)) return Response.json({ error: "Forbidden" }, { status: 403 });

    const sr = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "stats");

    if (action === "backfill") {
      const result = await backfillMissingAssets(sr, {
        entityType: body.entity_type || "CONTEST",
        assetType: body.asset_type || null,
        batch: Math.min(Number(body.batch) || 5, 20),
        requestedBy: user.id,
      });
      return Response.json({ ok: true, result });
    }

    if (action === "retry_due") {
      const result = await processDueRetries(sr, Math.min(Number(body.limit) || 20, 50));
      return Response.json({ ok: true, result });
    }

    if (action === "stats") {
      const stats = await getMonitoringStats(sr);
      return Response.json({ ok: true, stats });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: String((error && error.message) || error) }, { status: 500 });
  }
}