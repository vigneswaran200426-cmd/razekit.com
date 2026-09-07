# RAZEKIT — MASTER PRODUCT WORKFLOW SYSTEM

Razekit is a set of connected **business workflows**, not a collection of pages.
Every workflow answers four questions on every screen:
**WHERE AM I? · WHAT HAPPENED? · WHAT DO I NEED TO DO? · WHAT HAPPENS NEXT?**

This document is the canonical workflow specification.
The machine-readable engine lives in `src/lib/workflows/` and the UI kit in `src/components/workflow/`.
Every workflow has: start point, actors, permissions, states, actions, validations, notifications, deadlines (where relevant), database source of truth, event transitions, success / failure / cancellation states, recovery path, and audit trail.

---

## ACTORS

| Actor | Can do | Must never |
|---|---|---|
| **CREATOR** | discover, participate, submit, edit draft, withdraw where allowed, view status, respond to revisions, upload winner content, review brand, manage profile | see another creator's private data |
| **BRAND** (internal value: `client`) | create, fund, publish, review, shortlist, select winner, pay, manage handover, approve winner content, review creator, manage brand profile | access contests they don't own |
| **VISITOR** | discover, view public contests, view public creators where allowed, view Winners Hub, register | receive private creator/brand data |
| **SUPPORT** | help search, support conversations, tickets, escalation | modify money, roles, winners, OTP, security |
| **ADMIN** | moderate, resolve, review, controlled overrides, audit | act without an audit entry |

Customer-facing UI says **Brand** and **Wallet** — never "Client" or "Funds".

## GLOBAL RULES

1. Every state has an **owner** (creator / brand / system / admin).
2. Every pending state has a **next action**.
3. Every failure state has **recovery**.
4. Every critical action is **auditable** (`AuditLog`: actor, role, action, timestamp, object, previous state, new state).
5. **Financial states come from the payment system** (Stripe webhook) — never from the frontend.
6. **Public content comes only from approved records.**
7. Users never see another user's private information (RLS enforced).
8. **No XP, no levels, no gamification.**
9. **No duplicate domain systems** — one source of truth per domain.
10. **No fake "completed" states** to hide unfinished work.

## SOURCE OF TRUTH PER DOMAIN (§25)

| Domain | Source of truth |
|---|---|
| Contest state | `Contest.status` |
| Submission state | `Submission.status` |
| Winner record | `Contest.winner_*` + `WinnerPublish` |
| Payment state | `PaymentTransaction` (Stripe webhook) |
| Handover state | `Handover.status` |
| Winner content | `WinnerPublish.status` |
| Review state | `Review.status` + `Review.verified` |
| Support state | `SupportTicket.status` |
| Enforcement | `AccountStanding` / `Warning` / `Report` / `AuditLog` |

**UI derives from these states.** The engine in `src/lib/workflows/index.js` is the single derivation layer.

---

## WORKFLOWS

### 01 · Account / Onboarding
- **Start:** Visitor chooses account type → Creator / Brand (Visitor may explore without onboarding).
- **Actors:** Visitor → system. **Permissions:** public registration; role gates everything after.
- **Flow:** choose type → register → verify (OTP) → profile setup → account ready.
  - Creator: name, profile, skills, specialization, portfolio, location, preferences.
  - Brand: brand name, logo, industry, description, website, team info.
- **States:** `visitor → registered → unverified → verified → profile_incomplete → ready`.
- **Rules:** auth state persists; incomplete onboarding is **resumable**; role controls access; no cross-role private data exposure.
- **Truth:** `User` (role), `UserProfile`, `AuditLog` (`account_created`, `role_assigned`).
- **Success:** role dashboard reachable. **Recovery:** resume where the user left off.

### 02 · Contest Creation
- **Start:** Brand opens Create Contest.
- **Flow:** Objective → Brief → Requirements → Deliverables → Prize → Eligibility → Submission rules → References → Footage/Assets → Handover requirement → Timeline → Review → **Save Draft / Continue**.
- **States:** `draft` (saved, resumable, previewable, editable, deletable).
- **Validation:** no contest becomes public before required validation succeeds (title, prize, deadline, funded state).
- **Notifications:** none until publish. **Truth:** `Contest` (`status: draft`).
- **Cancellation:** delete draft (brand-owned). **Audit:** draft created/updated/deleted on `Contest`.

