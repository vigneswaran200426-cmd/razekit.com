# RazeKit — Deployment Guide (GitHub → Vercel + Render + Neon)

Target architecture (domain connected **later** via Wix DNS — not now):

```
Frontend  →  Vercel        →  https://razekit.com        (React/Vite, this repo root)
Backend   →  Render        →  https://api.razekit.com     (server/, Node/Express)
Database  →  Neon Postgres →  (already provisioned)
```

Nothing here touches DNS, the domain, or Base44.

---

## Repository layout
- **Frontend root**: repo root (`/`) — `package.json`, `vite.config.js`, `src/`, builds to `dist/`.
- **Backend root**: `server/` — its own `package.json`, builds to `server/dist/`.
- **Base44 export** (`base44/`): kept for reference/data-compatibility. Not deployed.

## Frontend → Vercel
| Setting | Value |
|---|---|
| Root Directory | `/` (repo root) |
| Framework preset | Vite |
| Install command | `npm install` |
| Build command | `npm run build` |
| Output directory | `dist` |
| SPA routing | handled by `vercel.json` (rewrites all paths to `/index.html`) |

**Vercel environment variable:**
| Name | Example | Notes |
|---|---|---|
| `VITE_API_URL` | `https://api.razekit.com` | The deployed backend URL. Inlined into the client bundle — **not a secret**. Until the backend has a domain, use the Render URL (e.g. `https://razekit-api.onrender.com`). |

## Backend → Render
Blueprint `render.yaml` is included (Root Directory `server`, build `npm install && npx prisma generate && npm run build`, start `npm start`, health check `/api/health`).

**Backend environment variables:**
| Name | Required | Example / notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon connection string (`?sslmode=require`) |
| `JWT_SECRET` | ✅ | long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `API_BASE_URL` | ✅ | this backend's public URL |
| `WEB_BASE_URL` | ✅ | the frontend URL (e.g. `https://razekit.com`) — used for OAuth/reset redirects |
| `CORS_ORIGINS` | ✅ | comma-separated allowed frontend origins (e.g. `https://razekit.com,https://www.razekit.com`) |
| `NODE_ENV` | ✅ | `production` |
| `STORAGE_DRIVER` | ⬜ | `local` (dev) or `s3` (prod — set `S3_*`) |
| `EMAIL_DRIVER` + `RESEND_API_KEY`/`SMTP_*` | ⬜ | else emails log to console |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | ⬜ | Google sign-in |
| `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` | ⬜ | INR payments |
| `STRIPE_SECRET_KEY/WEBHOOK_SECRET` | ⬜ | USD payments |
| `LLM_DRIVER` + `ANTHROPIC_API_KEY` | ⬜ | help/moderation/quality |
| `IMAGE_DRIVER` + `OPENAI_API_KEY` | ⬜ | contest artwork |

After the first backend deploy, run once (Render Shell or locally against the prod DB):
```
npm run db:push && npm run seed:money && npm run seed:admin
```
Register the payment webhooks at `<API_BASE_URL>/api/webhooks/money?provider=razorpay` and `...=stripe`.

## Security
- Real secrets live only in `server/.env` (gitignored). `.gitignore` blocks `.env`, `.env.*`, `*.local`, `node_modules`, `dist`, `_storage`, `_import`; only `*.env.example` templates are committed.
- `VITE_*` values are public (bundled) — never put a secret in a `VITE_` var.

## What is intentionally NOT done
No DNS/Wix changes, no custom domain added to Vercel, no Base44 changes/deletion, no domain reconnection.
