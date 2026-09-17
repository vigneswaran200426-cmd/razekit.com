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

test('the public winners showcase filters seeded accounts out', () => {
  assert.match(winnersSource, /seedUserIds/,
    'winnersShowcase must consult the seeded-account list');
  assert.match(winnersSource, /!seedIds\.has\(s\.creator_id\)/,
    'a snapshot whose creator is a seeded account must not reach the public showcase');
});

test('the public leaderboard filters seeded accounts out', () => {
  // Two call sites, one per endpoint: deleting either reintroduces the bug in
  // only one surface, which is how it went unnoticed the first time.
  const calls = winnersSource.match(/await seedUserIds\(\)/g) || [];
  assert.equal(calls.length, 2,
    'both winnersShowcase and winnersLeaderboard must exclude seeded accounts');
});

// ── Discover ────────────────────────────────────────────────────────────────
//
// Same defect, different page: /discover advertised 61 open briefs against 5
// real contests, every seeded one already past its deadline.

const seeded = new Set(['seed-1', 'seed-2']);
const row = (id, owner) => ({ id, created_by_id: owner });

test('a seeded contest never reaches the public Discover page', () => {
  const out = publicContests(
    [row('a', 'seed-1'), row('b', 'real-1'), row('c', 'seed-2')],
    seeded,
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
  const out = publicContests(rows, seeded, 2);
  assert.deepEqual(out.map((c) => c.id), ['real-a', 'real-b']);
});

test('an empty or unreadable contest list yields an empty page, not a crash', () => {
  assert.deepEqual(publicContests([], seeded, 10), []);
  assert.deepEqual(publicContests(null as any, seeded, 10), []);
  assert.deepEqual(publicContests([null as any, row('b', 'real-1')], seeded, 10).map((c) => c.id), ['b']);
});

test('a contest with no recorded owner is still shown', () => {
  // created_by_id can be absent on older rows. Undefined is not in the seed set,
  // so it survives — hiding a real contest because its owner field is missing
  // would be the worse failure.
  assert.deepEqual(publicContests([row('x', undefined)], seeded, 10).map((c) => c.id), ['x']);
});
