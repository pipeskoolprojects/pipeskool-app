"use client";
// update478: the "Send PO" PDF, written natively (text + small JPEG thumbnails) instead of a screenshot of the page.
//
// Why: the old path (html2pdf → html2canvas) rasterised the whole page to a JPEG — 250 KB for a 3-line PO, 1 MB for
// 30 lines — and could not carry per-line pictures within any size budget. This builder writes real text (searchable,
// crisp at any zoom) and embeds each line's 96×96 thumbnail once (identical pictures share one object).
//
// Size budget (PO_PDF_BUDGET): if the file is over it, the thumbnails are re-encoded at a lower JPEG quality
// (0.55, then 0.45 — never lower); still over → the PDF is produced WITHOUT pictures and the caller is told.
// A PO with no pictures never contains an image at all.
//
// The document mirrors app/purchase/po/page.js: same letterhead, blocks, columns, totals, GST brackets, terms and
// signature. Prices appear only when the caller's PO detail carries them (priced !== false) — never for site roles.
import { makeThumb, reencodeThumb } from "./thumbs";

export const PO_PDF_BUDGET = 300 * 1024;       // bytes — "30 pictures under 300 KB"
export const PO_PDF_QUALITY_STEPS = [0.55, 0.45];
const A4 = { w: 210, h: 297 }, M = { l: 14, r: 14, t: 14, b: 16 };
const IMG_MM = 11.5;                           // picture edge on paper (96 px → ≈212 dpi)
const C = { ink: [17, 17, 17], grey: [85, 85, 85], light: [107, 114, 128], orange: [255, 122, 26], line: [226, 210, 197], fill: [254, 242, 236], red: [185, 28, 28], dark: [15, 20, 25] };
const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

let fontsReady = null;
async function loadJsPdf() {
  const [{ jsPDF }, F] = await Promise.all([import("jspdf"), import("./poFont")]);   // jspdf ships with html2pdf.js (already a dependency)
  return { jsPDF, F };
}

async function decodes(uri) {
  try { const bmp = await createImageBitmap(await (await fetch(uri)).blob()); const okk = bmp.width > 0; bmp.close && bmp.close(); return okk; } catch { return false; }
}

/** The thumbnails for the PDF: { lineIndex: dataUri(JPEG) }, re-encoded at `quality` when asked (null = as stored). */
async function prepareImages(images, quality) {
  const out = new Map();
  if (!images) return out;
  for (const [i, im] of images) {
    try {
      if (!im) continue;
      let uri = null;
      if (im.kind === "photo" && im.b64 && quality == null) { uri = "data:image/jpeg;base64," + im.b64; if (!(await decodes(uri))) uri = null; }   // a corrupt thumbnail must not reach the PDF
      else if (im.kind === "photo" && im.b64) { const b = await reencodeThumb(im.b64, quality); uri = b ? "data:image/jpeg;base64," + b : null; }
      else if (im.src) { const t = await makeThumb(await (await fetch(im.src)).blob(), { quality: quality == null ? 0.65 : quality, timeoutMs: 3000 }); uri = t ? "data:image/jpeg;base64," + t.b64 : null; }   // catalogue WebP → JPEG
      if (uri) out.set(i, { uri, key: im.item_id ? "it" + im.item_id : "ln" + i });
    } catch {}
  }
  return out;
}

function makeDoc(jsPDF, F) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.addFileToVFS("PoSerif.ttf", F.PO_FONT_REGULAR); doc.addFont("PoSerif.ttf", "PoSerif", "normal");
  doc.addFileToVFS("PoSerif-Bold.ttf", F.PO_FONT_BOLD); doc.addFont("PoSerif-Bold.ttf", "PoSerif", "bold");
  doc.setFont("PoSerif", "normal");
  return doc;
}

/**
 * Build the PO PDF.
 * @param po     the object getPODetail returns (po_no, date, vendor{}, site, site_address, items[], priced, status, approved_by, approved_at)
 * @param opts   { gstin, images: Map(lineIndex → { kind, b64?, src?, item_id }) }
 * @returns { blob, bytes, pages, images, quality, dropped }
 */
