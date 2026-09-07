// Imports Base44 entity data exports into the RazeKit database.
//
// Usage:
//   1. Export each Base44 entity as JSON (an array of records) into ./_import/,
//      named <EntityName>.json  (e.g. _import/Contest.json, _import/Wallet.json,
//      _import/User.json).  Base44 records include id, created_date,
//      created_by_id and the entity fields.
//   2. Run:  npx tsx scripts/import-data.ts
//
// Idempotent: upserts by id. Re-running updates existing rows.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../src/db.js';
import { knownEntity } from '../src/entities/service.js';

const DIR = join(process.cwd(), '_import');
if (!existsSync(DIR)) {
  console.error(`No _import directory found at ${DIR}. Create it and drop <Entity>.json files inside.`);
  process.exit(1);
}

const META = new Set(['id', 'created_date', 'created_by_id', 'updated_date']);
function splitRecord(r: any) {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (!META.has(k)) data[k] = v;
  return {
    id: String(r.id),
    createdById: r.created_by_id ?? null,
    createdDate: r.created_date ? new Date(r.created_date) : undefined,
    data,
  };
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
let total = 0;

for (const file of files) {
  const entity = file.replace(/\.json$/, '');
  const rows = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  if (!Array.isArray(rows)) { console.warn(`skip ${file}: not an array`); continue; }

  if (entity === 'User') {
    for (const r of rows) {
      await prisma.appUser.upsert({
        where: { id: String(r.id) },
        update: {
          email: String(r.email || '').toLowerCase(),
          fullName: r.full_name ?? null,
          role: r.role || 'user',
          userRole: r.user_role || 'visitor',
          accountStatus: r.account_status || 'active',
          onboardingCompleted: !!r.onboarding_completed,
        },
        create: {
          id: String(r.id),
          email: String(r.email || `${r.id}@imported.local`).toLowerCase(),
          fullName: r.full_name ?? null,
          role: r.role || 'user',
          userRole: r.user_role || 'visitor',
          accountStatus: r.account_status || 'active',
          onboardingCompleted: !!r.onboarding_completed,
          emailVerified: true,
        },
      });
      total++;
    }
    console.log(`User: imported ${rows.length} (NOTE: passwords are NOT migrated — users sign in via Google or password reset).`);
    continue;
  }

  if (!knownEntity(entity)) { console.warn(`skip ${file}: unknown entity`); continue; }
  for (const r of rows) {
    const rec = splitRecord(r);
    await prisma.record.upsert({
      where: { id: rec.id },
      update: { entity, data: rec.data as any, createdById: rec.createdById },
      create: { id: rec.id, entity, data: rec.data as any, createdById: rec.createdById, ...(rec.createdDate ? { createdDate: rec.createdDate } : {}) },
    });
    total++;
  }
  console.log(`${entity}: imported ${rows.length}`);
}

console.log(`\nDone. ${total} records imported.`);
process.exit(0);
