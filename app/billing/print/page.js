"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getRaBill, lineCum, linePrev } from "@/lib/billing";

const n2 = v => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const rup = v => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
// update189: site names come from the live site master; this map is only an offline fallback.
const SITES = { 1: "KEI Industries, Sanand", 2: "SOUL Campus, GIFT City", 3: "The Creek" };

function AbstractView() {
  const p = useSearchParams();
  const billId = p.get("bill"); const siteId = Number(p.get("site"));
  const [d, setD] = useState(null); const [loading, setLoading] = useState(true);

  const [liveSiteName, setLiveSiteName] = useState("");
  useEffect(() => { import("@/lib/data").then(({ getSites }) => getSites().then(list => {
    const hit = (list || []).find(x => Number(x.id) === Number(siteId)); if (hit) setLiveSiteName(hit.name);
  })).catch(() => {}); }, [siteId]);

  useEffect(() => { if (!billId || !siteId) { setLoading(false); return; }
    getRaBill(Number(billId), siteId).then(x => { setD(x); setLoading(false); }); }, [billId, siteId]);
  useEffect(() => { if (d?.hdr) setTimeout(() => window.print(), 700); }, [d]);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Preparing abstract…</div>;
  if (!d?.hdr) return <div style={{ padding: 40, textAlign: "center" }}>Bill not found. Open this from RA Billing → Print abstract.</div>;

  const { hdr, lines } = d;
  const mode = hdr.billing_mode, mp = Number(hdr.material_pct), ip = Number(hdr.install_pct);
  const split = mode === "split" || mode === "staged";
  const gstPct = Number(d.gst_pct) || 0;
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // group by section preserving order
  const groups = [];
  lines.forEach(l => { let g = groups.find(x => x.section === (l.section || "General"));
    if (!g) { g = { section: l.section || "General", rows: [] }; groups.push(g); } g.rows.push(l); });

  const calc = l => {
    const boqAmt = (Number(l.boq_qty) || 0) * (Number(l.rate) || 0);
    const cum = lineCum(l, mode, mp, ip), prev = linePrev(l, mode, mp, ip), cur = cum - prev;
    const cumQty = split ? Number(l.cum_install_qty) || 0 : Number(l.cum_qty) || 0;
    const prevQty = split ? Number(l.prev_install_qty) || 0 : Number(l.prev_qty) || 0;
    return { boqAmt, cum, prev, cur, cumQty, prevQty, curQty: cumQty - prevQty, balQty: (Number(l.boq_qty) || 0) - cumQty, balAmt: boqAmt - cum };
  };
  const totals = lines.reduce((t, l) => { const c = calc(l);
    t.boq += c.boqAmt; t.prev += c.prev; t.cur += c.cur; t.cum += c.cum; t.bal += c.balAmt; return t; },
    { boq: 0, prev: 0, cur: 0, cum: 0, bal: 0 });

  const th = { padding: "5px 4px", border: "1px solid #999", fontSize: 9.5, background: "#0F1419", color: "#fff" };
  const td = { padding: "4px 4px", border: "1px solid #bbb", fontSize: 9.5 };
  const num = { ...td, textAlign: "right" };

  return (
    <div style={{ maxWidth: 1050, margin: "0 auto", padding: 24, background: "#fff", color: "#111", fontFamily: "Newsreader, Georgia, serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "3px solid #FF7A1A", paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Pipeskool Projects Pvt. Ltd.</div>
          <div style={{ fontSize: 11.5, color: "#555" }}>Plumbing & Piping Contractors · Ahmedabad</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Running Account Bill — RA-{hdr.bill_no}</div>
          <div style={{ fontSize: 11.5, color: "#555" }}>Abstract of measured work · printed {today}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", margin: "10px 0", fontSize: 11.5 }}>
        <div>
          <div><b>Project:</b> {liveSiteName || SITES[siteId] || "Site " + siteId}</div>
          <div><b>Bill date:</b> {hdr.bill_date} {hdr.period_from ? `· Period ${hdr.period_from} to ${hdr.period_to || ""}` : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div><b>Billing basis:</b> {mode === "staged" ? "Staged — per-item payment groups (Supply / Installation / T&C %)" : mode === "split" ? `Split — Material ${mp}% + Installation ${ip}%` : "Measured quantity"}</div>
          <div><b>Status:</b> {hdr.status}</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Sr</th><th style={th}>Code</th><th style={{ ...th, textAlign: "left" }}>Description</th><th style={th}>Unit</th>
            <th style={th}>BOQ Qty</th><th style={th}>Rate</th><th style={th}>BOQ Amount</th>
            <th style={th}>Prev Cum Qty</th><th style={th}>Prev Amount</th>
            <th style={th}>This Bill Qty</th><th style={th}>This Bill Amount</th>
            <th style={th}>Cum Qty</th><th style={th}>Cum Amount</th>
            <th style={th}>Bal Qty</th><th style={th}>Bal Amount</th>
          </tr>
        </thead>
        <tbody>
          {(() => { let sr = 0; return groups.map(g => {
            const gt = g.rows.reduce((t, l) => { const c = calc(l); t.boq += c.boqAmt; t.prev += c.prev; t.cur += c.cur; t.cum += c.cum; t.bal += c.balAmt; return t; }, { boq: 0, prev: 0, cur: 0, cum: 0, bal: 0 });
            return (
              <FragmentGroup key={g.section} g={g} gt={gt} startSr={() => ++sr} calc={calc} td={td} num={num} />
            ); }); })()}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 800, background: "#f4f4ef" }}>
            <td style={td} colSpan={6}>GRAND TOTAL</td>
            <td style={num}>{n2(totals.boq)}</td>
            <td style={td}></td><td style={num}>{n2(totals.prev)}</td>
            <td style={td}></td><td style={num}>{n2(totals.cur)}</td>
            <td style={td}></td><td style={num}>{n2(totals.cum)}</td>
            <td style={td}></td><td style={num}>{n2(totals.bal)}</td>
          </tr>
        </tfoot>
      </table>

      <div style={{ display: "flex", gap: 24, marginTop: 14, fontSize: 12 }}>
        <div style={{ border: "1.5px solid #0F1419", borderRadius: 8, padding: "10px 16px", minWidth: 330 }}>
          <table style={{ fontSize: 12, borderCollapse: "collapse" }}><tbody>
            <tr><td style={{ padding: "2px 14px 2px 0" }}>Total this bill (I)</td><td style={{ textAlign: "right", fontWeight: 700 }}>{rup(totals.cur)}</td></tr>
            <tr><td style={{ padding: "2px 14px 2px 0" }}>GST @ {gstPct}% (II)</td><td style={{ textAlign: "right", fontWeight: 700 }}>{rup(totals.cur * gstPct / 100)}</td></tr>
            <tr style={{ borderTop: "1.5px solid #0F1419" }}><td style={{ padding: "3px 14px 2px 0", fontWeight: 800 }}>GRAND TOTAL (I + II)</td><td style={{ textAlign: "right", fontWeight: 800 }}>{rup(totals.cur * (1 + gstPct / 100))}</td></tr>
          </tbody></table>
          <div style={{ color: "#555", fontSize: 10.5, marginTop: 4 }}>Cumulative to date {rup(totals.cum)} of BOQ {rup(totals.boq)} ({totals.boq ? Math.round(totals.cum / totals.boq * 100) : 0}%) · deductions as per work order</div>
        </div>
      </div>
      {hdr.remarks && <div style={{ marginTop: 8, fontSize: 11.5 }}><b>Remarks:</b> {hdr.remarks}</div>}

      <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
        <div>Prepared by ____________________</div>
        <div>Checked by ____________________</div>
        <div>For Pipeskool Projects Pvt. Ltd.</div>
      </div>
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } }`}</style>
    </div>
  );
}

function FragmentGroup({ g, gt, startSr, calc, td, num }) {
  const n2l = v => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return (
    <>
      <tr><td style={{ ...td, fontWeight: 800, background: "#eceae2" }} colSpan={15}>{g.section}</td></tr>
      {g.rows.map(l => { const c = calc(l); return (
        <tr key={l.boq_item_id}>
          <td style={{ ...td, textAlign: "center" }}>{startSr()}</td>
          <td style={td}>{l.item_code}</td>
          <td style={td}>{l.description}</td>
          <td style={{ ...td, textAlign: "center" }}>{l.unit}</td>
          <td style={num}>{n2l(l.boq_qty)}</td>
          <td style={num}>{n2l(l.rate)}</td>
          <td style={num}>{n2l(c.boqAmt)}</td>
          <td style={num}>{n2l(c.prevQty)}</td>
          <td style={num}>{n2l(c.prev)}</td>
          <td style={num}>{n2l(c.curQty)}</td>
          <td style={num}>{n2l(c.cur)}</td>
          <td style={num}>{n2l(c.cumQty)}</td>
          <td style={num}>{n2l(c.cum)}</td>
          <td style={num}>{n2l(c.balQty)}</td>
          <td style={num}>{n2l(c.balAmt)}</td>
        </tr>
      ); })}
      <tr style={{ fontWeight: 700, background: "#f7f6f1" }}>
        <td style={td} colSpan={6}>Sub-total — {g.section}</td>
        <td style={num}>{n2l(gt.boq)}</td><td style={td}></td><td style={num}>{n2l(gt.prev)}</td>
        <td style={td}></td><td style={num}>{n2l(gt.cur)}</td><td style={td}></td><td style={num}>{n2l(gt.cum)}</td>
        <td style={td}></td><td style={num}>{n2l(gt.bal)}</td>
      </tr>
    </>
  );
}

export default function AbstractPage() {
  return <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading…</div>}><AbstractView /></Suspense>;
}
