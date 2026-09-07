# RazeKit Master Redesign — Operational & Production Systems Addendum

This document is the authoritative addendum to the full RazeKit redesign specification. It covers systems that sit between primary screens and must be audited, redesigned where needed, and implemented without changing the core contest-based marketplace model.

## Operating Principles

- Preserve the contest/prize/submission/winner/payment/handover business model.
- Preserve working business logic, data relationships, payment integrations, agents, workflows, and permissions unless a production fix is necessary.
- Prefer real backend-authoritative data over mocks or decorative UI.
- Build shared components and state patterns instead of page-specific one-offs.
- Treat financial, rights, identity, moderation, and irreversible workflow actions as high-trust surfaces.
- Make every state explain what happened, why, who acts next, and what happens next.

## Systems 46–126

### 46–52: Identity, onboarding, account and workspace

Audit progressive onboarding for creators and clients with required/optional indicators, progress, save/continue, safe skip, recovery, payout/payment setup, verification, and language. Audit identity verification states: not verified, pending, verified, failed, expired, retry. Add practical profile-completion guidance without gamification. Audit account management, sessions/devices, logout-all, deactivation, deletion, email/phone/password changes, and confirmation for sensitive actions. Where multiple roles/workspaces exist, clearly expose the active context and enforce correct navigation, data, and permissions. Where organizations exist, support team members, ownership, roles, permissions, invitations, billing responsibility, and contest-management permissions. Invitations need sent/pending/accepted/expired/revoked states.

### 53–58: Communication, contest change management and versioning

Messaging should be contextual to contests and identities, support unread/read state, attachments, timestamps, system messages, and action messages. Contest questions should distinguish official client announcements, pinned clarifications, answers, and ordinary communication. Audit edit/change permissions across draft, published, submissions received, deadline, winner selected, and completed states. Sensitive changes such as prize, deadline, requirements, or winner count must show warnings and audit who/when/what changed. Contest lifecycle controls must support appropriate states including draft, scheduled, live, paused, extended, ending, closed, under review, winner selected, completed, cancelled, and expired, with clear reason, actor, impact, payment impact, and next step. Deadline displays must include exact cutoff, timezone, local representation, and countdown, and backend/frontend timezone rules must remain consistent. Support version history where required for contest briefs, requirements, submissions, files, and handover information.

### 59–60: Files and media processing

Audit upload progress, multiple files, large files, validation, retry, replace/delete, preview, download permissions, storage failures, secure access, and video processing. Explicitly represent uploading, processing, ready, and failed states. Video/media surfaces should expose thumbnails, duration, playback state, and processing errors. Do not present processing assets as ready.

### 61–65: Moderation, reports, disputes, refunds and prize funding

Audit moderation for content/user reports, spam, abuse, inappropriate content, fraud indicators, duplicate submissions, malicious files, and suspicious accounts. Use states such as reported, under review, cleared, restricted, removed. Support report/block where applicable with clear post-report expectations. Design a structured dispute workflow: issue raised → evidence → review → response → decision → resolution → closed, showing parties, evidence, deadlines, owner, timeline, and resolution. Refund states must be backend-authoritative. Where prize funding functions as secured funding, distinguish funding initiated, successful, funds secured, prize available, reserved, released, refund initiated, and refund completed. Never label every state simply “paid.”

### 66–70: Finance, tax, currency, payment synchronization and idempotency

Transaction detail should include transaction ID, date, amount, currency, fee, net, contest, payment method, status, reference, refund and payout information where relevant. Audit invoices, receipts, GST/tax/billing/business detail support without hardcoded tax assumptions. Currency formatting must be explicit and backend-authoritative. Audit payment synchronization for success, failure, cancellation, duplicate/delayed webhooks, partial failure, network interruption, closed payment windows, and payment success with stale frontend state. Frontend must recover from backend truth rather than relying only on client callbacks. Protect contest creation, payment attempts, payout requests, winner selection, submission finalization, handover confirmation, notifications, and workflow execution against duplicate actions.

### 71–72: Audit history and activity timelines

Record important operational actions with actor, action, timestamp, entity, and result/status. Important objects such as contests should have understandable chronological timelines: created → funded → published → submissions → deadline → review → finalists → winner → payment → handover → complete.

### 73–80: Search, persistence, personalization and analytics

Global search should support suggestions, recent searches, filters, sorting, creators, contests, categories, winners, posts, and projects. Handle no results, partial matches, practical misspellings, loading, and large result sets. Persist useful search/filter/sort/tab/pagination state across navigation. Creator recommendations must be based on real available data/logic, not fake AI. Meaningful save/follow/watch actions may be added only when backed by real functionality. Referral systems should exist only where actual attribution/reward/fraud logic exists. Client and creator analytics should emphasize useful operational metrics rather than vanity charts. Admin analytics should cover operational health such as user activity, contest volume/completion, prize volume, platform revenue, payment/payout failures, disputes, moderation, and workflow failures. Track meaningful product events consistently.

### 81–86: Feature flags, maintenance, network recovery, autosave and confirmations

Use feature flags when needed for safe rollout and role-based availability. Do not expose unfinished capabilities as complete. Define useful maintenance behavior for payment, storage, video, workflow, and database outages. During intermittent network failure, protect important user input, especially contest creation, submission, upload, and payment flows. Long forms should autosave, show save state/last saved time, recover drafts, and warn before losing changes. Critical actions must use deliberate confirmation: publish/cancel contest, select winner, release payment, delete submission/account, confirm handover, withdraw funds. Destructive actions must be differentiated from routine save/confirm actions.

