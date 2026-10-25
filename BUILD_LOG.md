# Pipeskool IT Reference Build Log

## Scope and decisions
- Feature flag: `it-executive-ui` on the root HTML element, enabled only for normalized role `itexecutive` by the existing `Sidebar`/`MobileNav` role gate. Other roles retain their current UI.
- Source branch: `codex/it-reference-all-pages` from `main`.
- Preserve business logic, API contracts, permission checks, forms, calculations, exports, and the official Pipeskool logo. Reference figures are design-only; no fixed mock numbers should replace company data.
- The supplied master prompt and local HTML references are the design source. The separate delivery-challan HTML and one standalone prompt path were not available in the supplied locations.

## Reference page to route/data map
| Reference page | Existing route/component | Existing data/workflow source |
|---|---|---|
| Home | `/dashboard`, `/home`, `/m/dashboard` → `components/ITDashboardHome.js` + `public/it-dashboard-home.html` | `lib/mobile`, `lib/procure`, `lib/dpr`, `lib/money`, `lib/tasks`, `lib/stock`, `lib/notify`, `lib/data` |
| Muster Roll & Wages | `/wages` → `app/wages/page.js`; attendance/payroll summary components | `lib/payroll`, `lib/staffpay`, attendance/data modules |
| Workers & Staff | `/workers` → `app/workers/page.js` | `lib/data`, `lib/mobile`, `lib/access`, `lib/payPrivacy` |
| Delivery Challans | `/stock/challans` → `app/stock/challans/page.js` | `lib/challan`, `lib/receiving`, `lib/clients`, `lib/tally` |
| Pending Deliveries | `/procure/pending` → `app/procure/pending/page.js` | `lib/pending`, `lib/procure`, `lib/prices` |
| Material Stock | `/stock` → `app/stock/page.js` | `lib/stock`, existing GRN/import workflows |
| Procurement & POs | `/procure` → `app/procure/page.js`, `components/ProcureView.js` | `lib/procure`, existing PO/indent actions |
| Catalogue | `/order` → `app/order/page.js`, `components/CatalogueOrder.js` | existing catalogue/cart/order APIs |
| Expenses & Petty Cash | `/expenses` → `app/expenses/page.js`, `components/ExpensesView.js` | `lib/money`, existing ledger/request APIs |
| RA Billing | `/billing` → `app/billing/page.js` | billing/BOQ APIs and print/export actions |
| Vendor Master | `/vendors` → `app/vendors/page.js` | vendor/procurement APIs |
| Tools & Assets | `/assets` → `app/assets/page.js` | asset APIs and import/export actions |
| Machine Repair | `/repairs` → `app/repairs/page.js` | `lib/machine-repair`, draft/file/receipt flows |
| Letters & Documents | `/letters` → `app/letters/page.js` | `lib/letters`, templates, generation/print |
| Notice Board | `/notices` → `app/notices/page.js` | `lib/notices`, read/ack/comment/post flows |

