# RazeKit — security architecture

What actually protects RazeKit's data today. Primary sources:
`server/src/entities/rls.ts`, `server/src/entities/protected.ts`, `server/src/entities/service.ts`,
`server/src/auth/middleware.ts`, `server/src/traffic/url.ts`,
`server/src/verification/platforms.ts`, `server/src/payments/` and
`server/src/middleware/rateLimit.ts`.

The shape of the problem: RazeKit exposes a generic document API
(`/api/entities/:entity` — query, get, create, patch, delete) to authenticated browsers. That is
convenient and it is also the entire attack surface, so two independent layers sit on it.

---

## 1. Two layers: rows, then fields

### Layer 1 — RLS gates ROWS (`entities/rls.ts`)

Each entity in `schemas.json` carries an `rls` block with four policies (`read`, `create`, `update`,
`delete`) written in a small declarative language:

| Policy | Meaning |
| --- | --- |
| `{}` | public — anyone, including anonymous |
| `true` | any authenticated user |
| `false` | nobody |
| `{ "created_by_id": "{{user.id}}" }` | the row's owner (platform-trusted column) |
| `{ "data.<field>": "{{user.id}}" }` | a field on the row equals the caller's id |
| `{ "user_condition": { "role": "admin" } }` | a user attribute match |
| `{ "$or": [...] }` / `{ "$and": [...] }` | boolean combinators |
| multiple keys in one object | AND of those keys |

The engine has two evaluators that must agree:

- **`canAccess(policy, user, row)`** — an in-memory check used for `get`, `create`, `update`,
  `delete`.
- **`readWhere(policy, user)`** — compiles the read policy into an exact Prisma `where` fragment for
  list and filter reads, so restriction happens **in the database** rather than by fetching rows and
  discarding them. It returns one of "no restriction", "match nothing", or a `where`.

Both fail closed. An unresolvable template (`{{user.id}}` with no user) yields `undefined`, which
returns `false` from `canAccess` and the "match nothing" sentinel from the compiler. A malformed
policy that is neither boolean nor object returns `false` / `NONE`.

### Layer 2 — the protected-field guard gates FIELDS (`entities/protected.ts`)

RLS answers *"may this user touch this row?"* It cannot express *"…but not these fields."* That gap
produced two real forgeries, named in the file's own header comment:

- a brand could `PATCH Contest.winner_user_id` directly from the browser;
- a creator owns their own `Submission` row, so they could set `status = 'won'`.

`PROTECTED_FIELDS` closes it. Fields listed there are writable **only** by the service role — that is,
by server functions. The list covers:

- **Outcome fields** on `Contest` (`winner_user_id`, `winner_submission_id`, `winner_selected_at`,
  `lifecycle_state`, `criteria_version_id`, …) and on `Submission` (`engagement_score`,
  `traffic_score`, `final_score`, `rank`, `score_breakdown`, `disqualified`, …).
- **Funding fields** on `Contest` (`funding_status`, `funding_id`, `funded_at`,
  `prize_committed_minor`, `payment_mode`) — a brand must never be able to mark its own contest
  funded.
- **Whole entities** (`['*']`): every ledger entity, `ContestFunding`, `FundingProof`, `Payout`,
  `PayoutAccount`, `WithdrawalRequest`, `PaymentSettings`, `PaymentQrVersion`, `FundingReceipt`,
  `ReconciliationRecord`, `AdminPermission`, `WinnerVerification`, `SocialAccount`,
  `Disqualification`, `ScoringConfig`, `AuditLog`, `FraudAlert`, all compliance entities, and every
  server-computed aggregate (`CreatorStats`, `MonthlyLeaderboard`, `ScoreSnapshot`, `TrafficEvent`,
  `TrackingLink`, …).
- **Partial locks** where a user legitimately owns the row: a user may *file* a `TrustReport` but
  not set its `status`, `severity`, `risk_score` or `resolution`; a user may file a `SupportTicket`
  but not move it through its lifecycle.

`PROTECTED_STATUS` additionally locks specific *values*: `Submission.status` may not be set to `won`
or `not_selected`, and `Contest.status` may not be set to `winner_selected` or `completed`, from a
browser — while the client can still move a row through its own ordinary states.

Two details that make the guard usable rather than merely strict:

- **`assertNoProtectedWrite(entity, patch, prev)` compares against the previous value** and only
  rejects a field that actually *changes*. Re-sending an unchanged field is harmless, so naive
  "PATCH the whole object" clients keep working.
- **Admins are not exempt.** An admin acting through the generic entity API is still a browser
  client. Admin corrections must go through an audited server function instead. This is why
  `functions/finance.ts` exists as a separate, permission-gated surface rather than as an admin flag
  on the entity API.

### Where the two layers are applied

`entities/service.ts` wires both, and the wiring is what makes them unavoidable:

