// update480: the Delivery Note PDF — written natively with jsPDF from the SAME model the screen renders (lib/dnModel.js).
// Runs on the server (public link + staff download) and in the browser (Share with the file). Core Helvetica only
// (no ₹ on this document), one small PNG logo → a 1-line note is ≈ 20 KB, 30 lines ≈ 30 KB.
// Layout mirrors components/DnDoc.js: letterhead, info strip, consignee/buyer, table (header repeats, rows never
// split), E.&O.E., sign box, footer. Never a vendor name, DC number, rate or amount.
import { fmtDate, qty, COMPANY } from "./dnModel.js";
import { DN_LOGO_PNG } from "./dnLogo.js";

const A4 = { w: 210, h: 297 }, M = { l: 12, r: 12, t: 12, b: 14 };
const C = { ink: [20, 22, 26], mute: [91, 100, 114], line: [213, 218, 227], soft: [244, 246, 250], or: [244, 123, 32], tot: [253, 241, 230], red: [217, 48, 37] };

async function loadJsPdf() {
  const m = await import("jspdf");
  return m.jsPDF || m.default?.jsPDF || m.default;
}

/** @returns {Promise<{bytes: Uint8Array, pages: number}>} */
export async function buildDnPdf(note) {
  const jsPDF = await loadJsPdf();
  const build = total => render(jsPDF, note, total);
  let r = build(0);
  if (r.pages > 1) r = build(r.pages);
  return r;
}

