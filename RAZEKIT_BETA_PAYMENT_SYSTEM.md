# RazeKit Beta Manual Payment + Ledger

> **STATUS: PARKED — `PAYMENT_MODE=MAINTENANCE`.**
> Manual bank-transfer funding is **not in use**. Every bank credential has been
> removed: the `BETA_BANK_*` environment values are empty, and the
> `PaymentSettings` row that held them was deleted from the database. The
> platform accepts no funding — `fundingInstructions` returns
> **503 `FUNDING_PAUSED`** and the funding button does not render.
>
> The ledger, balances, withdrawals, Admin → Finance and the audit trail are
> **provider-independent and stay in place**. They are what an automated gateway
> plugs into. When the gateway API key arrives, the work is: write one adapter
> in `server/src/payments/`, register it, set `PAYMENT_MODE=GATEWAY`. Contest,
> Winner, Tracker, Ledger, Admin, Finance and Audit are unchanged.
>
> The rest of this document describes the manual flow as built, so it can be
> re-enabled or referenced later.


RazeKit is in beta and no payment gateway is connected. A client transfers the
prize to RazeKit's bank account, a person checks it against the bank statement,
and only then does the money exist in RazeKit's books. Creator payouts work the
same way in reverse: a person makes the transfer, records its reference, and
confirms it.

RazeKit is **not** a bank, an escrow service, a regulated wallet or a payment
aggregator. Funds sit in an ordinary business bank account. The product says
"RazeKit balance", "contest funding", "prize commitment" and "withdrawal
request" — never "wallet" or "escrow" — because those words would claim
protections that do not exist.

---

## The two flows

```
FUNDING

  CLIENT SENDS REAL MONEY
        │  (a bank transfer, outside this system)
        ▼
  RAZEKIT BANK ACCOUNT
        │
        ▼
  ADMIN SEES THE FUNDING REQUEST        ← client reported it; this is a CLAIM
        │
        ▼
  ADMIN VERIFIES THE ACTUAL RECEIPT     ← reads the bank statement
        │
        ▼
  LEDGER CREDIT                          ← the only place money is created
        │
        ▼
  CLIENT RAZEKIT BALANCE
        │
        ▼
  CONTEST PRIZE RESERVED  →  CONTEST GOES LIVE
```

```
WITHDRAWAL

  CREATOR REQUESTS WITHDRAWAL
        │
        ▼
  AMOUNT RESERVED                        ← NOT debited; balance total unchanged
        │
        ▼
  ADMIN NOTIFICATION → WITHDRAWAL QUEUE
        │
        ▼
  ADMIN REVIEWS → APPROVES               ← still no money moved
        │
        ▼
  ADMIN SENDS MONEY MANUALLY             ← a real transfer, made by a person
        │
        ▼
  ADMIN ENTERS UTR → CONFIRMS
        │
        ▼
  LEDGER DEBIT                           ← the only place money leaves
        │
        ▼
  CREATOR BALANCE DROPS  →  WITHDRAWAL = PAID
```

**The ordering is never reversed.** A submitted payment form creates nothing. A
withdrawal request deducts nothing.

---

## Chart of accounts

`server/src/ledger/accounts.ts`. A single rupee moves through pots with
different meanings; conflating them is how a platform pays one creator with
another client's prize money.

| Class | Normal side | Meaning | Scope |
|---|---|---|---|
| `BANK_SETTLEMENT` | DEBIT | What is actually in the bank account | platform |
| `CLIENT_FUNDS` | CREDIT | A client's money held, not yet committed | per client |
| `CONTEST_PRIZE_COMMITMENT` | CREDIT | Committed to one specific contest | per contest |
| `PAYOUT_LIABILITY` | CREDIT | Owed to one creator, drawable | per creator |
| `WITHDRAWAL_PENDING` | CREDIT | Owed, earmarked for a withdrawal in flight | per creator |
| `PLATFORM_FEE` | CREDIT | RazeKit's revenue | platform |
| `TAX_PAYABLE` | CREDIT | Tax collected on platform charges | platform |
| `REFUND_CLEARING` | CREDIT | Refunds approved, not yet transferred | platform |

