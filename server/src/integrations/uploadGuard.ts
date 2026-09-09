// @ts-nocheck
// File upload validation (spec 22).
//
// Uploads previously accepted any content type up to 512 MB and passed the
// caller's `originalname` straight to storage. That allowed executables, unsafe
// SVG (script-bearing, so a stored XSS via a public file URL), and path
// traversal through crafted filenames.
//
// Rules here: allowlist the types RazeKit actually needs, sniff magic bytes
// where a signature exists (so a renamed .exe cannot pose as a .png), and
// always generate the storage name ourselves.
import { randomBytes } from 'node:crypto';

// 200 MB: generous for contest video, far below the old 512 MB.
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
// Images/documents have no reason to be large.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const ALLOWED = {
  'image/jpeg': { ext: 'jpg', max: MAX_IMAGE_BYTES, magic: [[0xff, 0xd8, 0xff]] },
  'image/png': { ext: 'png', max: MAX_IMAGE_BYTES, magic: [[0x89, 0x50, 0x4e, 0x47]] },
  'image/webp': { ext: 'webp', max: MAX_IMAGE_BYTES, magic: [[0x52, 0x49, 0x46, 0x46]] },
  'image/gif': { ext: 'gif', max: MAX_IMAGE_BYTES, magic: [[0x47, 0x49, 0x46, 0x38]] },
  'video/mp4': { ext: 'mp4', max: MAX_UPLOAD_BYTES, magic: null },
  'video/quicktime': { ext: 'mov', max: MAX_UPLOAD_BYTES, magic: null },
  'video/webm': { ext: 'webm', max: MAX_UPLOAD_BYTES, magic: [[0x1a, 0x45, 0xdf, 0xa3]] },
  'application/pdf': { ext: 'pdf', max: MAX_IMAGE_BYTES, magic: [[0x25, 0x50, 0x44, 0x46]] },
};

// Never accepted, whatever the declared type says.
const BANNED_EXT = new Set([
  'exe', 'dll', 'bat', 'cmd', 'com', 'msi', 'sh', 'bash', 'ps1', 'jar', 'app',
  'scr', 'vbs', 'js', 'mjs', 'php', 'py', 'rb', 'pl', 'html', 'htm', 'svg', 'xhtml',
]);

function extOf(name) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

function magicOk(buf, magic) {
  if (!magic) return true;             // no reliable signature for this type
  if (!buf || buf.length < 4) return false;
  return magic.some((sig) => sig.every((b, i) => buf[i] === b));
}

/**
 * Validate an upload.
 * @returns { ok: true, storageName, ext } | { ok: false, message }
 */
export function validateUpload(file) {
  if (!file || !file.buffer) return { ok: false, message: 'No file was received.' };

  const size = file.size ?? file.buffer.length;
  if (size <= 0) return { ok: false, message: 'That file is empty.' };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, message: 'That file is too large.' };

  const declared = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
  const rule = ALLOWED[declared];
  if (!rule) return { ok: false, message: 'That file type is not supported.' };
  if (size > rule.max) return { ok: false, message: 'That file is too large for its type.' };

  // A dangerous extension is rejected even when the declared MIME looks fine.
  const claimed = extOf(file.originalname);
  if (BANNED_EXT.has(claimed)) return { ok: false, message: 'That file type is not supported.' };

  // Content must match the declared type where a signature exists.
  if (!magicOk(file.buffer, rule.magic)) {
    return { ok: false, message: 'That file does not match its declared type.' };
  }

  // WEBP is RIFF-prefixed; confirm the WEBP marker so any RIFF container
  // (e.g. .avi) cannot masquerade as an image.
  if (declared === 'image/webp') {
    const tag = file.buffer.slice(8, 12).toString('ascii');
    if (tag !== 'WEBP') return { ok: false, message: 'That file does not match its declared type.' };
  }

  // Storage name is ALWAYS generated — the caller's filename never reaches the
  // filesystem or object key, so path traversal is structurally impossible.
  const storageName = `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}.${rule.ext}`;
  return { ok: true, storageName, ext: rule.ext, mimetype: declared };
}
