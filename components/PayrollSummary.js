"use client";
// update278: PAYROLL SUMMARY — one consolidated row per worker (days summed across sites),
// the 15 reference columns, from the generated payroll (Settings-driven engine).
//
// update340:
//   · THREE TABS — Office Staff | Site Staff | Workers/Labour, split by the same master
//     assignment the Full Attendance Summary uses, so a person can never appear in one
//     section here and a different one there.
//   · THE SAME FILTERS — name, ID/mobile, site, designation, category, attendance, OT.
//   · FILTERS REACH THE EXPORTS. Excel exports exactly the filtered rows; the PDF route is
//     handed the same tab and filters in its URL and rebuilds the identical list.
//
// The Workers/Labour tab is the original table, untouched: same 15 columns, same figures
// from wage_payouts. The two staff tabs read staff_payouts — real generated amounts, one
// monthly row per person, so nothing is apportioned or invented.
import { useEffect, useMemo, useState } from "react";
import { loadPayrollSummary } from "@/lib/payrollSummary";
import { getStaffPayouts } from "@/lib/staffpay";
import { exportPayrollXlsx, exportStaffPayrollXlsx } from "@/lib/payrollExport";
import { loadAttendanceGrid, monthLabel } from "@/components/AttendanceSummary";   // update279
import { inr } from "@/lib/data";
import { EMPTY_FILTERS, filtersActive, filtersToQuery, boardOptions, allowedPeople, staffRowsFor } from "@/lib/payrollBoard";

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

// update347: Basic Wages is worked pay PLUS paid weekly-offs PLUS holiday pay. Showing only
// the total made every row look wrong (Ajay Gupta 5.5 x 600 = 3,300 against a Basic of 4,500).
// The parts are now their own columns, so Worked Pay + Off Pay + Holiday Pay = Basic, visibly.
const LAB_COLS = ["Sr", "Worker Name", "Designation", "Daily Rate", "Days Worked", "Worked Pay", "Paid Off Days", "Off Pay", "Paid Holidays", "Holiday Pay", "Basic Wages", "OT Hours", "OT Amount", "Gross Earnings", "PF Deduction", "Professional Tax", "Other Deduction", "Total Deductions", "Advance Deduction", "Net Pay"];
// update347: the "+1 day" on Lakshman's net was HOLIDAY PAY — he worked 4 September, a
// company holiday, so the 2x rule adds one more day's pay. Mukesh did not work it, so he got
// nothing extra. Identical code for both; it was simply never shown. It now has its own two
// columns, and the divisor actually used is printed next to Working Days.
const STF_COLS = ["Sr", "Staff Name", "Designation", "Monthly Salary", "Working Days", "Days Present", "Days Absent", "Paid Holidays", "Holiday Pay", "Deduction", "OT Hours", "OT Amount", "Advance O/S", "Advance", "Net Pay", "Status"];

