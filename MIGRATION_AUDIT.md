# RazeKit — Base44 Migration Audit (factual dependency audit, no changes made)

**Scope:** complete read-only scan of the exported repository at `Downloads/razekit`.
**Rule honored:** nothing deleted, redesigned, or modified. This is an inventory only.
**Headline:** RazeKit is **deeply and structurally dependent on Base44** — data model, auth, database access, storage, server functions, scheduled/event workflows, email, LLM, and image generation all run on Base44 primitives. It **cannot** be removed until every item in sections B–F is rebuilt. It is **not** a frontend-only app.

Repo shape: React 18 + Vite 6 SPA (frontend) + `base44/` backend package (entities, functions, shared TS, workflows) + Base44 SDK glue.

---

## How the app touches Base44 (the 6 coupling surfaces)

1. **SDK client** — `src/api/base44Client.js` calls `createClient()` from `@base44/sdk`; every feature imports `base44` from it. **600 call-sites across 117 files.**
2. **Direct browser→DB access** — `base44.entities.<Entity>.filter/get/create/update/delete` called *directly from the browser*. Authorization is enforced by **Base44 RLS** declared in each `base44/entities/*.jsonc` (all 52 entities carry an `rls` block). There is no REST/GraphQL API layer of your own — the SDK + RLS *is* the API.
3. **Auth** — `base44.auth.*` (session, OAuth, email/password, OTP register, password reset, `updateMe`). Base44 is the identity provider and session authority.
4. **Platform integrations** — `base44.integrations.Core.*`: `SendEmail`, `InvokeLLM`, `GenerateImage`, `UploadFile`, `UploadPrivateFile`, `CreateFileSignedUrl`. These are Base44-hosted services holding the real vendor credentials.
5. **Server functions** — `base44/functions/*/entry.ts` run on the Base44 Deno runtime, using `createClientFromRequest(req)`, `base44.asServiceRole` (RLS-bypassing DB), and `secrets` from `base44:runtime`.
6. **Workflows** — `base44/workflows/*.jsonc`: one entity-trigger (Contest create) + two schedules (hourly money reconciliation, 6-hourly visual-asset maintenance). This is Base44's job scheduler.

Build glue: `@base44/vite-plugin` (`vite.config.js`) injects HMR/analytics/visual-edit + legacy `@/entities` import aliases. `base44/config.jsonc`, `base44/mcp/config.json` (`auth: oauth`), and `index.html`'s `media.base44.com` favicon/OG images are platform-bound.

---

## A. What can be deployed immediately outside Base44 (frontend-only, no backend calls)

Deployable to any static host (Vercel/Netlify/Cloudflare/S3) **as UI**, but non-functional until the backend (B/C) exists, because the data layer is Base44.

| Group | Files | Notes |
|---|---|---|
| Design system / primitives | all of `src/components/ui/*` (accordion, dialog, button, table, chart, sidebar, toast…) | Pure Radix/Tailwind. Zero Base44. |
| Presentational components | `src/components/**` that receive props only (e.g. `ui/*`, most `campaign/*` section cards, `winner/*` display cards, `xp/*` visuals, `workflow/StateBadge|DeadlinePill|WorkflowTimeline`) | Render-only; safe. |
| Pure client libs | `src/lib/` logic with **no** `base44` import: `money.js`, `motion.js`, `contest-utils.js`, `submission/*` (platforms/requirements/state-machine), `role-utils.js`, `enforcement-config.js`, `workflows/events.js`, `workflows/index.js`, `xp/badges|badge-visuals|leaderboard|quality*(compute parts)`, `i18n/translations.js`, `social-platforms.js`, `social-providers.js` (interface only), `support-knowledge.js`, `campaign-brief.js`, `handover-utils.js`, `notification-utils.js` (deep-link builder) | Verify each has no `@/api/base44Client` import before trusting. |
| Static/config | `tailwind.config.js`, `postcss.config.js`, `components.json`, `eslint.config.js`, `src/index.css`, `src/utils/index.ts` (`createPageUrl`) | Safe. |
| Brand | `src/components/brand/RazekitLogo.jsx` | Safe (locked brand asset). |
| Routing shell | `src/App.jsx`, `src/main.jsx` (routing itself is React Router) | Safe, but wraps auth/data that is Base44. |

