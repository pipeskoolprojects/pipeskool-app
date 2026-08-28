"use client";
import { useEffect, useState } from "react";
import { getProgress, getHindranceRegister, reasonLabel } from "@/lib/dpr";

export default function WeeklyReport() {
  const [progress, setProgress] = useState([]);
  const [hindrances, setHindrances] = useState([]);
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);

  useEffect(() => {
    getProgress().then(setProgress);
    getHindranceRegister(from, to).then(setHindrances);
  }, []);

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 32, background: "#fff", color: "#111", fontFamily: "Newsreader, Georgia, serif" }}>
      <div style={{ textAlign: "center", borderBottom: "3px solid #FF7A1A", paddingBottom: 14, marginBottom: 20 }}>
        <div>
          <svg width="46" height="5" viewBox="0 0 46 5" aria-hidden="true" style={{ display: "block", margin: "0 auto 7px" }}>
            <rect x="0" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
            <rect x="16.5" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
            <rect x="33" y="0" width="13" height="5" rx="2.5" fill="#FF7A1A" />
          </svg>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0F1419", letterSpacing: "-0.02em" }}>PIPESKOOL PROJECTS PVT. LTD.</div>
        </div>
        <div style={{ fontSize: 13, color: "#555" }}>Specialist Plumbing &amp; Piping Contractors, Ahmedabad</div>
        <div style={{ fontSize: 15, marginTop: 10, fontWeight: 600 }}>Weekly Progress Report</div>
        <div style={{ fontSize: 12.5, color: "#555" }}>Period: {from} to {to}</div>
      </div>

      <h3 style={{ fontSize: 15, margin: "18px 0 8px" }}>1. Physical progress summary</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr>
            {["Site", "Activity", "Unit", "BOQ Qty", "Completed", "% Complete"].map(h => (
              <th key={h} style={{ border: "1px solid #999", padding: "6px 8px", background: "#FEF2EC", textAlign: "left" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {progress.map((r, i) => (
            <tr key={i}>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px" }}>{r.site}</td>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px" }}>{r.description}</td>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px" }}>{r.unit}</td>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px", textAlign: "right" }}>{r.boq.toLocaleString("en-IN")}</td>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px", textAlign: "right" }}>{r.done.toLocaleString("en-IN")}</td>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px", textAlign: "right" }}>
                {r.boq ? Math.round((r.done / r.boq) * 100) : 0}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ fontSize: 15, margin: "20px 0 8px" }}>2. Hindrances during the period</h3>
      {hindrances.length === 0 ? <p style={{ fontSize: 12.5 }}>No hindrances recorded.</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr>
              {["Date", "Site", "Nature of hindrance", "Hours lost", "Details"].map(h => (
                <th key={h} style={{ border: "1px solid #999", padding: "6px 8px", background: "#FEF2EC", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hindrances.map((h, i) => (
              <tr key={i}>
                <td style={{ border: "1px solid #bbb", padding: "5px 8px" }}>{h.date}</td>
                <td style={{ border: "1px solid #bbb", padding: "5px 8px" }}>{h.site}</td>
                <td style={{ border: "1px solid #bbb", padding: "5px 8px" }}>{reasonLabel(h.reason)}</td>
                <td style={{ border: "1px solid #bbb", padding: "5px 8px", textAlign: "right" }}>{h.hours}</td>
                <td style={{ border: "1px solid #bbb", padding: "5px 8px" }}>{h.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
        The above hindrances are recorded contemporaneously in our daily progress system
        and are submitted for the client&apos;s kind record.
      </p>

      <div style={{ marginTop: 36, display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
        <div>Prepared by: ______________<br />Site Engineer</div>
        <div>For Pipeskool Projects Pvt. Ltd.<br /><br />______________<br />Director</div>
      </div>

      <div className="no-print" style={{ marginTop: 28, textAlign: "center" }}>
        <button onClick={() => window.print()}
                style={{ padding: "10px 22px", fontSize: 14, background: "#FF7A1A", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
          🖨 Print / Save as PDF
        </button>
      </div>
      <style>{`@media print { .no-print { display: none; } body { background: #fff; } }`}</style>
    </div>
  );
}
