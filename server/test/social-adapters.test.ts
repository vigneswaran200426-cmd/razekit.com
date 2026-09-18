// The social adapter layer's honesty guarantees.
//
// These tests are not about whether Instagram returns the right number — that
// needs a real token and a real post. They are about the thing that can be
// verified without a provider, and the thing most likely to rot: that a metric
// RazeKit cannot measure never renders as zero.
//
// Every one of these corresponds to a way an analytics product starts lying.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adapterFor, allAdapters, capabilityMatrix, configuredPlatforms,
  METRIC_NAMES, SOCIAL_PLATFORMS, hasValue, absent, metric, withDeclaredAbsences,
  type MetricName,
} from '../src/social/adapters/index.js';
import { sealToken, openToken, safeEqual, tokenStorageConfigured } from '../src/social/tokens.js';

test('every platform has an adapter, and unknown platforms get null', () => {
  for (const p of SOCIAL_PLATFORMS) assert.ok(adapterFor(p), `${p} has no adapter`);
  assert.equal(adapterFor('myspace'), null);
  assert.equal(adapterFor(''), null);
});

test('platform aliases resolve to the same adapter', () => {
  // Submissions arrive with whatever the UI called the platform.
  assert.equal(adapterFor('twitter')?.platform, 'x');
  assert.equal(adapterFor('youtube_shorts')?.platform, 'youtube');
  assert.equal(adapterFor('instagram_reels')?.platform, 'instagram');
  assert.equal(adapterFor('TikTok')?.platform, 'tiktok');
});

test('every adapter declares a verdict for every metric RazeKit stores', () => {
  // A metric with no declaration is the gap through which an undefined becomes
  // a zero somewhere downstream.
  for (const a of allAdapters()) {
    for (const name of METRIC_NAMES) {
      const cap = a.capabilities.find((c) => c.metric === name);
      assert.ok(cap, `${a.platform} does not declare ${name}`);
    }
  }
});

test('an unsupported metric always carries a reason, never an empty note', () => {
  for (const a of allAdapters()) {
    for (const cap of a.capabilities) {
      if (!cap.supported) {
        assert.ok(cap.notes.trim().length > 20,
          `${a.platform}.${cap.metric} is unsupported but does not explain why`);
        assert.equal(cap.apiField, '',
          `${a.platform}.${cap.metric} is unsupported but names an API field`);
      } else {
        assert.ok(cap.apiField.trim().length > 0,
          `${a.platform}.${cap.metric} is supported but names no API field`);
      }
    }
  }
});

test('Reddit tells the truth about how little it can measure', () => {
  // The platform that most tempts a product into inventing numbers. Six of the
  // nine metrics genuinely do not exist on Reddit's Data API.
  const reddit = adapterFor('reddit')!;
  const supported = reddit.capabilities.filter((c) => c.supported).map((c) => c.metric).sort();
  assert.deepEqual(supported, ['comments', 'likes'],
    'Reddit exposes only score and num_comments; anything else is invented');

  const views = reddit.capabilities.find((c) => c.metric === 'views')!;
  assert.equal(views.supported, false);
  assert.match(views.notes, /undocumented/i);
});

test('withDeclaredAbsences fills unsupported metrics with a reason, not a zero', () => {
  const reddit = adapterFor('reddit')!;
  const filled = withDeclaredAbsences(reddit, { likes: metric(42) });

  assert.deepEqual(filled.likes, { value: 42 });
  // The six Reddit cannot do must come back as explicit absences.
  for (const name of ['views', 'shares', 'saves', 'watch_time', 'reach', 'impressions'] as MetricName[]) {
    assert.deepEqual(filled[name], { absent: 'unsupported' }, `${name} should be an explicit absence`);
  }
});

test('an absence is never mistaken for a value', () => {
  assert.equal(hasValue(metric(0)), true, 'a real zero IS a value');
  assert.equal(hasValue(absent('unsupported')), false);
  assert.equal(hasValue(absent('unauthorized')), false);
  assert.equal(hasValue(absent('unavailable')), false);
  assert.equal(hasValue(undefined), false);
  // A genuine provider-reported zero must survive: "nobody liked it" is a fact.
  const zero = metric(0);
  assert.equal(hasValue(zero) && zero.value === 0, true);
});

test('no adapter is configured without credentials, so nothing pretends to work', () => {
  // The test environment has no social credentials set. Every adapter must
  // therefore report itself inert rather than failing later mid-sync.
  assert.deepEqual(configuredPlatforms(), [],
    'an adapter claims to be configured without credentials in env');
  for (const a of allAdapters()) {
    assert.equal(a.configured(), false, `${a.platform} claims to be configured`);
    // beginOAuth must refuse rather than build a URL with an empty client id.
    assert.throws(() => a.beginOAuth('https://razekit.com/cb', 'state'), /not set|not_configured/i,
      `${a.platform} built an OAuth URL with no credentials`);
  }
});

test('the capability matrix covers every platform and every metric', () => {
  const rows = capabilityMatrix();
  assert.equal(rows.length, SOCIAL_PLATFORMS.length);
  for (const row of rows) {
    assert.equal(Object.keys(row.metrics).length, METRIC_NAMES.length);
    assert.ok(row.apiName.length > 0, `${row.platform} has no API name for diagnostics`);
  }
});

// ── Token storage ───────────────────────────────────────────────────────────

test('token storage refuses to write plaintext when no key is configured', () => {
  // No SOCIAL_TOKEN_KEY in the test env. Losing the feature is the correct
  // outcome; storing a creator's access token in the clear is not.
  assert.equal(tokenStorageConfigured(), false);
  assert.throws(() => sealToken('secret-token'), /SOCIAL_TOKEN_KEY/);
  assert.equal(openToken('v1.a.b.c'), null);
});

test('a sealed token round-trips, and a tampered one fails closed', () => {
  process.env.SOCIAL_TOKEN_KEY = 'test-key-for-unit-tests-only';
  try {
    const sealed = sealToken('ya29.super-secret');
    assert.notEqual(sealed, 'ya29.super-secret', 'the token was stored in plaintext');
    assert.ok(sealed.startsWith('v1.'), 'sealed values must be versioned for key rotation');
    assert.equal(openToken(sealed), 'ya29.super-secret');

    // Flip the ciphertext: GCM's auth tag must reject it rather than return junk.
    const parts = sealed.split('.');
    const ct = Buffer.from(parts[3], 'base64url');
    ct[0] ^= 0xff;
    parts[3] = ct.toString('base64url');
    assert.equal(openToken(parts.join('.')), null, 'a tampered token decrypted');

    assert.equal(openToken('garbage'), null);
    assert.equal(openToken('v9.a.b.c'), null, 'an unknown version decrypted');
  } finally {
    delete process.env.SOCIAL_TOKEN_KEY;
  }
});

test('OAuth state comparison is length-safe and rejects mismatches', () => {
  assert.equal(safeEqual('abc123', 'abc123'), true);
  assert.equal(safeEqual('abc123', 'abc124'), false);
  // Different lengths must return false, not throw — timingSafeEqual throws.
  assert.doesNotThrow(() => safeEqual('short', 'muchlongervalue'));
  assert.equal(safeEqual('short', 'muchlongervalue'), false);
  // An empty state must never match, or a callback with no state would pass.
  assert.equal(safeEqual('', ''), false);
});
