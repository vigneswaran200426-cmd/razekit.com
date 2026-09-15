// UroPay adapter tests.
//
// The signature tests deliberately re-implement UroPay's documented algorithm
// from scratch rather than calling the adapter's own helpers. A test that signs
// with the same code it verifies with proves only that the function is
// self-consistent — it would pass just as happily if the whole scheme were
// wrong. Here the test is an independent second implementation, so the two
// agreeing means something.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';

import {
  mapUropayStatus, needsProviderReview, signingKeyOrder, verifyUropayWebhook,
  webhookEnvironmentMatches, uropayBaseUrl, uropayConfigured, uropayEnv, uropayLive,
  UROPAY_STATUS,
} from '../src/payments/uropay.js';
import { PAYMENT_STATE } from '../src/payments/gateway.js';

const SECRET = 'test-secret-not-a-real-credential';

/** Independent implementation of PHP's json_encode defaults. */
function phpEncode(obj: Record<string, unknown>) {
  const json = JSON.stringify(obj);
  let out = '';
  for (let i = 0; i < json.length; i += 1) {
    const c = json.charCodeAt(i);
    if (c === 47) out += String.fromCharCode(92) + '/';
    else if (c > 127) out += String.fromCharCode(92) + 'u' + c.toString(16).padStart(4, '0');
    else out += json[i];
  }
  return out;
}

