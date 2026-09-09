"use client";
// update278: PDF documents for the payroll layer — letterhead page, Print -> Save as PDF
// (the same pattern as every Pipeskool document; works on Android via the share sheet).
// kind = payroll (consolidated per worker) | sites (site summary dashboard) | site (single site: attendance + payroll + site line)
import { useEffect, useState } from "react";
import { loadPayrollSummary } from "@/lib/payrollSummary";
import { getStaffPayouts } from "@/lib/staffpay";
import { filtersFromQuery, filtersActive, allowedPeople, staffRowsFor, mergeStaffIntoSites } from "@/lib/payrollBoard";   // update340
import { loadAttendanceGrid, cellCode, cellValue, otOf } from "@/components/AttendanceSummary";   // update332: numeric cells
import { inr } from "@/lib/data";
import Logo from "@/components/Logo";   // update331c: the real logo, not a text wordmark

const ATT = { P: "#e8f6ee", H: "#fff4cc", A: "#fde8e8", WO: "#eef2f7", HOL: "#fce7f3" };
const Band = ({ children }) => <div style={{ background: "#1f2a4b", color: "#fff", fontWeight: 800, padding: "8px 12px", marginTop: 14, fontSize: 13 }}>{children}</div>;
const Note = ({ children }) => <div style={{ fontSize: 10, color: "#6b7280", fontStyle: "italic", padding: "4px 2px" }}>{children}</div>;
const th = { background: "#f3f4f6", fontWeight: 700, fontSize: 10, padding: "5px 6px", borderBottom: "1px solid #ddd", textAlign: "right" };
const td = { fontSize: 10.5, padding: "4px 6px", borderBottom: "1px solid #eee", textAlign: "right" };