### Double-entry shape of each event

`server/src/ledger/events.ts` — handlers never assemble ledger lines themselves.

| Event | Debit | Credit |
|---|---|---|
| Funding verified | `BANK_SETTLEMENT` (total) | `CLIENT_FUNDS` (prize) + `PLATFORM_FEE` + `TAX_PAYABLE` |
| Prize reserved | `CLIENT_FUNDS` | `CONTEST_PRIZE_COMMITMENT` |
| Prize released | `CONTEST_PRIZE_COMMITMENT` | `CLIENT_FUNDS` |
| Winner finalised | `CONTEST_PRIZE_COMMITMENT` | `PAYOUT_LIABILITY` |
| Withdrawal requested | `PAYOUT_LIABILITY` | `WITHDRAWAL_PENDING` |
| Withdrawal released | `WITHDRAWAL_PENDING` | `PAYOUT_LIABILITY` |
| **Withdrawal paid** | `WITHDRAWAL_PENDING` | `BANK_SETTLEMENT` |
| Refund approved | `CLIENT_FUNDS` (+ fee, tax if refunded) | `REFUND_CLEARING` |
| Refund paid | `REFUND_CLEARING` | `BANK_SETTLEMENT` |

Fee and tax are charged **once per funding request**, on the receipt that first
covers them. A top-up after a part payment carries `bookFees: false`, so a
client is never billed twice for the same contest.

---

## Balances are derived, never accumulated

There is no `balance = balance + amount` anywhere in the codebase. `LedgerEntry`
rows are the record; `LedgerAccount.balance_minor` is a cache that
`replayBalance()` can rebuild at any time, and reconciliation compares the two
rather than trusting either.

`server/src/finance/balances.ts` defines the five figures a user sees. Each is
returned with a plain-English definition so no number on screen is unexplained.

| Figure | Creator | Client |
|---|---|---|
| **Total** | everything RazeKit owes you | everything RazeKit holds for you |
| **Available** | prize money you can withdraw | verified funding not yet committed |
| **Reserved** | n/a | prize money committed to live contests |
| **Pending** | a withdrawal requested, not yet transferred | n/a |
| **Withdrawable** | what you can request today (min ₹100) | 0 — client money leaves by refund |
| **Paid out** | already transferred to your bank | prizes paid to winners of your contests |

Worked creator example:

```
after winning a funded contest   Total 50,000  Available 50,000  Pending 0       Withdrawable 50,000
after requesting ₹50,000         Total 50,000  Available 0       Pending 50,000  Withdrawable 0
after the admin confirms         Total 0       Available 0       Pending 0       Paid out 50,000
```

The `Wallet` entity is a **read model** refreshed from the ledger, never an
input to it. This is why the Tracker and the balance page can no longer disagree
about what a creator has earned.

---

## State machines

`server/src/payments/states.ts`. Every legal move is declared; `assert*` helpers
refuse everything else with a `409`.

### Funding

| From | May go to |
|---|---|
| `FUNDING_REQUIRED` | `PAYMENT_INSTRUCTIONS_SHOWN`, `CANCELLED` |
| `PAYMENT_INSTRUCTIONS_SHOWN` | `TRANSFER_REPORTED`, `CANCELLED` |
| `TRANSFER_REPORTED` | `PENDING_VERIFICATION`, `NEEDS_INFORMATION`, `CANCELLED` |
| `PENDING_VERIFICATION` | `VERIFIED`, `PARTIAL`, `OVERPAID`, `REJECTED`, `NEEDS_INFORMATION`, `CANCELLED` |
| `NEEDS_INFORMATION` | `TRANSFER_REPORTED`, `PENDING_VERIFICATION`, `REJECTED`, `CANCELLED` |
| `PARTIAL` | `PENDING_VERIFICATION`, `VERIFIED`, `NEEDS_INFORMATION`, `REJECTED`, `REFUND_PENDING` |
| `OVERPAID` | `VERIFIED`, `REFUND_PENDING`, `NEEDS_INFORMATION` |
| `VERIFIED` | `REFUND_PENDING` *(only)* |
| `REJECTED` | `TRANSFER_REPORTED`, `CANCELLED` |
| `REFUND_PENDING` | `REFUNDED`, `VERIFIED` |
| `CANCELLED`, `REFUNDED` | terminal |

