import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedDuration, validatePrizeDuration, tierForPrize, GLOBAL_MAX_DAYS } from '../src/contest/duration.js';

// Spec §55 — exact prize boundaries must be deterministic.
test('prize tier boundaries are exact', () => {
  assert.equal(tierForPrize(5000).tier, 'A');
  assert.equal(tierForPrize(20000).tier, 'A');   // 20,000 = Tier A
  assert.equal(tierForPrize(20001).tier, 'B');   // 20,001 = Tier B
  assert.equal(tierForPrize(50000).tier, 'B');   // 50,000 = Tier B
  assert.equal(tierForPrize(50001).tier, 'C');   // 50,001 = Tier C
  assert.equal(tierForPrize(100000).tier, 'C');  // 1,00,000 = Tier C
  assert.equal(tierForPrize(100001).tier, 'D');  // 1,00,001 = Tier D
});

test('allowed duration windows match the specification', () => {
  assert.deepEqual([allowedDuration(5000).minDays, allowedDuration(5000).maxDays], [1, 3]);
  assert.deepEqual([allowedDuration(20000).minDays, allowedDuration(20000).maxDays], [1, 3]);
  assert.deepEqual([allowedDuration(20001).minDays, allowedDuration(20001).maxDays], [1, 7]);
  assert.deepEqual([allowedDuration(50000).minDays, allowedDuration(50000).maxDays], [1, 7]);
  assert.deepEqual([allowedDuration(50001).minDays, allowedDuration(50001).maxDays], [7, 15]);
  assert.deepEqual([allowedDuration(100000).minDays, allowedDuration(100000).maxDays], [7, 15]);
  assert.deepEqual([allowedDuration(100001).minDays, allowedDuration(100001).maxDays], [7, 30]);
  assert.deepEqual([allowedDuration(2000000).minDays, allowedDuration(2000000).maxDays], [7, 30]);
});

test('spec worked examples', () => {
  assert.ok(validatePrizeDuration({ prizeAmount: 15000, days: 3 }).ok);   // 1-3
  assert.ok(validatePrizeDuration({ prizeAmount: 35000, days: 7 }).ok);   // 1-7
  assert.ok(validatePrizeDuration({ prizeAmount: 75000, days: 15 }).ok);  // 7-15
  assert.ok(validatePrizeDuration({ prizeAmount: 200000, days: 30 }).ok); // 7-30
});

test('invalid prize/duration combinations are REJECTED', () => {
  assert.equal(validatePrizeDuration({ prizeAmount: 5000, days: 10 }).ok, false);    // §14
  assert.equal(validatePrizeDuration({ prizeAmount: 50000, days: 15 }).ok, false);   // §14
  assert.equal(validatePrizeDuration({ prizeAmount: 50001, days: 5 }).ok, false);    // §14 below min
  assert.equal(validatePrizeDuration({ prizeAmount: 100001, days: 31 }).ok, false);  // §14 over cap
});

test('no contest may exceed the global 30-day maximum', () => {
  assert.equal(GLOBAL_MAX_DAYS, 30);
  const r = validatePrizeDuration({ prizeAmount: 5000000, days: 31 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'DURATION_ABOVE_GLOBAL_MAX');
  assert.equal(validatePrizeDuration({ prizeAmount: 5000000, days: 45 }).ok, false);
});

test('zero and negative durations rejected', () => {
  assert.equal(validatePrizeDuration({ prizeAmount: 15000, days: 0 }).ok, false);
  assert.equal(validatePrizeDuration({ prizeAmount: 15000, days: -3 }).ok, false);
});
