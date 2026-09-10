// @ts-nocheck
// Admin → Finance → Payment Settings.
//
// The manual-beta funding instructions live in the database, not in the
// frontend and not in a constant. An admin can change the account, switch UPI or
// the QR on and off, and edit the wording — and every change becomes a NEW
// version, because a funding request issued last month must still be explainable
// against the details that were live when it was issued.
//
// What this deliberately does NOT do: delete anything. Disabling a method hides
// it from new funding flows and changes no historical record, no proof file and
// no ledger entry.
import { json } from './context.js';
import { withTransaction } from '../db.js';
import { serviceClient } from '../entities/service.js';
import {
  activeSettings, activeQrVersion, saveSettings, maskedSettings, auditActionsFor,
  isValidUpiId, isValidIfsc, isValidAccountNumber, enabledMethods, PAYMENT_METHOD,
} from '../payments/settings.js';
import { FINANCE_PERMISSION, requireFinance, auditFinance, permissionsFor, hasPermission } from '../finance/permissions.js';
import { createSignedUrl } from '../integrations/storage.js';
import { paymentMode } from '../payments/config.js';

const nowIso = () => new Date().toISOString();
const err = (code, message, status = 400, extra = {}) => json({ error: { code, message, ...extra } }, status);

// ── paymentSettingsGet ──────────────────────────────────────────────────────
/**
 * Read the current configuration. Masked by default; the full account number is
 * included only for a holder of finance.view_sensitive_financial_data who
 * explicitly asks, and that disclosure is audited.
 */
export async function paymentSettingsGet(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.VIEW); if (denied) return denied;
  const svc = ctx.svc;

  const settings = await activeSettings(svc);
  const qr = await activeQrVersion(svc);
  const methods = enabledMethods(settings, qr);

  // The QR is a private object. Even an admin previewing it gets a short-lived
  // signed URL rather than a durable link.
  let qrPreview = null;
  if (qr?.file_uri) {
    const signed = await createSignedUrl(qr.file_uri, 900).catch(() => null);
    qrPreview = signed?.signed_url || null;
  }

  const wantsFull = ctx.body?.reveal === true;
  let full = null;
  if (wantsFull) {
    const allowed = await hasPermission(svc, ctx.user, FINANCE_PERMISSION.VIEW_SENSITIVE);
    if (!allowed) {
      return err('FINANCE_PERMISSION_REQUIRED', "Revealing the full account requires the 'finance.view_sensitive_financial_data' permission.", 403, { permission: FINANCE_PERMISSION.VIEW_SENSITIVE });
    }
    full = {
      bank_account_number: settings.bank_account_number || '',
      bank_ifsc: settings.bank_ifsc || '',
      upi_id: settings.upi_id || '',
    };
    await auditFinance(svc, {
      actorId: ctx.user.id, action: 'PAYMENT_SETTINGS_REVEALED', permission: FINANCE_PERMISSION.VIEW_SENSITIVE,
      status: 'success', reason: 'Admin revealed the destination account',
      result: { settings_version: settings.version },
    });
  }

  const versions = await svc.entities.PaymentQrVersion.filter({}, '-created_date', 20).catch(() => []);
  const history = await svc.entities.PaymentSettings.filter({}, '-created_date', 20).catch(() => []);

  return json({
    payment_mode: paymentMode(),
    settings: maskedSettings(settings, qr),
    // Never leaves the server except here, deliberately and audited.
    revealed: full,
    qr: qr ? {
      version: qr.version, uploaded_at: qr.uploaded_at, mime_type: qr.mime_type,
      size_bytes: qr.size_bytes, preview_url: qrPreview, active: true,
    } : null,
    qr_versions: versions.map((v) => ({
      version: v.version, uploaded_at: v.uploaded_at, active: Boolean(v.active),
      retired_at: v.retired_at || null, size_bytes: v.size_bytes, mime_type: v.mime_type,
    })),
    available_methods: methods,
    history: history.map((h) => ({
      version: h.version, active: Boolean(h.active), change_reason: h.change_reason || '',
      created_by_admin: h.created_by_admin || null, created_date: h.created_date,
      superseded_at: h.superseded_at || null,
    })),
    permissions: await permissionsFor(svc, ctx.user),
  });
}

