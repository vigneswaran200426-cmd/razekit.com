# RazeKit — the six launch records

RazeKit's launch involves **six distinct records** that look superficially similar on a landing page
and are fundamentally different in the data model:

- **three upcoming poll campaigns** — `PollCampaign`, an interest signal, no money
- **three real creator contests** — `Contest`, real money, real submissions, a real payout

This document records what each one is, why they use different entities, and why they must never be
merged into one. Sources: `server/src/entities/schemas.json`, `server/src/contest/duration.ts`,
`server/src/contest/guard.ts`, `server/src/entities/protected.ts`, `server/src/ledger/`.

---

## 1. The three upcoming poll campaigns

**Entity:** `PollCampaign`, with votes recorded in `PollVote`.

| Aspect | What the schema says |
| --- | --- |
| Identity | `slug`, `title`, `theme`, `display_order` |
| The ask | `question`, `supporting_line`, `cta_label` |
| Prize-pool messaging | `prize_pool_minor`, `currency` (INR) — the ₹1 crore figure |
| Answer shape | `yes_votes`, `no_votes`, `total_votes` — YES/NO only |
| Target | `vote_target`, defaulting to **1,000,000** |
| Timing | `status` (default `upcoming`), `opens_at`, `closes_at`, `target_reached_at` |
| Gate | `requires_auth`, default `true` |
| Honesty | `disclosure`, `notes` |
| Row security | `read: {}` (public), `write: false` (nobody, through the entity API) |

`PollVote` carries `poll_id`, `choice`, `voter_key`, `user_id`, `counted`, `risk_score`,
`risk_reasons`, `ip_hash`, `user_agent_hash`, `voted_at` — and its row policy is `read: false,
write: false`. A browser can neither read nor write individual votes; only server code reaches them.
The hashed IP and user agent mirror the pattern already used by `traffic/fraud.ts`: de-duplicate and
risk-score without retaining personal data.

**What a poll campaign does not have, by design:** no submissions, no scoring, no winner, no payout,
no funding record, no ledger account. A poll measures interest. It moves no money.

The ₹1 crore figure is **prize-pool messaging on an upcoming campaign**. It is not a funded
commitment, nothing in the ledger corresponds to it, and no code path can turn it into one —
`PollCampaign` has no `ContestFunding`, and the only way a prize becomes committed money is
`ledger/events.ts → reservePrize`, which takes a funding request.

## 2. The three real creator contests

**Entity:** `Contest`, with `Submission`, `ContestFunding`, `ScoreSnapshot`, `Payout` and the rest
of the marketplace pipeline behind it.

| Aspect | Value |
| --- | --- |
| Prize | ₹50,000 |
| Duration | 28 days |
| Platform | Instagram only — `Contest.required_platform` |
| Video length | 60 seconds — `Contest.max_video_seconds` |
| Handover | required — `Contest.handover_required` / `handover_type` / `handover_items` |
| Exception marker | `Contest.promotional`, `duration_rule_version`, `duration_rule_id` |

Every one of those control fields is in the **server-only** list in `entities/protected.ts`
(`duration_rule_version`, `min_duration_days`, `max_duration_days`, `funding_status`, `funded_at`,
`prize_committed_minor`, `winner_user_id`, `lifecycle_state`, …). A browser cannot write them, so a
brand cannot declare its own contest promotional, funded, or exempt from the duration rule.

These contests go through the full pipeline: funding verified by a person → prize reserved →
submissions → compliance → scoring → winner finalized → winner verification → payout. See
`RAZEKIT_MARKETPLACE_ARCHITECTURE.md`.

## 3. Why the two must never merge

Six reasons, each grounded in something the code actually does:

1. **Money.** A contest's prize reaches `CONTEST_PRIZE_COMMITMENT` in the double-entry ledger only
   after an admin verifies a real receipt. A poll's `prize_pool_minor` is a number in a marketing
   field. One entity holding both would mean a single field whose meaning depends on a status
   string — and the first mistake there is a contest that looks funded because it was seeded with a
   poll's number.
2. **Measurement.** A contest's ranking comes from `scoring/index.ts` — normalized, versioned,
   reproducible, with `insufficient_data` as a real outcome. A poll's counters are vote tallies.
   Merging them would let a vote count be read as a performance score by any surface that reads a
   shared field.
3. **Row security.** `PollVote` is `read: false, write: false`; `Submission` is owned by its creator
   and readable in contest context. These are opposite policies and cannot sit on one entity.
4. **Write authority.** `PollCampaign.write` is `false` for everyone through the entity API —
   including admins — so vote totals can only ever be written by server code. `Contest` is
   client-creatable with a server-side field guard on top. Merging would force one of the two to be
   loosened.
5. **Lifecycle.** A contest runs a state machine that ends at `COMPLETED` after a payout
   (`contest/lifecycle.ts`). A poll has `status` and a `vote_target`, and no terminal money state.
6. **Fairness rules.** `contest/guard.ts` runs the prize→duration validation on every `Contest`
   write. A poll has no prize to validate and no deadline to measure a duration against; forcing it
   through the same guard would either reject it or require an exemption branch inside the one place
   that must stay strict.

The rule in one line: **a poll is an interest signal; a contest is a financial commitment.** They
share a visual language on the site and nothing else.

## 4. The promotional duration rule

Under the normal fairness tiers in `contest/duration.ts`, a ₹50,000 prize is **Tier B**, which allows
1–7 days. The three launch contests run **28 days**. That is a genuine conflict, and the code
resolves it the honest way.

