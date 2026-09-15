// Removes verification/test data that leaked into production.
//
// Written because it actually happened: a verify-campaigns run on 2026-09-11
// crashed before its cleanup step, and four test votes plus an inflated tally
// sat on the PUBLIC gta-6 poll for days, claiming 2 yes / 2 no. Every
// verification script cleans up at the end, which is fine right up until one
// throws on the way there.
//
// So this is the backstop: run it any time to sweep what leaked. Safe to run
// repeatedly — it is idempotent and reports "nothing to do" when clean.
//
// SCOPE IS DELIBERATELY NARROW. It only touches rows tied to an account whose
// email ends in a verification domain, which no real user can hold. It never
// deletes a contest, submission, winner, ledger entry or payment. Counts are
// RECOUNTED from surviving rows rather than decremented, because subtracting
// trusts the number that was already wrong.
//
//   npx tsx scripts/purge-test-data.ts                 report only
//   npx tsx scripts/purge-test-data.ts --apply         remove leaked test data
//   npx tsx scripts/purge-test-data.ts --apply --include-seed
//                                                      ALSO wipe the seeded
//                                                      simulation environment
import { prisma } from '../src/db.js';
import { serviceClient } from '../src/entities/service.js';

const APPLY = process.argv.includes('--apply');
const svc = serviceClient();

// EPHEMERAL: created and destroyed by a single verification run. Nothing else
// should ever own one, so leaking one is always a bug and purging is always safe.
const TEST_DOMAINS = ['@razekit.test'];

// DELIBERATE: the seeded simulation environment (the 500-creator / 100-brand
// dataset). These are NOT leaks — they own real contests, submissions and
// history that make the product demonstrable. Purging them by default would
// orphan all of it, so they are reported and left alone unless explicitly asked
// for. This distinction exists because the first version of this script did not
// make it, and a report-only run showed it was about to delete 600 seeded
// accounts and orphan 192 contests.
const SEED_DOMAINS = ['@razekit.demo', '@razekit.sim'];

const PURGE_SEED = process.argv.includes('--include-seed');
const DOMAINS = PURGE_SEED ? [...TEST_DOMAINS, ...SEED_DOMAINS] : TEST_DOMAINS;

console.log(`\n══ Test-data purge (${APPLY ? 'APPLY' : 'REPORT ONLY'}) ══\n`);

// ── Which accounts are verification accounts ────────────────────────────────
const testUsers = await prisma.appUser.findMany({
  where: { OR: DOMAINS.map((d) => ({ email: { endsWith: d } })) },
  select: { id: true, email: true },
});
const testIds = new Set(testUsers.map((u) => u.id));
console.log(`ephemeral verification accounts: ${testUsers.length}`);

// Counted but untouched, so the operator can see the seeded environment is
// intact rather than wondering where it went.
const seedCount = await prisma.appUser.count({
  where: { OR: SEED_DOMAINS.map((d) => ({ email: { endsWith: d } })) },
}).catch(() => 0);
console.log(`seeded simulation accounts: ${seedCount}${PURGE_SEED ? ' (WILL BE REMOVED — --include-seed)' : ' (left alone)'}`);

// ── Poll votes: the one that reached a public surface ───────────────────────
const votes = await svc.entities.PollVote.filter({}, '-created_date', 10000).catch(() => []);
const testVotes = votes.filter((v: any) => v.user_id && testIds.has(v.user_id));
console.log(`poll votes cast by them: ${testVotes.length}`);

if (APPLY) {
  for (const v of testVotes) await svc.entities.PollVote.delete(v.id).catch(() => {});
}

// ── Recount every poll from what actually survives ──────────────────────────
const polls = await svc.entities.PollCampaign.filter({}, '-created_date', 50).catch(() => []);
let drift = 0;
for (const p of polls) {
  const remaining = (await svc.entities.PollVote.filter({ poll_id: p.id }, '-created_date', 10000).catch(() => []))
    .filter((v: any) => v.counted !== false)
    .filter((v: any) => !(APPLY === false && v.user_id && testIds.has(v.user_id)));
  const yes = remaining.filter((v: any) => v.choice === 'yes').length;
  const no = remaining.filter((v: any) => v.choice === 'no').length;
  const stale = Number(p.yes_votes || 0) !== yes || Number(p.no_votes || 0) !== no;
  if (stale) drift++;
  console.log(`  ${stale ? 'DRIFT' : 'ok   '} ${p.slug}: stored ${p.yes_votes}/${p.no_votes} vs real ${yes}/${no}`);
  if (stale && APPLY) {
    const total = yes + no;
    const reached = total >= Number(p.vote_target || 0);
    await svc.entities.PollCampaign.update(p.id, {
      yes_votes: yes,
      no_votes: no,
      total_votes: total,
      // A poll must not stay "complete" on the strength of votes that are gone.
      status: reached ? p.status : 'upcoming',
      target_reached_at: reached ? p.target_reached_at : null,
    });
  }
}

// ── Anything else owned by a verification account, on a PUBLIC surface ──────
// Contests and submissions are listed but NOT deleted: a test contest is still
// a contest, and guessing wrong here destroys real work. They are reported so a
// human can decide.
const contests = await svc.entities.Contest.filter({}, '-created_date', 3000).catch(() => []);
const testContests = contests.filter((c: any) => c.created_by_id && testIds.has(c.created_by_id));
if (testContests.length) {
  console.log(`\ncontests owned by verification accounts: ${testContests.length} (NOT deleted — review manually)`);
  for (const c of testContests.slice(0, 10)) console.log(`  ${c.status.padEnd(16)} ${String(c.title).slice(0, 60)}`);
}

// ── Accounts last, so the ownership lookups above still resolve ─────────────
if (APPLY && testUsers.length) {
  const del = await prisma.appUser.deleteMany({
    where: { OR: DOMAINS.map((d) => ({ email: { endsWith: d } })) },
  });
  console.log(`\nremoved ${del.count} verification account(s)`);
}

console.log(`\n══ ${testVotes.length} test vote(s), ${drift} poll(s) with drift, ${testUsers.length} account(s) ══`);
if (!APPLY && (testVotes.length || drift || testUsers.length)) {
  console.log('   re-run with --apply to remove them');
}
await prisma.$disconnect();
process.exit(0);
