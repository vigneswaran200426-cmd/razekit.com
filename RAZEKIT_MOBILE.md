# RazeKit — Responsive Contract

What this document is: the widths RazeKit targets, the five rules every screen is held to, and a
per-page status table.

**What VERIFIED means here.** It means the rule is implemented in code that is cited in the table,
file and line. It does **not** mean the page was opened at that width. Nothing in this document was
tested on a device, in a simulator, or in a browser at any viewport size. Where no code implements a
rule for a page, the row says UNVERIFIED — not "probably fine".

---

## Target widths

| Width | Devices it stands for | Tailwind tier | Shell gutter |
|---|---|---|---|
| 360 | Small Android (Galaxy A-series) | base | 1rem |
| 375 | iPhone SE / 13 mini | base | 1rem |
| 390 | iPhone 14 / 15 | base | 1rem |
| 414 | iPhone Plus, large Android | base | 1rem |
| 430 | iPhone Pro Max | base | 1rem |
| 768 | Tablet portrait | `md` | 1.5rem |
| 1024 | Tablet landscape, small laptop | `lg` | 2rem |
| 1280 | Laptop | `xl` | 2rem |
| 1440 | Desktop | `xl` | 2rem, content capped at 1400px |

Tailwind defaults are unchanged: `sm` 640, `md` 768, `lg` 1024, `xl` 1280. The five phone widths all
fall below `sm`, so **base styles are the phone styles** — every breakpoint prefix in this codebase
is an enhancement for a wider screen, never a patch for a narrow one.

The page container is the `.shell` utility in `src/index.css`:

```css
.shell { max-width: 1400px; margin-inline: auto; padding-inline: 1rem; }
@media (min-width: 640px)  { .shell { padding-inline: 1.5rem; } }
@media (min-width: 1024px) { .shell { padding-inline: 2rem; } }
```

`tailwind.config.js` mirrors the cap as `maxWidth.shell = 1400px`. At 1440 the content stops at
1400px and centres; there is no layout above that.

---

## The five rules

### 1. No horizontal page scroll

The page body must never scroll sideways at any target width. Implementation:
`src/components/AppShell.jsx` wraps every routed page in `<div className="shell py-6 sm:py-8">`, so
each page gets the capped width and the gutter without asking for it. Anything wider than the
viewport is the individual page's responsibility under rule 3.

There is **no global `overflow-x: hidden` guard** anywhere in `src/index.css` or on `body`. That is
a deliberate-looking absence — a global clip hides the bug instead of fixing it — but it means the
rule is enforced page by page, not centrally.

### 2. 44px touch targets

Enforced in the shared primitives, and only under a coarse pointer, so a dense desktop toolbar is
not inflated to fix a problem desktop does not have.

- `src/components/ui.jsx` — `Button` sizes: `sm` is `h-9 [@media(pointer:coarse)]:h-11`, `md` is
  `h-10 [@media(pointer:coarse)]:h-11`, `lg` is `h-12`.
- `src/components/ui.jsx` — `Input`: `h-10 [@media(pointer:coarse)]:h-11`.
- `src/components/ui.jsx` — `Segmented` tabs: `[@media(pointer:coarse)]:min-h-[44px]` plus wider
  horizontal padding under a finger.
- Bare links and buttons that are not the shared primitives carry `min-h-[44px]` explicitly, often
  released again at `sm:` where a mouse is likely — for example
  `src/components/Notifications.jsx:347`, `src/pages/ContestDetail.jsx:246`,
  `src/pages/Explore.jsx:102`.

44px comes from the Apple HIG and Material both landing on the same number for a finger.

### 3. Wide content scrolls inside its own container

Tables and horizontal rails get their own `overflow-x-auto` wrapper so the page itself stays put.
Both patterns are in use:

- **Scroll the table**: `src/pages/Balance.jsx:399`, `src/pages/admin/Finance.jsx:79` and `:1614`,
  `src/pages/Admin.jsx:151` and `:231`, `src/pages/FundContest.jsx:330`.
- **Swap the table for rows on a phone**: `src/pages/Winners.jsx:848` renders
  `<ul className="grid list-none gap-2 md:hidden">` and the five-column table as
  `<Card className="hidden overflow-x-auto p-0 md:block">`. The comment says it plainly: a
  five-column table only earns its width later.
- **Horizontal rails** (filter chips, campaign rails) use `-mx-1 overflow-x-auto px-1` so the first
  and last chip can still reach the gutter: `src/pages/Notifications.jsx:144`,
  `src/pages/Work.jsx:176`, `src/pages/Tracker.jsx:596`, `src/pages/CreatorProfile.jsx:391`.

### 4. Safe-area padding

Four places pad for the notch and the home indicator:

- `src/components/primitives.jsx:53` — the `Sheet` bottom sheet: `pb-[env(safe-area-inset-bottom)]`.
- `src/components/Notifications.jsx:279` — the toast/alert viewport:
  `paddingTop: calc(env(safe-area-inset-top, 0px) + 4.75rem)`.
