# Attendance Register redesign — IT Executive only (update 479)

Branch `feat/it-attendance-register` (from `main` 05a42be). Not deployed, not merged. Reference: `pipeskool-attendance-register-redesign.html`.

## Step 0 — what was found
- **Current page** `app/attendance/page.js`: one client component; `getAttendance(date, site)` loads every row of the day (no server paging), `DataTable` filters / sorts / pages (25) / exports CSV in the browser; tabs Office · Site staff · Labour (staff = punch-profile mobile matches an `app_users` login; Office = site named Head Office / Office) · Not punched (`fn_not_punched`); actions `verifyAttendanceRow` (direct `update attendance set verify_status='verified', verified_at` — stores *when*, not *who*), `approveOt` (modal), `editAttendanceRow` (`fn_edit_attendance`, prompts), not-punched marks / overrides / cutoff times; rejected-punch banner (`punch_failures`), holiday badge (`company_holidays`).
- **Data**: `attendance` (punch_in/out, lat/lng, distance_m, selfie/proxy photo keys, punch_type self|proxy, verify_status pending|verified|corrected, verified_by/at, ot_hours, ot_approved(_hours), review_status, site_manual…), `workers` (category, labour_type own|contractor, contractor_id/name, site_id, is_active, last_working_day), `worker_sites` (allotments), `app_users` + `user_sites` (staff and their sites), `sites` (shift_start / shift_end, geofence; **no grace column**), `contractors`, `attendance_audit` (append-only). **No planned-manpower table or column exists anywhere** (only `dpr.manpower_*`, which is what was present, not what was planned).
- **Rights**: the IT Executive (Satyam, id 7) holds `attendance · view/create/verify/approve/manage` on his 13 assigned sites; RLS on `attendance` allows update to anyone with create/approve/verify/manage. The second `it_executive` login (Ajit) has only machine-repair rights — he gets the new screen but every action is refused by the same rights (tested).
- **Scope**: `assignedSiteIds()` (session) on the client, `user_sites` on the server. "All sites" = the user's assigned sites.
- Roles are stored as `app_users.role = 'it_executive'`; the IT workspace (update 475) already checks it with `isITExecutiveRole()` in `lib/it-ui.mjs` — reused here.