### 03 · Contest Funding / Wallet
- **Start:** Brand sets prize → system calculates required amount (prize + platform fee) → wallet balance check.
- **States (wallet):** sufficient → **reserve** → ready to publish; insufficient → show balance / required / missing + **Add to Wallet** CTA.
- **Rules:** **Wallet = balance concept. Payment = transaction concept.** Never duplicate payment logic; financial state comes only from the Stripe webhook; balances are server-authoritative and ledger-backed (`PaymentTransaction`).
- **Success:** prize reserved, contest publishable. **Failure:** payment failed → retry Add to Wallet, contest stays draft. **Truth:** `Wallet` (`reserved_funds`), `PaymentTransaction`.
- **Audit:** every reservation has exactly one ledger entry.

### 04 · Contest Publishing
- **Start:** Draft → review → all required fields valid → prize secured → publish.
- **States:** `draft → open` (PUBLISHED→LIVE). Scheduled: `published → scheduled → live`. Supported ops: pause, cancel, extend deadline (recorded).
- **Events:** `contest.created, contest.funded, contest.published, contest.started, contest.closed`.
- **All state changes are auditable.** **Truth:** `Contest.status`.
- **Cancellation:** allowed from DRAFT/LIVE per business rules — handle prize reservation release, participant notifications, submission state, refund per existing policy.

### 05 · Creator Discovery + Participation
- **Start:** Creator discovers contests → opens contest → reads brief, requirements, references, prize, deadline → **Participate**.
- **States:** `discovered → participating`.
- **Rules:** the creator must clearly know what is required, deadline, allowed assets, submission rules, handover requirement — **no hidden requirements**. Footage access runs through the protected request → OTP → temporary session flow.
- **Notifications:** `contest_joined` (to brand). **Truth:** `Contest.status: joined`, `FootageAccessRequest`.

### 06 · Submission
- **Start:** Participating → create draft → upload media → title, description, required fields → preview → submit.
- **States:** `DRAFT → UPLOADING → SUBMITTED → UNDER_REVIEW → SHORTLISTED → NOT_SELECTED → WINNER` (entity enum: `working → uploading/processing → ready_to_review → submitted → under_review → shortlisted → won/lost/not_selected`).
- **Rules:** submissions are **immutable enough to preserve judging history**; revisions only via explicit versioning (`version`, new record — never overwrite history); withdraw where allowed.
- **Edge cases:** upload failure → retry/resume; double-click/network failure → idempotent submit keyed on contest+version. **Truth:** `Submission`.

### 07 · Submission Review / Judging
- **Start:** Brand opens contest → reviews submissions → inspects creative → evaluates → shortlists.
- **Rules:** **INTERNAL JUDGING is separate from PUBLIC REVIEW.** Judging data (ratings, notes, shortlist) never becomes public reputation data. No XP / levels / game points.
- **Support:** notes, scores where configured, status, shortlisting. **Notifications:** `submission.reviewed`. **Truth:** `Submission.rating`, `client_feedback`, `status`.

### 08 · Shortlist
- **Flow:** submitted → shortlisted → finalists → winner (e.g. 42 → 6 → 3 → 1), using real submission states.
- **Brand can:** view, compare, remove, restore if permitted, select finalist.
- **Finalist is clearly distinct from ordinary shortlist** (finalist = shortlisted + flagged in review; winner selection happens from finalists). **Truth:** `Submission.status: shortlisted` + review flags.

### 09 · Winner Selection
- **Start:** Brand opens finalists → compares → selects winner → **deliberate confirmation**.
- **After:** `WINNER_SELECTED` → create winner record (contest, submission, creator, brand, placement, prize) on `WinnerPublish` (idempotent, keyed on contest) + `Contest.winner_*` denormalized.
- **Do not publish public winner content** unless configuration explicitly permits direct publishing.
- **Auto-updates (§29):** winner record created → creator notified → brand tracker updated → creator dashboard updated → payment flow triggered → winner content flow prepared → activity timeline updated.
- **Notifications:** `winner.selected` → `winner_announced`. **Truth:** `WinnerPublish`, `Contest.winner_user_id`.

### 10 · Winner Payment
- **Start:** after winner selection, check required payment state.
- **States:** `PENDING → PROCESSING → PAID`; possible `FAILED`, `REFUNDED`.
- **Rules:** use existing payment infrastructure only; payment confirmed only by the Stripe webhook → `PAYMENT_CONFIRMED`; **never tell the creator payment is complete before the system confirms it**.
- **Notifications:** `payment.completed` → `payment_received`. **Truth:** `PaymentTransaction`, `Wallet`.
- **Recovery:** FAILED → retry path with preserved audit; REFUNDED per policy.

