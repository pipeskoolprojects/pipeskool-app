"use client";
// update205: VENDOR RETURN RECEIPT — print-ready A4, same header as PO / vouchers.
// Web + Android: browser Print → Save as PDF.
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getVendorReturnHistory, setRtvStatus } from "@/lib/stock";

const STB = { awaiting: ["Awaiting", "#b45309"], delayed: ["Delayed", "#b91c1c"], returned: ["Returned", "#15803d"] };
const inr2 = n => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function RtvReceipt() {
  const params = useSearchParams();
  const ref = params.get("ref");
  const [r, setR] = useState(null); const [miss, setMiss] = useState(false);
  useEffect(() => {
    if (!getSession()) { window.location.replace("/login"); return; }
    getVendorReturnHistory({}).then(res => {
      const row = (res.rows || []).find(x => x.ref === ref);
      row ? setR(row) : setMiss(true);
    });
  }, [ref]);

  if (miss) return <div style={{ margin: 40, fontFamily: "system-ui" }}>Return {ref} not found.</div>;
  if (!r) return <div style={{ margin: 40, fontFamily: "system-ui" }}>Loading receipt…</div>;
  const [sl, sc] = STB[r.status] || STB.awaiting;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: 28, fontFamily: "system-ui", color: "#0F1419", background: "#fff" }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } } @page { size: A4; margin: 14mm; }`}</style>
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => window.print()} style={{ fontWeight: 700 }}>🖨 Print / Save as PDF</button>
        <button onClick={() => window.close()}>Close</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0F1419", paddingBottom: 12 }}>
        <div>
          <svg width="46" height="5" viewBox="0 0 46 5" style={{ display: "block", marginBottom: 7 }}>
            <rect x="0" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
            <rect x="16.5" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
            <rect x="33" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
          </svg>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>PIPESKOOL PROJECTS PVT. LTD.</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Specialist Plumbing &amp; Piping Contractors</div>
          <div style={{ fontSize: 11.5, color: "#555" }}>Ahmedabad, Gujarat · GSTIN: 24XXXXXXXXXXXZX</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>VENDOR RETURN RECEIPT</div>
          <div style={{ fontSize: 12 }}>Ref: <b>{r.ref}</b></div>
          <div style={{ fontSize: 12 }}>Date: {new Date(r.date).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Status: <b style={{ color: sc }}>{sl.toUpperCase()}</b>{r.status_by ? <span style={{ color: "#555" }}> (by {r.status_by}{r.status_at ? " · " + r.status_at : ""})</span> : null}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 30, margin: "14px 0", fontSize: 12.5 }}>
        <div><div style={{ color: "#777", fontSize: 11 }}>Returned to (vendor)</div><b>{r.vendor}</b></div>
        <div><div style={{ color: "#777", fontSize: 11 }}>From site</div><b>{r.site}</b></div>
        <div><div style={{ color: "#777", fontSize: 11 }}>Against GRN</div><b>{r.src_grn || "—"}</b></div>
        <div><div style={{ color: "#777", fontSize: 11 }}>Processed by</div><b>{r.by || "—"}</b></div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: "#f4f2ee" }}>
            {["#", "Material", "Unit", "Qty", "Rate (₹)", "Amount (₹)"].map((h, i) => (
              <th key={h} style={{ border: "1px solid #ccc", padding: "6px 8px", textAlign: i >= 3 ? "right" : "left" }}>{h}</th>))}
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ border: "1px solid #ccc", padding: "5px 8px" }}>{i + 1}</td>
              <td style={{ border: "1px solid #ccc", padding: "5px 8px" }}>{l.item}</td>
              <td style={{ border: "1px solid #ccc", padding: "5px 8px" }}>{l.unit}</td>
              <td style={{ border: "1px solid #ccc", padding: "5px 8px", textAlign: "right" }}>{l.qty}</td>
              <td style={{ border: "1px solid #ccc", padding: "5px 8px", textAlign: "right" }}>{l.rate ? inr2(l.rate) : "—"}</td>
              <td style={{ border: "1px solid #ccc", padding: "5px 8px", textAlign: "right" }}>{l.rate ? inr2(l.value) : "—"}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 800 }}>
            <td colSpan={3} style={{ border: "1px solid #ccc", padding: "6px 8px" }}>TOTAL RETURN VALUE</td>
            <td style={{ border: "1px solid #ccc", padding: "6px 8px", textAlign: "right" }}>{r.total_qty}</td>
            <td style={{ border: "1px solid #ccc", padding: "6px 8px" }}></td>
            <td style={{ border: "1px solid #ccc", padding: "6px 8px", textAlign: "right" }}>{r.total_value ? inr2(r.total_value) : "—"}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 10.5, color: "#777", marginTop: 4 }}>Rates are taken from the source GRN for each item; "—" means the source GRN carried no rate for that line.</div>

      <div style={{ marginTop: 12, fontSize: 12.5 }}><span style={{ color: "#777" }}>Reason for return: </span><b>{r.reason || "—"}</b></div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 60, fontSize: 12 }}>
        <div style={{ textAlign: "center" }}><div style={{ borderTop: "1px solid #333", width: 190, paddingTop: 4 }}>Store / Site In-charge</div></div>
        <div style={{ textAlign: "center" }}><div style={{ borderTop: "1px solid #333", width: 190, paddingTop: 4 }}>Vendor's receiving signature</div></div>
        <div style={{ textAlign: "center" }}><div style={{ borderTop: "1px solid #333", width: 190, paddingTop: 4 }}>For Pipeskool Projects Pvt. Ltd.</div></div>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div style={{ margin: 40 }}>Loading…</div>}><RtvReceipt /></Suspense>;
}
