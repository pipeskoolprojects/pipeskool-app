"use client";
// update447: ONE bill layout for every printed voucher (Cash Voucher, Direct Vendor Payment).
//
// The attached bills are fitted onto A4 automatically, ready to print:
//   1 bill  → fills the page width          2 bills → side by side
//   3 bills → two on top, one across below  4 bills → 2 × 2 grid
//   5+      → the rest overflow onto continuation pages of up to four each.
// Page 1 (the voucher itself) keeps as many bills as still fit LEGIBLY under the voucher text:
// the voucher block is measured, and a bill row is only placed there if it gets at least
// MIN_ROW_MM of height; otherwise the bills start on a page of their own. Images are always
// scaled with object-fit: contain — nothing is cropped, stretched or split across a page break.
// PDF bills cannot be scaled into a grid by the browser, so each keeps its own page.
import { useLayoutEffect, useRef, useState } from "react";

const PAGE_MM = 258;      // A4 297mm minus print margins (12mm × 2) and the page padding / footer allowance
const MIN_ROW_MM = 80;    // a bill row shorter than this is not legible — move to the next page
const GAP_MM = 4;
const PX_PER_MM = 96 / 25.4;

// how many rows a group of n bills needs
const rowsFor = n => (n <= 2 ? 1 : 2);

// split bills into pages: first page gets `firstMax`, later pages up to 4
function paginate(bills, firstMax) {
  const pages = [];
  let i = 0;
  if (firstMax > 0) { pages.push({ items: bills.slice(0, firstMax), first: true }); i = firstMax; }
  while (i < bills.length) { pages.push({ items: bills.slice(i, i + 4), first: false }); i += 4; }
  return pages;
}

export default function BillSheet({ bills, voucherRef, heading = "ATTACHED BILLS / RECEIPTS", accent = "#1f2a4b", footer }) {
  const images = (bills || []).filter(b => !b.pdf);
  const pdfs = (bills || []).filter(b => b.pdf);
  // measured height of the voucher block (mm) → decides how many bills fit on page 1
  const [firstAvail, setFirstAvail] = useState(null);
  useLayoutEffect(() => {
    const el = voucherRef?.current;
    if (!el) { setFirstAvail(0); return; }
    const used = el.getBoundingClientRect().height / PX_PER_MM + 16;   // + heading, gaps and footer line
    setFirstAvail(Math.max(PAGE_MM - used, 0));
  }, [voucherRef, images.length]);

  if (!bills?.length) return null;
  if (firstAvail === null) return null;

  // largest k (≤ 4) whose rows still get MIN_ROW_MM each on page 1
  let firstMax = 0;
  for (const k of [4, 3, 2, 1]) {
    if (k > images.length) continue;
    const rowH = (firstAvail - GAP_MM * (rowsFor(k) - 1)) / rowsFor(k);
    if (rowH >= MIN_ROW_MM) { firstMax = k; break; }
  }
  const pages = paginate(images, firstMax);
  const totalPages = 1 + pages.filter(p => !p.first).length + pdfs.length;
  const rowMm = (avail, n) => Math.floor((avail - GAP_MM * (rowsFor(n) - 1)) / rowsFor(n));
  let idx = 0, pageNo = 1;

  return (
    <div className="bill-sheet">
      <style>{`
        .bill-sheet .bill-grid { display: grid; gap: ${GAP_MM}mm; }
        .bill-sheet .bill-grid.n1 { grid-template-columns: 1fr; }
        .bill-sheet .bill-grid.n2, .bill-sheet .bill-grid.n3, .bill-sheet .bill-grid.n4 { grid-template-columns: 1fr 1fr; }
        .bill-sheet .bill-grid.n3 .bill-slot:nth-child(3) { grid-column: 1 / span 2; }
        .bill-sheet .bill-slot { border: 1px solid #d9dce3; border-radius: 4px; padding: 3px; display: flex; flex-direction: column;
                                 break-inside: avoid; page-break-inside: avoid; background: #fff; overflow: hidden; min-height: 0; }
        .bill-sheet .bill-slot img { width: 100%; height: auto; object-fit: contain; display: block; flex: 1 1 0; min-height: 0; max-height: 100%; }
        .bill-sheet .bill-cap { font-size: 9.5px; font-weight: 700; color: ${accent}; padding: 1px 2px 3px; }
        .bill-sheet .bill-cont { break-before: page; page-break-before: always; }
        .bill-sheet .bill-foot { display: flex; justify-content: space-between; font-size: 9px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 4px; margin-top: 6px; }
        @media screen { .bill-sheet .bill-cont { margin-top: 18px; border-top: 2px dashed #cbd5e1; padding-top: 12px; } }
      `}</style>

      {pages.map((pg, pi) => {
        const n = pg.items.length;
        const avail = pg.first ? firstAvail : PAGE_MM - 18;
        const h = rowMm(avail, n);
        const start = idx + 1; idx += n;
        if (!pg.first) pageNo += 1;
        const thisPage = pg.first ? 1 : pageNo;
        return (
          <div key={pi} className={pg.first ? "" : "bill-cont"}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: accent, margin: "8px 0 5px", textTransform: "uppercase", letterSpacing: ".03em" }}>
              {heading} · {images.length === 1 ? "1 of 1" : `${start}–${idx} of ${images.length}`}{pg.first ? "" : " (continued)"}
            </div>
            <div className={"bill-grid n" + n} style={{ gridAutoRows: h + "mm" }}>
              {pg.items.map((b, i) => (
                <div key={i} className="bill-slot">
                  <div className="bill-cap">{b.label || ("Bill " + (start + i))}</div>
                  <img src={b.url} alt={b.label || ("Bill " + (start + i))} />
                </div>
              ))}
            </div>
            <div className="bill-foot"><span>{footer || ""}</span><span>Page {thisPage} of {totalPages}</span></div>
          </div>
        );
      })}

      {pdfs.map((b, i) => (
        <div key={"pdf" + i} className="bill-cont">
          <div style={{ fontSize: 10.5, fontWeight: 800, color: accent, margin: "8px 0 5px" }}>{heading} · PDF {i + 1} of {pdfs.length}</div>
          <iframe title={"bill-pdf" + i} src={b.url} style={{ width: "100%", height: (PAGE_MM - 30) + "mm", border: "1px solid #d9dce3" }} />
          <div className="bill-foot"><span>{footer || ""}</span><span>Page {1 + pages.filter(p => !p.first).length + i + 1} of {totalPages}</span></div>
        </div>
      ))}
    </div>
  );
}