### 11 · Account Handover *(only when contest requires handover)*
- **States:** `HANDOVER_REQUIRED → REQUESTED → CREATOR_RESPONSE → VERIFICATION → TRANSFER → BRAND_CONFIRMATION → COMPLETED` (entity: `not_started → initiated → in_progress → winner_confirmed → client_confirmed → completed | expired | disputed`, 24h deadline).
- **Each actor sees only their required actions.** Creator: provide/transfer required info. Brand: review/confirm. System: verify completion (two-party confirmation).
- **Never merge payment and handover into one state.** **Notifications:** `handover.requested/completed`. **Truth:** `Handover` + append-only `event_log`. **Recovery:** expired → re-initiate; disputed → §23.

### 12 · Winner Content
- **Start:** after winner selection and required payment state → `WINNER_CONTENT_REQUEST` created.
- **Creator:** upload winning content → title → description → thumbnail → preview → submit.
- **States:** `REQUESTED → UPLOADING → SUBMITTED → CLIENT_REVIEW → REVISION_REQUESTED → REVISION_SUBMITTED → APPROVED → PROCESSING → PUBLISHED` (entity: `winner_selected → content_requested → submitted_for_approval → revision_requested → approved → processing → published`).
- **Notifications:** each transition notifies the other party. **Truth:** `WinnerPublish`.

### 13 · Winners Hub Auto-Publish
- **Flow:** `APPROVED → PROCESSING → PUBLISHED`. System creates the public Winners Hub entry populated **from existing source data** (creator, brand, contest, prize, placement, media, category, description, date) — **no manual duplication**.
- **Idempotent:** the same event running twice must never create two winner pages (keyed on `contest_id`).
- **After publish, auto-update:** creator profile, brand profile, Winners Hub, leaderboard (verified winners only), notifications (`winner_content.published`).
- **Never publish before required brand approval.** Private media goes public only during approved processing. **Truth:** `WinnerPublish.status: published` + public URLs.

### 14 · Creator Reputation / Reviews
- **Start:** after a qualifying completed interaction, both sides become eligible.
- **Flow:** `Eligible → Review Requested → Review Submitted → Published`; possible `Reported → Moderated → Removed`.
- **Rules:** real interactions only; two-sided (creator ⇄ brand); one review per direction per contest; reviewed party may append ONE reply, never edit ratings/text; **no XP / levels / gamified reputation**; display rating, verified reviews, wins, projects, earnings.
- **Truth:** `Review` (`verified` set only by the trusted post-completion flow). **Moderation:** admin-only state transitions.

### 15 · Brand Reputation
- Built from completed contests, creator reviews, successful collaborations — mirrors creator review logic exactly. **Never expose private internal judgments.** **Truth:** `Review` (`reviewer_role: creator`).

### 16 · Brand Contest Tracking
- **Brand opens contest:** Overview → **Current Action** → Timeline → Submissions → Shortlist → Winner → Payment → Handover → Winner Content → Completion.
- **Auto-updates from real events:** submission received → count up; reviewed → reviewed count up; winner selected → winner section activates; payment completed → status updates; creator uploads → winner content status updates; brand approves → publishing begins; published → contest moves toward completion.
- **Rendered by** `deriveContestWorkflow()` + `WorkflowTimeline` / `CurrentActionCard`.

### 17 · Creator Dashboard Tracking
- **Priority order:** Your Next Action → Active Contests → Upcoming Deadlines → Submission Status → Wins → Earnings → Reviews → Recommended Contests → Recent Activity.
- **Adapts to state:** draft exists → Continue Submission; shortlisted → View Shortlist Status; winner → Upload Winner Content; awaiting approval → View Status; completed → View Winning Work.
- **Rendered by** `creatorNextAction()` + `CurrentActionCard`.

### 18 · Notifications
- Every major business event generates a notification that **links directly to the required action** (deep links in `src/lib/notification-utils.js`; event catalog in `src/lib/workflows/events.js`).
- Events: `contest.published, submission.created, submission.reviewed, submission.shortlisted, winner.selected, payment.completed, handover.requested, handover.completed, winner_content.requested, winner_content.uploaded, winner_content.revision_requested, winner_content.approved, winner_content.published, review.created, support.escalated`.
- **Truth:** `Notification` (recipient-owned, RLS). No isolated notification logic.

