# RazeKit — marketplace architecture

The end-to-end path a contest takes, and the module that implements each stage. Every claim here was
read out of the code. Stages that exist only as a schema, or only as a browser-side flow, are named
as such in **Known limitations** rather than described as if the server enforced them.

Runtime shape: a Vite + React 18 frontend, and a Node/Express/Prisma/Postgres API
(`server/src/index.ts`). Records live in a generic `records` table as JSONB documents; entities are
declared in `server/src/entities/schemas.json` and reached through `entities/service.ts`, which
exposes the same surface in two modes — user-scoped (row-level security enforced) and service role
(used by server functions).

---

## 1. Contest creation

A brand creates a `Contest` through the generic entity API (`entities/routes.ts` →
`entities/service.ts`). Two server-side gates run on create and on any patch that touches a fairness
input:

- **`contest/guard.ts` — `enforceContestFairness()`**. Validates the brand destination URL through
  `traffic/url.ts` (see security doc), then validates the prize/duration pair and *stamps* the
  resolved rule metadata onto the row. It runs inside the entity service, so a direct API call or an
  internal script cannot bypass it.
- **`contest/duration.ts`** — the prize→duration tiers (`PRIZE_TIERS`, `GLOBAL_MAX_DAYS = 30`,
  `DURATION_RULE_VERSION`). Tiers are defined in INR; a non-INR contest is exempted from the tiers
  and held only to the global cap, because converting without a rate would mean inventing one. It
  also declares one narrow, named promotional exception — see `RAZEKIT_CAMPAIGNS.md` for what it is
  and how far it is wired.

`scheduler.onContestCreated()` triggers `functions/visual.ts` to generate a contest thumbnail.

## 2. Requirements (criteria)

`functions/criteria.ts` runs the flow: recommend → the brand edits → the brand confirms → the
version is **locked**. `criteria/library.ts` holds the catalogue and each criterion's evaluability;
`criteria/agent.ts` (through `agents/runner.ts`) produces recommendations. Confirmation writes a
`ContestCriteriaVersion` plus its `ContestCriterion` rows and stamps `criteria_version_id` /
`criteria_confirmed_at` on the contest — both server-only fields. A locked version does not mutate
once creators can enter.

## 3. Funding

**Client side — `functions/funding.ts`.** `fundingQuote` prices the request through
`money/fees.ts` (`computeQuote`, `activeRule`) and `money/markets.ts`; `fundingInstructions` returns
the destination account, and is the only path in the codebase that returns it unmasked, after
proving the caller owns the contest and the request is in a state that expects a transfer.
`fundingReportTransfer` records the brand's **claim** and puts it in the finance queue. It funds
nothing.

Instructions themselves come from `payments/settings.ts` (admin-configured, versioned, never
overwritten in place) and `payments/config.ts` (masking, mode, the beta notice wording). Payment
proof files upload through `payments/routes.ts` into private object storage under a server-built
path.

**Admin side — `functions/finance.ts`.** `financeVerifyFunding` is gated on the
`finance.verify_funding` permission, runs in `withTransaction` with `lockRecord` on the funding row,
and delegates to `settleFundingReceipt()` — the one implementation of "what funded means". That
function: rejects a duplicate bank reference, classifies the receipt against the expected amount
(`payments/states.ts` → `classifyReconciliation`), posts the ledger credit
(`ledger/events.ts` → `recordFundingVerified`), writes a `FundingReceipt` and a
`ReconciliationRecord`, reserves the prize (`reservePrize`), and flips a `draft` contest to `open`.
**Funding is the publication gate**: that status change happens here and nowhere else.

A part payment credits the money that really arrived, sets `FUNDING.PARTIAL`, reserves nothing and
publishes nothing. `financeRejectFunding` records a reason. Both paths write audit rows via
`finance/permissions.ts` → `auditFinance()`, on success *and* on failure.

## 4. Submission and tracking

A creator creates a `Submission` through the entity API. `functions/tracking.ts`
(`trackingLinkCreate`) mints one unguessable code per submission via `traffic/service.ts`; the
destination always comes from the brand's contest, never from the caller, so a creator cannot point
a RazeKit link anywhere they like.

