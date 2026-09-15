// The development placeholder, tested in its own file.
//
// config.ts reads process.env once at module load, so IMAGE_DRIVER cannot be
// flipped part-way through a suite — the earlier attempt to do that silently
// kept the openai driver and made a real network call with a fake key. Setting
// it before the first import is the only honest way to exercise this path.
process.env.IMAGE_DRIVER = 'stub';
delete process.env.OPENAI_API_KEY;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateImage, sniffImageMime } from '../src/integrations/image.js';

test('the stub driver labels itself a placeholder, in the image and in the result', async () => {
  const out = await generateImage({ prompt: 'a cinematic night city' });
  // Both matter: the flag is what code branches on, the visible text is what
  // stops a human mistaking it for artwork in a screenshot.
  assert.equal(out.placeholder, true);
  assert.equal(out.provider, 'stub');
  assert.match(out.bytes.toString('utf8'), /PLACEHOLDER/);
  assert.match(out.bytes.toString('utf8'), /no image provider configured/i);
  assert.equal(sniffImageMime(out.bytes), 'image/svg+xml');
});

test('the placeholder is deterministic for a given prompt', async () => {
  // A campaign should not change appearance on every page load just because
  // no provider is configured.
  const a = await generateImage({ prompt: 'same brief' });
  const b = await generateImage({ prompt: 'same brief' });
  const c = await generateImage({ prompt: 'different brief' });
  assert.ok(a.bytes.equals(b.bytes));
  assert.ok(!a.bytes.equals(c.bytes));
});

test('the stub never reaches the network', async () => {
  const real = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response('{}'); }) as any;
  await generateImage({ prompt: 'x' });
  globalThis.fetch = real;
  assert.equal(called, false);
});
