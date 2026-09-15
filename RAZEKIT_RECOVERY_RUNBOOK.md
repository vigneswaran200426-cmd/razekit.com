# RazeKit — Recovery Runbook

What this document is: where RazeKit's state actually lives, and the steps to bring it back.

What it refuses to do: claim a procedure works. Almost nothing here has been rehearsed against
production. Every step is written from the code that creates the state, not from a drill. Read
"What we have NOT tested" before you trust any of it during an incident.

Support, if you need a human while doing this:
+91 8608911369 / razekitchat@razekit.com / https://wa.me/918608911369

---

## 1. What state lives where

### 1a. Neon platform database — `DATABASE_URL`

The product. `server/prisma/schema.prisma` defines exactly three tables:

| Table | Holds |
|---|---|
| `records` | Every app entity as a JSONB document: `id`, `entity`, `data`, `created_by_id`, timestamps |
| `app_users` | Identity and credentials: email, `password_hash`, `role`, `user_role`, `account_status`, `google_id`, `profile` JSONB |
| `auth_otps` | Short-lived register/reset codes. Losing these costs users one retry, nothing more |

`records` is the whole domain: Contest, Submission, ScoreSnapshot, TrackingLink, ContestFunding,
WithdrawalRequest, LedgerTransaction, LedgerEntry, AuditLog, Notification, WinnerVerification,
ScoringConfig and the rest. There is no separate money database — `entities/routing.ts` explains
why: finance writes its audit rows inside the same `withTransaction` as the ledger postings, so the
audit trail cannot be separated from the money it describes.

Balances are **not stored state**. `server/src/finance/balances.ts` replays ledger entries on every
read. Restore the ledger and the balances come back with it; if a cached read-model row and the
ledger ever disagree, the ledger is right.

### 1b. Neon admin database — `ADMIN_DATABASE_URL` (optional)

`server/src/db.ts` creates a second Prisma client only when this is set; otherwise `adminPrisma`
**is** the platform client and everything lives in one database. Only three entities route here
(`ADMIN_DB_ENTITIES` in `entities/routing.ts`): `TrustReport`, `EnforcementAction`,
`AdminPermission`. Same three-table shape.

Losing this database loses trust-and-safety history and finance permission grants. It does not lose
money, winners or contests.

### 1c. Object storage — `STORAGE_DRIVER`

`server/src/integrations/storage.ts` has two drivers: `local` (files under `./_storage`, dev only)
and `s3` (any S3-compatible store — the code is provider-agnostic and is pointed at Cloudflare R2
through `S3_ENDPOINT`). `render.yaml` sets `STORAGE_DRIVER=s3` for the API service.

Two buckets, `S3_BUCKET_PUBLIC` and `S3_BUCKET_PRIVATE`. Known private-object prefixes, built by
`storagePrefix()` from server-owned ids only:

- `payments/<contestId>/funding/<fundingId>/proof/<uuid>_<name>` — a brand's transfer proof
- `payments/config/manual-beta/upi-qr/v<N>/<uuid>_<name>` — each version of the collection QR

Keys are `randomUUID()`-prefixed, so an upload never overwrites an existing object.
`server/src/functions/paymentSettings.ts` records `retained: true` when a QR is superseded — old
versions are kept, not replaced. Database rows store only pointers (`file_uri`, `storage_path`);
the bytes are only in the bucket. Restoring the database does **not** restore a lost object.

### 1d. Not stored anywhere that needs recovery

Sessions are JWTs signed with `JWT_SECRET`. Rotating that secret signs everyone out — an
inconvenience, not data loss. There is no server-side session table and no cache tier.

---

## 2. Taking a Neon backup

There is **no scheduled backup job in this repository**. Whatever protection exists today is Neon's
own point-in-time history on the project, configured in the Neon console, and nobody has confirmed
its retention window in writing. Treat that as an open item, not as a backup.