- reads compile the RLS policy into the query (`readWhere`) and re-check single-row `get`
  (`canAccess`);
- `create` runs `assertNoProtectedWrite` **then** the create policy;
- `update` loads the existing row, runs the update policy, then `assertNoProtectedWrite(entity,
  patch, prev)`;
- `delete` runs the delete policy;
- every one of those checks is skipped **only** when `ctx.serviceRole` is true — which is set by
  `serviceClient()`, reachable from server functions and never from an HTTP route handler's user
  context.

Contest fairness (`contest/guard.ts`) is enforced in the same place, so a direct API call, a script
or an internal mutation cannot bypass the prize→duration rule either.

## 2. Role authority is server-side

`auth/middleware.ts → attachUser` reads a bearer token (or the `rk_token` cookie), verifies it, and
loads the user **from the database**. `req.user.role` therefore comes from a database column, never
from a request body, a header or a token claim the client could shape.

The distinction that matters in this codebase: `role` is server-controlled and is the trustworthy
signal; `user_role` is the self-selected creator/brand surface and is not an authority. Admin
handlers check `role === 'admin'`.

`entities/service.ts` strips `role`, `accountStatus` and `userRole` from any non-admin patch, so a
user cannot promote themselves or flip the surface that gates `Contest` / `Submission` /
`WinnerPublish` creation. `created_by_id` and `role` are also excluded from client-settable columns
on create.

Authorization is then re-checked at every layer rather than assumed once:

- `functions/routes.ts` applies `requireAuth` per function, with a small explicit
  `PUBLIC_FUNCTIONS` allowlist (finalized winner results a visitor may browse) and an `ADMIN_ONLY`
  set enforced before the handler runs;
- each admin handler *also* re-checks `ctx.user.role === 'admin'` itself — deliberate defence in
  depth, so a routing mistake does not become a data breach;
- finance handlers go further and require a **specific** permission
  (`finance/permissions.ts`), not merely "admin": seeing a funding queue, marking money received,
  approving a withdrawal, confirming a transfer, reading an unmasked account number, posting an
  adjustment and granting permissions are ten separate grants recorded in `AdminPermission` with who
  granted them and when. The check writes an audit record naming the permission used, so the log says
  *what authority was exercised*;
- handlers that aggregate through the service client (`functions/tracker.ts`, `reports.ts`) filter by
  the caller's own id explicitly, because the service role has bypassed RLS — an id taken from the
  request is never trusted without an ownership check.

## 3. SSRF and open-redirect guards on outbound URL checks

Two places accept a URL that the server will later fetch or send a visitor to. Both validate once,
at the point the value is stored, and the hot path only replays a value that already passed.

**`traffic/url.ts → validateDestinationUrl()`** — the brand campaign destination behind
`/r/:code`. Called from `contest/guard.ts` on every write that touches it, because it is a security
boundary and not just a fairness input. It requires `http:`/`https:`, a length under 2048, and no
embedded credentials; it rejects `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`,
`metadata.google.internal`, `instance-data`, `metadata`, and any host ending `.localhost` or
`.internal`; it rejects private and reserved IPv4 (10/8, 127/8, 0/8, 192.168/16, 172.16–31/12,
169.254/16 link-local and cloud metadata, and 224+ multicast), treats a malformed dotted quad as
private, and rejects bare IPv6 and any host without a dot. It returns a **normalized absolute URL**,
which is what gets stored.

**`verification/platforms.ts → validateUrl()`** — the public page the server fetches looking for a
winner's challenge code. Same idea: protocol allowlist, length cap, and a rejection of `localhost`,
`.local`, `.internal`, any bare IPv4 literal and any host containing `metadata`, plus a per-platform
URL pattern so a YouTube verification must actually be a YouTube URL. The fetch itself identifies
honestly (`RazeKit-Verification/1.0`), has a 12-second timeout, and caps the body it reads. A
network failure returns `MANUAL_REVIEW`, never a pass and never a fail — "I could not check" and "I
checked and it was not there" are different outcomes that send the creator to different places.

`payments/uropay.ts` applies the same instinct outbound: the provider base URL is pinned, an
override is honoured only if it parses as `https:`, and requests use `redirect: 'error'` so a
redirect cannot carry credentials somewhere else.

## 4. Webhook signature verification and replay protection

**Signature.** `payments/uropay.ts → verifyUropayWebhook()` computes HMAC-SHA256 with the hex SHA-512
of the shared secret as the key, over the payload serialised with a **per-event key order** (key
order is part of the signature, so it is declared per event type rather than left to object iteration
order) using a PHP `json_encode`-compatible encoder. Comparison is `crypto.timingSafeEqual` after a
length check. It returns a reason instead of throwing, so the caller can record the rejected event —
a stream of bad signatures is a signal worth seeing.

**Environment binding.** `webhookEnvironmentMatches()` refuses an event whose declared environment
does not match the environment RazeKit is running as, so a sandbox event cannot act on production
data.

