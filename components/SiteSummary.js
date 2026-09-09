"use client";
// update278: SITE SUMMARY DASHBOARD — per-site labour cost with per-row Excel / PDF exports
// (each strictly that site's data), Export All, grand total, and a live reconciliation line.
import { useEffect, useMemo, useState } from "react";
import { loadPayrollSummary } from "@/lib/payrollSummary";
import { getStaffPayouts } from "@/lib/staffpay";
import { mergeStaffIntoSites } from "@/lib/payrollBoard";   // update342
import { exportSiteSummaryXlsx, exportSiteWorkbook, exportPayrollXlsx } from "@/lib/payrollExport";
import { loadAttendanceGrid, cellCode, otOf } from "@/components/AttendanceSummary";
import { inr } from "@/lib/data";
import { monthLabel } from "@/components/AttendanceSummary";   // update279

export default function SiteSummary({ month, siteId, sites }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState("");
  const [staff, setStaff] = useState(null); const [people, setPeople] = useState(null);   // update342
  useEffect(() => {
    setD(null); setStaff(null); setPeople(null); setErr("");
    loadPayrollSummary(month, siteId).then(setD).catch(e => setErr(e.message));
    getStaffPayouts(month, siteId).then(setStaff).catch(e => setErr(e.message));
    loadAttendanceGrid(month, siteId).then(g => setPeople(g.people)).catch(e => setErr(e.message));
  }, [month, siteId]);

  // update342: labour cost (already site-attributed by the engine) + staff cost, split by
  // the rule documented in lib/payrollBoard.js. HEAD OFFICE now reports its real numbers.
  const board = useMemo(() => {
    if (!d || !staff || !people) return null;
    const primary = {};
    people.forEach(p => { if (p.isStaff && p.uid && p.rows[0]) primary[p.uid] = p.rows[0].sid; });
    const m = mergeStaffIntoSites({ sites: d.sites, people, staffPayouts: staff, staffPrimarySite: primary });
    const expected = +((d.grand.workerGross || 0) + m.grand.staffEarned).toFixed(2);
    m.grand.expected = expected;
    m.grand.reconciled = Math.abs(expected - m.grand.total) < 1;
    return m;
  }, [d, staff, people]);

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
        <div className="muted" style={{ fontSize: 12.5, maxWidth: 660 }}>Site-attributable cost — <b>labour and staff together</b>. Labour comes from the generated labour payroll; staff salary is split across the sites each person actually worked. Every active site is listed every month. Download any single site&apos;s data separately below.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => exportSiteSummaryXlsx({ month, sites: board.sites, grand: board.grand })} disabled={!board}>⬇ Export All (Excel)</button>
          <a href={`/wages/print?kind=sites&month=${month}&site=${siteId}`} target="_blank" rel="noreferrer"><button className="primary" disabled={!board}>⬇ Export All (PDF)</button></a>
        </div>
      </div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      {d && d.missingSites.length > 0 && <div className="note amber" style={{ marginTop: 8, fontSize: 12 }}>No <b>labour</b> payroll generated for {month} at: <b>{d.missingSites.join(", ")}</b> — generate on the Labour Payroll tab. Staff salary at those sites is already included below.</div>}
      {!board ? <div className="muted" style={{ marginTop: 10 }}>Loading…</div> : (
        <>
          <div className="mw-card" style={{ marginTop: 10 }}>
            <div className="mw-band">SITE SUMMARY DASHBOARD — {monthLabel(month)}</div>
            <div style={{ overflowX: "auto" }}>
            <table className="dt-compact mw-table" style={{ minWidth: 900, width: "100%" }}>
              <thead><tr><th>Site</th><th className="num">Workers</th><th className="num">Staff</th><th className="num">Total Days</th><th className="num">Basic Wages (₹)</th><th className="num">OT Hours</th><th className="num">OT Amount (₹)</th><th className="num">Total Site Cost (₹)</th><th>Export</th></tr></thead>
              <tbody>
                {board.sites.map(s => { const quiet = s.days === 0 && s.total === 0; return (
                  <tr key={s.site_id} style={quiet ? { opacity: 0.55 } : undefined}>
                    <td style={{ fontWeight: 700 }}>{s.site}{quiet && <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · nothing recorded this month</span>}
                      {s.staffBasic > 0 && <div className="muted" style={{ fontWeight: 400, fontSize: 10.5 }}>incl. staff {inr(s.staffBasic + s.staffOtAmt)}</div>}</td>
                    <td className="num">{s.workers}</td><td className="num">{s.staff}</td><td className="num">{s.days}</td>
                    <td className="num">{inr(s.basic)}</td><td className="num">{s.otH || "—"}</td><td className="num">{s.otAmt ? inr(s.otAmt) : "—"}</td><td className="num" style={{ fontWeight: 800 }}>{inr(s.total)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="mw-xl" disabled={busy === s.site_id || quiet} onClick={() => siteExcel(s)}>{busy === s.site_id ? "…" : "⬇ Excel"}</button>{" "}
                      <a href={`/wages/print?kind=site&month=${month}&site=${s.site_id}`} target="_blank" rel="noreferrer"><button className="mw-pdf" disabled={quiet}>⬇ PDF</button></a>
                    </td>
                  </tr>
                ); })}
              </tbody>
              <tfoot><tr style={{ background: "#fff4e5", fontWeight: 800 }}>
                <td>GRAND TOTAL</td><td className="num">{board.grand.workers}</td><td className="num">{board.grand.staff}</td><td className="num">{board.grand.days}</td><td className="num">{inr(board.grand.basic)}</td><td className="num">{board.grand.otH || "—"}</td><td className="num">{board.grand.otAmt ? inr(board.grand.otAmt) : "—"}</td><td className="num">{inr(board.grand.total)}</td><td></td>
              </tr></tfoot>
            </table>
            </div>
          </div>
          {/* update342: the check now has to cover BOTH payrolls, or adding staff would have
              silently broken the one line that catches a mis-split. */}
          <div style={{ marginTop: 8, fontSize: 12, color: board.grand.reconciled ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
            {board.grand.reconciled ? "✓ Reconciled" : "✗ NOT reconciled"} — Σ site cost {inr(board.grand.total)} {board.grand.reconciled ? "=" : "≠"} labour gross {inr(d.grand.workerGross)} + staff earned {inr(board.grand.staffEarned)}
            {board.grand.unattributed > 0 && <span style={{ color: "var(--red)" }}> · {inr(board.grand.unattributed)} could not be attributed to any site</span>}
          </div>
          {board.grand.awaitingPayroll?.length > 0 && (
            <div className="note amber" style={{ marginTop: 6, fontSize: 12 }}>
              {/* update343: their DAYS are counted, their COST cannot be until salary is generated.
                  Saying so beats a total that quietly under-reports the month. */}
              Worked this month but staff salary not generated yet: <b>{board.grand.awaitingPayroll.join(", ")}</b> — their days are counted above, their cost is not. Generate on the Staff Salary tab.
            </div>
          )}
          <div className="muted" style={{ marginTop: 6, fontSize: 11.5 }}>
            How staff cost lands on a site: <b>basic</b> is split pro-rata by paid days at each site (earned = salary − deduction); <b>OT</b> is split by the actual OT hours recorded at each site, not apportioned. Anyone who worked one site all month is charged 100% to it.
          </div>
          <div className="mw-note">{/* update279: the mockup's guidance box */}
            <b>✨ New:</b> Payroll rules (PT threshold, PT amount, OT divisor) live in <b>⚙ Payroll Settings</b> — no more manual Excel edits. <b>Full Attendance Summary</b> shows the whole month's grid with a <b>Staff / Labour</b> toggle, matching your two Excel sheets. <b>Payroll Summary</b> gives the full per-worker breakdown (rate, days, basic, OT, gross, PF, PT, deductions, net). This <b>Site Summary Dashboard</b> lets you download <b>any single site's</b> data as Excel or PDF — in the same format as your reference workbook — or export everything at once.
          </div>
        </>
      )}
    </div>
  );
}