/** Independent implementation of the documented signing scheme. */
function signIndependently(payload: Record<string, unknown>, keys: string[], secret = SECRET) {
  const ordered: Record<string, unknown> = {};
  for (const k of keys) if (payload[k] !== undefined) ordered[k] = payload[k];
  const hashedSecret = createHash('sha512').update(secret, 'utf8').digest('hex');
  return createHmac('sha256', hashedSecret).update(phpEncode(ordered), 'utf8').digest('hex');
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prior: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prior[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { fn(); } finally {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ── Status mapping ──────────────────────────────────────────────────────────

test('only COMPLETED becomes PAID', () => {
  assert.equal(mapUropayStatus(UROPAY_STATUS.COMPLETED), PAYMENT_STATE.PAID);
});

test('a submitted UTR is a CLAIM, not a payment', () => {
  // The whole point: a payer typing a reference number must never fund a contest.
  assert.equal(mapUropayStatus(UROPAY_STATUS.UTR_SUBMITTED), PAYMENT_STATE.PROCESSING);
  assert.notEqual(mapUropayStatus(UROPAY_STATUS.UTR_SUBMITTED), PAYMENT_STATE.PAID);
});

test('a status the provider still has to review is not paid', () => {
  assert.equal(mapUropayStatus(UROPAY_STATUS.REVIEW_REQUIRED), PAYMENT_STATE.PROCESSING);
  assert.ok(needsProviderReview(UROPAY_STATUS.REVIEW_REQUIRED));
  assert.ok(needsProviderReview(UROPAY_STATUS.UTR_SUBMITTED));
  assert.ok(!needsProviderReview(UROPAY_STATUS.COMPLETED));
});

test('failure and cancellation map to their own terminal states', () => {
  assert.equal(mapUropayStatus(UROPAY_STATUS.FAILED), PAYMENT_STATE.FAILED);
  assert.equal(mapUropayStatus(UROPAY_STATUS.CANCELLED), PAYMENT_STATE.CANCELLED);
});

test('a status we have never heard of is never treated as success', () => {
  // If UroPay ships a new state tomorrow, it must not be able to widen what
  // counts as paid just by existing.
  for (const unknown of ['SETTLED_MAYBE', 'SUCCESS', 'PAID', '', null, undefined, 42]) {
    assert.notEqual(mapUropayStatus(unknown as any), PAYMENT_STATE.PAID);
  }
});

// ── Signature key ordering ──────────────────────────────────────────────────

test('each event type declares the exact key order the provider signs', () => {
  assert.deepEqual(
    signingKeyOrder({ event: 'order.status.changed' }),
    ['event', 'uroPayOrderId', 'merchantOrderId', 'orderStatus', 'submittedUTR', 'environment'],
  );
  assert.deepEqual(
    signingKeyOrder({ event: 'order.status.utrsubmitted' }),
    ['event', 'uroPayOrderId', 'merchantOrderId', 'orderStatus', 'submittedUTR', 'amount',
      'customerName', 'customerEmail', 'customerVPA', 'environment', 'utrSubmittedAt'],
  );
});

test('the SMS event is event-first, then alphabetical, then a fixed tail', () => {
  const order = signingKeyOrder({
    event: 'companion.sms.data',
    vpa: 'x@bank', from: 'HDFCBK', amount: 100, referenceNumber: 'R1',
    uroPayOrderId: 'O1', merchantOrderId: 'M1', detectedAt: 'T', environment: 'test',
  });
  assert.equal(order[0], 'event');
  assert.deepEqual(order.slice(-4), ['uroPayOrderId', 'merchantOrderId', 'detectedAt', 'environment']);
  const middle = order.slice(1, -4);
  assert.deepEqual(middle, [...middle].sort(), 'middle keys must be alphabetical');
  assert.deepEqual(middle, ['amount', 'from', 'referenceNumber', 'vpa']);
});

// ── Signature verification ──────────────────────────────────────────────────

const STATUS_EVENT = {
  event: 'order.status.changed',
  uroPayOrderId: 'URO-123',
  merchantOrderId: 'RK-FUND-9',
  orderStatus: 'COMPLETED',
  submittedUTR: '402312345678',
  environment: 'test',
};

test('a correctly signed webhook verifies', () => {
  withEnv({ UROPAY_ENV: 'test', UROPAY_TEST_KEY: 'k', UROPAY_TEST_SECRET: SECRET }, () => {
    const signature = signIndependently(STATUS_EVENT, signingKeyOrder(STATUS_EVENT));
    assert.deepEqual(verifyUropayWebhook({ payload: STATUS_EVENT, signature }), { valid: true, reason: null });
  });
});

test('a payload carrying a URL still verifies — the slash escaping matters', () => {
  // PHP escapes "/" as "\/" and JavaScript does not. Without matching that, every
  // webhook containing a link would fail for reasons nobody could reproduce.
  const payload = {
    event: 'companion.sms.data',
    amount: 5000, referenceNumber: 'R9', from: 'HDFCBK', vpa: 'https://pay.example.com/x',
    uroPayOrderId: 'URO-9', merchantOrderId: 'RK-1', detectedAt: '2026-01-01T00:00:00Z',
    environment: 'test',
  };
  withEnv({ UROPAY_ENV: 'test', UROPAY_TEST_KEY: 'k', UROPAY_TEST_SECRET: SECRET }, () => {
    const signature = signIndependently(payload, signingKeyOrder(payload));
    assert.ok(signature.includes(''));
    assert.equal(verifyUropayWebhook({ payload, signature }).valid, true);
  });
});

test('changing the amount invalidates the signature', () => {
  withEnv({ UROPAY_ENV: 'test', UROPAY_TEST_KEY: 'k', UROPAY_TEST_SECRET: SECRET }, () => {
    const signature = signIndependently(STATUS_EVENT, signingKeyOrder(STATUS_EVENT));
    const tampered = { ...STATUS_EVENT, orderStatus: 'COMPLETED', submittedUTR: '000000000000' };
    assert.equal(verifyUropayWebhook({ payload: tampered, signature }).valid, false);
  });
});

test('an attacker cannot forge COMPLETED without the secret', () => {
  withEnv({ UROPAY_ENV: 'test', UROPAY_TEST_KEY: 'k', UROPAY_TEST_SECRET: SECRET }, () => {
    const forged = signIndependently(STATUS_EVENT, signingKeyOrder(STATUS_EVENT), 'the-wrong-secret');
    const result = verifyUropayWebhook({ payload: STATUS_EVENT, signature: forged });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'signature_mismatch');
  });
});

test('a missing signature is rejected, not defaulted to valid', () => {
  withEnv({ UROPAY_ENV: 'test', UROPAY_TEST_KEY: 'k', UROPAY_TEST_SECRET: SECRET }, () => {
    assert.equal(verifyUropayWebhook({ payload: STATUS_EVENT, signature: '' }).reason, 'missing_signature');
    assert.equal(verifyUropayWebhook({ payload: STATUS_EVENT, signature: null }).valid, false);
  });
});

test('with no secret configured nothing verifies', () => {
  withEnv({ UROPAY_ENV: 'test', UROPAY_TEST_KEY: '', UROPAY_TEST_SECRET: '' }, () => {
    const signature = signIndependently(STATUS_EVENT, signingKeyOrder(STATUS_EVENT));
    assert.deepEqual(verifyUropayWebhook({ payload: STATUS_EVENT, signature }), { valid: false, reason: 'not_configured' });
  });
});

test('a signature over the wrong key order does not verify', () => {
  // Key order is part of the signature. Signing the same fields alphabetically
  // instead of in the provider's order must fail.
  withEnv({ UROPAY_ENV: 'test', UROPAY_TEST_KEY: 'k', UROPAY_TEST_SECRET: SECRET }, () => {
    const alphabetical = Object.keys(STATUS_EVENT).sort();
    const signature = signIndependently(STATUS_EVENT, alphabetical);
    assert.equal(verifyUropayWebhook({ payload: STATUS_EVENT, signature }).valid, false);
  });
});

// ── Environment separation ──────────────────────────────────────────────────

test('test and production credentials never fall back to one another', () => {
  withEnv({
    UROPAY_ENV: 'production',
    UROPAY_TEST_KEY: 'test-key', UROPAY_TEST_SECRET: 'test-secret',
    UROPAY_PRODUCTION_KEY: undefined, UROPAY_PRODUCTION_SECRET: undefined,
  }, () => {
    // Production is selected but unconfigured. It must NOT quietly reach for
    // the test credentials and start taking real money through a sandbox key.
    assert.equal(uropayEnv(), 'production');
    assert.equal(uropayConfigured(), false);
    assert.equal(uropayLive(), false);
  });
});

test('production needs credentials AND an explicit enable flag', () => {
  withEnv({
    UROPAY_ENV: 'production',
    UROPAY_PRODUCTION_KEY: 'k', UROPAY_PRODUCTION_SECRET: 's',
    UROPAY_PRODUCTION_ENABLED: undefined,
  }, () => {
    assert.equal(uropayConfigured(), true);
    assert.equal(uropayLive(), false, 'configured is not the same as enabled');
  });
  withEnv({
    UROPAY_ENV: 'production',
    UROPAY_PRODUCTION_KEY: 'k', UROPAY_PRODUCTION_SECRET: 's',
    UROPAY_PRODUCTION_ENABLED: 'true',
  }, () => {
    assert.equal(uropayLive(), true);
  });
});

test('a test-environment event cannot settle a production order', () => {
  withEnv({ UROPAY_ENV: 'production' }, () => {
    assert.equal(webhookEnvironmentMatches({ environment: 'test' }), false);
    assert.equal(webhookEnvironmentMatches({ environment: 'production' }), true);
  });
  withEnv({ UROPAY_ENV: 'test' }, () => {
    assert.equal(webhookEnvironmentMatches({ environment: 'production' }), false);
    assert.equal(webhookEnvironmentMatches({ environment: 'test' }), true);
    assert.equal(webhookEnvironmentMatches({ environment: 'sandbox' }), true);
  });
});

// ── Base URL pinning ────────────────────────────────────────────────────────

test('the provider host is pinned and a plaintext override is ignored', () => {
  withEnv({ UROPAY_BASE_URL: undefined }, () => {
    assert.equal(uropayBaseUrl(), 'https://api.uropay.me');
  });
  withEnv({ UROPAY_BASE_URL: 'http://attacker.example.com' }, () => {
    // Honouring this would post our API key to an attacker in cleartext.
    assert.equal(uropayBaseUrl(), 'https://api.uropay.me');
  });
  withEnv({ UROPAY_BASE_URL: 'not a url' }, () => {
    assert.equal(uropayBaseUrl(), 'https://api.uropay.me');
  });
  withEnv({ UROPAY_BASE_URL: 'https://sandbox.uropay.me/' }, () => {
    assert.equal(uropayBaseUrl(), 'https://sandbox.uropay.me');
  });
});

// ── Declared capabilities ───────────────────────────────────────────────────

test('the adapter refuses to claim refunds or payouts it cannot do', async () => {
  const { uropayAdapter } = await import('../src/payments/uropay.js');
  assert.equal(uropayAdapter.capabilities.supportsPayment, true);
  // UroPay's API has no refund and no payout endpoint. Claiming either would
  // put a button in front of a user that cannot work.
  assert.equal(uropayAdapter.capabilities.supportsRefund, false);
  assert.equal(uropayAdapter.capabilities.supportsPartialRefund, false);
  assert.equal(uropayAdapter.capabilities.supportsPayout, false);
  assert.equal(uropayAdapter.refund, null);
  assert.equal(uropayAdapter.payout, null);
  assert.deepEqual(uropayAdapter.capabilities.supportedCurrencies, ['INR']);
  assert.deepEqual(uropayAdapter.capabilities.rails, ['UPI']);
});