### 19 · Messaging
- Messaging is **contextual** and stays connected to its business object: contest, submission, winner, handover (e.g. `HandoverMessage` in the protected two-party handover room). Never lose business context.

### 20 · Help
- **Flow:** Help → ask a question → context-aware, validated answer → optional product action · Helpful: resolved · not helpful / asks for a human / repeats the same answer → **HUMAN ESCALATION** → ticket `RK-SUP-XXXXXX` → full conversation context sent to `support@razekit.com`.
- **UI says:** Help · Contact Support — **never** "AI Assistant / AI Bot / Razekit Support / Help Center / Support Center".
- **Never include credentials, OTPs, or payment secrets** in tickets, transcripts, or emails. **Truth:** `SupportTicket`.

### 21 · Post-Contest Completion
- A contest is **not** automatically completed at winner selection. Completion depends on required stages: Winner · Payment · Handover (if required) · Winner Content · Winners Hub.
- **Then:** `COMPLETED` → final contest summary (winner, prize, submissions, creators, payment, handover, Winners Hub, reviews). **Truth:** `Contest.status: completed`.

### 22 · Cancellation
- Allowed where business rules permit: `DRAFT → CANCELLED`, `LIVE → PAUSED/CANCELLED`. **No illegal transitions.**
- Handle: unused prize reservation release, participant notifications, submission state, refund logic per existing policy, audit trail. **Do not invent financial policy.**

### 23 · Dispute / Exception Handling
- Controlled exception path for: payment dispute, winner dispute, handover dispute, submission issue, account issue, fraud report.
- **AI or normal users can never bypass controlled workflows.** Sensitive issues route to Support / Admin (`Report`, `FraudAlert`, `SupportTicket` with category `dispute`). Enforcement stays server-authoritative (`AccountStanding`, `Warning`).

### 24 · Admin / Moderation
- Admin can inspect: contests, submissions, winners, payments, handovers, winner content, reviews, support tickets.
- Moderation states: `ACTIVE → FLAGGED → UNDER_REVIEW → RESTRICTED → REMOVED`. **Every admin action is auditable** (`AuditLog`).

---

## EVENT ARCHITECTURE (§26)

Canonical domain events live in `src/lib/workflows/events.js`. Each event carries: label, owner, notification type, recipient, and deep link. New features must emit catalogued events — no ad-hoc notification logic.

## DEADLINE MANAGEMENT (§28)

Deadlines exist for: contest submission, review, winner selection, creator response, handover (24h), winner content upload, brand approval. Display a deadline **only when relevant**, with timezone support; **every deadline change is recorded** on the owning record.

## EDGE CASES (§33)

Every workflow handles: browser close, network failure, duplicate request, double click, refresh, session expiry, upload failure, payment failure, notification failure, email failure, partial completion, race conditions, concurrent actions. **Winner selection, payment, and publishing are idempotent.**

## WORKFLOW UI KIT (§32)

| Component | Status |
|---|---|
| `WorkflowTimeline`, `CurrentActionCard`, `StateBadge`, `DeadlinePill` | `src/components/workflow/` (new) |
| `StatusPill`, `Timeline`, `ProgressStepper`, `EmptyState`, `ErrorState`, `SuccessState`, `KpiCard`, `GlassCard`, `GradientCard` | `src/components/ui/` (existing — reuse, do not duplicate) |

Every workflow UI shows: **CURRENT STATE · WHAT HAPPENED · YOUR ACTION · WHAT HAPPENS NEXT** — `CurrentActionCard` is the standard carrier.

## TESTING (§37)

Per workflow: happy path, failure path, permission test, duplicate-action test, refresh test, mobile test, boundary test.
**Critical end-to-end master flow (§38):** Visitor → Discover → Brand creates → funds → publishes → Creators discover → participate → submit → Brand reviews → shortlist → winner selected → payment → handover (if required) → winner content → brand approval → Winners Hub → creator profile → brand profile → reviews → contest completed.

## ACCEPTANCE CRITERIA (§41)

A workflow is complete only when: state transitions work · permissions work · backend source of truth works · frontend reflects backend state · notifications work · errors are handled · retries are safe · audit trail exists · mobile works · security works · tests pass · connected workflows update correctly.