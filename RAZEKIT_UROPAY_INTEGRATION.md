# RazeKit — UroPay integration

What this document describes: the code in `server/src/payments/uropay.ts` and the boundary it plugs
into, `server/src/payments/gateway.ts`. It describes what those two files actually do today. Where
something is written but not yet connected to a caller, it says so in **Known limitations** rather
than implying it runs.

---

## 1. The adapter boundary

`payments/gateway.ts` defines the only shape a payment provider may take. Core RazeKit code
(contest, funding, ledger, payout, admin) never imports a provider and never branches on a
provider status. It talks to:

- **`PAYMENT_STATE`** — the normalized internal states: `CREATED`, `PENDING`, `REQUIRES_ACTION`,
  `PROCESSING`, `PAID`, `FAILED`, `EXPIRED`, `CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED`,
  `REVERSED`, `DISPUTED`, `SETTLED`.
- **`canTransition(from, to)` / `assertTransition(from, to)`** — a declared transition table. A
  payment cannot walk backwards (`PAID -> PENDING` is refused) and a terminal state
  (`FAILED`, `EXPIRED`, `CANCELLED`, `REFUNDED`, `REVERSED`) has no outgoing edges. Replaying the
  same state is allowed and is a no-op.
- **`defineAdapter(spec)`** — produces an adapter with a `capabilities` block whose defaults are all
  `false`. A provider must *declare* what it can do; nothing is assumed.
- **`registerAdapter` / `listAdapters` / `activeGateway()`** — the registry and the resolver.

`activeGateway()` reads `PAYMENT_GATEWAY` (a specific adapter id) or falls back to `PAYMENT_MODE`.
It returns `accepts: false` unless the adapter is both configured *and* declares
`supportsPayment: true`, and it reports a `reason` (`unknown_adapter`, `not_configured`,
`gateway_<state>`). An unknown id resolves to `offPlatformAdapter`, which deliberately supports no
payments — the core degrades to something that provably cannot take money.

## 2. The real UroPay API surface

UroPay is a UPI **collection** provider: the payer sends money by UPI to the merchant's own account
and UroPay reports what it detects. Three endpoints are implemented.

| Call | Endpoint | Implemented by |
| --- | --- | --- |
| Create an order | `POST /order/generate` | `createUropayOrder()` |
| Attach a payer UTR | `PATCH /order/update` | `submitUropayUtr()` |
| Read authoritative status | `GET /order/status/:id` | `fetchUropayOrderStatus()` |

Base URL is pinned to `https://api.uropay.me`. An override env var is read, but it is used **only**
if it parses as a URL with an `https:` protocol; anything else falls through to the pinned default.

`createUropayOrder` sends `amount` in **paise** — the same minor unit RazeKit stores, so there is no
conversion and no rounding at the boundary. `merchantOrderId` is RazeKit's own reference, which is
what makes a retry safe: the same reference sent twice is the same order at UroPay. Customer name,
email and transaction note are length-clamped (120 / 200 / 100). It returns `provider_order_id`,
`provider_status`, the mapped `state`, `upi_string`, `qr_code` and `amount_in_rupees`.

All three go through one `call()` helper: 15 s `AbortController` timeout, `redirect: 'error'`,
non-JSON bodies rejected as `UROPAY_BAD_RESPONSE`, and HTTP 429 surfaced as its own
`UROPAY_RATE_LIMITED` code (the provider documents 60 requests/minute per key) so a caller can back
off instead of recording a payment failure. Errors are thrown as `UropayError` carrying
`code`, `status` and an optional `detail`.

## 3. Authentication

Two headers, built in `authHeaders()`:

- `X-API-KEY: <api key>`
- `Authorization: Bearer <hex SHA-512 of the shared secret>`

The raw secret is never transmitted and never written to a log line. The status endpoint is
documented as needing no authorisation, so `fetchUropayOrderStatus` calls it with `auth: false` —
credentials are not sent where they are not required.

Test and production credentials are read from **different** variables and never fall back to one
another, so a missing production secret fails closed instead of quietly using a sandbox key.
`uropayLive()` requires all three of: environment resolved to production, credentials present, and
an explicit production-enable flag set to `true`.

## 4. Webhook signature verification

UroPay signs with **HMAC-SHA256** where the *key* is the hex SHA-512 of the shared secret and the
*data* is the payload serialised with its keys in a provider-defined order.

Key order is part of the signature, so it is spelled out per event type in `signingKeyOrder()`
rather than left to object iteration order:

- `order.status.changed` → `event, uroPayOrderId, merchantOrderId, orderStatus, submittedUTR, environment`
- `order.status.utrsubmitted` → `event, uroPayOrderId, merchantOrderId, orderStatus, submittedUTR,
  amount, customerName, customerEmail, customerVPA, environment, utrSubmittedAt`
- `companion.sms.data` → `event` first, then the remaining keys sorted alphabetically, then the fixed
  tail `uroPayOrderId, merchantOrderId, detectedAt, environment`
- anything else → `event` first, remaining keys sorted. Deterministic, and it simply will not match
  unless the provider happens to agree — which is the safe direction to fail in.