export default function WagesPrint() {
  const [p, setP] = useState(null); const [d, setD] = useState(null); const [g, setG] = useState(null); const [err, setErr] = useState("");
  const [board, setBoard] = useState(null);   // update340: the filtered payroll rows
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    // update340: Payroll Summary hands its tab and filters over in the URL so the PDF is
    // exactly the list that was on screen, not a fresh unfiltered one.
    const { filters, tab } = filtersFromQuery(sp);
    const q = { kind: sp.get("kind") || "payroll", month: sp.get("month"), site: sp.get("site") || "all", filters, tab };
    setP(q);
    (async () => {
      try {
        const data = await loadPayrollSummary(q.month, q.site); setD(data);
        if (q.kind === "payroll") {
          const grid = await loadAttendanceGrid(q.month, q.site);
          const allowed = allowedPeople(grid.people, q.tab, q.filters);
          if (q.tab === "labour") {
            const ids = new Set(allowed.map(x => x.wid));
            setBoard({ tab: q.tab, isLabour: true, rows: data.workers.filter(w => ids.has(w.worker_id)) });
          } else {
            const st = await getStaffPayouts(q.month, q.site);
            setBoard({ tab: q.tab, isLabour: false, rows: staffRowsFor(st, allowed) });   // update341
          }
        }
        if (q.kind === "sites") {
          // update342: same merged board as the screen — labour + staff attributed per site
          const [grid, st] = await Promise.all([loadAttendanceGrid(q.month, q.site), getStaffPayouts(q.month, q.site)]);
          const primary = {};
          grid.people.forEach(x => { if (x.isStaff && x.uid && x.rows[0]) primary[x.uid] = x.rows[0].sid; });
          const m = mergeStaffIntoSites({ sites: data.sites, people: grid.people, staffPayouts: st, staffPrimarySite: primary });
          setBoard({ kind: "sites", ...m });
        }
        if (q.kind === "site") { const [gl, gs] = await Promise.all([loadAttendanceGrid(q.month, q.site, "labour"), loadAttendanceGrid(q.month, q.site, "staff")]); setG({ gl, gs }); }
      } catch (e) { setErr(e.message); }
    })();
  }, []);
  if (!p) return null;
  const siteName = d && p.site !== "all" ? (d.rows[0]?.site || d.sites[0]?.site || "") : "All sites";
  const sum = (arr, k) => +arr.reduce((n, w) => n + Number(w[k] || 0), 0).toFixed(2);
  const Grid = ({ grid, kind }) => !grid || !grid.rows.length ? null : (
    <>
      <Band>MONTHLY ATTENDANCE — {siteName.toUpperCase()} · {kind === "staff" ? "STAFF" : "LABOUR"}</Band>
      <Note>1 = Present · 0.5 = Half day (Sunday half counts as a full paid day) · 0 = Absent · HOL = company holiday · OT row = approved hours</Note>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr><th style={{ ...th, textAlign: "left" }}>Worker</th>{grid.days.map(dd => <th key={dd.iso} style={{ ...th, textAlign: "center", padding: "3px 1px", fontSize: 8 }}>{String(dd.day).padStart(2, "0")}<br />{dd.wd}</th>)}<th style={th}>Days</th><th style={th}>OT</th></tr></thead>
        <tbody>{grid.rows.map(r => (
          <>
            <tr key={r.key}><td style={{ ...td, textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{r.worker}</td>
              {grid.days.map(dd => { const c = cellCode(r, dd, grid.wo, grid.hol); return <td key={dd.iso} style={{ ...td, textAlign: "center", padding: "2px 1px", fontSize: 9, background: ATT[c] || "#fff" }}>{cellValue(c)}</td>; })}
              <td style={{ ...td, fontWeight: 700 }}>{r.daysPaid}</td><td style={td}>{r.otTotal || ""}</td></tr>
            {r.otTotal > 0 && <tr key={r.key + "ot"}><td style={{ ...td, textAlign: "left", fontSize: 9, fontStyle: "italic", color: "#7c2d12" }}>OT (h)</td>{grid.days.map(dd => <td key={dd.iso} style={{ ...td, textAlign: "center", fontSize: 8, color: "#7c2d12", padding: "1px" }}>{otOf(r, dd) || ""}</td>)}<td colSpan={2}></td></tr>}
          </>
        ))}</tbody>
      </table>
    </>
  );
  const PayrollTable = ({ workers }) => (
    <>
      <Band>PAYROLL SUMMARY — {siteName.toUpperCase()} · {p.month}</Band>
      <Note>Basic = daily rate × payable days (incl. holiday pay) · OT rate = daily rate ÷ OT divisor · Gross = Basic + OT · PT once per worker above the threshold · Net = Gross − PF − PT − Other − Advance{filtersActive(p.filters) ? " · FILTERED VIEW — only the rows matching the filters on screen" : ""}</Note>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{["Sr", "Worker", "Designation", "Rate", "Days", "Basic", "OT h", "OT ₹", "Gross", "PF", "PT", "Other", "Total Ded.", "Advance", "Net Pay"].map((h, i) => <th key={h} style={{ ...th, textAlign: i < 3 ? "left" : "right" }}>{h}</th>)}</tr></thead>
        <tbody>{workers.map((w, i) => <tr key={w.worker_id}><td style={{ ...td, textAlign: "left" }}>{i + 1}</td><td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{w.worker}</td><td style={{ ...td, textAlign: "left" }}>{w.designation}</td>
          <td style={td}>{inr(w.rate)}</td><td style={td}>{w.days}</td><td style={td}>{inr(w.basic)}</td><td style={td}>{w.otH || "—"}</td><td style={td}>{w.otAmt ? inr(w.otAmt) : "—"}</td><td style={{ ...td, fontWeight: 700 }}>{inr(w.gross)}</td>
          <td style={td}>{inr(w.pf)}</td><td style={td}>{inr(w.pt)}</td><td style={td}>{inr(w.other)}</td><td style={td}>{inr(w.totalDed)}</td><td style={td}>{inr(w.adv)}</td><td style={{ ...td, fontWeight: 800 }}>{inr(w.net)}</td></tr>)}</tbody>
        <tfoot><tr style={{ background: "#fff4e5", fontWeight: 800 }}><td colSpan={4} style={{ ...td, textAlign: "left" }}>TOTAL · {workers.length} workers</td><td style={td}>{sum(workers, "days")}</td><td style={td}>{inr(sum(workers, "basic"))}</td><td style={td}>{sum(workers, "otH")}</td><td style={td}>{inr(sum(workers, "otAmt"))}</td><td style={td}>{inr(sum(workers, "gross"))}</td><td style={td}>{inr(sum(workers, "pf"))}</td><td style={td}>{inr(sum(workers, "pt"))}</td><td style={td}>{inr(sum(workers, "other"))}</td><td style={td}>{inr(sum(workers, "totalDed"))}</td><td style={td}>{inr(sum(workers, "adv"))}</td><td style={td}>{inr(sum(workers, "net"))}</td></tr></tfoot>
      </table>
    </>
  );
  // update340: staff payroll for the Office Staff / Site Staff tabs
  const StaffTable = ({ rows, tab }) => (
    <>
      <Band>PAYROLL SUMMARY — {tab === "office" ? "OFFICE STAFF" : "SITE STAFF"} · {siteName.toUpperCase()} · {p.month}</Band>
      <Note>Net = Monthly Salary − Deduction + OT Amount − Advance · figures from the generated staff salary for the month{filtersActive(p.filters) ? " · FILTERED VIEW — only the rows matching the filters on screen" : ""}</Note>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{["Sr", "Staff Name", "Designation", "Salary", "Work Days", "Present", "Absent", "Deduction", "OT h", "OT ₹", "Advance", "Net Pay", "Status"].map((h, i) => <th key={h} style={{ ...th, textAlign: i < 3 ? "left" : "right" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((w, i) => (
          <tr key={w.id}>
            <td style={{ ...td, textAlign: "left" }}>{i + 1}</td>
            <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{w.name}</td>
            <td style={{ ...td, textAlign: "left" }}>{String(w.role || "").split("_").map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(" ")}</td>
            <td style={td}>{inr(w.monthly_salary)}</td><td style={td}>{w.working_days}</td><td style={td}>{w.days_present}</td><td style={td}>{w.days_absent}</td>
            <td style={td}>{inr(w.deduction)}</td><td style={td}>{w.ot_hours || "—"}</td><td style={td}>{w.ot_amount ? inr(w.ot_amount) : "—"}</td>
            <td style={td}>{inr(w.advances_deducted)}</td><td style={{ ...td, fontWeight: 800 }}>{inr(w.net)}</td>
            <td style={{ ...td, textAlign: "right", textTransform: "capitalize" }}>{w.status}</td>
          </tr>))}
        </tbody>
        <tfoot><tr style={{ background: "#fff4e5", fontWeight: 800 }}>
          <td colSpan={3} style={{ ...td, textAlign: "left" }}>TOTAL · {rows.length} staff</td>
          <td style={td}>{inr(sum(rows, "monthly_salary"))}</td><td style={td}>{sum(rows, "working_days")}</td><td style={td}>{sum(rows, "days_present")}</td><td style={td}>{sum(rows, "days_absent")}</td>
          <td style={td}>{inr(sum(rows, "deduction"))}</td><td style={td}>{sum(rows, "ot_hours")}</td><td style={td}>{inr(sum(rows, "ot_amount"))}</td>
          <td style={td}>{inr(sum(rows, "advances_deducted"))}</td><td style={td}>{inr(sum(rows, "net"))}</td><td></td>
        </tr></tfoot>
      </table>
    </>
  );
  const SitesTable = ({ sites, grand }) => (
    <>
      <Band>SITE SUMMARY DASHBOARD — {p.month}</Band>
      <Note>Total Site Labour Cost = Basic Wages + OT Amount · figures from the generated payroll for the month · every active site is listed, showing zeros where nothing was recorded</Note>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr><th style={{ ...th, textAlign: "left" }}>Site</th><th style={th}>Workers</th><th style={th}>Staff</th><th style={th}>Total Days</th><th style={th}>Basic Wages (₹)</th><th style={th}>OT Hours</th><th style={th}>OT Amount (₹)</th><th style={th}>Total Site Cost (₹)</th></tr></thead>
        <tbody>{sites.map(s => <tr key={s.site_id}><td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{s.site}</td><td style={td}>{s.workers}</td><td style={td}>{s.staff ?? 0}</td><td style={td}>{s.days}</td><td style={td}>{inr(s.basic)}</td><td style={td}>{s.otH || "—"}</td><td style={td}>{s.otAmt ? inr(s.otAmt) : "—"}</td><td style={{ ...td, fontWeight: 800 }}>{inr(s.total)}</td></tr>)}</tbody>
        {grand && <tfoot><tr style={{ background: "#fff4e5", fontWeight: 800 }}><td style={{ ...td, textAlign: "left" }}>GRAND TOTAL</td><td style={td}>{grand.workers}</td><td style={td}>{grand.staff ?? 0}</td><td style={td}>{grand.days}</td><td style={td}>{inr(grand.basic)}</td><td style={td}>{grand.otH || "—"}</td><td style={td}>{grand.otAmt ? inr(grand.otAmt) : "—"}</td><td style={td}>{inr(grand.total)}</td></tr></tfoot>}
      </table>
    </>
  );
  return (
    <div className="wp-doc" style={{ maxWidth: 1100, margin: "0 auto", padding: 24, background: "#fff", color: "#111", fontFamily: "Inter, Arial, sans-serif" }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } @page { size: A4 landscape; margin: 10mm; } } @media screen and (max-width: 640px) { .wp-doc { padding: 10px !important; } }`}</style>
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className="primary" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
        <button onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign("/wages"); }}>← Back</button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "3px solid #FF7A1A", paddingBottom: 8 }}>
        <div><Logo height={20} /><div style={{ fontSize: 11, color: "#6b7280", marginTop: 5 }}>Pipeskool Projects Pvt. Ltd. · Specialist Plumbing & Piping Contractors · Ahmedabad</div></div>
        <div style={{ textAlign: "right", fontSize: 12 }}><b>{p.kind === "sites" ? "Site Summary Dashboard" : p.kind === "site" ? "Site Report" : "Payroll Summary"}</b><br />{siteName} · {p.month}</div>
      </div>
      {err && <div style={{ color: "#b91c1c", padding: 10 }}>{err}</div>}
      {!d ? <div style={{ padding: 10 }}>Loading…</div> : (
        <>
          {p.kind === "site" && g && <><Grid grid={g.gl} kind="labour" /><Grid grid={g.gs} kind="staff" /></>}
          {p.kind === "payroll" && board && (board.isLabour
            ? <PayrollTable workers={board.rows} />
            : <StaffTable rows={board.rows} tab={board.tab} />)}
          {p.kind === "site" && <PayrollTable workers={d.workers} />}
          {p.kind === "sites" && board?.kind === "sites" && <SitesTable sites={board.sites} grand={board.grand} />}
          {p.kind === "site" && <SitesTable sites={d.sites} grand={null} />}
        </>
      )}
      <div style={{ fontSize: 9, color: "#6b7280", textAlign: "center", marginTop: 14 }}>System generated from Pipeskool attendance & payroll · {new Date().toLocaleString("en-IN")}</div>
    </div>
  );
}
