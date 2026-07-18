"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getPODetail } from "@/lib/procure";

function POView() {
  const params = useSearchParams();
  const poId = params.get("po");
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!poId) { setLoading(false); return; }
    getPODetail(poId).then(d => { setPo(d); setLoading(false); });
  }, [poId]);

  const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading PO…</div>;
  if (!po) return <div style={{ padding: 40, textAlign: "center" }}>PO not found. Open this from Procurement → Purchase orders → View/Print.</div>;

  const items = po.items || [];
  const gstPct = po.gst_pct || 18;
  const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const gst = Math.round(subtotal * gstPct / 100);
  const total = subtotal + gst;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 36, background: "#fff", color: "#111", fontFamily: "Newsreader, Georgia, serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "3px solid #FF7A1A", paddingBottom: 14 }}>
        <div>
          <svg width="46" height="5" viewBox="0 0 46 5" style={{ display: "block", marginBottom: 7 }}>
            <rect x="0" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
            <rect x="16.5" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
            <rect x="33" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
          </svg>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0F1419", letterSpacing: "-0.02em" }}>PIPESKOOL PROJECTS PVT. LTD.</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Specialist Plumbing &amp; Piping Contractors</div>
          <div style={{ fontSize: 11.5, color: "#555" }}>Ahmedabad, Gujarat · GSTIN: 24XXXXXXXXXXXZX</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>PURCHASE ORDER</div>
          <div style={{ fontSize: 12 }}>PO No: <b>{po.po_no}</b></div>
          <div style={{ fontSize: 12 }}>Date: {po.date}</div>
          {po.status === "cancelled" && <div style={{ color: "#b91c1c", fontWeight: 700, marginTop: 4 }}>CANCELLED</div>}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", margin: "18px 0", fontSize: 12.5 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Vendor</div>
          {po.vendor.name}<br />
          {po.vendor.contact && <>{po.vendor.contact} · </>}{po.vendor.phone}<br />
          {po.vendor.gstin && <>GSTIN: {po.vendor.gstin}</>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Deliver to</div>
          {po.site} Site{po.site_address && <><br />{po.site_address}</>}<br />
          Pipeskool Site Store
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: "#FEF2EC" }}>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "left" }}>#</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "left" }}>Description</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>Qty</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px" }}>Unit</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>Rate</th>
            <th style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px" }}>{i + 1}</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px" }}>{it.item_name}</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{it.qty}</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px" }}>{it.unit}</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{inr(it.rate)}</td>
              <td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{inr(it.qty * it.rate)}</td>
            </tr>
          ))}
          <tr><td colSpan="5" style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>Subtotal</td><td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{inr(subtotal)}</td></tr>
          <tr><td colSpan="5" style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>GST @ {gstPct}%</td><td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{inr(gst)}</td></tr>
          <tr style={{ background: "#FEF2EC", fontWeight: 700 }}><td colSpan="5" style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>Total</td><td style={{ border: "1px solid #e2d2c5", padding: "7px 9px", textAlign: "right" }}>{inr(total)}</td></tr>
        </tbody>
      </table>

      <div style={{ marginTop: 18, fontSize: 11 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Terms &amp; Conditions</div>
        1. Material to be supplied as per approved make and specifications.<br />
        2. Delivery at site within agreed lead time; delays may attract penalty.<br />
        3. Material subject to inspection &amp; testing at site; rejected material to be replaced at vendor cost.<br />
        4. Payment as per agreed terms against GST-compliant invoice and delivery challan.<br />
        5. This PO is governed by Pipeskool standard procurement terms.
      </div>

      <div style={{ marginTop: 50, textAlign: "right", fontSize: 12.5 }}>
        For Pipeskool Projects Pvt. Ltd.
        <div style={{ marginTop: 40, borderTop: "1px solid #999", display: "inline-block", paddingTop: 4 }}>Authorised Signatory</div>
      </div>

      <div style={{ textAlign: "center", marginTop: 26 }} className="no-print">
        <button onClick={() => window.print()} style={{ padding: "10px 22px", fontSize: 14, background: "#FF7A1A", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>🖨 Print / Save as PDF</button>
      </div>
      <style>{`@media print { .no-print { display: none; } }`}</style>
    </div>
  );
}

export default function POGenerator() {
  return <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}><POView /></Suspense>;
}
