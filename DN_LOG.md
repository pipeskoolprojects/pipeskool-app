# Delivery Note redesign + "Send to site" (update 480)

Branch `feat/delivery-note-send` (from `main` 05a42be). Not deployed, not merged. Reference: `pipeskool-delivery-note-reference.html`.

## Files
- `lib/dnModel.js` (new) — the note model built from a challan (consignee / buyer / lines / totals; **no vendor, vendor DC no., rate or amount**), message text, validation, masking, deep links, `DN_LINK_DAYS = 30`, company block.
- `components/DnDoc.js` (new) — the note (reference design), used by the in-app preview, `/stock/dc-print`, the supervisor send box's PDF and the public page. `public/logo-dark.png` (new, 420×104, the transparent logo from the reference) + `lib/dnLogo.js` (same PNG as base64 for the server PDF).
- `lib/dnPdf.js` (new) — native jsPDF rendering of the same model (A4, 12 mm margins, header repeats, rows never split, sign box kept together). Runs on the server and in the browser. 1-line note **22.0 KB**, 30-line note **25.0 KB** (2 pages).
- `lib/server/dn.js` (new) — service-role data access, `challan.send` check, tokens (192-bit `randomBytes`), link create/reuse/revoke, public note with expiry/revoke, per-IP rate limit (60/min), open logging, sends history (masked + hashed recipient, duplicate-tap guard), audit rows (`module_audit_log`, module `challan`), PDF cache per note version, optional server email.
- `app/api/dn/{link,revoke,send,history,pdf,contacts}/route.js` (new) — staff endpoints (Bearer token; `challan.send` enforced; 401 without login, 403 without the right).
- `app/dn/[token]/page.js` + `app/dn/[token]/pdf/route.js` (new) — the public, read-only note and its PDF. `next.config.js`: `/dn/*` gets `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: no-referrer`; the page also carries `robots: noindex` metadata. `components/GlobalMobileNav.js`: no app bar on `/dn/*`.
- `app/stock/challans/send/page.js` + `components/DnSendPanel.js` + `app/stock/challans/dn.css` (new) — preview + Send to site panel (desktop two columns with a sticky 390 px panel; tablet/phone one column with the fixed "Send to site" button that scrolls to the panel and hides there).
- `app/stock/challans/page.js` — row action **📤 Send to site** next to Print / PDF (all existing actions kept). `app/stock/dc-print/page.js` — prints the new note (one per page) + "Send to site" link for a single note. `components/DcSendBox.js` — the PDF that goes with the supervisor message is now the new note.
- `lib/access.js` — capability **`challan.send`** ("Send delivery note to site") under Delivery Challans in Access Rights.
- `pipeskool_delivery_note_send.sql` (new) — tables `delivery_note_links`, `delivery_note_sends` (RLS on, no browser access; server only), capability seed. Re-runnable; no existing column changed, nothing deleted.
- `tests/delivery-note-send.test.mjs` (new, 8 tests) · `audit/delivery-note/` (screenshots, PDFs, reference renders).
- Also restored `pipeskool_po_item_thumbs.sql` (update 478, missing from the uploaded `main`, which broke `npm test`).

## Migration, permission, settings
- Run `pipeskool_delivery_note_send.sql` once (Supabase SQL editor; I could not apply it from here — the tool's confirmation prompt never returns).
- Permission key: `challan.send` (admin_rights capability). Seeded ON for active IT Executives, HO Admins, Supervisors, Site Incharges, Site Engineers, Storekeepers, Project Managers/Coordinators and anyone with Stock · view. Directors always pass. Toggle in Access Rights → Delivery Challans.
- Environment: nothing new is required. The server needs `SUPABASE_SERVICE_ROLE_KEY` (already set for the file routes). Optional, for server-side email with the PDF attached: `RESEND_API_KEY` + `EMAIL_FROM` (a verified sender). `SUPABASE_URL` may override `NEXT_PUBLIC_SUPABASE_URL` for server calls (used by the local test harness only).

## Email mode: mailto fallback (server mode available when a sender is configured)
The project has no email sender today (no SMTP, no Resend/SendGrid key) — only web push. So "Send by Email" opens the user's mail app (`mailto:` with the subject "Delivery Note {no} - Pipeskool Projects" and the message), the UI says the PDF is not attached automatically, and the history row says **Opened email app**. The server path is implemented and switches on by itself when `RESEND_API_KEY` and `EMAIL_FROM` are set (plain `fetch` to Resend's REST API, no library): the PDF is attached, success/failure is shown, and the row says **Sent** / **Failed**.

