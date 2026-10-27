// update480: the Delivery Note document (reference: pipeskool-delivery-note-reference.html). Renders the model from
// lib/dnModel.js — no vendor, no vendor DC number, no rates. No hooks, so the same component serves the in-app
// preview, browser print (/stock/dc-print) and the public link page (/dn/[token], a server component).
// The CSS string deliberately avoids the characters > & quotes so it can sit inside a <style> tag in a client page
// without a hydration mismatch (see update477 notes).
import { fmtDate, qty, COMPANY } from "@/lib/dnModel";

export const DN_SHEET_PX = 794;   // A4 width at 96 dpi — the preview scales this down on narrow screens

export const DN_CSS = `
.dnsheet{width:794px;max-width:none;background:#fff;color:#14161a;padding:34px 40px 28px;font-family:Segoe UI,system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.4;box-sizing:border-box;transform-origin:top left}
.dnsheet *{box-sizing:border-box}
.dn-lh{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding-bottom:14px;border-bottom:2px solid #f47b20}
.dn-lh img{height:40px;width:auto;display:block}
.dn-legal{font-size:10.5px;letter-spacing:2.2px;font-weight:700;margin-top:7px;color:#1b2430}
.dn-addr{font-size:10.5px;color:#5b6472;line-height:1.55;margin-top:6px}
.dn-title{text-align:right}.dn-title h2{margin:0;font-size:20px;letter-spacing:.8px;font-weight:700;white-space:nowrap;line-height:1.2;color:#14161a}
.dn-no{margin-top:6px;font-size:12px}.dn-no b{font-size:14px}
.dn-meta{display:grid;grid-template-columns:repeat(3,1fr);margin-top:14px;border:1px solid #d5dae3;border-radius:10px;overflow:hidden}
.dn-meta div{padding:9px 12px;border-right:1px solid #d5dae3}.dn-meta div.last{border-right:0}
.dn-meta small,.dn-pt small{display:block;font-size:9.5px;letter-spacing:.9px;text-transform:uppercase;color:#5b6472;margin-bottom:3px}
.dn-meta b{font-size:12.5px}
.dn-parties{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
.dn-pt{border:1px solid #d5dae3;border-radius:10px;padding:10px 12px;line-height:1.5}
.dn-pt b{display:block;font-size:12.5px}
.dn-extra{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
.dnsheet table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px}
.dnsheet th{background:#f4f6fa;text-align:left;padding:9px 10px;border:1px solid #d5dae3;font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:#3a4350}
.dnsheet td{padding:11px 10px;border:1px solid #d5dae3;vertical-align:top}
.dnsheet th.n,.dnsheet td.n{text-align:right;white-space:nowrap}
.dnsheet tr.tot td{background:#fdf1e6;font-weight:700;font-size:13px}
.dnsheet thead{display:table-header-group}.dnsheet tr{page-break-inside:avoid;break-inside:avoid}
.dn-foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:12px;font-size:11px;color:#3a4350}
.dn-sign{display:grid;grid-template-columns:1.1fr 1fr;margin-top:14px;border:1px solid #d5dae3;border-radius:10px;overflow:hidden;min-height:96px;page-break-inside:avoid;break-inside:avoid}
.dn-sign div.c{padding:10px 12px;font-size:11px;display:flex;flex-direction:column;justify-content:space-between}
.dn-sign div.c.r{border-left:1px solid #d5dae3;text-align:right}
.dn-sign small{color:#5b6472;font-size:10px}
.dn-line{border-top:1px dashed #9aa3b2;padding-top:4px;color:#5b6472;font-size:10px;margin-top:34px}
.dn-cg{margin-top:12px;text-align:center;font-size:10px;color:#5b6472}
.dn-cancel{margin-top:10px;border:1.5px solid #d93025;color:#d93025;font-weight:700;text-align:center;padding:6px;border-radius:8px;letter-spacing:1px}
@media print{@page{size:A4 portrait;margin:10mm}.dnsheet{width:auto;padding:0;transform:none;box-shadow:none}.dn-noprint{display:none}}
`;

export default function DnDoc({ note, logoSrc = "/logo-dark.png" }) {
  const n = note;
  return (
    <div className="dnsheet" data-dn={n.no}>
      <div className="dn-lh">
        <div>
          <img src={logoSrc} alt="Pipeskool" width="162" height="40" />
          <div className="dn-legal">{COMPANY.legal}</div>
          <div className="dn-addr">{COMPANY.addr}<br />GSTIN: {COMPANY.gstin} · PAN: {COMPANY.pan} · CIN: {COMPANY.cin}<br />State: {COMPANY.state}, Code {COMPANY.code} · {COMPANY.email}</div>
        </div>
        <div className="dn-title"><h2>DELIVERY NOTE</h2><div className="dn-no">No. <b>{n.no}</b></div><div className="dn-no">Date: {n.date}</div></div>
      </div>
      <div className="dn-meta">
        <div><small>Buyer&apos;s order no.</small><b>{n.po || "—"}</b></div>
        <div><small>Destination</small><b>{n.destination || "—"}</b></div>
        <div className="last"><small>Delivery note date</small><b>{fmtDate(n.date)}</b></div>
      </div>
      <div className="dn-parties">
        <div className="dn-pt"><small>Consignee (Ship to)</small><b>{n.consignee.name}</b>{n.consignee.site ? <>Site: {n.consignee.site}<br /></> : null}{n.consignee.lines.map((l, i) => <span key={i}>{l}<br /></span>)}{n.consignee.contact ? <>Contact: {n.consignee.contact}<br /></> : null}State: {n.consignee.state}, Code {n.consignee.code}</div>
        <div className="dn-pt"><small>Buyer (Bill to)</small><b>{n.buyer.name}</b>{n.buyer.lines.map((l, i) => <span key={i}>{l}<br /></span>)}{n.buyer.gstin ? <>GSTIN: {n.buyer.gstin}<br /></> : null}State: {n.buyer.state}, Code {n.buyer.code}</div>
      </div>
      {(n.refNo || n.terms) && <div className="dn-extra">{n.refNo && <div className="dn-pt"><small>Reference no. &amp; date</small>{n.refNo}</div>}{n.terms && <div className="dn-pt"><small>Terms of delivery</small>{n.terms}</div>}</div>}
      <table>
        <thead><tr><th style={{ width: 44 }}>Sr</th><th>Description of goods</th><th style={{ width: 90 }}>HSN/SAC</th><th className="n" style={{ width: 130 }}>Quantity</th></tr></thead>
        <tbody>
          {n.lines.map(l => <tr key={l.sr}><td>{l.sr}</td><td><b>{l.desc}</b></td><td>{l.hsn}</td><td className="n"><b>{qty(l.qty)} {l.unit}</b></td></tr>)}
          <tr className="tot"><td colSpan={3} className="n">Total</td><td className="n">{qty(n.totalQty)}{n.unitLabel ? " " + n.unitLabel : ""}</td></tr>
        </tbody>
      </table>
      <div className="dn-foot"><span>E. &amp; O.E.</span></div>
      <div className="dn-sign">
        <div className="c"><small>Received in good condition</small><div className="dn-line">Receiver&apos;s name, signature and date</div></div>
        <div className="c r"><b>for Pipeskool Projects Pvt Ltd</b><div className="dn-line">Authorised Signatory</div></div>
      </div>
      {n.cancelled && <div className="dn-cancel">CANCELLED</div>}
      <div className="dn-cg">This is a computer generated document</div>
    </div>
  );
}
