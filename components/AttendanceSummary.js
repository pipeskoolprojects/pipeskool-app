"use client";
// update276: FULL ATTENDANCE SUMMARY — the Excel-style monthly grid.
// One row per (worker, site) so a worker on three sites is three rows; site filter shows only
// that site's rows. Codes: P = present (1), H = half day (0.5), A = absent/no row (0),
// WO = weekly off (from Settings), HOL = company holiday. Read live from attendance.
import { Fragment, useEffect, useState } from "react";
import { supabase, isDemo } from "@/lib/supabase";
import { getSession, can } from "@/lib/auth";   // update297
import { getPayrollSettings, weeklyOffDates, isoLocal, monthBounds } from "@/lib/payrollSettings";   // update279
import { getHolidaysBetween } from "@/lib/holidays";
import { exportAttendanceXlsx } from "@/lib/payrollExport";   // update278: styled workbook

const CODE = { present: "P", half_day: "H", absent: "A" };
const COLOR = { P: "#e8f6ee", H: "#fff4cc", A: "#fde8e8", WO: "#eef2f7", HOL: "#fce7f3", "": "#fff" };

function monthDays(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1, i + 1);
    return { day: i + 1, iso: isoLocal(d), wd: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()] };   // update279: local date, not UTC
  });
}

export async function loadAttendanceGrid(monthStr, siteId, kind) {
  const days = monthDays(monthStr);
  const { from, to } = monthBounds(monthStr);   // update279: the old UTC math made from == to in IST -> empty grid
  if (isDemo) return { days, rows: [], wo: new Set(), hol: {} };
  const [settings, hols, { data: staffRows }] = await Promise.all([
    getPayrollSettings(), getHolidaysBetween(from, to),
    supabase.from("app_users").select("mobile").eq("is_active", true),
  ]);
  const staffMob = new Set((staffRows || []).map(u => String(u.mobile)));
  let q = supabase.from("attendance")
    .select("worker_id, site_id, att_date, status, review_status, ot_hours, ot_approved, ot_approved_hours, sites!attendance_site_id_fkey(name), workers(full_name, mobile, category, labour_type)")   // update278: OT row
    .gte("att_date", from).lt("att_date", to).limit(20000);
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw new Error("Could not load attendance: " + error.message);
  const wo = new Set(settings.wo_paid ? weeklyOffDates(from, to, settings.wo_weekday) : []);
  const hol = {}; (hols || []).forEach(h => { hol[h.on_date] = h.name; });
  const map = {};
  (data || []).forEach(a => {
    const isStaff = staffMob.has(String(a.workers?.mobile));
    if (kind === "staff" && !isStaff) return;
    if (kind === "labour" && isStaff) return;
    const key = a.worker_id + ":" + a.site_id;
    const r = map[key] = map[key] || { key, wid: a.worker_id, sid: a.site_id, worker: a.workers?.full_name || ("#" + a.worker_id), site: a.sites?.name || ("Site " + a.site_id),
      category: a.workers?.category || "", cells: {}, p: 0, h: 0, review: 0 };   // update297: wid/sid for cell edits
    const c = CODE[a.status] || "";
    r.cells[a.att_date] = c;
    r.ot = r.ot || {};
    const otv = a.ot_approved ? Number(a.ot_approved_hours || 0) : 0;   // update278: paid OT only (approved)
    if (otv) r.ot[a.att_date] = otv;
    if (a.review_status === "needs_review") r.review += 1;
    if (c === "P") r.p += 1; else if (c === "H") r.h += 1;
    // update277: a half day on Sunday is paid as a full day
    const sun = new Date(a.att_date + "T00:00:00").getDay() === 0;
    r.paid = (r.paid || 0) + (c === "P" ? 1 : c === "H" ? (settings.sunday_half_as_full && sun ? 1 : 0.5) : 0);
  });
  const rows = Object.values(map).map(r => ({ ...r, daysPaid: r.paid || 0, otTotal: +Object.values(r.ot || {}).reduce((n, v) => n + v, 0).toFixed(2) }))
    .sort((x, y) => x.site.localeCompare(y.site) || x.worker.localeCompare(y.worker));
  return { days, rows, wo, hol, settings };
}

