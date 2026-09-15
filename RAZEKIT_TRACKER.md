# RazeKit — Tracker

What this document is: what the Brand Tracker and the Creator Tracker show, and where every number
on them comes from. Written from `server/src/functions/tracker.ts`, `server/src/scoring/` and
`src/pages/Tracker.jsx`.

What it refuses to do: present a measured number and a promised number as the same thing. The most
important rule in this document is in the "Prize value won is not money paid out" section.

---

## What the Tracker is

The Tracker is **read only**. `tracker.ts` never mutates authoritative state and never computes a
second version of the winner algorithm. It reads contests, submissions, score snapshots,
tracking-link aggregates and ledger-derived balances, and returns role-scoped views.

Five registered handlers, all already wired in `functions/registry.ts`:

| Handler | Surface |
|---|---|
| `trackerCreatorOverview` | Creator Tracker, headline KPIs |
| `trackerCreatorContests` | Creator Tracker, per-campaign rows |
| `trackerBrandOverview` | Brand Tracker, headline KPIs plus the attention list |
| `trackerBrandCampaigns` | Brand Tracker, one row per campaign |
| `trackerCampaignDetail` | Brand Tracker, one campaign in full |

Aggregation runs through the service client, which bypasses row-level filtering, so **every handler
filters by the caller's own id itself**. `trackerCreatorOverview` and `trackerCreatorContests`
filter submissions by `created_by_id: user.id`; the brand handlers filter contests by
`created_by_id: user.id`; `trackerCampaignDetail` loads the contest and then returns 403 unless
`c.created_by_id === user.id` or the caller is an admin. A contest id in the request body is never
trusted on its own.

---

## Creator Tracker

### Headline KPIs — `trackerCreatorOverview`

| Field | Where it comes from |
|---|---|
| `contests_joined` | Distinct `contest_id` across the creator's submissions |
| `active_contests` | Submissions whose contest status is `open` or `draft` |
| `completed_contests` | Submissions with status `won` or `not_selected` |
| `submissions` | Count of the creator's submission rows |
| `wins` | Submissions with status `won` |
| `win_rate` | `wins / completed`, one decimal. **`null`** when nothing has completed — not `0` |
| `average_final_score` | Mean of non-null `final_score` across the creator's ScoreSnapshots, 2dp. `null` when there are none |
| `prize_value_won` | Sum of `contest.prize_amount` over won submissions. See below |
| `paid_out` | `razekitBalance().paid_out_minor / 100` |
| `awaiting_payout` | `razekitBalance().available_minor / 100` |
| `currency` | `contests[0]?.currency` or `'INR'` |
| `traffic` | Aggregated TrackingLink counters for this creator |
| `scoring_version` | `SCORING_VERSION` from `scoring/index.ts` |

`paid_out` and `awaiting_payout` are read through `razekitBalance()` rather than re-summed here, so
the Tracker and the balance page are the **same computation** and cannot drift into disagreeing
about one creator. `razekitBalance` replays the ledger: `paid_out_minor` is the sum of `PAYOUT_PAID`
debit entries owned by that user.

Both are divided by 100 on the way out. The Tracker speaks in **major units** (rupees), so the UI
formats them with `money(...)`, never `moneyMinor(...)`.

### Per-campaign rows — `trackerCreatorContests`

Each row carries the campaign facts (`contest_title`, `category`, `prize_amount`, `currency`,
`deadline`, `contest_status`, `submission_status`, `submitted_at`) plus the score fields, read
snapshot-first with a fall back to the submission row:

```
engagement_score : snap?.engagement_score ?? s.engagement_score
traffic_score    : snap?.traffic_score    ?? s.traffic_score
final_score      : snap?.final_score      ?? s.final_score
rank             : snap?.rank             ?? s.rank
score_state      : snap?.score_state      ?? s.score_state ?? 'not_started'
```

`verified_visitors` comes from the submission's TrackingLink (`unique_visitors`), or `null` when no
link exists. `prize_earned` is `contest.prize_amount` when the submission won, and `0` otherwise —
this is **prize value**, not a payment.

---

## Brand Tracker

### Headline KPIs — `trackerBrandOverview`

