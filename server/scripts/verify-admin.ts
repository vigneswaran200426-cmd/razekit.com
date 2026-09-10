// Verifies the admin console path — API handlers -> Neon — plus the
// authorization boundaries that matter most: a non-admin must never read admin
// data, and an admin must not be able to act on their own account.
//
// Runs against whatever DATABASE_URL points at, and removes everything it
// creates. Safe to run against production.
import { prisma } from '../src/db.js';
import { serviceClient } from '../src/entities/service.js';
import {
  adminUsersList, adminUserDetail, adminUserAction, adminTrustSafety, adminTrustAction,
  adminEnforcement, adminEnforcementAction, adminVisualAssets, adminSystemHealth, platformStats,
} from '../src/functions/adminConsole.js';

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

const RUN = 'adm-' + Date.now().toString(36);
const host = String(process.env.DATABASE_URL || '').replace(/^.*@/, '').split('/')[0];
console.log(`\n== Admin console verification (${RUN}) ==`);
console.log(`   database host: ${host}\n`);

async function mk(kind: 'admin' | 'creator') {
  const u = await prisma.appUser.create({
    data: {
      email: `${RUN}-${kind}-${Math.random().toString(36).slice(2, 6)}@razekit.test`,
      fullName: `${RUN} ${kind}`,
      role: kind === 'admin' ? 'admin' : 'user',
      userRole: kind === 'admin' ? 'visitor' : 'creator',
      accountStatus: 'active',
      emailVerified: true,
    },
  });
  return { id: u.id, role: u.role, user_role: u.userRole, email: u.email, full_name: u.fullName };
}

const admin = await mk('admin');
const creator = await mk('creator');
const victim = await mk('creator');

console.log('-- Authorization --');
const guarded: Record<string, any> = { adminUsersList, adminTrustSafety, adminEnforcement, adminVisualAssets, adminSystemHealth };
for (const [name, handler] of Object.entries(guarded)) {
  const anon: any = await handler(ctx(null));
  const nonAdmin: any = await handler(ctx(creator));
  eq(`${name}: anonymous -> 401`, anon.status, 401);
  eq(`${name}: non-admin -> 403`, nonAdmin.status, 403);
}

console.log('\n-- Reads --');
const users: any = await adminUsersList(ctx(admin, { limit: 5 }));
eq('adminUsersList -> 200', users.status, 200);
ok('returns real users', users.json.users.length > 0, String(users.json.users.length));
ok('counts come from the database, not the page', users.json.counts.total >= users.json.users.length);
ok('seed accounts are flagged', users.json.users.every((u: any) => typeof u.is_seed === 'boolean'));
ok('no password hash is ever returned', !JSON.stringify(users.json).toLowerCase().includes('passwordhash'));

const search: any = await adminUsersList(ctx(admin, { q: RUN, limit: 10 }));
ok('server-side search works', search.json.users.length >= 3, String(search.json.users.length));

const detail: any = await adminUserDetail(ctx(admin, { user_id: creator.id }));
eq('adminUserDetail -> 200', detail.status, 200);
ok('detail carries activity and audit', Array.isArray(detail.json.audit) && typeof detail.json.activity === 'object');

const health: any = await adminSystemHealth(ctx(admin));
eq('adminSystemHealth -> 200', health.status, 200);
eq('database probed for real', health.json.services.database.status, 'ok');
ok('database latency measured', typeof health.json.services.database.latency_ms === 'number');
ok('storage reported honestly', ['ok', 'degraded', 'misconfigured'].includes(health.json.services.storage.status), health.json.services.storage.status);
ok('email reported honestly', ['ok', 'degraded', 'misconfigured'].includes(health.json.services.email.status), health.json.services.email.status);
ok('CORS allows admin.razekit.com', health.json.cors_origins.includes('https://admin.razekit.com'));
ok('no secret leaks into the health payload', !/npg_|sk-ant|re_[A-Za-z0-9]{12}/.test(JSON.stringify(health.json)));

const stats: any = await platformStats(ctx(null));
eq('platformStats is public -> 200', stats.status, 200);
ok('counts state that seed accounts are excluded', String(stats.json.excludes).includes('seed'));
ok('counts are numbers, not slogans', typeof stats.json.creators === 'number' && typeof stats.json.clients === 'number');
console.log(`       real creators=${stats.json.creators} clients=${stats.json.clients} contests=${stats.json.contests} winners=${stats.json.winners}`);

const visual: any = await adminVisualAssets(ctx(admin));
eq('adminVisualAssets -> 200', visual.status, 200);