export function otOf(r, d) { return (r.ot && r.ot[d.iso]) || 0; }   // update278

export function cellCode(r, d, wo, hol) {
  const c = r.cells[d.iso];
  if (c) return c;
  if (hol[d.iso]) return "HOL";
  if (wo.has(d.iso)) return "WO";
  return "A";
}

export default function AttendanceSummary({ month, siteId, sites }) {
  // update297: admins edit cells in place — click cycles P -> H -> A (blank/HOL/WO -> P).
  // The server function re-checks the right and the paid-month lock on every save.
  const sess = typeof window !== "undefined" ? getSession() : null;
  // update298: mirrors the server gate — Director, or granted "Attendance & muster -> manage"
  // by the Director in Admin -> Access Rights. No role gets it implicitly.
  const canEdit = !!sess && (sess.role === "director" || can(sess, "attendance", "manage"));
  const [editMode, setEditMode] = useState(false);
  const [pending, setPending] = useState({});   // "wid|sid|iso" -> { code, status }
  const [savingAll, setSavingAll] = useState(false);
  const [cellErr, setCellErr] = useState("");
  const NEXT = { P: ["H", "half_day"], H: ["A", "absent"], A: ["P", "present"], "": ["P", "present"], WO: ["P", "present"], HOL: ["P", "present"] };
  const [kind, setKind] = useState("labour");
  const [g, setG] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { setG(null); setErr(""); loadAttendanceGrid(month, siteId, kind).then(setG).catch(e => { setErr(e.message); setG({ days: monthDays(month), rows: [], wo: new Set(), hol: {} }); }); }, [month, siteId, kind]);
  const siteName = siteId === "all" ? "All sites" : (sites.find(s => String(s.id) === String(siteId))?.name || "");

  async function exportExcel() {
    if (!g) return;
    await exportAttendanceXlsx({ month, siteName, kind, days: g.days, rows: g.rows, wo: g.wo, hol: g.hol, cellCode, otOf });   // update278
  }

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="muted" style={{ fontSize: 12.5 }}>Whole month's grid — one row per worker per site. P = 1 day, H = ½ day (Sunday half = full), A = 0, HOL = holiday · OT row = approved hours.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className={kind === "labour" ? "primary" : ""} onClick={() => setKind("labour")}>👷 Labour</button>
          <button className={kind === "staff" ? "primary" : ""} onClick={() => setKind("staff")}>🧑‍💼 Staff</button>
          <button onClick={exportExcel} disabled={!g || !g.rows.length}>⬇ Excel</button>
          {canEdit && !editMode && <button className="primary" onClick={() => { setEditMode(true); setCellErr(""); }}>✎ Edit Attendance</button>}{/* update298 */}
          {editMode && (
            <>
              <button className="primary" disabled={savingAll || !Object.keys(pending).length} onClick={async () => {
                setSavingAll(true); setCellErr("");
                let saved = 0, fail = null;
                for (const [pk, v] of Object.entries(pending)) {
                  const [wid, sid, iso] = pk.split("|");
                  const { data: res, error } = await supabase.rpc("fn_grid_set_status", { p_worker_id: Number(wid), p_site_id: Number(sid), p_att_date: iso, p_status: v.status });
                  if (error) { fail = /fn_grid_set_status|schema cache/i.test(error.message) ? "Run pipeskool_grid_edit_v2.sql (update 298) first." : error.message; break; }
                  if (!res?.ok) { fail = res?.error || "Could not save."; break; }
                  saved++;
                  setPending(x => { const y = { ...x }; delete y[pk]; return y; });
                }
                setSavingAll(false);
                if (fail) { setCellErr(fail + (saved ? ` (${saved} change(s) saved before this one)` : "")); }
                else { setEditMode(false); }
                loadAttendanceGrid(month, siteId, kind).then(setG).catch(e => setCellErr(e.message));
              }}>{savingAll ? "Saving…" : `💾 Save Changes${Object.keys(pending).length ? " (" + Object.keys(pending).length + ")" : ""}`}</button>
              <button disabled={savingAll} onClick={() => { setPending({}); setEditMode(false); setCellErr(""); }}>✕ Cancel</button>
            </>
          )}
          {cellErr && <span className="note red" style={{ padding: "4px 10px", fontSize: 12 }}>{cellErr}</span>}
        </div>
      </div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      {!g ? <div className="muted" style={{ marginTop: 10 }}>Loading…</div> : g.rows.length === 0 ? <div className="muted" style={{ marginTop: 10 }}>No {kind} attendance for {siteName} in {month}.</div> : (
        <div className="mw-card" style={{ marginTop: 10 }}>{/* update279: mockup styling */}
          <div className="mw-band">MONTHLY ATTENDANCE — {siteName.toUpperCase()} · {kind === "staff" ? "STAFF" : "LABOUR"} · {monthLabel(month)}</div>
          <div style={{ overflowX: "auto" }}>{/* scrolls INSIDE the table only */}
          <table className="dt-compact mw-table" style={{ borderCollapse: "collapse", minWidth: 900 + g.days.length * 30 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 2, minWidth: 36 }}>Sr</th>
                <th style={{ position: "sticky", left: 36, zIndex: 2, minWidth: 160, textAlign: "left" }}>Worker</th>
                <th style={{ minWidth: 130, textAlign: "left" }}>Site</th>
                {g.days.map(d => <th key={d.iso} style={{ minWidth: 30, padding: "4px 2px", fontSize: 10.5, textAlign: "center", background: d.wd === "Su" ? "#e9edf3" : undefined }}>{String(d.day).padStart(2, "0")}<br /><span style={{ fontWeight: 400, opacity: .8 }}>{d.wd}</span></th>)}
                <th className="num">P</th><th className="num">H</th><th className="num">Days</th><th className="num">OT h</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <Fragment key={r.key}>
                <tr>
                  <td style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>{i + 1}</td>
                  <td style={{ position: "sticky", left: 36, background: "#fff", zIndex: 1, fontWeight: 600, whiteSpace: "nowrap" }}>{r.worker}{r.review > 0 && <span title="auto-closed day(s) awaiting review" style={{ color: "#b45309", marginLeft: 4 }}>⏱</span>}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{r.site}</td>
                  {g.days.map(d => {
                    const base = cellCode(r, d, g.wo, g.hol);
                    const pk = r.wid + "|" + r.sid + "|" + d.iso;
                    const pend = pending[pk];
                    const c = pend ? pend.code : base;   // update298: pending edits shown before saving
                    const click = () => {
                      if (!editMode || savingAll) return;
                      const [code, status] = NEXT[c] || NEXT[""];
                      setPending(x => {
                        const y = { ...x };
                        if (code === base) delete y[pk]; else y[pk] = { code, status };
                        return y;
                      });
                    };
                    return <td key={d.iso} onClick={click}
                      title={(g.hol[d.iso] ? g.hol[d.iso] + " · " : "") + (editMode ? "Click: P → H → A (blank/WO/HOL → P)" : "")}
                      style={{ textAlign: "center", padding: "3px 2px", fontSize: 11, fontWeight: c === "P" || pend ? 700 : 500,
                        background: COLOR[c] || "#fff", cursor: editMode ? "pointer" : "default",
                        outline: pend ? "2px solid #FF6A1F" : "none", outlineOffset: -2 }}>{c}</td>;
                  })}
                  <td className="num">{r.p}</td><td className="num">{r.h}</td><td className="num" style={{ fontWeight: 700 }}>{r.daysPaid}</td><td className="num">{r.otTotal || "—"}</td>
                </tr>
                {r.otTotal > 0 && (
                  <tr style={{ background: "#fffaf5" }}>
                    <td style={{ position: "sticky", left: 0, background: "#fffaf5", zIndex: 1 }}></td>
                    <td style={{ position: "sticky", left: 36, background: "#fffaf5", zIndex: 1, fontSize: 10.5, color: "#7c2d12", fontStyle: "italic" }}>OT (h)</td>
                    <td></td>
                    {g.days.map(d => { const v = otOf(r, d); return <td key={d.iso} style={{ textAlign: "center", fontSize: 10, color: "#7c2d12" }}>{v || ""}</td>; })}
                    <td colSpan={4}></td>
                  </tr>
                )}
                </Fragment>
              ))}

            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
export function monthLabel(m) { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }).toUpperCase(); }   // update279