// ── paymentSettingsUpdate ───────────────────────────────────────────────────
/**
 * Change the configuration. Writes a new version and never mutates the old one.
 *
 * Validation happens before anything is saved: an invalid IFSC or UPI ID that
 * reached a client's funding screen would cost a real payment.
 */
export async function paymentSettingsUpdate(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.MANAGE); if (denied) return denied;
  const b = ctx.body || {};
  const patch = {};

  if (b.bank_account_number != null) {
    if (!isValidAccountNumber(b.bank_account_number)) return err('ACCOUNT_NUMBER_INVALID', 'Enter a valid bank account number (6–20 digits).');
    patch.bank_account_number = String(b.bank_account_number).replace(/\s/g, '');
  }
  if (b.bank_ifsc != null) {
    if (!isValidIfsc(b.bank_ifsc)) return err('IFSC_INVALID', 'Enter a valid IFSC code, for example ABCD0123456.');
    patch.bank_ifsc = String(b.bank_ifsc).trim().toUpperCase();
  }
  if (b.upi_id != null && String(b.upi_id).trim() !== '') {
    if (!isValidUpiId(b.upi_id)) return err('UPI_INVALID', 'Enter a valid UPI ID in the form name@bank.');
    patch.upi_id = String(b.upi_id).trim();
  } else if (b.upi_id === '') {
    patch.upi_id = '';
  }
  for (const key of ['bank_account_name', 'bank_name', 'bank_branch', 'payment_instructions', 'support_phone', 'support_email']) {
    if (b[key] != null) patch[key] = String(b[key]);
  }
  for (const key of ['bank_transfer_enabled', 'upi_enabled', 'upi_qr_enabled']) {
    if (b[key] != null) patch[key] = Boolean(b[key]);
  }
  if (b.verification_hours != null) {
    const h = Number(b.verification_hours);
    if (!Number.isFinite(h) || h <= 0 || h > 336) return err('VERIFICATION_HOURS_INVALID', 'Enter a verification window between 1 and 336 hours.');
    patch.verification_hours = h;
  }
  if (!Object.keys(patch).length) return err('NOTHING_TO_UPDATE', 'No settings were provided.');

  const svc = ctx.svc;
  const current = await activeSettings(svc);
  const qr = await activeQrVersion(svc);

  // Enabling a method with nothing behind it would show a client an empty box.
  const merged = { ...current, ...patch };
  if (merged.upi_enabled && !merged.upi_id) return err('UPI_NOT_CONFIGURED', 'Add a UPI ID before enabling UPI.');
  if (merged.upi_qr_enabled && !qr) return err('QR_NOT_UPLOADED', 'Upload a UPI QR code before enabling it.');
  if (merged.bank_transfer_enabled && !(merged.bank_account_number && merged.bank_ifsc)) {
    return err('BANK_NOT_CONFIGURED', 'Add the account number and IFSC before enabling bank transfer.');
  }
  if (!merged.bank_transfer_enabled && !merged.upi_enabled && !merged.upi_qr_enabled) {
    // With everything off, no client could ever fund a contest.
    return err('NO_METHOD_ENABLED', 'At least one payment method must stay enabled, or clients cannot fund contests.');
  }

  const { settings, changes, unchanged } = await saveSettings(svc, {
    patch, actorId: ctx.user.id, reason: b.reason || 'Payment settings updated',
  });
  if (unchanged) return json({ settings: maskedSettings(settings, qr), unchanged: true });

  // One audit record per kind of change, so the log reads as events rather than
  // as one opaque "settings updated".
  for (const action of auditActionsFor(changes)) {
    await auditFinance(svc, {
      actorId: ctx.user.id, action, permission: FINANCE_PERMISSION.MANAGE, status: 'success',
      reason: b.reason || '',
      result: {
        // Field names only. The values themselves never enter the audit log.
        fields: changes.map((c) => c.field),
        from_version: current.version, to_version: settings.version,
        from_settings_id: current.id, to_settings_id: settings.id,
      },
    });
  }
  for (const key of ['bank_transfer_enabled', 'upi_enabled', 'upi_qr_enabled']) {
    if (patch[key] == null || Boolean(current[key]) === Boolean(patch[key])) continue;
    await auditFinance(svc, {
      actorId: ctx.user.id,
      action: patch[key] ? 'PAYMENT_METHOD_ENABLED' : 'PAYMENT_METHOD_DISABLED',
      permission: FINANCE_PERMISSION.MANAGE, status: 'success', reason: b.reason || '',
      result: { method: key.replace('_enabled', '').toUpperCase(), to_version: settings.version },
    });
  }

  return json({ settings: maskedSettings(settings, await activeQrVersion(svc)), changed: changes.map((c) => c.field) });
}