`total_campaigns`, `active_campaigns` (status `open`), `completed_campaigns` (status
`winner_selected` or `completed`), `participants` (distinct submitter ids), `submissions`,
`winners` (contests with a `winner_user_id`), `total_prize_value` (sum of `prize_amount` across the
brand's contests), `currency`, the traffic block, and `scoring_version`.

The overview also returns an `attention` array, each item a real, counted condition:

| Kind | Condition |
|---|---|
| `review` | Submissions with status `submitted` awaiting review |
| `finalize` | Contests still `open` whose deadline has passed |
| `destination` | Contests with no `brand_destination_url`, so Brand Traffic cannot be measured |

### Campaign rows — `trackerBrandCampaigns`

Per contest: status, prize, currency, deadline, category, duration bounds, `participants`,
`submissions`, `has_destination`, `verified_visitors` (summed `unique_visitors`), `excluded_clicks`
(summed `suspicious_clicks`), `average_final_score`, `top_final_score`, `winner_user_id`,
`winner_selected_at`.

### Campaign detail — `trackerCampaignDetail`

The campaign block adds `lifecycle_state` plus its label and brand-facing detail from
`contest/lifecycle.js`, and `funding_status`.

Each entry carries both dimensions, the final score, rank, `score_state`, `verified_visitors`,
`excluded_clicks`, `is_winner`, `disqualified` with its `disqualification_reason`, `live_url`,
`platform`, the resolved `creator_name`, and `score_breakdown`.

Three deliberate choices in this response:

- **Excluded clicks are named separately from verified clicks.** Folding them into one number would
  hide a real signal about an entry.
- **Disqualified entries stay visible with their reason** and sort last regardless of the score they
  achieved. They are never silently dropped from the brand's view.
- **`score_breakdown` is stored, not recomputed.** It is the `explainScore()` output persisted at
  scoring time, so the Tracker can answer "why is this creator ranked first?" without the browser
  recomputing anything.

The response also returns the `scoring` config in force (`engagement_weight`, `traffic_weight`,
`tie_break`, `winner_method`, `config_version`) and `winner_verification` (`status`, `platform`,
`verified_at`) — a brand needs to know whether a prize is actually releasable, not only who won.

---

## RAW metrics and NORMALIZED scores are different things

They are computed by different code, stored in different fields, and must never be displayed as one
number.

### RAW — measured counts, never compared directly between creators

| Raw input | Source | Exposed as |
|---|---|---|
| `views`, `likes`, `comments`, `shares`, `saves`, `watch_time`, `follower_growth` | `SocialCampaignPost.metrics` | Inside `metric_snapshot` / `score_breakdown`, not as headline KPIs |
| `total_clicks`, `verified_clicks`, `unique_visitors`, `suspicious_clicks` | `TrackingLink` counters | The `traffic` block and `verified_visitors` / `excluded_clicks` |

Raw traffic **events** are never exposed by the Tracker. `trafficBlock()` returns aggregate counters
only; the fraud reasoning stays admin-only and only a coarse `excluded_clicks` count surfaces.

### NORMALIZED — 0-100, relative to the contest's own field

Computed in `scoring/compute.ts` and `scoring/index.ts`:

- **Video Engagement Score** — each approved input is normalized against the contest's population
  maximum and combined with the weights in `ENGAGEMENT_WEIGHTS` (views .20, likes .15, comments .15,
  shares .20, saves .15, watch_time .10, follower_growth .05). An input with no signal anywhere in
  the contest is skipped, not zeroed.
- **Brand Traffic Score** — verified unique visitors normalized against the contest maximum. Only
  verified traffic contributes; fraud filtering already happened at ingest.
- **Normalization curve** — `Math.sqrt(value / max) * 100`, clamped 0-100. The square root dampens
  outliers so a creator with 100x the views does not get 100x the score.
- **Final Score** — `weightedFinalScore()`. Platform default is an equal 50/50 split; a campaign may
  set its own weights, which must total 100 and lock when the contest opens.
- **Re-proportioning** — a dimension with no data is **excluded** and the remaining weight is
  re-proportioned, not counted as zero. Scoring a creator 0 for traffic nobody in the contest
  generated would punish them for the campaign's setup rather than their work. When that happens the
  breakdown sets `weights_reproportioned: true` and lists the excluded dimension with its reason.

### Absent is not zero

`videoEngagementScore` returns `null` when no weight was used, `brandTrafficScore` returns `null`
when the population maximum is zero, and `weightedFinalScore` returns `null` when no dimension is
measurable. `score_state` then says `insufficient_data` (nothing measurable) or `provisional` (one
dimension present). The UI honours this: `Metric` and `ScoreBar` in `src/components/primitives.jsx`
render `null` as **"Not measured"**, never as `0`. A zero is a measurement; an absence is not.

### Ranking

`comparatorFor(config)` is deterministic and never random: final score, then the campaign's
tie-break (`TRAFFIC_THEN_ENGAGEMENT` by default, or `ENGAGEMENT_THEN_TRAFFIC`), then earliest
submission, then id. Entries with a `null` final score are not ranked at all.

---

## The scoring version

`SCORING_VERSION = 'rk-score-1.0.0'` (`server/src/scoring/index.ts`). It is returned on
`trackerCreatorOverview`, `trackerBrandOverview` and `trackerCampaignDetail`, and it is written onto
every ScoreSnapshot at finalization.

There are **two** versions, and they answer different questions:

- `scoring_version` — which formula and normalization produced the number. Bumped when the maths
  changes, so historical results stay reproducible.
- `config_version` / `scoring_config_version` — which campaign configuration was in force. Either
  `default@rk-score-1.0.0` from `DEFAULT_CONFIG`, or the campaign's own `ScoringConfig.version`.

A finalized ScoreSnapshot (written by `winnerFinalize` in `functions/winner.ts`) additionally stores
`selection_method`, `tie_break_applied`, `criteria_version_id`, `compliance_status`,
`compliance_evaluation_version`, `metric_snapshot` and `finalized_at` — enough that a past result
can be explained after live metrics have moved on.

---

## Prize value won is not money paid out

**These are different fields and they must never be merged.**

| Field | What it means | Source |
|---|---|---|
| `prize_value_won` | What the won campaigns were **worth** | Sum of `contest.prize_amount` over won submissions |
| `paid_out` | What has actually **reached the creator's bank** | `PAYOUT_PAID` debit entries in the ledger, via `razekitBalance()` |
| `awaiting_payout` | Won, owed, **not yet transferred** | Ledger payout liability, via `razekitBalance()` |

The comment in `tracker.ts` states the failure this prevents: conflating the two is how a Tracker
ends up claiming "₹50,000 earned" beside a balance page showing ₹0 because the payout has not
happened.

Three separate facts, kept separate rather than merged into one flattering number. Rules for anyone
touching this code or the UI on top of it:

- Never sum `prize_value_won` and `paid_out`.
- Never label `prize_value_won` as "earned", "earnings", "received" or "paid". It is prize value.
- Never derive either number from the other. `paid_out` comes from the ledger and nowhere else.
- `prize_earned` on a per-campaign row is the same kind of figure as `prize_value_won` — value, not
  payment — despite its name.
- The Tracker page reflects this: it renders "Prize value won" and "Paid out" as two tiles, with
  amounts owed shown as a sub-line rather than added in.

---

## Known limitations

- **Every read is capped.** Submissions, snapshots, links and posts are fetched with limits of 500
  (1000 for a brand's links). A creator or campaign past those caps gets silently truncated totals,
  with nothing in the response saying so.
- **Currency is assumed, not grouped.** `trackerCreatorOverview` labels every figure with
  `contests[0]?.currency || 'INR'` while summing across all contests, and `total_prize_value` on the
  brand overview sums `prize_amount` the same way. A mixed-currency account would show an arithmetic
  sum under a single wrong label. Today everything is INR, so this has not surfaced.
- **`number_of_winners` is not used by the server.** The field is in the entity schema, is collected
  by the create form and is displayed on the contest card, but no server code reads it: `winner.ts`
  finalizes exactly one winner. `prize_value_won` therefore credits the full prize for each win. If
  multi-winner campaigns are ever enabled, this number becomes an overstatement.
- **No brand-side "actually spent" figure.** The brand overview reports `total_prize_value` only.
  There is no counterpart to the creator's `paid_out`, so a brand cannot see from the Tracker how
  much of their committed prize money has actually been transferred to winners.
- **Per-row fan-out.** `trackerCreatorContests` and `trackerCampaignDetail` fetch contests and users
  one id at a time. It is correct but it scales linearly with the number of rows.
- **Snapshot-first with a live fallback.** Where no snapshot exists, the Tracker shows the
  submission's own score fields. Those move as metrics move, so a pre-finalization number is a
  reading, not a result — `score_state` is the field that tells you which you are looking at.
- **`traffic.updated_at`** is the freshest timestamp across the links involved, so a stale link and
  a fresh one are represented by the fresh one alone.
