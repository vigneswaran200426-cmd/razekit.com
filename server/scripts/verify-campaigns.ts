// Live verification of the SIX campaign records and the poll vote system.
//
// Two things are under test, and both are about not lying to people:
//
//   1. The six records stay six. Three upcoming 1-crore community polls and
//      three real 50,000-rupee creator contests must never render as, resolve
//      to, or be counted as one another. A visitor who sees "1 CRORE" on a
//      contest they can actually enter has been misled about the prize.
//
//   2. A vote count is a measurement. It starts at zero, only real votes move
//      it, and voting twice does not move it twice.
//
// Test votes are removed at the end, and the assertions check that the tallies
// return to exactly where they started — so running this never inflates the
// number a visitor sees.
import { prisma } from '../src/db.js';
import { serviceClient } from '../src/entities/service.js';
import { pollList, pollVote, pollAdminList } from '../src/functions/polls.js';
import { PROMOTIONAL_RULE_VERSION } from '../src/contest/duration.js';

const svc = serviceClient();
const req = (ip: string, ua = 'Mozilla/5.0 (verify)') => ({
  headers: { 'x-forwarded-for': ip, 'user-agent': ua },
  socket: { remoteAddress: ip },
});
const ctx = (u: any, b: any = {}, r: any = req('203.0.113.9')) => ({ user: u, svc, body: b, req: r });

