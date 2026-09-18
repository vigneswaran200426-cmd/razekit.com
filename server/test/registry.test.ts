// Registry consistency.
//
// This test exists because of a bug it would have caught immediately: ten
// handlers — the whole notification centre, the campaign report, the creator
// track record, the fraud signals and the scoring/disqualification controls —
// were imported into the registry and listed in HTTP_ALLOWED, but never added
// to the HANDLERS object. They were unreachable over HTTP for as long as that
// was true, and every unit test for them passed, because those tests import the
// functions directly and never go through this table.
//
// So the lesson encoded here is narrow and worth keeping: testing a function is
// not the same as testing that anyone can call it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HANDLERS, HTTP_ALLOWED, PUBLIC_FUNCTIONS, ADMIN_ONLY } from '../src/functions/registry.js';

const names = new Set(Object.keys(HANDLERS));

test('every allow-listed name resolves to a real handler', () => {
  // The dangerous direction: a rename updates HANDLERS but not this set, so the
  // OLD name stays gated while the NEW one is reachable with no gate at all.
  const missing = [...HTTP_ALLOWED].filter((n) => !names.has(n));
  assert.deepEqual(missing, [], `HTTP_ALLOWED names handlers that do not exist: ${missing.join(', ')}`);
});

test('every public function resolves to a real handler', () => {
  const missing = [...PUBLIC_FUNCTIONS].filter((n) => !names.has(n));
  assert.deepEqual(missing, [], `PUBLIC_FUNCTIONS names handlers that do not exist: ${missing.join(', ')}`);
});

test('every admin-gated name resolves to a real handler', () => {
  const missing = [...ADMIN_ONLY].filter((n) => !names.has(n));
  assert.deepEqual(missing, [], `ADMIN_ONLY names handlers that do not exist: ${missing.join(', ')}`);
});

test('a public function is actually reachable', () => {
  // Being in PUBLIC_FUNCTIONS but not HTTP_ALLOWED means the public intent was
  // never delivered — the endpoint is simply off.
  const unreachable = [...PUBLIC_FUNCTIONS].filter((n) => names.has(n) && !HTTP_ALLOWED.has(n));
  assert.deepEqual(unreachable, [], `public but unreachable: ${unreachable.join(', ')}`);
});

test('nothing is both admin-only and public', () => {
  // A contradiction the route boundary resolves in the WRONG direction.
  const both = [...ADMIN_ONLY].filter((n) => PUBLIC_FUNCTIONS.has(n));
  assert.deepEqual(both, [], `both ADMIN_ONLY and PUBLIC: ${both.join(', ')}`);
});

test('the public surface stays small and deliberate', () => {
  // Not a style rule: every name here is callable with no session, so the set
  // growing without anyone noticing is the thing to catch. If a new public
  // endpoint is genuinely wanted, this list is where it gets argued for.
  const expected = [
    // Narrows a read that was already public: Discover previously queried the
    // Contest entity straight from the browser, which is public by RLS and
    // returned seeded simulation contests alongside real ones.
    'contestDiscover',
    'creatorPublicProfile',
    // Creators and published work for Explore. Both entities it replaces were
    // already public by RLS; this narrows the read to real accounts.
    'exploreDirectory',
    'paymentModeInfo',
    'platformStats',
    'pollList',
    'pollVote',
    // What each platform's API can actually measure. Carries no credentials and
    // no user data — only capability. A creator deciding whether to enter a
    // contest, and a brand deciding which platform to run it on, both need to
    // know that Reddit cannot report views BEFORE they commit to it.
    'socialCapabilities',
    'uropayAvailability',
    'uropayWebhook',
    'winnersLeaderboard',
    'winnersShowcase',
  ];
  assert.deepEqual([...PUBLIC_FUNCTIONS].sort(), expected);
});

test('handlers are functions, not accidentally undefined', () => {
  // `import { thing }` of a name that does not exist yields undefined rather
  // than throwing, so a typo in an import lands here as a silent dead route.
  const notFunctions = Object.entries(HANDLERS)
    .filter(([, fn]) => typeof fn !== 'function')
    .map(([n]) => n);
  assert.deepEqual(notFunctions, [], `not callable: ${notFunctions.join(', ')}`);
});