`FUNDING_REQUIRED → VERIFIED` and `TRANSFER_REPORTED → VERIFIED` are **illegal**:
verification cannot be skipped.

**Part payments credit real money but do not fund the contest.** If the bank
shows less than the amount due, the receipt is credited (it genuinely arrived),
the shortfall is recorded, and the prize is *not* reserved — so the contest does
not go live until the balance arrives. An overpayment funds the contest and the
excess stays on the client's balance, flagged as refundable.

### Withdrawal

| From | May go to |
|---|---|
| `REQUESTED` | `UNDER_REVIEW`, `APPROVED`, `ON_HOLD`, `FAILED`, `CANCELLED` |
| `UNDER_REVIEW` | `APPROVED`, `ON_HOLD`, `FAILED`, `CANCELLED` |
| `APPROVED` | `PROCESSING`, `TRANSFER_SENT`, `ON_HOLD`, `FAILED`, `CANCELLED` |
| `PROCESSING` | `TRANSFER_SENT`, `FAILED`, `ON_HOLD` |
| `TRANSFER_SENT` | `PAID`, `FAILED` |
| `FAILED` | `APPROVED`, `PROCESSING`, `CANCELLED` |
| `ON_HOLD` | `UNDER_REVIEW`, `APPROVED`, `CANCELLED`, `FAILED` |
| `PAID` | `REVERSED` *(only)* |
| `CANCELLED`, `REVERSED` | terminal |

`REQUESTED → PAID` and `APPROVED → PAID` are **illegal**: approval and the
actual transfer cannot be skipped.

A `FAILED` transfer keeps the reservation, so a creator never loses money to a
bounced payment.

---

## Duplicate protection

Four independent layers. Each stops a specific failure.

| Layer | Where | Stops |
|---|---|---|
| Idempotency key on the transaction | `ledger/post.ts` | a retried operation posting twice |
| Partial unique index on `idempotency_key` | `db.ts` `ensureFinanceConstraints()` | two concurrent posts both committing |
| `SELECT … FOR UPDATE` row lock | `db.ts` `lockRecord()` | two admins verifying the same request at once |
| `Serializable` transaction | `db.ts` `withTransaction()` | a balance check reading stale data mid-write |

Additional partial unique indexes: one live funding request per contest, one
live funding request per reported bank reference, one open withdrawal per
creator.

Idempotency keys are meaningful, not random:

* `funding_credit:<funding>:<BANK REFERENCE>` — one real transfer credits once;
  a genuine top-up carries a different UTR and is a legitimate second credit.
* `prize_reserved:<funding>`, `payout_liability:<payout>`
* `withdrawal_reserved|released|paid:<withdrawal>`
* `reversal:<original transaction>`

Every money operation runs inside `withTransaction`. A mid-flight failure writes
nothing — proved during development when a wrong SQL cast made verification fail
and the run left zero partial records behind.

---

## Permissions

`server/src/finance/permissions.ts`. "Admin" is too blunt for money, so each
capability is a separate grant recorded in `AdminPermission` with who granted it
and when. Platform admins hold all of them implicitly, but the check still runs
and still names the permission in the audit record.

| Permission | Allows |
|---|---|
| `finance.view` | read the dashboard, queues, ledger, reconciliation |
| `finance.verify_funding` | turn a reported transfer into a ledger credit |
| `finance.review_withdrawal` | open a withdrawal, place or lift a hold |
| `finance.approve_withdrawal` | approve or reject a withdrawal |
| `finance.confirm_payout` | record a transfer and post the ledger **debit** |
| `finance.view_sensitive_financial_data` | see an unmasked account number |
| `finance.refund` | approve and record refunds |
| `finance.reconcile` | run and resolve reconciliation |
| `finance.adjust` | post a manual adjustment or reverse a transaction |
| `finance.manage_permissions` | grant/revoke the above; edit payment settings |