export async function buildPoPdf(po, opts = {}) {
  const { jsPDF, F } = await loadJsPdf();
  const want = opts.images && opts.images.size ? opts.images : null;
  let quality = null, imgs = want ? await prepareImages(want, null) : new Map();
  // two passes when the PO runs to several pages, so every footer can say "Page x of N" (custom TTF fonts and
  // jsPDF's placeholder substitution do not mix reliably)
  const build = im => { const a = render(jsPDF, F, po, opts, im, 0); return a.pages > 1 ? render(jsPDF, F, po, opts, im, a.pages) : a; };
  const budget = Number(opts.budget) || (typeof window !== "undefined" && Number(window.__pskPdfBudget)) || PO_PDF_BUDGET;   // window override: tests only
  let r = build(imgs);
  if (want && r.bytes > budget) {
    for (const q of PO_PDF_QUALITY_STEPS) { quality = q; imgs = await prepareImages(want, q); r = build(imgs); if (typeof window !== "undefined" && window.__pskPdfLog) window.__pskPdfLog({ q, bytes: r.bytes, images: imgs.size }); if (r.bytes <= budget) break; }
    if (r.bytes > budget) { r = build(new Map()); return { ...r, images: 0, quality: null, dropped: true, wanted: want.size, budget }; }
  }
  return { ...r, images: imgs.size, quality, dropped: false, wanted: want ? want.size : 0, budget };
}

