// @ts-nocheck
// Manual-beta payment instructions — admin configured, server held, versioned.
//
// The destination account is no longer a constant in a file. An admin edits it
// in Admin → Finance → Payment Settings, and every edit writes a NEW version
// rather than overwriting the old one, because a funding request issued last
// week must still be explainable against the details that were live when it was
// issued. Nothing here is ever mutated in place.
//
// This module belongs to the MANUAL_BETA adapter only. When an automated
// gateway is switched on, none of it moves into the payment core.
//
// Security invariants:
//   • full details are returned by exactly one path — instructionsFor(), called
//     after the funding handler has proved the caller owns the contest;
//   • everything else gets maskedSettings();
//   • the QR image lives in PRIVATE object storage and is served only through a
//     short-lived signed URL issued to an authorised caller.
import { config } from '../config.js';
import { maskAccountNumber, maskIfsc, maskUpi } from './config.js';

export const PAYMENT_METHOD = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  UPI: 'UPI',
  UPI_QR: 'UPI_QR',
};

/** UPI IDs look like handle@bank. Validated before anything is saved. */
export function isValidUpiId(v) {
  return /^[A-Za-z0-9._-]{2,60}@[A-Za-z]{2,20}$/.test(String(v || '').trim());
}

export function isValidIfsc(v) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(v || '').trim().toUpperCase());
}

export function isValidAccountNumber(v) {
  return /^\d{6,20}$/.test(String(v || '').replace(/\s/g, ''));
}

/**
 * Seed the first settings version from environment variables.
 *
 * The env vars remain the bootstrap so a fresh deployment is never left with an
 * empty funding screen; after the first admin edit the database is the source of
 * truth and the env values are only a fallback.
 */
function seedFromEnv() {
  const b = config.payments.bank;
  return {
    version: 1,
    payment_mode: config.payments.mode || 'MANUAL_BETA',
    active: true,
    bank_transfer_enabled: Boolean(b.accountNumber && b.ifsc),
    upi_enabled: Boolean(b.upiId),
    upi_qr_enabled: false, // no QR exists until an admin uploads one
    bank_account_name: b.accountName || '',
    bank_account_number: b.accountNumber || '',
    bank_ifsc: (b.ifsc || '').toUpperCase(),
    bank_name: b.bankName || '',
    bank_branch: b.branch || '',
    upi_id: b.upiId || '',
    payment_instructions: '',
    support_phone: config.payments.support.phone || '',
    support_email: config.payments.support.email || '',
    verification_hours: Number(config.payments.verificationHours) || 24,
    change_reason: 'Initial configuration seeded from server environment',
  };
}

/** The live settings row, seeding one on first use. */
export async function activeSettings(svc) {
  const rows = await svc.entities.PaymentSettings
    .filter({ active: true }, '-created_date', 1).catch(() => []);
  if (rows.length) return rows[0];
  return svc.entities.PaymentSettings.create(seedFromEnv());
}

/** Currently active QR image version, if any. */
export async function activeQrVersion(svc) {
  const rows = await svc.entities.PaymentQrVersion
    .filter({ active: true }, '-created_date', 1).catch(() => []);
  return rows[0] || null;
}

/**
 * Which methods a client may actually use right now.
 *
 * A method is offered only when it is enabled AND actually configured — an
 * enabled UPI switch with no UPI ID behind it would show a client an empty box
 * and lose a payment.
 */
export function enabledMethods(settings, qr) {
  return {
    [PAYMENT_METHOD.BANK_TRANSFER]: Boolean(
      settings.bank_transfer_enabled && settings.bank_account_number && settings.bank_ifsc
    ),
    [PAYMENT_METHOD.UPI]: Boolean(settings.upi_enabled && settings.upi_id),
    [PAYMENT_METHOD.UPI_QR]: Boolean(settings.upi_qr_enabled && qr && qr.file_uri),
  };
}

export function anyMethodAvailable(settings, qr) {
  return Object.values(enabledMethods(settings, qr)).some(Boolean);
}

/** Safe for admin lists, audit records, emails and logs. */
export function maskedSettings(settings, qr) {
  const methods = enabledMethods(settings, qr);
  return {
    version: settings.version,
    payment_mode: settings.payment_mode,
    methods: {
      bank_transfer: { enabled: Boolean(settings.bank_transfer_enabled), available: methods.BANK_TRANSFER },
      upi: { enabled: Boolean(settings.upi_enabled), available: methods.UPI },
      upi_qr: { enabled: Boolean(settings.upi_qr_enabled), available: methods.UPI_QR },
    },
    bank_account_name: settings.bank_account_name || '',
    bank_name: [settings.bank_name, settings.bank_branch].filter(Boolean).join(' - '),
    bank_account_number_masked: maskAccountNumber(settings.bank_account_number),
    bank_ifsc_masked: maskIfsc(settings.bank_ifsc),
    upi_id_masked: settings.upi_id ? maskUpi(settings.upi_id) : '',
    upi_qr_version: qr?.version || null,
    upi_qr_uploaded_at: qr?.uploaded_at || null,
    payment_instructions: settings.payment_instructions || '',
    support_phone: settings.support_phone || '',
    support_email: settings.support_email || '',
    verification_hours: Number(settings.verification_hours) || 24,
    updated_at: settings.created_date,
  };
}

