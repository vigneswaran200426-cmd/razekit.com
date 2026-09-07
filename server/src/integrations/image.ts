// Image generation — replaces Base44 integrations.Core.GenerateImage.
// stub  → deterministic offline SVG placeholder (no key, dev)
// openai → OpenAI Images API (set OPENAI_API_KEY)
import { createHash } from 'node:crypto';
import { config } from '../config.js';

export async function generateImage({ prompt }: { prompt: string }): Promise<{ url: string }> {
  if (config.image.driver === 'openai') {
    if (!config.image.openaiApiKey) throw new Error('OPENAI_API_KEY not set');
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.image.openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.image.model, prompt, size: '1536x1024', n: 1 }),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(`OPENAI_IMAGE_ERROR:${data?.error?.message || res.status}`);
    const item = data.data?.[0];
    if (item?.url) return { url: item.url };
    if (item?.b64_json) return { url: `data:image/png;base64,${item.b64_json}` };
    throw new Error('Image provider returned no image');
  }

  // stub: a deterministic gradient placeholder derived from the prompt.
  const hash = createHash('sha256').update(prompt).digest('hex');
  const c1 = `#${hash.slice(0, 6)}`;
  const c2 = `#${hash.slice(6, 12)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="1536" height="1024" fill="url(#g)"/><circle cx="768" cy="512" r="240" fill="#ffffff22"/></svg>`;
  return { url: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
}
