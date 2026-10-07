"use client";
// update458: ATTACHED BILLS ON THEIR OWN A4 PAGES (after the voucher page), laid out by how many there are:
//   1 bill → fills the page · 2 → stacked, one above the other · 3 or 4 → 2 × 2 grid (3 leaves the 4th cell empty)
//   5+ → pages of four; the last page follows the same rules for what is left (6 = 4 + 2 stacked, 9 = 4 + 4 + 1).
// Every bill is fitted inside its cell keeping its aspect ratio (object-fit: contain — no stretch, no crop), centred,
// thin border, caption "Bill i of N". A PDF bill is rendered page by page (pdf.js) and each page is its own tile.
// Bills keep upload order. Works for the browser's Print and for the Download PDF button (html2pdf) alike.
import { useEffect, useState } from "react";

export const PAGE_MM = 262;   // A4 297mm − 10mm margins top/bottom − allowance for page padding / rounding (an over-full page would spill a blank one)
const RENDER_SCALE = 2.2;     // pdf.js page render scale — keeps print legible (≈ 160 dpi on A4)

// expand bills → tiles (images as-is, PDFs page by page)
export async function expandBills(bills) {
  const tiles = [];
  for (const b of bills) {
    if (!b.pdf) { tiles.push({ src: b.url, kind: "image" }); continue; }
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const doc = await pdfjs.getDocument({ url: b.url, withCredentials: false }).promise;
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const vp = page.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement("canvas"); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
        tiles.push({ src: canvas.toDataURL("image/jpeg", 0.92), kind: "pdf", page: p, pages: doc.numPages });
      }
    } catch (e) { tiles.push({ src: null, kind: "pdf", error: e?.message || "PDF could not be rendered", url: b.url }); }
  }
  return tiles;
}

const chunk4 = arr => { const out = []; for (let i = 0; i < arr.length; i += 4) out.push(arr.slice(i, i + 4)); return out; };

export default function BillPages({ bills, heading = "ATTACHED BILLS", accent = "#1f2a4b", footer, pageOffset = 1, onReady }) {
  const [tiles, setTiles] = useState(null);
  useEffect(() => { let live = true; expandBills(bills || []).then(t => { if (live) { setTiles(t); onReady && onReady(t.length); } }); return () => { live = false; }; }, [bills]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!bills?.length) return null;
  if (tiles === null) return <div className="no-print muted" style={{ marginTop: 16 }}>Preparing bill pages…</div>;
  const pages = chunk4(tiles); const N = tiles.length;
  return (
    <div className="bill-pages">
      <style>{`
        .bill-pages .bp { break-before: page; page-break-before: always; height: ${PAGE_MM}mm; display: flex; flex-direction: column; box-sizing: border-box; }
        .bill-pages .bp-head { font-size: 10.5px; font-weight: 800; color: ${accent}; text-transform: uppercase; letter-spacing: .03em; margin: 0 0 4px; flex: 0 0 auto; }
        .bill-pages .bp-grid { flex: 1 1 auto; min-height: 0; display: grid; gap: 4mm; }
        .bill-pages .bp-grid.n1 { grid-template-columns: 1fr; grid-template-rows: 1fr; }
        .bill-pages .bp-grid.n2 { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
        .bill-pages .bp-grid.n3, .bill-pages .bp-grid.n4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
        .bill-pages .bp-cell { border: 1px solid #d1d5db; border-radius: 3px; padding: 3px; display: flex; flex-direction: column; min-height: 0; min-width: 0; background: #fff; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
        .bill-pages .bp-cap { font-size: 9.5px; font-weight: 700; color: ${accent}; padding: 0 2px 2px; flex: 0 0 auto; }
        .bill-pages .bp-img { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; }
        .bill-pages .bp-img img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; }
        .bill-pages .bp-foot { flex: 0 0 auto; display: flex; justify-content: space-between; font-size: 9px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 3px; margin-top: 4px; }
        @media screen { .bill-pages .bp { margin-top: 26px; outline: 2px dashed #cbd5e1; outline-offset: 8px; } }
        body.pdf-rendering .bill-pages .bp { margin-top: 0; outline: none; }   /* html2pdf renders in screen media — keep the page exactly ${PAGE_MM}mm */
      `}</style>
      {pages.map((pg, pi) => {
        const start = pi * 4;
        return (
          <div key={pi} className="bp">
            <div className="bp-head">{heading} · {N === 1 ? "1 of 1" : `${start + 1}–${start + pg.length} of ${N}`}</div>
            <div className={"bp-grid n" + pg.length}>
              {pg.map((t, i) => (
                <div key={i} className="bp-cell">
                  <div className="bp-cap">Bill {start + i + 1} of {N}{t.kind === "pdf" && t.pages > 1 ? ` · PDF page ${t.page}/${t.pages}` : ""}</div>
                  <div className="bp-img">{t.src ? <img src={t.src} alt={`Bill ${start + i + 1}`} crossOrigin="anonymous" />
                    : <div style={{ fontSize: 11, color: "#991b1b", padding: 8, textAlign: "center" }}>PDF could not be rendered for print ({t.error}).<br />Open it from the voucher's bill viewer.</div>}</div>
                </div>))}
            </div>
            <div className="bp-foot"><span>{footer || ""}</span><span>Page {pageOffset + pi + 1} of {pageOffset + pages.length}</span></div>
          </div>);
      })}
    </div>);
}
