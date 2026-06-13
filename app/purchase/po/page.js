"use client";
import { useState } from "react";

export default function POGenerator() {
  const [items] = useState([
    { name: "Pipe - MS 350NB (Heavy)", qty: 300, unit: "Rmt", rate: 1795 },
  ]);
  const gstPct = 18;
  const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const gst = Math.round(subtotal * gstPct / 100);
  const total = subtotal + gst;
  const inr = n => "₹" + Number(n).toLocaleString("en-IN");

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 36, background: "#fff", color: "#111", fontFamily: "Newsreader, Georgia, serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "3px solid #FF7A1A", paddingBottom: 14 }}>
        <div>
          <div>
            <svg width="46" height="5" viewBox="0 0 46 5" aria-hidden="true" style={{ display: "block", marginBottom: 7 }}>
              <rect x="0" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
              <rect x="16.5" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
              <rect x="33" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
            </svg>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F1419", letterSpacing: "-0.02em" }}>PIPESKOOL PROJECTS PVT. LTD.</div>
          </div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Specialist Plumbing &amp; Piping Contractors</div>
          <div style={{ fontSize: 11.5, color: "#555" }}>Ahmedabad, Gujarat · GSTIN: 24XXXXXXXXXXXZX</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>PURCHASE ORDER</div>
          <div style={{ fontSize: 12 }}>PO No: <b>PO/26/054</b></div>
          <div style={{ fontSize: 12 }}>Date: {new Date().toLocaleDateString("en-IN")}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", margin: "18px 0", fontSize: 12.5 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Vendor</div>
          Gujarat Pipe Traders<br />Nilesh Patel · 98240 22222<br />GSTIN: 24XYZGP5678B1Z3<br />
          <span style={{ color: "#555" }}>Terms: 50% advance, 50% on delivery</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Deliver to</div>
          KEI Industries Site, Sanand<br />Pipeskool Site Store<br />Contact: S. Desai
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: "#FEF2EC" }}>
            {["#", "Description", "Qty", "Unit", "Rate", "Amount"].map(h => (
              <th key={h} style={{ border: "1px solid #999", padding: "7px 8px", textAlign: h === "Description" ? "left" : "right" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={{ border: "1px solid #bbb", padding: "6px 8px", textAlign: "right" }}>{i + 1}</td>
              <td style={{ border: "1px solid #bbb", padding: "6px 8px" }}>{it.name}</td>
              <td style={{ border: "1px solid #bbb", padding: "6px 8px", textAlign: "right" }}>{it.qty}</td>
              <td style={{ border: "1px solid #bbb", padding: "6px 8px", textAlign: "right" }}>{it.unit}</td>
              <td style={{ border: "1px solid #bbb", padding: "6px 8px", textAlign: "right" }}>{inr(it.rate)}</td>
              <td style={{ border: "1px solid #bbb", padding: "6px 8px", textAlign: "right" }}>{inr(it.qty * it.rate)}</td>
            </tr>
          ))}
          <tr><td colSpan="5" style={{ border: "1px solid #bbb", padding: "6px 8px", textAlign: "right" }}>Subtotal</td><td style={{ border: "1px solid #bbb", padding: "6px 8px", textAlign: "right" }}>{inr(subtotal)}</td></tr>
          <tr><td colSpan="5" style={{ border: "1px solid #bbb", padding: "6px 8px", textAlign: "right" }}>GST @ {gstPct}%</td><td style={{ border: "1px solid #bbb", padding: "6px 8px", textAlign: "right" }}>{inr(gst)}</td></tr>
          <tr style={{ background: "#FEF2EC", fontWeight: 700 }}><td colSpan="5" style={{ border: "1px solid #999", padding: "7px 8px", textAlign: "right" }}>Total</td><td style={{ border: "1px solid #999", padding: "7px 8px", textAlign: "right" }}>{inr(total)}</td></tr>
        </tbody>
      </table>

      <div style={{ marginTop: 18, fontSize: 11.5, color: "#333" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Terms &amp; Conditions</div>
        1. Material to be supplied as per approved make and specifications.<br />
        2. Delivery at site within agreed lead time; delays may attract penalty.<br />
        3. Material subject to inspection &amp; testing at site; rejected material to be replaced at vendor cost.<br />
        4. Payment as per agreed terms against GST-compliant invoice and delivery challan.<br />
        5. This PO is governed by Pipeskool standard procurement terms.
      </div>

      <div style={{ marginTop: 40, textAlign: "right", fontSize: 12.5 }}>
        For Pipeskool Projects Pvt. Ltd.<br /><br /><br />
        ______________________<br />Authorised Signatory
      </div>

      <div className="no-print" style={{ marginTop: 28, textAlign: "center" }}>
        <button onClick={() => window.print()} style={{ padding: "10px 22px", fontSize: 14, background: "#FF7A1A", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>🖨 Print / Save as PDF</button>
      </div>
      <style>{`@media print { .no-print { display: none; } }`}</style>
    </div>
  );
}