- `src/pages/CreateContest.jsx:105` and `src/pages/SubmitWork.jsx:492` — the sticky action bars:
  `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`.

**This rule is currently inert on iOS.** `index.html` declares
`<meta name="viewport" content="width=device-width, initial-scale=1.0" />` with no
`viewport-fit=cover`, and without that the `env(safe-area-inset-*)` values resolve to `0`. The code
is correct; the page-level opt-in is missing. See Known limitations.

### 5. No content under fixed nav

The header in `src/components/AppShell.jsx` is `sticky top-0 z-40`, not `fixed`. A sticky header
occupies layout space, so content cannot slide under it — the rule holds by construction rather than
by a magic top-padding number that drifts when the header height changes.

The only genuinely `fixed` overlays are the notification viewport (`fixed inset-x-0 top-0
z-[1000]`, offset by 4.75rem = 76px, clearing the 64px `h-16` header) and the `Sheet` backdrop
(`fixed inset-0 z-50`, which is modal and locks `body` scroll while open).

The sticky action bars on CreateContest and SubmitWork are `sticky bottom-0` and in normal flow, so
they cannot cover the last field.

---

## Per-page status

| Page | Route | Status | Evidence |
|---|---|---|---|
| App shell / nav | all | VERIFIED | `AppShell.jsx` — `hidden md:flex` desktop nav, `md:hidden` hamburger and collapsible panel, `.shell` wrapper, sticky header |
| Landing | `/` | VERIFIED | `Landing.jsx:56` `lg:grid-cols-2`, `:92` `sm:grid-cols-2`, `:110` `md:grid-cols-3` |
| Login / Register / Onboarding | `/login` `/register` `/onboarding` | VERIFIED | `auth/AuthShell.jsx:30` `lg:grid-cols-2`, `:33` `hidden lg:flex` art panel, `:61` `px-6 sm:px-10`, `:63` `lg:hidden` brand; fields use the coarse-pointer `Input` |
| Explore | `/explore` | VERIFIED | `Explore.jsx:88` scrolling tablist, `:102` `min-h-[44px]` tabs, `:327` `sm:grid-cols-3 lg:grid-cols-4` |
| Discover | `/discover` | VERIFIED | `Discover.jsx:130` `lg:hidden` filter control, `:189`–`:203` card scales `sm:p-3.5` / `sm:h-20 sm:w-20`; single-column list below `lg` |
| Winners | `/winners` | VERIFIED | `Winners.jsx:848` mobile `md:hidden` row list vs `:852` `hidden md:block` table, `:905` scrolling Segmented, `:676` `sm:grid-cols-2` |
| Feed | `/feed` | VERIFIED | `Feed.jsx:15` `min-w-0 flex-1` with `truncate`, `:24` media `w-full max-h-[540px]`; single column at every width by design |
| Creator profile | `/u/:id` | VERIFIED | `CreatorProfile.jsx:90` `sm:grid-cols-3 lg:grid-cols-4`, `:391` `-mx-1 overflow-x-auto px-1` rail |
| Contest detail | `/contest/:id` | VERIFIED | `ContestDetail.jsx:246` `min-h-[44px]` back link, `:330` full-width `min-h-[44px]` control, `:461` `sm:grid-cols-3`, `:558` `sm:grid-cols-2` |
| Dashboard | `/dashboard` | VERIFIED | `Dashboard.jsx:252` and `:268` `sm:grid-cols-4` KPI grids over a phone-width base |
| Tracker | `/tracker` | VERIFIED | `Tracker.jsx:98` `sm:grid-cols-4`, `:117` and `:580` `lg:grid-cols-4`, `:596` `-mx-1 overflow-x-auto` campaign rail |
| Track record | `/track-record` | VERIFIED | `TrackRecord.jsx:116` `sm:grid-cols-3`, `:152` and `:239` `lg:grid-cols-4` |
| My work | `/work` | VERIFIED | `Work.jsx:176` scrolling rail, `:194` `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |
| Balance | `/balance` (plus one legacy alias route in `App.jsx`) | VERIFIED | `Balance.jsx:204` `sm:grid-cols-2`, `:328` `sm:grid-cols-3`, `:399` `overflow-x-auto` history table, `:60` `h-11` input |
| Create campaign | `/create-contest` | VERIFIED | `CreateContest.jsx:105` sticky action bar with safe-area padding, 17 `min-h-[44px]`/`h-11` targets, `enterKeyHint` and `inputMode` on the numeric fields |
| Submit work | `/contest/:id/submit` | VERIFIED | `SubmitWork.jsx:492` sticky action bar with safe-area padding, `:362`/`:441`/`:471` `sm:p-` card scaling |
| Review entries | `/contest/:id/review` | VERIFIED | `Review.jsx:24` and `:112` `grid lg:grid-cols-[300px_minmax(0,1fr)]` — one column below `lg`; `:114` list scrolls only at `lg` |
| Fund campaign | `/contest/:id/fund` | VERIFIED | `FundContest.jsx:330` and `:374` `overflow-x-auto`, `:442` `grid-cols-1 sm:grid-cols-2`; `UpiPayment.jsx:173`/`:223` `min-h-[44px]` |
| Winner verification | `/contest/:id/verify` | VERIFIED | `WinnerVerify.jsx:261` `grid gap-2 sm:grid-cols-2` stacks on a phone; the rest is a single-column form on shared primitives |
| Campaign report | `/contest/:id/report` | VERIFIED | `CampaignReport.jsx:78` `grid gap-3 sm:gap-6 md:grid-cols-[176px_1fr]`, `:83` `hidden … md:block` side note, `:109` `p-5 sm:p-6` |
| Handover | `/contest/:id/handover` | VERIFIED | `Handover.jsx:77` and `:100` `grid lg:grid-cols-[minmax(0,1fr)_340px]` — one column below `lg` |
| Notifications | `/notifications` | VERIFIED | `Notifications.jsx:144` `-mx-1 overflow-x-auto px-1` category rail; toast viewport is full-width on phones, `sm:w-[400px]` right-aligned above |
| Profile | `/profile` | VERIFIED | `Profile.jsx:36` and `:51` `sm:grid-cols-3` |
| Settings | `/settings` | VERIFIED | `Settings.jsx:100` `grid-cols-1 sm:grid-cols-2`, `:128` `flex-col sm:flex-row` |
| Help | `/help` | VERIFIED | `Help.jsx:195` `flex flex-col sm:flex-row` ask form; the rest is single-column prose inside `.shell` |
| Legal (Terms / Privacy / About / Contact) | `/terms` `/privacy` `/about` `/contact` | VERIFIED | `Legal.jsx:136` `sm:grid-cols-2 lg:grid-cols-3`, `:1213`/`:1224` `lg:grid-cols-4` |
| Not found | `*` | VERIFIED | `NotFound.jsx:7` `min-h-screen grid place-items-center bg-bg px-6 text-center` — its own gutter, no shell |
| Admin overview | `/admin` | VERIFIED | `Admin.jsx:66` `grid-cols-2 sm:grid-cols-4 lg:grid-cols-7`, `:78`/`:88` `grid-cols-2 sm:grid-cols-5`, `:97` `md:grid-cols-2`, `:151`/`:231` `overflow-x-auto` tables |
| Admin finance | admin console | VERIFIED | `admin/Finance.jsx:79` and `:1614` `overflow-x-auto`, `:198` `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`, `:212` `grid-cols-2 sm:grid-cols-4` |
| Safe-area behaviour on iOS | all | UNVERIFIED | The four `env(safe-area-inset-*)` sites exist, but `index.html` has no `viewport-fit=cover`, so on iOS they resolve to 0. No device has confirmed either way |
| Landscape phone (e.g. 844x390) | all | UNVERIFIED | No code targets short-viewport landscape; `max-h-[88vh]` sheets and `lg:max-h-[70vh]` panels have never been checked at 390px tall |
| 1440 and wider | all | UNVERIFIED | `.shell` caps at 1400px, but no page has been looked at above 1280 |

---

## Known limitations

- **Nothing has been visually tested.** No device, no simulator, no browser window at any of the
  nine target widths. Every VERIFIED row above means "the code says so", not "we looked".
- **`viewport-fit=cover` is missing from `index.html`.** Until that is added, all four safe-area
  paddings compute to zero on iOS and the bottom sheet, the sticky action bars and the toast
  viewport sit under the home indicator and the notch. This is a one-line fix and the highest-value
  item in this document.
- **No automated viewport regression test exists.** There is no Playwright or Cypress suite, so a
  layout that breaks at 360 will break silently.
- **No global horizontal-overflow guard.** Rule 1 holds only where a page respects rule 3. A future
  page with an unwrapped wide element will scroll the whole document and nothing will catch it.
- **Touch targets outside the shared primitives are opt-in.** `Button`, `Input` and `Segmented`
  handle themselves under a coarse pointer, but a bare `<button>` or `<Link>` is only 44px tall
  where somebody wrote `min-h-[44px]`. Several admin surfaces use bare elements.
- **`[@media(pointer:coarse)]` is a pointer query, not a width query.** A touchscreen laptop gets
  the larger targets; a phone driven by a mouse would not. That trade is deliberate but it means
  "44px at 390px wide" is not literally what the CSS asserts.
- **The admin console is a separate repository** (`admin-razekit`). Only the two admin screens that
  live in this repository are listed above.
- **Text scaling and zoom are unexamined.** `html { -webkit-text-size-adjust: 100% }` is set, but
  nobody has checked any page at 200% browser zoom or with large OS text.
