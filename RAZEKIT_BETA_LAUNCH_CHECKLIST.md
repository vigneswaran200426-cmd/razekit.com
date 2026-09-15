# RazeKit — Beta Launch Checklist

The gate list before RazeKit accepts real money from a real brand.

Every item is **checkable**: it names the command, query or exact screen that settles it, and the
condition that counts as passing. Nothing here reads "make sure it is good". An item that cannot be
checked is not an item — it belongs in "Still unverified" at the bottom, and several do.

All boxes are unticked. This document does not assert the state of production; the operator ticks a
box only after running the check.

---

## 1. Credentials rotated and set

Every secret that has ever been pasted into a chat window, a file, a screenshot or a ticket is
burned. Rotation means the provider issues a new value and the old one stops working.

- [ ] **Neon platform password rotated.** Check: Neon console → Roles → reset, update
      `DATABASE_URL` on `razekit-api` **and** `razekit-admin-api`. Pass: `GET /api/health` returns
      `{"ok":true}` after redeploy and the old string is refused.
- [ ] **Neon admin password rotated** (if `ADMIN_DATABASE_URL` is in use). Check:
      `cd server && npm run verify:split-db`. Pass: completes without error.
- [ ] **`JWT_SECRET` regenerated.** Check:
      `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`, set on both API
      services. Pass: an old session is rejected, a fresh sign-in works. This signs every user out,
      so do it before launch, not during.
- [ ] **Object storage keys rotated.** Check: issue a new `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`
      pair, set it, delete the old pair. Pass: a funding proof uploads and its signed URL opens.
- [ ] **UroPay test and production keys rotated.** Check: merchant dashboard, then
      `cd server && npm run verify:uropay`. Pass: the script reports the configured environment
      with no credential error.
- [ ] **Email provider key rotated** (`RESEND_API_KEY` or `SMTP_*`). Pass: a password-reset email
      arrives at a real inbox.
- [ ] **`GOOGLE_CLIENT_SECRET` rotated.** Pass: Google sign-in completes on the production domain.
- [ ] **`POLL_VOTE_SALT` set to a fresh random value.** Pass: present on `razekit-api` and not the
      development default.
- [ ] **No secret is in git.** Check:
      `git log -p | grep -iE "postgres://|uropay_(test|production)_(key|secret)|s3_secret"` and
      `git ls-files | grep -E "^\.env"`. Pass: both produce no output and `.gitignore` still blocks
      `.env`, `.env.*`, `*.local`.
- [ ] **`ADMIN_EMAIL` / `ADMIN_PASSWORD` removed after seeding.** Check: Render → Environment.
      Pass: both absent. They are only read by `npm run seed:admin`, which runs once.
- [ ] **Beta bank variables match the real account.** Check: open a funding page as a brand and
      compare `BETA_BANK_*` against the passbook digit by digit. Pass: exact match, and the admin
      funding list shows the masked form (`XXXXXX` + last five), never the full number.

## 2. UroPay production access granted

`uropayLive()` requires three things at once, and the code refuses to move real money on fewer.

- [ ] **Production access actually granted by UroPay, in writing.** Pass: production key and secret
      exist in the merchant dashboard and the account is marked live by the provider.
- [ ] **`UROPAY_ENV=production`, both production credentials set, `UROPAY_PRODUCTION_ENABLED=true`.**
      Check: `cd server && npm run verify:uropay`. Pass: reported as live. Production is opt-in
      twice by design — credentials alone do not enable it.
- [ ] **`UROPAY_BASE_URL` unset or `https://`.** Check: Render → Environment. Pass: unset (the
      pinned default applies) or https. A plain-http override is ignored by `uropayBaseUrl()`, but
      it should not be there at all.
- [ ] **One real end-to-end payment**, small amount, real person, real phone. Pass: the contest
      reaches `VERIFIED` funding, a `LedgerTransaction` exists with a matching idempotency key, and
      the money is visible in the bank account.
- [ ] **Webhook replay is harmless.** Check: ask UroPay to resend that order's webhook. Pass: no
      second ledger posting. A webhook is treated as a claim and triggers an authoritative status
      lookup, so this must hold.
- [ ] **Copy does not promise what the provider does not do.** Check:
      `grep -rniE "refund|payout|card" src/pages/FundContest.jsx src/components/UpiPayment.jsx`.
      Pass: no text implies the provider performs refunds, payouts or card payments — those are
      manual, reviewed bank transfers.

## 3. Legal pages reviewed by a professional

- [ ] **A qualified Indian professional has read `/terms`, `/privacy`, `/about`, `/contact`.**
      Pass: written sign-off naming the reviewer, the date and the version reviewed.
