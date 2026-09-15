import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePublicationUrl,
  assertPlatformAllowed,
  publicationEvidence,
  PLATFORM_PATTERNS,
  URL_STATUS,
  enforceSubmissionPublication,
  touchesPublication,
} from '../src/social/publication.js';

// A published link is the only thing standing behind "View on Instagram" in the
// Winners Hub, so every one of these cases is a way that link could lie.

test('a real Instagram reel URL parses, with the shortcode extracted', () => {
  const r = parsePublicationUrl('https://www.instagram.com/reel/C8xYz-1AbCd/');
  assert.equal(r.ok, true);
  assert.equal(r.platform, 'instagram');
  assert.equal(r.external_id, 'C8xYz-1AbCd');
  assert.equal(r.normalized_url, 'https://www.instagram.com/reel/C8xYz-1AbCd/');
  // The reason must never imply RazeKit opened the post.
  assert.match(r.reason, /has not opened the post/);
});

test('http:// is refused — evidence must not be tamperable in transit', () => {
  const r = parsePublicationUrl('http://www.instagram.com/reel/C8xYz-1AbCd/');
  assert.equal(r.ok, false);
  assert.equal(r.platform, null);
  assert.equal(r.normalized_url, null);
  assert.match(r.reason, /https/);
});

test('a lookalike host is not Instagram', () => {
  const r = parsePublicationUrl('https://instagram.com.evil.example/reel/C8xYz-1AbCd/');
  assert.equal(r.ok, false);
  assert.equal(r.platform, null);
  assert.match(r.reason, /does not recognise/);
});

test('private and link-local addresses are refused (SSRF hygiene)', () => {
  for (const host of ['10.0.0.5', '127.0.0.1', '169.254.169.254', '192.168.1.10']) {
    const r = parsePublicationUrl(`https://${host}/p/C8xYz-1AbCd/`);
    assert.equal(r.ok, false, `${host} must be refused`);
    assert.equal(r.normalized_url, null);
  }
});

test('credentials and ports are refused', () => {
  assert.equal(parsePublicationUrl('https://user:pw@www.instagram.com/reel/C8xYz-1AbCd/').ok, false);
  assert.equal(parsePublicationUrl('https://www.instagram.com:8443/reel/C8xYz-1AbCd/').ok, false);
});

