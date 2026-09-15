# RazeKit — Notifications

What this document is: how a backend event becomes something a user sees, described from
`server/src/notify/emit.ts`, `server/src/functions/notifications.ts` and the browser mirror
`src/components/Notifications.jsx`.

What it refuses to do: describe intent as behaviour. Where the code does something weaker than the
design suggests, it is written down under "Known limitations".

---

## The path

```
backend event -> emit() -> persisted Notification row -> notificationFeed -> toast / alert / bell
```

Persistence comes first and delivery second. The row is written before anything is shown, so a
refresh cannot lose a notification that mattered. Email is sent afterwards and is best-effort:
`emit()` fires `sendEmail(...).catch(() => null)`, and a delivery failure never rolls back the fact
that the event happened.

Two registered handlers serve the whole surface (both already in `functions/registry.ts`):

- `notificationFeed` — the caller's own notifications. Ownership comes from the session, never from
  the request body.
- `notificationRead` — mark by `id`, by `ids`, or `all: true`. Every id is re-checked against
  `recipient_user_id` before the update, so an id from someone else's feed changes nothing.

## The 8 categories

`CATEGORY` in `emit.ts`. The feed returns the full list in `categories`, so the UI filter is driven
by the server rather than a hardcoded client array.

| Key | Meaning | UI label (`CATEGORY_META`) |
|---|---|---|
| `contest` | A campaign changed state around the user | Campaign |
| `submission` | An entry was received, judged eligible, or rejected | Submission |
| `winner` | Selection and the verification that releases a prize | Winner |
| `payment` | Money coming **in**: a brand funding a contest | Funding |
| `payout` | Money going **out**: a creator withdrawal | Payout |
| `support` | Support and tickets | Support |
| `security` | Account or traffic security events | Security |
| `system` | Everything else; also the default when a caller passes no category | System |

`payment` and `payout` are kept apart deliberately. They are opposite directions of money and a
user filtering for "did I get paid" must not be shown "a brand funded a contest".

## The 3 severities

`SEVERITY` in `emit.ts`, and `PERSISTENT = [SEVERITY.CRITICAL]`.

| Severity | Meaning | On screen |
|---|---|---|
| `info` | Ordinary guidance | Appears, holds, leaves. No close button |
| `important` | Worth noticing, but nothing is wrong | Same timing, more prominent |
| `critical` | Something **is** wrong and stays wrong until acted on | Does not leave on a timer |

`critical` is reserved for live problems: a rejected transfer, a failed payout, a disqualified
entry, a security event, a winner who must verify before a prize can be released. The rule in the
code comment is the rule to keep: hiding an active problem because a timer elapsed is how a user
misses the one message that mattered.

## The dedupe key

`emit({ ..., dedupeKey })` is the argument that stops a retry, a replayed job or a double click
from producing two rows. Before creating anything, `emit()` looks for an existing notification with
the same `recipient_user_id` **and** the same `dedupeKey`, and returns that row instead.

Storage detail worth knowing: the key is persisted in the `related_post_id` field on the
Notification entity. That field is the dedupe key, not a post reference.

Callers build the key from **the entity and the transition** — never from a timestamp. A key
containing `Date.now()` is unique every time and therefore dedupes nothing. Shape it like
`funding:<fundingId>:verified` or `winner:<contestId>:selected`.

`emitMany(svc, recipients, payload)` sends the same payload to several people and dedupes **per
recipient**, so one shared key is correct for a fan-out.

## Auto-dismiss

Decided on the client, in `src/components/Notifications.jsx`:

- `HOLD_MS = 2600` schedules removal, and the exit animation (`EXIT_S = 0.4`) finishes at about
  **3.0s**. Ordinary notifications therefore leave after roughly three seconds.
- Ordinary toasts have **no close button**. They are not asking for a decision, so they must not
  demand one. They render in a `role="status"` `aria-live="polite"` list.
- Critical items are **not** toasts. They come from `active_critical` in the feed response, render
  in a `role="alert"` block, and no timer removes them. They leave when the underlying item is
  marked read — that is, when the user acts on it — or when the server stops returning it.
- At most 3 toasts and 2 critical alerts are shown at once; extra criticals collapse into a link
  reading "N more issues need attention".
- The provider polls `notificationFeed` every 30s and again on window focus and
  `visibilitychange`. The **first** load is treated as history, not news: nothing from it toasts.
  A `seen` set keeps a later poll from re-toasting an id.
- Reduced motion is respected — with `useReducedMotion()` the enter animation is skipped entirely.

## Deep links

Every catalogued event sets `actionUrl`. `publicNotification()` in `notifications.ts` exposes it as
`action_url`, falling back to `/contest/<contest_id>` when a contest is attached and no explicit URL
was given. A notification with nowhere to go is a list item the user then has to go and find.

