// Live verification of the notification centre, campaign report, creator track
// record, and the anti-fraud signal foundation.
//
// The guarantees under test are mostly about HONESTY: an unmeasured metric must
// never render as a measured zero, a feed must never leak across users, and a
// fraud signal must never present itself as a verdict.
import { prisma } from '../src/db.js';
import { serviceClient } from '../src/entities/service.js';
import { emit, emitEvent, CATEGORY, SEVERITY } from '../src/notify/emit.js';
import { notificationFeed, notificationRead } from '../src/functions/notifications.js';
import { campaignReport, creatorTrackRecord, fraudSignals } from '../src/functions/reports.js';
import { trackerCampaignDetail, trackerCreatorOverview } from '../src/functions/tracker.js';

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

const RUN = 'rep-' + Date.now().toString(36);
console.log(`\n== Reports + notifications verification (${RUN}) ==\n`);

const mk = async (kind: string, role = 'user', userRole = 'creator') => {
  const u = await prisma.appUser.create({
    data: {
      email: `${RUN}-${kind}@razekit.test`, fullName: `${RUN} ${kind}`,
      role, userRole, accountStatus: 'active', emailVerified: true,
    },
  });
  return { id: u.id, role: u.role, user_role: u.userRole, email: u.email, full_name: u.fullName };
};
const brand = await mk('brand', 'user', 'client');
const creator = await mk('creator');
const other = await mk('other');
const admin = await mk('admin', 'admin', 'visitor');

// ── Notifications ───────────────────────────────────────────────────────────
console.log('-- Notification centre --');
await emit(svc, {
  recipientId: creator.id, category: CATEGORY.CONTEST, severity: SEVERITY.INFO,
  title: `${RUN} ordinary event`, body: 'Something routine happened.', dedupeKey: `${RUN}:info`,
});
await emit(svc, {
  recipientId: creator.id, category: CATEGORY.PAYOUT, severity: SEVERITY.CRITICAL,
  title: `${RUN} payout failed`, body: 'The transfer did not go through.', dedupeKey: `${RUN}:crit`,
});
// The same event again — a retry, a replayed job, a double click.
await emit(svc, {
  recipientId: creator.id, category: CATEGORY.CONTEST, severity: SEVERITY.INFO,
  title: `${RUN} ordinary event`, body: 'Something routine happened.', dedupeKey: `${RUN}:info`,
});

const feed: any = await notificationFeed(ctx(creator));
eq('the feed loads', feed.status, 200);
const mine = feed.json.notifications.filter((n: any) => String(n.title).includes(RUN));
eq('a repeated event produces ONE notification, not two', mine.length, 2);
ok('unread count is real', feed.json.unread >= 2, String(feed.json.unread));

const critical = mine.find((n: any) => n.severity === 'critical');
ok('a critical notification is marked persistent', Boolean(critical?.persistent));
const info = mine.find((n: any) => n.severity === 'info');
eq('an ordinary notification is NOT persistent', info?.persistent, false);
ok('active_critical surfaces the live issue', feed.json.active_critical.some((n: any) => n.id === critical.id));
ok('categories are exposed for filtering', Array.isArray(feed.json.categories) && feed.json.categories.length >= 8);

const filtered: any = await notificationFeed(ctx(creator, { category: 'payout' }));
ok('category filtering works', filtered.json.notifications.every((n: any) => n.category === 'payout'));

// Ownership.
const otherFeed: any = await notificationFeed(ctx(other));
ok('a feed never leaks another user notifications',
  !otherFeed.json.notifications.some((n: any) => String(n.title).includes(RUN)));
const steal: any = await notificationRead(ctx(other, { id: critical.id }));
eq('marking someone else notification read does nothing', steal.json.marked, 0);
const stillUnread: any = await notificationFeed(ctx(creator));
ok('and it is still unread for its owner',
  stillUnread.json.notifications.find((n: any) => n.id === critical.id)?.read === false);

const read: any = await notificationRead(ctx(creator, { id: info.id }));
eq('the owner can mark their own read', read.json.marked, 1);