The serialised body emulates PHP's `json_encode` defaults, because that is what the provider uses:
no spaces, `/` escaped as `\/`, and every code unit above `0x7F` escaped as `\uXXXX`. The encoder
walks UTF-16 code units rather than code points, so a surrogate pair (an emoji in a payer's name)
is emitted as two escapes, the way PHP emits it. Two candidate bodies are compared: the PHP-style
encoding and plain `JSON.stringify` of the same ordered object, covering a provider configured with
unescaped slashes.

`verifyUropayWebhook()` strips an optional `sha256=` prefix, compares with
`crypto.timingSafeEqual` after a length check, and **returns a reason instead of throwing**
(`not_configured`, `missing_signature`, `malformed_payload`, `signature_mismatch`) so the caller can
record a rejected event — a stream of bad signatures is a signal worth seeing.

`webhookEnvironmentMatches()` additionally refuses an event whose `environment` field does not match
the environment RazeKit is running as, so a sandbox event cannot act on production data. A payload
that omits the field is allowed through, because the signature already gated it.

## 5. Provider status → internal state

| UroPay status | Internal state | Why |
| --- | --- | --- |
| `CREATED` | `CREATED` | order exists, nothing paid |
| `PENDING` | `PENDING` | awaiting the payer |
| `UPDATED` | `PROCESSING` | something changed, not a confirmation |
| `UTR_SUBMITTED` | `PROCESSING` | the payer **claims** a reference number |
| `REVIEW_REQUIRED` | `PROCESSING` | UroPay could not decide; a person must look |
| `COMPLETED` | `PAID` | the only mapping that means money |
| `FAILED` | `FAILED` | terminal |
| `CANCELLED` | `CANCELLED` | terminal |
| *anything unrecognised* | `PENDING` | a new provider state can never silently widen "paid" |

`needsProviderReview(status)` reports `true` for `REVIEW_REQUIRED` and `UTR_SUBMITTED` — the two
states that are still waiting on a human at the provider's end.

## 6. The three capability limits

Declared on the adapter, not assumed, and repeated in plain words by `uropayHealth()`:

1. **UPI collection only.** `rails: ['UPI']`, `supportedCurrencies: ['INR']`. There is no card rail.
2. **No refund API.** `supportsRefund: false`, `supportsPartialRefund: false`, and `refund` is
   `null`. Refunds are reviewed and transferred by an admin and recorded afterwards.
3. **No payout API.** `supportsPayout: false` and `payout` is `null`. Creator payouts run on the
   manual beta process.

`refund` and `payout` being `null` is how "we cannot do this" is expressed: the core checks that the
function exists before offering the operation. The adapter also declares
`instantConfirmation: false` and `providerReviewPossible: true`, so no surface can promise a speed
the provider does not offer.

## 7. What is allowed to credit the ledger

**Only a `COMPLETED` result from an authoritative status lookup.** Not a webhook on its own, and not
a browser returning from a redirect. `fetchUropayOrderStatus()` carries the comment that says this
explicitly: everything else is a hint that it is worth asking.

The credit itself is posted by `settleFundingReceipt()` in `server/src/functions/finance.ts`, which
is shared with the manual bank path so the two cannot drift into different ideas of "funded". It
must run inside `withTransaction` with the funding row locked, and its `bankReference` argument is
the idempotency key — the bank UTR for a manual transfer, the provider's own order id for UroPay.
The same reference presented twice credits once, enforced three ways: a duplicate-reference check
against prior `FundingReceipt` rows, the ledger transaction idempotency key, and a Postgres partial
unique index on `idempotency_key` created at boot by `ensureFinanceConstraints()`.

## 8. Environment variables (names only)

`UROPAY_ENV`, `UROPAY_TEST_KEY`, `UROPAY_TEST_SECRET`, `UROPAY_PRODUCTION_KEY`,
`UROPAY_PRODUCTION_SECRET`, `UROPAY_PRODUCTION_ENABLED`, `UROPAY_VPA`, `UROPAY_VPA_NAME`.

The adapter also reads `UROPAY_BASE_URL` (optional, https-only override). No value for any of these
belongs in source, in a log, in an audit record or in an API response.

## Known limitations

- **The adapter is not wired.** No module imports `payments/uropay.ts`, so `registerAdapter` never
  runs at boot. Setting the gateway id to `uropay` today resolves to the off-platform adapter,
  because the registry lookup falls back when the id is unknown. Connecting it means importing the
  module somewhere that runs at startup.
- **There is no webhook route.** `server/src/index.ts` mounts no UroPay endpoint, and nothing calls
  `verifyUropayWebhook()` or `webhookEnvironmentMatches()`. The verification logic is written and
  unit-testable; the HTTP surface that would use it does not exist yet.
- **There is no replay/nonce store.** Replay safety today comes from the money layer only: the
  ledger idempotency key, the `FundingReceipt` duplicate-reference check and the unique index. A
  webhook handler, when written, will also need event-level deduplication so a replayed *signed*
  event does not re-enter the status-lookup path.
- **`uropayHealth()` has no caller.** Admin System Health does not surface it.
- **No live call has been made.** The endpoint paths, field names, status vocabulary, signing key
  order and the 60/minute rate limit are transcribed from the provider's documentation as recorded
  in the adapter. None of it has been verified against a live UroPay account from this repository.
- **`createPayment` does not forward a transaction note**, so orders created through the adapter use
  the default note text.
