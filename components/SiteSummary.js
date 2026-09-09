"use client";
// update278: SITE SUMMARY DASHBOARD — per-site labour cost with per-row Excel / PDF exports
// (each strictly that site's data), Export All, grand total, and a live reconciliation line.
//
// update339:
//   · THREE TABS — Office Staff | Site Staff | Workers/Labour, the same split as the Full
//     Attendance Summary, driven by the same master assignments.
//   · THE SAME FILTERS — name, ID/mobile, site, designation, category, attendance, OT.
//     They narrow the people first, and the per-site totals are then recomputed from what
//     is left, so the board always adds up to exactly what you are looking at.
//   · FILTERS REACH THE EXPORTS. Excel exports the filtered board; the PDF route is handed
//     the same tab and filters in its URL and rebuilds the identical board.
//   · EVERY ACTIVE SITE APPEARS EVERY MONTH, zeros included. A site that vanished from this
//     table used to be indistinguishable from a site that cost nothing.
//
// Staff tabs show DAYS and OT HOURS per site, not money — see the note in lib/siteBoard.js.
import { useEffect, useMemo, useState } from "react";
import { loadPayrollSummary } from "@/lib/payrollSummary";
import { exportSiteSummaryXlsx, exportSiteWorkbook } from "@/lib/payrollExport";
import { loadAttendanceGrid, cellCode, otOf, monthLabel } from "@/components/AttendanceSummary";   // update279
import { inr } from "@/lib/data";
import { buildSiteBoard, boardOptions, EMPTY_FILTERS, filtersActive, filtersToQuery } from "@/lib/siteBoard";

const TABS = [["office", "🏢 Office Staff"], ["site_staff", "👷 Site Staff"], ["labour", "🧰 Workers / Labour"]];

// ---- module scope: never define a component inside a component (update204) ----

