"use client";
// update278: PAYROLL SUMMARY — one consolidated row per worker (days summed across sites),
// the 15 reference columns, from the generated payroll (Settings-driven engine).
import { useEffect, useState } from "react";
import { loadPayrollSummary } from "@/lib/payrollSummary";
import { exportPayrollXlsx } from "@/lib/payrollExport";
import { inr } from "@/lib/data";
import { monthLabel } from "@/components/AttendanceSummary";   // update279

export default function PayrollSummary({ month, siteId, sites }) {
  const [d, setD] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { setD(null); setErr(""); loadPayrollSummary(month, siteId).then(setD).catch(e => setErr(e.message)); }, [month, siteId]);
  const siteName = siteId === "all" ? "All sites" : (sites.find(s => String(s.id) === String(siteId))?.name || "");
  const sum = k => d ? +d.workers.reduce((n, w) => n + Number(w[k] || 0), 0).toFixed(2) : 0;
  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div className="muted" style={{ fontSize: 12.5 }}>Full per-worker breakdown — one row per worker, days summed across sites. Gross = Basic + OT · Net = Gross − PF − PT − Other − Advance.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => exportPayrollXlsx({ month, siteName, workers: d.workers })} disabled={!d || !d.workers.length}>⬇ Excel</button>
          <a href={`/wages/print?kind=payroll&month=${month}&site=${siteId}`} target="_blank" rel="noreferrer"><button disabled={!d || !d.workers.length}>⬇ PDF</button></a>
        </div>
      </div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      {d && d.missingSites.length > 0 && <div className="note amber" style={{ marginTop: 8, fontSize: 12 }}>Not yet generated for {month}: <b>{d.missingSites.join(", ")}</b> — use "Generate / refresh from attendance" on the Labour Payroll tab to include them.</div>}
      {!d ? <div className="muted" style={{ marginTop: 10 }}>Loading…</div> : d.workers.length === 0 ? <div className="muted" style={{ marginTop: 10 }}>No generated payroll for {siteName} in {month}.</div> : (
        <div className="mw-card" style={{ marginTop: 10 }}>
          <div className="mw-band">PAYROLL SUMMARY — {siteName.toUpperCase()} · {monthLabel(month)}</div>
          <div style={{ overflowX: "auto" }}>
          <table className="dt-compact mw-table" style={{ minWidth: 1400 }}>
            <thead><tr>
              {["Sr", "Worker Name", "Designation", "Daily Rate", "Days Worked", "Basic Wages", "OT Hours", "OT Amount", "Gross Earnings", "PF Deduction", "Professional Tax", "Other Deduction", "Total Deductions", "Advance Deduction", "Net Pay"].map((h, i) => <th key={h} className={i >= 3 ? "num" : ""} style={{ whiteSpace: "nowrap" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {d.workers.map((w, i) => (
                <tr key={w.worker_id} title={w.sites.join(" · ")}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{w.worker}{w.manual && <span className="badge gray" style={{ marginLeft: 4, fontSize: 10 }}>✎</span>}<div className="muted" style={{ fontSize: 10.5 }}>{w.sites.join(" · ")}</div></td>
                  <td className="muted">{w.designation}</td>
                  <td className="num">{inr(w.rate)}</td><td className="num">{w.days}</td><td className="num">{inr(w.basic)}</td>
                  <td className="num">{w.otH || "—"}</td><td className="num">{w.otAmt ? inr(w.otAmt) : "—"}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{inr(w.gross)}</td>
                  <td className="num">{inr(w.pf)}</td><td className="num">{inr(w.pt)}</td><td className="num">{inr(w.other)}</td>
                  <td className="num">{inr(w.totalDed)}</td><td className="num">{inr(w.adv)}</td>
                  <td className="num" style={{ fontWeight: 800 }}>{inr(w.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ background: "#fff4e5", fontWeight: 800 }}>
              <td colSpan={4}>TOTAL · {d.workers.length} workers</td><td className="num">{sum("days")}</td><td className="num">{inr(sum("basic"))}</td>
              <td className="num">{sum("otH")}</td><td className="num">{inr(sum("otAmt"))}</td><td className="num">{inr(sum("gross"))}</td>
              <td className="num">{inr(sum("pf"))}</td><td className="num">{inr(sum("pt"))}</td><td className="num">{inr(sum("other"))}</td>
              <td className="num">{inr(sum("totalDed"))}</td><td className="num">{inr(sum("adv"))}</td><td className="num">{inr(sum("net"))}</td>
            </tr></tfoot>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
