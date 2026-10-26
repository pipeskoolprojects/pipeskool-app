# "Send PO" PDF size — before and after (update 478)

Same mock data, same browser (Chromium / Playwright), Director (prices shown). "Before" = today's html2pdf page screenshot; "after" = the new native PDF (lib/poPdf.js). Thumbnails: 96×96 JPEG; photo thumbs ≈ 2.6–2.9 KB each (textured, worst-case), catalogue pictures ≈ 1–1.6 KB.

| PO | lines | pictures | BEFORE (html2pdf) | AFTER (native) | pages | file |
|---|---|---|---|---|---|---|
| no pictures | 3 | 0 | 245.2 KB | **19.0 KB** | 1 | `po-0-images.pdf` (before: `before-html2pdf-0-images.pdf`) |
| 3 pictures (1 photo + 2 catalogue) | 3 | 3 | 273.4 KB (no pictures in it) | **25.8 KB** | 1 | `po-3-images.pdf` (before: `before-html2pdf-3-lines.pdf`) |
| 30 pictures (10 photo + 20 catalogue) | 30 | 30 | 996.6 KB (no pictures in it) | **90.2 KB** | 3 | `po-30-images.pdf` (before: `before-html2pdf-30-lines.pdf`) |
| 30 lines, 10 distinct pictures | 30 | 30 placements / 10 embedded | — | **55.3 KB** | 3 | `po-30-lines-10-pictures.pdf` |
| old PO (no item_id, matched by name) | 3 | 2 | — | 23.9 KB | 1 | `po-old-by-name.pdf` |
| corrupt thumbnail data | 2 | 1 (bad one blank) | — | 21.9 KB | 1 | `po-broken-thumb.pdf` |
| site role (Storekeeper, no prices) | 3 | 3 | — | 23.5 KB | 1 | `po-3-images-no-prices.pdf` |
| budget forced to 2% under the file → step-down | 30 | 30 | — | 87.7 KB at q 0.45 | 3 | `po-30-images-budget-tight.pdf` |
| budget forced to 30 KB → pictures dropped | 30 | 0 | — | 24.7 KB | 2 | `po-30-images-budget30k-dropped.pdf` |
| browser Print → PDF (Download PDF button), 30 pictures | 30 | 30 | (vector, unchanged path) | 106.3 KB | 3 | `print-30-images.pdf` |

Checks that passed on these files: 0-picture PO contains no image object and is smaller than before; 30 pictures < 300 KB; identical pictures stored once (10 XObjects for 30 placements); table header on every page that has rows; "Page x of y" footers; ₹ renders (embedded DejaVu Serif subset, ≈ 15 + 13 KB TTF, the fixed cost of every file); no price text in the site-role PDF.

Step-down note: re-encoding 96 px thumbnails from q 0.65 to 0.55 / 0.45 saves only ~3–10 % (each JPEG carries ~600 bytes of fixed header), so the quality steps are a small safety margin; the real size control is the 96 px thumbnail itself, and "drop pictures" is the hard stop.

Screens: `screen-0-images.png`, `screen-3-images.png`, `screen-30-images.png`, `screen-zoom.png` (tap-to-enlarge), `screen-phone-storekeeper.png` (412 px, no prices), `backfill-before.png` / `backfill-after.png` (/items/thumbnails), `items-added.png` (Material Master add with photo).