function Filters({ f, setF, opts }) {
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const sel = { fontSize: 12, padding: "5px 7px" };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
      <input placeholder="🔍 Search name…" value={f.q} onChange={e => set("q", e.target.value)} style={{ ...sel, minWidth: 170 }} />
      <input placeholder="ID / mobile" value={f.id} onChange={e => set("id", e.target.value)} style={{ ...sel, width: 118 }} />
      <select style={sel} value={f.site} onChange={e => set("site", e.target.value)}>
        <option value="">All sites</option>{opts.sites.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select style={sel} value={f.role} onChange={e => set("role", e.target.value)}>
        <option value="">All designations</option>{opts.roles.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <select style={sel} value={f.cat} onChange={e => set("cat", e.target.value)}>
        <option value="">All categories</option>{opts.cats.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select style={sel} value={f.status} onChange={e => set("status", e.target.value)}>
        <option value="">Any attendance</option>
        <option value="present">Has full days</option>
        <option value="half">Has half days</option>
        <option value="absent">Has absences</option>
        <option value="leave">On leave</option>
        <option value="review">Needs review ⏱</option>
      </select>
      <select style={sel} value={f.ot} onChange={e => set("ot", e.target.value)}>
        <option value="">OT: any</option><option value="yes">With OT</option><option value="no">Without OT</option>
      </select>
      {filtersActive(f) && <button style={sel} onClick={() => setF({ ...EMPTY_FILTERS })}>✕ Clear</button>}
    </div>
  );
}

export default function SiteSummary({ month, siteId, sites }) {
  const [pay, setPay] = useState(null);
  const [people, setPeople] = useState(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("labour");
  const [f, setF] = useState({ ...EMPTY_FILTERS });

  useEffect(() => {
    setPay(null); setPeople(null); setErr("");
    loadPayrollSummary(month, siteId).then(setPay).catch(e => setErr(e.message));
    loadAttendanceGrid(month, siteId).then(g => setPeople(g.people)).catch(e => setErr(e.message));
  }, [month, siteId]);

  const opts = useMemo(() => boardOptions(people, tab), [people, tab]);
  const board = useMemo(() => (pay && people) ? buildSiteBoard({ tab, filters: f, people, pay }) : null, [tab, f, people, pay]);

  async function siteExcel(s) {
    setBusy(s.site_id); setErr("");
    try {
      const [gl, gs, pr] = await Promise.all([
        loadAttendanceGrid(month, s.site_id, "labour"),
        loadAttendanceGrid(month, s.site_id, "staff"),
        loadPayrollSummary(month, s.site_id),
      ]);
      await exportSiteWorkbook({ month, site: s.site, gridLabour: gl, gridStaff: gs, payrollWorkers: pr.workers, siteRow: s, cellCode, otOf });
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  }

  const pdfHref = `/wages/print?kind=sites&month=${month}&site=${siteId}${filtersToQuery(f, tab)}`;
  const loading = !pay || !people;

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div className="muted" style={{ fontSize: 12.5, maxWidth: 640 }}>
          Site-attributable cost — days, basic wages and OT split correctly across sites. Every active site is listed every month, showing zeros where nothing was recorded. Download any single site&apos;s data below.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => exportSiteSummaryXlsx({ month, sites: board.sites, grand: board.grand, isLabour: board.isLabour, tab: board.tab, filtered: filtersActive(f) })} disabled={!board}>⬇ Export All (Excel)</button>
          <a href={pdfHref} target="_blank" rel="noreferrer"><button className="primary" disabled={!board}>⬇ Export All (PDF)</button></a>
        </div>
      </div>

      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginTop: 12 }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setF({ ...EMPTY_FILTERS }); }}
            style={{ fontSize: 12.5, fontWeight: tab === k ? 800 : 600, padding: "8px 16px", border: "none", borderRadius: 0,
              borderBottom: tab === k ? "3px solid var(--copper)" : "3px solid transparent",
              background: "transparent", color: tab === k ? "var(--copper)" : "#475569", cursor: "pointer" }}>{l}</button>
        ))}
      </div>

      <Filters f={f} setF={setF} opts={opts} />

      {loading ? <div className="muted" style={{ marginTop: 10 }}>Loading…</div> : (
        <>
          <div className="muted" style={{ fontSize: 12, margin: "8px 0" }}>
            {board.grand.people} {board.isLabour ? "worker" : "staff member"}{board.grand.people === 1 ? "" : "s"} in this tab
            {filtersActive(f) ? " after filters" : ""} · {board.grand.sitesWithActivity} of {board.sites.length} sites with activity
          </div>

          {!board.isLabour && (
            <div className="note amber" style={{ marginTop: 4, fontSize: 12 }}>
              Staff salary is a single monthly figure per person with no site attached, so this tab reports <b>days and OT hours per site</b> — both taken from attendance — and leaves cost blank. Splitting a monthly salary across sites needs a rule you choose; I have not invented one.
            </div>
          )}

          <div className="mw-card" style={{ marginTop: 10 }}>
            <div className="mw-band">SITE SUMMARY — {TABS.find(t => t[0] === tab)[1].replace(/^\S+\s/, "").toUpperCase()} · {monthLabel(month)}</div>
            <div style={{ overflowX: "auto" }}>
              <table className="dt-compact mw-table" style={{ minWidth: 900, width: "100%" }}>
                <thead><tr>
                  <th>Site</th>
                  <th className="num">{board.isLabour ? "Workers Present" : "Staff Present"}</th>
                  <th className="num">Total Days</th>
                  <th className="num">OT Hours</th>
                  {board.isLabour && <><th className="num">Basic Wages (₹)</th><th className="num">OT Amount (₹)</th><th className="num">Total Site Labour Cost (₹)</th></>}
                  <th>Export</th>
                </tr></thead>
                <tbody>
                  {board.sites.map(s => {
                    const quiet = s.days === 0 && s.total === 0;
                    return (
                      <tr key={s.site_id} style={quiet ? { opacity: 0.55 } : undefined}>
                        <td style={{ fontWeight: 700 }}>{s.site}{quiet && <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · nothing recorded</span>}</td>
                        <td className="num">{s.workers}</td>
                        <td className="num">{s.days}</td>
                        <td className="num">{s.otH || "—"}</td>
                        {board.isLabour && <>
                          <td className="num">{inr(s.basic)}</td>
                          <td className="num">{s.otAmt ? inr(s.otAmt) : "—"}</td>
                          <td className="num" style={{ fontWeight: 800 }}>{inr(s.total)}</td>
                        </>}
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button className="mw-xl" disabled={busy === s.site_id || quiet} onClick={() => siteExcel(s)}>{busy === s.site_id ? "…" : "⬇ Excel"}</button>{" "}
                          <a href={`/wages/print?kind=site&month=${month}&site=${s.site_id}`} target="_blank" rel="noreferrer"><button className="mw-pdf" disabled={quiet}>⬇ PDF</button></a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr style={{ background: "#fff4e5", fontWeight: 800 }}>
                  <td>GRAND TOTAL</td>
                  <td className="num">{board.grand.workers}</td>
                  <td className="num">{board.grand.days}</td>
                  <td className="num">{board.grand.otH || "—"}</td>
                  {board.isLabour && <>
                    <td className="num">{inr(board.grand.basic)}</td>
                    <td className="num">{board.grand.otAmt ? inr(board.grand.otAmt) : "—"}</td>
                    <td className="num">{inr(board.grand.total)}</td>
                  </>}
                  <td></td>
                </tr></tfoot>
              </table>
            </div>
          </div>

          {board.isLabour && (
            board.grand.canReconcile ? (
              <div style={{ marginTop: 8, fontSize: 12, color: board.grand.reconciled ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                {board.grand.reconciled ? "✓ Reconciled" : "✗ NOT reconciled"} — Σ site labour cost {inr(board.grand.total)} {board.grand.reconciled ? "=" : "≠"} Σ worker gross {inr(board.grand.workerGross)} · Σ worker net {inr(board.grand.workerNet)}
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Reconciliation is shown only on the unfiltered board — a filtered view is a subset by design, so it would always read as not reconciled. Clear the filters to check it.
              </div>
            )
          )}

          {pay.missingSites.length > 0 && (
            <div className="note amber" style={{ marginTop: 8, fontSize: 12 }}>
              Payroll not yet generated for {month}: <b>{pay.missingSites.join(", ")}</b> — those sites show zeros above until you generate on the Labour Payroll tab.
            </div>
          )}
        </>
      )}
    </div>
  );
}
