import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isSeedEmail, notSeedWhere, SEED_SUFFIXES } from '../src/compliance/seedAccounts.js';
import { publicContests } from '../src/functions/discover.js';

// Seeded creators and simulated brands are rendered exactly like real ones:
// same names, same prize amounts, same finalized scores. This list is the only
// thing that stops a visitor being shown an invented winner as a real one, so
// every case below is a way that guarantee could quietly come apart.

test('every seed suffix is recognised', () => {
  for (const suffix of SEED_SUFFIXES) {
    assert.equal(isSeedEmail(`someone${suffix}`), true, `${suffix} must be treated as seeded`);
  }
});

test('a real address is never mistaken for a seeded one', () => {
  for (const real of ['aria@gmail.com', 'brand@nike.com', 'vigneswaran200426@gmail.com']) {
    assert.equal(isSeedEmail(real), false);
  }
});

test('a lookalike domain does not get seed treatment', () => {
  // Each suffix carries its own "@", so the domain has to match exactly. That
  // matters in both directions: a real creator at a domain merely ending in
  // "razekit.demo" keeps their winner record, and a subdomain of a seed domain
  // does not quietly inherit seed status.
  assert.equal(isSeedEmail('someone@razekit.test.co.in'), false);
  assert.equal(isSeedEmail('someone@notrazekit.demo'), false);
  assert.equal(isSeedEmail('someone@mail.razekit.demo'), false);
});

test('missing and malformed addresses are not seeded', () => {
  for (const v of [null, undefined, '', '   ']) {
    assert.equal(isSeedEmail(v as any), false);
  }
});

test('the Prisma exclusion covers exactly the declared suffixes', () => {
  const covered = (notSeedWhere.NOT.OR as Array<{ email: { endsWith: string } }>)
    .map((c) => c.email.endsWith);
  assert.deepEqual(covered, SEED_SUFFIXES);
});

// ── The regression this exists to prevent ───────────────────────────────────
//
// platformStats excluded seeded accounts and reported 2 winners. winnersShowcase
// did not, and published 109 — 107 of them simulation records with invented
// brands and prize money, shown publicly as finalized results. The two endpoints
// are in different files, so nothing but this test stops them diverging again.

const winnersSource = readFileSync(
  fileURLToPath(new URL('../src/functions/winners.ts', import.meta.url)),
  'utf8',
);

test('the public winners showcase publishes only real accounts', () => {
  assert.match(winnersSource, /realUserIds/,
    'winnersShowcase must consult the real-account list');
  assert.match(winnersSource, /realIds\.has\(s\.creator_id\)/,
    'a snapshot is published only when its creator resolves to a real account');
});

test('the public surfaces test membership, never absence', () => {
  // The distinction is the whole fix. "Not a seed account" passes anything whose
  // id matches no account at all, and production had exactly that: purged QA
  // accounts leaving ScoreSnapshot rows behind with denormalised names.
  assert.doesNotMatch(winnersSource, /!seedIds\.has/,
    'absence-based exclusion fails open on orphaned records — require membership instead');
});

test('the public leaderboard applies the same rule as the showcase', () => {
  // Two call sites, one per endpoint: deleting either reintroduces the bug in
  // only one surface, which is how it went unnoticed the first time.
  const calls = winnersSource.match(/await realUserIds\(\)/g) || [];
  assert.equal(calls.length, 2,
    'both winnersShowcase and winnersLeaderboard must require real accounts');
});

// ── Discover ────────────────────────────────────────────────────────────────
//
// Same defect, different page: /discover advertised 61 open briefs against 5
// real contests, every seeded one already past its deadline.

const real = new Set(['real-1', 'real-2']);
const row = (id, owner) => ({ id, created_by_id: owner });

test('a seeded contest never reaches the public Discover page', () => {
  const out = publicContests(
    [row('a', 'seed-1'), row('b', 'real-1'), row('c', 'seed-2')],
    real,
    50,
  );
  assert.deepEqual(out.map((c) => c.id), ['b']);
});

test('filtering happens before the page is cut, not after', () => {
  // The seeded rows are the newest, so they arrive first. Slicing first would
  // return a page of rows that are then thrown away, leaving Discover looking
  // empty while real contests sat just past the cut.
  const rows = [
    ...Array.from({ length: 10 }, (_, i) => row(`s${i}`, 'seed-1')),
    row('real-a', 'real-1'),
    row('real-b', 'real-2'),
  ];
  const out = publicContests(rows, real, 2);
  assert.deepEqual(out.map((c) => c.id), ['real-a', 'real-b']);
});

test('an empty or unreadable contest list yields an empty page, not a crash', () => {
  assert.deepEqual(publicContests([], real, 10), []);
  assert.deepEqual(publicContests(null as any, real, 10), []);
  assert.deepEqual(publicContests([null as any, row('b', 'real-1')], real, 10).map((c) => c.id), ['b']);
});

test('a contest whose owner no longer exists is not published', () => {
  // The orphan case, and the reason this tests membership rather than absence.
  // A contest with a missing or dangling created_by_id resolves to nobody, so
  // there is no brand behind it for a creator to enter a contest with.
  assert.deepEqual(publicContests([row('x', undefined)], real, 10), []);
  assert.deepEqual(publicContests([row('y', 'deleted-account')], real, 10), []);
});
