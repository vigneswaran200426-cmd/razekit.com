# RazeKit v1 — Full Platform Redesign Scope

## Product direction

RazeKit is a prize-funded creator marketplace built around one loop: a Client posts a Contest and funds the Prize → creators discover and join → create and send entries → the Client reviews/judges → winner is selected → handover is completed → payout is released → winning work is showcased → more creators and Clients discover the marketplace.

The redesign changes the experience and visual system without removing or weakening the existing product capabilities.

## Navigation

Desktop main product uses a top navigation, not a permanent sidebar.

Core destinations:
- Dashboard
- Explore
- Winners

Contextual destinations stay available through account menus, page actions, contextual panels or focused flows:
- My work / My contests
- Wallet / Earnings
- Profile
- Social Tracker
- Messages
- Notifications
- Settings
- Help
- Trust, payments and admin tools

Brand/client may surface Social Tracker directly because it is a major workflow. Creator receives a compact Social Tracker module on Dashboard and a focused Social Tracker screen when needed.

## Visual system

- Premium, media-first, high information density.
- Desktop-first composition with responsive support.
- Existing RazeKit logo/wordmark remains the brand asset.
- Controlled 8–14px corner radius for structural UI; full pills only for intentional statuses/tags.
- Crisp 1px borders, restrained shadows and clear layer hierarchy.
- Cool near-white page ground with RazeKit blue as primary action color and cyan as secondary information/state accent.
- No neon/cyberpunk visual effects.
- No purple/blue AI-template gradients.
- No giant empty cards or oversized dead whitespace.
- No generic three-card SaaS landing patterns.
- Media and real work should carry visual hierarchy.

## Screen redesign map

### 1. Dashboard
Creator:
- greeting and actionable context
- active contests
- next best action
- submissions progress
- upcoming deadlines
- earnings summary
- wins
- profile/reputation
- compact Social Tracker signal
- activity

Client/Brand:
- active contests and contest health
- create/post contest primary action
- entries needing review
- judging queue
- winner/handover states
- spend/prize/escrow summary
- Social Tracker performance overview
- recent activity

### 2. Explore
- media-first contest discovery
- search
- meaningful filters: category, prize, deadline, format and state
- featured/high-prize and closing-soon rails where data exists
- dense result grid/list depending viewport
- strong prize/deadline hierarchy
- real trust signals

### 3. Contest Detail
- hero media
- clear Prize and deadline
- escrow/funded state
- brief and requirements
- reference/context footage access state
- client/brand trust information
- creator participation status
- entry CTA
- contest timeline and current state
- discussion/comments where supported

### 4. Create Contest
Multi-step flow, clear progress and save/draft behavior:
- basics
- brief
- requirements
- reference/footage
- prize/funding
- deadline
- review
- publish

The form should feel like a focused production workflow, not a generic settings page.

### 5. Entry / Submission Workspace
- contest context always visible
- requirements checklist
- workspace state
- upload/preview
- version/status communication
- secure footage states
- final-send confirmation
- deadline awareness

### 6. Review / Judging
Client decision workspace:
- entry comparison
- large visual/media preview
- criteria and notes
- shortlist and winner actions
- decision progress
- prevent accidental winner selection
- minimize decision fatigue

### 7. Winner
- clear winner moment
- prize and winner identity
- winning work presentation
- next actions
- publish/showcase state
- transition into handover

### 8. Handover
One focused room/flow:
- required assets checklist
- source files / final creative
- secure exchanges
- messages
- progress state
- winner confirmation
- client confirmation
- completion state

### 9. Wallet / Payments
Creator and Client views are role-aware.

Creator:
- available balance
- pending/held funds
- earnings history
- payout status
- withdrawal

Client:
- funding
- escrow/held Prize
- payment history
- contest-level financial status

Admin:
- provider/payment state
- reconciliation
- payout controls

Never make money status ambiguous.

### 10. Creator Profile / Portfolio
- identity/header
- portfolio-led visual content
- real wins and entries
- verified reviews where available
- work history
- reputation signals
- social proof

Do not center the profile around artificial XP/badge gamification as the primary value proposition.

### 11. Winners Hub / Leaderboard
Winners Hub is a discovery surface, not a generic list.
- winning work first
- creator + client context
- prize and contest context
- automatic publication of eligible winners
- ranking based on real performance/work signals
- weekly leaderboard presentation
- clear separation between Winner Hub and Leaderboard jobs

### 12. Brand / Client
Brand identity and contest management should feel first-class:
- brand profile
- active campaigns/contests
- published history
- judging queue
- winner/handover status
- spend and outcome summaries
- Social Tracker
- team-facing/contextual actions where the existing system supports them

### 13. Social Tracker
Two depths:
- Creator: compact progress/performance module in Dashboard and creator-focused view.
- Brand/Client: dedicated deep experience with connected accounts, content/posts, campaign grouping, metrics, trend comparison and actionable insights.

It must not become the primary navigation of the whole product.

### 14. Messaging
- contextual conversations attached to contests/handover where possible
- clear unread state
- message actions and attachments supported by existing business logic
- avoid a separate empty social inbox feeling

### 15. Notifications
- action-oriented notification center
- group by meaningful workflow event
- deep-link to the exact action screen
- unread state in top navigation

### 16. Settings / Language
- account
- notifications
- privacy/security
- payments
- legal
- language
- deletion

Language must remain discoverable and functional.

### 17. Auth
- Login
- Register
- OTP verification
- Google sign-in when configured
- Forgot/reset password
- clean configuration errors
- never expose raw server configuration errors such as API-key stack/config messages to end users

### 18. Admin
Separate admin experience and deployment target.
- users
- trust & safety
- payments
- support
- enforcement
- footage security
- visual assets
- audit/review controls

Admin UI should be operational, dense and data-first rather than matching consumer discovery pages exactly.

## Engineering rules

- Preserve all existing business logic unless a bug/security issue is found.
- Do not fabricate production statistics or entries.
- Keep demo data isolated from production data.
- Keep payment flows, webhook logic, ledger ordering and payout behavior intact.
- Keep auth/session behavior intact.
- Do not silently rename database fields/entities during a visual redesign.
- Keep the main branch safe; redesign work lives on `redesign/full-platform-v1` until verified.
- Validate build/lint/type checks after material UI changes.

## Current implementation state

The v1 branch has an activated shared visual layer that tightens page geometry, standardizes surfaces/radii/controls, reduces excessive whitespace and establishes the top-level premium visual language. Screen-by-screen redesign continues from this foundation.