Finance handlers are deliberately **not** in `ADMIN_ONLY` — they are gated on
these permissions instead, so an operator can hold `finance.view` without being
a platform admin. Each handler calls `requireFinance()` itself.

---

## Admin → Finance

`src/pages/admin/Finance.jsx`, mounted as a tab in the Control Center.

| Tab | Purpose |
|---|---|
| Overview | live KPIs, ledger balances, exceptions, what needs a person |
| Deposit verification | the queue; open a claim, see the proof, verify / reject / request information |
| Funding | full funding history with status, date and reference filters |
| User balances | every ledger-backed balance, drill into one user's entries |
| Prize commitments | money locked to specific contests |
| Withdrawal requests | creator requests awaiting review or approval |
| Payout processing | approved requests awaiting transfer and confirmation |
| Ledger | accounts, transactions with their entries, cached vs replayed balance |
| Reconciliation | unbalanced transactions, drifted accounts, unbooked money |
| Refunds | approve a refund, then record the transfer |
| Payment settings | bank/UPI/QR configuration, method toggles, version history |
| Financial audit | every financial event, filterable, never deleted |

Every high-risk action goes through a confirmation panel that restates who, how
much, to which masked account, and with what reference. Controls the caller
lacks permission for are disabled and say which permission is missing.

---

## Payment settings

`server/src/payments/settings.ts`. The destination account is no longer a
constant. An admin configures it, and **every edit writes a new version** rather
than overwriting — a funding request issued last week must still be explainable
against the details that were live when it was issued. `ContestFunding` records
`settings_version` and `qr_version` at the moment instructions are shown.

Bank transfer, UPI and UPI QR can each be enabled independently. A method is
offered to a client only when it is enabled **and** actually configured; an
enabled UPI switch with no UPI ID behind it is reported as incomplete rather
than shown as an empty box. At least one method must stay enabled.

The QR image lives in private object storage, versioned as
`payments/config/manual-beta/upi-qr/v<N>/…`. Uploading a replacement retires the
previous version; it does not delete the file. **"Remove" retires and hides — it
deletes nothing**: existing transactions, proofs and ledger entries are
untouched.

Env vars (`server/.env`, gitignored) seed the first version and remain a
fallback: `PAYMENT_MODE`, `BETA_BANK_*`, `BETA_SUPPORT_*`,
`BETA_FUNDING_VERIFICATION_HOURS`.

---

## Security

| Control | Where |
|---|---|
| Bank details never in the frontend, git, or a public endpoint | gitignored `server/.env` → `PaymentSettings` (server-only entity) |
| Full destination account returned by exactly one path | `fundingInstructions`, after auth + contest ownership + an awaiting-money state |
| Full creator account returned by exactly one path | `financeWithdrawalDetail`, requires `finance.view_sensitive_financial_data` **and** an approved request; every read is audited |
| Everything else masked | `XXXXXX52336`, `FDRL***1387`, `86*****369@ptsbi` |
| Account numbers never logged | audit records carry the last four digits only |
| No client can write money | every finance entity is `'*'` in `entities/protected.ts` — server-role writes only |
| Balances not client-writable | `Wallet`, `WalletLedgerEntry`, `LedgerEntry` all protected |
| Contest funding state not client-writable | `funding_status`, `funding_id`, `funded_at` protected on `Contest` |
| IDOR on funding | `fundingStatus` re-checks `brand_id` → **403** |
| IDOR on proofs | `GET /api/payments/proof/:id` requires the owner or `finance.view` |
| Proof/QR uploads | MIME allowlist, magic-byte sniff, server-generated keys, size caps |
| Signed URLs only | private objects, 15-minute expiry, issued per view |