## Files
- `app/attendance/page.js` — the old component is now `AttendanceClassic` (**unchanged code**); the default export mounts, reads the session and renders `ITAttendanceRegister` for the IT Executive, `AttendanceClassic` for everyone else.
- `components/ITAttendanceRegister.js` (new) — the sheet: title block, FIG. 1–7, register, Not-punched tab, photo modal, OT modal, toasts.
- `app/attendance/it-register.css` (new) — every rule scoped under `#ita-root` (nothing leaks to other pages or roles; wins over the IT theme's generic button/table rules).
- `lib/attendanceIT.js` (new) — the two RPC readers (30 s cache, invalidated on every action), verify, export (1,000 rows per call), row mapping.
- `pipeskool_it_attendance_register.sql` (new) — `fn_att_it_me`, `fn_att_it_scope`, `fn_att_it_summary`, `fn_att_it_register`, `fn_att_it_verify`. **Not yet applied to the live database** — see below.
- `tests/it-attendance.test.mjs` (new), `tests/fixtures-it-attendance-local.sql` (synthetic local fixture used by the Playwright run), `audit/it-attendance/` (screenshots, export).
- Also restored `pipeskool_po_item_thumbs.sql` (update 478): it was missing from the uploaded `main`, which made `npm test` fail there.
- Not touched: `lib/data.js` attendance functions, payroll / muster / wages, `DataTable`, any other page or role.

## Role detection
- **Client**: `isITExecutiveRole(getSession().role)` — true only for `it_executive` (any spelling/case; "It Executive" is how the app labels it).
- **Server**: `fn_att_it_me()` reads `app_users.role` for `auth.uid()`; anything but `it_executive` → `raise … errcode 42501`, which PostgREST returns as **HTTP 403** (tested for Director, Supervisor, Accountant, Storekeeper). Every new function starts with it, and `fn_att_it_verify` additionally requires `attendance · verify` or `manage` (the classic right).

## Data per panel and definitions
All aggregates come from **one call** `fn_att_it_summary(date, site)` (SQL aggregation over the day's rows in scope; nothing is computed from the paged table). The register is `fn_att_it_register(date, site, tab, filters, sort, dir, offset, limit)` — filtered, sorted and counted in SQL, 25 rows per page, select options from every row of the day, `pending` = pending rows of the whole filtered view (for "Verify visible"); `limit = 0` returns only the pending ids.

| Term | Definition (Asia/Kolkata) |
|---|---|
| punched in | attendance row for the date, site in scope, `punch_in is not null` |
| present | punched in and status ≠ absent (FIG. 3 odometer, FIG. 5, FIG. 7) |
| late | first punch-in time > the row's **own site** `shift_start` (default **09:00** when the Site Master has none; **grace = 0** — no grace field exists) |
| proxy / self | `punch_type` |
| verified / pending / corrected | `verify_status` |
| OT approved | `ot_approved = true` |
| muster roll | = verified (mirrors existing results; nothing is posted) |
| on roll | active workers whose home **or allotted** site is in scope (exited workers excluded from their last working day) + active staff assigned to a site in scope |
| planned | **not available** — FIG. 5 marks *on roll* instead and says so; "present / on roll" |
| staff / office | staff = punch-profile mobile matches a login; office = site named Head Office / Office (the classic rule) |
| not punched | `fn_not_punched` (unchanged) |
| shift marker | the most common shift start among the sites in scope (FIG. 2 / FIG. 4 / AVG PUNCH-IN); lateness is still per punch / per site; the note says when sites differ or a default was used |

FIG. 2 buckets: `before 08:00`, twelve 10-minute buckets, `after 10:00`; the back row is pending split on-time (orange) / late (red), the front row verified (green); corrected rows (neither) are grey. FIG. 4: cumulative punched-in at 5-minute steps (people before 08:00 start the curve). FIG. 5 ignores the site filter (all sites in scope), follows the date. FIG. 6 labour rows only. FIG. 7: 7 days ending on the date, site-filtered.

## Actions
- **Verify** (row, photo modal, "Verify visible (N)" with confirmation when N > 20): `fn_att_it_verify(ids)` — same right and same state change as the classic button, plus `verified_by` and one `attendance_audit` row per record (`action = 'verify'`); already-verified or out-of-scope ids are skipped (idempotent). Optimistic UI (row + FIG. 1 counts), rollback with a toast on failure, then the server figures replace the optimistic ones.
- **OT approve / edit punch / not-punched marks / cutoff times**: the existing functions, untouched (`approveOt`, `fn_edit_attendance`, `fn_mark_not_punched`, `fn_override_absent`, `fn_set_site_cutoff`); the cache is invalidated and every panel reloads.
- Wages / muster are never written by this page.

## Test results (Playwright, Chromium; RPCs run against the real SQL functions in a local PostgreSQL 16 with the synthetic fixture — the live functions are byte-identical)
Role gating: Director, Supervisor, Accountant, Storekeeper → classic register (DOM text identical to the unmodified `main` build, before/after screenshots), and `fn_att_it_summary` → **403 / 42501** for each; IT Executive → new view. Numbers: for All sites / KEI / HEAD OFFICE every FIG. 1 figure, PUNCH STATUS, late count, tab counts and the table total equal direct SQL; FIG. 5 (4 sites, ATOS 7 / 9), FIG. 6 (Helper 6, Mojahid 4), FIG. 7 (20-10 = 20 / 10), FIG. 2 end buckets (1 before 08:00, 2 after 10:00) equal direct SQL. Parity: all classic columns + Punch-in position; 25/page "Showing 1–25 of 36" → "26–36"; sort and search go to the server; Punch = Self → 12 rows; Export = whole filtered view (36 rows) with the classic 13 columns; Office / Not punched tabs; photo modal with the real photo, time, Self/Proxy, GPS, Esc closes; placeholder when no photo; late In in red + track. Actions: verify one (immediate, FIG. 1 10→11, 29→28 pending, `verified_by = 7`, one audit row), repeat = no-op, server failure → rollback + toast, OT approve (3→4), edit punch (same prompts), Verify visible (26, confirmed, one call, 26 audit rows). Edge cases: empty day, site outside scope not selectable and refused server-side, HEAD OFFICE 10:00 shift drives its lateness, site without timings → 09:00 + note, exited worker excluded from on roll, no GPS / no photo / before 08:00 / after 10:00 / multiple sites. Responsive: 1366×768, 1920×1080, 390×844 — no horizontal page scroll (table and pipeline scroll inside their panel). Reduced motion: no tokens, flow or grow animations. Keyboard: Enter verifies, Esc closes, 152 focusable controls, every chart has an `aria-label` + "View as table". Performance (mock network): page usable in ~1.5 s, filter 150 ms, paging 130 ms, summary fetched once per date/site (30 s cache). `npm test` 27/27.

Screenshots: `audit/it-attendance/` — `it-All_sites.png`, `it-KEI.png`, `it-HEAD_OFFICE.png`, `it-after-actions.png`, `it-1366x768.png`, `it-1920x1080.png`, `it-390x844.png`, `photo-modal.png`, `ot-modal.png`, `classic-director-before.png` / `classic-director-after.png`, `export.csv`.

## Database — to do once
`pipeskool_it_attendance_register.sql` (functions only; no table, column, index or policy change — the existing `(site_id, att_date)` index covers the new queries). Until it is run, the IT Executive sees "Run pipeskool_it_attendance_register.sql (update 479) in Supabase first" with a Retry on every panel; nobody else is affected. The Supabase tool asked for a confirmation that never came back, so it is **not applied yet**.

## Assumptions / could not verify
- **Planned manpower does not exist in the ERP** → FIG. 5 shows present vs on roll, labelled as such.
- **Grace period**: no field in the Site Master → late = after `shift_start` exactly; a grace column can be added later and plugged into `shift_min`.
- **Shift timings**: all 14 active sites have them today (09:00 / 09:30 / 10:00); the 09:00 default is a fallback with a note.
- Live data: the functions were run only on the local fixture (the live apply is pending), so the numbers table above is from that fixture, not production.
- Real device photos / GPS and the Vercel preview were not exercised (GitHub is read-only for this session).
- The classic page now renders a one-tick "Loading…" shell before it knows the role (the session lives in localStorage); its content and behaviour are unchanged.
