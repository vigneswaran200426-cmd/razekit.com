// LLM — replaces Base44 integrations.Core.InvokeLLM.
// stub      → deterministic canned output (no key, dev)
// anthropic → Claude Messages API (set ANTHROPIC_API_KEY)
//
// Return contract matches how the frontend consumes it:
//   • with response_json_schema → returns a parsed object matching the schema
//   • without a schema          → returns a plain string
import { config } from '../config.js';

export interface InvokeLLMInput {
  prompt: string;
  response_json_schema?: any;
  system?: string;
}

export async function invokeLLM(input: InvokeLLMInput): Promise<any> {
  const { prompt, response_json_schema } = input;

  if (config.llm.driver === 'anthropic') {
    if (!config.llm.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not set');
    const sys = response_json_schema
      ? `${input.system || ''}\nRespond with ONLY valid JSON matching this JSON schema (no prose, no code fences): ${JSON.stringify(response_json_schema)}`
      : input.system || 'You are a concise, helpful assistant.';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.llm.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.llm.model,
        max_tokens: 1024,
        system: sys,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(`ANTHROPIC_ERROR:${data?.error?.message || res.status}`);
    const text = (data.content || []).map((b: any) => b.text || '').join('').trim();
    if (response_json_schema) return safeJson(text);
    return text;
  }

  // stub
  if (response_json_schema) return schemaSkeleton(response_json_schema);
  return "I'm the RazeKit help assistant (development stub). Configure LLM_DRIVER=anthropic with an API key to enable real answers. Meanwhile, check the Help topics or contact support.";
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return {};
  }
}

// Build a minimal object that satisfies the shape of a JSON schema (dev stub).
function schemaSkeleton(schema: any): any {
  if (!schema || typeof schema !== 'object') return {};
  if (schema.type === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties || {})) out[k] = schemaSkeleton(v);
    return out;
  }
  if (schema.type === 'array') return [];
  if (schema.enum && schema.enum.length) return schema.enum[0];
  if (schema.type === 'number' || schema.type === 'integer') return 0;
  if (schema.type === 'boolean') return false;
  return '';
}