**Caveat:** "deployable" ≠ "working". None of these produce a usable product without B/C. Also `index.html` and generated contest art currently load from `media.base44.com`.

---

## B. What still depends on Base44 (must be migrated before Base44 can be removed)

### B1 — Auth (`base44.auth.*`) — identity & sessions
| File | Base44 API |
|---|---|
| `src/lib/AuthContext.jsx` | `auth.me`, `analytics.track`, `auth.redirectToLogin`, `auth.logout`; raw `createAxiosClient` → `/api/apps/public/...` |
| `src/pages/Login.jsx` | `auth.loginViaEmailPassword`, `auth.loginWithProvider` |
| `src/pages/Register.jsx` | `auth.register`, `auth.verifyOtp`, `auth.setToken`, `auth.me`, `auth.updateMe`, `auth.resendOtp`, `auth.loginWithProvider` |
| `src/pages/ForgotPassword.jsx` / `ResetPassword.jsx` | `auth.resetPasswordRequest`, `auth.resetPassword` |
| `src/pages/OAuthConsent.jsx` | `auth.isAuthenticated` |
| `src/lib/onboarding-utils.js`, `EditProfile.jsx`, `i18n/I18nContext.jsx` | `auth.updateMe` |
| ~30 pages/components | `auth.me` for the current user + role |

### B2 — Database via direct browser SDK (`base44.entities.*`) — the largest surface
Direct entity CRUD from the browser, gated only by Base44 RLS. Representative heavy call-sites: `src/lib/enforcement-utils.js` (23), `AdminTrust.jsx` (19), `winner-publish.js` (16), `EditProfile.jsx` (15), `xpSystem.js` (14), `SubmitWork.jsx` (13), `PostDetail.jsx` (12), `ContestDetail.jsx` (12), `Review.jsx` (11), `CreatorDashboard.jsx` (11), `onboarding-utils.js` (13), `support-context.js` (10), `SecureFootageSection.jsx` (10). Present in **117 files total**.

### B3 — Platform integrations (`base44.integrations.Core.*`)
| Integration | Used in |
|---|---|
| `SendEmail` | `onboarding-utils.js`, `help-assistant.js`, `footage/FootageApprovalPanel.jsx` (×2), `footage/SecureFootageSection.jsx`, `wallet/ReceiptModal.jsx` |
| `InvokeLLM` | `pages/Help.jsx` (help assistant), `lib/xp/quality.js` (submission quality), `lib/enforcement-utils.js` (moderation triage) |
| `GenerateImage` | `base44/shared/visual/provider.ts` (contest artwork engine) |
| `UploadFile` | `AccountStanding.jsx`, `EditProfile.jsx`, `visual-assets/client.js`, `ReportModal.jsx`, `ResourcesSection.jsx`, `BasicInfoSection.jsx`, `CreateCommunityPostModal.jsx`, `CreatePostModal.jsx`, `OnboardingField.jsx` |
| `UploadPrivateFile` | `winner/WinnerContent.jsx` (×3), `submission/workspace/FinalCreativeSection.jsx` (×2), `SourceFilesSection.jsx`, `PlatformFieldInput.jsx` |
| `CreateFileSignedUrl` | `winner-publish.js`, `Results.jsx`, `Review.jsx`, `FinalCreativeSection.jsx` (×3), `WinnerMedia.jsx`, `WinnerPublishTimeline.jsx` |

