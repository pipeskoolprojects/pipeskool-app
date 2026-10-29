"use client";
// update355: LOCAL PURCHASE VOUCHER — A4, on the company letterhead, same style as the expense and advance vouchers.
// update485: the attached bills now really print. Root cause of "Attached bills: 1 file(s) — ." with no pages:
// this page asked Supabase Storage for signed links, but since update 460 the bill files live in Cloudflare R2, so
// every link request failed silently and the bill list came back empty. Bills now load through the app's own
// authorised file route (/api/files/v, the same one the Expense voucher and bill viewer use).
// Layout (identical for Print and Download PDF — both use the same fixed A4 pages):
//   page 1 = the voucher + the first 2 bills in the space below it (or none, if that space is too small to read);
//   next pages = 4 bills per page (2 × 2, fixed slot heights). A PDF bill is rendered page by page, one slot each.
//   Every bill sits in a bordered box "Bill i of N – file name", fitted without stretching or cropping.
//   Every page carries the voucher number and "Page x of y". The PAYMENT PENDING / PAID watermark is on page 1 only.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import { getVendorVoucher, amountInWords } from "@/lib/vendorVoucher";
import { getCompany } from "@/lib/letters";
import { ensureFileSession, fileHref } from "@/lib/files";
import { inr } from "@/lib/data";
import { A4, FOOTER_MM, CONT_HEAD_MM, CONT_FOOT_MM, GAP_MM, planPages, firstPageSpace, gridSlotMm, attachedLine, fileNameOf } from "@/lib/billLayout.mjs";

const NAVY = "#1f2a4b";
const ORANGE = "#FF7A1A";
const PX_PER_MM = 96 / 25.4;
const CAP_MM = 5, PAD_MM = 1.5;
const d = v => v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—";
const cap = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, " ") : "—";
const isPdf = p => /\.pdf($|\?)/i.test(String(p || ""));
const isHeic = p => /\.(heic|heif)($|\?)/i.test(String(p || ""));

// ---------------------------------------------------------------- bills → slots (an image = 1 slot, a PDF = 1 slot per page)
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => { try { if (img.decode) await img.decode(); } catch {} resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => reject(new Error("could not be loaded"));
    img.src = src;
  });
}
async function pdfSlots(url) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ url, withCredentials: true }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, 1700 / Math.max(base.width, base.height));   // ≈ 200 dpi on a half page — sharp in print
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas"); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push({ src: canvas.toDataURL("image/jpeg", 0.9), w: canvas.width, h: canvas.height, page: p, pages: doc.numPages });
  }
  return out;
}
async function loadBill(b, attempt = 0) {
  const url = b.url + (attempt ? (b.url.includes("?") ? "&" : "?") + "r=" + Date.now() : "");
  try {
    if (b.pdf) return (await pdfSlots(url)).map(s => ({ ...s, kind: "pdf", status: "ok" }));
    const dim = await loadImage(url);
    return [{ kind: "image", src: url, ...dim, status: "ok" }];
  } catch (e) {
    const why = isHeic(b.path) ? "HEIC photo — this browser cannot show it; open the file and save it as JPG" : (b.pdf ? "PDF could not be read" : "could not be loaded") + (e?.message && !/could not be loaded/.test(e.message) ? " (" + e.message + ")" : "");
    return [{ kind: b.pdf ? "pdf" : "image", status: "error", error: why }];
  }
}

// fit w×h inside a box (mm), keeping the aspect ratio
const fit = (w, h, bw, bh) => { if (!w || !h) return { w: bw, h: bh }; const s = Math.min(bw / w, bh / h); return { w: +(w * s).toFixed(2), h: +(h * s).toFixed(2) }; };

