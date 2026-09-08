# RazeKit Master Redesign — Audit Matrix

This matrix turns the master redesign requirements into implementation and QA work. It is an audit checklist, not a claim that every item is already complete.

| Area | Primary UX target | Data/logic audit | QA focus |
|---|---|---|---|
| Onboarding | Progressive role-aware setup | Required fields, resume state, role | New creator/client happy + skip paths |
| Identity/verification | Explain why verification is required | Verification backend states | Pending/failed/retry/expired |
| Account/security | Centralized account controls | Session, password, email/phone, deletion | Sensitive-action confirmation |
| Workspace/team | Explicit active role/workspace | Membership + permission enforcement | Cross-role leakage prevention |
| Messaging | Contextual contest conversations | Read/unread, attachments, notification events | Deep links + unread state |
| Contest communication | Official clarifications distinct from chat | Announcement persistence | Creator visibility + pin/update |
| Contest lifecycle | Explain each state and next action | Valid state transitions | Pause/cancel/extend/expire |
| Time/deadlines | Exact local time + timezone + countdown | Backend cutoff authority | India + DST + midnight |
| Versioning | Visible history for important edits | Version records | No silent overwrite |
| Files/media | Trustworthy upload/processing UI | Storage + permissions | Retry, large files, secure access |
| Moderation | Clear report/review outcomes | Enforcement states | Abuse/duplicate/malicious file cases |
| Disputes | Evidence → decision workflow | State machine + audit | Payment/winner/handover disputes |
| Refunds/prize funding | Explicit financial states | Provider/webhook authority | Failure/delay/duplicate events |
| Transactions | Detailed transaction view | Backend amounts/status | Currency/fee/net correctness |
| Tax/business docs | Market-flexible records | GST/tax/business data | Receipts/invoices |
| Payments | Provider-backed state synchronization | Razorpay/Route as applicable | Webhook recovery + idempotency |
| Audit/timeline | Entity history humans can understand | Actor/action/result records | Chronology + permissions |
| Search | Fast, filtered, persistent discovery | Search source + pagination | Empty/partial/large results |
| Personalization | Real-data recommendations only | Recommendation inputs | No fake AI |
| Save/follow/watch | Lightweight useful actions | Backend persistence | State survives navigation |
| Analytics | Decision-useful metrics | Event integrity | No fake metrics |
| Feature flags | Safe rollout | Role/flag enforcement | Unfinished features hidden |
| Network/autosave | Prevent lost work | Draft persistence | Offline/interruption recovery |
| Confirmation/destructive | Consequence-aware confirmation | Server-side authorization | Double-submit protection |
| Accessibility | Keyboard, focus, semantics, touch | Component semantics | Zoom/resize/reduced motion |
| i18n/localization | Architecture-level language support | Translation/date/number/currency/timezone | Long strings + RTL preparedness |
| SEO/public | Strong public discovery | Privacy-safe metadata | Canonicals/OG/deep links |
| Permissions/security | Backend-enforced capability model | Role matrix + object authorization | Escalation/IDOR/rate-limit checks |
| Rights/legal | Explicit ownership/license context | Acceptance records | Winner/handover rights visibility |
| Notifications/email | Actionable messages | Real event triggers | Deep links + preferences |
| Scheduled jobs | Reliable time-based automation | Cron/worker state | Timezone + retry + duplicates |
| Agents/workflows | Real execution visibility | Trigger/action/log backend contract | Running/fail/retry/cancel |
| Observability/errors | Isolated failures + useful recovery | Error telemetry | Error boundaries + dependency failures |
| Mobile/tablet | Recomposition, not shrinkage | Responsive behavior | Critical workflows end-to-end |
| Admin | Safe operational control | Admin authorization + audit | No unsafe bypasses |
| Privacy/recovery | User control + recoverability | Export/delete/retention + backup awareness | Data integrity |
| State machines | Impossible transitions blocked | Explicit transition guards | Contest/submission/winner/payment/payout/handover/dispute/refund/workflow |

## Required end-to-end journeys

1. Creator: account → onboarding → discover → contest → join → draft/upload → submit → review/result → winner → handover → payment → showcase.
2. Client: account → onboarding → create draft → fund → publish → submissions → review → shortlist → winner → payment → handover → completion.
3. Failed payment: initiate → provider failure → recovery → retry → authoritative funding confirmation.
4. Failed upload: upload → failure → retry → processing → ready → submit.
5. Dispute: issue → evidence → review → decision → resolution.
6. Mobile: repeat the highest-value creator and client paths on mobile.

## Definition of done

Do not mark complete because the pages are visually improved. Complete only after UI, UX, responsive, accessibility, security, data/API, payments, workflows, agents, contest lifecycle, submissions, winners, handover, finance, notifications, moderation, disputes, error states, mobile, and performance have been audited and discovered issues fixed where feasible.