test('tracking parameters are stripped, identity parameters survive', () => {
  const ig = parsePublicationUrl('https://www.instagram.com/reel/C8xYz-1AbCd/?igsh=abc123&utm_source=share');
  assert.equal(ig.ok, true);
  assert.equal(ig.normalized_url, 'https://www.instagram.com/reel/C8xYz-1AbCd/');

  // YouTube keeps ?v= (it IS the post id) and drops si/t/feature.
  const yt = parsePublicationUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=TRACKER&t=42&feature=share');
  assert.equal(yt.ok, true);
  assert.equal(yt.platform, 'youtube');
  assert.equal(yt.external_id, 'dQw4w9WgXcQ');
  assert.equal(yt.normalized_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});

test('a contest with required_platform refuses another platform, naming the one it wants', () => {
  const contest = { id: 'c1', required_platform: 'instagram' }; // the RazeKit promo contests
  const yt = parsePublicationUrl('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(yt.platform, 'youtube');

  assert.throws(
    () => assertPlatformAllowed({ contest, platform: yt.platform }),
    (e: any) => {
      assert.match(e.message, /Instagram/);
      assert.equal(e.status, 422);
      return true;
    }
  );

  // The Instagram entry the same contest does want.
  const ig = parsePublicationUrl('https://www.instagram.com/reel/C8xYz-1AbCd/');
  assert.equal(assertPlatformAllowed({ contest, platform: ig.platform }).required, 'instagram');
  // A contest with no platform rule accepts either.
  assert.equal(assertPlatformAllowed({ contest: { id: 'c2' }, platform: 'youtube' }).required, null);
});

test('profile links, shorteners and non-post paths are not post evidence', () => {
  for (const url of [
    'https://www.instagram.com/somecreator/',            // profile, not a post
    'https://vm.tiktok.com/ZSabc123/',                   // share shortener: opaque id, never resolved
    'https://www.youtube.com/results?search_query=x',    // search page
    'https://www.youtube.com/watch?v=',                  // no video
  ]) {
    assert.equal(parsePublicationUrl(url).ok, false, `${url} must not parse as a post`);
  }
});

test('other supported platforms parse to their post id', () => {
  assert.equal(parsePublicationUrl('https://www.tiktok.com/@creator/video/7312345678901234567').external_id, '7312345678901234567');
  assert.equal(parsePublicationUrl('https://twitter.com/creator/status/1712345678901234567').platform, 'x');
  assert.equal(parsePublicationUrl('https://www.facebook.com/reel/1234567890123').platform, 'facebook');
  assert.equal(parsePublicationUrl('https://www.linkedin.com/feed/update/urn:li:activity:7112345678901234567/').platform, 'linkedin');
});

test('publicationEvidence is all-null until a link was actually verified', () => {
  // No link at all.
  assert.deepEqual(publicationEvidence({ url_status: URL_STATUS.NOT_PUBLISHED }), {
    platform: null, original_post_url: null, original_published_at: null, embed_available: false,
  });
  // A row claiming link_valid with a link that does not parse gets nothing:
  // the stored row is re-checked, never trusted.
  assert.deepEqual(publicationEvidence({ url_status: URL_STATUS.LINK_VALID, live_url: 'http://evil.example/p/x/' }), {
    platform: null, original_post_url: null, original_published_at: null, embed_available: false,
  });
});

test('embed_available is true only where the platform has a genuine public embed', () => {
  const ytRow = {
    url_status: URL_STATUS.LINK_VALID,
    live_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    published_at: '2026-09-01T10:00:00.000Z',
  };
  const yt = publicationEvidence(ytRow);
  assert.equal(yt.platform, 'youtube');
  assert.equal(yt.original_post_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(yt.original_published_at, '2026-09-01T10:00:00.000Z');
  assert.equal(yt.embed_available, true);

  // Instagram has no embed RazeKit can rely on without a Meta token, so the Hub
  // falls back to RazeKit-hosted media plus a "View on Instagram" link.
  const ig = publicationEvidence({ url_status: URL_STATUS.LINK_VALID, live_url: 'https://www.instagram.com/reel/C8xYz-1AbCd/' });
  assert.equal(ig.embed_available, false);
  assert.equal(ig.original_post_url, 'https://www.instagram.com/reel/C8xYz-1AbCd/');
  assert.equal(ig.original_published_at, null); // never invented when unknown

  assert.equal(PLATFORM_PATTERNS.youtube.embed, true);
  for (const key of ['instagram', 'tiktok', 'x', 'facebook', 'linkedin'] as const) {
    assert.equal(PLATFORM_PATTERNS[key].embed, false, `${key} must not claim an embed`);
    assert.ok(PLATFORM_PATTERNS[key].embedNote.length > 10, `${key} must say why`);
  }
});

// ── The entity-service guard ────────────────────────────────────────────────
// This is what actually runs on every Submission write, so it is tested at the
// same level the entity service calls it.

const raise = (message: string, status: number) => {
  const e: any = new Error(message);
  e.status = status;
  throw e;
};

test('the stored platform comes from the URL, not from what the client called it', () => {
  // A creator labelling an Instagram link "YouTube" to dodge an Instagram-only
  // contest is exactly the forgery this closes.
  const data: any = { contest_id: 'c1', platform: 'YouTube', live_url: 'https://www.instagram.com/reel/C8xYz-1AbCd/?igsh=x' };
  enforceSubmissionPublication(data, { contest: { id: 'c1', required_platform: 'Instagram' }, prev: null }, raise);
  assert.equal(data.platform, 'instagram');
  assert.equal(data.live_url, 'https://www.instagram.com/reel/C8xYz-1AbCd/');
  assert.equal(data.url_status, URL_STATUS.LINK_VALID);
  assert.equal(data.post_external_id, 'C8xYz-1AbCd');
  assert.equal(data.platform_locked, true);
  assert.ok(data.url_checked_at);
  assert.ok(data.published_at); // first moment RazeKit saw the link live
});

test('a client cannot forge url_status, post_external_id or published_at', () => {
  const data: any = {
    contest_id: 'c1',
    live_url: '',
    url_status: URL_STATUS.LINK_VALID,
    post_external_id: 'FAKE123',
    published_at: '2020-01-01T00:00:00.000Z',
  };
  enforceSubmissionPublication(data, { contest: null, prev: null }, raise);
  assert.equal(data.url_status, URL_STATUS.NOT_PUBLISHED);
  assert.equal(data.post_external_id, null);
  assert.equal(data.published_at, null);

  // published_at is only ever carried from the row, never from the write.
  const edit: any = { contest_id: 'c1', live_url: 'https://www.instagram.com/reel/C8xYz-1AbCd/', published_at: '2020-01-01T00:00:00.000Z' };
  enforceSubmissionPublication(edit, { contest: null, prev: { published_at: '2026-09-01T10:00:00.000Z' } }, raise);
  assert.equal(edit.published_at, '2026-09-01T10:00:00.000Z');
});

test('an Instagram-only contest refuses a YouTube entry at 422', () => {
  const data: any = { contest_id: 'c1', live_url: 'https://youtu.be/dQw4w9WgXcQ' };
  assert.throws(
    () => enforceSubmissionPublication(data, { contest: { required_platform: 'instagram' }, prev: null }, raise),
    (e: any) => {
      assert.equal(e.status, 422);
      assert.match(e.message, /Instagram/);
      return true;
    }
  );
  // An unparseable link is refused the same way, with a reason a creator can act on.
  assert.throws(
    () => enforceSubmissionPublication({ contest_id: 'c1', live_url: 'https://www.instagram.com/somecreator/' }, { contest: null, prev: null }, raise),
    (e: any) => e.status === 422
  );
});

test('an unrelated edit never re-validates (and never retro-breaks) an existing entry', () => {
  const prev = { live_url: 'https://www.instagram.com/reel/C8xYz-1AbCd/', platform: 'instagram', url_status: URL_STATUS.LINK_VALID };
  assert.equal(touchesPublication({ title: 'New title' }, prev), false);
  assert.equal(touchesPublication({ live_url: prev.live_url }, prev), false); // unchanged re-send
  assert.equal(touchesPublication({ live_url: 'https://youtu.be/dQw4w9WgXcQ' }, prev), true);
  assert.equal(touchesPublication({ url_status: URL_STATUS.NOT_PUBLISHED }, prev), true); // forgery attempt re-derives
  assert.equal(touchesPublication({ platform: 'YouTube' }, prev), true);
});
