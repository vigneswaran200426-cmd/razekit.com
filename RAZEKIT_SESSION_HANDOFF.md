# RAZEKIT — SESSION HANDOFF

Rolling handoff for the next Claude Code session. Everything here was **observed in this
session**, not inherited from a previous report. Where something was not verified, it says so.

Last updated: 2026-09-17.

---

## 0. Read this first — the working copy was gone

At the start of this session there was **no RazeKit source on this machine**. The path the
previous session used, `C:\Users\darts\Downloads\razekit`, did not exist; `C:\Users\darts\Downloads`
was empty (0 items). Nothing in `C:\Users\darts\New folder` (this session's working directory) is
RazeKit — that directory holds the JOIE / content-rewards / vikki projects.

The repository was **restored by cloning from GitHub** into the original path:

```
git clone https://github.com/vigneswaran200426-cmd/razekit.com.git C:\Users\darts\Downloads\razekit
```

No local work was lost that GitHub did not already have: `main` was pushed. But **anything the
previous session left uncommitted is gone for good.**

`git` is not on PATH. It ships with GitHub Desktop; prepend this to `$env:PATH`:

```
C:\Users\darts\AppData\Local\GitHubDesktop\app-3.5.12\resources\app\git\cmd
```

There is no `gh` CLI on this machine.

---

## 1. Repository state

| Item | Value |
|---|---|
| Repo | `vigneswaran200426-cmd/razekit.com` |
| Branch | `main` |
| HEAD | `6a1fe21` — "Withdraw the category filter too when profiles fail to load" |
| Working tree | clean at clone; one fix applied this session (§5) |
| Other branches | `origin/beta-manual-payment-ledger` (`d21b675`) — merged into main long ago, stale |

**My stored memory said main was at `996369d`. That is stale.** `996369d` is the payment/ledger
merge; **21 commits have landed on top of it** since. Do not trust the old figure.

Admin frontend/API live in a separate repo, `admin-razekit.com`. It was **not** cloned this
session and has not been inspected.

### The 21 commits after `996369d`

Security/correctness: `39b6ef2` (six entities where one user could write another's rows),
`bc7e750` (forgeable verdict fields), `34f53f1` (handover state machine moved to the server),
`cbeed0c` (purged leaked test votes from a public poll + backstop).

Honesty: `bd044b6` (stop reporting failed requests as facts about the user's data),
`d0c5b9d` (two money screens lying when the server stays quiet), `7deec0e` (removed two fake
prizes live on the public homepage), `6a1fe21`.

Performance: `998aebe` (route splitting), `087bf98` (stop fetching every contest cover),
`f8e552e` (API client deadline/retry/offline), `afb7670`.

Design/a11y: `f78d074` (design system foundation), `0edb632` + `ed2c5c1` + `5c98e4d` (contrast to AA).

Other: `0083d6f` (campaign image generation was never calling OpenAI), `ec05303`, `277b582`,
`bd9c194`, `76122b1`.

---

## 2. Stale documents — do not trust these

- **`RAZEKIT_COMPLETION_STATE.json`** — header says `generated_for_branch:
  beta-manual-payment-ledger` and *"production currently runs commit 1e6549e"*. That branch was
  merged; production is far past it. Individual findings may still hold, the framing does not.
- **`DESIGN.md`** — says *"Status: Awaiting sign-off. No screen code written yet."* It describes a
  **dark gold/cyan** system with "Editor"/"Client" vocabulary. The app that actually shipped is the
  **cool near-white + RazeKit blue** system in `REDESIGN_V1_SCOPE.md` and `tailwind.config.js`,
  using "Creator". `DESIGN.md` is a superseded proposal. `REDESIGN_V1_SCOPE.md` +
  `tailwind.config.js` are the real design contract.
- **`AGENTS.md`** — still describes this as a Base44 app and tells agents to run `base44 dev`.
  The product moved **off Base44** to a self-hosted Node/Express/Prisma API. `base44/` survives as
  the source-of-truth entity definitions only.

---

## 3. Production — all four services verified live this session

| Service | URL | Observed |
|---|---|---|
| Public web | https://razekit.com | 200, SSR'd meta present |
| Platform API | https://razekit-api.onrender.com | 200 `{"service":"razekit-api","ok":true}` |
| API health | `/api/health` | 200 `{"ok":true,...}` |
| Admin web | https://admin.razekit.com | 200, `noindex,nofollow` correctly set |
| Admin API | https://admin-razekit-api.onrender.com | 200 `{"service":"razekit-admin-api","ok":true}` |

Health is at **`/api/health`**, not `/health` (`/health` 404s — that is correct, not a fault).

The deployed commit was **not** confirmed against `main`; there is no version endpoint and the
Render MCP requires a workspace the user must choose. Treat "production == `6a1fe21`" as
**assumed, not verified**.

---

## 4. Verified build/test state

Run from a clean clone, this session:

| Check | Result |
|---|---|
| `server` typecheck (`tsc --noEmit`) | **clean** |
| `server` tests | **295 tests, 295 pass, 0 fail** (after §5) |
| frontend tests | **13 tests, 13 pass** |
| frontend `npm run build` | **succeeds**, 31.5s |
| frontend `npm run lint` | **fails to start — see below** |

**Test count correction:** the brief assumed "292 passing". The real number is **295**.

**Bundle / performance work is intact.** Build output confirms route splitting is alive: 16+ named
route chunks, entry `index-*.js` at 396 kB raw / **125.16 kB gzip** — matching the previously
recorded 125 kB first-visit figure. No regression.

**`npm run lint` cannot pass.** ESLint 9 is installed, which requires flat config
(`eslint.config.js`), and **the repo contains no ESLint config file of any kind** — no
`eslint.config.*`, no `.eslintrc.*`. The script is advertised in `package.json` but has never been
runnable in this state. Pre-existing; not introduced this session. Low severity, but it means
"lint passes" has never been a real gate.

---

## 4b. Work done in session 2 (2026-09-17, after the audit)

Decision taken by the owner: **keep Neon.** The Supabase migration is not happening. Section 6
is retained only as the record of why it was never started.

Six commits on `main`, all local — **nothing has been pushed or deployed**:

| Commit | What |
|---|---|
| `e1980b1` | `paymentMode()` split-brain (§5) |
| `78889ef` | Winners: showcase hierarchy + featured winner + dev API proxy |
| `79d237a` | Notifications: one filter. Money: one number |
| `3b23ea7` | Tracker: scoring rulebook folded away; 5-in-4 KPI grid fixed |
| `9b5415e` | **107 simulated winners no longer published as real** (§4c) |
| `7ed9620` | Explore opens on creators, not a census |

Verified after all of it: server **302/302 tests pass** (was 295 — seven new), typecheck clean,
frontend 13/13, `npm run build` succeeds, entry chunk still ~125 kB gzip with route splitting intact.

Visual QA was done against the live public API through a dev proxy (`VITE_DEV_API_PROXY`, added in
`78889ef`) so production CORS never had to be loosened. Winners and Explore were checked at 1280px
and at 375px — no horizontal overflow at either.

**Authenticated screens were not visually verified.** Notifications, Money, Tracker and Dashboard
all need a session, and creating an account is not something to do against production. Those
changes are typechecked, built and reasoned about, but nobody has looked at them rendered.

## 4c. The public-data defect found and fixed

The homepage and the Winners page disagreed about what was real, and only the homepage was right.

`platformStats` excludes seed/demo/simulation accounts and reported **1 creator, 1 brand,
2 winners**. `winnersShowcase` applied no such filter and returned **109 winners**;
`winnersLeaderboard` ranked **50 creators**. Checked against production: 107 of the 109 are
simulation records carrying invented brand names — "Brand QA 04", "Ridge Labs", "Zenith Works" —
with prize amounts, final scores and finalized dates, all presented publicly as officially
finalized results.

Fixed in `9b5415e`. The exclusion now lives in `server/src/compliance/seedAccounts.ts`; both public
winners endpoints apply it, `adminConsole` imports it instead of keeping a second copy, and
`server/test/public-data.test.ts` guards both call sites. No record was altered or deleted — the
simulated data is still in the database and still visible to admin.

### The same bug is still live on Discover — NOT fixed

`/discover` shows **61 "open briefs"** from the same simulated brands, while `platformStats` counts
**5 real contests**. Every card also renders "Closed", because those contests have `status: 'open'`
with a deadline in the past — so the page's own headline figure ("Open briefs 61") contradicts every
card beneath it.

Why it was left alone rather than fixed blind:

- `Contest.rls.read` is `{}` — fully public — and `Discover.jsx` reads the entity directly
  (`entities.Contest.filter({ status: 'open' })`), not a purpose-built endpoint. Unlike the winners
  endpoints, there is no single server function to add a filter to.
- Fixing it properly means a new public function plus registry wiring plus changing Discover's data
  source. `server/test/registry.test.ts` explicitly guards that "the public surface stays small and
  deliberate", and none of it can be exercised without a database.
- Worth knowing: `platformStats` filters `!c.demo`, but **there is no `demo` field on the Contest
  schema**, so that clause is a no-op. The only thing doing real work there is the seed-creator
  check.

The fix is small and well-understood; it just needs a database to verify against.

## 5. Change made in session 1

**`server/src/payments/config.ts` — `paymentMode()` now reads the live environment.**

One test was failing on a clean clone: `payments.test.ts:786` "with payments paused the notice says
funding is closed, and offers no method" — expected `MAINTENANCE`, got `MANUAL_BETA`.

Root cause was a genuine split-brain, not a bad test. Two readers of the same operational switch
disagreed:

- `payments/config.ts` → `paymentMode()` read `config.payments.mode`, a **boot-time snapshot**
  taken in `config.ts:100`.
- `payments/gateway.ts` (lines 147, 156) read **`process.env.PAYMENT_MODE` live**.

So the gateway could be in `MAINTENANCE` — refusing new operations — while `betaNotice()`, which is
what a brand actually reads on the funding screen, still described an open manual bank-transfer
flow. That is the failure mode where someone wires money into a paused platform.

Fix: `paymentMode()` now reads `process.env.PAYMENT_MODE`, falling back to `config.payments.mode`.
Both readers now resolve from the same source. On Render the environment is fixed before boot, so
**production behaviour is unchanged**; what changes is that the two can no longer diverge, and the
pause switch is now honestly testable. The test was not weakened.

After: typecheck clean, **295/295 pass**. **Not yet committed or deployed.**

---

## 6. Database — current state and the migration question

**Current: Neon PostgreSQL. Not migrated. Nothing about the database changed this session.**

Architecture worth knowing before anyone plans a migration:

- Access is **plain Prisma over a standard `DATABASE_URL`**. There is **no Neon-specific driver,
  SDK, or serverless adapter anywhere in the codebase** — `@neondatabase/*` does not appear. "Neon"
  occurs only in prose: docs, comments, and runbooks.
- `server/.env.example` already reads *"Neon/Supabase: paste the connection string"*, and
  `server/README.md` says *"Create a free database at neon.tech or supabase.com."* The code is
  already provider-neutral.
- Storage is a **document store**: one `records` table with an `entity` column and a JSONB `data`
  column. Finance integrity rides on partial unique indexes over JSONB expressions created at boot
  in `ensureFinanceConstraints()` (`server/src/db.ts`) — `ledger_txn_idempotency_uniq`,
  `funding_active_per_contest_uniq`, `funding_reported_reference_uniq`,
  `withdrawal_active_per_user_uniq`. **Any migration must recreate these or duplicate-payment
  protection silently degrades to application-level checks.**
- `ADMIN_DATABASE_URL` optionally points admin entities at a second database; unset, `adminPrisma`
  falls back to the platform client (`db.ts:16`). It is currently unset.

### Migration status: BLOCKED — and blocked on credentials, not on effort

I have **no database access of any kind** from this session. A fresh clone contains only
`.env.example` files; `DATABASE_URL` is not in `render.yaml` (it is set by hand in the Render
dashboard). There is no Supabase account, project, or connector available here either.

Every substantive phase of the migration plan — dump Neon, create the Supabase project, move schema,
move data, compare row counts, reconcile financial totals, verify winners and poll tallies, cut
over, validate rollback — requires credentials that do not exist in this environment. None of it can
be executed or verified from here. Reporting progress on it would be fabrication.

### The instruction conflict — unresolved, needs the user

The brief contains **directly contradictory instructions** about this, which is why nothing was
attempted:

- The continuation prompt and the dedicated migration prompt: *"REMOVE NEON / USE SUPABASE"*,
  executed as a full production migration.
- The transformation prompt: *"DO NOT: migrate Neon to Supabase / replace Neon."*
- The core UX rebuild prompt: *"DO NOT CHANGE: Neon PostgreSQL architecture."*

The later prompts, and the user's own commentary around them, keep Neon. The earlier ones replace
it. **This must be settled by the user before any database work starts.** Migrating a live database
holding real financial records is not a thing to guess at.

---

## 7. Per-area status

| Area | Status | Verified? | Remaining | Blocker |
|---|---|---|---|---|
| Backend API | Live, typecheck clean, 295/295 | Yes | — | — |
| Frontend | Live, builds, 13/13 | Yes | Art direction (§8) | — |
| Admin | Live (both halves) | Reachable only | Not inspected this session | separate repo not cloned |
| Database | Neon, plain Prisma | Code read | see §6 | no credentials |
| Supabase migration | **Not started** | n/a | everything | credentials + conflicting instructions |
| R2 | Code present; buckets previously verified | No | re-verify | no credentials |
| Resend | **BROKEN** | Previously | 4 DNS records absent at Wix | owner-only DNS change |
| OpenAI images | Pipeline repaired (`0083d6f`) | Reached OpenAI, `OPENAI_QUOTA_EXCEEDED` | 1 live check when billing exists | billing |
| UroPay | Adapter built + 36 stubbed checks | Stubbed only | real provider call | merchant onboarding |
| Security | Ownership + protected-field sweeps exist | Tests pass | systematic IDOR sweep | — |
| Performance | Splitting + 125 kB gzip intact | Yes, from build | — | — |
| UI/UX | Tokens/motion/primitives adopted app-wide | Partly | composition pass | — |

**Email, OpenAI, and UroPay are all blocked on things only the account owner can do.** They are not
code defects and no amount of session time moves them.

---

## 8. UI/UX — where it actually stands

The design *foundation* is real and **is** adopted: `tailwind.config.js` defines semantic colour
tokens, a 4px spacing rhythm, a radius scale, and a full motion system (brand/exit/spring curves,
enter/exit keyframes, `pulse-once`). All **26** page files import `@/components/ui`, which
re-exports the newer `primitives.jsx` (`Sheet`, `Metric`, `ScoreBar`, `Timeline`, `Field`) from
`ui.jsx:270`. So there is no stranded design layer — the plumbing is connected everywhere.

What is missing is **art direction**, not tokens. The screens are correctly built out of a
consistent kit; they are not *composed*. That is the gap the user is reacting to, and it is the
right next body of work.

`docs/RAZEKIT_REDESIGN_AUDIT_MATRIX.md` is the standing 43-row audit checklist and remains valid.

---

## 9. Locked conventions — these break silently if got wrong

- `Segmented` keys off `t.key`, **not** `t.value`.
- `money()` takes **major** units; `moneyMinor()` takes **minor**. Mixing them is a silent 100×.
- `settleFundingReceipt` in `server/src/functions/finance.ts` is the **one** settle path. Never
  fork a second.
- RLS gates **rows**; `server/src/entities/protected.ts` gates **fields**. Both are required.
- Six campaign records must never merge: three `PollCampaign` rows (upcoming, YES/NO, 1,000,000-vote
  target, no submissions/winner/payout) and three `Contest` rows (₹50,000, 28 days, Instagram-only,
  60s, handover required). The 28-day duration is an auditable `ContestDurationRule` exception, not
  a global relaxation.
- Poll tallies must always come from real vote records. Test votes contaminated a public poll once
  already (`cbeed0c` purged them and added a backstop).
- Production has exactly one active `PaymentSettings` row and it is **deliberately empty**. Do not
  write fictional bank details into it to make `verify-e2e.ts` pass — that puts fake payment
  instructions in front of real clients. The correct fix is a separate test database, which does
  not exist.

---

## 10. Next actions

1. **Push and deploy the six commits.** They are all local. The winners fix in particular is
   correcting something visitors can see right now.
2. **Fix Discover the same way (§4c)** — it is the last public surface still presenting simulated
   records as real.
3. Look at Notifications, Money and Tracker in a real session; they were changed but never seen
   rendered.
4. Add an `eslint.config.js` so `npm run lint` is a real gate (§4).
5. Refresh or delete `DESIGN.md` and `AGENTS.md` (§2) — both actively mislead a fresh agent.
6. Clone and inspect `admin-razekit.com`; it has never been reviewed in this session line.
7. Still owner-only and unmoved: Resend DNS at Wix, OpenAI billing, UroPay merchant onboarding.

Database: **Neon stays.** Settled 2026-09-17.