## Decisions (ambiguities)
- **Honest labels**: wa.me / sms: / mailto: cannot report delivery, so rows say "Opened WhatsApp / SMS / email app"; "Sent" is only server email; once the recipient opens the link, those rows show **Opened** (link opens are logged with first/last time and a count).
- **Recipient storage**: the app stores staff numbers in full already, but the sends table stores only the masked number plus a SHA-256 hash (enough for "same person" checks); logs never carry the full number.
- **Contacts chips**: staff allotted to the challan's site (Workers & Staff Master, supervisors first) + the site's client contact (Client Master). No "last used numbers" chips, because full numbers are deliberately not stored in the sends table.
- **Reference No. & Date**: in the register this is the *vendor's* DC number, so it is never put on the note (the box would otherwise expose the vendor). Terms of Delivery: shown only when a value exists (none is stored today) — both boxes are omitted when empty, as asked.
- **Tokens**: 24 random bytes, base64url (32 chars, 192 bits). A live link is reused while valid; "Disable link" revokes every live link of the note and the next send mints a new one.
- **Rate limit** is an in-memory counter per server instance (Vercel functions scale out, so the effective limit is per instance). A shared store would need new infrastructure.
- **PDF caching**: in-memory per note version (hash of the model) per instance; a changed note (edit, cancel) gets a new PDF automatically.
- **Print vs PDF**: browser print uses the HTML note; the download / public PDF is the native jsPDF rendering of the same model (same sections, order, wording and colours — a vector file at 22–25 KB instead of an 80–90 KB browser print).
- **CANCELLED** notes print a red CANCELLED band (the register already shows the state).
- The existing "Send to supervisor" (count before GRN, update 453/454) is untouched except that its attached PDF is now the new note.

## Tests
- `npm test`: 32/32 (8 new: model has no vendor/rate; message format; validation/masking/deep links; token randomness + liveness; rate limit; recipient hashing; public note refusals + PDF with a fake database; migration/capability/headers).
- Playwright (Chromium; the Next server talks to an in-memory Supabase stand-in so the real API routes and public page run): 46/46 — register action; print view for a new note, an OLD note (no client master, no HSN) and the 30-line note (new design, no vendor, browser print 1/1/2 pages with the table header repeated); send page (message exactly as specified, 32-char token, validation errors, masked chips that fill the full number, WhatsApp → `wa.me/91<number>` direct chat with message + link, SMS on desktop → message + copy, mailto email, copy link, Share fallback, Download PDF 22.0 KB); duplicate taps → one row; database stores masked + hash only; audit rows; public link (headers, note only, phone fit with fixed Download button, PDF, open logged, unknown token message, 62nd request → 429); history survives reload and shows Opened; revoke → "no longer available" / PDF 410 → new token on next send; permissions (Storekeeper and HO Admin without the right → 403 + panel notice, Supervisor with it → 200, no login → 401); 820 px and 412 px layouts (no horizontal scroll, FAB, 16 px numeric input, 44 px targets); 30-line PDF 2 pages 25.0 KB with the header on every page. No console errors.
- Screenshots: `audit/delivery-note/` — `send-1440.png`, `send-820.png`, `send-412.png`, `send-after-actions.png`, `public-1440.png`, `public-412.png`, `reference-1440/820/412.png` (the approved reference rendered at the same widths), `pdf-1-line-1.png`, `pdf-30-lines-1/2.png`, PDFs (`Delivery-Note-PSP-319-2026-27.pdf`, `Delivery-Note-PSP-320-2026-27.pdf`, `public-download.pdf`, `print-300/312/320.pdf`).

## Not tested here — how to test on the Vercel preview
1. Run the SQL, deploy the branch to a preview, open Stock → Delivery Challans → a challan → **📤 Send to site**.
2. **WhatsApp (phone)**: type your own number → Send on WhatsApp → WhatsApp opens a chat with you, message + link ready → tap Send; the history row says "Opened WhatsApp", then "Opened" after you open the link.
3. **SMS (phone)**: Send SMS → the SMS app opens with the message. On desktop the message is shown with Copy instead.
4. **Share (Android / iPhone)**: Share… → the share sheet opens with the PDF file attached (Android Chrome, iOS Safari 15+) — pick WhatsApp / Gmail / Drive. Desktop Chrome shares text + link; browsers without share copy the message.
5. **Email**: without a sender key the mail app opens (no attachment, as the UI says). Set `RESEND_API_KEY` + `EMAIL_FROM` on the preview to test server email with the PDF attached.
6. **Public link on a phone**: open the link from WhatsApp → note scales to the screen, Download PDF fixed at the bottom; "Disable link" in the app → the link shows "no longer available".
7. **Old notes**: open any pre-existing challan's Print / PDF — new design, no vendor.
Real WhatsApp / SMS / iPhone share sheets and real email delivery could not be exercised from this environment.
