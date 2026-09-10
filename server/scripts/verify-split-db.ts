// Verifies the two-database architecture:
//
//   PLATFORM database  users, contests, submissions, winners, ledger, audit
//   ADMIN database     TrustReport, EnforcementAction, AdminPermission
//
// The point of this script is to prove the split is REAL — that an admin record
// genuinely lands in the admin database and is genuinely absent from the
// platform one — rather than both pointing at the same place by accident.
//
// Run with BOTH urls set:
//   DATABASE_URL=<platform> ADMIN_DATABASE_URL=<admin> npx tsx scripts/verify-split-db.ts
import { prisma, adminPrisma, hasSeparateAdminDb } from '../src/db.js';
import { serviceClient } from '../src/entities/service.js';
import { ADMIN_DB_ENTITIES, isAdminEntity } from '../src/entities/routing.js';
import { adminSystemHealth, adminUsersList, adminTrustSafety } from '../src/functions/adminConsole.js';

const svc = serviceClient();
const ctx = (u: any, b: any = {}) => ({ user: u, svc, body: b, req: {} });
let pass = 0;
let fail = 0;
const fails: string[] = [];
const ok = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; fails.push(n); console.log(`  FAIL ${n}${d ? ' — ' + d : ''}`); }
};
const eq = (n: string, a: any, b: any) => ok(n, a === b, `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

const host = (u: string) => String(u || '').replace(/^.*@/, '').split('/')[0].split('.')[0];
const RUN = 'split-' + Date.now().toString(36);

console.log(`\n== Two-database verification (${RUN}) ==`);
console.log(`   platform : ${host(process.env.DATABASE_URL || '')}`);
console.log(`   admin    : ${host(process.env.ADMIN_DATABASE_URL || '') || '(not set — single-database mode)'}\n`);

console.log('-- Configuration --');
ok('a separate admin database is configured', hasSeparateAdminDb(), 'set ADMIN_DATABASE_URL to test the split');
ok('the two databases are different hosts',
  host(process.env.DATABASE_URL || '') !== host(process.env.ADMIN_DATABASE_URL || ''),
  'both URLs point at the same project');
console.log(`       admin entities: ${[...ADMIN_DB_ENTITIES].join(', ')}`);
ok('AuditLog stays with the platform data it describes', !isAdminEntity('AuditLog'));
ok('the ledger stays with the platform', !isAdminEntity('LedgerEntry') && !isAdminEntity('LedgerTransaction'));
ok('contests and users stay with the platform', !isAdminEntity('Contest') && !isAdminEntity('User'));

console.log('\n-- Routing is real --');
const report = await svc.entities.TrustReport.create({
  subject_type: 'user', subject_id: `${RUN}-subject`, reason: `${RUN} routing probe`,
  severity: 'low', status: 'OPEN', source: 'system',
});
const inAdmin = await adminPrisma.record.findFirst({ where: { id: report.id, entity: 'TrustReport' } });
const inPlatform = await prisma.record.findFirst({ where: { id: report.id, entity: 'TrustReport' } });
ok('an admin record is written to the ADMIN database', Boolean(inAdmin));
ok('an admin record is ABSENT from the platform database', !inPlatform);

const audit = await svc.entities.AuditLog.create({
  user_id: `${RUN}-subject`, action: `${RUN}.probe`, actor: 'system', status: 'success', reason: 'routing probe',
});
const auditPlatform = await prisma.record.findFirst({ where: { id: audit.id, entity: 'AuditLog' } });
const auditAdmin = hasSeparateAdminDb()
  ? await adminPrisma.record.findFirst({ where: { id: audit.id, entity: 'AuditLog' } })
  : null;
ok('an audit record is written to the PLATFORM database', Boolean(auditPlatform));
ok('an audit record is ABSENT from the admin database', !auditAdmin);

console.log('\n-- Reads work across both --');
const readBack = await svc.entities.TrustReport.get(report.id).catch(() => null);
ok('an admin record reads back through the normal entity API', readBack?.id === report.id);
const filtered = await svc.entities.TrustReport.filter({ subject_id: `${RUN}-subject` }, '-created_date', 5);
ok('admin records filter correctly', filtered.some((r: any) => r.id === report.id));

console.log('\n-- Admin console sees BOTH databases --');
const admin = await prisma.appUser.findFirst({ where: { role: 'admin' } });
if (!admin) {
  ok('an admin account exists on the platform database', false, 'run npm run seed:admin');
} else {
  const actor = { id: admin.id, role: admin.role, user_role: admin.userRole, email: admin.email, full_name: admin.fullName };

  const users: any = await adminUsersList(ctx(actor, { limit: 3 }));
  eq('adminUsersList -> 200', users.status, 200);
  ok('the console reads PLATFORM users', users.json.counts.total > 0, `${users.json.counts.total} users`);
  console.log(`       platform users visible to admin: ${users.json.counts.total}`);

  const trust: any = await adminTrustSafety(ctx(actor));
  eq('adminTrustSafety -> 200', trust.status, 200);
  ok('the console reads ADMIN trust reports', trust.json.reports.some((r: any) => r.id === report.id));

  const health: any = await adminSystemHealth(ctx(actor));
  eq('adminSystemHealth -> 200', health.status, 200);
  eq('platform database probed', health.json.services.database.status, 'ok');
  eq('admin database probed separately', health.json.services.admin_database.status, 'ok');
  ok('both round trips are timed',
    typeof health.json.services.database.latency_ms === 'number'
    && typeof health.json.services.admin_database.latency_ms === 'number');
  ok('no connection string leaks into health', !/npg_|neondb_owner|postgresql:\/\//.test(JSON.stringify(health.json)));
}

console.log('\n-- Cleanup --');
await svc.entities.TrustReport.delete(report.id).catch(() => {});
await svc.entities.AuditLog.delete(audit.id).catch(() => {});
const leftAdmin = await adminPrisma.record.count({ where: { entity: 'TrustReport', id: report.id } });
const leftPlatform = await prisma.record.count({ where: { entity: 'AuditLog', id: audit.id } });
ok('probe records removed from both databases', leftAdmin === 0 && leftPlatform === 0);

console.log(`\n== ${pass} passed, ${fail} failed ==`);
if (fail) { console.log('\nFailures:'); fails.forEach((f) => console.log('  - ' + f)); }
await prisma.$disconnect();
if (hasSeparateAdminDb()) await adminPrisma.$disconnect();
process.exit(fail ? 1 : 0);
