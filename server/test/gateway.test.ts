import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition, assertTransition, PAYMENT_STATE, GATEWAY_STATE,
  acceptsNewOperations, activeGateway, listAdapters, offPlatformAdapter,
} from '../src/payments/gateway.js';

const S = PAYMENT_STATE;

test('legal payment transitions', () => {
  assert.ok(canTransition(S.CREATED, S.PENDING));
  assert.ok(canTransition(S.PENDING, S.PAID));
  assert.ok(canTransition(S.PAID, S.REFUNDED));
  assert.ok(canTransition(S.PAID, S.SETTLED));
});

// Spec 22: no forged success, no duplicate payment, no resurrection.
test('illegal transitions are rejected', () => {
  assert.equal(canTransition(S.PAID, S.PENDING), false);      // cannot walk backwards
  assert.equal(canTransition(S.FAILED, S.PAID), false);       // terminal
  assert.equal(canTransition(S.CANCELLED, S.PAID), false);
  assert.equal(canTransition(S.EXPIRED, S.PAID), false);
  assert.equal(canTransition(S.REFUNDED, S.PAID), false);
  assert.throws(() => assertTransition(S.FAILED, S.PAID), /ILLEGAL_PAYMENT_TRANSITION/);
});

test('replaying the same state is idempotent (webhook redelivery)', () => {
  assert.ok(canTransition(S.PAID, S.PAID));
  assert.equal(assertTransition(S.PAID, S.PAID), S.PAID);
});

test('a payment must start at CREATED', () => {
  assert.ok(canTransition(null, S.CREATED));
  assert.equal(canTransition(null, S.PAID), false);
});

test('gateway lifecycle gates new operations only', () => {
  assert.equal(acceptsNewOperations(GATEWAY_STATE.ACTIVE), true);
  assert.equal(acceptsNewOperations(GATEWAY_STATE.DISABLED), false);
  assert.equal(acceptsNewOperations(GATEWAY_STATE.MAINTENANCE), false);
  assert.equal(acceptsNewOperations(GATEWAY_STATE.DEPRECATED), false);
});

test('no gateway configured => core degrades honestly, never fakes success', () => {
  const g = activeGateway();
  assert.equal(g.adapter.id, offPlatformAdapter.id);
  assert.equal(g.accepts, false);          // cannot take money
  assert.equal(g.reason, 'not_configured');
  assert.equal(g.adapter.capabilities.supportsPayment, false);
  assert.equal(g.adapter.createPayment, null);
});

test('adapters declare capabilities rather than the core assuming them', () => {
  const a = listAdapters()[0];
  for (const k of ['supportsPayment', 'supportsRefund', 'supportsPartialRefund', 'supportsPayout', 'supportsWebhook']) {
    assert.equal(typeof a.capabilities[k], 'boolean', k);
  }
});
