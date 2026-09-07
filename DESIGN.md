# DESIGN.md — Contest Marketplace Design System

> **Status: Awaiting sign-off.** No screen code written yet.
> **Flag — missing attachments:** The prompt references an attached 15-module product spec + UI/UX design system file. Neither arrived with this message. This document is built from the direction in the prompt itself + the tokens already live in the app. Every invented decision is tagged **[INVENTED]** so you can override before I touch a component.

---

## 0. Glossary — locked vocabulary

One word per concept, everywhere — UI copy, errors, emails, empty states.

| Term | Means | Not |
|------|-------|-----|
| **Contest** | A paid competition posted by a Client | Brief, Challenge, Gig, Project |
| **Editor** | The person who enters contests and submits Entries | Creator, Designer, Freelancer |
| **Client** | The person who posts a Contest and pays the Prize | Poster, Buyer, Employer |
| **Entry** | What an Editor submits to a Contest | Submission, Work, Deliverable |
| **Prize** | The money a Client puts up | Reward, Payout, Bounty |
| **Escrow** | Prize money held by the platform until a winner is picked. Always shown as "held" | — |
| **Wallet** | Where an Editor's earnings live | Balance, Account, Funds |
| **Rank Tier** | One of 8 named levels an Editor earns | Level, Grade |

**[INVENTED — flag for confirmation]** The existing app and data model use "Creator" throughout (`creator_level`, `CreatorContest`, `UserProfile`, etc.). The brief says "video editors compete," so I'm locking **Editor** as the user-facing term in all copy. Internal field/entity names stay as-is (no data-model rename in a UI rebuild). If you want "Creator" to win instead, say so before I start — it changes copy on every screen.

---

## 1. Color

All values are HSL channels (for `hsl(var(--token))`).

### 1.1 Base & surfaces (no drop shadows — elevation by layer color + 1px border)

| Token | HSL | Use |
|-------|-----|-----|
| `--background` | `220 16% 5%` | Page base. Deep near-black, slight cool tint. |
| `--surface-1` | `220 14% 8%` | Cards, inputs, list items. Layer 1. |
| `--surface-2` | `220 12% 11%` | Modals, dropdowns, hover states. Layer 2. |
| `--foreground` | `38 12% 95%` | Primary text. Warm off-white — never pure #FFF (glares). |
| `--muted-foreground` | `220 10% 58%` | Secondary text, meta, captions. |
| `--border` | `220 12% 14%` | 1px borders on Layer 1. |
| `--border-elevated` | `220 12% 18%` | 1px borders on Layer 2. |

**Elevation rule:** Layer 0 → 1 → 2 by surface color step + a 1px border. No `box-shadow` drop shadows on dark backgrounds — they go muddy. The only box-shadows allowed are the signature glow (§5) and the live-glow pulse (§5.1), both tight-spread, colored, low-opacity — never a grey drop shadow.

### 1.2 Accents — the gold/cyan duality

| Token | HSL | Use |
|-------|-----|-----|
| `--gold` | `38 92% 56%` | **Value, money, the thing you want.** Primary CTAs, Prize amounts, Wallet balance, rank midpoint, "Post a Contest." |
| `--gold-foreground` | `220 20% 6%` | Text/icon on gold. |
| `--cyan` | `187 82% 52%` | **State, information, "live."** Active/live indicators, status badges, info links, secondary actions, "12 entries live." |
| `--cyan-foreground` | `220 20% 6%` | Text/icon on cyan. |

**Duality rule (this is what makes the product distinctive — protect it):**
- Gold = value. Cyan = state.
- Never use both accents in one component unless two distinct meanings are encoded (e.g. a live contest card: cyan "live" badge + gold prize amount = two meanings, OK).
- Chrome, navigation, and structural elements carry **no accent** — dark surfaces + muted text hold the layout so the accents pop. If everything is gold/cyan, nothing is.

### 1.3 Semantic

| Token | HSL | Use |
|-------|-----|-----|
| `--success` | `142 60% 45%` | Completed, won, paid out, verified. |
| `--error` | `0 68% 52%` | Failed, rejected, destructive. |
| `--warning` | `32 88% 56%` | Deadline soon, action needed. |
| `--info` | `187 82% 52%` | Alias of cyan — informational, neutral status. |

**Pending / escrow** is not a new color — it's **gold + a lock icon + the word "held."** The copy and icon carry the semantic; the color stays gold because it's still money.

### 1.4 Rank-tier colors (8 tiers) **[INVENTED — flag for confirmation]**

The full warm→cool spectrum appears **only here.** Everywhere else, it's gold XOR cyan.