export default function PayrollSummary({ month, siteId, sites }) {
  const [d, setD] = useState(null);
  const [staff, setStaff] = useState(null);
  const [people, setPeople] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("labour");
  const [f, setF] = useState({ ...EMPTY_FILTERS });

  useEffect(() => {
    setD(null); setStaff(null); setPeople(null); setErr("");
    loadPayrollSummary(month, siteId).then(setD).catch(e => setErr(e.message));
    getStaffPayouts(month, siteId).then(setStaff).catch(e => setErr(e.message));
    loadAttendanceGrid(month, siteId).then(g => setPeople(g.people)).catch(e => setErr(e.message));
  }, [month, siteId]);

  const siteName = siteId === "all" ? "All sites" : (sites.find(s => String(s.id) === String(siteId))?.name || "");
  const isLabour = tab === "labour";
  const loading = !d || !staff || !people;

  const opts = useMemo(() => boardOptions(people, tab), [people, tab]);

  // the people this tab + these filters allow through, then the payroll rows for them
  const rows = useMemo(() => {
    if (loading) return [];
    const allowed = allowedPeople(people, tab, f);
    if (isLabour) {
      const ids = new Set(allowed.map(p => p.wid));
      return d.workers.filter(w => ids.has(w.worker_id));
    }
    return staffRowsFor(staff, allowed);   // update341
  }, [loading, people, tab, f, d, staff, isLabour]);

  const sum = k => +rows.reduce((n, w) => n + Number(w[k] || 0), 0).toFixed(2);
  const pdfHref = `/wages/print?kind=payroll&month=${month}&site=${siteId}${filtersToQuery(f, tab)}`;

  async function excel() {
    if (isLabour) await exportPayrollXlsx({ month, siteName, workers: rows, filtered: filtersActive(f) });
    else await exportStaffPayrollXlsx({ month, siteName, tab, rows, filtered: filtersActive(f) });
  }

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div className="muted" style={{ fontSize: 12.5, maxWidth: 620 }}>
          {isLabour
            ? "Full per-worker breakdown — one row per worker, days summed across sites. Gross = Basic + OT · Net = Gross − PF − PT − Other − Advance."
            : "One row per staff member for the month, from the generated staff salary. Net = Salary − Deduction + OT − Advance."}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={excel} disabled={loading || !rows.length}>⬇ Excel</button>
          <a href={pdfHref} target="_blank" rel="noreferrer"><button disabled={loading || !rows.length}>⬇ PDF</button></a>
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

      {d && d.missingSites.length > 0 && isLabour && (
        <div className="note amber" style={{ marginTop: 8, fontSize: 12 }}>
          Not yet generated for {month}: <b>{d.missingSites.join(", ")}</b> — use &quot;Generate / refresh from attendance&quot; on the Labour Payroll tab to include them.
        </div>
      )}

      {loading ? <div className="muted" style={{ marginTop: 10 }}>Loading…</div> : !rows.length ? (
        <div className="muted" style={{ marginTop: 10 }}>
          {filtersActive(f) ? "No one in this tab matches the filters." :
            isLabour ? `No generated payroll for ${siteName} in ${month}.`
                     : `No generated staff salary for ${month}. Generate it on the Staff Salary tab.`}
        </div>
      ) : (
        <div className="mw-card" style={{ marginTop: 10 }}>
          <div className="mw-band">
            PAYROLL SUMMARY — {TABS.find(t => t[0] === tab)[1].replace(/^\S+\s/, "").toUpperCase()} · {siteName.toUpperCase()} · {monthLabel(month)}
            {filtersActive(f) && <span style={{ fontWeight: 400 }}> · filtered</span>}
          </div>
          <div style={{ overflowX: "auto" }}>
            {isLabour ? (
              <table className="dt-compact mw-table" style={{ minWidth: 1400 }}>
                <thead><tr>{LAB_COLS.map((h, i) => <th key={h} className={i >= 3 ? "num" : ""} style={{ whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((w, i) => (
                    <tr key={w.worker_id} title={w.sites.join(" · ")}>
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{w.worker}{w.manual && <span className="badge gray" style={{ marginLeft: 4, fontSize: 10 }}>✎</span>}<div className="muted" style={{ fontSize: 10.5 }}>{w.sites.join(" · ")}</div></td>
                      <td className="muted">{w.designation}</td>
                      <td className="num">{inr(w.rate)}</td><td className="num">{w.days}</td>
                      <td className="num">{inr(w.workedPay)}</td>
                      <td className="num">{w.woDays || "—"}</td><td className="num">{w.woAmt ? inr(w.woAmt) : "—"}</td>
                      <td className="num">{w.holDays || "—"}</td><td className="num">{w.holAmt ? inr(w.holAmt) : "—"}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{inr(w.basic)}</td>
                      <td className="num">{w.otH || "—"}</td><td className="num">{w.otAmt ? inr(w.otAmt) : "—"}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{inr(w.gross)}</td>
                      <td className="num">{inr(w.pf)}</td><td className="num">{inr(w.pt)}</td><td className="num">{inr(w.other)}</td>
                      <td className="num">{inr(w.totalDed)}</td><td className="num">{inr(w.adv)}</td>
                      <td className="num" style={{ fontWeight: 800 }}>{inr(w.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ background: "#fff4e5", fontWeight: 800 }}>
                  <td colSpan={4}>TOTAL · {rows.length} workers</td><td className="num">{sum("days")}</td>
                  <td className="num">{inr(sum("workedPay"))}</td>
                  <td className="num">{sum("woDays") || "—"}</td><td className="num">{inr(sum("woAmt"))}</td>
                  <td className="num">{sum("holDays") || "—"}</td><td className="num">{inr(sum("holAmt"))}</td>
                  <td className="num">{inr(sum("basic"))}</td>
                  <td className="num">{sum("otH")}</td><td className="num">{inr(sum("otAmt"))}</td><td className="num">{inr(sum("gross"))}</td>
                  <td className="num">{inr(sum("pf"))}</td><td className="num">{inr(sum("pt"))}</td><td className="num">{inr(sum("other"))}</td>
                  <td className="num">{inr(sum("totalDed"))}</td><td className="num">{inr(sum("adv"))}</td><td className="num">{inr(sum("net"))}</td>
                </tr></tfoot>
              </table>
            ) : (
              <table className="dt-compact mw-table" style={{ minWidth: 1150 }}>
                <thead><tr>{STF_COLS.map((h, i) => <th key={h} className={i >= 3 && i < 12 ? "num" : ""} style={{ whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((s, i) => (
                    <tr key={s.id}>
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{s.name}</td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>{String(s.role || "").split("_").map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(" ")}</td>
                      <td className="num">{inr(s.monthly_salary)}</td>
                      <td className="num" title="Calendar days minus Sundays. NOTE: the deduction divisor is 30, not this number.">{s.working_days}</td>
                      <td className="num">{s.days_present}</td>
                      <td className="num">{s.days_absent}</td>
                      <td className="num">{s.holDouble || "—"}</td>
                      <td className="num" title="Worked a company holiday — salary already pays the day once, so the 2x rule adds one more day">{s.holAmt ? inr(s.holAmt) : "—"}</td>
                      <td className="num" title={"Deduction = (Monthly Salary ÷ 30) × Days Absent — the divisor is 30, not the Working Days shown"}>{inr(s.deduction)}</td>
                      <td className="num">{s.ot_hours || "—"}</td>
                      <td className="num">{s.ot_amount ? inr(s.ot_amount) : "—"}</td>
                      <td className="num" style={{ color: s.outstanding > 0 ? "#b45309" : undefined }}>{s.outstanding ? inr(s.outstanding) : "—"}</td>
                      <td className="num">{inr(s.advances_deducted)}</td>
                      <td className="num" style={{ fontWeight: 800 }}>{inr(s.net)}</td>
                      <td style={{ textTransform: "capitalize" }}>{s.status}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ background: "#fff4e5", fontWeight: 800 }}>
                  <td colSpan={3}>TOTAL · {rows.length} staff</td>
                  <td className="num">{inr(sum("monthly_salary"))}</td>
                  <td className="num">{sum("working_days")}</td><td className="num">{sum("days_present")}</td><td className="num">{sum("days_absent")}</td>
                  <td className="num">{sum("holDouble") || "—"}</td><td className="num">{inr(sum("holAmt"))}</td>
                  <td className="num">{inr(sum("deduction"))}</td><td className="num">{sum("ot_hours")}</td><td className="num">{inr(sum("ot_amount"))}</td>
                  <td className="num">{inr(sum("outstanding"))}</td>
                  <td className="num">{inr(sum("advances_deducted"))}</td><td className="num">{inr(sum("net"))}</td><td></td>
                </tr></tfoot>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
