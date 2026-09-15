// Image generation tests.
//
// The provider is stubbed at the global fetch boundary so the real request
// building, response parsing, validation and error mapping are all exercised —
// and so running the suite costs nothing. A real generation is a paid call; a
// test suite that makes dozens of them is a bill, not a safety net.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.IMAGE_DRIVER = 'openai';
process.env.OPENAI_API_KEY = 'test-key-not-a-real-credential';

const { generateImage, sniffImageMime, assertUsableImage, ImageGenerationError } =
  await import('../src/integrations/image.js');
const { createStorageProvider } = await import('../src/visual/storage.js');

const realFetch = globalThis.fetch;

/** A minimal but genuinely valid PNG, padded past the minimum-size floor. */
function pngBytes(size = 2048) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, size - header.length), 7)]);
}

function stubFetch(handler: (url: string, init: any) => any) {
  globalThis.fetch = (async (url: any, init: any = {}) => handler(String(url), init)) as any;
}
function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// ── Magic-byte sniffing ─────────────────────────────────────────────────────

test('an image is identified by its bytes, not by a declared content type', () => {
  assert.equal(sniffImageMime(pngBytes()), 'image/png');
  assert.equal(sniffImageMime(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(16)])), 'image/jpeg');
  // An HTML error page served with Content-Type: image/png is the exact case
  // that used to get stored as artwork.
  assert.equal(sniffImageMime(Buffer.from('<!doctype html><html>error</html>')), null);
});

test('a response too small to be an image is rejected', () => {
  assert.throws(() => assertUsableImage(Buffer.from([0x89, 0x50, 0x4e, 0x47])), /too small/i);
  assert.throws(() => assertUsableImage(Buffer.alloc(0)), /no data/i);
});

test('an unrecognised payload is rejected rather than stored', () => {
  assert.throws(() => assertUsableImage(Buffer.alloc(4096, 0x41)), /not a recognised image/i);
});

// ── The GPT image path: base64, never a URL ─────────────────────────────────

test('a gpt-image response is decoded from base64 into real bytes', async () => {
  const png = pngBytes();
  stubFetch((url, init) => {
    assert.match(url, /\/v1\/images\/generations$/);
    const body = JSON.parse(init.body);
    assert.equal(body.n, 1);
    assert.ok(body.prompt.length > 0);
    // A size the current API does not accept is a 400 for every call.
    assert.ok(['1024x1024', '1024x1536', '1536x1024', 'auto'].includes(body.size));
    return jsonRes({ data: [{ b64_json: png.toString('base64') }], model: 'gpt-image-1', size: '1536x1024' });
  });
  const out = await generateImage({ prompt: 'a cinematic night city' });
  assert.ok(Buffer.isBuffer(out.bytes));
  assert.equal(out.mime, 'image/png');
  assert.equal(out.placeholder, false);
  assert.ok(out.bytes.equals(png), 'the decoded bytes must be exactly what the provider sent');
  globalThis.fetch = realFetch;
});

test('a dall-e URL response is DOWNLOADED, not stored as a link', async () => {
  // The URL expires within the hour. Persisting it would work in testing and
  // be broken by morning.
  const png = pngBytes();
  let downloaded = false;
  stubFetch((url) => {
    if (url.includes('/v1/images/generations')) return jsonRes({ data: [{ url: 'https://oai.example/img.png' }] });
    downloaded = true;
    return new Response(png, { status: 200 });
  });
  const out = await generateImage({ prompt: 'x' });
  assert.ok(downloaded, 'the image must be fetched, not merely referenced');
  assert.ok(out.bytes.equals(png));
  globalThis.fetch = realFetch;
});

// ── Error mapping, and what may be retried ──────────────────────────────────

test('a rejected credential is not retried', async () => {
  stubFetch(() => jsonRes({ error: { message: 'Incorrect API key' } }, 401));
  const err: any = await generateImage({ prompt: 'x' }).catch((e) => e);
  assert.equal(err.code, 'OPENAI_AUTH_ERROR');
  assert.equal(err.retryable, false);
  globalThis.fetch = realFetch;
});

test('a rate limit is retryable but an exhausted quota is not', async () => {
  stubFetch(() => jsonRes({ error: { message: 'Rate limit reached' } }, 429));
  const rate: any = await generateImage({ prompt: 'x' }).catch((e) => e);
  assert.equal(rate.code, 'OPENAI_RATE_LIMIT');
  assert.equal(rate.retryable, true);

  stubFetch(() => jsonRes({ error: { message: 'You exceeded your current quota, please check your billing' } }, 429));
  const quota: any = await generateImage({ prompt: 'x' }).catch((e) => e);
  assert.equal(quota.code, 'OPENAI_QUOTA_EXCEEDED');
  // Retrying a billing failure spends attempts against a wall.
  assert.equal(quota.retryable, false);
  globalThis.fetch = realFetch;
});