| # | Tier | Token | HSL | Glyph |
|---|------|-------|-----|-------|
| I | Recruit | `--tier-recruit` | `220 6% 52%` | I |
| II | Bronze | `--tier-bronze` | `28 48% 48%` | II |
| III | Silver | `--tier-silver` | `220 12% 68%` | III |
| IV | Gold | `--tier-gold` | `38 92% 56%` | IV |
| V | Platinum | `--tier-platinum` | `180 25% 82%` | V |
| VI | Diamond | `--tier-diamond` | `187 82% 52%` | VI |
| VII | Master | `--tier-master` | `200 70% 42%` | VII |
| VIII | Legend | `--tier-legend` | `48 100% 72%` | VIII |

**Tier → level mapping [INVENTED]** (the existing app has levels 1–50+ and a "Bronze III" rank; I'm proposing this structure — confirm or replace):
Recruit 1–5 · Bronze 6–12 · Silver 13–20 · Gold 21–30 · Platinum 31–40 · Diamond 41–50 · Master 51–65 · Legend 66+.

---

## 2. Typography

### 2.1 Faces

| Role | Face | Import |
|------|------|--------|
| Display / Headings / Labels | **Space Grotesk** | `wght@400,500,600,700` |
| Body / Long-form | **Inter** | `wght@400,500,600` (already imported) |

**[INVENTED — flag]** The prompt says Space Grotesk. The current app uses Sora for headings + Inter for body. I'm proposing Space Grotesk replace Sora. If you want to keep Sora (it's already a strong geometric face), say so — it's a one-line change either way.

### 2.2 Scale

| Token | Size | Weight | Tracking | Line-height | Use |
|-------|------|--------|----------|-------------|-----|
| `text-caption` | 12px | 500 | +0.02em | 1.4 | Meta, timestamps, micro-labels. Uppercase + +0.06em for section labels. |
| `text-body-sm` | 14px | 400 | 0 | 1.5 | Secondary text, card descriptions. |
| `text-body` | 16px | 400 | 0 | 1.6 | Primary content. |
| `text-subtitle` | 20px | 600 | −0.01em | 1.3 | Card titles, dense-screen headings. |
| `text-section` | 24px | 600 | −0.02em | 1.25 | Section headings. |
| `text-page` | 32px | 700 | −0.03em | 1.2 | Page headings. |
| `text-display` | 48px | 700 | −0.04em | 1.05 | Hero numbers: Prize, Wallet, stats. |

Weight is not the only lever — tracking tightens as size grows; small labels widen and uppercase.

---

## 3. Spacing — 8pt grid, no exceptions

| Token | Value | Use |
|-------|-------|-----|
| `--space-1` | 8px | Icon↔text gap, tight internal padding, badge padding. |
| `--space-2` | 16px | Card internal padding, gap between cards in a grid. |
| `--space-3` | 24px | Mobile section gap, list-item gap. |
| `--space-4` | 32px | Desktop section gap (vertical rhythm between major sections). |
| `--space-5` | 40px | Large section separation. |
| `--space-6` | 48px | Page top/bottom breathing room. |
| `--space-7` | 64px | Hero / display separation. |

**Rule (Section 7):** Card internal padding (`--space-2` = 16px) ≤ gap between cards (`--space-2` = 16px). Grouped content reads as grouped.

No 4px. If a 4px gap feels necessary, the design is wrong — rework it onto the grid.

---

## 4. Radius — one scale, used everywhere

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | 8px | Controls, inputs, buttons, small badges. |
| `--radius-md` | 12px | Cards, list items, panels. |
| `--radius-lg` | 16px | Large cards, modals, sheet containers. |
| `--radius-full` | 9999px | Pill badges, tags, **rank-tier badges**, avatars. |

Never mix sharp and rounded on the same layer. A card is 12px; everything inside it is ≤ 12px.

---

## 5. Signature element — the Rank-Tier Badge

This is the one ownable visual moment. Every Editor shown anywhere in the product carries their tier badge. Everything else stays disciplined around it.

**Anatomy:**
- Shape: pill (`--radius-full`).
- Padding: 8px vertical, 12px horizontal.
- Background: tier color at **12% opacity** (`hsl(var(--tier-X) / 0.12)`).
- Border: 1px tier color at **40% opacity**.
- Text: tier name, Space Grotesk 500, 12px, uppercase, tracking +0.06em, tier color at full.
- Glyph: Roman numeral (I–VIII), Space Grotesk 600, 12px, tier color, sits left of the name with an 8px gap.
- **Glow (tiers IV+ only):** `box-shadow: inset 0 0 0 1px hsl(var(--tier-X) / 0.15), 0 0 16px -4px hsl(var(--tier-X) / 0.35)`. Tight spread, colored, low-opacity — not a grey drop shadow. Tiers I–III have no glow; the glow is the reward for climbing.