// Legacy rows without category/severity must still classify.
await svc.entities.Notification.create({
  type: 'payment_received', title: `${RUN} legacy payout failed`,
  description: 'Your payout could not be completed.', recipient_user_id: creator.id, read: false,
});
const legacyFeed: any = await notificationFeed(ctx(creator));
const legacy = legacyFeed.json.notifications.find((n: any) => String(n.title).includes('legacy'));
eq('a legacy row is classified into a category', legacy?.category, 'payout');
eq('and its severity is derived from its wording', legacy?.severity, 'critical');

const anon: any = await notificationFeed(ctx(null));
eq('an anonymous caller gets no feed', anon.status, 401);

// ── Catalogued events use real names ────────────────────────────────────────
console.log('\n-- Event wording --');
await emitEvent(svc, 'winner_selected', {
  recipientId: creator.id, contestTitle: `${RUN} campaign`, contestId: 'c-1', dedupeKey: `${RUN}:win`,
});
const winFeed: any = await notificationFeed(ctx(creator));
const win = winFeed.json.notifications.find((n: any) => n.title.includes("You've been selected"));
ok('a winner notification is emitted', Boolean(win));
eq('and it is critical, so it does not vanish', win?.severity, 'critical');
ok('it deep-links to the verification screen', String(win?.action_url).includes('/verify'));
ok('no placeholder words reach the user',
  !/\b(Brand|Creator|User)\b/.test(`${win?.title} ${win?.body}`.replace(RUN, '')));

// ── Campaign report ─────────────────────────────────────────────────────────
console.log('\n-- Campaign report --');
const contest = await svc.entities.Contest.create({
  title: `${RUN} report campaign`, prize_amount: 20000, currency: 'INR', settlement_region: 'IN',
  deadline: new Date(Date.now() + 2 * 864e5).toISOString(), status: 'open',
  created_by_id: brand.id, demo: RUN,
});
await svc.entities.Submission.create({
  contest_id: contest.id, title: `${RUN} entry`, status: 'submitted',
  created_by_id: creator.id, submitted_at: new Date().toISOString(), demo: RUN,
});

const notOwner: any = await campaignReport(ctx(other, { contest_id: contest.id }));
eq('only the brand can read its own report', notOwner.status, 403);

const report: any = await campaignReport(ctx(brand, { contest_id: contest.id }));
eq('the report loads', report.status, 200);
eq('participation counts real entries', report.json.participation.submissions, 1);
eq('with nothing scored yet', report.json.participation.scored_submissions, 0);
eq('averages are NULL, never a misleading zero', report.json.performance.average_final, null);
ok('unmeasured metrics are named, not shown as zero',
  typeof report.json.not_measured.roi === 'string' && report.json.not_measured.roi.length > 10);
ok('and the report never claims a revenue figure',
  !JSON.stringify(report.json).match(/"(attributed_revenue|roi|conversions)"\s*:\s*0/));
ok('excluded suspicious traffic is reported, not hidden',
  typeof report.json.performance.excluded_suspicious_clicks === 'number');
eq('no winner yet is reported as null', report.json.winner, null);

// ── Creator track record ────────────────────────────────────────────────────
console.log('\n-- Creator track record --');
const record: any = await creatorTrackRecord(ctx(creator));
eq('a creator can read their own record', record.status, 200);
eq('win rate is NULL before any result, not 0%', record.json.totals.win_rate, null);
eq('entered counts the real entry', record.json.totals.contests_entered, 1);
ok('earnings are present for the owner', record.json.earnings !== null);

const peek: any = await creatorTrackRecord(ctx(other, { creator_id: creator.id }));
eq('one creator cannot read another record', peek.status, 403);
const adminPeek: any = await creatorTrackRecord(ctx(admin, { creator_id: creator.id }));
eq('an admin can', adminPeek.status, 200);
eq('but earnings stay private even from an admin', adminPeek.json.earnings, null);