// one bill box (top level, so React keeps the same <img> elements between renders)
function Slot({ s, wMm, hMm, url, onRetry }) {
  const box = { w: wMm - 2 * PAD_MM, h: hMm - CAP_MM - 2 * PAD_MM };
  const f = s.status === "ok" ? fit(s.w, s.h, box.w, box.h) : null;
  return (
    <div className="vp-slot" style={{ width: wMm + "mm", height: hMm + "mm" }} data-slot={s.status}>
      <div className="vp-cap" title={s.caption}>{s.caption}</div>
      <div className="vp-imgbox" style={{ height: box.h + "mm" }}>
        {s.status === "ok" ? <img src={s.src} alt={s.caption} style={{ width: f.w + "mm", height: f.h + "mm" }} />
          : s.status === "error" ? <div className="vp-err">This bill {s.error}.<br /><button type="button" className="no-print" onClick={onRetry}>Retry</button>
              <a className="no-print" href={url} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>Open file</a></div>
          : <div className="vp-err muted">Loading bill…</div>}
      </div>
    </div>);
}

export default function VoucherPrint() {
  const [v, setV] = useState(null); const [c, setC] = useState(null); const [err, setErr] = useState("");
  const [bills, setBills] = useState([]);          // [{path, name, url, pdf}]
  const [slots, setSlots] = useState(null);        // per bill: array of slots (null while loading)
  const [voucherMm, setVoucherMm] = useState(null);
  const voucherRef = useRef(null);
  const [dl, setDl] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const id = new URLSearchParams(window.location.search).get("id");
        if (!id) { setErr("No voucher selected."); return; }
        const [row, comp] = await Promise.all([getVendorVoucher(id), getCompany()]);
        if (!row) { setErr("That voucher was not found, or you do not have rights to open it."); return; }
        setV(row); setC(comp);
        const files = (row.billFiles || (row.bills || []).map(p => ({ path: p, name: null })));
        if (files.length) await ensureFileSession();   // the cookie the file route needs for <img> / pdf.js
        const list = files.map(f => ({ path: f.path, name: fileNameOf(f.path, f.name), url: fileHref(f.path), pdf: isPdf(f.path) }));
        setBills(list);
        setSlots(Array(list.length).fill(null));
        for (let i = 0; i < list.length; i++) { const res = await loadBill(list[i]); setSlots(cur => cur.map((x, k) => k === i ? res : x)); }
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  // measure the voucher block once it is on screen (fonts loaded) → how much room is left for bills on page 1
  useLayoutEffect(() => {
    if (!v || !c) return;
    let live = true;
    const measure = () => { const el = voucherRef.current; if (el && live) setVoucherMm(el.getBoundingClientRect().height / PX_PER_MM); };
    measure();
    (document.fonts?.ready || Promise.resolve()).then(measure);
    return () => { live = false; };
  }, [v, c]);

  async function retry(i) {
    setSlots(s => s.map((x, k) => k === i ? null : x));
    const res = await loadBill(bills[i], 1);
    setSlots(s => s.map((x, k) => k === i ? res : x));
  }

  const loaded = !!v && !!c && voucherMm != null && Array.isArray(slots) && slots.every(Boolean);
  // …and the <img> elements on the pages themselves have decoded (Print / html2canvas use these, not the preloads)
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    setPainted(false); if (!loaded) return; let live = true;
    const t = setTimeout(async () => {
      const imgs = Array.from(document.querySelectorAll(".vp-page img"));
      await Promise.all(imgs.map(i => (i.complete && i.naturalWidth ? Promise.resolve() : new Promise(r => { i.onload = r; i.onerror = r; })).then(() => i.decode ? i.decode().catch(() => {}) : null)));
      if (live) setPainted(true);
    }, 0);
    return () => { live = false; clearTimeout(t); };
  }, [loaded, slots, voucherMm]);
  const ready = loaded && painted;

  // Download PDF: the same fixed A4 pages, each captured and placed on its own PDF page
  async function downloadPdf() {
    try {
      setDl("Preparing PDF…");
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      document.body.classList.add("pdf-rendering");
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pages = Array.from(document.querySelectorAll(".vp-page"));
      for (let i = 0; i < pages.length; i++) {
        setDl(`Preparing PDF… page ${i + 1} of ${pages.length}`);
        const cv = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
        if (i) pdf.addPage();
        const h = Math.min(A4.h, cv.height * A4.w / cv.width);
        pdf.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", 10, 10, A4.w, h);
      }
      pdf.save(`DVP_${String(v.voucher_no || v.id).replace(/[^A-Za-z0-9]+/g, "-")}.pdf`);
      setDl("");
    } catch (e) { setDl(""); alert("Could not create the PDF: " + (e?.message || e)); }
    finally { document.body.classList.remove("pdf-rendering"); }
  }

  if (err) return <div style={{ padding: 24 }}><div className="error" style={{ whiteSpace: "pre-wrap" }}>{err}</div></div>;
  if (!v || !c) return <div style={{ padding: 24 }} className="muted">Loading…</div>;

  // ---------------------------------------------------------------- slots in order, with their captions
  const N = bills.length;
  const flat = [];
  (slots || []).forEach((list, bi) => (list || [{ status: "loading" }]).forEach(s => flat.push({ ...s, bill: bi,
    caption: `Bill ${bi + 1} of ${N}${s.kind === "pdf" && s.pages > 1 ? ` (page ${s.page} of ${s.pages})` : ""} – ${bills[bi]?.name || ""}` })));
  const tall = voucherMm != null && voucherMm > A4.h - FOOTER_MM;
  const plan = voucherMm == null ? [{ page: 1, slots: [], layout: "voucher" }] : planPages(flat.length, tall ? A4.h : voucherMm);
  const total = plan.length;
  const firstSpace = voucherMm == null ? 0 : firstPageSpace(voucherMm);
  const firstHas = plan[0].slots.length > 0;

  const th = { fontSize: 10.5, textAlign: "left", padding: "6px 8px", background: "#f3f4f6", borderBottom: "1px solid #e5e7eb" };
  const td = { fontSize: 12, padding: "6px 8px", borderBottom: "1px solid #f0f1f3" };
  const unpaid = v.payment_status !== "paid";

  const pageFoot = n => <div className="vp-foot"><span>{v.voucher_no} · {v.vendor}</span><span>Page {n} of {total}</span></div>;

  return (
    <div id="voucher-doc">
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        #voucher-doc { background: #e5e7eb; min-height: 100vh; padding: 16px 0 40px; color: #111; font-family: Inter, Arial, sans-serif; }
        #voucher-doc * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .vp-bar { width: ${A4.w + 20}mm; max-width: 100%; margin: 0 auto 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .vp-sheet { width: ${A4.w}mm; padding: 10mm; margin: 0 auto 12px; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.18); }
        .vp-page { width: ${A4.w}mm; height: ${A4.h}mm; position: relative; overflow: hidden; display: flex; flex-direction: column; background: #fff; box-sizing: border-box; }
        .vp-page.tall { height: auto; overflow: visible; }
        .vp-wm { position: absolute; left: 0; right: 0; top: 70mm; display: flex; justify-content: center; font-size: 64px; font-weight: 800;
                 transform: rotate(-30deg); pointer-events: none; z-index: 5; letter-spacing: 0.05em; white-space: nowrap; }
        .vp-bills1 { display: flex; gap: ${GAP_MM}mm; margin-top: ${GAP_MM}mm; }
        .vp-grid { display: grid; grid-template-columns: repeat(2, ${(A4.w - GAP_MM) / 2}mm); grid-auto-rows: ${gridSlotMm()}mm; gap: ${GAP_MM}mm; }
        .vp-slot { border: 1px solid #c9ced8; border-radius: 3px; padding: ${PAD_MM}mm; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; break-inside: avoid; page-break-inside: avoid; background: #fff; }
        .vp-cap { height: ${CAP_MM}mm; font-size: 9px; font-weight: 700; color: ${NAVY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 0 auto; }
        .vp-imgbox { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; overflow: hidden; }
        .vp-imgbox img { display: block; image-orientation: from-image; }
        .vp-err { font-size: 11px; color: #991b1b; text-align: center; padding: 6mm; }
        .vp-head { height: ${CONT_HEAD_MM}mm; display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; font-weight: 800; color: ${NAVY}; border-bottom: 2px solid ${ORANGE}; margin-bottom: 3mm; flex: 0 0 auto; }
        .vp-foot { height: ${CONT_FOOT_MM}mm; margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; font-size: 9px; color: #6b7280; border-top: 1px solid #e5e7eb; flex: 0 0 auto; }
        body.pdf-rendering .vp-sheet { box-shadow: none; }
        @media print {
          html, body, #voucher-doc { background: #fff !important; padding: 0 !important; margin: 0 !important; min-height: 0 !important; }
          .no-print { display: none !important; }
          .vp-sheet { width: auto; padding: 0; margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
          .vp-sheet:last-of-type { break-after: auto; page-break-after: auto; }
        }
      `}</style>

      <div className="vp-bar no-print">
        <button className="primary" onClick={() => window.print()} disabled={!ready} data-print="">🖨 Print</button>
        <button onClick={downloadPdf} disabled={!ready || !!dl} data-pdf="">{dl || "⬇ Download PDF"}</button>
        <button onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign("/vendor-voucher"); }}>← Back</button>
        {!ready && N > 0 && <span className="muted" style={{ fontSize: 12.5 }} data-loading="">Loading bills… {(slots || []).filter(Boolean).length} of {N}</span>}
        {ready && flat.some(s => s.status === "error") && <span style={{ fontSize: 12.5, color: "#b91c1c" }}>{flat.filter(s => s.status === "error").length} bill(s) could not be loaded — Retry on the bill, or print without it.</span>}
      </div>

      {/* ---------------- page 1: the voucher (+ first bills) */}
      <div className="vp-sheet"><div className={"vp-page" + (tall ? " tall" : "")} id="voucher-page" data-page="1">
        <div className="vp-wm" style={{ color: unpaid ? "rgba(180,83,9,0.10)" : "rgba(21,128,61,0.10)" }}>{unpaid ? "PAYMENT PENDING" : "PAID"}</div>
        <div ref={voucherRef} style={{ flex: "0 0 auto" }}>
          <div style={{ display: "flex", gap: 18, alignItems: "flex-start", borderBottom: "3px solid " + ORANGE, paddingBottom: 10 }}>
            <Logo height={22} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: NAVY }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>{c.address}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "#6b7280", fontWeight: 700 }}>LOCAL PURCHASE VOUCHER</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>{v.voucher_no || "—"}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{d(v.expense_date)}</div>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14 }}>
            <tbody>
              <tr>
                <td style={{ ...td, width: "16%", color: "#6b7280", fontSize: 10.5 }}>Vendor</td>
                <td style={{ ...td, fontWeight: 700 }}>{v.vendor}
                  {v.vendor_address && <div style={{ fontWeight: 400, fontSize: 10.5, color: "#6b7280" }}>{v.vendor_address}</div>}</td>
                <td style={{ ...td, width: "16%", color: "#6b7280", fontSize: 10.5 }}>Site</td>
                <td style={{ ...td, fontWeight: 700 }}>{v.site}</td>
              </tr>
              <tr>
                <td style={{ ...td, color: "#6b7280", fontSize: 10.5 }}>Payment mode</td>
                <td style={td}>{cap(v.pay_mode)}{v.payment_ref ? ` · ${v.payment_ref}` : ""}</td>
                <td style={{ ...td, color: "#6b7280", fontSize: 10.5 }}>Payment status</td>
                <td style={{ ...td, fontWeight: 700, color: unpaid ? "#b45309" : "#15803d" }}>{unpaid ? "PENDING" : `PAID ${d(v.paid_on)}`}</td>
              </tr>
              <tr>
                <td style={{ ...td, color: "#6b7280", fontSize: 10.5 }}>Raised by</td>
                <td style={td}>{v.raisedBy}</td>
                <td style={{ ...td, color: "#6b7280", fontSize: 10.5 }}>Approval</td>
                <td style={{ ...td, textTransform: "capitalize" }}>{v.status}</td>
              </tr>
            </tbody>
          </table>

          {v.items.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
              <thead><tr>
                <th style={{ ...th, width: 34 }}>#</th><th style={th}>Item / material</th>
                <th style={{ ...th, textAlign: "right" }}>Qty</th><th style={th}>Unit</th>
                <th style={{ ...th, textAlign: "right" }}>Rate</th><th style={{ ...th, textAlign: "right" }}>Amount</th>
              </tr></thead>
              <tbody>
                {v.items.map((l, i) => (
                  <tr key={i}>
                    <td style={td}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{l.item_name}</td>
                    <td style={{ ...td, textAlign: "right" }}>{l.qty ?? "—"}</td>
                    <td style={td}>{l.unit || "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{l.rate != null ? inr(l.rate) : "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{inr(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 14px" }}>
              <div className="muted" style={{ fontSize: 10.5 }}>Particulars</div>
              <div style={{ fontSize: 12.5, overflowWrap: "anywhere" }}>{v.note || "—"}</div>
            </div>
          )}
          {v.items.length > 0 && v.note && <div className="muted" style={{ fontSize: 11.5, marginTop: 6, overflowWrap: "anywhere" }}>Purchased: {v.note}</div>}
          {v.remarks && <div className="muted" style={{ fontSize: 11.5, marginTop: 4, overflowWrap: "anywhere" }}>Remarks: {v.remarks}</div>}

          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 11.5 }}>
              <span className="muted" style={{ fontSize: 10.5 }}>Amount in words</span>
              <div style={{ fontWeight: 700, fontStyle: "italic", color: NAVY }}>{amountInWords(v.amount)}</div>
            </div>
            <div style={{ background: "#fff4e5", border: "1px solid #fdba74", borderRadius: 8, padding: "8px 18px", display: "flex", gap: 24, alignItems: "center", flex: "0 0 auto" }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: NAVY }}>TOTAL</span>
              <span style={{ fontWeight: 800, fontSize: 19, color: NAVY }}>{inr(v.amount)}</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 30, marginTop: 10, fontSize: 12 }}>
            {["Prepared by", "Approved by", "Received by (vendor)"].map(l => (
              <div key={l} style={{ flex: 1 }}>
                <div style={{ borderTop: "1px solid #333", paddingTop: 4, marginTop: 30, fontStyle: "italic", color: "#374151" }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, fontSize: 11.5, color: "#374151", overflowWrap: "anywhere" }} data-attached="">
            {N ? <><b style={{ color: NAVY }}>Attached bills:</b> {attachedLine(bills.map(b => b.name), firstHas).replace(/^Attached bills: /, "")}</> : <b style={{ color: NAVY }}>No bills attached</b>}
          </div>
        </div>

        {firstHas && (
          <div className={"vp-bills1 n" + plan[0].slots.length}>
            {plan[0].slots.map(i => <Slot key={i} s={flat[i]} wMm={plan[0].slots.length === 1 ? A4.w : (A4.w - GAP_MM) / 2} hMm={firstSpace} url={bills[flat[i].bill]?.url} onRetry={() => retry(flat[i].bill)} />)}
          </div>)}

        <div style={{ marginTop: "auto", height: FOOTER_MM + "mm", flex: "0 0 auto", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ paddingTop: 4, borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: 9.5, fontWeight: 700, color: "#4b5563", lineHeight: 1.6 }}>
            <div>CIN No: {c.cin} &nbsp; GSTIN: {c.gstin} &nbsp; · &nbsp; Email ID: {c.email}</div>
            <div style={{ fontWeight: 400, color: "#9ca3af" }}>Direct purchase — no purchase order was raised. Recorded as a company expense against {v.site}. Printed {new Date().toLocaleDateString("en-IN")}.</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6b7280", marginTop: 2 }}><span>{v.voucher_no}</span><span data-pageno="">Page 1 of {total}</span></div>
        </div>
      </div></div>

      {/* ---------------- pages 2…: the remaining bills, 4 per page */}
      {plan.slice(1).map(pg => (
        <div className="vp-sheet" key={pg.page}><div className="vp-page" data-page={pg.page}>
          <div className="vp-head"><span>LOCAL PURCHASE VOUCHER {v.voucher_no} · ATTACHED BILLS{firstHas || pg.page > 2 ? " (continued)" : ""}</span><span style={{ fontWeight: 600 }}>{v.vendor} · {v.site}</span></div>
          <div className="vp-grid">{pg.slots.map(i => <Slot key={i} s={flat[i]} wMm={(A4.w - GAP_MM) / 2} hMm={gridSlotMm()} url={bills[flat[i].bill]?.url} onRetry={() => retry(flat[i].bill)} />)}</div>
          {pageFoot(pg.page)}
        </div></div>
      ))}
    </div>
  );
}