**Discipline:** The tier badge is the only element that mixes the warm-to-cool spectrum. On a contest card, the Editor's tier badge + the gold prize + the cyan "live" badge = three colors, three meanings. That's the maximum. Anything more and the screen loses hierarchy.

### 5.1 Supporting element (not the signature) — Live Glow

Open/active contests get a **1px cyan border** + a slow ambient pulse on the card border: `opacity 0.3 → 0.6 → 0.3, 3s ease-in-out infinite`. Only on cards whose contest is currently accepting entries. This is the "live" state — it replaces a static badge with motion, cinematic without being noisy.

---

## 6. Banned — generic AI tells (self-check every screen)

If any of these appear, I defaulted instead of designing. Undo it.
- ❌ Purple-to-blue gradient anything.
- ❌ shadcn card with a soft grey drop shadow floating on dark.
- ❌ Centered hero: headline + subhead + single button + nothing else.
- ❌ 3-icon feature grid with vague 3-word labels.
- ❌ Every card in a grid at identical size/weight, no hierarchy.
- ❌ `01 / 02 / 03` as decoration (only if they encode a real sequence).
- ❌ Copy that could belong to any SaaS product (see §7).

---

## 7. Copy rules

- Buttons say the **outcome**, never the system action: "Post a Contest," "Send Entry," "Pick Winner" — never "Submit," "OK," "Continue," "Click Here."
- An action keeps its name through the whole flow: "Post" → confirmation "Posted," not "Success!"
- Write from the user's side of the screen: "Your Entries," not "Submission records."
- Errors explain what happened + how to fix it, in the product's voice. Never vague, never apologetic filler.
- Empty states are an invitation: "Nothing live in [category] yet — be the first to post one," not "No data."
- One word per concept (§0 glossary), everywhere.

---

## 8. Layout enforcement

- 8pt grid on every screen (§3).
- One column-grid system across the app: **12-col desktop**, single-column mobile. No screen invents its own layout.
- Vertical rhythm: 32px between major sections (desktop), 24px (mobile). One value, held everywhere.
- Card internal padding ≤ gap between cards (§3 rule).
- Watch CSS specificity: a type selector and a utility class can silently cancel section spacing. If spacing looks wrong, check for a competing rule before adding `!important`.

---

## 9. Screen build order (locked MVP loop)

**Explore → Auth → Create Contest → Submit → Review → Wallet**

Refinement adopted: Explore is public — no auth gate at the front door. Auth triggers on intent (post, submit, save), not on entry.

1. **Explore** (public, no login) — live contests, filterable by prize, deadline, category, entrant count. Trust-building first impression.
2. **Contest detail** — brief, prize, deadline, entry count, client's history/rating. Trust signals (§10) live here.
3. **Auth** — triggered by intent.
4. **Create Contest** (client) — post brief, set prize, set deadline.
5. **Submit Entry** (editor) — upload, preview, confirm.
6. **Review** (client) — compare and rate entries, pick winner.
7. **Wallet** — balance, escrow/pending prize, withdrawal, transaction history, payout status.

Nothing gets built outside this list without flagging it first.

---

## 10. Trust signals — solves the cold-start problem

New marketplace, no track record yet. The UI manufactures trust by surfacing these **by default**, not buried in a tab, on every contest card and profile:
- **Rank-tier badge** (the 8-tier system, §5) wherever an Editor is shown.
- **Verified / payment-verified badge** on Clients posting prize money.
- **Escrow indicator** on the prize amount — "₹15,000 held," not just "₹15,000" — so Editors know the money is real before they spend hours on an Entry.
- **Past contest count / completion rate**, not just a star rating.

---

## Decisions I need you to confirm before I code

1. **Editor vs Creator** (§0) — I propose "Editor" in all user-facing copy. Confirm or override.
2. **Space Grotesk vs Sora** (§2.1) — I propose Space Grotesk. Confirm or keep Sora.
3. **The 8-tier structure + level mapping** (§1.4) — invented. If you have a tier spec in the missing attachment, share it; otherwise confirm this one.
4. **Missing attachments** — the prompt references a 15-module product spec + design system file that didn't arrive. If you can share them, I'll reconcile tokens before building. If not, I proceed on this document.

**Reply "approved" (or with corrections) and I'll start on Screen 1 — Explore.**