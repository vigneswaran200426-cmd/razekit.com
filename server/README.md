# RazeKit Backend — Off-Base44 Stack

Self-hosted replacement for the Base44 platform: **Node + TypeScript + Express + Prisma/PostgreSQL**, with auth, the money engine (Razorpay/Stripe), object storage, email, LLM, image generation, the visual-asset engine, and a cron scheduler. The frontend talks to it through `src/api/base44Client.js` (a drop-in for the old Base44 SDK — no screens changed).

```
Browser (React/Vite)
  └─ src/api/base44Client.js  ── HTTP ──▶  server/  (Express API)
                                              ├─ /api/auth/*          auth (JWT, OTP, Google OAuth, reset)
                                              ├─ /api/entities/*      52 entities + RLS engine
                                              ├─ /api/functions/*     payments, payouts, visual engine
                                              ├─ /api/integrations/*  upload, email, LLM, image
                                              ├─ /api/webhooks/money   Razorpay + Stripe
                                              └─ cron: reconciliation + visual maintenance
                                          Prisma ──▶ PostgreSQL   (JSONB document store)
```

---

## 1. Prerequisites

- Node 20+ (works on 26). `npm install` already run in this folder.
- A **PostgreSQL** database. You have two easy options — pick ONE:

### Option A — Docker (all local, nothing to sign up for)
Install Docker Desktop, then:
```bash
docker compose up -d          # starts Postgres (5432) + MinIO (9000)
```
`DATABASE_URL` in `.env` already points at it.

### Option B — Free cloud Postgres (no Docker) — recommended if Docker isn't installed
1. Create a free database at **neon.tech** or **supabase.com**.
2. Copy the connection string they give you.
3. Paste it into `server/.env` as `DATABASE_URL` (keep `?sslmode=require`).

> This machine currently has **no Postgres and no Docker**, so this is the one step that needs you. Everything else is built and tested.

---

## 2. First-time setup

```bash
cd server
cp .env.example .env            # then edit values (a dev JWT_SECRET is already generated in .env)
npm run gen:schemas             # regenerate entity schemas from ../base44/entities (already done)
npm run prisma:generate         # generate Prisma client (already done)
npm run db:push                 # create all tables in your database
npm run seed:money              # seed default India/INR fee rules (edit bps to your real terms)
npm run seed:admin              # create the first admin from ADMIN_EMAIL/ADMIN_PASSWORD in .env
npm run dev                     # start the API on http://localhost:4000
```

Health check: `curl http://localhost:4000/api/health` → `{"ok":true,...}`

## 3. Run the frontend against it

```bash
cd ..                           # project root
npm install                     # (@base44/* removed; installs the rest)
# .env.local already contains: VITE_API_BASE_URL=http://localhost:4000
npm run dev                     # Vite on http://localhost:5173
```

Sign in with the admin you seeded, or register a new account (the OTP is printed to the **server console** while `EMAIL_DRIVER=console`).

---

## 4. Migrating your Base44 data

1. Export each Base44 entity as a JSON array into `server/_import/<EntityName>.json`
   (e.g. `Contest.json`, `Wallet.json`, `WalletLedgerEntry.json`, `User.json`, …).
   Base44 records already include `id`, `created_date`, `created_by_id`.
2. Import:
   ```bash
   npm run import:data
   ```
   Idempotent (upserts by id). **Passwords are not exportable from Base44** — imported
   users sign in with Google or via “Forgot password”.
3. Verify wallet balances after import (the ledger is append-only; `balance_after_minor`
   on the last `WalletLedgerEntry` per wallet is the source of truth).

---

## 5. Connecting the external services (each is optional to start)

All of these are inert with safe dev defaults; wire them when you have accounts.

| Service | Env vars | Where to get it |
|---|---|---|
| **Google sign-in** | `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_REDIRECT_URI` | Google Cloud Console → OAuth 2.0 Client. Redirect URI = `<API>/api/auth/oauth/google/callback`. |
| **Razorpay** (INR) | `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` | Razorpay dashboard. Webhook URL = `<API>/api/webhooks/money?provider=razorpay`. |
| **Stripe** (USD) | `STRIPE_SECRET_KEY/WEBHOOK_SECRET` | Stripe dashboard. Webhook URL = `<API>/api/webhooks/money?provider=stripe`. |
| **Email** | `EMAIL_DRIVER=resend` + `RESEND_API_KEY`, or `EMAIL_DRIVER=smtp` + `SMTP_*` | resend.com, or any SMTP (SES/Postmark/Gmail app password). |
| **LLM** (help, moderation, quality) | `LLM_DRIVER=anthropic` + `ANTHROPIC_API_KEY` | console.anthropic.com |
| **Image gen** (contest art) | `IMAGE_DRIVER=openai` + `OPENAI_API_KEY` | platform.openai.com |
| **Storage** | `STORAGE_DRIVER=s3` + `S3_*` | AWS S3, Cloudflare R2, or MinIO. Leave `local` for dev. |

Until set: emails print to the console, LLM/image return dev stubs, payments return a
clean `PROVIDER_UNAVAILABLE` (exactly as Base44 did when unconfigured).

---

## 6. Deploying

- **Frontend** → Vercel or Cloudflare Pages. Build `npm run build` (root), output `dist/`.
  Set `VITE_API_BASE_URL` to your deployed API URL.
- **Backend** → any Node host (Render, Railway, Fly.io, a VPS). `npm run build && npm start`.
  Set every `server/.env` value as host env vars. Point `API_BASE_URL`/`WEB_BASE_URL`/`CORS_ORIGINS`
  at the real domains.
- **Webhooks** → register the two webhook URLs above in the Razorpay + Stripe dashboards,
  pointing at your deployed API.
- **Scheduler** → runs in-process by default (`ENABLE_SCHEDULER=true`). For multiple API
  instances, run one with the scheduler on and the rest off.

---

## 7. What maps to what (Base44 → here)

| Base44 | Replacement |
|---|---|
| `base44.entities.*` (browser direct DB) | `/api/entities/*` + RLS engine (`src/entities/rls.ts`) |
| Entity `rls` blocks | Enforced by the RLS engine, driven by `src/entities/schemas.json` |
| `base44.auth.*` | `/api/auth/*` (JWT, OTP, Google OAuth, reset) |
| `asServiceRole` | `serviceClient()` (RLS-bypassing entity client) |
| `secrets` (`base44:runtime`) | `src/secrets.ts` (env vars) |
| Backend functions | `src/functions/*` (same logic, ported) |
| Workflows | `src/scheduler.ts` (cron + Contest-create hook) |
| `integrations.Core.*` | `src/integrations/*` |

Tests: `npm test` (RLS engine). Typecheck: `npm run typecheck`.
