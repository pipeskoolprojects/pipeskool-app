"use client";
// update278: SITE SUMMARY DASHBOARD — per-site labour cost with per-row Excel / PDF exports
// (each strictly that site's data), Export All, grand total, and a live reconciliation line.
import { useEffect, useState } from "react";
import { loadPayrollSummary } from "@/lib/payrollSummary";
import { exportSiteSummaryXlsx, exportSiteWorkbook, exportPayrollXlsx } from "@/lib/payrollExport";
import { loadAttendanceGrid, cellCode, otOf } from "@/components/AttendanceSummary";
import { inr } from "@/lib/data";
import { monthLabel } from "@/components/AttendanceSummary";   // update279

export default function SiteSummary({ month, siteId, sites }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState("");
  useEffect(() => { setD(null); setErr(""); loadPayrollSummary(month, siteId).then(setD).catch(e => setErr(e.message)); }, [month, siteId]);

  async function siteExcel(s) {
    setBusy(s.site_id); setErr("");
    try {
      const [gl, gs, pr] = await Promise.all([loadAttendanceGrid(month, s.site_id, "labour"), loadAttendanceGrid(month, s.site_id, "staff"), loadPayrollSummary(month, s.site_id)]);
      await exportSiteWorkbook({ month, site: s.site, gridLabour: gl, gridStaff: gs, payrollWorkers: pr.workers, siteRow: s, cellCode, otOf });
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  }
  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div className="muted" style={{ fontSize: 12.5 }}>Site-attributable labour cost — days, basic wages and OT split correctly across sites. Download any single site's data separately below.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => exportSiteSummaryXlsx({ month, sites: d.sites, grand: d.grand })} disabled={!d || !d.sites.length}>⬇ Export All (Excel)</button>
          <a href={`/wages/print?kind=sites&month=${month}&site=${siteId}`} target="_blank" rel="noreferrer"><button className="primary" disabled={!d || !d.sites.length}>⬇ Export All (PDF)</button></a>
        </div>
      </div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      {d && d.missingSites.length > 0 && <div className="note amber" style={{ marginTop: 8, fontSize: 12 }}>Not yet generated for {month}: <b>{d.missingSites.join(", ")}</b> — generate on the Labour Payroll tab to include them.</div>}
      {!d ? <div className="muted" style={{ marginTop: 10 }}>Loading…</div> : (
        <>
          <div className="mw-card" style={{ marginTop: 10 }}>
            <div className="mw-band">SITE SUMMARY DASHBOARD — {monthLabel(month)}</div>
            <div style={{ overflowX: "auto" }}>
            <table className="dt-compact mw-table" style={{ minWidth: 900, width: "100%" }}>
              <thead><tr><th>Site</th><th className="num">Workers Present</th><th className="num">Total Days</th><th className="num">Basic Wages (₹)</th><th className="num">OT Amount (₹)</th><th className="num">Total Site Labour Cost (₹)</th><th>Export</th></tr></thead>
              <tbody>
                {d.sites.map(s => { const quiet = s.days === 0 && s.total === 0; return (
                  <tr key={s.site_id} style={quiet ? { opacity: 0.55 } : undefined}>
                    <td style={{ fontWeight: 700 }}>{s.site}{quiet && <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · nothing recorded</span>}</td><td className="num">{s.workers}</td><td className="num">{s.days}</td>
                    <td className="num">{inr(s.basic)}</td><td className="num">{s.otAmt ? inr(s.otAmt) : "—"}</td><td className="num" style={{ fontWeight: 800 }}>{inr(s.total)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="mw-xl" disabled={busy === s.site_id || quiet} onClick={() => siteExcel(s)}>{busy === s.site_id ? "…" : "⬇ Excel"}</button>{" "}
                      <a href={`/wages/print?kind=site&month=${month}&site=${s.site_id}`} target="_blank" rel="noreferrer"><button className="mw-pdf" disabled={quiet}>⬇ PDF</button></a>
                    </td>
                  </tr>
                ); })}
              </tbody>
              <tfoot><tr style={{ background: "#fff4e5", fontWeight: 800 }}>
                <td>GRAND TOTAL</td><td className="num">{d.grand.workers}</td><td className="num">{d.grand.days}</td><td className="num">{inr(d.grand.basic)}</td><td className="num">{d.grand.otAmt ? inr(d.grand.otAmt) : "—"}</td><td className="num">{inr(d.grand.total)}</td><td></td>
              </tr></tfoot>
            </table>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: d.grand.reconciled ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
            {d.grand.reconciled ? "✓ Reconciled" : "✗ NOT reconciled"} — Σ site labour cost {inr(d.grand.total)} {d.grand.reconciled ? "=" : "≠"} Σ worker gross {inr(d.grand.workerGross)} · Σ worker net {inr(d.grand.workerNet)}
          </div>
          <div className="mw-note">{/* update279: the mockup's guidance box */}
            <b>✨ New:</b> Payroll rules (PT threshold, PT amount, OT divisor) live in <b>⚙ Payroll Settings</b> — no more manual Excel edits. <b>Full Attendance Summary</b> shows the whole month's grid with a <b>Staff / Labour</b> toggle, matching your two Excel sheets. <b>Payroll Summary</b> gives the full per-worker breakdown (rate, days, basic, OT, gross, PF, PT, deductions, net). This <b>Site Summary Dashboard</b> lets you download <b>any single site's</b> data as Excel or PDF — in the same format as your reference workbook — or export everything at once.
          </div>
        </>
      )}
    </div>
  );
}
