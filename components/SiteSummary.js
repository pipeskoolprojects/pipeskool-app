"use client";
// update278: SITE SUMMARY DASHBOARD — per-site labour cost with per-row Excel / PDF exports
// (each strictly that site's data), Export All, grand total, and a live reconciliation line.
import { useEffect, useState } from "react";
import { loadPayrollSummary } from "@/lib/payrollSummary";
import { exportSiteSummaryXlsx, exportSiteWorkbook, exportPayrollXlsx } from "@/lib/payrollExport";
import { loadAttendanceGrid, cellCode, otOf } from "@/components/AttendanceSummary";
import { inr } from "@/lib/data";

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
        <div><h2 style={{ margin: 0 }}>Site Summary Dashboard — {month}</h2>
          <div className="muted" style={{ fontSize: 12 }}>Site-attributable labour cost — days, basic wages and OT split across sites. Download any single site's data separately below.</div></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => exportSiteSummaryXlsx({ month, sites: d.sites, grand: d.grand })} disabled={!d || !d.sites.length}>⬇ Export All (Excel)</button>
          <a href={`/wages/print?kind=sites&month=${month}&site=${siteId}`} target="_blank" rel="noreferrer"><button className="primary" disabled={!d || !d.sites.length}>⬇ Export All (PDF)</button></a>
        </div>
      </div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      {d && d.missingSites.length > 0 && <div className="note amber" style={{ marginTop: 8, fontSize: 12 }}>Not yet generated for {month}: <b>{d.missingSites.join(", ")}</b> — generate on the Labour Payroll tab to include them.</div>}
      {!d ? <div className="muted" style={{ marginTop: 10 }}>Loading…</div> : d.sites.length === 0 ? <div className="muted" style={{ marginTop: 10 }}>No generated payroll for {month}.</div> : (
        <>
          <div style={{ overflowX: "auto", marginTop: 10, border: "1px solid var(--border)", borderRadius: 10 }}>
            <table className="dt-compact" style={{ minWidth: 900, width: "100%" }}>
              <thead><tr style={{ background: "#0f1a2e", color: "#fff" }}><th>Site</th><th className="num">Workers Present</th><th className="num">Total Days</th><th className="num">Basic Wages (₹)</th><th className="num">OT Amount (₹)</th><th className="num">Total Site Labour Cost (₹)</th><th>Export</th></tr></thead>
              <tbody>
                {d.sites.map(s => (
                  <tr key={s.site_id}>
                    <td style={{ fontWeight: 700 }}>{s.site}</td><td className="num">{s.workers}</td><td className="num">{s.days}</td>
                    <td className="num">{inr(s.basic)}</td><td className="num">{s.otAmt ? inr(s.otAmt) : "—"}</td><td className="num" style={{ fontWeight: 800 }}>{inr(s.total)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button style={{ fontSize: 11.5, color: "var(--green)", borderColor: "var(--green)" }} disabled={busy === s.site_id} onClick={() => siteExcel(s)}>{busy === s.site_id ? "…" : "⬇ Excel"}</button>{" "}
                      <a href={`/wages/print?kind=site&month=${month}&site=${s.site_id}`} target="_blank" rel="noreferrer"><button style={{ fontSize: 11.5, color: "var(--red)", borderColor: "var(--red)" }}>⬇ PDF</button></a>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ background: "#fff4e5", fontWeight: 800 }}>
                <td>GRAND TOTAL</td><td className="num">{d.grand.workers}</td><td className="num">{d.grand.days}</td><td className="num">{inr(d.grand.basic)}</td><td className="num">{d.grand.otAmt ? inr(d.grand.otAmt) : "—"}</td><td className="num">{inr(d.grand.total)}</td><td></td>
              </tr></tfoot>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: d.grand.reconciled ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
            {d.grand.reconciled ? "✓ Reconciled" : "✗ NOT reconciled"} — Σ site labour cost {inr(d.grand.total)} {d.grand.reconciled ? "=" : "≠"} Σ worker gross {inr(d.grand.workerGross)} · Σ worker net {inr(d.grand.workerNet)}
          </div>
        </>
      )}
    </div>
  );
}
