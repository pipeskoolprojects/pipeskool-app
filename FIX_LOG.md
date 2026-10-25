# IT Executive UI — fix, polish and speed-up log (update 475)

Branch: `fix/it-ui-polish` (cut from `main` after PR #44 merged `codex/it-reference-all-pages`). Nothing deployed, nothing merged.
Scope: IT Executive UI only. No business logic, API, database, permission or calculation changes. Other roles verified pixel-identical (see §6).

## 0. Decisions taken without asking
- **Reference mockups were not available.** `pipeskool-it-app-redesign.html`, `pipeskool-it-delivery-challan.html`, `pipeskool-it-dashboard-home-v2.html` and the two `*-build-prompt.md` files are not in the repo and were not attached. The only design source in the repo is `public/it-dashboard-home.html` (the Home prototype Codex ported). Its tokens (radius 24/10/26/28 per platform, hairline `rgba(255,255,255,.1)`, blur 22–26px, shadow `0 30px 60px -30px`) were used as the token source for the whole shell. Exact per-page layout matching against the 15-page mockup could not be done — see §7.
- Login/live data not available: every page was rendered with the existing data layer behind a request mock (dummy rows live only in the audit scripts, never shipped).
- The Home page stays an iframe (`public/it-dashboard-home.html`). Rebuilding it in React was out of scope for a polish pass; it was made cheap instead (§3).

## 1. Audit — what was wrong (before screenshots: `audit/before/`)
Shell
- [x] `backdrop-filter: blur(22px)` on **every** `.card`, `.panel` and anything whose class contains "card" (`[class*="card"]` matched catalogue cards, delivery cards, KPI tiles…) — 680 blurred elements across the 15 pages × 10 viewports. Main cause of sluggish scrolling.
- [x] `transition: background-color .5s, border-color .5s, box-shadow .5s, color .5s` on every card — repaint on every theme/hover change.
- [x] `body { background-attachment: fixed }` on the app **and** inside the Home iframe — forces a full repaint of the mesh gradient on every scroll frame (Home scrolled at 16 fps with 4× CPU throttle).
- [x] Sidebar: the "hide menu" ⟨ button (absolute, top-right) was drawn **over** the ☀/☾ theme toggle; group buttons rendered as white pills in light mode (inherited from the generic `button` rule); nested groups had a different width/indent to top-level ones; accordion unmounted/remounted its items (layout jump); three different `z-index` values were in play with no scale.
- [x] Sidebar hidden (☰ floating button): the Home title "IT Command Center" and every page `<h1>` sat under the ☰.
- [x] Phone: the floating notification bell (fixed, top-right, from `NotifyBell`) covered the Home studio bar's theme toggle and the right edge of page headers.
- [x] Order Materials on phones: the catalogue's own CSS is light-only — white header/cards and light-grey rails inside the dark theme.
- [x] Borders/radii: 19 different literal radii (8–28px), two border colours, four shadow recipes, several `!important` background overrides in the per-page blocks.
- [x] Fake macOS traffic lights / Windows — ▢ ✕ controls rendered inside the ERP shell on Home.
- [x] Infinite animations (pulse dot, donut spin, pipeline runner) kept running with the tab hidden; entry stagger grew with the number of cards; tilt handlers ran on every pointermove with no rAF throttle and on tall cards.

Pages (per-page block, `app/globals.css`)
- Wages/Workers/Stock/Procure/Expenses/Billing/Vendors/Assets/Notices: KPI / chart cards used their own radius, border and shadow values; some light-mode backgrounds were `!important` gradients.
- Expenses: money tab strip could not scroll on phones (tabs clipped under the Expand button); KPI text could clip.
- Pending deliveries: legend labels overflowed the aging card at 820px.
- Billing: site `<select>` could exceed the header width on phones.
- Big values (₹44,65,753 style) could clip in KPI tiles.
- Pre-existing (not IT-specific, left alone): React hydration warnings #418 on `/wages`, `/workers`, `/assets` and #425 on `/letters` appear for **every** role (reproduced as Director). Not caused by, and not fixed in, this pass — it is shared page code.

No horizontal page scroll was found on any page at 360–1440px before or after (tables already scroll inside their panels).

## 2. Foundations (fixes most pages at once) — `app/globals.css`
- One token block on `html.it-executive-ui`: colours (dark + light), `--it-hair` (1px), radii `--it-r-xl/lg/md/sm/pill` (platform variants for Windows/iOS/Android), `--it-blur`, `--it-card-bg`, `--it-shadow(-sm)`, motion (`--it-fast`, `--it-ease`) and a z-index scale `--z-content < --z-sticky < --z-sidebar < --z-dropdown < --z-drawer < --z-modal < --z-toast`.
- Every per-page rule now reads the tokens (literal radii/shadows/`1px solid` replaced by script; verified by test). Progress bars use `--it-r-pill`.
- `[class*="card"]` removed everywhere; surfaces are `.card` and `.panel` only.
- `backdrop-filter` only on `.sidebar`, `.page-head`, `.m-head`, `.m-nav` (plus the catalogue drawer); blur radius drops to 10px under 760px; `@supports not (backdrop-filter)` and `prefers-reduced-transparency` fall back to solid surfaces. 680 → 340 blurred elements over the audit set (the remaining ones are the four shell pieces per page).
- Body mesh gradient moved to a `body::before { position: fixed }` layer — same look, no scroll repaint.
- Card `transition` removed; only `transform`/`opacity` animate anywhere in the IT UI; `prefers-reduced-motion` kept.
- `min-width: 0` on `.main > *`, grid/flex children; all tables keep scrolling inside their panel wrapper.
- No `!important` added; the handful Codex used on per-page backgrounds remains (they override the generic card rule and were left to avoid re-testing every page's cascade).

## 3. Sidebar and shell
- Sidebar: 262px desktop / 224px tablet, 36px item height, 10px side gutter, one active style (copper gradient + hairline inset; Windows gets the 3px accent bar), group headings and nested groups share the same width/indent, chevrons de-emphasised.
- Accordion: the group body stays mounted inside `.nav-acc` and animates with `grid-template-rows 0fr → 1fr` (no height thrash). For every other role `.nav-acc[data-open=false]` is `display:none` — identical rendering (pixel-diffed, §6). `aria-expanded` added to group buttons.
- ⟨ hide button and ☀/☾ toggle: toggle moved to `right: 44px`, brand row reserves 84px; no overlap in either theme.
- ☰ (sidebar hidden): page heads get `padding-left: 56px`; the Home iframe is told via `postMessage({type:"psk-it-shell", nosb})` (MutationObserver on `<html class>`) and pads its studio bar.
- Phone: page heads and the Home studio bar reserve 54–66px on the right for the floating bell; phone nav/head use the z-index scale; safe-area insets kept.
- Floating assistant button pinned to the toast layer.

## 4. Performance
- Home iframe (`public/it-dashboard-home.html`): no `background-attachment: fixed`; cards and chips no longer blur (studio bar + prototype sidebar keep it); entry stagger capped at 8 steps; infinite animations pause while the tab is hidden (`visibilitychange` → `html.paused`); `prefers-reduced-motion` disables the donut spin; tilt only on the small flip KPI cards, only for a real mouse, rAF-throttled, passive listeners; drag-to-rotate chart rAF-throttled with `touch-action: pan-y`; fake window chrome hidden in ERP mode.
- Catalogue: per-card shadow/gradient removed (flat surface + `contain: layout paint`).
- Measured with Playwright, CPU throttled 4× (mid-range phone proxy), same mock data, before (`main`) vs after:

| page | scroll fps 1440 before → after | blurred elements before → after |
|---|---|---|
| Home (/dashboard) | 16 → 45 | 1 → 1 (inside iframe: cards 0, studio 1) |
| Material Stock | 45 → 57 | 9 → 2 |
| Expenses | 59 → 59 | 11 → 2 |
| Notices | 61 → 61 | 9 → 2 (6 running animations → 0) |
| Order (catalogue grid) | 61 → 61 | 1 → 1 |
| Wages / Procure / Pending | 56–61 → 61 | 3 → 2 |

- Bundle: no new libraries; per-route JS unchanged (e.g. `/dashboard` 262 kB, `/wages` 371 kB, `/order` 224 kB first load); global CSS 78.3 kB → 86.6 kB (+8 kB: catalogue theming + token comments). Lighthouse could not be run here (no Chrome Lighthouse in the sandbox) — see §7.
- Not done: table virtualisation and request de-duplication. Pages fetch once on mount already; long tables are paginated by `DataTable`. Left as is to avoid touching shared data code.

## 5. Page by page (status · what changed · still to check with live data)
- [x] Home — iframe perf fixes above; title clears ☰; phone bar clears bell; fake window controls hidden. Check: KPI values and ring percentages with your real site data.
- [x] Muster Roll & Wages — tokens; tab strip scrolls. Check: Generate payment sheet, Excel, Edit attendance, slip actions.
- [x] Workers & Staff Master — tokens; KPI values wrap instead of clip. Check: Add worker, masked mobiles (first 4 + last 2), Daily wage column hidden for non-pay roles.
- [x] Delivery Challans — tokens on KPI/status/form. Check: Save challan, receipt, PO match, upload.
- [x] Pending Deliveries — tokens; legend no longer overflows at 820px. Check: Record delivery, Follow up, Items.
- [x] Material Stock & Inventory — tokens; 9 → 2 blurred surfaces. Check: GRN, Issue, Exchange, Bulk import.
- [x] Procurement & POs — tokens. Check: Order materials → /order, Approve, Delivery, Print, Cancel.
- [x] Order Materials (Catalogue) — dark/light theming on every size (header, rails, cards, sheets, drawer); flat cards. Check: Add → size sheet → Place Order.
- [x] Expenses & Petty Cash — tokens; tab strip scrolls; KPI text wraps. Check: Claim expense, approvals, vouchers.
- [x] RA Billing — tokens; header select constrained. Check: New RA bill, print.
- [x] Vendor Master — tokens. Check: Add/Edit vendor.
- [x] Tools & Assets — tokens. Check: Add/Import/Transfer.
- [x] Machine Repair — shell only (page has its own CSS module). Check: Send for repair, receipt.
- [x] Letters & Documents — shell only. Check: Create → print.
- [x] Notice Board — tokens; overview cards scoped to IT; 6 infinite animations → 0.

## 6. Verification
- `npm run build`: passes (same pre-existing warnings as before: legacy `/app/*` copies import names that no longer exist; `themeColor` metadata; one Autoprefixer note).
- `npm test`: 16/16 (10 existing + 6 new in `tests/it-executive-shell.test.mjs`: role gating helper, layout buckets, every IT rule scoped under `html.it-executive-ui`, backdrop-filter limited to the shell, token/hairline/z-scale present and no literal radii or thick borders, dashboard prototype perf contract).
- Screenshots: 15 pages × 1440/1024/820/412/360 × dark/light → `audit/before/` and `audit/after/` (+ `report.json` with per-page overflow, blurred-element count and console errors). Side-by-side sheets per page → `audit/sheets/<page>.png` (before | after; no reference column — see §0).
- No horizontal page scroll at any width (checked programmatically, 150 page/viewport/theme combinations).
- Other roles: Director, Supervisor and Accountant (ho_admin) screenshots of `/home`, `/stock`, `/procure`, `/wages`, `/m/dashboard` at 1366 and 390 px are **0.000 % different** before vs after (pixel diff, `audit/roles/`).
- Tap targets: buttons and phone-nav items are ≥ 44px on phones (catalogue's compact ± controls excluded on purpose).
- Contrast: text/muted tokens are ≥ 4.5:1 on their surfaces in both themes (dark `#f5f7fb`/`#aab5ce` on `#080d19`; light `#111827`/`#5b6678` on `#eef1f8`).

## 7. What could not be verified here
- Match against the 15-page reference mockup (files not available).
- Lighthouse scores and a real mid-range Android device; the 4×-throttled Playwright numbers above are the proxy.
- Live data: every number, the Home rings/KPIs, masked mobiles/bank accounts and each action button listed in §5 with a real IT Executive login.
- Vercel preview: GitHub is read-only for this session (403), so the branch could not be pushed. Push `fix/it-ui-polish` (patch/zip supplied) and Vercel will build the preview as usual.