### B4 — Backend server functions (`base44.functions.invoke`) — Base44 Deno runtime
Called from the frontend: `paymentQuote`, `paymentCreate`, `paymentConfirm` (`FundContestModal.jsx`, `ContestFinancialsPanel.jsx`), `visualAssetRequest` / `visualAssetAdmin` (`visual-assets/client.js`), `payoutCreate` (admin). All nine functions in `base44/functions/*` use `createClientFromRequest`, `asServiceRole`, and `secrets`.

### B5 — Analytics (`base44.analytics.track`)
`AuthContext`, `Help.jsx`, `Login.jsx`, `SubmitWork.jsx`, `SocialTracker.jsx`, `WinnerDetail.jsx`, dashboards, `RoleRoute.jsx`, submission workspace. Non-critical; can be stubbed or repointed.

### B6 — Build/platform glue
`@base44/vite-plugin` in `vite.config.js`; `src/lib/app-params.js` (reads `access_token`/`app_id` Base44 injects); `base44/config.jsonc`; `base44/mcp/config.json`; `index.html` `media.base44.com` assets.

---

## C. Backend services that need to be recreated

| Base44 capability | What it does today | Replacement to build |
|---|---|---|
| **Entities DB + RLS** | 52 tables, per-row auth in `entities/*.jsonc` | Postgres (Supabase/Neon) with row-level security **or** an API service enforcing the same rules. Every RLS block must be re-expressed. |
| **Data API** | SDK talks entities directly from browser | Either (a) Supabase client + RLS (closest 1:1), or (b) your own REST/GraphQL API + auth middleware. Choice determines how much of B2's 117 files change. |
| **Auth/identity** | sessions, OAuth (Google), email+password, OTP register, password reset | Auth provider: Supabase Auth / Auth0 / Clerk / custom. Must supply `me`, `updateMe`, OAuth, OTP, reset. `User.role`/`user_role` mapping must be preserved. |
| **Server function runtime** | 9 Deno functions with service-role DB + secrets | Node/Deno/edge functions (Supabase Edge Functions, Cloudflare Workers, or a small server). Needs a **service-role DB client** (RLS bypass) and a **secrets** store. |
| **Job scheduler** | 3 workflows: 1 entity-trigger + 2 schedules | Cron (hourly `moneyReconciliation`, 6-hourly `visualAssetWorker maintain`) + a DB trigger/queue for "Contest created → generate artwork". |
| **Object storage + signed URLs** | `UploadFile`/`UploadPrivateFile`/`CreateFileSignedUrl` + media CDN | S3/R2/Supabase Storage with public + private buckets and signed URL issuance. Note `shared/visual/storage.ts` is currently a **pass-through** (stores the source URL); real storage must be implemented on migration. |
| **Email** | `SendEmail` | Resend / SES / Postmark. |
| **LLM** | `InvokeLLM` (help, moderation triage, quality) with `response_json_schema` | Anthropic/OpenAI server-side call preserving JSON-schema responses. |
| **Image generation** | `GenerateImage` (contest artwork) | Server-side image API (OpenAI Images / Replicate / etc.). `shared/visual/provider.ts` is already an isolated seam — reimplement that one interface. |
| **Analytics** | `analytics.track` | PostHog/Segment/none. |
| **Public settings endpoint** | `/api/apps/public/.../public-settings/by-id/...` in `AuthContext` | Replace with your own config endpoint or inline config. |

---

## D. What data needs migration

All **52 entities** (each has data + an RLS policy). Export from Base44, load into the new DB, and **re-implement each RLS rule**. Grouped:

- **Identity/profile:** User, UserProfile, UserContact, UserPreference, TermsAcceptance
- **Money (critical, ledger-backed):** Wallet, WalletLedgerEntry, Payment, PaymentQuote, PaymentTransaction, Payout, PayoutAccount, WithdrawalRequest, MoneyRule, ReconciliationRecord, ProviderWebhookEvent, Fund, FundsTransaction
- **Contest core:** Contest, Submission, Comment, Review
- **Winner/handover:** WinnerPublish, Handover, HandoverMessage
- **Footage security:** ContextFootage, FootageAccessRequest, FootageAccessLog, DownloadLog, DownloadSession, OtpVerification
- **Trust & safety:** AccountStanding, Warning, Report, FraudAlert, FraudInvestigation, AuditLog, SupportTicket
- **Reputation/gamification:** CreatorStats, PublicCreatorStats, MonthlyLeaderboard, BadgeAward, XpTransaction
- **Community/feed:** Post, PostLike, PostSave
- **Social tracking:** SocialConnection, SocialPost, SocialCampaignPost, SocialMetric
- **Visual assets:** VisualAsset, VisualGenerationJob
- **Comms:** Notification