console.log('\n-- Trust and safety --');
const report = await svc.entities.TrustReport.create({
  subject_type: 'user', subject_id: victim.id, subject_label: victim.full_name,
  reason: `${RUN} automated verification report`, severity: 'medium', status: 'OPEN', source: 'user_report',
});
const trust: any = await adminTrustSafety(ctx(admin));
eq('adminTrustSafety -> 200', trust.status, 200);
ok('the report appears in the queue', trust.json.reports.some((r: any) => r.id === report.id));

const shortReason: any = await adminTrustAction(ctx(admin, { report_id: report.id, action: 'resolve', reason: 'nope' }));
eq('resolving without a real reason is refused', shortReason.json?.error?.code, 'REASON_REQUIRED');
const resolved: any = await adminTrustAction(ctx(admin, { report_id: report.id, action: 'resolve', reason: 'Verified automated test report, no action needed.' }));
eq('a report can be resolved', resolved.json.report.status, 'RESOLVED');

console.log('\n-- Enforcement --');
const noReason: any = await adminEnforcementAction(ctx(admin, { subject_type: 'user', subject_id: victim.id, action: 'suspension', reason: 'x' }));
eq('enforcement without a reason is refused', noReason.json?.error?.code, 'REASON_REQUIRED');
const selfAct: any = await adminEnforcementAction(ctx(admin, { subject_type: 'user', subject_id: admin.id, action: 'suspension', reason: 'Attempting to act on myself.' }));
eq('an admin cannot enforce against themselves', selfAct.json?.error?.code, 'SELF_ACTION_BLOCKED');

const applied: any = await adminEnforcementAction(ctx(admin, {
  subject_type: 'user', subject_id: victim.id, action: 'suspension',
  reason: `${RUN} verification suspension`, duration_days: 7,
}));
eq('enforcement applies', applied.json.action.status, 'ACTIVE');
eq('suspension actually changes account standing', (await prisma.appUser.findUnique({ where: { id: victim.id } }))?.accountStatus, 'suspended');

const reverted: any = await adminEnforcementAction(ctx(admin, { revert_id: applied.json.action.id, reason: `${RUN} reverting verification suspension` }));
eq('enforcement reverts', reverted.json.action.status, 'REVERTED');
eq('reverting actually lifts the suspension', (await prisma.appUser.findUnique({ where: { id: victim.id } }))?.accountStatus, 'active');
const history: any = await adminEnforcement(ctx(admin));
ok('the reverted action stays in history', history.json.actions.some((a: any) => a.id === applied.json.action.id));

console.log('\n-- Account actions --');
const self: any = await adminUserAction(ctx(admin, { user_id: admin.id, action: 'suspend', reason: 'self test attempt' }));
eq('an admin cannot suspend themselves', self.json?.error?.code, 'SELF_ACTION_BLOCKED');
const byCreator: any = await adminUserAction(ctx(creator, { user_id: victim.id, action: 'suspend', reason: 'privilege escalation attempt' }));
eq('a creator cannot suspend anyone', byCreator.status, 403);
const promoted: any = await adminUserAction(ctx(admin, { user_id: creator.id, action: 'grant_admin', reason: `${RUN} verification promotion` }));
eq('an admin can promote another account', promoted.json.user.role, 'admin');
const demoted: any = await adminUserAction(ctx(admin, { user_id: creator.id, action: 'revoke_admin', reason: `${RUN} verification demotion` }));
eq('an admin can demote another account', demoted.json.user.role, 'user');

const audits = await svc.entities.AuditLog.filter({}, '-created_date', 100);
const mine = audits.filter((a: any) => String(a.result || '').includes(RUN) || String(a.reason || '').includes(RUN));
ok('every state change is audited', mine.length >= 4, `${mine.length} audit rows`);
ok('audit records name the actor', mine.every((a: any) => Boolean(a.actor)));

console.log('\n-- Cleanup --');
let removed = 0;
for (const name of ['TrustReport', 'EnforcementAction', 'AuditLog']) {
  const rows = await svc.entities[name].filter({}, '-created_date', 1000).catch(() => []);
  for (const r of rows) {
    const blob = JSON.stringify(r);
    if (!blob.includes(RUN) && ![admin.id, creator.id, victim.id].some((id) => blob.includes(id))) continue;
    await svc.entities[name].delete(r.id).catch(() => {});
    removed++;
  }
}
await prisma.appUser.deleteMany({ where: { email: { contains: RUN } } });
console.log(`  removed ${removed} verification records`);

console.log(`\n== ${pass} passed, ${fail} failed ==`);
if (fail) { console.log('\nFailures:'); fails.forEach((f) => console.log('  - ' + f)); }
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
