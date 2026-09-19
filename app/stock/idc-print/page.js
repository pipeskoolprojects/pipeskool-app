"use client";
// update403: INTERNAL DISPATCH CHALLAN print — same document style as the vendor Delivery Note,
// branded "Internal Dispatch Challan", From / To blocks, quantity only. ?ids=1,2 prints many.
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDispatches, IDC_STATUS } from "@/lib/dispatch";

function Doc({ d }) {
  const bc = "1px solid #444"; const cell = { border: bc, padding: "4px 8px", verticalAlign: "top", fontSize: 11.5 }; const lbl = { fontSize: 9.5, color: "#555" };
  const dmy = k => k ? String(k).split("-").reverse().join("/") : "";
  const tot = d.items.reduce((t, l) => t + Number(l.qty || 0), 0);
  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: 20, color: "#111", background: "#fff", pageBreakAfter: "always", fontFamily: "Arial, system-ui" }}>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Internal Dispatch Challan</div>
      <div style={{ textAlign: "center", fontSize: 10.5, color: "#555", marginBottom: 6 }}>Internal material transfer — not a sale · no tax invoice</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
        <tr>
          <td style={{ ...cell, width: "50%" }} rowSpan={3}><b style={{ fontSize: 12.5 }}>Pipeskool Projects Pvt Ltd</b><br />102, Darshak, Opp Shrey Hospital<br />Punjabi Hall Lane, Navrangpura, Ahmedabad<br />GSTIN/UIN: 24AAMCP3389A1ZF<br />State Name : Gujarat, Code : 24<br />E-Mail : pipeskoolprojects@gmail.com</td>
          <td style={{ ...cell, width: "25%" }}><div style={lbl}>Challan No.</div><b>{d.idc_no}</b></td>
          <td style={{ ...cell, width: "25%" }}><div style={lbl}>Dated</div><b>{dmy(d.dispatch_date)}</b></td>
        </tr>
        <tr><td style={cell}><div style={lbl}>Vehicle No.</div>{d.vehicle_no || "—"}</td><td style={cell}><div style={lbl}>Driver</div>{d.driver_name || "—"}</td></tr>
        <tr><td style={cell}><div style={lbl}>Dispatched by</div>{d.dispatched_by || d.creator_name || "—"}</td><td style={cell}><div style={lbl}>Status</div>{IDC_STATUS[d.status]?.[0] || d.status}</td></tr>
        <tr>
          <td style={cell}><div style={lbl}>FROM (Dispatched from)</div><b>{d.from}</b><br />Pipeskool store / warehouse</td>
          <td style={cell} colSpan={2}><div style={lbl}>TO (Deliver to site)</div><b>{d.to}</b><br />Pipeskool Site Store</td>
        </tr>
      </tbody></table>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <thead><tr>{["Sl", "Description of Goods", "Quantity", "Unit", "Remarks"].map(h => <th key={h} style={{ ...cell, background: "#f3f4f6", textAlign: h === "Quantity" ? "right" : "left" }}>{h}</th>)}</tr></thead>
        <tbody>{d.items.map((l, i) => <tr key={l.id}><td style={cell}>{i + 1}</td><td style={cell}>{l.item_name}</td><td style={{ ...cell, textAlign: "right" }}>{Number(l.qty)}</td><td style={cell}>{l.unit || "Nos"}</td><td style={cell}>{l.note || ""}</td></tr>)}
          <tr><td style={cell} colSpan={2}><b>Total</b></td><td style={{ ...cell, textAlign: "right" }}><b>{tot}</b></td><td style={cell} colSpan={2}>{d.items.length} item(s)</td></tr></tbody>
      </table>
      {d.notes && <div style={{ fontSize: 11, marginTop: 8 }}><b>Remarks:</b> {d.notes}</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24 }}><tbody><tr>
        <td style={{ ...cell, height: 60 }}><div style={lbl}>Dispatched by (signature)</div></td><td style={{ ...cell }}><div style={lbl}>Driver / carrier</div></td><td style={{ ...cell }}><div style={lbl}>Received at site (name, sign, date)</div></td>
      </tr></tbody></table>
      <div style={{ fontSize: 9.5, color: "#555", marginTop: 6 }}>Stock moves from {d.from} to {d.to} when the site marks this challan Delivered in Pipeskool.</div>
    </div>
  );
}
function Inner() {
  const sp = useSearchParams(); const [docs, setDocs] = useState(null);
  useEffect(() => { if (!getSession()) { window.location.replace("/login"); return; } const ids = (sp.get("ids") || "").split(",").map(Number).filter(Boolean); getDispatches().then(all => setDocs(all.filter(d => ids.includes(d.id)))).catch(() => setDocs([])); }, [sp]);
  useEffect(() => { if (docs?.length) document.title = docs.map(d => d.idc_no).join(", "); }, [docs]);
  if (docs === null) return <div style={{ padding: 20 }}>Loading…</div>;
  return (<div><style>{`@media print { @page { size: A4; margin: 0; } body { margin: 0 !important; } .no-print { display: none !important; } }`}</style>
    <div className="no-print" style={{ textAlign: "center", padding: 12 }}><button onClick={() => window.print()} style={{ padding: "8px 18px", background: "#FF7A1A", color: "#fff", border: "none", borderRadius: 8 }}>🖨 Print / Save as PDF</button> <button onClick={() => history.back()} style={{ padding: "8px 14px", borderRadius: 8 }}>← Back</button></div>
    {docs.map(d => <Doc key={d.id} d={d} />)}</div>);
}
export default function Page() { return <Suspense fallback={<div style={{ padding: 20 }}>Loading…</div>}><Inner /></Suspense>; }