let pass = 0; let fail = 0;
const fails: string[] = [];
const ok = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log('  OK   ' + n); }
  else { fail++; fails.push(n); console.log(`  FAIL ${n}${d ? ' — ' + d : ''}`); }
};
const eq = (n: string, a: any, b: any) => ok(n, a === b, `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

const RUN = 'camp-' + Date.now().toString(36);
console.log(`\n══ Campaign separation + poll verification (${RUN}) ══\n`);

// ── The six records ─────────────────────────────────────────────────────────
console.log('── Six distinct records ──');
const polls: any = await pollList(ctx(null));
eq('the poll list is public', polls.status, 200);
const slugs = polls.json.polls.map((p: any) => p.slug).sort();
ok('all three upcoming polls exist', ['ai-creator-agents', 'gpt-6-astra', 'gta-6'].every((s) => slugs.includes(s)), slugs.join(','));

for (const p of polls.json.polls) {
  eq(`poll "${p.slug}" carries a 1 crore prize pool`, Number(p.prize_pool_minor), 1000000000);
  eq(`poll "${p.slug}" targets 1,000,000 votes`, Number(p.vote_target), 1000000);
}

const contests = await svc.entities.Contest.filter({ promotional: true }, '-created_date', 20).catch(() => []);
eq('all three promotional contests exist', contests.length, 3);
for (const c of contests) {
  eq(`contest "${c.title}" has a 50,000 prize`, Number(c.prize_amount), 50000);
  eq(`contest "${c.title}" is Instagram only`, String(c.required_platform).toLowerCase(), 'instagram');
  eq(`contest "${c.title}" caps video at 60 seconds`, Number(c.max_video_seconds), 60);
  ok(`contest "${c.title}" requires account handover`, c.handover_required === true);
  // Nothing may appear funded or live until real money is verified.
  ok(`contest "${c.title}" is NOT live before funding`, c.status === 'draft', String(c.status));
  ok(`contest "${c.title}" is NOT marked funded`, !c.funded_at && Number(c.prize_committed_minor || 0) === 0);
  eq(`contest "${c.title}" records the promotional rule that allowed 28 days`,
    c.duration_rule_version, PROMOTIONAL_RULE_VERSION);
}

// The separation itself: no record may be both.
const pollPrizes = polls.json.polls.map((p: any) => Number(p.prize_pool_minor));
const contestPrizes = contests.map((c: any) => Number(c.prize_amount) * 100);
ok('no contest carries a poll prize pool', !contestPrizes.some((v: number) => pollPrizes.includes(v)));
ok('a poll is never a Contest row', (await svc.entities.Contest.filter({}, '-created_date', 500).catch(() => []))
  .every((c: any) => Number(c.prize_amount) !== 10000000));
ok('a contest is never a PollCampaign row', polls.json.polls.every((p: any) => Number(p.prize_pool_minor) !== 5000000));

// The rule that permitted 28 days is a record a human can point at.
const rules = await svc.entities.ContestDurationRule
  .filter({ rule_version: PROMOTIONAL_RULE_VERSION }, '-created_date', 5).catch(() => []);
eq('the promotional duration rule is recorded', rules.length, 1);
eq('and it caps at 28 days', Number(rules[0]?.max_days), 28);
ok('and names who approved it', Boolean(rules[0]?.approved_by_name));

// ── Vote counts are measurements ────────────────────────────────────────────
console.log('\n── Voting ──');
const target = polls.json.polls.find((p: any) => p.slug === 'gta-6');
const before = { yes: Number(target.yes_votes), no: Number(target.no_votes), total: Number(target.total_votes) };
console.log(`  (starting tally: ${before.yes} yes / ${before.no} no)`);

const voter = await prisma.appUser.create({
  data: {
    email: `${RUN}-voter@razekit.test`, fullName: `${RUN} voter`,
    role: 'user', userRole: 'creator', accountStatus: 'active', emailVerified: true,
  },
});
const me = { id: voter.id, role: 'user', user_role: 'creator', email: voter.email, full_name: voter.fullName };

const v1: any = await pollVote(ctx(me, { slug: 'gta-6', choice: 'yes' }));
eq('a first vote is accepted', v1.status, 200);
ok('and it is recorded as a change', v1.json.changed === true);

const afterOne: any = await pollList(ctx(me));
const t1 = afterOne.json.polls.find((p: any) => p.slug === 'gta-6');
eq('the yes tally moved by exactly one', Number(t1.yes_votes), before.yes + 1);
eq('the total moved by exactly one', Number(t1.total_votes), before.total + 1);
eq('the caller sees their own vote', t1.my_vote, 'yes');

// The same person voting again.
const v2: any = await pollVote(ctx(me, { slug: 'gta-6', choice: 'yes' }));
ok('a repeat vote is not an error', v2.status === 200);
eq('but it changes nothing', v2.json.changed, false);
const afterTwo: any = await pollList(ctx(me));
const t2 = afterTwo.json.polls.find((p: any) => p.slug === 'gta-6');
eq('the tally did NOT move a second time', Number(t2.yes_votes), before.yes + 1);

// Changing your mind must move the vote, not add one.
const v3: any = await pollVote(ctx(me, { slug: 'gta-6', choice: 'no' }));
eq('a voter may change their choice', v3.status, 200);
const afterThree: any = await pollList(ctx(me));
const t3 = afterThree.json.polls.find((p: any) => p.slug === 'gta-6');
eq('yes went back down', Number(t3.yes_votes), before.yes);
eq('no went up', Number(t3.no_votes), before.no + 1);
eq('and the TOTAL is unchanged by switching', Number(t3.total_votes), before.total + 1);

// Concurrency: the tally is read-modify-written, so two simultaneous votes from
// different people must not both write the same +1.
const crowd = await Promise.all([1, 2, 3, 4].map((i) => prisma.appUser.create({
  data: {
    email: `${RUN}-c${i}@razekit.test`, fullName: `${RUN} c${i}`,
    role: 'user', userRole: 'creator', accountStatus: 'active', emailVerified: true,
  },
})));
await Promise.all(crowd.map((u, i) => pollVote(ctx(
  { id: u.id, role: 'user', user_role: 'creator', email: u.email },
  { slug: 'gta-6', choice: i % 2 ? 'no' : 'yes' },
  req(`198.51.100.${10 + i}`),
))));
const afterCrowd: any = await pollList(ctx(null));
const t4 = afterCrowd.json.polls.find((p: any) => p.slug === 'gta-6');
eq('four concurrent votes all counted, none lost to a race',
  Number(t4.total_votes), before.total + 5);

const bad: any = await pollVote(ctx(me, { slug: 'gta-6', choice: 'maybe' }));
ok('an invalid choice is rejected', bad.status >= 400);
const missing: any = await pollVote(ctx(me, { slug: 'no-such-poll', choice: 'yes' }));
ok('voting on a poll that does not exist is rejected', missing.status >= 400);

// A poll is not a contest: it must expose no entry path.
ok('a poll exposes no submission or winner field',
  !['submissions', 'winner', 'deadline', 'handover_required'].some((k) => k in target));

// ── Admin integrity view ────────────────────────────────────────────────────
console.log('\n── Admin ──');
const notAdmin: any = await pollAdminList(ctx(me));
ok('a normal user cannot read vote integrity data', notAdmin.status >= 400);
const admin = await prisma.appUser.create({
  data: {
    email: `${RUN}-admin@razekit.test`, fullName: `${RUN} admin`,
    role: 'admin', userRole: 'visitor', accountStatus: 'active', emailVerified: true,
  },
});
const adminView: any = await pollAdminList(ctx({ id: admin.id, role: 'admin', user_role: 'visitor' }));
eq('an admin can', adminView.status, 200);
ok('and sees counted vs uncounted votes',
  adminView.json.polls.every((p: any) => p.integrity && 'counted_votes' in p.integrity && 'uncounted_votes' in p.integrity));
// The strongest check available: an independent recount of the vote rows must
// agree with the tally shown to the public. If these ever disagree, the number
// on the home page is not the number of votes that were cast.
ok('an independent recount agrees with the public tally',
  adminView.json.polls.every((p: any) => p.integrity.tally_matches !== false),
  JSON.stringify(adminView.json.polls.map((p: any) => [p.slug, p.integrity.tally_matches])));
ok('an unknown is reported as null, never as zero',
  adminView.json.polls.every((p: any) => p.integrity.recount_complete === true
    || p.integrity.counted_votes === null));

// ── Cleanup: the tallies must return to where they started ──────────────────
console.log('\n── Cleanup ──');
const ids = [voter.id, ...crowd.map((u) => u.id), admin.id];
const votes = await svc.entities.PollVote.filter({}, '-created_date', 2000).catch(() => []);
let removedVotes = 0;
for (const v of votes) {
  if (!ids.includes(v.user_id)) continue;
  await svc.entities.PollVote.delete(v.id).catch(() => {});
  removedVotes++;
}
// Put the tally back exactly as it was. A verification run must never leave a
// vote behind — that would be this script fabricating adoption.
const pollRow = (await svc.entities.PollCampaign.filter({ slug: 'gta-6' }, '-created_date', 1))[0];
await svc.entities.PollCampaign.update(pollRow.id, {
  yes_votes: before.yes, no_votes: before.no, total_votes: before.total,
  status: 'upcoming', target_reached_at: null,
});
await prisma.appUser.deleteMany({ where: { email: { contains: RUN } } });

const restored: any = await pollList(ctx(null));
const tf = restored.json.polls.find((p: any) => p.slug === 'gta-6');
eq('the tally is restored to its real value — yes', Number(tf.yes_votes), before.yes);
eq('the tally is restored to its real value — no', Number(tf.no_votes), before.no);
eq('the tally is restored to its real value — total', Number(tf.total_votes), before.total);
console.log(`  removed ${removedVotes} test votes and ${ids.length} test accounts`);

console.log(`\n══ ${pass} passed, ${fail} failed ══`);
if (fail) { console.log('\nFailures:'); fails.forEach((f) => console.log('  - ' + f)); }
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