// ── paymentSettingsQr ───────────────────────────────────────────────────────
/**
 * Manage the UPI QR image: read its versions, or remove the active one.
 *
 * Uploading is a multipart route (payments/routes.ts) because a file cannot
 * travel through the JSON function API. Removal is here.
 *
 * "Remove" retires the version; it never deletes the object. A funding request
 * that was issued while v2 was live keeps pointing at v2.
 */
export async function paymentSettingsQr(ctx) {
  const denied = await requireFinance(ctx, FINANCE_PERMISSION.MANAGE); if (denied) return denied;
  const svc = ctx.svc;
  const b = ctx.body || {};

  if (b.action === 'remove') {
    const qr = await activeQrVersion(svc);
    if (!qr) return err('NO_ACTIVE_QR', 'There is no QR code to remove.', 404);

    const out = await withTransaction(async (tx) => {
      const s = serviceClient(tx);
      const retired = await s.entities.PaymentQrVersion.update(qr.id, {
        active: false, retired_at: nowIso(), retired_by: ctx.user.id,
      });
      const current = await activeSettings(s);
      // Turning the method off is part of removing the image — otherwise the
      // client screen would advertise a QR that no longer exists.
      await saveSettings(s, {
        patch: { upi_qr_enabled: false },
        actorId: ctx.user.id,
        reason: b.reason || 'UPI QR removed',
      });
      return { retired, previousVersion: current.version };
    });

    await auditFinance(svc, {
      actorId: ctx.user.id, action: 'UPI_QR_REMOVED', permission: FINANCE_PERMISSION.MANAGE,
      status: 'success', reason: b.reason || 'UPI QR removed',
      result: { qr_version: qr.version, storage_path: qr.storage_path, retained: true },
    });
    return json({
      removed: true,
      qr_version: out.retired.version,
      message: 'New funding requests will no longer show this QR code. Existing transaction history is unchanged and the file was retained for audit.',
    });
  }

  const versions = await svc.entities.PaymentQrVersion.filter({}, '-created_date', 50).catch(() => []);
  return json({
    versions: versions.map((v) => ({
      version: v.version, active: Boolean(v.active), uploaded_at: v.uploaded_at,
      uploaded_by: v.uploaded_by, retired_at: v.retired_at || null,
      mime_type: v.mime_type, size_bytes: v.size_bytes,
    })),
  });
}

// ── paymentMethodsForClient ─────────────────────────────────────────────────
/**
 * Which methods the funding screen should offer. Shared by the funding handler
 * so the client and the admin view can never disagree about what is enabled.
 */
export async function resolveClientMethods(svc) {
  const settings = await activeSettings(svc);
  const qr = await activeQrVersion(svc);
  const methods = enabledMethods(settings, qr);
  return { settings, qr, methods, any: Object.values(methods).some(Boolean) };
}

export { PAYMENT_METHOD };
