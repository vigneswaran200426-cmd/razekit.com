# RazeKit — Full Platform Redesign v1

## Product direction

RazeKit remains a prize-funded creative contest marketplace. The redesign changes the experience, information architecture, visual language, interaction design, responsive behavior, and presentation without removing or replacing the contest, submission, judging, winner, payout, handover, profile, feed, agent, workflow, or role systems.

## Core product loop

Creator: Discover → Join → Create → Submit → Review → Win → Get Paid → Showcase

Client: Create → Fund → Launch → Manage → Review → Select Winner → Pay → Handover → Complete

## Global shell

- One shared design system across public, creator, client, and admin surfaces.
- Desktop uses a clean top navigation as the default application shell; contextual secondary navigation lives inside workflows.
- No permanent decorative sidebar dominating the product.
- Mobile recomposes complex workflows rather than shrinking desktop layouts.
- Global search, notifications, account controls, role-aware quick actions.
- Admin is visually and structurally separated from creator/client product experiences.

## Shared visual system

- Light premium ground with subtle blue depth.
- White structural surfaces, fine borders, restrained shadows.
- 8px small / 12px medium / 16px large structural radii; pills reserved for true compact status/category controls.
- Strong but restrained typography; dense information hierarchy.
- Media-first composition for contests, submissions, portfolio, winners, and feed.
- Clear primary/secondary/destructive action hierarchy.
- Consistent status vocabulary: draft, pending, live, submitted, reviewing, shortlisted, finalist, winner, payment pending, handover pending, completed, expired, failed.
- Intentional loading, empty, error, success, disabled, processing, locked, and expired states.

## Screen sequence

1. Landing / public experience
2. Auth / role selection / onboarding
3. Creator dashboard
4. Client dashboard
5. Explore / discovery
6. Contest detail
7. Create contest wizard
8. Contest management center
9. Creator entry / working view
10. Submission
11. Review / judging
12. Winner selection
13. Winner result
14. Account handover
15. Wallet / finance / payments
16. Creator profile / portfolio
17. Winners Hub
18. Leaderboard
19. Internal social feed / dashboard social module
20. Messaging
21. Notifications
22. Settings / Language
23. Agents
24. Workflows
25. Admin / system
26. Global errors / empty states / responsive states

## Creator experience

Dashboard should answer: what should I do next, what contests matter, what is due, what have I won, and what has been earned. Use compact active-contest cards, recommendation modules, deadline rail, submission tracker, earnings, reputation/reviews, profile health, and contextual social activity.

Discovery prioritizes prize, deadline, winners, client, category, requirements, eligibility, format, submission count, and time remaining. Search, filters, sorting, recommendations, trending, ending soon, highest prize, and new contests remain real-data driven.

Contest detail must make the brief and rules understandable before entry. Keep prize/deadline/client context visually persistent while the user reads overview, brief, requirements, deliverables, references, eligibility, rules, submission requirements, judging, winners, prize breakdown, timeline, FAQs, and related contests.

Submission is a focused media upload and confirmation workspace with draft saving, validation, preview, timestamp/version history, deadline awareness, and an explicit final-submit confirmation.

## Client experience

Client dashboard separates drafts, funding, live contests, closed/reviewing contests, winner selection, payment pending, handover pending, and completed work. Each contest has a management center organized around Overview, Submissions, Review, Communication, Winners, Payments, Handover, Settings, and Activity.

Review is a high-throughput creative review workspace: large media, creator identity, requirements checklist, review/rating controls, shortlist/reject/save/compare, previous/next, filters, sorting, notes, history, and winner selection without modal-heavy repetition.

## Contest creation

Use a one-by-one wizard:

1. Basic information
2. Creative brief
3. Requirements
4. References / footage
5. Prize & winners
6. Deadline & timeline
7. Eligibility & rules
8. Preview
9. Fund & publish

Every step communicates location, completion, missing information, and next action. Autosave drafts where supported. The preview must match the creator-facing contest surface.

## Winner + handover

Winner flow: Review → Shortlist → Finalists → Select Winner → Confirm → Payment → Handover → Complete.

Handover flow: Winner confirmed → Requirements → Winner submits handover assets → Client verifies → Platform readiness check → Transfer complete → Payment release where required → Completion confirmation.

Always display owner/action, progress, required next step, payment state, verification, rights/ownership state where implemented, deadlines, notifications, and audit/history.

## Finance

Keep existing payment architecture and represent actual backend states. Client sees contest funding, prize breakdown, fees, confirmation, transaction status, and refunds where applicable. Creator sees prize earnings, pending payouts, completed payouts, withdrawals, balance, and transaction history. Preserve regional/currency handling and current Razorpay/Razorpay Route integrations where already implemented.

## Profiles, portfolio, Winners Hub, leaderboard

Creator profiles become professional creative identities, prioritizing work, portfolio, winning work, history, reviews/testimonials, skills, categories, and collaboration context. Remove arbitrary XP/level/badge emphasis.

Winners Hub is a visual showcase of winning work with creator, contest, prize, client, date, category, and related work.

Leaderboard is performance-oriented and professional: weekly winners, monthly performance, prize earnings, wins, winning rate where valid, consistency, recent successful work, and high-to-low prize/value ordering where required by existing logic.

## Feed / social

Keep social inside the RazeKit dashboard ecosystem. Prioritize winning work, high-prize contests, relevant recent activity, creator work, collaboration posts, project highlights, and contest announcements. Do not make social-account health a mandatory brand requirement or let unrelated analytics distort the core contest workflow.

## Search / notifications / settings

Global search covers real contests, creators, clients, winners, posts, and projects. Notifications distinguish read, unread, and action-required events and deep-link into the relevant workflow. Settings are organized into Account, Profile, Security, Notifications, Payments, Payouts, Privacy, Language, Preferences, Connected Services, and role/workspace settings where applicable. Language must be a first-class settings destination.

## Agents / workflows

Agent and workflow screens explain real triggers, conditions, actions, status, last execution, next execution, errors, logs, and results. No decorative fake statuses or disabled-looking fake controls. Frontend connections must map to executable backend functionality.

## Quality gates

Every screen must meet four gates:

1. Visual consistency with the shared design system.
2. Real-data and permission correctness.
3. Clear next-action UX and complete state coverage.
4. Responsive/accessibility/security readiness.

Do not declare the redesign complete until the full creator and client loops are traversable end-to-end and all identified broken links, dead buttons, missing routes, authorization issues, API failures, loading failures, mobile problems, and raw backend error leakage are addressed.