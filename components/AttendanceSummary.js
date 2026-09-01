"use client";
// update276: FULL ATTENDANCE SUMMARY — the Excel-style monthly grid.
// One row per (worker, site) so a worker on three sites is three rows; site filter shows only
// that site's rows. Codes: P = present (1), H = half day (0.5), A = absent/no row (0),
// WO = weekly off (from Settings), HOL = company holiday. Read live from attendance.
import { useEffect, useMemo, useState } from "react";
import { supabase, isDemo } from "@/lib/supabase";
import { getPayrollSettings, weeklyOffDates } from "@/lib/payrollSettings";
import { getHolidaysBetween } from "@/lib/holidays";
import * as XLSX from "xlsx";

const CODE = { present: "P", half_day: "H", absent: "A" };
const COLOR = { P: "#e8f6ee", H: "#fff4cc", A: "#fde8e8", WO: "#eef2f7", HOL: "#fce7f3", "": "#fff" };

function monthDays(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1, i + 1);
    return { day: i + 1, iso: d.toISOString().slice(0, 10), wd: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()] };
  });
}

export async function loadAttendanceGrid(monthStr, siteId, kind) {
  const days = monthDays(monthStr);
  const from = days[0].iso, to = new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 1).toISOString().slice(0, 10);
  if (isDemo) return { days, rows: [], wo: new Set(), hol: {} };
  const [settings, hols, { data: staffRows }] = await Promise.all([
    getPayrollSettings(), getHolidaysBetween(from, to),
    supabase.from("app_users").select("mobile").eq("is_active", true),
  ]);
  const staffMob = new Set((staffRows || []).map(u => String(u.mobile)));
  let q = supabase.from("attendance")
    .select("worker_id, site_id, att_date, status, review_status, sites!attendance_site_id_fkey(name), workers(full_name, mobile, category, labour_type)")
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
    const r = map[key] = map[key] || { key, worker: a.workers?.full_name || ("#" + a.worker_id), site: a.sites?.name || ("Site " + a.site_id),
      category: a.workers?.category || "", cells: {}, p: 0, h: 0, review: 0 };
    const c = CODE[a.status] || "";
    r.cells[a.att_date] = c;
    if (a.review_status === "needs_review") r.review += 1;
    if (c === "P") r.p += 1; else if (c === "H") r.h += 1;
  });
  const rows = Object.values(map).sort((x, y) => x.site.localeCompare(y.site) || x.worker.localeCompare(y.worker));
  return { days, rows, wo, hol };
}

export function cellCode(r, d, wo, hol) {
  const c = r.cells[d.iso];
  if (c) return c;
  if (hol[d.iso]) return "HOL";
  if (wo.has(d.iso)) return "WO";
  return "A";
}

export default function AttendanceSummary({ month, siteId, sites }) {
  const [kind, setKind] = useState("labour");
  const [g, setG] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { setG(null); setErr(""); loadAttendanceGrid(month, siteId, kind).then(setG).catch(e => { setErr(e.message); setG({ days: monthDays(month), rows: [], wo: new Set(), hol: {} }); }); }, [month, siteId, kind]);
  const siteName = siteId === "all" ? "All sites" : (sites.find(s => String(s.id) === String(siteId))?.name || "");

  function exportExcel() {
    if (!g) return;
    const head = ["Sr", "Worker", "Site", ...g.days.map(d => String(d.day).padStart(2, "0") + " " + d.wd), "P", "H", "Days"];
    const body = g.rows.map((r, i) => [i + 1, r.worker, r.site, ...g.days.map(d => cellCode(r, d, g.wo, g.hol)), r.p, r.h, r.p + r.h * 0.5]);
    const ws = XLSX.utils.aoa_to_sheet([["Pipeskool Projects Pvt. Ltd. — Full Attendance Summary"], [siteName + " · " + month + " · " + (kind === "staff" ? "Staff" : "Labour")], [], head, ...body]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `attendance_${month}_${siteName.replace(/[^\w]+/g, "_")}.xlsx`);
  }

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>Full Attendance Summary</h2>
          <div className="muted" style={{ fontSize: 12 }}>{siteName} · {month} · one row per worker per site · P = 1 day, H = ½ day, A = 0, WO = weekly off, HOL = holiday</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className={kind === "labour" ? "primary" : ""} onClick={() => setKind("labour")}>👷 Labour</button>
          <button className={kind === "staff" ? "primary" : ""} onClick={() => setKind("staff")}>🧑‍💼 Staff</button>
          <button onClick={exportExcel} disabled={!g || !g.rows.length}>⬇ Excel</button>
        </div>
      </div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      {!g ? <div className="muted" style={{ marginTop: 10 }}>Loading…</div> : g.rows.length === 0 ? <div className="muted" style={{ marginTop: 10 }}>No {kind} attendance for {siteName} in {month}.</div> : (
        <div style={{ overflowX: "auto", marginTop: 10, border: "1px solid var(--border)", borderRadius: 10 }}>{/* scrolls INSIDE the table only */}
          <table className="dt-compact" style={{ borderCollapse: "collapse", minWidth: 900 + g.days.length * 30 }}>
            <thead>
              <tr style={{ background: "#0f1a2e", color: "#fff" }}>
                <th style={{ position: "sticky", left: 0, background: "#0f1a2e", zIndex: 2, minWidth: 36 }}>Sr</th>
                <th style={{ position: "sticky", left: 36, background: "#0f1a2e", zIndex: 2, minWidth: 160, textAlign: "left" }}>Worker</th>
                <th style={{ minWidth: 130, textAlign: "left" }}>Site</th>
                {g.days.map(d => <th key={d.iso} style={{ minWidth: 30, padding: "4px 2px", fontSize: 10.5, textAlign: "center", background: g.wo.has(d.iso) ? "#26344d" : "#0f1a2e" }}>{String(d.day).padStart(2, "0")}<br /><span style={{ fontWeight: 400, opacity: .8 }}>{d.wd}</span></th>)}
                <th className="num">P</th><th className="num">H</th><th className="num">Days</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={r.key}>
                  <td style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>{i + 1}</td>
                  <td style={{ position: "sticky", left: 36, background: "#fff", zIndex: 1, fontWeight: 600, whiteSpace: "nowrap" }}>{r.worker}{r.review > 0 && <span title="auto-closed day(s) awaiting review" style={{ color: "#b45309", marginLeft: 4 }}>⏱</span>}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{r.site}</td>
                  {g.days.map(d => { const c = cellCode(r, d, g.wo, g.hol); return <td key={d.iso} title={g.hol[d.iso] || ""} style={{ textAlign: "center", padding: "3px 2px", fontSize: 11, fontWeight: c === "P" ? 700 : 500, background: COLOR[c] || "#fff" }}>{c}</td>; })}
                  <td className="num">{r.p}</td><td className="num">{r.h}</td><td className="num" style={{ fontWeight: 700 }}>{r.p + r.h * 0.5}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