The link's label is derived from the destination by `actionLabel()` so the wording always matches
where it actually goes: `/verify` → "Verify account", `/fund` → "Open funding", `/review` →
"Review entry", `/balance` → "View balance", `/tracker` → "View Tracker", `/settings` → "Review
security", `/admin` → "Open admin", `/contest/...` → "View campaign", anything else → "Open".

## The event catalogue

`EVENTS` in `emit.ts` is the only sanctioned way for a handler to create a notification
(`emitEvent(svc, name, params)`). Wording lives there, not at the call site, so a creator is told
the same thing in the same voice wherever the event surfaces, and no handler can invent a message
claiming something the backend has not confirmed.

| Event | Category | Severity |
|---|---|---|
| `contest_published` | contest | info |
| `contest_joined` | contest | info |
| `contest_closing` | contest | important |
| `not_selected` | contest | info |
| `submission_received` | submission | info |
| `submission_to_brand` | submission | info |
| `submission_eligible` | submission | info |
| `submission_ineligible` | submission | critical |
| `submission_disqualified` | submission | critical |
| `funding_reported` | payment | important |
| `funding_verified` | payment | important |
| `funding_rejected` | payment | critical |
| `admin_funding_pending` | payment | important |
| `admin_withdrawal_requested` | payout | important |
| `withdrawal_requested` | payout | info |
| `withdrawal_paid` | payout | important |
| `withdrawal_failed` | payout | critical |
| `winner_selected` | winner | critical |
| `winner_verification_required` | winner | critical |
| `winner_verified` | winner | important |
| `security_alert` | security | critical |

`winner_selected` is critical because it is not an announcement — it is an action the creator must
take (verify the account they published from) before a prize can be released.

Templates take real names. "Brand" and "Creator" are placeholders, not names, and never reach a
user when an identity is known. Titles are truncated at 160 characters and bodies at 600.

## Backward-compatible classification of legacy rows

Notifications existed before `emit()` did, and any handler not yet migrated still writes rows
without `category` or `severity`. `derive(n)` in `notifications.ts` classifies those rows rather
than dumping them into an unknown bucket.

Category, from the legacy `type` and then the wording:

- `contest_won` → winner
- `payment_received` → payout if the text matches `/payout|withdraw/`, otherwise payment
- `submission_update` → submission
- text matching `/contest|campaign/` → contest
- text matching `/support|ticket/` → support
- otherwise → system

Severity, from the wording only:

- `/could not|failed|rejected|disqualif|not met|did not meet|needs attention|on hold/` → critical
- else `/verif|winner|won|approved|paid|processed/` → important
- else → info

A row is treated as critical only when its wording describes something **still wrong**. Guessing
high would make every old notification undismissable, which is the failure mode this classification
exists to avoid.

Forward compatibility runs the other way too: `emit()` still writes the legacy `type` field
(`contest_won` / `payment_received` / `submission_update` / `system`) alongside the new dimensions,
so surfaces that read `type` keep working.

## What the feed returns

`notificationFeed` reads up to 300 of the caller's rows, classifies each one, and returns:

| Field | Meaning |
|---|---|
| `notifications` | The list after optional `category` / `unread_only` filtering, capped by `limit` (default 60, max 200) |
| `unread` | Unread count across all rows |
| `active_critical` | Unread persistent items — what the UI must keep showing rather than auto-dismiss |
| `unread_by_category` | Unread counts per category, for the filter chips |
| `categories` | The 8 category keys |
| `total` | Row count before filtering |

Each item carries `persistent: PERSISTENT.includes(severity)` so the client does not re-derive the
dismissal rule.

## Known limitations

- **Dedupe is a read-then-write, not a database constraint.** Two truly concurrent `emit()` calls
  with the same key can both find nothing and both insert. The ledger has partial unique indexes for
  this problem (`server/src/db.ts`); notifications do not.
- **A failed insert is silent.** `Notification.create(...).catch(() => null)` means a database error
  produces no notification and no error to the caller. The event still happened; the user is simply
  not told.
- **`support` has no catalogued event.** The category exists and legacy rows classify into it, but
  nothing in `EVENTS` emits it, so support notifications are only ever legacy or ad hoc rows.
- **Client-side guidance is not persisted.** `EVENTS` and `SECURITY_EVENTS` inside
  `src/components/Notifications.jsx` are a separate, browser-only catalogue used by `notify(...)`.
  Those messages do not survive a refresh and are not in the feed. Critical client guidance becomes
  an in-page warning that stays until dismissed, not a persisted row.
- **Delivery is polling, not push.** Worst case, a user sees a new notification about 30 seconds
  after it is created (sooner if they refocus the tab).
- **Filtering happens after the fetch.** `category` and `unread_only` are applied in JavaScript over
  the 300 most recent rows, so a user with more than 300 notifications can have older ones in a
  category fall out of reach.
- **Read state is per-row and irreversible in the UI.** There is no "mark unread".
- **Email copy is fire-and-forget.** There is no record of whether the email was delivered, and no
  retry.
