// Multipart routes for the manual beta: funding proof, and the admin UPI QR.
//
// These cannot go through the JSON function API because a file has to travel as
// multipart. Everything else about them matches the function handlers: the same
// ownership checks, the same permission checks, the same audit records.
//
// Both write to PRIVATE object storage under a server-built path. The client
// never chooses the key, the bucket, or the filename.
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth/middleware.js';
import { uploadPrivate, storagePrefix, createSignedUrl } from '../integrations/storage.js';
import { validateUpload } from '../integrations/uploadGuard.js';
import { serviceClient } from '../entities/service.js';
import { FUNDING, FUNDING_AWAITING_MONEY, FUNDING_IN_QUEUE } from './states.js';
import { activeSettings, activeQrVersion, saveSettings } from './settings.js';
import { FINANCE_PERMISSION, hasPermission, auditFinance } from '../finance/permissions.js';

// 10 MB is generous for a bank screenshot or a PDF receipt and far below the
// platform-wide media ceiling.
const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PROOF_BYTES } });

export const paymentsRouter = Router();

// ── Funding proof ───────────────────────────────────────────────────────────
// POST /api/payments/funding/:id/proof
paymentsRouter.post('/funding/:id/proof', requireAuth, upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: { code: 'FILE_REQUIRED', message: 'Attach the payment proof file.' } });
    const svc = serviceClient();

    const funding = await svc.entities.ContestFunding.get(req.params.id).catch(() => null);
    if (!funding) return res.status(404).json({ error: { code: 'FUNDING_NOT_FOUND', message: 'Funding request not found.' } });
    // A proof belongs to one client's funding request and nobody else's.
    if (funding.brand_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'This funding request belongs to another account.' } });
    }
    // Proof is only meaningful while the request is still being paid or checked.
    if (![...FUNDING_AWAITING_MONEY, ...FUNDING_IN_QUEUE].includes(funding.status)) {
      return res.status(409).json({ error: { code: 'NOT_ACCEPTING_PROOF', message: `This funding request is ${funding.status} and no longer accepts proof uploads.` } });
    }

    const check: any = validateUpload(req.file);
    if (!check.ok) return res.status(400).json({ error: { code: 'FILE_REJECTED', message: check.message } });
    if (!/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(check.mimetype)) {
      return res.status(400).json({ error: { code: 'FILE_TYPE_UNSUPPORTED', message: 'Upload a PNG, JPEG, WebP image or a PDF.' } });
    }

    // Path built from ids the SERVER owns — never from anything the client sent.
    const prefix = storagePrefix('payments', funding.contest_id, 'funding', funding.id, 'proof');
    const stored = await uploadPrivate(req.file.buffer, check.storageName, check.mimetype, prefix);

    const proof = await svc.entities.FundingProof.create({
      funding_id: funding.id,
      contest_id: funding.contest_id,
      brand_id: funding.brand_id,
      file_uri: stored.file_uri,
      storage_path: stored.storage_path,
      file_name: String(req.file.originalname || 'proof').slice(0, 120),
      mime_type: check.mimetype,
      size_bytes: req.file.size,
      uploaded_by: req.user.id,
      uploaded_at: new Date().toISOString(),
    });

    await svc.entities.AuditLog.create({
      user_id: funding.brand_id,
      actor: req.user.id,
      action: 'FUNDING_PROOF_UPLOADED',
      status: 'success',
      reason: 'Client uploaded payment proof',
      result: JSON.stringify({ funding_id: funding.id, proof_id: proof.id, size_bytes: req.file.size, mime_type: check.mimetype }),
    }).catch(() => null);

    // The stored URI never leaves the server; the client gets an id only.
    res.json({ proof: { id: proof.id, file_name: proof.file_name, size_bytes: proof.size_bytes, uploaded_at: proof.uploaded_at } });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'PROOF_UPLOAD_FAILED', message: e?.message || 'The upload failed.' } });
  }
});

// GET /api/payments/proof/:id — a short-lived signed URL for one proof file.
paymentsRouter.get('/proof/:id', requireAuth, async (req: any, res) => {
  try {
    const svc = serviceClient();
    const proof = await svc.entities.FundingProof.get(req.params.id).catch(() => null);
    if (!proof) return res.status(404).json({ error: { code: 'PROOF_NOT_FOUND', message: 'Proof not found.' } });

    // Owner, or someone with finance.view. Nobody else, ever — this is the IDOR
    // surface that would otherwise leak one client's bank screenshots.
    const isOwner = proof.brand_id === req.user.id;
    const canView = isOwner || await hasPermission(svc, req.user, FINANCE_PERMISSION.VIEW);
    if (!canView) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have access to this file.' } });

    const signed = await createSignedUrl(proof.file_uri, 900);
    res.json({ signed_url: signed.signed_url, expires_in: 900, file_name: proof.file_name });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'PROOF_URL_FAILED', message: e?.message || 'Could not open the file.' } });
  }
});