// ── Tracker enrichment ──────────────────────────────────────────────────────
console.log('\n-- Brand Tracker detail --');
const detail: any = await trackerCampaignDetail(ctx(brand, { contest_id: contest.id }));
eq('campaign detail loads', detail.status, 200);
ok('entries carry a real creator name', detail.json.entries.every((e: any) => Boolean(e.creator_name)));
ok('and never the placeholder word', detail.json.entries.every((e: any) => e.creator_name !== 'Creator'));
ok('the scoring rules are included so ranking is explainable', Boolean(detail.json.scoring));
ok('disqualification state is exposed', detail.json.entries.every((e: any) => 'disqualified' in e));
ok('the lifecycle state is labelled', Boolean(detail.json.campaign.state_label));

// ── Tracker never claims money that has not moved ───────────────────────────
// The failure this guards against: a creator wins a ₹20,000 contest, the payout
// has not been made, and the Tracker greets them with "₹20,000 earned" while
// their balance page truthfully says ₹0. Two screens, two answers, one angry
// support ticket. Won VALUE and PAID OUT are different facts and stay separate.
console.log('\n-- Tracker earnings honesty --');
const winSub = await svc.entities.Submission.create({
  contest_id: contest.id, title: `${RUN} winning entry`, status: 'won',
  created_by_id: creator.id, submitted_at: new Date().toISOString(), demo: RUN,
});
const kpi: any = await trackerCreatorOverview(ctx(creator));
eq('the creator overview loads', kpi.status, 200);
eq('the value of what they won is reported', kpi.json.kpis.prize_value_won, 20000);
eq('but paid out is ZERO, because no payout has happened', kpi.json.kpis.paid_out, 0);
eq('and nothing is owed either, because no payout was authorised', kpi.json.kpis.awaiting_payout, 0);
ok('the two figures are separate fields, never merged',
  'prize_value_won' in kpi.json.kpis && 'paid_out' in kpi.json.kpis);
ok('and the old conflated field is gone', !('prizes_earned' in kpi.json.kpis));

// ── Fraud signals ───────────────────────────────────────────────────────────
console.log('\n-- Anti-fraud signals --');
const byCreator: any = await fraudSignals(ctx(creator));
eq('a creator cannot read fraud signals', byCreator.status, 403);

// Two entries claiming the same published URL.
// A real Instagram reel shape. It has to be: submissions now run through the
// publication guard, which rejects a host that is not a supported platform —
// so a placeholder URL can no longer stand in for a published post here.
const dupUrl = 'https://www.instagram.com/reel/Cz9XyAbCdEf/';
await svc.entities.Submission.create({
  contest_id: contest.id, title: `${RUN} dup a`, status: 'submitted',
  created_by_id: creator.id, live_url: dupUrl, demo: RUN,
});
await svc.entities.Submission.create({
  contest_id: contest.id, title: `${RUN} dup b`, status: 'submitted',
  created_by_id: other.id, live_url: dupUrl, demo: RUN,
});

const signals: any = await fraudSignals(ctx(admin, { contest_id: contest.id }));
eq('an admin can read fraud signals', signals.status, 200);
const dup = signals.json.signals.find((s: any) => s.kind === 'duplicate_content_url');
ok('a duplicate published URL is detected from real records', Boolean(dup));
ok('and the evidence names the entries', (dup?.evidence?.submission_ids || []).length >= 2);
ok('signals are labelled as leads, not verdicts',
  String(signals.json.disclaimer).toLowerCase().includes('not automated fraud findings'));
ok('nothing is auto-penalised',
  String(signals.json.disclaimer).toLowerCase().includes('does not automatically penalise'));

// ── Cleanup ─────────────────────────────────────────────────────────────────
console.log('\n-- Cleanup --');
let removed = 0;
for (const name of ['Notification', 'Submission', 'Contest', 'AuditLog', 'ScoreSnapshot',
  'Disqualification', 'WinnerVerification', 'Payout']) {
  const rows = await svc.entities[name].filter({}, '-created_date', 3000).catch(() => []);
  for (const r of rows) {
    const blob = JSON.stringify(r);
    if (!blob.includes(RUN) && ![brand.id, creator.id, other.id, admin.id, contest.id].some((id) => blob.includes(id))) continue;
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
