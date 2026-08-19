"use client";
// update186: printable worker attendance slip / monthly report (opened from the muster
// worker sheet and from the web). Browser "Print" → Save as PDF.
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getWorkerMonth } from "@/lib/mobile";
import { getSession } from "@/lib/auth";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function Slip() {
  const sp = useSearchParams();
  const workerId = sp.get("worker"); const month = sp.get("month") || new Date().toISOString().slice(0, 7);
  const [d, setD] = useState(null); const [err, setErr] = useState("");
  useEffect(() => {
    if (!getSession()) { window.location.replace("/login"); return; }
    if (!workerId) { setErr("No worker given."); return; }
    getWorkerMonth(Number(workerId), month).then(x => x ? setD(x) : setErr("Worker not found or no access."));
  }, [workerId, month]);
  if (err) return <div style={{ padding: 30 }}>{err}</div>;
  if (!d) return <div style={{ padding: 30 }}>Loading…</div>;
  const w = d.worker;
  const label = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 28, fontFamily: "var(--font)", color: "#111", background: "#fff" }}>
      <style>{`@media print { button { display: none } body { background: #fff } }`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #222", paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>PIPESKOOL PROJECTS PVT. LTD.</div>
          <div style={{ fontSize: 12, color: "#555" }}>Specialist Plumbing &amp; Piping Contractors · Ahmedabad</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Attendance &amp; Wage Slip</div>
          <div style={{ fontSize: 13 }}>{label}</div>
          <button style={{ marginTop: 6, fontSize: 12 }} onClick={() => window.print()}>🖨 Print / Save PDF</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 13, margin: "12px 0" }}>
        <div><b>Worker:</b> {w.name} (ID {w.id})</div><div><b>Category:</b> {w.category} · {w.labour}</div>
        <div><b>Home site:</b> {w.site}</div><div><b>Mobile:</b> {w.mobile}</div>
        <div><b>Daily wage:</b> {inr(w.wage)}</div><div><b>OT rate:</b> {inr(w.otRate)}/h (wage ÷ {w.stdHrs} h)</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6, margin: "10px 0" }}>
        {[["Present", d.present], ["Half days", d.half], ["Absent", d.absent], ["Hours", d.totalHours], ["OT hrs (approved)", d.otHours], ["Sundays", d.sundays]].map(([l, v]) => (
          <div key={l} style={{ border: "1px solid #ccc", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}><div style={{ fontSize: 10.5, color: "#666" }}>{l}</div><div style={{ fontSize: 16, fontWeight: 700 }}>{v}</div></div>
        ))}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: "#f2f2ee" }}>{["Date", "Site", "In", "Out", "Hours", "Status", "OT (punch)", "OT approved", "Punch", "Verified"].map(h => <th key={h} style={{ border: "1px solid #ccc", padding: "4px 6px", textAlign: "left" }}>{h}</th>)}</tr></thead>
        <tbody>
          {d.days.map(x => (
            <tr key={x.id}>{[x.date, x.site, x.in, x.out, x.hours || "—", x.status, x.ot || "—", x.otApproved || "—", x.punch, x.verify].map((v, i) => <td key={i} style={{ border: "1px solid #ddd", padding: "3px 6px" }}>{String(v)}</td>)}</tr>
          ))}
          {d.days.length === 0 && <tr><td colSpan={10} style={{ padding: 8, color: "#777" }}>No attendance recorded this month.</td></tr>}
        </tbody>
      </table>
      <table style={{ marginTop: 14, fontSize: 13, borderCollapse: "collapse", minWidth: 320 }}>
        <tbody>
          <tr><td style={{ padding: "3px 10px 3px 0" }}>Days pay ({d.present} + {d.half}×½) × {inr(w.wage)}</td><td style={{ textAlign: "right" }}>{inr(d.earned)}</td></tr>
          <tr><td style={{ padding: "3px 10px 3px 0" }}>OT {d.otHours} h × {inr(w.otRate)}</td><td style={{ textAlign: "right" }}>{inr(d.otAmt)}</td></tr>
          <tr style={{ fontWeight: 700, borderTop: "1px solid #222" }}><td style={{ padding: "4px 10px 4px 0" }}>Gross (before advances)</td><td style={{ textAlign: "right" }}>{inr(d.gross)}</td></tr>
        </tbody>
      </table>
      {d.history.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 16 }}>Recent payouts</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 4 }}>
            <thead><tr style={{ background: "#f2f2ee" }}>{["Month", "Days", "OT h", "Gross", "Advances", "Net", "Status"].map(h => <th key={h} style={{ border: "1px solid #ccc", padding: "4px 6px", textAlign: "left" }}>{h}</th>)}</tr></thead>
            <tbody>{d.history.map(h => <tr key={h.month}>{[h.month, Number(h.days_full) + Number(h.days_half) * 0.5, h.ot_hours, inr(h.gross), inr(h.advances_deducted), inr(h.net), h.status].map((v, i) => <td key={i} style={{ border: "1px solid #ddd", padding: "3px 6px" }}>{String(v)}</td>)}</tr>)}</tbody>
          </table>
        </>
      )}
      <div style={{ fontSize: 11, color: "#666", marginTop: 18 }}>Generated {new Date().toLocaleString("en-IN")} by {getSession()?.name || ""}. Gross is indicative; final payable is per the approved wage payout (advances deducted). 📷 = proxy punch.</div>
    </div>
  );
}
export default function Page() { return <Suspense fallback={<div style={{ padding: 30 }}>Loading…</div>}><Slip /></Suspense>; }