test('a content-policy refusal is surfaced as such and never retried', async () => {
  stubFetch(() => jsonRes({ error: { message: 'Your request was rejected by our safety system', type: 'image_generation_user_error' } }, 400));
  const err: any = await generateImage({ prompt: 'x' }).catch((e) => e);
  assert.equal(err.code, 'OPENAI_POLICY_REJECTION');
  assert.equal(err.retryable, false);
  globalThis.fetch = realFetch;
});

test('an unknown model is reported as a model problem, not a generic failure', async () => {
  stubFetch(() => jsonRes({ error: { message: "The model 'openai-image-auto' does not exist" } }, 400));
  const err: any = await generateImage({ prompt: 'x' }).catch((e) => e);
  assert.equal(err.code, 'OPENAI_MODEL_UNAVAILABLE');
  globalThis.fetch = realFetch;
});

test('a provider server error IS retryable', async () => {
  stubFetch(() => jsonRes({ error: { message: 'internal' } }, 500));
  const err: any = await generateImage({ prompt: 'x' }).catch((e) => e);
  assert.equal(err.code, 'OPENAI_SERVER_ERROR');
  assert.equal(err.retryable, true);
  globalThis.fetch = realFetch;
});

test('a malformed image is a failure, not a stored asset', async () => {
  stubFetch(() => jsonRes({ data: [{ b64_json: Buffer.from('<html>nope</html>').toString('base64') }] }));
  const err: any = await generateImage({ prompt: 'x' }).catch((e) => e);
  assert.equal(err.code, 'IMAGE_VALIDATION_ERROR');
  globalThis.fetch = realFetch;
});

test('a response with no image at all is a failure', async () => {
  stubFetch(() => jsonRes({ data: [] }));
  const err: any = await generateImage({ prompt: 'x' }).catch((e) => e);
  assert.equal(err.code, 'OPENAI_INVALID_RESPONSE');
  globalThis.fetch = realFetch;
});

// ── The rule that matters most ──────────────────────────────────────────────

test('a provider failure NEVER silently returns a placeholder', async () => {
  // This is the behaviour the product depends on. A caller that cannot tell
  // "OpenAI refused" from "here is your artwork" ships the placeholder
  // believing it is real — which is how campaign art comes to look machine-made.
  stubFetch(() => jsonRes({ error: { message: 'Incorrect API key' } }, 401));
  let returned: any = null;
  try { returned = await generateImage({ prompt: 'x' }); } catch { /* expected */ }
  assert.equal(returned, null, 'generateImage must throw, not fall back');
  globalThis.fetch = realFetch;
});

test('an empty prompt is refused before any paid call is made', async () => {
  let called = false;
  stubFetch(() => { called = true; return jsonRes({}); });
  const err: any = await generateImage({ prompt: '   ' }).catch((e) => e);
  assert.equal(err.code, 'IMAGE_PROMPT_REQUIRED');
  assert.equal(called, false, 'no request should reach the provider');
  globalThis.fetch = realFetch;
});

// ── Storage will not accept a URL ───────────────────────────────────────────

test('the storage layer refuses anything that is not bytes', async () => {
  // The old implementation accepted a URL and quietly stored nothing. Being
  // handed bytes is what forces it to actually put them somewhere.
  const storage = createStorageProvider();
  const ctx = { entityType: 'Contest', entityId: 'c1', assetType: 'cover', version: 1 };
  await assert.rejects(
    () => storage.store('https://example.com/image.png', ctx),
    /requires image bytes/i,
  );
  await assert.rejects(() => storage.store({ bytes: null, mime: 'image/png' }, ctx), /requires image bytes/i);
});

test('the object key is versioned and derives its extension from the real mime', async () => {
  const { storageKeyFor } = await import('../src/visual/storage.js');
  const ctx = { entityType: 'Contest', entityId: 'c1', assetType: 'cover', version: 3 };
  assert.match(storageKeyFor(ctx, 'image/png'), /visual-assets.*c1.*cover.*v3\.png$/);
  assert.match(storageKeyFor(ctx, 'image/webp'), /v3\.webp$/);
  // Versioned keys mean a regeneration writes a NEW object instead of
  // overwriting the artwork a live campaign is currently showing.
  assert.notEqual(storageKeyFor({ ...ctx, version: 4 }, 'image/png'), storageKeyFor(ctx, 'image/png'));
});