- [ ] **The open question already flagged in the product is settled.** `src/pages/Legal.jsx:402`
      states that how RazeKit should be characterised for regulatory purposes — in particular
      holding client funding in an ordinary business bank account — has not been reviewed against
      Indian payment-aggregator rules. Pass: that clause is either removed because it has been
      settled, or kept because it is still true. It must not be quietly deleted while open.
- [ ] **"Last updated" reflects the reviewed version.** Check: open `/terms`, compare with the
      sign-off date. Pass: they agree.
- [ ] **Prohibited claims are absent from the client bundle.** The denylist is the one already
      stated in `src/pages/Legal.jsx:10` and used in `src/components/Footer.jsx:77` — RazeKit is
      not a bank, not a holding-of-funds service, not a licensed payment institution, and payment
      is never described as automatic, immediate or certain. Check: grep `src/`
      case-insensitively for each term on that list. Pass: every hit is a negation inside a legal
      or disclaimer string; zero hits in marketing, funding or payout copy.
- [ ] **Support contact identical everywhere.** Check:
      `grep -rn "8608911369\|razekitchat@razekit.com" src/`. Pass: every occurrence resolves to the
      `SUPPORT` constant in `src/components/Footer.jsx` — `+91 8608911369`,
      `razekitchat@razekit.com`, `https://wa.me/918608911369` — with no second number or address.

## 4. Backup and restore rehearsed

- [ ] **A logical dump of both databases taken and stored off-provider.** Check: `pg_dump` per
      `RAZEKIT_RECOVERY_RUNBOOK.md` section 2. Pass: non-zero dump files stored outside the Neon
      account.
- [ ] **A restore actually performed into a scratch Neon branch.** Check: `pg_restore` into an
      empty database, then `SELECT entity, count(*) FROM records GROUP BY entity;` on both. Pass:
      counts match exactly and the wall-clock duration is written down. Until this is done, the
      runbook is a hypothesis.
- [ ] **The API boots against the restored database.** Pass: the startup log shows
      `Finance constraints: ok` (not the `NOT applied` variant) and `/api/health` returns ok.
- [ ] **Backup retention known and written down.** Check: Neon console → history/retention. Pass:
      the window is recorded in the runbook, replacing the "unconfirmed" note.
- [ ] **Object-storage versioning confirmed on both buckets.** Check: provider console. Pass:
      versioning enabled, or explicitly accepted as off with the consequence written down — a
      deleted proof is then unrecoverable.

## 5. Error monitoring live

Capture and alerting are different things and only one exists. Server errors are logged
(`console.error('[error]', err)` in `server/src/index.ts`, plus `unhandledRejection` and
`uncaughtException` handlers) and persisted with a short error id by `server/src/errors/capture.ts`.
**Nothing pages a human.** That is the gap this section closes.

- [ ] **Render health checks configured.** Check: `render.yaml` declares `/api/health` for
      `razekit-api` and `/api/system/health` for `razekit-admin-api`. Pass: both show healthy in
      the Render dashboard.
- [ ] **Persisted errors are readable by the operator.** Check: trigger a deliberate 500 on a
      staging deploy and note the id in the response. Pass: the id in the user-facing message, the
      log line and the stored record all match.
- [ ] **Log retention or a log drain configured for both API services.** Pass: an error logged
      today is still readable tomorrow from outside the Render log tail.
- [ ] **A human is alerted when the API goes down.** Check: uptime monitor against `/api/health`
      and the web origin. Pass: a paused service notifies the operator's phone within five minutes.
- [ ] **The finance-constraint warning is alertable.** Check: search the log drain for
      `Finance constraints NOT applied`. Pass: an alert rule exists on that exact string — it means
      duplicate protection has degraded to application level only.
- [ ] **Frontend errors reported, or accepted as invisible.** Check:
      `grep -rni "sentry\|errorreport" src/`. Pass: either a client reporter is wired up, or the
      operator records in writing that a React crash produces no signal.

## 6. Admin accounts secured

- [ ] **Every `role = 'admin'` account is enumerated and expected.** Check:
      `SELECT email, role, user_role, account_status FROM app_users WHERE role = 'admin';` Pass:
      every row is a person who should have it; no leftover test admins.
- [ ] **Admin passwords unique and long.** Pass: each comes from a password manager and is used
      nowhere else.
- [ ] **Finance permission grants reviewed.** Check: the admin console permission screen, or
      `SELECT data->>'user_id', data->>'permission', data->>'revoked_at' FROM records WHERE entity = 'AdminPermission';`
      Pass: every active grant is intended. Platform admins hold all finance permissions implicitly
      (`permissionsFor()` returns the full set for `role = 'admin'`), so limiting the number of
      platform admins is the real control.