function render(jsPDF, n, totalPages) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const W = A4.w - M.l - M.r, right = A4.w - M.r, bottom = A4.h - M.b;
  let y = M.t, page = 1;
  const font = (st, size, col) => { doc.setFont("helvetica", st); doc.setFontSize(size); doc.setTextColor(...(col || C.ink)); };
  const txt = (s, x, yy, o) => doc.text(String(s ?? ""), x, yy, o);
  const rrect = (x, yy, w, h, fill) => { doc.setDrawColor(...C.line); doc.setLineWidth(0.25); if (fill) { doc.setFillColor(...fill); doc.roundedRect(x, yy, w, h, 2.5, 2.5, "FD"); } else doc.roundedRect(x, yy, w, h, 2.5, 2.5, "S"); };
  const footer = () => { font("normal", 7.5, C.mute); txt(totalPages ? `Delivery Note ${n.no} · Page ${page} of ${totalPages}` : `Delivery Note ${n.no}`, A4.w / 2, A4.h - 6, { align: "center" }); };

  // ---- letterhead ----
  try { doc.addImage("data:image/png;base64," + DN_LOGO_PNG, "PNG", M.l, y, 42, 10.4, "logo", "FAST"); } catch {}
  font("bold", 7.5, [27, 36, 48]); doc.setCharSpace && doc.setCharSpace(0.5); txt(COMPANY.legal, M.l, y + 15); doc.setCharSpace && doc.setCharSpace(0);
  font("normal", 7.5, C.mute);
  const addr = doc.splitTextToSize(COMPANY.addr, 105); addr.forEach((s, i) => txt(s, M.l, y + 19.5 + i * 3.6));
  let ay = y + 19.5 + addr.length * 3.6;
  txt(`GSTIN: ${COMPANY.gstin} · PAN: ${COMPANY.pan} · CIN: ${COMPANY.cin}`, M.l, ay); txt(`State: ${COMPANY.state}, Code ${COMPANY.code} · ${COMPANY.email}`, M.l, ay + 3.6);
  font("bold", 15, C.ink); txt("DELIVERY NOTE", right, y + 5.5, { align: "right" });
  font("normal", 9, C.ink); txt("No. ", right - doc.getTextWidth(n.no) * 1.15 - 1.2, y + 11, { align: "right" }); font("bold", 10.5); txt(n.no, right, y + 11, { align: "right" });
  font("normal", 9, C.ink); txt("Date: " + n.date, right, y + 16, { align: "right" });
  y = Math.max(ay + 6, y + 20) + 2; doc.setDrawColor(...C.or); doc.setLineWidth(0.6); doc.line(M.l, y, right, y); y += 5;

  // ---- info strip ----
  const cw = W / 3, sh = 11.5;
  rrect(M.l, y, W, sh);
  doc.setDrawColor(...C.line); doc.setLineWidth(0.25); doc.line(M.l + cw, y, M.l + cw, y + sh); doc.line(M.l + 2 * cw, y, M.l + 2 * cw, y + sh);
  [["BUYER'S ORDER NO.", n.po || "—"], ["DESTINATION", n.destination || "—"], ["DELIVERY NOTE DATE", fmtDate(n.date)]].forEach(([l, v], i) => { const x = M.l + i * cw + 3.5; font("normal", 6.8, C.mute); txt(l, x, y + 4.2); font("bold", 9, C.ink); txt(doc.splitTextToSize(v, cw - 7)[0], x, y + 8.8); });
  y += sh + 4;

  // ---- parties ----
  const pw = (W - 4) / 2;
  const party = (x, label, lines) => { font("normal", 6.8, C.mute); const out = [[label, "lab"]]; lines.forEach(([s, st]) => { font(st === "b" ? "bold" : "normal", st === "b" ? 9 : 8.5); doc.splitTextToSize(s, pw - 7).forEach(t => out.push([t, st])); }); return out; };
  const L1 = party(M.l, "CONSIGNEE (SHIP TO)", [[n.consignee.name, "b"], ...(n.consignee.site ? [["Site: " + n.consignee.site, "n"]] : []), ...n.consignee.lines.map(l => [l, "n"]), ...(n.consignee.contact ? [["Contact: " + n.consignee.contact, "n"]] : []), [`State: ${n.consignee.state}, Code ${n.consignee.code}`, "n"]]);
  const L2 = party(M.l + pw + 4, "BUYER (BILL TO)", [[n.buyer.name, "b"], ...n.buyer.lines.map(l => [l, "n"]), ...(n.buyer.gstin ? [["GSTIN: " + n.buyer.gstin, "n"]] : []), [`State: ${n.buyer.state}, Code ${n.buyer.code}`, "n"]]);
  const ph = Math.max(L1.length, L2.length) * 4.1 + 6;
  [[M.l, L1], [M.l + pw + 4, L2]].forEach(([x, L]) => { rrect(x, y, pw, ph); L.forEach((it, i) => { if (it[1] === "lab") { font("normal", 6.8, C.mute); txt(it[0], x + 3.5, y + 4.2); } else { font(it[1] === "b" ? "bold" : "normal", it[1] === "b" ? 9 : 8.5, C.ink); txt(it[0], x + 3.5, y + 4.2 + i * 4.1); } }); });
  y += ph + 4;
  if (n.refNo || n.terms) { const eh = 11; [[n.refNo, "REFERENCE NO. & DATE"], [n.terms, "TERMS OF DELIVERY"]].filter(x => x[0]).forEach(([v, l], i, arr) => { const x = M.l + i * (pw + 4), w = arr.length === 1 ? W : pw; rrect(x, y, w, eh); font("normal", 6.8, C.mute); txt(l, x + 3.5, y + 4.2); font("normal", 8.5, C.ink); txt(doc.splitTextToSize(v, w - 7)[0], x + 3.5, y + 8.6); }); y += eh + 4; }

  // ---- table ----
  const cols = [{ w: 11, a: "left", h: "SR" }, { w: 0, a: "left", h: "DESCRIPTION OF GOODS" }, { w: 24, a: "left", h: "HSN/SAC" }, { w: 34, a: "right", h: "QUANTITY" }];
  cols[1].w = W - cols.reduce((s, c) => s + c.w, 0); let x = M.l; cols.forEach(c => { c.x = x; x += c.w; });
  const PAD = 2.6;
  const head = () => { const h = 7.5; doc.setFillColor(...C.soft); doc.setDrawColor(...C.line); doc.setLineWidth(0.25); cols.forEach(c => doc.rect(c.x, y, c.w, h, "FD")); font("bold", 7, [58, 67, 80]); cols.forEach(c => txt(c.h, c.a === "right" ? c.x + c.w - PAD : c.x + PAD, y + 5, { align: c.a })); y += h; };
  const newPage = () => { footer(); doc.addPage(); page++; y = M.t; font("normal", 7.5, C.mute); txt(`Delivery Note ${n.no} — continued`, M.l, y); txt(COMPANY.name, right, y, { align: "right" }); y += 3; doc.setDrawColor(...C.or); doc.setLineWidth(0.4); doc.line(M.l, y, right, y); y += 4; head(); };
  head();
  n.lines.forEach(l => {
    font("bold", 8.5, C.ink); const dl = doc.splitTextToSize(l.desc, cols[1].w - PAD * 2); const h = Math.max(8, dl.length * 3.9 + 4.6);
    if (y + h > bottom - 8) newPage();
    doc.setDrawColor(...C.line); doc.setLineWidth(0.25); cols.forEach(c => doc.rect(c.x, y, c.w, h, "S"));
    font("normal", 8.5, C.ink); txt(String(l.sr), cols[0].x + PAD, y + 5.6);
    font("bold", 8.5, C.ink); dl.forEach((s, i) => txt(s, cols[1].x + PAD, y + 5.6 + i * 3.9));
    font("normal", 8.5, C.ink); txt(l.hsn || "", cols[2].x + PAD, y + 5.6);
    font("bold", 8.5, C.ink); txt(`${qty(l.qty)} ${l.unit}`, cols[3].x + cols[3].w - PAD, y + 5.6, { align: "right" });
    y += h;
  });
  { const h = 8.5; if (y + h > bottom - 8) newPage(); doc.setFillColor(...C.tot); doc.setDrawColor(...C.line); doc.rect(cols[0].x, y, cols[0].w + cols[1].w + cols[2].w, h, "FD"); doc.rect(cols[3].x, y, cols[3].w, h, "FD"); font("bold", 9.5, C.ink); txt("Total", cols[3].x - PAD, y + 5.9, { align: "right" }); txt(`${qty(n.totalQty)}${n.unitLabel ? " " + n.unitLabel : ""}`, cols[3].x + cols[3].w - PAD, y + 5.9, { align: "right" }); y += h; }
  // ---- E&OE, sign box, footer (kept together) ----
  const blockH = 6 + 26 + 8 + (n.cancelled ? 10 : 0);
  if (y + blockH > bottom) { footer(); doc.addPage(); page++; y = M.t; }
  y += 5; font("normal", 8, [58, 67, 80]); txt("E. & O.E.", M.l, y); y += 3;
  const sw = W * 1.1 / 2.1, bh = 26; rrect(M.l, y, W, bh); doc.setDrawColor(...C.line); doc.line(M.l + sw, y, M.l + sw, y + bh);
  font("normal", 7, C.mute); txt("Received in good condition", M.l + 3.5, y + 4.5);
  doc.setLineDashPattern && doc.setLineDashPattern([1, 1], 0); doc.setDrawColor(154, 163, 178); doc.line(M.l + 3.5, y + bh - 6, M.l + sw - 3.5, y + bh - 6); doc.line(M.l + sw + 3.5, y + bh - 6, right - 3.5, y + bh - 6); doc.setLineDashPattern && doc.setLineDashPattern([], 0);
  font("normal", 7, C.mute); txt("Receiver's name, signature and date", M.l + 3.5, y + bh - 2.5);
  font("bold", 8, C.ink); txt("for Pipeskool Projects Pvt Ltd", right - 3.5, y + 4.8, { align: "right" }); font("normal", 7, C.mute); txt("Authorised Signatory", right - 3.5, y + bh - 2.5, { align: "right" });
  y += bh + 4;
  if (n.cancelled) { doc.setDrawColor(...C.red); doc.setLineWidth(0.4); doc.roundedRect(M.l, y, W, 7, 2, 2, "S"); font("bold", 9, C.red); txt("CANCELLED", A4.w / 2, y + 4.8, { align: "center" }); y += 10; }
  font("normal", 7, C.mute); txt("This is a computer generated document", A4.w / 2, y + 2, { align: "center" });
  footer();
  const ab = doc.output("arraybuffer");
  return { bytes: new Uint8Array(ab), pages: page };
}
