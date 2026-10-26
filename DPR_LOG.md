# DPR changes — free-text work & material, late and multi-day entries, pending calendar (update 477)

Branch `feat/dpr-free-text-backdate` (from `main`). Not deployed, not merged. Reference: `pipeskool-dpr-mockup.html`.

## Starting point found in the repo
`lib/dpr.js` and `pipeskool_dpr_late_entries.sql` already carried a first "update 477" draft (free-text save, `fn_dpr_save_late`, `fn_dpr_recent_texts`, the `dpr_backdate` permission seed) but **the screen was never rebuilt and the SQL was never run** (checked live: `dpr` has none of the new columns, the functions do not exist). This pass finishes the feature on top of that draft.

## Files changed
- `app/m/dpr/page.js` — rebuilt from the mockup: pending calendar, Today / Past date / Many days / selected-days / edit modes, numbered free-text work points, free-text material (qty + unit), late-entry box with reason chips, summary, sticky save bar above the bottom nav, History with Late entry / On time, reason and filled-on date; old BOQ-linked DPRs render read-only (quantities and hindrances shown).
- `lib/dpr.js` — `saveLateDprs(source)`, `editDprDay`, `getDprMonthStatus` (cached per site+month, invalidated on every save), `getDprPendingCount`, `invalidateDprMonths`; history rows carry `linked` for old master-linked lines.
- `lib/dpr-pending.mjs` (new) — pure helpers: `classifyMonth`, `pendingDates`, `validateLateEntry`, `monthBounds` (shared by the screen and tests).
- `components/MobileNav.js` — red "pending this month" badge on the DPR tab (site roles with the DPR right; hidden when 0).
- `lib/auth.js`, `app/access/page.js` — `dpr_backdate` ("DPR late entries (past dates)") listed in Access Rights with help text.
- `pipeskool_dpr_late_entries.sql` — extended: `fn_dpr_is_holiday`, holiday skipping, idempotent retry, `source` in the audit row, `fn_dpr_month_status`, `fn_dpr_pending_count`.
- `tests/dpr-late-entries.test.mjs` (new) — 5 unit tests (pending rule, Sunday-with-DPR, start date, validation, month bounds).
- Not changed: `app/dpr/page.js`, `app/dpr/report/page.js` (desktop digest + hindrance register keep reading the same data), attendance, stock, billing, BOQ.

## Migration — `pipeskool_dpr_late_entries.sql` (re-runnable)
1. `dpr`: `is_late`, `late_reason`, `filled_at` (backfilled from `submitted_at`/`created_at`), `entered_by` (backfilled from `filled_by`), `manpower_source`; `dpr_work_items.qty` and `dpr_materials.qty` become nullable; index on `(site_id, dpr_date)`.
2. Permission **`dpr_backdate` · `create`** (key the app checks: module `dpr_backdate`, action `create`): seeded ON wherever `dpr · create` is ON today; `fn_seed_site_permissions` (Reset to role / new site) grants it alongside `dpr · create`.
3. `fn_dpr_is_holiday(site, day)`; `fn_dpr_save_late(p)` — all validation server-side (site access, DPR create right, backdate right, no future dates, ≤ 62 days, reason ≥ 3 chars, ≥ 1 work point), one transaction, never overwrites, idempotent retry, audit row in `module_audit_log` (`dpr` / `late_entry`, dates, reason, source).
4. `fn_dpr_recent_texts(site, kind)` — "Used recently" chips from past DPR text only.
5. `fn_dpr_month_status(site, year, month)` → filled / pending / off dates + `pending_count`, server-computed; `fn_dpr_pending_count(site)` for the badge.
Run it once in the Supabase SQL editor; the final SELECT shows late/filled_at counts.

## Decisions (ambiguities)
- **Permission key**: the Access Rights table is module × action, so the right is `dpr_backdate · create`, labelled "DPR late entries (past dates)". Default ON for everyone who can create a DPR today (nobody loses access); Directors always pass.
- **Holidays**: `company_holidays` exists → a day is non-working when it is a Sunday **or** an active holiday with `applies_to` labour/both that is company-wide or lists the site. Used by the calendar and by "Skip Sundays & holidays" in Many days (label widened accordingly).
- **Photos in Many days**: attached to the **first saved day only** (never fabricated for the others); geo-tag is whatever the capture gave — never edited. Past date: optional.
- **Manpower with no attendance** (Many days / selected days): stored as 0 with `manpower_source = 'none'`; the screen says so instead of asking for one number. Past date: prefilled from that day's attendance, editable.
- **Editing an old DPR**: "Open to edit" is hidden when a DPR has BOQ/master-linked work lines — saving through the new form would turn them into free text. Free-text and late DPRs can be edited; `is_late`/`late_reason`/`filled_at` are untouched by an edit.
- **Site start**: `sites.start_date`, else the first DPR date; months before it cannot be opened in the calendar.
- **Idempotency**: double tap is blocked in the UI; on the server a single-date retry by the same person with the same reason within 3 minutes returns success for the existing row instead of "already exists".
- **Hindrances**: section removed from the form; column, data, History display, `/dpr` digest and `/dpr/report` register untouched (read-only).
- **Many days range cap**: `DPR_RANGE_MAX_DAYS = 62` in `lib/dpr-pending.mjs` and in the SQL function (both must change together).
- **Caching**: per site + month in memory on the client (the month call is one query server-side); invalidated after every save/edit. No server-side cache layer was added (no infra for it in this stack).
- **Dashboards**: the pending count is shown on the DPR tab and the DPR header; existing IT/HO dashboards were not touched (no pending-items widget to plug into without a redesign).

## What depended on old BOQ-linked work / hindrances
- `/dpr` (desktop digest) and `/dpr/report`: `getDigest` / `getHindranceRegister` unchanged — verified both pages render.
- `lib/boq.js` `searchWorkItems` and `v_activity_progress` (BOQ progress from `dpr_work_items.qty`): untouched. New free-text points have `qty = null`, so they add nothing to BOQ progress (by design: no quantity is asked).
- IT / Supervisor / Home dashboards use `getTodayDpr` truthiness and `work[].label` — shape preserved.

## Tests
- `npm test`: 21/21 (16 existing + 5 new).
- Browser (Playwright, request mock, 360 and 412 px): 84/84 — Today form and validation, Past date (reason required, chip fills reason, existing date → "Open it to edit", manpower prefilled from that day), Many days (17 of 25 days: Sundays/holiday/existing skipped, one server call, toast, pending count → "All filled"), calendar (Sunday with DPR green, holiday grey, today/future dashed, previous month, cross-month selection, site start limit, Fill N selected → one call with `source=pick`, pending count drops), no `dpr_backdate` (pending visible, not selectable, Past date refused), Open to edit, desktop `/dpr` and `/dpr/report` still render. No horizontal scroll, save bar never overlaps the bottom nav, no page errors.
- Screenshots: `audit/dpr/` — today-form, error-photos, past-date-reason, many-days-summary, history-late, calendar-pending-selected, calendar-previous-month, calendar-all-filled, no-backdate-right (each at 360 and 412).

## Not verified here
- Live data and real photo capture (geo-tag from the device camera).
- Vercel preview (GitHub is read-only for this session).
