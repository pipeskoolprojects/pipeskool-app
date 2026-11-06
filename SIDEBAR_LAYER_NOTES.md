# Update 489: nothing hides under the sidebar (Expand / full-screen layers / pop-ups)

## Cause
- On Money & expenses, **Expand** turned the ledger into a full-window layer (`position: fixed; inset: 0`) that started at the window's left edge.
- In the IT layout, the sidebar is painted above the content area, so it covered:
  - the checkbox, Date and Claimant columns;
  - the first tabs.
- In the Director layout, the sidebar was hidden behind the layer instead.
- About 90 pop-up backdrops across the app (`position: fixed; inset: 0`) and the Assistant's full-screen mode followed the same left-edge rule.

## Fix (layout only; no data, filter, tab or table logic changed)
- **Sidebar width.** `components/Sidebar.js` measures the sidebar's real right edge and publishes it as `--sb-w` on `<html>`.
  - Measured widths: 274 px in the IT layout and 240 px for the Director.
  - It is `0px` when the sidebar is hidden, on phones, or on pages without a sidebar.
  - It is re-measured on resize, zoom and scaling.
- **Expanded layers.** `app/globals.css` adds one shared class, `.psk-layer`: `position: fixed; top: 0; right: 0; bottom: 0; left: var(--sb-w); transition: left .25s ease`.
  - Money & expenses → Expand now uses it.
  - The Assistant's full-screen mode starts at `--sb-w + 16px`.
- **Pop-ups.** One shared CSS rule makes every full-window pop-up backdrop start at `--sb-w` on screens wider than 760 px, so dialogs are centred in the content area. This covers inline `position: fixed; inset: 0` backdrops and the `.aid-overlay`, `.sd-modal` and `.co-modal` classes.
- **Sliding.** When the menu is re-opened it slides in over 0.25 s, and the expanded layer slides with it.
- **☰ button.** When the sidebar is hidden, the expanded tab bar leaves room for the ☰ button.
- **Sticky columns.** `components/DataTable.js` gets an optional `stickyCols` prop (default 0, so all other tables are unchanged).
  - The Expenses ledger uses `stickyCols={3}`, so checkbox, Date and Claimant stay visible while the table scrolls sideways.
  - The header row was already sticky.

## Not changed
- Phones (760 px and narrower): the sidebar is not shown there, and the mobile navigation is unchanged.
- 761–1100 px: the sidebar still pushes the content, as it does today. No overlay or scrim was added, because content is never covered in this width range.

## Tests
`tests/e2e-sidebar-layers.playwright.js` passes 58/58 checks in Chromium.
- **Sizes:** 1366×768, 1536×864, 1920×1080; 125% and 150% Windows scaling; 90%, 110% and 125% browser zoom.
- **Sidebar and Expand:**
  - Sidebar open and hidden, with Expand on and off.
  - Close works.
  - No horizontal page scroll.
  - The slide animation runs when the menu is re-opened.
  - Sticky columns stay in place.
- **Layouts and pop-ups:**
  - Director layout.
  - The claimant pop-up.
  - Full-window layers on 8 other pages.
- **Before (current main):** at every size, the layer started at 0 px and Date, Claimant and the first tab were under the sidebar.
