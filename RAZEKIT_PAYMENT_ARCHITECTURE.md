# RazeKit — payment architecture

What the money side of RazeKit actually does. Sources read for this document:
`server/src/payments/` (`gateway.ts`, `manualBeta.ts`, `config.ts`, `settings.ts`, `states.ts`,
`routes.ts`), `server/src/ledger/` (`accounts.ts`, `post.ts`, `events.ts`),
`server/src/finance/` (`balances.ts`, `permissions.ts`), `server/src/money/`, and the handlers in
`server/src/functions/` (`funding.ts`, `finance.ts`, `payouts.ts`, `withdrawals.ts`, `balance.ts`).

The sentence the whole design exists to enforce: **reporting a transfer creates no money. Only an
admin verifying a real receipt does.**

---

## 1. The payment core and the adapter boundary

The core is permanent; a provider is replaceable. `payments/gateway.ts` is the only place provider
code may be referenced from, and core modules depend on normalized states rather than on any
provider's vocabulary.

- `PAYMENT_STATE` — `CREATED`, `PENDING`, `REQUIRES_ACTION`, `PROCESSING`, `PAID`, `FAILED`,
  `EXPIRED`, `CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `REVERSED`, `DISPUTED`, `SETTLED`.
- A declared transition table with `canTransition` / `assertTransition`. A payment cannot move
  backwards, terminal states have no outgoing edges, and replaying the same state is a no-op so a
  retry is safe.
- `defineAdapter(spec)` — every capability defaults to `false`. An adapter declares what it can do;
  the core checks the declaration (and, for refund/payout, whether the function exists at all) before
  offering an operation.
- `activeGateway()` — resolves the adapter and reports `accepts` plus a `reason`. `accepts` is false
  unless the adapter is configured **and** declares `supportsPayment`. An unknown adapter id falls
  back to `offPlatformAdapter`, which supports nothing — the core degrades to something that provably
  cannot take money rather than to a null check.
- `GATEWAY_STATE` — `ACTIVE` / `DISABLED` / `MAINTENANCE` / `DEPRECATED`. Only `ACTIVE` accepts new
  operations; the others stop new work while every historical record, ledger entry and payout stays
  readable.

## 2. The manual beta adapter

`payments/manualBeta.ts` plugs into that same boundary, so moving to an automated provider later
means writing one adapter — not rewriting contest, winner, tracker, ledger, admin, finance or audit
code.

What makes it different from a provider adapter is the thing that must never change: **it cannot
confirm a payment.**

- `createPayment` prepares instructions. No external call, no order reserved, nothing implying money
  moved. It returns `REQUIRES_ACTION` plus `requires_manual_verification: true`.
- `verifyPayment` always returns `PROCESSING`, `verified: false`, `requires_human: true`. It can
  never return `PAID`, so accidental future code cannot mark a contest funded.
- `refund` and `payout` return `requires_human: true` — they record transfers a person made; they do
  not move money.
- `verifyWebhook` returns `false`. There is no provider to call back, so nothing can pretend to be
  one.
- Capabilities declare `manualVerification: true` and `instantConfirmation: false`, so no surface can
  promise a speed the process does not have.

`fundingToPaymentState()` maps RazeKit's internal funding status onto the normalized states, which is
how the core reads the manual flow without knowing it is manual.

## 3. Configuration, masking and mode

`payments/config.ts` is server-only and must never reach a client bundle, a public endpoint or a log
line. Two functions expose the destination account and only two:

- `fullBankForInstructions()` — the full account, returned by exactly one caller
  (`fundingInstructions`) after it has proved an authenticated user, ownership of the contest, and a
  funding request in a state that expects a transfer. Never cached, never logged, never in a list
  response.
- `maskedBank()` — safe everywhere else: admin lists, audit records, emails. Account masking is six
  `X`s plus the last five digits, deliberately *not* length-preserving, so the mask leaks neither the
  digits nor the length. IFSC and UPI have their own maskers.

`PAYMENT_MODE` is `MANUAL_BETA` (the current mode), `GATEWAY` (boundary in place, not enabled), or
`MAINTENANCE` (funding paused, existing records readable). `betaNotice()` is the one source of
wording that appears on the funding page, in emails and in the API response; it states that RazeKit
is not a bank or a payment institution, that funds sit in an ordinary business bank account, that
payouts are made manually after a winner is finalized, and that verification and payout times are
targets rather than commitments.

`payments/settings.ts` holds the admin-configured instructions in the database, versioned: every
edit writes a **new** version rather than overwriting, because a funding request issued last month
must still be explainable against the details that were live when it was issued. Disabling a method
hides it from new funding flows and changes no historical record, proof file or ledger entry. The
UPI QR image lives in private storage and is served only through a short-lived signed URL
(`payments/routes.ts`).

## 4. State machines

`payments/states.ts` declares every legal transition, with `assert*` helpers that throw a 409 on an
illegal move. The states that matter:

**Funding.** `FUNDING_REQUIRED → PAYMENT_INSTRUCTIONS_SHOWN → TRANSFER_REPORTED →
PENDING_VERIFICATION → VERIFIED` (or `PARTIAL` / `OVERPAID` / `REJECTED` / `NEEDS_INFORMATION` /
`CANCELLED`). `TRANSFER_REPORTED` is documented in the code as *a claim, not a payment*. Only
`VERIFIED` or `OVERPAID` satisfy `isFunded()`, and only those let a contest go live. Money that
arrived can leave again only through a refund.

**Withdrawal.** `REQUESTED → UNDER_REVIEW → APPROVED → PROCESSING → TRANSFER_SENT → PAID`, plus
`FAILED` / `ON_HOLD` / `CANCELLED` / `REVERSED`. Confirmation is a separate, deliberate step from
"I sent it". Paid money is never un-paid by editing a status — only by a reversal.

**Payout eligibility** and **refunds** have their own declared tables.

**Reconciliation.** `classifyReconciliation(expected, actual)` is deterministic and total: every pair
of numbers lands in exactly one of `MATCHED` / `MISMATCH` / `PARTIAL` / `OVERPAID` / `UNRESOLVED`.
"Close enough" is not one of them.

Human-facing copy for each state lives beside the states, so the UI and the emails cannot drift into
describing a state RazeKit does not have.

## 5. The double-entry ledger

### Chart of accounts (`ledger/accounts.ts`)

A rupee moves through pots with different meanings, and conflating them is how a platform pays a
creator with another client's prize money. Eight classes keep them separate by construction:

| Class | Meaning | Normal side |
| --- | --- | --- |
| `BANK_SETTLEMENT` | what is actually in the bank account | DEBIT |
| `CLIENT_FUNDS` | a client's money held, not yet committed | CREDIT |
| `CONTEST_PRIZE_COMMITMENT` | committed to one specific contest | CREDIT |
| `PAYOUT_LIABILITY` | owed to one specific creator, drawable | CREDIT |
| `WITHDRAWAL_PENDING` | owed money earmarked for a transfer in flight | CREDIT |
| `PLATFORM_FEE` | RazeKit's revenue | CREDIT |
| `TAX_PAYABLE` | tax collected on platform charges | CREDIT |
| `REFUND_CLEARING` | refunds approved, not yet transferred | CREDIT |

Account codes are deterministic (`CLASS:CURRENCY[:subjectId]`), so the same subject always resolves
to the same account and one brand never ends up with two books. Creation is idempotent on the code,
and a lost race keeps the first account rather than splitting a balance in two.

### The posting engine (`ledger/post.ts`)

The only place in RazeKit that writes money. Three rules, enforced here rather than trusted to
callers:

1. **Immutable.** A `LedgerEntry` is written once and never updated or deleted. A mistake is
   corrected by posting a reversal, so what was believed at the time survives.
2. **Balanced.** Debits must equal credits to the minor unit in every transaction. An unbalanced
   posting is refused, never adjusted.
3. **Idempotent.** Every transaction carries an idempotency key, checked *before* anything is
   written; a replay returns the original transaction and its entries with `replayed: true`. This is
   what makes a double-clicked "verify" safe.

Amounts are validated as positive integers of minor units and rejected above a safe-integer ceiling.
`reverseTransaction()` posts the mirror image with the key `reversal:<id>`; the original rows are
untouched and the two are linked, so an auditor sees the mistake *and* the correction. A reversal
cannot itself be reversed.

Application-level idempotency is backed at the database level: `db.ts → ensureFinanceConstraints()`
creates partial unique indexes at boot on the ledger idempotency key, one active funding request per
contest, one reported bank reference, and one open withdrawal per creator. A failure to apply them
is logged loudly rather than silently downgrading the protection.

### Domain events (`ledger/events.ts`)

Handlers never assemble ledger lines themselves. Each business event has exactly one double-entry
shape:

```
funding verified        BANK_SETTLEMENT (D)  → CLIENT_FUNDS + PLATFORM_FEE + TAX_PAYABLE (C)
prize reserved          CLIENT_FUNDS (D)     → CONTEST_PRIZE_COMMITMENT (C)
prize released          CONTEST_PRIZE_COMMITMENT (D) → CLIENT_FUNDS (C)
winner finalized        CONTEST_PRIZE_COMMITMENT (D) → PAYOUT_LIABILITY (C)
payout paid             PAYOUT_LIABILITY (D) → BANK_SETTLEMENT (C)
withdrawal requested    PAYOUT_LIABILITY (D) → WITHDRAWAL_PENDING (C)
withdrawal released     WITHDRAWAL_PENDING (D) → PAYOUT_LIABILITY (C)
withdrawal paid         WITHDRAWAL_PENDING (D) → BANK_SETTLEMENT (C)
refund approved         CLIENT_FUNDS + fee + tax (D) → REFUND_CLEARING (C)
refund paid             REFUND_CLEARING (D)  → BANK_SETTLEMENT (C)
```

Two details worth naming. The funding credit is keyed on the **bank reference**, not the funding
request, so one real transfer credits once while a genuine top-up under a different reference is a
legitimate second credit; fees and tax are booked only on the first receipt, so a top-up cannot bill
the client twice. And `postAdjustment()` refuses to run without a reason of at least five characters,
attributed to the admin who made it — an adjustment with no explanation is worse than no adjustment.

## 6. A balance is derived, not stored

`finance/balances.ts → razekitBalance()` computes five figures by **replaying ledger entries** for
the user's own accounts:

- `TOTAL` — everything the ledger attributes to this user
- `AVAILABLE` — usable now (a client can fund with it; a creator can request it)
- `RESERVED` — committed to a specific contest prize
- `PENDING` — a withdrawal in flight: no longer available, not yet paid
- `WITHDRAWABLE` — what a creator may request today, after the minimum and any holds

plus `PAID_OUT`, which is history rather than balance. The minimum withdrawal is ₹100 expressed in
minor units.

`LedgerAccount.balance_minor` exists, but it is a **cache**. `accounts.ts → replayBalance()` is the
authority and can rebuild it at any time; nothing reads the cached column to decide whether money
exists. Reconciliation compares the two rather than trusting either. `functions/balance.ts` serves
the same definition to both roles, so the number on screen and the number finance sees come from one
computation.

Naming is deliberate throughout: "RazeKit balance", "contest funding", "prize commitment",
"withdrawal request". RazeKit is not a bank and not a payment institution, and the product does not
imply otherwise.

## 7. Reporting a transfer creates no money

The ordering `functions/finance.ts` enforces and refuses to shortcut:

```
CLIENT SENDS REAL MONEY → it lands in RazeKit's bank account
ADMIN SEES the funding request
ADMIN VERIFIES the receipt against the bank statement
LEDGER CREDIT is posted
CLIENT BALANCE updates
CONTEST PRIZE is reserved   →   the contest goes live
```

`fundingReportTransfer` (client-facing) writes a claim and stops. `financeVerifyFunding` is the only
handler that creates money: it requires the `finance.verify_funding` permission, requires a bank
reference of at least four characters ("this is what makes the verification auditable"), runs inside
one database transaction with the funding row locked so two simultaneous clicks serialise, and posts
through `ledger/events.ts` rather than touching a balance. A second concurrent click re-reads inside
the lock and returns `already_verified: true` with no second credit.

The same applies at the other end: `withdrawals.ts` reserves on request and posts the **debit** only
when an admin confirms a transfer that has actually happened. RazeKit records transfers people made;
it never initiates one.

## 8. Permission segregation

`finance/permissions.ts` splits "admin" into separate grants — `finance.view`,
`finance.verify_funding`, `finance.review_withdrawal`, `finance.approve_withdrawal`,
`finance.confirm_payout`, `finance.view_sensitive_financial_data`, `finance.refund`,
`finance.reconcile`, `finance.adjust`, `finance.manage_permissions` — recorded in `AdminPermission`
with who granted them and when. Platform admins hold all of them implicitly, but the check still
runs, still names the permission, and still writes an audit record, so the log says *what authority
was used*. `SEGREGATION_PAIRS` and `selfApproval()` exist to keep one person from occupying both
sides of a money decision.

---

## Known limitations

- **The only adapter that can take money today is the manual beta one.** The UroPay adapter exists
  but is not imported anywhere, so it is not registered at runtime (see
  `RAZEKIT_UROPAY_INTEGRATION.md`).
- **No provider webhook endpoint exists**, so there is no inbound path that could credit anything
  automatically. That is currently a property of the deployment, not only of the design.
- **`replayBalance()` reads up to 10,000 entries per account** and `postTransaction` performs one
  read per line to find the prior balance. Correct, and not optimised for a large book.
- **Reconciliation is admin-triggered**, not scheduled — `scheduler.ts` runs only visual-asset
  maintenance.
- **Several inherited balance and payment entity families still exist in the schema** (listed in
  `entities/protected.ts` under the money section) and are fully write-blocked to clients. They are
  not part of the live path, which is `ContestFunding` → `LedgerTransaction` / `LedgerEntry` →
  `Payout` / `WithdrawalRequest`. Reading one of them would not tell you what a user's balance is;
  `finance/balances.ts` is the only answer to that question.
- **Currency support is INR and USD** in `money/core.ts`, but the prize→duration fairness tiers are
  defined only in INR; a non-INR contest is held only to the global 30-day cap.
