// Image generation.
//
// Returns real image BYTES, never a URL. That is the whole point of this file's
// shape, and it is what the previous version got wrong: it returned the
// provider's response as a URL string, which the storage layer then stored
// verbatim. For a GPT image model that meant a multi-megabyte
// `data:image/png;base64,...` string written into a database column and served
// to every browser; for DALL-E it meant persisting a URL that expires within
// the hour, so the campaign artwork worked in testing and was broken by morning.
//
// Verified against the current OpenAI Images API: GPT image models return
// base64 JSON and never a URL, while dall-e-2 / dall-e-3 default to a URL. Both
// shapes are handled here and both come out the same way — as bytes.
//
// IMAGE_DRIVER=stub is a DEVELOPMENT placeholder and says so in its result. It
// is deliberately obvious rather than pretty: a plausible-looking stub is how
// placeholder art ends up shipped to production believed to be real.
import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config.js';

export interface GeneratedImage {
  bytes: Buffer;
  mime: string;
  provider: string;
  model: string;
  generationId: string;
  /** True when this is a local placeholder, not provider output. Never dropped. */
  placeholder: boolean;
  width?: number | null;
  height?: number | null;
}

/** Errors a caller can branch on without matching on message text. */
export class ImageGenerationError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  constructor(code: string, message: string, status = 502, retryable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Identify an image by its magic bytes.
 *
 * The provider's declared content type is not evidence. Checking the actual
 * leading bytes is what stops an error page, a truncated stream, or an empty
 * body being stored as a PNG and rendering as a broken image forever.
 */
export function sniffImageMime(buf: Buffer): string | null {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 6).toString('ascii') === 'GIF89a' || buf.subarray(0, 6).toString('ascii') === 'GIF87a') return 'image/gif';
  // SVG is text and is only ever produced by our own stub, never by a provider.
  const head = buf.subarray(0, 256).toString('utf8').trimStart();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'image/svg+xml';
  return null;
}

/** 25 MB. Large enough for a 1536x1024 PNG, small enough to bound memory. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** Below this, it is an error body or a truncated stream, not an image. */
const MIN_IMAGE_BYTES = 512;

export function assertUsableImage(bytes: Buffer): string {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new ImageGenerationError('IMAGE_VALIDATION_ERROR', 'The image provider returned no data.', 502);
  }
  if (bytes.length < MIN_IMAGE_BYTES) {
    throw new ImageGenerationError('IMAGE_VALIDATION_ERROR', 'The image provider returned a response too small to be an image.', 502);
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new ImageGenerationError('IMAGE_VALIDATION_ERROR', 'The generated image is larger than RazeKit will store.', 502);
  }
  const mime = sniffImageMime(bytes);
  if (!mime) {
    throw new ImageGenerationError('IMAGE_VALIDATION_ERROR', 'The image provider returned data that is not a recognised image.', 502);
  }
  return mime;
}

/** Map an OpenAI failure onto a code the app can act on. */
function mapOpenAiError(status: number, body: any): ImageGenerationError {
  const message = String(body?.error?.message || `OpenAI returned ${status}.`).slice(0, 300);
  const type = String(body?.error?.type || '');
  if (status === 401 || status === 403) {
    return new ImageGenerationError('OPENAI_AUTH_ERROR', 'The OpenAI credential was rejected.', 502, false);
  }
  if (status === 429) {
    // Rate limits pass; a spent quota does not — retrying a billing failure
    // just burns attempts against a wall.
    const quota = /quota|billing|insufficient/i.test(message);
    return new ImageGenerationError(
      quota ? 'OPENAI_QUOTA_EXCEEDED' : 'OPENAI_RATE_LIMIT',
      quota ? 'The OpenAI account has no image quota remaining.' : 'OpenAI is rate limiting image generation.',
      502, !quota,
    );
  }
  if (status === 400 && /safety|policy|content/i.test(message + type)) {
    return new ImageGenerationError('OPENAI_POLICY_REJECTION', 'OpenAI declined this prompt on content policy grounds.', 422, false);
  }
  if (status === 400 && /model/i.test(message)) {
    return new ImageGenerationError('OPENAI_MODEL_UNAVAILABLE', `The configured image model was rejected: ${message}`, 502, false);
  }
  if (status === 400) {
    return new ImageGenerationError('OPENAI_INVALID_REQUEST', message, 502, false);
  }
  if (status >= 500) {
    return new ImageGenerationError('OPENAI_SERVER_ERROR', 'OpenAI had a server error generating the image.', 502, true);
  }
  return new ImageGenerationError('OPENAI_UNKNOWN_ERROR', message, 502, false);
}

