"use client";
// update215: DELIVERY CHALLAN letterhead document — ?ids=1,2,3 prints one or many
// (each on its own A4 page). Same header style as PO / RTV / voucher documents.
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDeliveryChallans } from "@/lib/challan";

function DcDoc({ d }) {
  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: 28, color: "#0F1419", background: "#fff", pageBreakAfter: "always" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0F1419", paddingBottom: 12 }}>
        <div>
          <svg width="46" height="5" viewBox="0 0 46 5" style={{ display: "block", marginBottom: 7 }}>
            <rect x="0" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" /><rect x="16.5" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" /><rect x="33" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
          </svg>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>PIPESKOOL PROJECTS PVT. LTD.</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Specialist Plumbing &amp; Piping Contractors</div>
          <div style={{ fontSize: 11.5, color: "#555" }}>Ahmedabad, Gujarat · GSTIN: 24XXXXXXXXXXXZX</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "inline-block", border: "2px solid #0F1419", borderRadius: 8, padding: "6px 14px", fontWeight: 800, fontSize: 15 }}>DELIVERY CHALLAN</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Ref: <b>{d.dc_ref}</b></div>
          {d.vendor_dc_no && <div style={{ fontSize: 12 }}>Vendor DC: <b>{d.vendor_dc_no}</b></div>}
          <div style={{ fontSize: 12 }}>Date: {d.date}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 30, margin: "14px 0", fontSize: 12.5, flexWrap: "wrap" }}>
        <div><div style={{ color: "#777", fontSize: 11 }}>Site</div><b>{d.site}</b></div>
        <div><div style={{ color: "#777", fontSize: 11 }}>Vendor</div><b>{d.vendor}</b></div>
        <div><div style={{ color: "#777", fontSize: 11 }}>Against PO</div><b>{d.po_no || "—"}</b></div>
        <div><div style={{ color: "#777", fontSize: 11 }}>Converted GRN</div><b>{d.grn_no || "—"}</b></div>
        <div><div style={{ color: "#777", fontSize: 11 }}>Entered by</div><b>{d.by || "—"}</b></div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: "#f4f2ee" }}>
            {["#", "Item", "Ordered Qty", "Received Qty", "Unit", "Remarks"].map((h, i) => (
              <th key={h} style={{ border: "1px solid #ccc", padding: "6px 8px", textAlign: i === 2 || i === 3 ? "right" : "left" }}>{h}</th>))}
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => { const diff = Number(l.received_qty) - Number(l.ordered_qty); return (
            <tr key={i}>
              <td style={{ border: "1px solid #ccc", padding: "5px 8px" }}>{i + 1}</td>
              <td style={{ border: "1px solid #ccc", padding: "5px 8px" }}>{l.item_name}</td>
              <td style={{ border: "1px solid #ccc", padding: "5px 8px", textAlign: "right" }}>{l.ordered_qty || "—"}</td>
              <td style={{ border: "1px solid #ccc", padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>{l.received_qty}</td>
              <td style={{ border: "1px solid #ccc", padding: "5px 8px" }}>{l.unit}</td>
              <td style={{ border: "1px solid #ccc", padding: "5px 8px" }}>{!l.ordered_qty ? "Not on PO" : diff === 0 ? "OK" : diff < 0 ? "Short by " + (-diff) : "Excess by " + diff}</td>
            </tr>
          ); })}
          <tr style={{ fontWeight: 800 }}>
            <td colSpan={2} style={{ border: "1px solid #ccc", padding: "6px 8px" }}>TOTAL</td>
            <td style={{ border: "1px solid #ccc", padding: "6px 8px", textAlign: "right" }}>{d.ord || "—"}</td>
            <td style={{ border: "1px solid #ccc", padding: "6px 8px", textAlign: "right" }}>{d.recv}</td>
            <td colSpan={2} style={{ border: "1px solid #ccc" }}></td>
          </tr>
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 64, fontSize: 12 }}>
        <div style={{ textAlign: "center" }}><div style={{ borderTop: "1px solid #333", width: 190, paddingTop: 4 }}>Received by (Site)</div></div>
        <div style={{ textAlign: "center" }}><div style={{ borderTop: "1px solid #333", width: 190, paddingTop: 4 }}>Checked by</div></div>
        <div style={{ textAlign: "center" }}><div style={{ borderTop: "1px solid #333", width: 190, paddingTop: 4 }}>Authorised Signatory</div></div>
      </div>
    </div>
  );
}

function DcPrint() {
  const params = useSearchParams();
  const ids = (params.get("ids") || "").split(",").map(Number).filter(Boolean);
  const [docs, setDocs] = useState(null);
  useEffect(() => {
    if (!getSession()) { window.location.replace("/login"); return; }
    getDeliveryChallans().then(all => setDocs(all.filter(d => ids.includes(d.id))));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!docs) return <div style={{ margin: 40, fontFamily: "system-ui" }}>Preparing document…</div>;
  if (!docs.length) return <div style={{ margin: 40, fontFamily: "system-ui" }}>No challans found for this link.</div>;
  return (
    <div style={{ fontFamily: "system-ui", background: "#fff" }}>
      <style>{`@media print { .no-print { display: none !important; } } @page { size: A4; margin: 12mm; }`}</style>
      <div className="no-print" style={{ display: "flex", gap: 8, padding: 14, maxWidth: 780, margin: "0 auto" }}>
        <button onClick={() => window.print()} style={{ fontWeight: 700 }}>🖨 Print / Save as PDF{docs.length > 1 ? ` (${docs.length} challans)` : ""}</button>
        <button onClick={() => window.close()}>Close</button>
      </div>
      {docs.map(d => <DcDoc key={d.id} d={d} />)}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div style={{ margin: 40 }}>Loading…</div>}><DcPrint /></Suspense>;
}