## Work status
- [partial] Shared shell: role-scoped IT design feature flag, official shared sidebar/mobile navigation, platform/layout detection, saved dark/light theme. Verify the remaining responsive and visual details against all supplied screenshots.
- [partial] Home: connected existing ERP data and actions to the reference dashboard, removed fabricated default ring progress, added honest empty states, added an empty-state fallback, and made the iframe stop blocking on a slow data/ready handshake.
- [done] Muster Roll & Wages: IT-only responsive styling added to the existing six live payroll/attendance tabs; dates, site filters, summaries, edits, export, approval, and payment actions remain on existing logic.
- [done] Workers & Staff Master: IT-only live KPI, completeness donut, trade/site distribution charts; masked mobile display in worker, staff, and exited lists. Raw numbers remain in records/forms/exports.
- [done] Delivery Challans: IT-only responsive register, receipt-status donut from the current live filtered rows, and responsive KPI/form styling; upload, AI extraction, manual entry, PO matching, proof, save, receipt, and export flows remain unchanged.
- [done] Pending Deliveries: IT-only responsive pending register and aging distribution chart derived from live pending-summary values; site/vendor/date/status/search filters, price visibility gating, delivery, follow-up, history, and short-close actions remain unchanged.
- [done] Material Stock: IT-only responsive inventory cards, live movement distribution by item/site balance, and low-stock health indicator; existing stock entry, stock-rate permission, GRN, exchange, order, export, and price visibility behavior remains unchanged.
- [done] Procurement & POs: IT-only responsive live request/PO summary and delivery-status chart; existing filters, price gating, indent edits/deletes, quotes, approvals, PO creation/cancellation, delivery updates, and exports remain unchanged.
- [done] Order Materials: IT-only desktop catalogue styling and live overview of filtered materials, catalogue groups, master options, and cart lines; existing catalogue search, filters, size selection, cart, price access, and order submission remain unchanged.
- [done] Expenses & Petty Cash: IT-only expense-status donut from database ledger totals and petty-cash balance chart from live reconciliation data; existing money tabs, filters, approval/reversal/voucher actions, and price permissions remain unchanged.
- [done] RA Billing: IT-only live bill count/value summaries and status donut for the selected site; existing billing modes, group assignment, BOQ calculations, editing, status flow, settings, and print/delete actions remain unchanged.
- [done] Vendor Master: IT-only live vendor/active/inactive counts and supply-category distribution from saved vendor profiles; add/edit, activate/deactivate, permission-gated delete, and export actions remain unchanged.
- [done] Tools & Assets: IT-only live asset status distribution and category bars from the existing asset register; add/import/edit/transfer/calibration/repair/loss/export actions remain unchanged.
- [done] Machine Repair: IT-only live request/machine totals and request-status donut from repair records visible under existing site permissions; draft, photo, vendor dispatch, receipt, and return actions remain unchanged.
- [done] Letters & Documents: IT-only live counts of saved document types, staff templates, and labour templates with an audience donut; create, issue, company rules, register, print, and cancel behavior remains unchanged.
- [done] Notice Board: IT-only live notice, urgent, pinned, and pending-acknowledgement totals with a priority donut from the current visible/filter set; publish, edit, pin, read, acknowledge, comments, and remove actions remain unchanged.
- [done] Shared IT role gate: apply the normalized `it_executive` role flag, theme, and device layout from the persistent root shell on every route, including pages without a sidebar; remove IT-only root styling for all other roles.
- [todo] Audit remaining pages and role-specific data masking.
- [todo] Desktop, tablet, iOS, and Android screenshot/interaction review; contrast and permission/data regression review.

## Files changed
- `components/ITDashboardHome.js`: desktop shell uses the real permission-aware Sidebar; dashboard iframe renders without a blocking handshake; live source data/empty states remain in use.
- `public/it-dashboard-home.html`: ERP-shell mode hides the duplicate prototype sidebar/tab bar/logo, empty-state fallback clears stale samples, and theme storage changes sync across the parent app and iframe.
- `components/Sidebar.js`, `components/MobileNav.js`: IT-only platform/layout attributes and persistent theme control; mobile theme action is inside the existing More menu.
- `app/globals.css`: IT-only light surfaces, responsive spacing, motion preference, and platform-specific styles.

## Verification
- `npm run build`: passed (exit 0; all 133 static pages generated). It still reports pre-existing warnings: unresolved named imports in legacy `/app/login`, `/app/rights`, and `/app/workers`; unsupported `themeColor` metadata on many routes; one Autoprefixer warning in machine repair CSS. These warnings are not fixed by this dashboard work.
- `npm test`: passed (10 tests, 0 failures).
- `git diff --check`: passed.
- Page 2 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10).
- Page 3 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10).
- Page 4 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- Page 5 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- Page 6 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- Page 7 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- Page 8 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- Page 9 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- Page 10 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- Page 11 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- Page 12 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- Page 13 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- Page 14 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- Page 15 verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- Shared role-gate verification: `npm run build` passed (133 static pages generated); `npm test` passed (10/10); `git diff --check` passed.
- No deployment made. The all-pages exact-reference implementation is not complete; page-specific redesign and visual verification remain listed above.