/**
 * The FULL payment details, for a client with an active funding request.
 *
 * Only enabled-and-configured methods are included, so a disabled method cannot
 * leak its details through this path either. The caller is responsible for
 * having proved ownership first; this function does not check anything.
 */
export function instructionsFor(settings, qr) {
  const methods = enabledMethods(settings, qr);
  const out = { version: settings.version, methods: [] };

  if (methods.BANK_TRANSFER) {
    out.methods.push({
      key: PAYMENT_METHOD.BANK_TRANSFER,
      label: 'Bank transfer',
      fields: {
        account_name: settings.bank_account_name,
        account_number: settings.bank_account_number,
        ifsc: String(settings.bank_ifsc || '').toUpperCase(),
        bank_name: settings.bank_name,
        branch: settings.bank_branch || '',
      },
    });
  }
  if (methods.UPI) {
    out.methods.push({
      key: PAYMENT_METHOD.UPI,
      label: 'UPI',
      fields: { upi_id: settings.upi_id },
    });
  }
  if (methods.UPI_QR) {
    out.methods.push({
      key: PAYMENT_METHOD.UPI_QR,
      label: 'UPI QR',
      // The image itself is a private object; the handler adds a short-lived
      // signed URL. The raw file_uri never leaves the server.
      fields: { qr_version: qr.version, upi_id: settings.upi_enabled ? settings.upi_id : null },
      _file_uri: qr.file_uri,
    });
  }
  out.payment_instructions = settings.payment_instructions || '';
  out.support = { phone: settings.support_phone || '', email: settings.support_email || '' };
  out.verification_hours = Number(settings.verification_hours) || 24;
  return out;
}

/**
 * Save a change as a NEW version and retire the previous one.
 *
 * Returns { settings, changes } where `changes` names the fields that moved —
 * used by the audit record, deliberately without any of the values, so the log
 * says "the account number changed" and never what it changed to.
 */
export async function saveSettings(svc, { patch, actorId, reason }) {
  const current = await activeSettings(svc);

  const next = { ...current };
  delete next.id;
  delete next.created_date;
  delete next.updated_date;
  delete next.created_by_id;

  const TRACKED = [
    'bank_transfer_enabled', 'upi_enabled', 'upi_qr_enabled',
    'bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_name', 'bank_branch',
    'upi_id', 'payment_instructions', 'support_phone', 'support_email', 'verification_hours',
  ];
  const SENSITIVE = new Set(['bank_account_number', 'bank_ifsc', 'upi_id']);

  const changes = [];
  for (const key of TRACKED) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    let value = patch[key];
    if (key === 'bank_ifsc') value = String(value || '').trim().toUpperCase();
    if (key === 'bank_account_number') value = String(value || '').replace(/\s/g, '');
    if (key === 'upi_id') value = String(value || '').trim();
    if (typeof value === 'string') value = value.slice(0, 2000);
    if (String(next[key] ?? '') === String(value ?? '')) continue;
    // The audit trail records WHICH field changed, never the value itself.
    changes.push({ field: key, sensitive: SENSITIVE.has(key) });
    next[key] = value;
  }

  if (!changes.length) return { settings: current, changes: [], unchanged: true };

  next.version = Number(current.version || 0) + 1;
  next.active = true;
  next.created_by_admin = actorId;
  next.change_reason = String(reason || '').slice(0, 500);
  next.superseded_at = null;
  next.superseded_by = null;

  const created = await svc.entities.PaymentSettings.create(next);
  // Retire, never delete: a funding request issued under version 3 must still
  // resolve to version 3.
  await svc.entities.PaymentSettings.update(current.id, {
    active: false,
    superseded_at: new Date().toISOString(),
    superseded_by: created.id,
  }).catch(() => null);

  return { settings: created, changes, previous: current };
}

/** Human-readable audit action for a settings change. */
export function auditActionsFor(changes) {
  const actions = new Set();
  for (const c of changes) {
    if (['bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_name', 'bank_branch'].includes(c.field)) actions.add('BANK_DETAILS_UPDATED');
    else if (c.field === 'upi_id') actions.add('UPI_ID_UPDATED');
    else if (c.field.endsWith('_enabled')) actions.add('PAYMENT_METHOD_TOGGLED');
    else actions.add('PAYMENT_SETTINGS_UPDATED');
  }
  return [...actions];
}