**Replay.** Today, replay protection lives in the money layer, not at the HTTP edge, and it is
genuine:

- every ledger transaction carries an idempotency key checked *before* anything is written
  (`ledger/post.ts`), and a replay returns the original transaction;
- the funding credit key is built from the funding request **and the bank reference**, so one real
  transfer credits once;
- `settleFundingReceipt()` refuses a bank reference already present on a prior `FundingReceipt`;
- `db.ts → ensureFinanceConstraints()` creates Postgres partial unique indexes at boot on the ledger
  idempotency key, one active funding request per contest, one reported bank reference, and one open
  withdrawal per creator. Application checks race; a unique index does not. Failure to apply them is
  logged loudly rather than silently downgrading the protection;
- `financeVerifyFunding` runs inside a transaction with `lockRecord` on the funding row, so two
  simultaneous clicks serialise and the second returns "already verified".

## 5. What is deliberately never exposed to a browser

- **The full destination bank account.** `payments/config.ts` exposes it through exactly one function
  (`fullBankForInstructions`, reached only by `fundingInstructions` after proving authentication,
  contest ownership and a funding state that expects a transfer). Everything else — admin lists,
  audit records, emails, logs — uses `maskedBank()`. The account mask is six `X`s plus the last five
  digits and is deliberately *not* length-preserving, so it leaks neither the digits nor the length.
- **A creator's bank details.** Stored on a server-only entity, returned masked everywhere including
  the finance dashboard, and revealed in full by exactly one handler (`financePayoutDetail`) which
  requires a finance permission and writes an audit record *every time it is read*.
- **Provider secrets.** Only env vars. The UroPay secret is never transmitted (a SHA-512 of it is)
  and never logged. `uropayHealth()` reports environment, configured/enabled flags and capabilities —
  never a key.
- **Uploaded files.** Funding proofs and the UPI QR go to **private** object storage under a
  server-built path; the client never chooses the key, the bucket or the filename. They are served
  only through a 900-second signed URL, and only to the owner or a holder of `finance.view` — the
  IDOR surface that would otherwise leak one client's bank screenshots. Uploads are MIME-checked
  (images/PDF for proofs, images only for a QR) and size-capped.
- **Fraud thresholds.** `traffic/fraud.ts` reports only a coarse `verification_state`
  (`verified` / `duplicate` / `suspicious` / `rejected`). The detection thresholds are never in an
  API response.
- **Raw IPs and user agents.** Traffic stores only salted hashes, with the salt derived from the JWT
  secret so it is stable across restarts without being a hard-coded constant.
- **Internal error detail.** The Express error handler in `index.ts` returns a stable generic message
  for any 5xx and logs the real one server-side. Auth rate-limit responses are deliberately generic
  so they never confirm whether an account exists.
- **Server-computed truth in general.** Scores, ranks, compliance verdicts, winner identity,
  verification state, funding state, ledger rows and audit logs are all entity-level write-blocked.
  A browser can read what it is entitled to and can assert nothing.

Supporting controls: CORS is an explicit origin allowlist; `middleware/rateLimit.ts` limits login and
registration (10 per 5 min per IP), OTP and password reset (5 per 10 min), the tracking redirect (120
per minute) and server functions (120 per minute per user); the JSON body limit is 5 MB.

---

## Known limitations

- **Rate limiting is in-process.** The counters live in a `Map` in one Node process — correct for the
  single service RazeKit runs today, and not correct if it is ever scaled horizontally. The logic is
  isolated in one file so the swap to a shared store stays contained.
- **There is no webhook endpoint yet**, so the signature verification described in §4 has no caller,
  and there is no event-id deduplication table. A webhook handler will need one on top of the money-
  layer idempotency.
- **`validateDestinationUrl` blocks private IPv4 literals but resolves no DNS.** A hostname that
  resolves to a private address passes validation. The redirect path sends a visitor's browser there
  rather than fetching it server-side, which limits the impact, but the verification fetch in
  `verification/platforms.ts` does fetch server-side and has the same gap — plus it follows
  redirects, so a public host can redirect the fetch elsewhere.
- **IPv6 handling is by rejection, not parsing.** Both validators reject hosts containing `:`
  outright rather than classifying IPv6 ranges.
- **`Handover` and `HandoverMessage` are client-written** through the generic entity API with no
  server function and no protected fields, so handover confirmations are client-asserted. Its attempt
  to complete the contest is blocked by the protected-status guard (see
  `RAZEKIT_MARKETPLACE_ARCHITECTURE.md`).
- **RLS policies are only as good as `schemas.json`.** The engine is faithful to the policies it is
  given; a wrong policy on a new entity is a hole the engine cannot detect. New entities holding
  anything sensitive should default to `write: false` and appear in `PROTECTED_FIELDS`.