// ── Admin UPI QR ────────────────────────────────────────────────────────────
// POST /api/payments/settings/qr — upload or replace the QR image.
//
// Replacing does NOT delete the previous file. Versions are retained so a
// funding request issued while v1 was live stays explainable.
paymentsRouter.post('/settings/qr', requireAuth, upload.single('file'), async (req: any, res) => {
  try {
    const svc = serviceClient();
    const allowed = await hasPermission(svc, req.user, FINANCE_PERMISSION.MANAGE);
    if (!allowed) {
      return res.status(403).json({
        error: { code: 'FINANCE_PERMISSION_REQUIRED', message: "This action requires the 'finance.manage_permissions' permission.", permission: FINANCE_PERMISSION.MANAGE },
      });
    }
    if (!req.file) return res.status(400).json({ error: { code: 'FILE_REQUIRED', message: 'Attach the QR code image.' } });

    const check: any = validateUpload(req.file);
    if (!check.ok) return res.status(400).json({ error: { code: 'FILE_REJECTED', message: check.message } });
    // A QR is an image. PDFs and video have no business here.
    if (!/^image\/(png|jpeg|webp)$/.test(check.mimetype)) {
      return res.status(400).json({ error: { code: 'FILE_TYPE_UNSUPPORTED', message: 'Upload a PNG, JPEG or WebP image.' } });
    }
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: { code: 'FILE_TOO_LARGE', message: 'The QR image must be 5 MB or smaller.' } });
    }

    const existing = await svc.entities.PaymentQrVersion.filter({}, '-created_date', 1).catch(() => []);
    const nextVersion = existing.length ? Number(existing[0].version || 0) + 1 : 1;
    const replacing = await activeQrVersion(svc);

    const prefix = storagePrefix('payments', 'config', 'manual-beta', 'upi-qr', `v${nextVersion}`);
    const stored = await uploadPrivate(req.file.buffer, check.storageName, check.mimetype, prefix);

    // Retire the old version rather than deleting it.
    if (replacing) {
      await svc.entities.PaymentQrVersion.update(replacing.id, {
        active: false, retired_at: new Date().toISOString(), retired_by: req.user.id,
      }).catch(() => null);
    }

    const created = await svc.entities.PaymentQrVersion.create({
      version: nextVersion,
      file_uri: stored.file_uri,
      storage_path: stored.storage_path,
      mime_type: check.mimetype,
      size_bytes: req.file.size,
      uploaded_by: req.user.id,
      uploaded_at: new Date().toISOString(),
      active: true,
    });

    // Uploading a QR does not silently switch the method on; enabling it stays
    // an explicit choice, except on the very first upload where the intent is
    // unambiguous.
    const settings = await activeSettings(svc);
    if (!replacing && !settings.upi_qr_enabled && req.body?.enable !== 'false') {
      await saveSettings(svc, {
        patch: { upi_qr_enabled: true },
        actorId: req.user.id,
        reason: 'UPI QR uploaded and enabled',
      }).catch(() => null);
    }

    await auditFinance(svc, {
      actorId: req.user.id,
      action: replacing ? 'UPI_QR_REPLACED' : 'UPI_QR_UPLOADED',
      permission: FINANCE_PERMISSION.MANAGE,
      status: 'success',
      reason: String(req.body?.reason || '').slice(0, 500),
      result: {
        qr_version: nextVersion,
        previous_version: replacing?.version || null,
        storage_path: stored.storage_path,
        size_bytes: req.file.size,
        mime_type: check.mimetype,
      },
    });

    const signed = await createSignedUrl(stored.file_uri, 900).catch(() => null);
    res.json({
      qr: {
        version: created.version, uploaded_at: created.uploaded_at,
        mime_type: created.mime_type, size_bytes: created.size_bytes,
        preview_url: signed?.signed_url || null,
      },
      replaced_version: replacing?.version || null,
      message: replacing
        ? 'New funding requests will show the new QR code. The previous version was retained for audit.'
        : 'QR code uploaded.',
    });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'QR_UPLOAD_FAILED', message: e?.message || 'The upload failed.' } });
  }
});