- [ ] **Separation of duties understood as advisory, not enforced.** Check: read
      `SEGREGATION_PAIRS` in `server/src/finance/permissions.ts`. Pass: the operator has
      acknowledged that one person can both approve and confirm the same withdrawal, that this is
      flagged in the audit log rather than blocked, and that they accept it for the beta.
- [ ] **Rate limits in force on auth endpoints.** Check: `server/src/middleware/rateLimit.ts` —
      auth 10 per 5 min per IP, OTP 5 per 10 min, functions 120/min per user, tracking 120/min.
      Pass: eleven rapid failed logins from one IP return 429.
- [ ] **The admin console is not reachable on the product origin.** Check: open
      `https://razekit.com/admin` while signed out. Pass: redirected to sign-in, and
      `admin.razekit.com` answers only to its own API.

## 7. CORS locked to real origins

`server/src/config.ts` always allows a built-in first-party list and adds anything in
`CORS_ORIGINS`. The built-in list currently includes `http://localhost:5173` and `:5174`.

- [ ] **`CORS_ORIGINS` contains only real, current origins.** Check: Render → Environment, and the
      boot log line `CORS origins: ...`. Pass: no stale preview URL, no wildcard, no abandoned
      staging domain.
- [ ] **A foreign origin is refused.** Check:
      `curl -i -H "Origin: https://evil.example" https://<api-host>/api/health`. Pass: **no**
      `Access-Control-Allow-Origin` header in the response.
- [ ] **A first-party origin is allowed with credentials.** Check:
      `curl -i -H "Origin: https://razekit.com" https://<api-host>/api/health`. Pass:
      `Access-Control-Allow-Origin: https://razekit.com` and `Access-Control-Allow-Credentials: true`.
- [ ] **The localhost entries are a conscious decision.** Check: `corsOrigins` in
      `server/src/config.ts`. Pass: either removed for production, or a written note on why they
      stay. A developer machine cannot reach a user's session, but a permanently allowed localhost
      origin is still wider than production needs.
- [ ] **Admin API CORS set independently.** Check: `CORS_ORIGINS` on `razekit-admin-api`. Pass:
      lists `https://admin.razekit.com` and nothing from the product origin.

## 8. Money-path integrity

- [ ] **Finance constraints applied on production.** Check:
      `SELECT indexname FROM pg_indexes WHERE indexname LIKE '%uniq';` Pass:
      `ledger_txn_idempotency_uniq`, `funding_active_per_contest_uniq`,
      `funding_reported_reference_uniq` and `withdrawal_active_per_user_uniq` all exist.
- [ ] **`PAYMENT_MODE` is the mode you intend.** Pass: `MANUAL_BETA` (bank transfer verified by a
      person) or `GATEWAY`, and the funding page matches. `MAINTENANCE` stops new funding.
- [ ] **Verification scripts pass against production configuration.** Check:
      `cd server && npm run verify:payments && npm run verify:winner && npm run verify:reports`.
      Pass: all three complete without error.
- [ ] **A test payout to a real bank account**, small amount. Pass: the creator's balance moves
      from available to paid out, the ledger shows a `PAYOUT_PAID` debit, and the money is in the
      recipient's account.

---

## Still unverified at the time of writing

Stated plainly, because a checklist that hides its own gaps is worse than no checklist.

- **No restore has ever been performed.** Section 4 would be the first time.
- **Nothing alerts a human.** Server errors are captured and given an id, but there is no uptime
  monitor, no log drain and no paging rule. An outage is found when a user reports it.
- **No frontend error visibility.** A React crash produces a blank area and no signal anywhere.
- **No responsive testing.** No page has been opened at any target width on a device or in a
  simulator — see `RAZEKIT_MOBILE.md`, including the missing `viewport-fit=cover` that makes the
  safe-area padding inert on iOS.
- **No load testing.** Concurrency limits are unknown. The rate limiter is in-process and
  single-instance; scaling the API to two instances silently doubles every limit.
- **Separation of duties is not enforced.** One operator can approve and confirm the same
  withdrawal. It is flagged in the audit log, not blocked.
- **No second authentication factor exists** for admin accounts. A password is the whole control.
- **The regulatory question is open.** `Legal.jsx:402` says so in the product itself, and no
  professional has signed it off.
- **`DEPLOYMENT.md` is stale** — it still documents Razorpay and Stripe variables that no longer
  exist in the code. Use `RAZEKIT_RECOVERY_RUNBOOK.md` section 6 instead.
- **Provider capabilities are limited by design.** The UPI adapter collects payments; refunds and
  creator payouts are manual bank transfers performed and recorded by a person. No copy anywhere
  may imply otherwise.

Support, for anything on this list that needs a person:
+91 8608911369 / razekitchat@razekit.com / https://wa.me/918608911369