**Money data requires special care:** the ledger (`WalletLedgerEntry`) is append-only and balances are derived from the last entry (`shared/money/ledger.ts`). Migration must preserve ordering, `balance_after_minor`, and references, or balances break. Reconcile against provider truth after cutover.

---

## E. Environment variables / secrets required

**Frontend (Vite, `VITE_`)** — currently:
- `VITE_BASE44_APP_ID`, `VITE_BASE44_APP_BASE_URL`, `VITE_BASE44_FUNCTIONS_VERSION` (Base44 — retire post-migration)
- `VITE_SOCIAL_LIVE` (gates social OAuth UI; currently off)
- `BASE44_LEGACY_SDK_IMPORTS` (build flag in `vite.config.js`)

**Server secrets** consumed today via `secrets.get()` in `shared/money/router.ts`:
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

**New secrets you'll need to add** when replacing Base44 integrations:
- Database URL + service-role key
- Auth provider keys + OAuth (Google) client id/secret
- Email provider API key + from-address (`support@razekit.com` per WORKFLOWS.md §20)
- LLM API key (Anthropic/OpenAI)
- Image-generation API key
- Object storage keys + bucket names (public/private) + signing secret
- (When social goes live) per-provider OAuth apps: Instagram, YouTube, TikTok, Facebook, LinkedIn, X

---

## F. External integrations that need reconnecting

| Integration | Status in code | Action |
|---|---|---|
| **Razorpay** (Payment Gateway + Route payouts, INR) | Fully implemented server-side, `https://api.razorpay.com/v1` (`shared/money/providers/razorpay.ts`); browser loads `checkout.razorpay.com/v1/checkout.js` in `FundContestModal.jsx` | Re-host functions; re-register **webhook URL** → `<newhost>/functions/moneyWebhook?provider=razorpay`; move keys to new secrets. Provider code itself is portable (plain `fetch`). |
| **Stripe** (Checkout USD + Connect payouts) | Fully implemented, `https://api.stripe.com/v1` (`shared/money/providers/stripe.ts`) | Same: re-register webhook → `?provider=stripe`; move `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`. Note: Global/USD market is not enabled yet (Contest defaults `settlement_region: IN`, `currency: INR`). |
| **Email** | via Base44 `SendEmail` | Repoint to ESP. |
| **LLM** | via Base44 `InvokeLLM` | Repoint to Anthropic/OpenAI. |
| **Image gen** | via Base44 `GenerateImage` | Repoint provider seam. |
| **Google OAuth** | via Base44 `loginWithProvider('google')` | Register your own Google OAuth app in the new auth provider. |
| **Social platforms** (IG/YouTube/TikTok/FB/LinkedIn/X) | **Interface only** — `SOCIAL_LIVE=false`, no live calls (`social-providers.js`) | Not a current Base44 dependency; a *future* build. Needs OAuth apps + server sync worker. |

Provider `fetch` code (Razorpay/Stripe) is standard and portable; the coupling is only the surrounding `createClientFromRequest`/`asServiceRole`/`secrets` runtime.

---

## G. Exact migration order (dependency-safe, Base44 stays live throughout)

