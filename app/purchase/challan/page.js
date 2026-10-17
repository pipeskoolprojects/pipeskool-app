"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getGrnDetail } from "@/lib/stock";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function ChallanView() {
  const params = useSearchParams();
  const grnNo = params.get("grn");
  const [g, setG] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!grnNo) { setLoading(false); return; } getGrnDetail(grnNo).then(d => { setG(d); setLoading(false); }); }, [grnNo]);
  useEffect(() => { if (g) setTimeout(() => window.print(), 600); }, [g]);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading challan…</div>;
  if (!g) return <div style={{ padding: 40, textAlign: "center" }}>GRN not found. Open this from Goods Receipts → Print challan.</div>;

  const total = g.lines.reduce((s, l) => s + l.received_qty * l.rate, 0);
  const anyShort = g.lines.some(l => l.short_qty);
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 36, background: "#fff", color: "#111", fontFamily: "Newsreader, Georgia, serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "3px solid #FF7A1A", paddingBottom: 14 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Pipeskool Projects Pvt. Ltd.</div>
          <div style={{ fontSize: 12.5, color: "#555" }}>Plumbing & Piping Contractors · Ahmedabad</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Goods Received Note</div>
          {g.status === "cancelled" && <div style={{ fontSize: 15, fontWeight: 800, color: "#c0392b", border: "2px solid #c0392b", display: "inline-block", padding: "2px 10px", marginTop: 4 }}>CANCELLED{g.cancel?.reason ? " — " + g.cancel.reason : ""}</div>}
          {g.po_no && <div style={{ fontSize: 12.5, color: "#555" }}>Against PO: {g.po_no}</div>}
          <div style={{ fontSize: 12.5, color: "#555" }}>Printed: {today}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", margin: "16px 0", fontSize: 13.5 }}>
        <div>
          <div><b>GRN no:</b> {g.grn_no}</div>
          <div><b>Received at:</b> {g.site}</div>
          <div><b>Received on:</b> {g.date}</div>
          <div><b>Entered by:</b> {g.entered_by || "Not available"}{g.entered_at ? " · " + new Date(g.entered_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div><b>Supplier:</b> {g.vendor || "—"}</div>
          <div><b>Vendor challan no:</b> {g.challan_no || "—"}</div>
          <div><b>Our challan no:</b> {g.our_challan_no || "—"}</div>
          <div><b>Challan date:</b> {g.challan_date || "—"}</div>
          <div style={{ fontSize: 12, color: "#555" }}>Attached pages: supplier {g.sup_docs || 0} · ours {g.our_docs || 0}</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#0F1419", color: "#fff" }}>
            <th style={{ padding: "8px 6px", textAlign: "left" }}>#</th>
            <th style={{ padding: "8px 6px", textAlign: "left" }}>Material</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Challan qty</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Received</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Short/Excess</th>
            <th style={{ padding: "8px 6px", textAlign: "left" }}>Unit</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Rate</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {g.lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: "8px 6px" }}>{i + 1}</td>
              <td style={{ padding: "8px 6px", fontWeight: 600 }}>{l.item_name}</td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>{l.challan_qty}</td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>{l.received_qty}</td>
              <td style={{ padding: "8px 6px", textAlign: "right", color: l.short_qty ? "#b00" : "#111" }}>{l.short_qty || "—"}</td>
              <td style={{ padding: "8px 6px" }}>{l.unit}</td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>{l.rate ? inr(l.rate) : "—"}</td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>{l.rate ? inr(l.received_qty * l.rate) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid #111", fontWeight: 700 }}>
            <td colSpan={7} style={{ padding: "8px 6px", textAlign: "right" }}>Total received value</td>
            <td style={{ padding: "8px 6px", textAlign: "right" }}>{total ? inr(total) : "—"}</td>{/* update463: "—" when prices are not shown to this login */}
          </tr>
        </tfoot>
      </table>

      {anyShort && <div style={{ marginTop: 12, fontSize: 12.5, color: "#b00" }}>⚠ Short/excess noted above — to be reconciled with the supplier.</div>}

      <div style={{ marginTop: 44, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <div>Received & checked by: ____________________</div>
        <div>Store / Site in-charge</div>
      </div>

      <style>{`@media print { @page { margin: 14mm; } button { display:none; } }`}</style>
    </div>
  );
}

export default function ChallanPage() {
  return <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading…</div>}><ChallanView /></Suspense>;
}