`contest/duration.ts` declares a separate, named exception:

```
PROMOTIONAL_RULE_VERSION = 'rk-duration-promo-1.0.0'
PROMOTIONAL_RULE = {
  label:    'Approved promotional launch contests (28 days)',
  minDays:  1,     maxDays:  28,
  minPrize: 50000, maxPrize: 50000,   // exactly the approved prize
  currency: 'INR',
  approvedByName: 'RazeKit platform owner',
}
```

Three properties of that shape are the point of it:

- **It is as small as the approval.** INR only, that exact prize, 28 days, still under the global
  30-day cap. A band wider than the approval would be a quiet rule change wearing an exception's
  name.
- **It does not touch `PRIZE_TIERS`.** Tier B still says 7 days for every other brand at ₹50,000.
  Widening the tier instead would silently re-price fairness platform-wide, and nobody reviewing a
  future contest would know why.
- **It is not selectable by a client.** `Contest.duration_rule_version` is in the protected-field
  list, so a browser cannot request this rule by sending its string. It is applied by server-side
  seeding.

### How the validator applies it

`validatePrizeDuration({ prizeAmount, days, currency, ruleVersion })` takes a `ruleVersion` that
**defaults to the standard tiers**, so every existing caller behaves exactly as it did before the
exception existed. Passing `PROMOTIONAL_RULE_VERSION` swaps the tier bound for the promotional bound
and nothing else:

- the **global 30-day cap is checked first** and is never swapped out;
- a non-INR prize is refused with `PROMO_CURRENCY_NOT_SUPPORTED` — the exception was approved for one
  INR prize, and an exchange-rate guess is not an approval. (The ordinary tiers do exempt non-INR
  contests to the global cap; the exception deliberately does not inherit that.)
- a prize outside the exact approved band is refused with `PROMO_PRIZE_OUT_OF_RANGE`;
- the promotional branch lives in its own function so the normal path reads exactly as it did before.

`describeRule(ruleVersion)` turns a stored rule version into an admin-readable explanation, and
**never returns null**: an unrecognised or missing rule version is reported as exactly that, rather
than rendering as a blank cell that looks approved. An exception nobody can point at is
indistinguishable from a bug.

### Why an auditable exception record

The `ContestDurationRule` entity exists so the exception is a **row someone can point at**, not a
constant someone has to find:

```
rule_version, label, description, promotional, active,
min_prize_minor, max_prize_minor, min_days, max_days,
approved_by, approved_by_name, approved_at, expires_at, notes
```

`read: {}` (public), `write: false` (server only). A contest stores `duration_rule_id` pointing at
the row and `duration_rule_version` naming it, so months later the question "why was this one
allowed to run 28 days?" is answered by the contest record itself — including **who approved it and
when** — rather than by a code archaeology exercise. `expires_at` and `active` mean the exception can
end without anyone editing the tiers, and `promotional: true` separates an exception from an ordinary
rule revision in any list of them.

The same information written as a wider tier would be indistinguishable from a policy decision. As a
dated, approved, expiring row it stays visibly what it is: three contests, approved once, by a named
person.

---

## Known limitations

As of this reading, the launch records are **specified but not yet running**:

- **No code implements polls.** `PollCampaign` and `PollVote` exist only in `schemas.json`. No server
  function creates a poll, casts a vote, counts one, or risk-scores one, and no page renders one.
  `yes_votes` / `no_votes` / `total_votes` default to `0` and currently have **no writer** — nothing
  derives them from `PollVote` rows. Until a counting function exists, a rendered total would be a
  default, not a measurement, and must not be presented as a vote count.
- **The promotional rule is implemented in the validator but not yet reachable from a write.**
  `contest/duration.ts` supports it fully (`allowedPromotionalDuration`, the promotional branch of
  `validatePrizeDuration`, `describeRule`). `contest/guard.ts → enforceContestFairness()` still calls
  `validatePrizeDuration` **without** a `ruleVersion` and unconditionally stamps the standard
  `DURATION_RULE_VERSION`, so a ₹50,000 / 28-day contest written through the entity API today is
  rejected with `DURATION_OUT_OF_RANGE`. The remaining work is in `guard.ts`: accept the promotional
  rule version from a trusted (non-client) path and stamp `duration_rule_version`,
  `duration_rule_id` and `promotional` from the rule that actually applied. This file was changing
  while this document was written — re-read `contest/guard.ts` before relying on this paragraph.
- **The seeding script does not exist.** `contest/duration.ts` names
  `scripts/seed-razekit-campaigns.ts` as the path that applies the rule; that file is not in the
  repository.
- **No `ContestDurationRule` rows are created by any code**, so `duration_rule_id` currently has
  nothing to point at, and `describeRule()` answers from the in-code constants rather than from the
  entity.
- **The contest control fields are unused.** `required_platform`, `max_video_seconds`, `promotional`
  and `duration_rule_id` are read by no module. In particular, "Instagram only" and "60 seconds" are
  *not* enforced from those fields — the compliance engine's `platform` and `duration` evaluators read
  their limits from a contest criterion's params, so the three contests will need those criteria
  configured and locked for the restrictions to bind.
- **New `Submission` and `WinnerPublish` fields are unused** (`published_at`, `post_external_id`,
  `url_checked_at`, `url_check_reason`, `platform_locked`, `original_post_url`, `original_platform`,
  `original_published_at`, `embed_available`). They exist in the schema and nothing reads or writes
  them.