Public clicks hit `/r/:code` (`traffic/routes.ts`, mounted above the API routers). `traffic/service.ts`
records the click; `traffic/fraud.ts` classifies it as `verified` / `duplicate` / `suspicious` /
`rejected` using a salted pseudonymous visitor hash (no raw IP or user agent is stored), a 30-minute
dedupe window and a bot user-agent pattern. Only verified clicks feed scoring, and the thresholds
are never exposed to users.

## 5. Compliance

`functions/compliance.ts` gathers evidence (an agent run through `agents/runner.ts`), and
`compliance/engine.ts` **decides**. The engine calls no model and reads only stored structured
data — creator free text is compared as data, never interpreted as an instruction. Findings are
`pass` / `fail` / `review_required` / `not_evaluable`, rolled up to `eligible` / `ineligible` /
`review_required` / `pending`. Uncertainty never becomes a pass: a mandatory criterion that could
not be evaluated blocks eligibility until a person decides.

## 6. Scoring

`scoring/index.ts` is the single source of truth: `FinalScore = (VideoEngagement + BrandTraffic) / 2`,
both dimensions normalized 0–100, versioned by `SCORING_VERSION`. Raw metrics are normalized against
**the contest's own population** with a square-root curve, so a creator with 100× the views does not
get 100× the score. `scoring/compute.ts` loads the inputs and computes; `scoring/weights.ts` holds
per-campaign configuration (weights must total 100, the config **locks** when the contest opens, and
every finalized score records the config version that produced it).

Missing data is never a zero. A dimension with no data is excluded and the remaining weight is
re-proportioned; a submission with neither dimension is `insufficient_data`. A disqualified entry
keeps its measured scores but is removed from ranking. `functions/scoring.ts` exposes the config and
the disqualify/reinstate flow (reason required, recorded).

## 7. Winner finalization

`functions/winner.ts` → `winnerFinalize` is the only way a winner is set; the fields it writes are
blocked from browsers by `entities/protected.ts`. It:

1. checks ownership (contest owner or platform admin) and refuses if a winner already exists;
2. applies the **compliance gate** — if any submission's mandatory check is unevaluated or awaiting
   review, it refuses with `COMPLIANCE_INCOMPLETE` rather than finalizing around it;
3. recomputes scores from authoritative signals rather than trusting stored ones;
4. takes rank 1. A brand pick that disagrees with the computed winner is refused
   (`OVERRIDE_REJECTED`);
5. writes the `ScoreSnapshot` rows, creates the payout liability record through
   `functions/payouts.ts` → `ensurePayoutForWinner`, and opens winner verification through
   `functions/winnerVerification.ts` → `ensureVerificationForWinner`.

There is a transitional path: when no submission has any score data, the brand's pick is recorded
explicitly as `manual_pre_scoring` and audited as such, instead of inventing scores.

## 8. Winner verification

`functions/winnerVerification.ts` + `verification/platforms.ts`. Reachable only after a winner
exists, and only by that winner. RazeKit holds no social platform API credentials, and the module is
built around that fact: it issues a one-time challenge code, the creator places it somewhere public
they control, and the server fetches that public page and looks for it. YouTube is the only platform
marked `autoCheck`; every other platform returns `MANUAL_REVIEW` or `NOT_SUPPORTED` rather than a
fabricated success. A network failure is `MANUAL_REVIEW`, never a failed verification.

Only `VERIFIED` moves the contest to `PAYMENT_PENDING` and unlocks payout eligibility.

## 9. Winners Hub

`functions/winners.ts` — `winnersShowcase`, `winnersLeaderboard`, `creatorPublicProfile` — reads the
`ScoreSnapshot` rows the scoring engine wrote. There is no second ranking algorithm, and nothing
ranks by followers or popularity. Snapshots carry denormalised display fields so the page renders in
one query. Frontend: `src/pages/Winners.jsx`.

## 10. Collaboration / handover

`src/pages/Handover.jsx` drives `Handover` and `HandoverMessage` rows through the generic entity
API: the brand or winner starts a handover, both sides confirm, and messages thread between them.
`Contest.handover_required` / `handover_type` / `handover_items` / `handover_deadline` exist on the
contest schema. See **Known limitations** — this stage has no server function behind it.

## 11. Payout and withdrawal

