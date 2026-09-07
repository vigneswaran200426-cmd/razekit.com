// @ts-nocheck
// Ported from base44/shared/visual/engine.ts (import extensions .ts→.js).
// VisualAssetEngine — the permanent core of Razekit's AI visual asset system.
// Idempotent, versioned, event-driven: any entity registered in the registry
// can require artwork, and every operation here is safe to call repeatedly
// (page refreshes, rerenders, API retries, server restarts never trigger
// duplicate generation — everything keys on generation_key).
import {
  PROMPT_VERSION,
  POLICY_VERSION,
  VISUAL_ASSET_TYPES,
  ENTITY_TYPES,
  RETRY_POLICY,
  CURRENT_STATUSES,
} from "./registry.js";
import { buildVisualBrief, buildImagePrompt } from "./brief-builder.js";
import { createImageProvider } from "./provider.js";
import { createStorageProvider } from "./storage.js";

const nowIso = () => new Date().toISOString();

export function generationKey(entityType, entityId, assetType, version) {
  return `${entityType}:${entityId}:${assetType}:v${version}`;
}

function parseVersion(key) {
  const m = /:v(\d+)$/.exec(String(key || ""));
  return m ? Number(m[1]) : 1;
}

export async function fetchEntityData(sr, entityType, entityId) {
  const cfg = ENTITY_TYPES[entityType];
  if (!cfg) throw new Error(`Unknown entity type: ${entityType}`);
  const entity = await sr.entities[cfg.entityName].get(entityId);
  if (!entity || !entity.id) throw new Error(`${entityType} ${entityId} not found`);
  return entity;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function getCurrentAsset(sr, entityType, entityId, assetType) {
  const list = await sr.entities.VisualAsset.filter(
    { entity_type: entityType, entity_id: entityId, asset_type: assetType, is_current: true },
    "-created_date",
    10
  );
  return list.find((a) => a.is_current && CURRENT_STATUSES.includes(a.status)) || null;
}

export async function getVersionHistory(sr, entityType, entityId, assetType) {
  return sr.entities.VisualAsset.filter(
    { entity_type: entityType, entity_id: entityId, asset_type: assetType },
    "-generation_version",
    100
  );
}

export async function getLatestJobStatus(sr, entityType, entityId, assetType) {
  const jobs = await sr.entities.VisualGenerationJob.filter(
    { entity_type: entityType, entity_id: entityId, asset_type: assetType },
    "-created_date",
    5
  );
  return jobs[0] || null;
}

async function lastJobFor(sr, entityType, entityId, assetType) {
  const jobs = await sr.entities.VisualGenerationJob.filter(
    { entity_type: entityType, entity_id: entityId, asset_type: assetType },
    "-created_date",
    50
  );
  return jobs[0] || null;
}

// Version = max across jobs and assets. Jobs are the authoritative sequence —
// a failed attempt retries the SAME version (its job record), never a new one.
async function maxStoredVersion(sr, entityType, entityId, assetType) {
  const jobs = await sr.entities.VisualGenerationJob.filter(
    { entity_type: entityType, entity_id: entityId, asset_type: assetType },
    "-created_date",
    100
  );
  const assets = await sr.entities.VisualAsset.filter(
    { entity_type: entityType, entity_id: entityId, asset_type: assetType },
    "-generation_version",
    1
  );
  const jobMax = jobs.reduce((m, j) => Math.max(m, parseVersion(j.generation_key)), 0);
  const assetMax = (assets[0] && assets[0].generation_version) || 0;
  return Math.max(jobMax, assetMax);
}

async function supersedeCurrentAssets(sr, entityType, entityId, assetType) {
  const list = await sr.entities.VisualAsset.filter(
    { entity_type: entityType, entity_id: entityId, asset_type: assetType, is_current: true },
    "-created_date",
    20
  );
  for (const a of list) {
    if (a.is_current) await sr.entities.VisualAsset.update(a.id, { is_current: false });
  }
  return list.length;
}

// ── Idempotent ensure: the heart of "never generate twice by accident" ────────

export async function ensureAsset(sr, { entityType, entityId, assetType, requestedBy = "system", origin = "auto" }) {
  if (!VISUAL_ASSET_TYPES[assetType]) throw new Error(`Unknown asset type: ${assetType}`);
  const current = await getCurrentAsset(sr, entityType, entityId, assetType);
  if (current) return { asset: current, job: null, action: "already_ready" };

  // An in-flight or failed job owns the CURRENT version — retry it, never fork a new one.
  const lastJob = await lastJobFor(sr, entityType, entityId, assetType);
  if (lastJob && (lastJob.status === "queued" || lastJob.status === "running")) {
    return { asset: null, job: lastJob, action: "in_progress" };
  }
  if (lastJob && lastJob.status === "failed") {
    const maxAttempts = lastJob.max_attempts || RETRY_POLICY.maxAttempts;
    const exhausted = (lastJob.attempt_count || 0) >= maxAttempts;
    const due = !exhausted && (!lastJob.next_retry_at || new Date(lastJob.next_retry_at) <= new Date());
    return {
      asset: null,
      job: lastJob,
      action: due ? "retry_due" : (exhausted ? "failed_manual_retry_required" : "retry_scheduled"),
    };
  }

  const version = (await maxStoredVersion(sr, entityType, entityId, assetType)) + 1;
  const key = generationKey(entityType, entityId, assetType, version);
  const job = await sr.entities.VisualGenerationJob.create({
    entity_type: entityType,
    entity_id: entityId,
    asset_type: assetType,
    generation_key: key,
    status: "queued",
    attempt_count: 0,
    max_attempts: RETRY_POLICY.maxAttempts,
    requested_by: requestedBy,
    origin,
  });
  return { asset: null, job, action: "job_created" };
}

// ── GenerationJobProcessor ────────────────────────────────────────────────────

export async function processJob(sr, job) {
  if (!job || !job.id) throw new Error("No job to process");
  if (job.status === "succeeded") return { ok: true, asset: null, reason: "already_succeeded" };

  const startedAt = Date.now();
  const attempt = (job.attempt_count || 0) + 1;
  const maxAttempts = job.max_attempts || RETRY_POLICY.maxAttempts;
  await sr.entities.VisualGenerationJob.update(job.id, {
    status: "running",
    attempt_count: attempt,
    started_at: nowIso(),
  });

  try {
    const entity = await fetchEntityData(sr, job.entity_type, job.entity_id);
    const brief = buildVisualBrief(job.entity_type, entity, job.asset_type);
    const prompt = buildImagePrompt(brief);

    const provider = createImageProvider(sr);
    const raw = await provider.generateImage(prompt);
    const validated = provider.validateResponse(raw);
    const assetFields = provider.returnAsset(validated);
    const version = parseVersion(job.generation_key);

    const storage = createStorageProvider();
    const stored = await storage.store(validated.url, {
      entityType: job.entity_type,
      entityId: job.entity_id,
      assetType: job.asset_type,
      version,
    });

    await supersedeCurrentAssets(sr, job.entity_type, job.entity_id, job.asset_type);
    // Upsert by generation_key: a failed-record placeholder for this version (if any)
    // is upgraded to ready instead of duplicated.
    const existingByKey = await sr.entities.VisualAsset.filter({ generation_key: job.generation_key }, "-created_date", 5);
    const readyFields = {
      entity_type: job.entity_type,
      entity_id: job.entity_id,
      asset_type: job.asset_type,
      generation_version: version,
      status: "ready",
      is_current: true,
      provider: assetFields.provider,
      model: assetFields.model,
      prompt_version: PROMPT_VERSION,
      policy_version: POLICY_VERSION,
      generation_id: assetFields.generationId,
      storage_url: stored.storage_url,
      storage_key: stored.storage_key,
      mime_type: assetFields.mimeType,
      attempt_count: attempt,
      origin: job.origin || "auto",
      created_by: job.requested_by || "system",
      metadata: JSON.stringify({ brief, prompt, attempt }),
      error_code: "",
      error_message: "",
    };
    const asset = existingByKey[0]
      ? await sr.entities.VisualAsset.update(existingByKey[0].id, readyFields)
      : await sr.entities.VisualAsset.create({ generation_key: job.generation_key, ...readyFields });
    await sr.entities.VisualGenerationJob.update(job.id, {
      status: "succeeded",
      completed_at: nowIso(),
      duration_ms: Date.now() - startedAt,
      result_asset_id: asset.id,
      next_retry_at: "",
    });
    return { ok: true, asset, durationMs: Date.now() - startedAt };
  } catch (err) {
    const provider = createImageProvider(sr);
    const handled = provider.handleError(err);
    const exhausted = attempt >= maxAttempts;
    const backoff = RETRY_POLICY.backoffMs[Math.min(attempt, RETRY_POLICY.backoffMs.length) - 1];
    await sr.entities.VisualGenerationJob.update(job.id, {
      status: "failed",
      last_error: handled.message,
      duration_ms: Date.now() - startedAt,
      next_retry_at: exhausted ? "" : new Date(Date.now() + backoff).toISOString(),
    });
    await upsertFailedAsset(sr, job, handled, attempt);
    return { ok: false, error: handled.message, exhausted, durationMs: Date.now() - startedAt };
  }
}

async function upsertFailedAsset(sr, job, errorInfo, attempt) {
  const existing = await sr.entities.VisualAsset.filter({ generation_key: job.generation_key }, "-created_date", 5);
  const fields = {
    status: "failed",
    is_current: false,
    error_code: errorInfo.code,
    error_message: errorInfo.message,
    attempt_count: attempt,
  };
  if (existing[0]) {
    await sr.entities.VisualAsset.update(existing[0].id, fields);
  } else {
    await sr.entities.VisualAsset.create({
      entity_type: job.entity_type,
      entity_id: job.entity_id,
      asset_type: job.asset_type,
      generation_key: job.generation_key,
      generation_version: parseVersion(job.generation_key),
      prompt_version: PROMPT_VERSION,
      policy_version: POLICY_VERSION,
      origin: job.origin || "auto",
      metadata: "{}",
      ...fields,
    });
  }
}

// ── Explicit actions ──────────────────────────────────────────────────────────

// Forced new version — only reached through explicit regenerate requests.
export async function regenerateAsset(sr, { entityType, entityId, assetType, requestedBy }) {
  if (!VISUAL_ASSET_TYPES[assetType]) throw new Error(`Unknown asset type: ${assetType}`);
  const version = (await maxStoredVersion(sr, entityType, entityId, assetType)) + 1;
  const job = await sr.entities.VisualGenerationJob.create({
    entity_type: entityType,
    entity_id: entityId,
    asset_type: assetType,
    generation_key: generationKey(entityType, entityId, assetType, version),
    status: "queued",
    attempt_count: 0,
    max_attempts: RETRY_POLICY.maxAttempts,
    requested_by: requestedBy,
    origin: "regenerate",
  });
  const result = await processJob(sr, job);
  return { job, result, version };
}

// Brand custom upload: custom artwork becomes current; the engine will never
// auto-regenerate over it (auto paths only run when no current asset exists).
export async function replaceWithCustomAsset(sr, { entityType, entityId, assetType, fileUrl, requestedBy }) {
  if (!fileUrl) throw new Error("fileUrl is required");
  if (!VISUAL_ASSET_TYPES[assetType]) throw new Error(`Unknown asset type: ${assetType}`);
  const version = (await maxStoredVersion(sr, entityType, entityId, assetType)) + 1;
  await supersedeCurrentAssets(sr, entityType, entityId, assetType);
  const asset = await sr.entities.VisualAsset.create({
    entity_type: entityType,
    entity_id: entityId,
    asset_type: assetType,
    generation_key: generationKey(entityType, entityId, assetType, version),
    generation_version: version,
    status: "custom_active",
    is_current: true,
    provider: "brand_upload",
    model: "custom",
    origin: "custom_upload",
    created_by: requestedBy,
    storage_url: fileUrl,
    metadata: "{}",
  });
  return asset;
}

// Manual retry (admin) — resets attempts on an exhausted job, or re-runs a scheduled one.
export async function retryFailedAsset(sr, { entityType, entityId, assetType, requestedBy }) {
  const jobs = await sr.entities.VisualGenerationJob.filter(
    { entity_type: entityType, entity_id: entityId, asset_type: assetType },
    "-created_date",
    10
  );
  const failed = jobs.find((j) => j.status === "failed");
  if (!failed) throw new Error("No failed job to retry");
  const job = (failed.attempt_count || 0) >= (failed.max_attempts || RETRY_POLICY.maxAttempts)
    ? await sr.entities.VisualGenerationJob.create({
        entity_type: entityType,
        entity_id: entityId,
        asset_type: assetType,
        generation_key: failed.generation_key,
        status: "queued",
        attempt_count: 0,
        max_attempts: RETRY_POLICY.maxAttempts,
        requested_by: requestedBy,
        origin: "retry",
      })
    : failed;
  const result = await processJob(sr, job);
  return { job, result };
}

export async function archiveAsset(sr, assetId) {
  const asset = await sr.entities.VisualAsset.get(assetId);
  const wasCurrent = asset.is_current;
  await sr.entities.VisualAsset.update(assetId, { status: "archived", is_current: false });
  if (wasCurrent) await promoteLatestUsable(sr, asset);
  return await sr.entities.VisualAsset.get(assetId);
}

export async function restoreAsset(sr, assetId) {
  const asset = await sr.entities.VisualAsset.get(assetId);
  const status = asset.origin === "custom_upload" ? "custom_active" : (asset.storage_url ? "ready" : "failed");
  const hasCurrent = !!(await getCurrentAsset(sr, asset.entity_type, asset.entity_id, asset.asset_type));
  const restored = await sr.entities.VisualAsset.update(assetId, {
    status,
    is_current: status !== "failed" && !hasCurrent,
  });
  return restored;
}

async function promoteLatestUsable(sr, asset) {
  const list = await sr.entities.VisualAsset.filter(
    { entity_type: asset.entity_type, entity_id: asset.entity_id, asset_type: asset.asset_type },
    "-generation_version",
    20
  );
  const candidate = list.find((a) => a.id !== asset.id && CURRENT_STATUSES.includes(a.status));
  if (candidate) await sr.entities.VisualAsset.update(candidate.id, { is_current: true });
}

// ── Maintenance: automatic retries + reusable backfill ────────────────────────

export async function processDueRetries(sr, limit = RETRY_POLICY.maintenanceBatch) {
  const jobs = await sr.entities.VisualGenerationJob.filter({ status: "failed" }, "created_date", 100);
  const due = jobs
    .filter((j) => (j.attempt_count || 0) < (j.max_attempts || RETRY_POLICY.maxAttempts)
      && j.next_retry_at && new Date(j.next_retry_at) <= new Date())
    .slice(0, limit);
  const results = [];
  for (const job of due) {
    results.push({ job_id: job.id, ok: (await processJob(sr, job)).ok });
  }
  return { scanned: jobs.length, processed: due.length, results };
}

// Reusable backfill: finds entities missing a current asset for any required /
// auto-on-create type and enqueues+processes them in controlled batches.
// Usable today for existing contests and after any future migration.
export async function backfillMissingAssets(sr, { entityType = "CONTEST", assetType = null, batch = RETRY_POLICY.backfillBatch, requestedBy = "system" } = {}) {
  const cfg = ENTITY_TYPES[entityType];
  if (!cfg) throw new Error(`Unknown entity type: ${entityType}`);
  const types = assetType
    ? [assetType]
    : Object.keys(cfg.requirements).filter((t) => VISUAL_ASSET_TYPES[t] && VISUAL_ASSET_TYPES[t].autoOnCreate);
  const entities = await sr.entities[cfg.entityName].list("-created_date", RETRY_POLICY.backfillScanLimit);

  const targets = [];
  for (const e of entities) {
    for (const t of types) {
      const current = await getCurrentAsset(sr, entityType, e.id, t);
      if (!current) targets.push({ entityType, entityId: e.id, assetType: t });
    }
  }

  const detail = [];
  for (const target of targets.slice(0, batch)) {
    const ensured = await ensureAsset(sr, { ...target, requestedBy, origin: "backfill" });
    if (ensured.action === "job_created" || ensured.action === "retry_due") {
      const result = await processJob(sr, ensured.job);
      detail.push({ ...target, ok: result.ok, asset_id: (result.asset && result.asset.id) || null, error: result.error || null });
    } else {
      detail.push({ ...target, ok: false, skipped: ensured.action });
    }
  }
  return {
    scanned: entities.length,
    missing: targets.length,
    processed: Math.min(targets.length, batch),
    remaining: Math.max(0, targets.length - batch),
    detail,
  };
}

// ── Observability / monitoring ───────────────────────────────────────────────

export async function getMonitoringStats(sr) {
  const assets = await sr.entities.VisualAsset.list("-created_date", 500);
  const jobs = await sr.entities.VisualGenerationJob.list("-created_date", 500);

  const countBy = (arr, fn) => arr.reduce((acc, x) => { const k = fn(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const succeeded = jobs.filter((j) => j.status === "succeeded").length;
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const durations = jobs.filter((j) => j.duration_ms).map((j) => j.duration_ms);
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  return {
    assets: {
      total: assets.length,
      byStatus: countBy(assets, (a) => a.status),
      byType: countBy(assets, (a) => a.asset_type),
      byOrigin: countBy(assets, (a) => a.origin),
    },
    jobs: {
      total: jobs.length,
      byStatus: countBy(jobs, (j) => j.status),
      pending: jobs.filter((j) => j.status === "queued" || j.status === "running").length,
      retries: jobs.filter((j) => (j.attempt_count || 0) > 1).length,
      successRate: (succeeded + failedJobs.length) ? Math.round((succeeded / (succeeded + failedJobs.length)) * 100) : null,
      avgDurationMs: avgDuration,
    },
    recentErrors: failedJobs.slice(0, 10).map((j) => ({
      entity_type: j.entity_type, entity_id: j.entity_id, asset_type: j.asset_type,
      attempts: j.attempt_count, error: j.last_error, next_retry_at: j.next_retry_at,
    })),
  };
}