function render(jsPDF, F, po, opts, imgs, totalPages) {
  const doc = makeDoc(jsPDF, F);
  const px = po.priced !== false;
  const items = po.items || [];
  const W = A4.w - M.l - M.r, right = A4.w - M.r, bottom = A4.h - M.b;
  const hasImg = imgs.size > 0;
  let y = M.t, page = 1;
  const txt = (s, x, yy, o = {}) => doc.text(String(s ?? ""), x, yy, o);
  const font = (st, size, col) => { doc.setFont("PoSerif", st); doc.setFontSize(size); doc.setTextColor(...(col || C.ink)); };

  // ---- letterhead (first page) ----
  doc.setFillColor(...C.orange);
  [0, 5.9, 11.8].forEach(dx => doc.roundedRect(M.l + dx, y, 4.6, 1.8, 0.9, 0.9, "F"));
  y += 5.5;
  font("bold", 15, C.dark); txt("PIPESKOOL PROJECTS PVT. LTD.", M.l, y + 3.5);
  font("normal", 8.5, C.grey); txt("Specialist Plumbing & Piping Contractors", M.l, y + 8.3);
  font("normal", 8, C.grey); txt("Ahmedabad, Gujarat" + (opts.gstin ? " · GSTIN: " + opts.gstin : ""), M.l, y + 12.3);
  font("bold", 13, C.ink); txt("PURCHASE ORDER", right, y + 1.5, { align: "right" });
  font("normal", 8.5, C.ink); txt("PO No:", right - doc.getTextWidth(String(po.po_no)) - 2.4, y + 6.5, { align: "right" }); font("bold", 8.5); txt(String(po.po_no), right, y + 6.5, { align: "right" });
  font("normal", 8.5, C.ink); txt("Date: " + (po.date || ""), right, y + 10.8, { align: "right" });
  if (po.status === "cancelled") { font("bold", 9, C.red); txt("CANCELLED", right, y + 15.3, { align: "right" }); }
  y += 16.5;
  doc.setDrawColor(...C.orange); doc.setLineWidth(1); doc.line(M.l, y, right, y); y += 6.5;

  // ---- vendor / deliver to ----
  font("bold", 9, C.ink); txt("Vendor", M.l, y); txt("Deliver to", right, y, { align: "right" });
  font("normal", 9, C.ink);
  const v = po.vendor || {}; const vl = [v.name, [v.contact, v.phone].filter(Boolean).join(" · "), v.gstin ? "GSTIN: " + v.gstin : ""].filter(Boolean);
  const dl = [(po.site || "") + " Site", po.site_address || "", "Pipeskool Site Store"].filter(Boolean);
  const vLines = vl.flatMap(s => doc.splitTextToSize(s, W / 2 - 4)), dLines = dl.flatMap(s => doc.splitTextToSize(s, W / 2 - 4));
  vLines.forEach((s, i) => txt(s, M.l, y + 4.6 + i * 4.3)); dLines.forEach((s, i) => txt(s, right, y + 4.6 + i * 4.3, { align: "right" }));
  y += 4.6 + Math.max(vLines.length, dLines.length) * 4.3 + 5;

  // ---- table geometry ----
  const cols = [{ k: "sr", w: 11.5, a: "left", h: "Sr No" }];
  if (hasImg) cols.push({ k: "img", w: IMG_MM + 2.6, a: "center", h: "" });
  cols.push({ k: "desc", w: 0, a: "left", h: "Description" }, { k: "qty", w: 13, a: "right", h: "Qty" }, { k: "unit", w: 11, a: "left", h: "Unit" });
  if (px) cols.push({ k: "rate", w: 17, a: "right", h: "Rate" }, { k: "disc", w: 13, a: "right", h: "Disc %" }, { k: "net", w: 19, a: "right", h: "Net Rate" }, { k: "gst", w: 13, a: "right", h: "GST %" }, { k: "amt", w: 22, a: "right", h: "Amount" });
  const fixed = cols.reduce((s, c) => s + c.w, 0); cols.find(c => c.k === "desc").w = W - fixed;
  let x = M.l; cols.forEach(c => { c.x = x; x += c.w; });
  const PAD = 1.8, FS = 8.5, LH = 3.9;
  doc.setLineWidth(0.2);
  const cellText = (c, s, yy, st = "normal", col = C.ink, size = FS) => { font(st, size, col); const tx = c.a === "right" ? c.x + c.w - PAD : c.a === "center" ? c.x + c.w / 2 : c.x + PAD; txt(s, tx, yy, { align: c.a === "left" ? "left" : c.a }); };
  const box = (yy, h, fill) => { doc.setDrawColor(...C.line); cols.forEach(c => { if (fill) { doc.setFillColor(...fill); doc.rect(c.x, yy, c.w, h, "FD"); } else doc.rect(c.x, yy, c.w, h, "S"); }); };
  const tableHead = () => { const h = 7.5; box(y, h, C.fill); cols.forEach(c => cellText(c, c.h, y + 5, "bold", C.ink, 7.6)); y += h; };
  const footer = () => { font("normal", 7.5, C.light); txt(totalPages ? `PO ${po.po_no} · Page ${page} of ${totalPages}` : `PO ${po.po_no}`, A4.w / 2, A4.h - 7, { align: "center" }); };
  const newPage = () => { footer(); doc.addPage(); page++; y = M.t; font("normal", 8, C.light); txt(`Purchase Order ${po.po_no} — continued`, M.l, y); txt("PIPESKOOL PROJECTS PVT. LTD.", right, y, { align: "right" }); y += 4; doc.setDrawColor(...C.orange); doc.setLineWidth(0.5); doc.line(M.l, y, right, y); doc.setLineWidth(0.2); y += 4; tableHead(); };
  tableHead();

  // ---- rows (never split: a row that does not fit moves whole to the next page, with the header) ----
  const descCol = cols.find(c => c.k === "desc"), descW = descCol.w - PAD * 2;
  items.forEach((it, i) => {
    font("normal", FS, C.ink);
    const lines = doc.splitTextToSize(String(it.item_name || ""), descW);
    const sub = it.line_kind === "exchanged" ? `Exchanged — ordered ${it.ordered_qty}, returned ${it.returned_qty}${it.exchange_ref ? " · " + it.exchange_ref : ""}` : it.line_kind === "replacement" ? `Replacement${it.exchange_ref ? " — " + it.exchange_ref : ""}` : null;
    const subLines = sub ? (font("normal", 7, C.red), doc.splitTextToSize(sub, descW)) : [];
    const im = imgs.get(i);
    const textH = PAD + lines.length * LH + (subLines.length ? subLines.length * 3.2 + 0.8 : 0) + PAD - 0.8;
    const h = Math.max(textH, im ? IMG_MM + 2.6 : 0, 7.5);
    if (y + h > bottom) newPage();
    box(y, h);
    cellText(cols[0], String(i + 1), y + PAD + 2.8);
    if (im) { try { doc.addImage(im.uri, "JPEG", cols[1].x + 1.3, y + 1.3, IMG_MM, IMG_MM, im.key, "FAST"); } catch {} }   // a bad picture → blank cell
    font("normal", FS, C.ink); lines.forEach((s, k) => txt(s, descCol.x + PAD, y + PAD + 2.8 + k * LH));
    if (subLines.length) { font("normal", 7, it.line_kind === "exchanged" ? C.red : [39, 80, 10]); subLines.forEach((s, k) => txt(s, descCol.x + PAD, y + PAD + 2.8 + lines.length * LH + k * 3.2)); }
    const ty = y + PAD + 2.8;
    cellText(cols.find(c => c.k === "qty"), String(it.qty), ty); cellText(cols.find(c => c.k === "unit"), String(it.unit || ""), ty);
    if (px) {
      cellText(cols.find(c => c.k === "rate"), it.list_rate != null ? inr(it.list_rate) : inr(it.rate), ty);
      cellText(cols.find(c => c.k === "disc"), it.discount_pct ? it.discount_pct + "%" : "—", ty);
      cellText(cols.find(c => c.k === "net"), inr(it.rate), ty);
      cellText(cols.find(c => c.k === "gst"), Number(it.gst_pct ?? 18) + "%", ty);
      cellText(cols.find(c => c.k === "amt"), inr(it.qty * it.rate), ty);
    }
    y += h;
  });

  // ---- totals (same arithmetic as the screen) ----
  if (px) {
    const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0), byGst = {};
    items.forEach(i => { const g = Number(i.gst_pct ?? 18); byGst[g] = (byGst[g] || 0) + i.qty * i.rate; });
    const gst = Object.entries(byGst).reduce((s, [g, b]) => s + Math.round(b * Number(g) / 100), 0);
    const amt = cols[cols.length - 1], span = { x: M.l, w: amt.x - M.l };
    const trow = (label, val, bold) => {
      const h = 7.2; if (y + h > bottom) newPage();
      doc.setDrawColor(...C.line); if (bold) { doc.setFillColor(...C.fill); doc.rect(span.x, y, span.w, h, "FD"); doc.rect(amt.x, y, amt.w, h, "FD"); } else { doc.rect(span.x, y, span.w, h, "S"); doc.rect(amt.x, y, amt.w, h, "S"); }
      font(bold ? "bold" : "normal", FS, C.ink); txt(label, amt.x - PAD, y + 4.9, { align: "right" }); txt(val, amt.x + amt.w - PAD, y + 4.9, { align: "right" }); y += h;
    };
    trow("Subtotal (net)", inr(subtotal), false);
    Object.entries(byGst).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([g, b]) => trow(`GST @ ${g}% (on ${inr(b)})`, inr(Math.round(b * Number(g) / 100)), false));
    trow("Total", inr(subtotal + gst), true);
  }

  // ---- terms + signature: kept together ----
  const terms = ["1. Material to be supplied as per approved make and specifications.", "2. Delivery at site within agreed lead time; delays may attract penalty.",
    "3. Material subject to inspection & testing at site; rejected material to be replaced at vendor cost.", "4. Payment as per agreed terms against GST-compliant invoice and delivery challan.", "5. This PO is governed by Pipeskool standard procurement terms."];
  const blockH = 6 + 4.5 + terms.length * 3.9 + 14 + (po.approved_by ? 4 : 0) + 12 + 6;
  if (y + blockH > bottom) { footer(); doc.addPage(); page++; y = M.t; }
  y += 6; font("bold", 8, C.ink); txt("Terms & Conditions", M.l, y); y += 4.5;
  font("normal", 7.5, C.ink); terms.forEach(t => { txt(t, M.l, y); y += 3.9; });
  y += 14; font("normal", 9, C.ink); txt("For Pipeskool Projects Pvt. Ltd.", right, y, { align: "right" });
  if (po.approved_by) { y += 4; font("normal", 7.5, C.grey); txt(`Approved by ${po.approved_by}${po.approved_at ? " on " + po.approved_at : ""}`, right, y, { align: "right" }); }
  y += 12; doc.setDrawColor(153, 153, 153); doc.setLineWidth(0.25); doc.line(right - 38, y, right, y);
  font("normal", 8.5, C.ink); txt("Authorised Signatory", right, y + 4, { align: "right" });
  footer();
  const blob = doc.output("blob");
  return { blob, bytes: blob.size, pages: page };
}
