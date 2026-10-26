# PO line pictures (update 478)

Branch `feat/po-line-images` (from `main` 0c79a74). Not deployed, not merged. Every PO line shows the item's picture — on screen, in the browser print (Download PDF) and in the PDF sent to the vendor — within a strict size budget.

## Files changed
- `pipeskool_po_item_thumbs.sql` (new) — table `item_thumbs` + `fn_item_thumb_save`. Re-runnable. **Not yet applied to the live database** (the Supabase tool paused on a confirmation that never came back; checked afterwards — `item_thumbs` does not exist). See "Database" below.
- `lib/thumbs.js` (new) — `makeThumb` (96×96, white-flattened JPEG q 0.65, 8 s limit, never throws), `saveItemThumb`, `makeAndSaveThumb`, `getLineImages` (pictures for a PO's lines), `listThumbTargets` + `backfillThumbs` (the backfill).
- `lib/poPdf.js` (new) — the "Send PO" PDF written natively with jsPDF (text + thumbnails) instead of a page screenshot; 300 KB budget with quality step-down and picture drop.
- `lib/poFont.js` (new) — DejaVu Serif regular + bold, subset to the PO's characters (₹ included), ≈ 28 KB, loaded only with the PDF builder.
- `app/purchase/po/page.js` — picture column (only when a line has one), `loading="lazy"`, tap-to-enlarge original, print rules (header row on every page, rows never split), "Send to vendor" uses `lib/poPdf.js`.
- `app/items/page.js` — the thumbnail is made right after a photo upload (every size of a multi-size add gets it); link "🖼 PO pictures" to the backfill page.
- `app/items/thumbnails/page.js` (new) — backfill screen.
- `lib/procure.js` — `getPODetail` reads `po_items.item_id` (ordered by id). `lib/stock.js` — `addItem` returns the new `id`.
- `tests/po-images.test.mjs` (new), `audit/po-images/` (sample PDFs, screenshots, size table).
- Not changed: PO creation, approval, rates editing, GRN, challans, stock, catalogue, other roles' screens. `html2pdf.js` stays for Delivery Challans and Machine Repair; `jspdf` is its existing dependency (no new library).

## Where a picture comes from (per PO line)
1. `po_items.item_id` → `item_thumbs` (a 96×96 JPEG made once from the Material Master photo). Shown only while it still matches the item's **current** `photo_url` (photo replaced or removed → blank until re-made).
2. Else the item's Astral catalogue picture bundled with the app (`catalogue_product_items` → `catalogue_products.image` → `lib/catalogueImages.js`, tiny WebP, nothing to store).
3. Lines without `item_id` (old POs, before it was stored — 168 of 1,223 lines live) are matched to `item_master.display_name` exactly (one query); 12 of those match today.
4. Nothing found → blank cell. A PO with no pictures at all has no picture column and an unchanged PDF.
Live today: 1,055 / 1,223 PO lines carry `item_id`; 9 items have a Material Master photo; 1,645 items are linked to 316 catalogue pictures — so most lines of Astral POs get a picture immediately, and photo-based pictures appear as photos are uploaded.

## Thumbnails — how they are made and stored
- Made **in the browser** (canvas) at upload on the Item Master page: fit inside 96×96, centred on white (transparent PNG logos print cleanly), JPEG quality 0.65 → ≈ 1–6 KB (textured photos ≈ 3–6 KB, flat product shots ≈ 1–2 KB). A 10 MB original decodes once (`createImageBitmap`) and takes ~0.4–0.7 s; anything that cannot be read or takes over 8 s is simply skipped — the item save never waits for or fails because of a thumbnail.
- Stored in `item_thumbs(item_id pk, data base64 JPEG, bytes, source, src = the photo key it was made from, updated_by, updated_at)`. Readable by every logged-in role (pictures carry no price). Written only through `fn_item_thumb_save` (needs the Material Master right; rejects anything that is not a JPEG or is over ~30 KB).
- Why the database and not R2: the PO page then needs **one query** for all its pictures and never touches the originals (which stay in R2 and are fetched only on tap-to-enlarge, or when making a thumbnail). 2,500 items × 5 KB would be ~12 MB at most.

## Backfill (existing photos)
No server-side image library is allowed/available, so the backfill runs in the browser with the same code as the upload path:
**Item master → "🖼 PO pictures" (or open `/items/thumbnails`) → "Make N thumbnails".** It lists photos without a matching thumbnail, makes them one by one (8 s limit each), reports the ones that failed (404 / corrupt / too slow) and can be re-run any time; "Re-make all" redoes every photo. Today that is 9 items — well under a minute. No command line, nothing to install.

## The PDF (Send PO)
- Native jsPDF document (A4, 14 mm margins), same letterhead / blocks / columns / GST brackets / terms / signature as the screen; running header "Purchase Order … — continued" and the table header on every page, rows never split, "PO · Page x of y" footer (two passes when more than one page).
- Pictures 11.5 mm square from the stored thumbnail (catalogue WebP converted to JPEG at build time); identical pictures are placed by alias so they are embedded once (30 lines / 10 pictures → 10 image objects).
- Budget `PO_PDF_BUDGET = 300 KB`: over it → thumbnails re-encoded at 0.55, then 0.45 (never lower); still over → PDF without pictures and the user is told "Pictures were left out to keep the file under 300 KB". Measured: 30 pictures = 90 KB.
- A thumbnail that does not decode is skipped (blank cell), never a failed PDF.
- Prices: the builder prints price columns only when the PO detail carries them (`priced !== false`), exactly as the screen — site roles get pictures, no ₹.

## Size table (before → after)
See `audit/po-images/sizes.md`. Headline: 3-line PO 273 KB → **25.8 KB with 3 pictures**; 30-line PO 997 KB → **90 KB with 30 pictures**; no-picture PO 245 KB → **19 KB** (no image object at all). Browser Print → PDF of the 30-picture PO: 106 KB, header on every page with rows.

## Tests
- `npm test`: 24/24 (21 existing + 3 new: embedded fonts are TrueType subsets with ₹, SQL guards, builder constants).
- Playwright (request mock, Director 1280 px + Storekeeper 412 px): 46/46 — 0 / 3 / 30-picture POs on screen and PDF, dedupe, old PO by name, corrupt thumbnail, budget step-down and drop, print header repeat, tap-to-enlarge fetches the original only then, lazy images, site role without prices, backfill page (12 made, 404 original reported), Material Master add with a transparent PNG (2 sizes → 2 thumbnails, aspect kept, white background) and a 10 MB PNG; no horizontal scroll on the phone; no page errors.

## Database
`pipeskool_po_item_thumbs.sql` is needed once (not yet run — Claude will run it on the next go, or paste it into the Supabase SQL editor). Until it is run: PO pages still work (catalogue pictures show; photo thumbnails simply do not exist), the Item Master save still works (the thumbnail save fails silently), and `/items/thumbnails` shows "Thumbnails not enabled yet — run pipeskool_po_item_thumbs.sql". Verify with: `select count(*) from item_thumbs;` (table exists) or by opening `/items/thumbnails`.

## Decisions / limits
- Thumbnail edge 96 px (prints at ~212 dpi in an 11.5 mm cell). Larger would double the per-picture cost for no visible gain at that size.
- The PDF font is DejaVu Serif (free licence) because the built-in PDF fonts have no ₹; the screen keeps Newsreader/Georgia. The 28 KB font is the fixed cost of every PDF and is why a no-picture PDF is 19 KB rather than 5.
- `addItem` now returns the new row's `id` (additive; callers that ignore it are unaffected). `getPODetail` orders lines by `id` (insertion order) so screen and PDF agree.
- Draft (unapproved) POs: "Send to vendor" is hidden as before; the DRAFT watermark remains a screen/print feature.