A manual logical dump, run from a machine that can reach Neon:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --file=razekit-platform-$(date +%F-%H%M).dump
# only if a second project is configured:
pg_dump "$ADMIN_DATABASE_URL" --format=custom --no-owner --file=razekit-admin-$(date +%F-%H%M).dump
```

Dump the two databases separately — they are separate Neon projects and a dump of one is not a
backup of the other. Store the result outside the Neon account: a dump sitting inside the provider
it protects covers corruption, not account loss.

## 3. Restoring a Neon backup

Preferred, when the damage is recent and the cause is known (a bad script, a wrong `db push`): use
Neon's point-in-time restore / branch-from-timestamp in the console, then repoint `DATABASE_URL` at
the restored branch. Faster than a logical restore, and the connection string keeps its shape.

From a logical dump instead:

```bash
# into an EMPTY database. Never restore over live rows.
pg_restore --no-owner --clean --if-exists --dbname="$TARGET_DATABASE_URL" razekit-platform-<stamp>.dump
```

Then, before letting traffic in:

1. `SELECT entity, count(*) FROM records GROUP BY entity ORDER BY 2 DESC;` — compare against what
   you expect. A short `LedgerEntry` count is the one that matters most.
2. Restart the API. `ensureFinanceConstraints()` runs on boot and recreates the partial unique
   indexes (see section 5); watch the log line.
3. Run the verification scripts in section 8.

## 4. Recovering object storage

The application never deletes objects — there is no delete call in `storage.ts` and no cleanup job.
The realistic loss cases are: the bucket was deleted, the credentials were rotated without updating
the service, or the store itself lost data.

- **Credentials or endpoint wrong.** Symptom: uploads fail and signed URLs 403 while the database
  still lists every proof. Fix the `S3_*` env vars and redeploy. No data recovery needed.
- **Objects genuinely gone.** Bucket versioning or a provider snapshot is the only route back.
  Whether versioning is enabled on the real buckets is **unverified** — check the provider console
  before assuming it.
- **What survives regardless.** Every funding record keeps `storage_path`, the reported bank
  reference, the amount and the verifying admin's audit row. A lost proof image does not lose the
  fact that a payment was verified or who verified it — only the evidence attached to it. Record
  that loss in the audit trail rather than re-uploading a reconstruction.

Signed URLs are short-lived by design (900s at every call site). An expired link is not an incident.

## 5. Migrations and rollback

RazeKit does **not** use Prisma migration history. There is no `prisma/migrations` directory and no
`_prisma_migrations` table. `server/package.json` exposes `db:push` (`prisma db push`), and
`render.yaml` runs only `prisma generate` at build time — schema changes are applied by a human
running `npm run db:push` against the target database.

Consequences: there is **no `prisma migrate resolve` rollback** — undoing a schema change means
pushing a corrected schema forward or restoring from section 3; `prisma db push` can drop columns,
so never run it with `--accept-data-loss`; and because entity fields live inside `records.data`
(JSONB), most product changes need no schema change at all. Schema pushes should be rare, and each
one is worth a fresh dump beforehand.

Separately, `ensureFinanceConstraints()` in `server/src/db.ts` creates five objects at every boot,
idempotently (`CREATE ... IF NOT EXISTS`):

- `ledger_txn_idempotency_uniq` — one posting per idempotency key
- `funding_active_per_contest_uniq` — one live funding request per contest
- `funding_reported_reference_uniq` — one live funding request per bank reference
- `withdrawal_active_per_user_uniq` — one open withdrawal per creator
- `records_entity_status_idx` — queue performance only

A failure here does not stop the boot; it logs
`Finance constraints NOT applied — duplicate protection is application-level only`. After any
restore, grep the startup log for that line. If you see it, duplicate protection is weaker than the
code assumes and you should fix it before accepting money.

## 6. Environment variables to restore, and where they come from

Set on the Render service (`razekit-api`); `render.yaml` marks every secret `sync: false`, so none
of these are in git and none can be recovered from this repository.

| Variable | Source | If missing |
|---|---|---|
| `DATABASE_URL` | Neon platform project | API cannot serve anything |
| `ADMIN_DATABASE_URL` | Neon admin project (optional) | Admin entities silently fall back to the platform DB |
| `JWT_SECRET` | Generated; kept in the owner's password manager | Production boot **fails** (`config.ts` requires it); a new value signs everyone out |
| `API_BASE_URL`, `WEB_BASE_URL` | The deployed URLs | OAuth and reset redirects break |
| `CORS_ORIGINS` | Extra origins beyond the built-in first-party list | Preview/staging origins blocked; first-party origins still work |
| `STORAGE_DRIVER`, `STORAGE_PUBLIC_BASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE` | Object storage provider console | Uploads and signed URLs fail |
| `EMAIL_DRIVER`, `RESEND_API_KEY` or `SMTP_*`, `EMAIL_FROM` | Email provider | Notifications still persist; only the email copy is lost — `emit.ts` treats email as best-effort |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google Cloud console | Google sign-in only |
| `PAYMENT_MODE`, `BETA_FUNDING_VERIFICATION_HOURS`, `BETA_SUPPORT_PHONE`, `BETA_SUPPORT_EMAIL` | Operational choice | Defaults to `MANUAL_BETA` and 24h |
| `BETA_BANK_ACCOUNT_NAME`, `BETA_BANK_NAME`, `BETA_BANK_BRANCH`, `BETA_BANK_ACCOUNT_NUMBER`, `BETA_BANK_IFSC`, `BETA_BANK_UPI_ID` | The bank account itself | Funding instructions render empty; brands cannot pay |
| `UROPAY_ENV`, `UROPAY_TEST_KEY`, `UROPAY_TEST_SECRET`, `UROPAY_PRODUCTION_KEY`, `UROPAY_PRODUCTION_SECRET`, `UROPAY_PRODUCTION_ENABLED`, `UROPAY_VPA`, `UROPAY_VPA_NAME` | UroPay merchant dashboard | Provider flow refuses to run (`uropayConfigured()` false, 503). Test and production credentials never fall back to each other |
| `POLL_VOTE_SALT` | Generated | Poll vote hashing changes if the value changes |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Used once by `npm run seed:admin` | Only needed to create the first admin |
| `ENABLE_SCHEDULER` | Operational choice | Visual-asset maintenance cron stops (`scheduler.ts`) |

Frontend (`razekit-web`, static): `VITE_API_URL` only — compiled into the bundle, not a secret.
Never put anything secret behind a `VITE_` name. Admin console (`admin-razekit` repo):
`DATABASE_URL` (the same platform string), `ADMIN_DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`,
`PLATFORM_API_URL`, and the static site's own `VITE_API_URL`.

## 7. Order to bring services back up

1. **Neon platform database.** Confirm it accepts connections and the row counts look right.
2. **Neon admin database**, if configured. The API boots without it, but the console will then
   write admin rows into the platform database — a silent, confusing state to be in.
3. **Object storage.** Buckets exist, credentials work, endpoint is right.
4. **`razekit-api`.** Health check `/api/health`. Read the startup log: CORS origin list, and the
   finance-constraints line.
5. **`razekit-admin-api`.** Health check `/api/system/health`.
6. **`razekit-web`** and **`admin-razekit.com`** static sites. These are just bundles; deploy them
   last so nobody lands on a UI whose API is not ready.
7. **Sign in as an admin and confirm the finance queues load before announcing recovery.**

Frontends last, on purpose: a working UI in front of a broken API invites users to start actions
that will fail halfway.

## 8. Verification after a restore

Read-only scripts already in `server/`:

```bash
npm run verify:split-db      # admin/platform routing is doing what it claims
npm run verify:payments      # beta manual payment invariants
npm run verify:winner        # winner finalization path
npm run verify:reports       # report surfaces
npm run verify:admin         # admin console expectations
npm run verify:uropay        # provider adapter wiring
```

These check invariants in code paths. **None of them is a restore test.** Passing them after a
restore tells you the application is consistent with itself, not that no rows were lost.

## What we have NOT tested

An untested restore procedure is a hypothesis, not a runbook. The honest list:

- **No restore has ever been performed.** Not to a scratch database, not to staging. Sections 3 and
  4 are written from the schema and the storage code, not from an execution.
- **No backup schedule exists in this repository.** Neon's built-in history may or may not be
  configured with a useful retention window; nobody has recorded what it is.
- **Recovery time is unknown.** No RTO, no RPO, no measured dump or restore duration at any size.
- **Object-storage versioning is unconfirmed.** If the buckets have no versioning, section 4 has no
  recovery path at all, only an honest loss.
- **The two-database restore has never been exercised together.** In particular, nothing has tested
  restoring the platform database to an older point while the admin database stays current — that
  combination can leave enforcement actions referencing users who no longer exist.
- **`prisma db push` has not been tested as a forward fix on a restored database.**
- **No incident has happened.** Every ordering claim in section 7 is reasoning, not experience.

## Known limitations

- Rollback of a schema change is restore-only. There is no migration history to step back through.
- A lost private object cannot be reconstructed from the database; only its metadata survives.
- Secrets exist solely in the Render dashboard and whatever the owner keeps privately. If both are
  lost, `JWT_SECRET` can be regenerated (everyone signs out), but the payment provider and storage
  credentials must be reissued by their providers.
- `DEPLOYMENT.md` in this repository is stale: it still lists Razorpay and Stripe variables that no
  longer exist anywhere in the code, and a webhook registration step for them. Use the table in
  section 6, not that file.