`functions/payouts.ts` — a prize becomes a debt RazeKit owes a named creator only when the contest's
funding is `VERIFIED`. `payoutAccountSave` validates and masks bank details; the full account number
is revealed by exactly one handler (`financePayoutDetail`), which requires a finance permission and
writes an audit row every time it is read.

`functions/withdrawals.ts` enforces the ordering that matters:
request → **reserve** (not debit) → review → approve → a person makes the transfer → the reference is
recorded → confirm → **ledger debit**. A creator's balance never falls because they asked for money;
it falls when the money has actually left. Between those points the amount sits in a
`WITHDRAWAL_PENDING` reservation so it can be neither withdrawn twice nor counted as available.
`payments/states.ts` declares every legal transition for funding, withdrawal, payout eligibility and
refunds, with `assert*` helpers so no handler can invent a shortcut.

## 12. Ledger

`server/src/ledger/` — see `RAZEKIT_PAYMENT_ARCHITECTURE.md` for detail. In one line: `post.ts` is
the only place that writes money, entries are immutable, every transaction balances to the minor
unit and carries an idempotency key, and balances are **derived** by replaying entries
(`finance/balances.ts` → `razekitBalance`), never stored and incremented.

## 13. Tracker

`functions/tracker.ts` — read-only performance intelligence for both roles. It never recomputes the
winner algorithm and never mutates authoritative state. Because it aggregates through the service
client, every handler filters by the caller's own id explicitly; a contest or creator id from the
request is never trusted without an ownership check.

## 14. Notifications

`notify/emit.ts` is the single path. One shape, one dedupe rule (`dedupeKey`, built from the entity
and the transition — never from a timestamp), one place where category and severity are decided.
Persistence happens before delivery, so a refresh never loses a notification. `CRITICAL` severity
(failed payout, security event, rejected payment) stays on screen instead of disappearing on a
timer. `functions/notifications.ts` serves the feed and read-state, deriving category/severity for
rows written before `emit()` existed.

## 15. Audit

`AuditLog` rows are written from 23 call sites across the function layer. Finance actions go through
`finance/permissions.ts` → `auditFinance()`, which records the actor, the **specific permission
used**, the subject, the result and whether the action succeeded, was blocked or errored. Sensitive
values are recorded truncated (for example a bank reference's last four characters). `functions/admin.ts`
and `functions/adminConsole.ts` expose the read surfaces, each re-checking `user.role === 'admin'`
server-side.

## 16. Reporting

`functions/reports.ts` — `campaignReport`, `creatorTrackRecord`, `fraudSignals`. Everything is
derived from records that already exist; conversions, attributed revenue and ROI are named as
not-implemented rather than shown as zero, because RazeKit does not measure them.

---

## Known limitations

- **No engagement ingest.** `scoring/compute.ts` reads engagement metrics from
  `SocialCampaignPost`, and **no server code creates that entity**. In practice the Video Engagement
  dimension is `null` for every submission, so scores are traffic-only and `provisional`, or the
  contest falls to the `manual_pre_scoring` path in `winnerFinalize`. `SocialPost` and `SocialMetric`
  are likewise never written.
- **`lifecycle_state` is only partly persisted.** `contest/lifecycle.ts` declares the full machine,
  but only `functions/winnerVerification.ts` writes the column. Funding, going live and the deadline
  passing do not persist it; every read path calls `inferLifecycle()` to derive a state from
  `status`, `winner_user_id`, `funding_status` and the deadline.
- **Nothing closes a contest on its deadline.** `scheduler.ts` runs one job — visual-asset
  maintenance every six hours. `SUBMISSION_CLOSED` is inferred at read time, not transitioned to.
- **Handover has no server authority.** `src/pages/Handover.jsx` writes `Handover` rows straight
  from the browser through the entity API, so its state (including both confirmations) is
  client-asserted. Its final `Contest.update({ status: 'completed' })` is *blocked* by the
  protected-field guard and swallowed by a `.catch()`, so a completed handover does not actually
  complete the contest. This flow needs a server function.
- **Instagram, TikTok, X and Facebook cannot be auto-verified** — only YouTube serves the needed
  content to an unauthenticated fetch. Everything else routes to a person.
- **Rate limiting is in-process** (`middleware/rateLimit.ts`), correct for the single-service
  deployment RazeKit runs today and not correct if it is ever scaled horizontally.