### 87–90: Accessibility and internationalization

Deep-audit keyboard-only navigation, tab order, focus trapping, escape behavior, labels, validation, screen-reader semantics, reduced motion, touch targets, text resizing, and zoom. Internationalization must be architectural: translation keys, date/number/currency/timezone handling, pluralization, long strings, and RTL preparedness where relevant. Localization must correctly handle locale-sensitive date/time/number/currency/country/language content. Public pages need metadata, Open Graph, social sharing, canonical URLs, structured data where appropriate, and privacy-safe indexing.

### 91–97: Deep links, permissions, security, abuse prevention, fraud, rights and legal acceptance

Every important entity/workflow should have stable direct URLs and reliable refresh/deep-link behavior. Build a real permission matrix across visitor, creator, client, team member, admin, and system for view/create/edit/delete/review/approve/pay/select/release/handover/moderate. Backend authorization—not merely hidden buttons—must enforce permissions. Audit authentication, authorization, sessions, file permissions/private URLs, payment data, API exposure, input validation, rate limiting, abuse prevention, secrets, role escalation, and insecure object references. Protect login, submissions, contest creation, payments, payouts, messaging, notifications, and other expensive operations from abuse. Fraud signals can inform review but must not automatically punish users based on weak evidence. Make submission rights, usage rights, ownership, transfer status, and handover status explicit. Track legal acceptance where required for terms, contest rules, privacy, rights/licensing, payment, and handover.

### 98–105: Transactional communication, scheduling, workflow recovery and observability

Audit transactional events such as welcome, verification, contest publication/ending, submission receipt/selection, winner, payment/payout, handover, disputes, and security alerts. Preferences should allow appropriate control over email/in-app/marketing and contest updates while preserving mandatory security/payment notifications. Actionable emails must deep-link directly to the correct workflow. Audit cron/scheduled jobs for contest expiry, leaderboard timing, reminders, payouts, handover reminders and scheduled notifications with timezone awareness. Agents/workflows must expose running/completed/failed/retrying/paused/cancelled states and safe retry behavior without duplicate execution. Production observability should cover application, API, payment, workflow, upload, auth, and performance failures. Monitor page load, API latency, large media, dashboard, search, and review performance. Use error boundaries so one failing subsystem does not crash unrelated product functionality.

### 106–110: Mobile, tablet, tokens, iconography and content design

Perform a dedicated mobile redesign for critical workflows, not merely a responsive shrink. Recompose contest creation/details, submission/upload, media viewing, payments, winner selection, handover, messaging, feed, profiles, and settings for touch and one-hand use where practical. Create intentional tablet breakpoints for dashboards, tables, review tools, management, and finance. Audit the codebase for arbitrary hardcoded spacing/radii/type/shadows/colors/breakpoints and consolidate into shared tokens. Use one coherent icon family and consistent sizing. Audit product wording and establish consistent terminology for contest/campaign/job/project and related concepts; remove developer-facing language and ambiguous CTAs.

### 111–118: Empty states, first-use guidance, contextual help, support, tickets, admin operations and privacy

Every empty state should explain what is empty, why, and what to do next. Provide lightweight first-time guidance only where it removes genuine uncertainty. Add contextual help for funding, submission requirements, handover, payment statuses, contest rules and rights. Audit the help center, FAQs, support entry points, issue reporting and contextual support. Where applicable support tickets with category, priority, status, conversation, attachments, resolution and history. Admin operations should safely investigate users, contests, submissions, payments, payouts, disputes, moderation, handover cases, workflows, agents, notifications and audit history without creating unsafe bypasses. Audit user data export, deletion, privacy controls and retention behavior. Critical data should have recoverability awareness for contests, submissions, winners, transactions, handover and audit records.

### 119–120: API contracts and state machines

Audit every major frontend/backend contract for required fields, null handling, loading, error states, pagination, sorting, permissions, validation and legal status transitions. Complex workflows should use explicit state-machine thinking for contest, submission, winner, payment, payout, handover, dispute, refund and workflow states. Reject impossible transitions and require authorized recovery flows for exceptional cases.

### 121–126: End-to-end journeys, real-data audit, route/action audit and final quality gate

Test real creator, client, failed-payment, failed-upload, dispute and mobile journeys end-to-end. Audit production-facing surfaces for hardcoded names, fake stats, fake rankings, mock submissions, fake payments, fake notifications, fake workflow results, and other demo data. Audit every route for existence, authorization, correct data, back navigation, refresh, deep links and mobile behavior. Audit every button/action: navigate, submit, save, open, filter, download, or trigger a real action. Remove disguised placeholder controls. Final quality gates are full UI, UX, responsive, accessibility, security, data/API, payment, workflow, agent, contest lifecycle, submission, winner, handover, finance, notification, moderation, dispute, error-state, mobile and performance audits. Fix issues found where possible; do not merely report them.

## Definition of Done

RazeKit is complete only when the whole product feels like one system, every major user journey works, important states are explained, financial and ownership actions are trustworthy, contest/submission/winner/handover state is correct, agents and workflows are genuinely connected, payment synchronization is authoritative, permissions are enforced, mobile works, error recovery works, real data flows through the UI, and no important interaction is fake or left half-finished.
