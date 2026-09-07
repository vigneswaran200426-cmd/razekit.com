// Generates src/entities/schemas.json from the exported Base44 entity schemas
// (../base44/entities/*.jsonc). Captures per-entity: field defaults, required
// fields, and the RLS policy — so the backend enforces exactly what Base44 did.
//
// Run: npm run gen:schemas
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENTITIES_DIR = join(__dirname, '..', '..', 'base44', 'entities');
const OUT = join(__dirname, '..', 'src', 'entities', 'schemas.json');

// Tolerant JSONC parse: try strict JSON, then strip // and /* */ comments that
// are not inside strings.
function parseJsonc(text) {
  try {
    return JSON.parse(text);
  } catch {
    let out = '';
    let inStr = false, strCh = '', inLine = false, inBlock = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
      if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
      if (inStr) { out += c; if (c === '\\') { out += text[++i] ?? ''; } else if (c === strCh) inStr = false; continue; }
      if (c === '"' || c === "'") { inStr = true; strCh = c; out += c; continue; }
      if (c === '/' && n === '/') { inLine = true; i++; continue; }
      if (c === '/' && n === '*') { inBlock = true; i++; continue; }
      out += c;
    }
    return JSON.parse(out);
  }
}

function collectDefaults(properties) {
  const defaults = {};
  for (const [key, def] of Object.entries(properties || {})) {
    if (def && Object.prototype.hasOwnProperty.call(def, 'default')) {
      defaults[key] = def.default;
    }
  }
  return defaults;
}

const files = readdirSync(ENTITIES_DIR).filter((f) => f.endsWith('.jsonc') || f.endsWith('.json'));
const schemas = {};

for (const file of files) {
  const raw = readFileSync(join(ENTITIES_DIR, file), 'utf8');
  let doc;
  try {
    doc = parseJsonc(raw);
  } catch (e) {
    console.error(`Failed to parse ${file}: ${e.message}`);
    process.exit(1);
  }
  const name = doc.name || file.replace(/\.(jsonc|json)$/, '');
  schemas[name] = {
    name,
    required: doc.required || [],
    defaults: collectDefaults(doc.properties),
    fields: Object.keys(doc.properties || {}),
    rls: doc.rls || { read: {}, create: true, update: {}, delete: {} },
  };
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(schemas, null, 2));
console.log(`Wrote ${Object.keys(schemas).length} entity schemas → ${OUT}`);