/** Sizes the current Images API accepts. Anything else is a 400. */
const ALLOWED_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024', 'auto']);

async function generateWithOpenAi(prompt: string, signal: AbortSignal): Promise<GeneratedImage> {
  const model = config.image.model;
  const size = ALLOWED_SIZES.has(config.image.size) ? config.image.size : '1536x1024';

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.image.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, prompt, n: 1, size }),
      signal,
    });
  } catch (e: any) {
    throw e?.name === 'AbortError'
      ? new ImageGenerationError('OPENAI_TIMEOUT', 'OpenAI did not respond in time.', 504, true)
      : new ImageGenerationError('OPENAI_NETWORK_ERROR', 'Could not reach OpenAI.', 504, true);
  }

  const raw = await res.text().catch(() => '');
  let body: any = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) throw mapOpenAiError(res.status, body);

  const item = body?.data?.[0];
  if (!item) {
    throw new ImageGenerationError('OPENAI_INVALID_RESPONSE', 'OpenAI returned no image in the response.', 502, true);
  }

  let bytes: Buffer;
  if (item.b64_json) {
    // The GPT image models' only output shape.
    bytes = Buffer.from(String(item.b64_json), 'base64');
  } else if (item.url) {
    // dall-e-2 / dall-e-3. The URL expires, so it is fetched here and persisted
    // as bytes rather than stored and hoped about.
    const imgRes = await fetch(String(item.url), { signal, redirect: 'follow' }).catch(() => null);
    if (!imgRes || !imgRes.ok) {
      throw new ImageGenerationError('OPENAI_IMAGE_FETCH_FAILED', 'The generated image could not be downloaded before its URL expired.', 502, true);
    }
    bytes = Buffer.from(await imgRes.arrayBuffer());
  } else {
    throw new ImageGenerationError('OPENAI_INVALID_RESPONSE', 'OpenAI returned neither image data nor a URL.', 502, true);
  }

  const mime = assertUsableImage(bytes);
  const [w, h] = String(body?.size || size).split('x').map((n: string) => Number(n) || null);

  return {
    bytes,
    mime,
    provider: 'openai',
    model: String(body?.model || model),
    // OpenAI does not return a generation id on this endpoint, so one is minted
    // here. It exists to correlate our own records, not to address anything of
    // theirs — pretending otherwise would make debugging worse, not better.
    generationId: `openai_${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}`,
    placeholder: false,
    width: w,
    height: h,
  };
}

/**
 * Generate one campaign image.
 *
 * Throws on failure. It never falls back to the placeholder when a real
 * provider was configured and failed — a caller that cannot tell "OpenAI
 * refused this prompt" from "here is your artwork" will ship the placeholder
 * believing it is real, which is exactly how the current campaign art ended up
 * looking machine-made.
 */
export async function generateImage(
  { prompt, timeoutMs = 120_000 }: { prompt: string; timeoutMs?: number },
): Promise<GeneratedImage> {
  if (!prompt || !String(prompt).trim()) {
    throw new ImageGenerationError('IMAGE_PROMPT_REQUIRED', 'A prompt is required to generate an image.', 400);
  }

  if (config.image.driver === 'openai') {
    if (!config.image.openaiApiKey) {
      throw new ImageGenerationError('OPENAI_NOT_CONFIGURED', 'Image generation is not configured.', 503, false);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await generateWithOpenAi(String(prompt), controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Development placeholder ───────────────────────────────────────────────
  // Deterministic from the prompt so a given campaign always looks the same,
  // and labelled in the image itself so nobody mistakes it for artwork.
  const hash = createHash('sha256').update(String(prompt)).digest('hex');
  const c1 = `#${hash.slice(0, 6)}`;
  const c2 = `#${hash.slice(6, 12)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`
    + `<rect width="1536" height="1024" fill="url(#g)"/>`
    + `<text x="768" y="500" text-anchor="middle" font-family="sans-serif" font-size="46" fill="#ffffff" opacity="0.92">PLACEHOLDER</text>`
    + `<text x="768" y="556" text-anchor="middle" font-family="sans-serif" font-size="25" fill="#ffffff" opacity="0.72">`
    + `IMAGE_DRIVER=stub — no image provider configured</text></svg>`;
  const bytes = Buffer.from(svg, 'utf8');
  return {
    bytes,
    mime: 'image/svg+xml',
    provider: 'stub',
    model: 'stub-placeholder',
    generationId: `stub_${randomUUID()}`,
    placeholder: true,
    width: 1536,
    height: 1024,
  };
}
