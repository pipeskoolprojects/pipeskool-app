"use client";
// update404: MATERIAL EXCHANGE NOTE — A4, return + replacement on one sheet, for the vendor. ?ids=1,2
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getExchanges } from "@/lib/exchange";
import { inr } from "@/lib/data";

function Doc({ e }) {
  const bc = "1px solid #444"; const cell = { border: bc, padding: "4px 8px", verticalAlign: "top", fontSize: 11.5 }; const lbl = { fontSize: 9.5, color: "#555" };
  const dmy = k => k ? String(k).split("-").reverse().join("/") : ""; const net = Number(e.net_difference || 0); const px = e.net_difference != null;   // update463: prices only for price viewers
  const money = v => px ? inr(v) : "—";
  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: 20, color: "#111", background: "#fff", pageBreakAfter: "always", fontFamily: "Arial, system-ui" }}>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Material Exchange Note</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
        <tr><td style={{ ...cell, width: "50%" }} rowSpan={2}><b style={{ fontSize: 12.5 }}>Pipeskool Projects Pvt Ltd</b><br />102, Darshak, Opp Shrey Hospital, Navrangpura, Ahmedabad<br />GSTIN/UIN: 24AAMCP3389A1ZF · State: Gujarat (24)</td><td style={cell}><div style={lbl}>Exchange No.</div><b>{e.exc_no}</b></td><td style={cell}><div style={lbl}>Dated</div><b>{dmy(e.exchange_date)}</b></td></tr>
        <tr><td style={cell}><div style={lbl}>Against PO</div><b>{e.po_no}</b></td><td style={cell}><div style={lbl}>Site</div>{e.site}</td></tr>
        <tr><td style={cell} colSpan={3}><div style={lbl}>Vendor</div><b>{e.vendor_name}</b></td></tr>
      </tbody></table>
      <div style={{ fontWeight: 700, fontSize: 12, margin: "10px 0 4px", color: "#A32D2D" }}>Returned to vendor</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr>{["Sl", "Description of Goods", "Qty", "Unit", "Rate", "Value"].map(h => <th key={h} style={{ ...cell, background: "#f3f4f6", textAlign: /Qty|Rate|Value/.test(h) ? "right" : "left" }}>{h}</th>)}</tr></thead>
        <tbody>{e.lines.map((l, i) => <tr key={l.id}><td style={cell}>{i + 1}</td><td style={cell}>{l.item_name}</td><td style={{ ...cell, textAlign: "right" }}>{Number(l.return_qty)}</td><td style={cell}>{l.unit || "Nos"}</td><td style={{ ...cell, textAlign: "right" }}>{money(l.rate)}</td><td style={{ ...cell, textAlign: "right" }}>{money(Number(l.return_qty) * Number(l.rate))}</td></tr>)}</tbody></table>
      <div style={{ fontWeight: 700, fontSize: 12, margin: "10px 0 4px", color: "#27500A" }}>Replacement {e.replacement_received ? "received" : "to be supplied"}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr><td style={cell}>1</td><td style={cell}>{e.replacement_item_name}</td><td style={{ ...cell, textAlign: "right" }}>{Number(e.replacement_qty)}</td><td style={cell}>{e.replacement_unit || "Nos"}</td><td style={{ ...cell, textAlign: "right" }}>{money(e.replacement_rate)}</td><td style={{ ...cell, textAlign: "right" }}>{money(e.replacement_value)}</td></tr></tbody></table>
      {px && <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}><tbody>
        <tr><td style={{ ...cell, textAlign: "right" }} colSpan={5}>Return value</td><td style={{ ...cell, textAlign: "right" }}>− {inr(e.return_value)}</td></tr>
        <tr><td style={{ ...cell, textAlign: "right" }} colSpan={5}>Replacement value</td><td style={{ ...cell, textAlign: "right" }}>+ {inr(e.replacement_value)}</td></tr>
        <tr style={{ fontWeight: 700, background: "#FEF2EC" }}><td style={{ ...cell, textAlign: "right" }} colSpan={5}>Net difference (before GST)</td><td style={{ ...cell, textAlign: "right" }}>{net >= 0 ? inr(net) + " payable to vendor" : inr(-net) + " credit from vendor"}</td></tr>
      </tbody></table>}
      <div style={{ fontSize: 11, marginTop: 8 }}><b>Reason:</b> {e.reason}</div>
      <div style={{ fontSize: 10.5, color: "#555", marginTop: 4 }}>Recorded by {e.done_by_name} · GST on the adjusted PO value applies per the vendor's invoice / credit note.</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24 }}><tbody><tr><td style={{ ...cell, height: 60 }}><div style={lbl}>For Pipeskool Projects Pvt Ltd</div></td><td style={cell}><div style={lbl}>Vendor acknowledgement (name, sign, date)</div></td></tr></tbody></table>
    </div>
  );
}
function Inner() {
  const sp = useSearchParams(); const [docs, setDocs] = useState(null);
  useEffect(() => { if (!getSession()) { window.location.replace("/login"); return; } const ids = (sp.get("ids") || "").split(",").map(Number).filter(Boolean); getExchanges("all").then(all => setDocs(all.filter(d => ids.includes(d.id)))).catch(() => setDocs([])); }, [sp]);
  useEffect(() => { if (docs?.length) document.title = docs.map(d => d.exc_no).join(", "); }, [docs]);
  if (docs === null) return <div style={{ padding: 20 }}>Loading…</div>;
  return (<div><style>{`@media print { @page { size: A4; margin: 0; } body { margin: 0 !important; } .no-print { display: none !important; } }`}</style>
    <div className="no-print" style={{ textAlign: "center", padding: 12 }}><button onClick={() => window.print()} style={{ padding: "8px 18px", background: "#FF7A1A", color: "#fff", border: "none", borderRadius: 8 }}>🖨 Print / Save as PDF</button> <button onClick={() => history.back()} style={{ padding: "8px 14px", borderRadius: 8 }}>← Back</button></div>
    {docs.map(d => <Doc key={d.id} e={d} />)}</div>);
}
export default function Page() { return <Suspense fallback={<div style={{ padding: 20 }}>Loading…</div>}><Inner /></Suspense>; }