1. **Stand up the database.** Create the 52 tables; re-express every `entities/*.jsonc` RLS policy. Do a **test data export/import** from Base44 (no cutover yet).
2. **Stand up auth.** Sessions, Google OAuth, email/password, OTP register, password reset, `me`/`updateMe`; preserve `role`/`user_role`. Provide the same shape `AuthContext.jsx` expects.
3. **Build the data-access layer.** Decide Supabase-client-with-RLS (minimal frontend change) vs. your own API. Create a thin `base44Client`-shaped adapter so the 117 call-sites keep working during transition.
4. **Object storage + signed URLs.** Public + private buckets; implement `UploadFile`/`UploadPrivateFile`/`CreateFileSignedUrl` equivalents and the real `shared/visual/storage.ts`.
5. **Function runtime + secrets.** Re-host the 9 functions; wire `RAZORPAY_*`/`STRIPE_*`; keep `asServiceRole`-equivalent service client.
6. **Money last-mile.** Re-register Razorpay + Stripe **webhooks** at the new host; verify `moneyWebhook`, `paymentConfirm`, `payoutCreate`, `moneyReconciliation` end-to-end in test mode; validate ledger integrity after import.
7. **Integrations.** Email (ESP), LLM, image-gen provider seam, analytics.
8. **Scheduler.** Cron for `moneyReconciliation` (hourly) + `visualAssetWorker maintain` (6h); DB trigger/queue for Contest-created → artwork.
9. **Build glue.** Remove `@base44/vite-plugin`; replace `app-params.js` token handling; rehost `media.base44.com` assets in `index.html`.
10. **Cutover.** Freeze writes on Base44 → final data export/import → repoint DNS/env → smoke-test the §38 master flow (create→fund→submit→winner→payout→handover→winner content→hub) → decommission Base44.

Money (steps 5–6) is the highest-risk gate — do it in provider **test mode** with reconciliation running before any real cutover.

---

## H. Estimated technical risk by subsystem

| Subsystem | Risk | Why |
|---|---|---|
| **Payments / wallet / ledger / payouts** | 🔴 **Critical** | Real money; append-only ledger with derived balances; provider webhooks + idempotency + reconciliation; INR/USD markets. Any migration error is a financial correctness bug. |
| **Auth & sessions** | 🔴 **High** | OAuth + OTP + reset + role mapping; every protected route and `asServiceRole` ownership check depends on identity being exactly right. |
| **Database + RLS (all 52 entities)** | 🔴 **High** | Browser has direct DB access — RLS *is* the security boundary. A missed/loosened policy = data exposure (this trust boundary was previously flagged and hardened; must not regress). |
| **Server functions + secrets runtime** | 🟠 **Medium-High** | Portable logic, but depends on service-role DB semantics + secret injection that must be reproduced faithfully. |
| **Storage / signed URLs (private footage, winner content)** | 🟠 **Medium-High** | Private media + OTP-gated footage; signed-URL semantics and access logging must match. `storage.ts` pass-through means real storage is *net-new* work. |
| **Workflows / scheduler** | 🟠 **Medium** | Only 3 jobs, but the money reconciliation sweep is a safety net — it must run reliably. |
| **Email / LLM / image gen** | 🟡 **Low-Medium** | Isolated seams; degrade gracefully; repointing is contained. |
| **Analytics** | 🟢 **Low** | Non-critical; can stub. |
| **Frontend UI / design system** | 🟢 **Low** | Framework-standard; main churn is swapping the data/auth client underneath. |
| **Social tracking** | 🟢 **Low (today)** | Not wired to Base44; future build, not a migration blocker. |

---

## Conclusion

**Base44 cannot be removed yet.** Confirmed hard dependencies remain across: auth (B1), direct-DB access + RLS on all 52 entities (B2/C/D), 6 platform integrations (B3), 9 server functions + secrets runtime (B4), storage/signed-URLs, the workflow scheduler, and build-time plugin/token glue (B6). Only presentational UI, pure client libs, and static config (section A) are Base44-free — and none of that is a working product without the backend rebuild in B–F. Follow the order in G, treat payments and RLS as the critical-risk gates, and keep Base44 running until the §38 end-to-end flow passes on the new stack.
