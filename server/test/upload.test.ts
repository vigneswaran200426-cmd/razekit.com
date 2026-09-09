import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUpload, MAX_UPLOAD_BYTES } from '../src/integrations/uploadGuard.js';

const png = (extra = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra)]);
const file = (o: any) => ({ buffer: png(), size: 100, mimetype: 'image/png', originalname: 'a.png', ...o });

test('a genuine PNG is accepted and gets a generated name', () => {
  const r: any = validateUpload(file({}));
  assert.equal(r.ok, true);
  assert.match(r.storageName, /^[a-z0-9]+-[a-f0-9]{16}\.png$/);
});

// Spec 22: reject executables and unsafe SVG.
test('executable and script types are rejected', () => {
  for (const mt of ['application/x-msdownload', 'text/html', 'image/svg+xml', 'application/javascript', 'application/x-sh']) {
    assert.equal(validateUpload(file({ mimetype: mt })).ok, false, mt);
  }
});

test('a dangerous extension is rejected even with a benign MIME', () => {
  for (const n of ['payload.exe', 'x.svg', 'a.html', 'run.sh', 'evil.php']) {
    assert.equal(validateUpload(file({ originalname: n })).ok, false, n);
  }
});

test('content must match the declared type (renamed executable)', () => {
  const mz = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(20)]); // PE header
  const r = validateUpload(file({ buffer: mz, originalname: 'image.png', mimetype: 'image/png' }));
  assert.equal(r.ok, false);
  assert.match(r.message, /does not match/i);
});

test('a RIFF container cannot masquerade as WEBP', () => {
  const riff = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('AVI ')]);
  assert.equal(validateUpload(file({ buffer: riff, mimetype: 'image/webp', originalname: 'x.webp' })).ok, false);
});

// Path traversal is structurally impossible: we never use the caller's name.
test('the caller filename never reaches storage', () => {
  const r: any = validateUpload(file({ originalname: '../../../../etc/passwd.png' }));
  assert.equal(r.ok, true);
  assert.ok(!r.storageName.includes('..'));
  assert.ok(!r.storageName.includes('/'));
  assert.ok(!r.storageName.includes('passwd'));
});

test('size limits enforced', () => {
  assert.equal(validateUpload(file({ size: 0, buffer: Buffer.alloc(0) })).ok, false);
  assert.equal(validateUpload(file({ size: MAX_UPLOAD_BYTES + 1 })).ok, false);
  assert.equal(validateUpload(file({ size: 20 * 1024 * 1024 })).ok, false); // image over per-type cap
});
