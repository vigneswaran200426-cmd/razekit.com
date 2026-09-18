# RazeKit Development area

The autonomous app, website and game build area inside RazeKit, powered by the
[RazeKit DEV](https://github.com/vigneswaran200426-cmd/razekit-dev) engine.

## Status: switched off

**The Development area is off, and off is the default.** Two switches, both of
which must be on before any of it exists:

| Switch | Where | Default | Effect when off |
|---|---|---|---|
| `DEV_AREA_ENABLED` | RazeKit API | `false` | The router is never mounted. `/api/development/*` returns the same 404 as an address that was never built. |
| `VITE_DEV_AREA_ENABLED` | RazeKit web build | `false` | No route, no navigation entry, no page chunk, no API surface in the bundle. `/development` is not an address. |

This is deliberately not derived from `DEV_ENGINE_URL`. "An engine happens to be
configured" and "this area should exist for users" are different decisions, and
only the second is a product decision.

Verified by building with the switch off and checking the output: the
`Development` and `BuildDetail` chunks are not emitted, and the strings
`development`, `Development` and `BuildDetail` appear **zero** times across
`dist/assets/*.js`. Turning the switch on restores both chunks and all routes.

To turn it on:

```bash
# RazeKit API
DEV_AREA_ENABLED=true
DEV_ENGINE_URL=https://your-engine
DEV_PRINCIPAL_SECRET=...        # must match the engine

# RazeKit web (build-time — requires a rebuild/redeploy)
VITE_DEV_AREA_ENABLED=true
```

## One product, several areas

RazeKit is **one website and one application**. Development is a product area
inside it, a sibling of the contest, brand and creator areas — not a second
product and not a second site.

```
                         RAZEKIT
                   ONE WEBSITE / ONE APP
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
      DEVELOPMENT AREA               MEDIA / BRAND / CREATOR
      /development                   /explore /discover /winners
      Niomi · Konami                 contests · tracker · payouts
      RazeKit DEV engine             existing RazeKit systems
             │                             │
             └──────────────┬──────────────┘
                     Shared RazeKit core
          identity · tenancy · billing · storage · security
```

A user signs in once. The same account reaches both areas, and there is no
second login and no second frontend. What is **not** shared is domain logic:
contest scoring knows nothing about builds, and the build engine knows nothing
about contests.

The media, brand and creator experience is untouched by this integration. No
route moved, no terminology changed, no screen was replaced. Development is
appended to the navigation for signed-in accounts and only where the deployment
has a build engine configured — a deployment without one sees no change at all.

## Where things live

| Concern | Owner |
|---|---|
| Users, sessions, roles, billing account, storage, notifications | **RazeKit** (`server/src`) |
| Tasks, agents, workspaces, workers, budgets, tools, verification | **RazeKit DEV** (`razekit-dev/src`) |
| The Development UI | **RazeKit** (`src/pages/development`) |
| The bridge between them | **RazeKit** (`server/src/development`) |

There is deliberately **no task state in RazeKit's own database**. Two stores
for one task is two truths for one task.

## The trust boundary

```
browser ──► RazeKit API ──► signed principal ──► RazeKit DEV engine
            requireAuth      HMAC-SHA256,           verifies signature,
            req.user         ~2 min TTL             scopes to tenant
```

- The **browser never talks to the engine.** Every call goes through
  `/api/development/*`, which is where the principal is minted.
- **One RazeKit account maps to one engine tenant**, `rk-user-<id>`, prefixed so
  a tenant id can never be mistaken for a bare user id.
- **Only the engine's public task API** can be reached on behalf of a user. The
  `/internal/*` surface registers workers, leases credentials and invokes tools
  directly; a browser request is refused before it is sent.
- Set `RAZEKIT_REQUIRE_SIGNED_PRINCIPAL=true` in production. Without it the
  engine also accepts plain `x-razekit-tenant-id` headers, which any caller
  could forge.

## How a build runs

```
USER REQUEST
    ↓
PRE-FLIGHT            complexity, predicted tools, estimated budget
    ↓
AUTHORISATION         explicit; a task without it is refused
    ↓
AGENT                 website/app → Niomi   ·   game → Konami
    ↓                 isolated workspace, worker, budget, tool manifest
ASTRA PLAN            architecture, files, acceptance criteria
    ↓                 → architecture.plan on the task blackboard
FABLE IMPLEMENT       the runnable execution plan, full file contents
    ↓                 → execution.plan
EXECUTE               files · git · node · npm · browser · deploy
    ↓                 → execution.lastResult
ASTRA REVIEW          reads the execution RESULT, not the intention
    ├── pass   → VERIFY → COMPLETED
    ├── revise → back to FABLE (not back to planning)
    └── block  → DECISION NEEDED
```

Three properties worth knowing:

- **A review never judges an intention.** Execution is inserted between Fable
  and Astra, so there is always a real run to review.
- **A passing review does not complete a task.** Verification runs as its own
  transition and overrules the reviewer. Tests, build, artifact, budget and
  workspace isolation are all checked against evidence.
- **The loop cannot run away.** One transition per tick, budget checked before
  work rather than after, and failures from our own limits are never retried.

## Running it locally

Two processes. The engine first:

```bash
cd ../razekit-dev
cp .env.example .env        # set RAZEKIT_PRINCIPAL_SECRET and RAZEKIT_ADMIN_TOKEN
npm start
```

Then the RazeKit API and web app as usual, with `DEV_ENGINE_URL` and a
`DEV_PRINCIPAL_SECRET` **matching the engine's**:

```bash
cd server && npm run dev
npm run dev          # from the repository root, for the web app
```

Development then appears in the navigation at `/development`.

### Without provider keys

The engine runs a deterministic Fable/Astra pair when `FABLE_API_KEY` and
`ASTRA_API_KEY` are absent. This is not a mock of the pipeline — it writes real
files, runs `npm test`, runs a real build and packages a real artifact, and
completion is still verification-gated. Only the reasoning is canned.

## Verifying the integration

```bash
cd server && npm run verify:development
```

Starts a real engine, drives a real build to completion over real HTTP with real
signed principals, and checks routing, tenant isolation, principal forgery,
verification gating, the deliverable on disk, and that no secret reaches
persisted state or logs. Set both provider keys to run the same flow against the
live models.

## Workers

The engine schedules onto a **shared pool**, not one machine per user:

```
task scheduler → durable queue → worker pool → isolated task runtimes
```

A worker machine runs the agent and dials out:

```bash
cd razekit-dev
RAZEKIT_ENGINE_URL=https://dev-engine.example \
RAZEKIT_ADMIN_TOKEN=... \
RAZEKIT_WORKER_POOL_CAPACITY=4 \
node src/worker-agent.js
```

It reports its own vCPU count, memory and declared capabilities, then heartbeats.
**No address is configured and none is recorded** — the control plane schedules
by capacity, so the first AWS instance is simply the first caller. Replacing it,
adding a second, or moving provider is a deployment change. A worker that stops
heartbeating is marked offline and stops receiving work without needing to
cooperate; its in-flight job's lease expires and is recovered.

Declare `RAZEKIT_WORKER_CAPABILITIES` honestly: claiming `unity` on a machine
without it means accepting game builds that cannot run.

## Secrets

| Variable | Where | Notes |
|---|---|---|
| `DEV_PRINCIPAL_SECRET` / `RAZEKIT_PRINCIPAL_SECRET` | both | Must match. Server-only on both sides. |
| `RAZEKIT_ADMIN_TOKEN` | engine | Guards worker registration and tenant administration. |
| `FABLE_API_KEY` | engine | Never reaches RazeKit or the browser. |
| `ASTRA_API_KEY` | engine | Never reaches RazeKit or the browser. |

No provider key is ever handed to a task. Tasks receive scoped, expiring
credential leases through the engine's credential broker, and audit metadata is
redacted on write. Engine HTTP errors surface the status and the provider's own
error type, never the response body.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `/development` shows Not Found | The area is off. The web app was built without `VITE_DEV_AREA_ENABLED=true`, so the route does not exist. This is the default. |
| `/api/development/*` returns 404 | The area is off on the API: `DEV_AREA_ENABLED` is not `true`. This is the default. |
| Turned on the API but the page is still missing | The web switch is build-time. Setting it needs a rebuild and redeploy, not a restart. |
| Development missing from the navigation | Both switches are on but `DEV_ENGINE_URL` is unset, so `/api/development/status` returned `configured: false`. |
| `Signed principal authorization is required` | `RAZEKIT_REQUIRE_SIGNED_PRINCIPAL=true` but `DEV_PRINCIPAL_SECRET` is unset or does not match. |
| A build stops at DECISION NEEDED immediately | No model configured. Check `/health` → `models.mode`; `unconfigured` means neither the real nor the test pair was registered. |
| `RAZEKIT_MODEL_MODE=real requires both FABLE_API_KEY and ASTRA_API_KEY` | Deliberate. `real` never silently falls back to canned adapters. |
| A build blocks on "failed to build N times" | Genuine repeated failure. The updates on the task say which step failed. |
| Health checks failing on the engine | It must be able to answer `/health` anonymously; do not put it behind an authenticating proxy. |

## Tests

```bash
cd ../razekit-dev && npm test    # engine: loop, workers, isolation, budget, verification
cd server && npm test            # RazeKit API, including the trust boundary
cd server && npm run verify:development   # cross-repo end to end
npm test                         # web app
```
