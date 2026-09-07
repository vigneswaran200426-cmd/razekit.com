# RAZEKIT — SHARED PRODUCT CONTEXT

> Read this file BEFORE making any major change. Every agent defers to this file for product truth.
> If this context is ambiguous: inspect the existing implementation first. Do not silently invent business logic.

## Product Vision

Razekit is a premium creator-economy marketplace where Brands host prize-funded creative contests and Creators compete, win, get paid, and build real professional reputation.

Product philosophy (preserve in every decision):

Opportunity → Competition → Creative Work → Winning → Payment → Reputation → Showcase → Growth

Razekit must feel like a premium global technology product: minimal, clean, blue, modern, trustworthy, high-value.

## Roles (customer-facing)

| Role | Internal value | Description |
|---|---|---|
| **CREATOR** | `user_role: 'creator'` / `'editor'` | Video editor: discovers contests, creates work, submits, competes, wins, earns |
| **BRAND** | `user_role: 'client'` | Business: creates contests, funds prizes, reviews submissions, selects winners |
| **VISITOR** | unauthenticated | Discovers contests, creators, and winning work only — never private data |
| ADMIN | `role: 'admin'` | Internal. Manage users, payments, footage security, support, enforcement |
| SUPPORT | internal function | Help & Support operations. Never a customer-facing "role" label |

Role changes are admin-only. Never self-assign or client-escalate roles.

## Terminology (STRICT)

Customer-facing words:

- **Brand** — never "Client" in UI
- **Wallet** — never "Funds" as wallet terminology
- **Reviews, Rating, Wins, Projects, Earnings** — reputation language
- **Help, Help & Support, Razekit Support, Contact Support** — never "AI Assistant", "AI Bot", "AI Copilot"

FORBIDDEN in customer-facing UI:

- "Client", "Funds" (as wallet terminology)
- XP, Level, Level Progress, gamified experience points, fake badges
- Gaming aesthetics

Technical identifiers (role keys like `client_id`, entity names like `FundsTransaction`, the `/funds` route) are internal implementation — do not rename casually; renaming requires an Architect-approved migration.

## Core Flows

**BRAND:** create contest → define brief → requirements → references → footage/assets → fund prize → publish → receive submissions → review → shortlist → select winner → complete payment → handover (when required) → winner content workflow → approve winner content → Winners Hub publication → completed campaign.

**CREATOR:** discover contest → review brief → participate → create work → save draft → submit → review wait → shortlist → winner OR not selected → payment (when applicable) → handover (when applicable) → upload winning content → brand approval → Winners Hub publication → receive reviews → build reputation.

## Contest Lifecycle (source of truth: `Contest.status`)

`draft → open → paused → joined → working → submitted → reviewing → winner_selected → completed`

Optional stages (do NOT force unnecessary steps):

- Handover: only when `handover_required` / `post_winner_action` is set. Otherwise skip.
- Winner content workflow: if the existing winning submission can be the final public media, skip additional upload. Required winner-content workflow includes upload + brand approval.
- `delivery_status` on Contest/Submission tracks final asset delivery: `pending → deliverable → delivered`.

## Winner Publishing Lifecycle (source of truth: `WinnerPublish.status`)

`winner_selected → content_requested → submitted_for_approval → revision_requested → approved → processing → published → archived`

Rules:

- One `WinnerPublish` record per contest (idempotent — key on `contest_id`, never duplicate).
- Never publish before required brand approval.
- Never duplicate submission/media systems — reuse the winning Submission's assets where possible.

## Handover Lifecycle (source of truth: `Handover.status`)

`not_started → initiated → in_progress → winner_confirmed → client_confirmed → completed | expired | disputed`

Two-party room: contest Brand + winning Creator only. `event_log` is append-only audit.

## Payment Rules

- Stripe is the only payment provider (INR, settlement region IN).
- Prize funding = prize + platform fee + processing fee; all money math is server-side.
- Payment is ONLY confirmed via a verified Stripe webhook. Frontend never marks payment successful.
- `Wallet` balances (available / pending / reserved) are server-authoritative — NEVER client-writable. Mutations go through a trusted backend function using the single-ledger-insert-as-source-of-truth pattern (`PaymentTransaction` ledger).
- Payouts: creators withdraw from Wallet; withdrawal requests processed server-side.
- All financial operations must be auditable via the transaction ledger.

## Reputation Rules

- NO XP. NO LEVELS. NO artificial gamification.
- Reputation comes from: verified interactions, completed work, real wins, real projects, real reviews, real earnings.
- Two-sided verified review system (`Review` entity): BRAND reviews CREATOR and CREATOR reviews BRAND — only after a completed interaction (contest/payment/collaboration), one review per direction per contest.
- Internal contest judging (submission ratings, shortlists) is SEPARATE from public reviews.
- Reviews may be moderated (hidden/removed) by admins only; the reviewed party may append one reply but never edit ratings.

## Security Rules

- Row-Level Security (RLS) on every entity is the enforcement backbone.
- A visitor must never receive private creator/brand data.
- A creator must never access another creator's private data.
- A brand must only access contests they are authorized to manage.
- Footage protection: raw Google Drive links never exposed before authorization (access request → brand approval → OTP → temporary download session).
- Never expose passwords, tokens, OTPs, or payment credentials in UI, logs, or support transcripts.

## Support Rules

- Customer-facing: Help, Help & Support, Razekit Support, Contact Support. AI may power first-line assistance but must not dominate or brand the experience.
- Dissatisfaction protocol: AI attempts reasonable resolution → customer remains dissatisfied → stop repetitive AI behavior → create a support ticket with complete context → escalate to support@razekit.com including ticket ID, customer, email, role, category, priority, related contest/submission/payment (where authorized), AI summary, full transcript, and escalation reason.
- Never include passwords, tokens, or payment credentials in tickets, transcripts, or emails.

## Design System (summary — Design System Agent owns details)

- Palette: Ice `#EAF5FF` ground, Sky `#DCF8FF`, Cyan highlight `#77D8FF`, Action `#1A7BF8`, Deep `#0B48E8`, Navy `#0C2444` text, Muted `#5F7597`, Complete `#12684A`, Warning `#D78C05`.
- Typography: Sora (headings/display), Manrope (body).
- Light, premium, confident, creator-economy, high-value. Controlled gradients, subtle glass (sparingly — not every card translucent), fine borders, soft shadows.
- Avoid: excessive glassmorphism, generic AI dashboard patterns, gaming aesthetics, unnecessary charts, visual clutter.

## Source-of-Truth Records (key entities)

Users/UserProfile/UserContact · Contest · Submission · WinnerPublish · Handover / HandoverMessage · Wallet / PaymentTransaction / WithdrawalRequest · Review · Notification · Post / Comment / PostLike / PostSave · SupportTicket · FootageAccessRequest / DownloadSession / OtpVerification · Report / Warning / AccountStanding / AuditLog · PublicCreatorStats

Before adding any model, search for an existing equivalent. Prevent duplicate contest, user, payment, media, and notification systems.

## Implementation Rule

Before changing code: (1) inspect existing structure, (2) components, (3) models, (4) APIs, (5) workflows, (6) identify reusable systems, (7) identify risks, (8) implement the smallest correct change, (9) test, (10) review. Do not rewrite working code because another architecture looks cleaner.

## Collaboration Model

Cross-domain task order: **Architect → Product UX → domain agent → Design System → Frontend/Backend → Security → QA**. Agents do not independently redefine product requirements, roles, states, terminology, or navigation — defer to this file.