**Verified live:** a creator writing a `LedgerEntry` → refused; a creator
patching their own `Wallet` → refused; a creator reading another user's funding
request → 403; a creator or client verifying a payment → 403.

---

## Notifications

`server/src/finance/notify.ts`. Recipients are platform admins plus holders of
`finance.view`. Every notification is deduplicated on a stable key, so a retried
handler produces one alert, not two. Real names are used — never the
placeholders "Brand" or "Creator".

| Event | Who is told |
|---|---|
| Transfer reported | admins — "New funding verification request from *name*" |
| Funding verified | client — "Your contest funding has been verified" |
| Part payment received | client — received vs outstanding |
| Funding rejected / info needed | client — with the reason |
| Withdrawal requested | admins — "New withdrawal request from *name*" |
| Withdrawal approved / rejected / on hold | creator |
| Payout paid | creator — with the bank reference |
| Refund transferred | client |

Emails go through the existing Resend integration. Every send is best-effort:
an email failure can never roll back a committed financial fact.

---

## Gateway adapter boundary

`MANUAL_BETA` is a real adapter behind the existing `payments/gateway.ts`
boundary, not a special case scattered through the codebase. It declares
`manualVerification: true` and `instantConfirmation: false`, and its
`verifyPayment()` **always** returns `PROCESSING` with `requires_human: true` —
so no future code path can accidentally mark a contest funded.

`PAYMENT_MODE` switches behaviour platform-wide:

* `MANUAL_BETA` — the current mode
* `GATEWAY` — an automated provider (one adapter file away)
* `MAINTENANCE` — funding paused, all existing records readable

Switching to an automated gateway means writing one adapter and changing the
mode. Contest, Winner, Tracker, Ledger, Admin, Finance and Audit are unchanged,
and every historical manual transaction stays permanent and readable.

---

## Testing

**62 unit tests** in `server/test/payments.test.ts` (150 in the full suite, all
passing). They run against an in-memory fake of the entity service, which is
enough to assert real double-entry behaviour without a database.

**86 live checks** in `server/scripts/verify-beta-payments.ts` — run with
`npm run verify:payments`. It executes the §34 and §35 scenarios against the
real database through the real handlers, then removes everything it created.

Live-verified guarantees:

```
reporting a transfer            → 0 ledger transactions, contest stays draft
creator/client verifying        → 403
admin verifies                  → exactly 1 credit + 1 reservation, contest live
repeated verify                 → already_verified, still exactly 1 credit
two simultaneous verifies       → exactly 1 credit (Serializable aborts the loser)
withdrawal requested            → total unchanged, available→0, pending→full
approve + transfer-sent         → still 0 debits
confirm                         → exactly 1 debit, balance→0, paid_out→full
repeated confirm                → already_paid, still exactly 1 debit
reconciliation                  → 0 unbalanced, 0 drifted, 0 unbooked
```

---

## Known limitations

1. **Separation of duties is reported, not enforced.** RazeKit has one
   operator, so the same person can approve and confirm a payout. Every such
   case is flagged in the withdrawal queue and stamped on the audit record with
   `approved_and_confirmed_by_same_user`. This is a real gap, stated rather than
   hidden.

2. **No bank API.** Nothing reconciles automatically against the bank. A person
   reads the statement and types what it says. Reconciliation compares RazeKit's
   books with what was *entered*, not with the bank itself.

3. **Verification and payout times are targets, not guarantees.** The stated
   window is configurable and advisory.

4. **The legal characterisation is unconfirmed.** Holding client funds in an
   ordinary business bank account has not been reviewed against Indian
   payment-aggregator rules. The product deliberately avoids "wallet", "escrow"
   and "regulated", but **this should be settled with a professional before
   scaling beyond the beta.**

5. **Clients cannot withdraw.** Client money leaves only through a reviewed
   refund. This is deliberate for the beta.

6. **INR only.** The fee tiers and the minimum withdrawal are INR-denominated.

7. **AI does not touch money.** No agent can verify funding, approve a payout,
   alter the ledger or change a balance. Financial authorisation is
   deterministic and human-controlled.
