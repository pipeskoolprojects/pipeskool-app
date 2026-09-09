"use client";
// update333: FULL ATTENDANCE SUMMARY — tabbed, de-duplicated, expandable.
//
// THE DUPLICATE PROBLEM 332 HAD: rows were grouped by (person, site) and then split into
// sections by the SITE on each row. Satyendra Rai has attendance at HEAD OFFICE and at
// ATOS, so he appeared once in each section — the same man twice on one screen.
//
// 333 groups by PERSON. Each employee appears exactly ONCE, in exactly one tab, decided
// by their MASTER ASSIGNMENT (user_sites for staff, workers.site_id for labour), not by
// where they happened to punch:
//     assigned to Head Office  ->  OFFICE STAFF tab
//     everyone else            ->  SITE STAFF & WORKERS tab
// Their sites hang underneath, one expandable row per site, each with its own month of
// dates — so you can still see which site he was present at on which day. No attendance
// record is dropped, merged or counted twice.
//
// Cell values: 1 = present · 0.5 = half day · 0 = absent · L = approved leave · HOL = company
// holiday. Payroll applies the holiday and Sunday rules itself; the grid only shows them.
//
// NOT changed by 333: the payroll engines, the pay rules, self-punch, the supervisor muster,
// proxy attendance, or the cell-edit gate (fn_grid_set_status re-checks rights server-side).
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase, isDemo, fetchAll } from "@/lib/supabase";   // update320
import { getSession, can } from "@/lib/auth";   // update297
import { getPayrollSettings, weeklyOffDates, isoLocal, monthBounds } from "@/lib/payrollSettings";   // update279
import { getHolidaysBetween } from "@/lib/holidays";
import { exportAttendanceXlsx } from "@/lib/payrollExport";   // update278: styled workbook
import { setAttendanceOverride, getAttendanceAudit, OVERRIDE_STATES } from "@/lib/attendanceOverride";   // update335

const CODE = { present: "P", half_day: "H", absent: "A" };
const COLOR = { P: "#e8f6ee", H: "#fff4cc", A: "#fde8e8", L: "#e6f0fd", WO: "#eef2f7", HOL: "#fce7f3", "": "#fff" };
// What the cell PRINTS. The internal code stays P/H/A so the edit cycle, the export and
// /wages/print keep working unchanged.
const NUM = { P: "1", H: "0.5", A: "0", L: "L", WO: "0", HOL: "HOL", "": "0" };

// Which sites count as "office". Head office is a site row in Site Master, so it is matched
// by name until the Director confirms whether this should become a stored flag on sites.
const OFFICE_SITE_RE = /head\s*office|^\s*the\s+office\s*$|^\s*office\s*$/i;

function monthDays(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1, i + 1);
    return { day: i + 1, iso: isoLocal(d), wd: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()] };   // update279: local date, not UTC
  });
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : ""; }
function prettyRole(code) { return String(code || "").split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "); }
function eachDate(from, to, fn) {
  const a = new Date(from + "T00:00:00"), b = new Date(to + "T00:00:00");
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) fn(isoLocal(d));
}

export async function loadAttendanceGrid(monthStr, siteId, kind) {
  const days = monthDays(monthStr);
  const { from, to } = monthBounds(monthStr);   // update279: the old UTC math made from == to in IST -> empty grid
  if (isDemo) return { days, rows: [], people: [], wo: new Set(), hol: {} };
  const [settings, hols, { data: staffRows }, { data: siteRows }, { data: userSites }, { data: leaves }] = await Promise.all([
    getPayrollSettings(), getHolidaysBetween(from, to),
    supabase.from("app_users").select("id, mobile, role, monthly_salary").eq("is_active", true),
    supabase.from("sites").select("id, name"),
    supabase.from("user_sites").select("user_id, site_id"),                       // update333: master assignment
    supabase.from("leave_requests").select("staff_id, from_date, to_date, status, leave_type")
      .eq("status", "approved").lte("from_date", to).gte("to_date", from),        // update333: L in the grid
  ]);

  // office sites, by name, from Site Master
  const officeSiteIds = new Set((siteRows || []).filter(s => OFFICE_SITE_RE.test(s.name || "")).map(s => s.id));

  const staffBy = {}; (staffRows || []).forEach(u => { staffBy[String(u.mobile)] = u; });
  // uid -> assigned site ids
  const assigned = {}; (userSites || []).forEach(r => { (assigned[r.user_id] = assigned[r.user_id] || new Set()).add(r.site_id); });
  // uid -> set of ISO dates on approved leave
  const leaveBy = {}; (leaves || []).forEach(l => {
    const s = l.from_date < from ? from : l.from_date;
    const e = l.to_date >= to ? days[days.length - 1].iso : l.to_date;
    eachDate(s, e, iso => { (leaveBy[l.staff_id] = leaveBy[l.staff_id] || new Set()).add(iso); });
  });

  const mk = () => { let q = supabase.from("attendance")
    .select("worker_id, site_id, att_date, status, review_status, ot_hours, ot_approved, ot_approved_hours, override_by, override_by_name, override_at, override_reason, override_marker, sites!attendance_site_id_fkey(name), workers(full_name, mobile, category, labour_type, daily_wage, site_id)")   // update278: OT row · update335: override markers
    .gte("att_date", from).lt("att_date", to).order("id");
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
    return q; };   // update320: factory — a fresh query per page
  const { data, error } = await fetchAll(mk);   // update320: no row ceiling — pages until complete

  if (error) throw new Error("Could not load attendance: " + error.message);
  const wo = new Set(settings.wo_paid ? weeklyOffDates(from, to, settings.wo_weekday) : []);
  const hol = {}; (hols || []).forEach(h => { hol[h.on_date] = h.name; });

  const map = {};
  (data || []).forEach(a => {
    const mob = String(a.workers?.mobile);
    const su = staffBy[mob];
    const isStaff = !!su;
    if (kind === "staff" && !isStaff) return;
    if (kind === "labour" && isStaff) return;
    const key = a.worker_id + ":" + a.site_id;
    const r = map[key] = map[key] || {
      key, wid: a.worker_id, sid: a.site_id,
      worker: a.workers?.full_name || ("#" + a.worker_id), site: a.sites?.name || ("Site " + a.site_id),
      category: a.workers?.category || "", cells: {}, p: 0, h: 0, a: 0, review: 0,
      isStaff, mobile: mob === "undefined" ? "" : mob,
      uid: su?.id || null,                        // app_users.id — staff_payouts is keyed by THIS
      role: su?.role || "",
      designation: isStaff ? prettyRole(su.role) : cap(a.workers?.category || ""),
      dailyWage: Number(a.workers?.daily_wage) || 0,
      monthlySalary: Number(su?.monthly_salary) || 0,
      masterSite: isStaff ? null : (a.workers?.site_id ?? null),
      leave: (isStaff && su?.id && leaveBy[su.id]) || null,   // update333
    };
    // update335: a manual day carries who/when/why, and a 'leave' marker prints L.
    const c = a.override_marker === "leave" ? "L" : (CODE[a.status] || "");
    r.cells[a.att_date] = c;
    if (a.override_by) {
      r.ovr = r.ovr || {};
      r.ovr[a.att_date] = { by: a.override_by_name || "someone", at: a.override_at, reason: a.override_reason || "" };
    }
    r.ot = r.ot || {};
    const otv = a.ot_approved ? Number(a.ot_approved_hours || 0) : 0;   // update278: paid OT only (approved)
    if (otv) r.ot[a.att_date] = otv;
    if (a.review_status === "needs_review") r.review += 1;
    if (c === "P") r.p += 1; else if (c === "H") r.h += 1; else r.a += 1;   // update335: L counts with absent for payroll, and payroll reads status, not this
    // update277: a half day on Sunday is paid as a full day
    const sun = new Date(a.att_date + "T00:00:00").getDay() === 0;
    r.paid = (r.paid || 0) + (c === "P" ? 1 : c === "H" ? (settings.sunday_half_as_full && sun ? 1 : 0.5) : 0);
  });

  const rows = Object.values(map).map(r => ({ ...r, daysPaid: r.paid || 0, otTotal: +Object.values(r.ot || {}).reduce((n, v) => n + v, 0).toFixed(2) }))
    .sort((x, y) => x.site.localeCompare(y.site) || x.worker.localeCompare(y.worker));

  // ---- update333: ONE entry per person, tab decided by the master assignment ----
  const pmap = {};
  rows.forEach(r => {
    const p = pmap[r.wid] = pmap[r.wid] || {
      wid: r.wid, worker: r.worker, isStaff: r.isStaff, mobile: r.mobile, uid: r.uid,
      designation: r.designation, category: r.category, rows: [],
      p: 0, h: 0, a: 0, review: 0, daysPaid: 0, otTotal: 0,
    };
    p.rows.push(r);
    p.p += r.p; p.h += r.h; p.a += r.a; p.review += r.review;
    p.daysPaid = +(p.daysPaid + r.daysPaid).toFixed(2);
    p.otTotal = +(p.otTotal + r.otTotal).toFixed(2);
  });
  // update338: THREE groups, kept completely separate.
  //   labour      -> always its own section, whatever site it is posted to
  //   office      -> STAFF whose master assignment includes an office site
  //   site_staff  -> every other staff member
  // Only staff are split by office/site: a labour row is labour wherever it works, so the
  // Workers section is never diluted by a helper who happened to punch at Head Office.
  const people = Object.values(pmap).map(p => {
    let group;
    if (!p.isStaff) group = "labour";
    else {
      const office = (p.uid && assigned[p.uid])
        ? [...assigned[p.uid]].some(id => officeSiteIds.has(id))
        : p.rows.some(r => OFFICE_SITE_RE.test(r.site));   // no assignment on file -> fall back to where they punched
      group = office ? "office" : "site_staff";
    }
    return { ...p, group, siteNames: p.rows.map(r => r.site) };
  }).sort((x, y) => x.worker.localeCompare(y.worker));

  return { days, rows, people, wo, hol, settings };
}

// update332: ONE definition of what a cell prints, shared by the screen, the printed
// grid (/wages/print) and the Excel export — they can never drift apart again.
export function cellValue(code) { return NUM[code] ?? "0"; }

export function otOf(r, d) { return (r.ot && r.ot[d.iso]) || 0; }   // update278
// update335: null unless this day was entered by hand
export function overrideOf(r, d) { return (r.ovr && r.ovr[d.iso]) || null; }

export function cellCode(r, d, wo, hol) {
  const c = r.cells[d.iso];
  if (c) return c;
  if (r.leave && r.leave.has(d.iso)) return "L";   // update333: approved leave, only where nothing was punched
  if (hol[d.iso]) return "HOL";
  if (wo.has(d.iso)) return "WO";
  return "A";
}

// ---- module scope: never define a component inside a component (update204) ----

function Toolbar({ f, setF, sites, roles, cats }) {
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const sel = { fontSize: 12, padding: "5px 7px" };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10, marginBottom: 4 }}>
      <input placeholder="🔍 Search name…" value={f.q} onChange={e => set("q", e.target.value)} style={{ ...sel, minWidth: 170 }} />
      <input placeholder="ID / mobile" value={f.id} onChange={e => set("id", e.target.value)} style={{ ...sel, width: 118 }} />
      <select style={sel} value={f.site} onChange={e => set("site", e.target.value)}>
        <option value="">All sites</option>{sites.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select style={sel} value={f.role} onChange={e => set("role", e.target.value)}>
        <option value="">All designations</option>{roles.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <select style={sel} value={f.cat} onChange={e => set("cat", e.target.value)}>
        <option value="">All categories</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}
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
      <select style={sel} value={f.multi} onChange={e => set("multi", e.target.value)}>
        <option value="">All employees</option><option value="yes">Multi-site only</option>
      </select>
      {Object.values(f).some(Boolean) && (
        <button style={sel} onClick={() => setF({ q: "", id: "", site: "", role: "", cat: "", status: "", ot: "", multi: "" })}>✕ Clear</button>
      )}
    </div>
  );
}

function DateCells({ r, g, editMode, savingAll, pending, setPending, canOverride, onOverride }) {
  const NEXT = { P: ["H", "half_day"], H: ["A", "absent"], A: ["P", "present"], "": ["P", "present"], WO: ["P", "present"], HOL: ["P", "present"], L: ["P", "present"] };
  return g.days.map(d => {
    const base = cellCode(r, d, g.wo, g.hol);
    const pk = r.wid + "|" + r.sid + "|" + d.iso;
    const pend = pending[pk];
    const c = pend ? pend.code : base;   // update298: pending edits shown before saving
    const ovr = overrideOf(r, d);   // update335
    const click = () => {
      if (savingAll) return;
      // update335: with the Override right, a cell opens the editor — which can create a day
      // that has no punch at all. Without it, the old cycle still applies.
      if (canOverride && editMode) { onOverride(r, d, base); return; }
      if (!editMode) return;
      const [code, status] = NEXT[c] || NEXT[""];
      setPending(x => { const y = { ...x }; if (code === base) delete y[pk]; else y[pk] = { code, status }; return y; });
    };
    const title = (g.hol[d.iso] ? g.hol[d.iso] + " · " : "")
      + (ovr ? `MANUAL OVERRIDE by ${ovr.by}${ovr.at ? " on " + new Date(ovr.at).toLocaleString("en-IN") : ""}${ovr.reason ? " — " + ovr.reason : ""} · ` : "")
      + (c === "L" && !ovr ? "Approved leave · " : "")
      + (editMode ? (canOverride ? "Click to set this day" : "Click: 1 → 0.5 → 0") : "");
    return <td key={d.iso} onClick={click} title={title}
      style={{ textAlign: "center", padding: "3px 2px", fontSize: 11, fontWeight: c === "P" || pend ? 700 : 500,
        background: COLOR[c] || "#fff", cursor: editMode ? "pointer" : "default", position: "relative",
        outline: pend ? "2px solid #FF6A1F" : "none", outlineOffset: -2 }}>
      {NUM[c]}
      {ovr && <span style={{ position: "absolute", top: 0, right: 0, width: 0, height: 0,
        borderTop: "6px solid #FF6A1F", borderLeft: "6px solid transparent" }} />}
    </td>;
  });
}

function OtRow({ r, g, indent }) {
  if (!r.otTotal) return null;
  return (
    <tr style={{ background: "#fffaf5" }}>
      <td style={{ position: "sticky", left: 0, background: "#fffaf5", zIndex: 1 }}></td>
      <td style={{ position: "sticky", left: 36, background: "#fffaf5", zIndex: 1, fontSize: 10.5, color: "#7c2d12", fontStyle: "italic", paddingLeft: indent }}>OT (h)</td>
      <td colSpan={2}></td>
      {g.days.map(d => { const v = otOf(r, d); return <td key={d.iso} style={{ textAlign: "center", fontSize: 10, color: "#7c2d12" }}>{v || ""}</td>; })}
      <td colSpan={2}></td>
    </tr>
  );
}

function PeopleTable({ people, g, editMode, savingAll, pending, setPending, onOpen, canOverride, onOverride }) {
  if (!people.length) return <div className="muted" style={{ padding: 12, fontSize: 12.5 }}>No employees match the filters.</div>;
  return (
    <div style={{ overflowX: "auto" }}>{/* scrolls INSIDE the table only */}
      <table className="dt-compact mw-table" style={{ borderCollapse: "collapse", minWidth: 960 + g.days.length * 30 }}>
        <thead>
          <tr>
            <th style={{ position: "sticky", left: 0, zIndex: 2, minWidth: 36 }}>Sr</th>
            <th style={{ position: "sticky", left: 36, zIndex: 2, minWidth: 190, textAlign: "left" }}>Employee</th>
            <th style={{ minWidth: 130, textAlign: "left" }}>Site</th>
            <th style={{ minWidth: 110, textAlign: "left" }}>Designation</th>
            {g.days.map(d => <th key={d.iso} style={{ minWidth: 30, padding: "4px 2px", fontSize: 10.5, textAlign: "center", background: d.wd === "Su" ? "#e9edf3" : undefined }}>{String(d.day).padStart(2, "0")}<br /><span style={{ fontWeight: 400, opacity: .8 }}>{d.wd}</span></th>)}
            <th className="num">Days</th><th className="num">OT h</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => {
            const multi = p.rows.length > 1;
            const nameCell = (
              <>
                <a onClick={() => onOpen(p)} style={{ cursor: "pointer", color: "var(--copper)", fontWeight: 600 }} title="Open this person's full month">{p.worker}</a>
                {p.review > 0 && <span title="auto-closed day(s) awaiting review" style={{ color: "#b45309", marginLeft: 4 }}>⏱</span>}
              </>
            );
            if (!multi) {
              const r = p.rows[0];
              return (
                <Fragment key={p.wid}>
                  <tr>
                    <td style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>{i + 1}</td>
                    <td style={{ position: "sticky", left: 36, background: "#fff", zIndex: 1, whiteSpace: "nowrap" }}>{nameCell}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{r.site}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{p.designation || "—"}</td>
                    <DateCells r={r} g={g} editMode={editMode} savingAll={savingAll} pending={pending} setPending={setPending} canOverride={canOverride} onOverride={onOverride} />
                    <td className="num" style={{ fontWeight: 700 }}>{r.daysPaid}</td>
                    <td className="num">{r.otTotal || "—"}</td>
                  </tr>
                  <OtRow r={r} g={g} indent={0} />
                </Fragment>
              );
            }
            return (
              <Fragment key={p.wid}>
                {/* update334: no expander. The name row carries the person's totals, and every
                    site they worked is printed underneath it, always — nothing to click open. */}
                <tr style={{ background: "#f7f9fc" }}>
                  <td style={{ position: "sticky", left: 0, background: "#f7f9fc", zIndex: 1 }}>{i + 1}</td>
                  <td style={{ position: "sticky", left: 36, background: "#f7f9fc", zIndex: 1, whiteSpace: "nowrap" }}>{nameCell}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, color: "#475569" }}>{p.rows.length} sites</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{p.designation || "—"}</td>
                  <td colSpan={g.days.length} style={{ fontSize: 11, color: "#64748b", paddingLeft: 8 }}>
                    Month by site below · total across {p.rows.length} sites →
                  </td>
                  <td className="num" style={{ fontWeight: 800 }}>{p.daysPaid}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{p.otTotal || "—"}</td>
                </tr>
                {p.rows.map(r => (
                  <Fragment key={r.key}>
                    <tr>
                      <td style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1 }}></td>
                      <td style={{ position: "sticky", left: 36, background: "#fff", zIndex: 1, fontSize: 11.5, color: "#64748b", paddingLeft: 22, whiteSpace: "nowrap" }}>↳ at</td>
                      <td style={{ whiteSpace: "nowrap", fontSize: 12, fontWeight: 600 }}>{r.site}</td>
                      <td></td>
                      <DateCells r={r} g={g} editMode={editMode} savingAll={savingAll} pending={pending} setPending={setPending} canOverride={canOverride} onOverride={onOverride} />
                      <td className="num" style={{ fontWeight: 700 }}>{r.daysPaid}</td>
                      <td className="num">{r.otTotal || "—"}</td>
                    </tr>
                    <OtRow r={r} g={g} indent={22} />
                  </Fragment>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// One person, whole month, every site. Days and OT are summed from the grid; the payroll
// figures are READ from the generated payout rows — nothing is recomputed here, so this
// panel can never disagree with the payroll engine.
function PersonPanel({ person, month, onClose }) {
  const [pay, setPay] = useState(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      if (isDemo) { setPay({ kind: "x", rows: [] }); return; }
      const { from } = monthBounds(month);
      // update333: the column is pay_month, not month — 332 queried the wrong one and always
      // reported "not generated" for staff.
      if (person.isStaff) {
        if (!person.uid) { if (!dead) setPay({ kind: "staff", rows: [] }); return; }
        const { data } = await supabase.from("staff_payouts")
          .select("pay_month, days_present, days_absent, deduction, ot_hours, ot_amount, monthly_salary, net, status")
          .eq("user_id", person.uid).eq("pay_month", from);
        if (!dead) setPay({ kind: "staff", rows: data || [] });
      } else {
        const { data } = await supabase.from("wage_payouts")
          .select("site_id, days_total, ot_hours, daily_rate, ot_rate, gross, net, status, sites(name)")
          .eq("worker_id", person.wid).eq("pay_month", from);
        if (!dead) setPay({ kind: "labour", rows: data || [] });
      }
    })();
    return () => { dead = true; };
  }, [person.wid, person.uid, person.isStaff, month]);

  const th = { textAlign: "left", fontSize: 11.5, padding: "6px 8px", background: "#f3f4f6" };
  const td = { fontSize: 12.5, padding: "6px 8px", borderBottom: "1px solid #f0f1f3" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 720, padding: 22, maxHeight: "88vh", overflowY: "auto" }}>
        <h2 style={{ marginBottom: 2 }}>{person.worker}</h2>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          {person.designation || "—"} · {person.isStaff ? "Staff" : "Labour"}{person.mobile ? " · " + person.mobile : ""} · {monthLabel(month)}
        </div>

        <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Attendance by site</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
          <thead><tr><th style={th}>Site</th><th style={{ ...th, textAlign: "right" }}>Full</th><th style={{ ...th, textAlign: "right" }}>Half</th><th style={{ ...th, textAlign: "right" }}>Absent</th><th style={{ ...th, textAlign: "right" }}>Paid days</th><th style={{ ...th, textAlign: "right" }}>OT h</th></tr></thead>
          <tbody>
            {person.rows.map(r => (
              <tr key={r.key}>
                <td style={{ ...td, fontWeight: 600 }}>{r.site}</td>
                <td style={{ ...td, textAlign: "right" }}>{r.p}</td>
                <td style={{ ...td, textAlign: "right" }}>{r.h}</td>
                <td style={{ ...td, textAlign: "right" }}>{r.a}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{r.daysPaid}</td>
                <td style={{ ...td, textAlign: "right" }}>{r.otTotal || "—"}</td>
              </tr>
            ))}
            <tr style={{ background: "#fff4e5", fontWeight: 800 }}>
              <td style={td}>TOTAL · {person.rows.length} site{person.rows.length > 1 ? "s" : ""}</td>
              <td style={{ ...td, textAlign: "right" }}>{person.p}</td>
              <td style={{ ...td, textAlign: "right" }}>{person.h}</td>
              <td style={{ ...td, textAlign: "right" }}>{person.a}</td>
              <td style={{ ...td, textAlign: "right" }}>{person.daysPaid}</td>
              <td style={{ ...td, textAlign: "right" }}>{person.otTotal || "—"}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Payroll impact</div>
        {!pay ? <div className="muted" style={{ fontSize: 12.5 }}>Loading…</div>
          : !pay.rows.length ? (
            <div className="muted" style={{ fontSize: 12.5 }}>
              Payroll for {monthLabel(month)} has not been generated for this person yet. Generate it in Muster Roll &amp; Wages — these attendance figures are what it will read.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th}>{pay.kind === "labour" ? "Site" : "Month"}</th>
                <th style={{ ...th, textAlign: "right" }}>{pay.kind === "labour" ? "Days" : "Present"}</th>
                <th style={{ ...th, textAlign: "right" }}>OT h</th>
                <th style={{ ...th, textAlign: "right" }}>OT ₹</th>
                <th style={{ ...th, textAlign: "right" }}>Net ₹</th>
                <th style={{ ...th, textAlign: "right" }}>Status</th>
              </tr></thead>
              <tbody>
                {pay.rows.map((p, i) => (
                  <tr key={i}>
                    <td style={td}>{pay.kind === "labour" ? (p.sites?.name || "—") : monthLabel(month)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{pay.kind === "labour" ? p.days_total : p.days_present}</td>
                    <td style={{ ...td, textAlign: "right" }}>{p.ot_hours || "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{inr(p.ot_amount)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{inr(p.net)}</td>
                    <td style={{ ...td, textAlign: "right", textTransform: "capitalize" }}>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Payroll figures are read from the generated payout rows, never recalculated here — this panel and the wages sheet can never disagree.
        </div>

        <div style={{ marginTop: 16, textAlign: "right" }}><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

// update335: the override editor. One day, one employee, one site — saved immediately so
// every change is its own audited event. It can create a day that has no punch at all,
// which is the whole point: a forgotten Punch-In is fixed here.
function OverrideModal({ ctx, month, onClose, onSaved }) {
  const { r, d, base } = ctx;
  const initial = base === "L" ? "leave" : base === "H" ? "half_day" : base === "P" ? "present" : "absent";
  const [state, setState] = useState(initial);
  const [ot, setOt] = useState(String(otOf(r, d) || ""));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const existing = !!r.cells[d.iso];

  async function save() {
    setBusy(true); setErr("");
    const st = OVERRIDE_STATES.find(x => x.key === state);
    const res = await setAttendanceOverride({
      workerId: r.wid, siteId: r.sid, date: d.iso,
      status: st.status, marker: st.marker, otHours: ot === "" ? null : ot, reason,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onSaved(res.action);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 460, padding: 22 }}>
        <h2 style={{ marginBottom: 2 }}>Set attendance</h2>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          {r.worker} · {r.site} · {d.iso.split("-").reverse().join("/")}
          {!existing && <><br /><b style={{ color: "#9a3412" }}>No punch on this day</b> — saving will create the day manually.</>}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {OVERRIDE_STATES.map(x => (
            <button key={x.key} className={state === x.key ? "primary" : ""} style={{ fontSize: 12.5, flex: "1 0 auto" }}
                    onClick={() => setState(x.key)}>{x.label}</button>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, marginBottom: 3 }}>OT hours (approved)</label>
          <input inputMode="decimal" style={{ width: "100%" }} value={ot} placeholder="0"
                 onChange={e => setOt(e.target.value.replace(/[^0-9.]/g, ""))} />
          <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>Saved as approved OT — it is paid at the OT rate on the next payroll run.</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, marginBottom: 3 }}>Reason (kept in the audit log)</label>
          <input style={{ width: "100%" }} value={reason} placeholder="e.g. forgot to punch out"
                 onChange={e => setReason(e.target.value)} />
        </div>

        {state === "leave" && (
          <div className="muted" style={{ fontSize: 11, background: "#f3f4f6", padding: 8, borderRadius: 6, marginBottom: 12 }}>
            Leave marks the day <b>L</b> on the grid and records the day as an absence for payroll — staff absences convert to paid leave against the annual balance, labour absences are unpaid. It does not change any pay rule.
          </div>
        )}
        {err && <div className="error" style={{ marginBottom: 10, whiteSpace: "pre-wrap" }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save override"}</button>
        </div>
      </div>
    </div>
  );
}

function AuditModal({ onClose }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { getAttendanceAudit({ limit: 300 }).then(setRows).catch(e => { setErr(e.message); setRows([]); }); }, []);
  const th = { textAlign: "left", fontSize: 11, padding: "6px 8px", background: "#f3f4f6", whiteSpace: "nowrap" };
  const td = { fontSize: 11.5, padding: "5px 8px", borderBottom: "1px solid #f0f1f3", whiteSpace: "nowrap" };
  const v = (st, mk) => mk === "leave" ? "L" : st === "present" ? "1" : st === "half_day" ? "0.5" : st === "absent" ? "0" : "—";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 900, padding: 22, maxHeight: "88vh", overflowY: "auto" }}>
        <h2 style={{ marginBottom: 2 }}>Attendance audit log</h2>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Every manual change, newest first. Entries can never be edited or deleted.</div>
        {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
        {!rows ? <div className="muted">Loading…</div> : !rows.length ? <div className="muted">No manual changes recorded yet.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>When</th><th style={th}>Employee</th><th style={th}>Site</th><th style={th}>Date</th><th style={th}>Old</th><th style={th}>New</th><th style={th}>OT</th><th style={th}>By</th><th style={th}>Reason</th></tr></thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id}>
                    <td style={td}>{new Date(a.changed_at).toLocaleString("en-IN")}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{a.employee_name}</td>
                    <td style={td}>{a.site_name || "—"}</td>
                    <td style={td}>{String(a.att_date).split("-").reverse().join("/")}</td>
                    <td style={{ ...td, color: "#b91c1c" }}>{a.action === "created" ? "no punch" : v(a.old_status, a.old_marker)}</td>
                    <td style={{ ...td, color: "#15803d", fontWeight: 700 }}>{v(a.new_status, a.new_marker)}</td>
                    <td style={td}>{Number(a.old_ot_hours || 0)} → {Number(a.new_ot_hours || 0)}</td>
                    <td style={td}>{a.changed_by_name || "—"}</td>
                    <td style={{ ...td, whiteSpace: "normal" }}>{a.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 14, textAlign: "right" }}><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

const inr = n => (n === null || n === undefined || n === "") ? "—" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function AttendanceSummary({ month, siteId, sites }) {
  // update297: admins edit cells in place — click cycles 1 -> 0.5 -> 0.
  // The server function re-checks the right and the paid-month lock on every save.
  const sess = typeof window !== "undefined" ? getSession() : null;
  // update298: mirrors the server gate — Director, or granted "Attendance & muster -> manage".
  const canEdit = !!sess && (sess.role === "director" || can(sess, "attendance", "manage"));
  // update335: a SEPARATE right. Only this one allows entering a day that never had a punch.
  const canOverride = !!sess && (sess.role === "director" || can(sess, "attendance_override", "manage"));
  const [editMode, setEditMode] = useState(false);
  const [pending, setPending] = useState({});
  const [savingAll, setSavingAll] = useState(false);
  const [cellErr, setCellErr] = useState("");
  const [g, setG] = useState(null); const [err, setErr] = useState("");
  const [person, setPerson] = useState(null);
  const [tab, setTab] = useState("office");
  const [ovr, setOvr] = useState(null);       // update335: the cell being overridden
  const [audit, setAudit] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [f, setF] = useState({ q: "", id: "", site: "", role: "", cat: "", status: "", ot: "", multi: "" });

  useEffect(() => {
    setG(null); setErr("");
    loadAttendanceGrid(month, siteId).then(setG).catch(e => { setErr(e.message); setG({ days: monthDays(month), rows: [], people: [], wo: new Set(), hol: {} }); });
  }, [month, siteId]);

  const siteName = siteId === "all" ? "All sites" : (sites.find(s => String(s.id) === String(siteId))?.name || "");

  const opts = useMemo(() => {
    const s = new Set(), r = new Set(), c = new Set();
    (g?.people || []).forEach(p => { p.siteNames.forEach(n => s.add(n)); if (p.designation) (p.isStaff ? r : c).add(p.designation); });
    return { sites: [...s].sort(), roles: [...r].sort(), cats: [...c].sort() };
  }, [g]);

  // every filter narrows the same list; name search is plain substring, instant
  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase(), id = f.id.trim().toLowerCase();
    return (g?.people || []).filter(p => {
      if (q && !p.worker.toLowerCase().includes(q)) return false;
      if (id && !(String(p.mobile).toLowerCase().includes(id) || String(p.wid) === id)) return false;
      if (f.site && !p.siteNames.includes(f.site)) return false;
      if (f.role && p.designation !== f.role) return false;
      if (f.cat && p.designation !== f.cat) return false;
      if (f.status === "present" && p.p === 0) return false;
      if (f.status === "half" && p.h === 0) return false;
      if (f.status === "absent" && p.a === 0) return false;
      if (f.status === "leave" && !p.rows.some(r => r.leave && r.leave.size)) return false;
      if (f.status === "review" && p.review === 0) return false;
      if (f.ot === "yes" && !p.otTotal) return false;
      if (f.ot === "no" && p.otTotal) return false;
      if (f.multi === "yes" && p.rows.length < 2) return false;
      return true;
    });
  }, [g, f]);

  const office = filtered.filter(p => p.group === "office");
  const siteStaff = filtered.filter(p => p.group === "site_staff");
  const labourP = filtered.filter(p => p.group === "labour");
  const shown = tab === "office" ? office : tab === "site_staff" ? siteStaff : labourP;

  async function exportExcel() {
    if (!g) return;
    // export the site rows behind whichever employees are on screen — one row per person per site
    const wids = new Set(shown.map(p => p.wid));
    const rows = g.rows.filter(r => wids.has(r.wid));
    await exportAttendanceXlsx({ month, siteName, kind: tab === "labour" ? "labour" : "staff", days: g.days, rows, wo: g.wo, hol: g.hol, cellCode, otOf });   // update338
  }

  async function saveAll() {
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
    if (fail) setCellErr(fail + (saved ? ` (${saved} change(s) saved before this one)` : ""));
    else setEditMode(false);
    loadAttendanceGrid(month, siteId).then(setG).catch(e => setCellErr(e.message));
  }

  const tabBtn = on => ({ fontSize: 12.5, fontWeight: on ? 800 : 600, padding: "8px 16px", border: "none", borderRadius: 0,
    borderBottom: on ? "3px solid var(--copper)" : "3px solid transparent", background: "transparent", color: on ? "var(--copper)" : "#475569", cursor: "pointer" });

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <b style={{ fontSize: 13 }}>Full Attendance Summary — {siteName} · {monthLabel(month)}</b>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            <b>1</b> = present · <b>0.5</b> = half day · <b>0</b> = absent · <b>L</b> = approved leave · <b>HOL</b> = company holiday · shaded column = Sunday. Each employee appears once, with every site they worked listed underneath their name. An orange corner on a day means it was set by hand — hover it for who, when and why.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={exportExcel} disabled={!g || !shown.length}>⬇ Excel</button>
          {(canOverride || canEdit) && <button onClick={() => setAudit(true)}>🕘 Audit log</button>}{/* update335 */}
          {(canEdit || canOverride) && !editMode && (
            <button className="primary" onClick={() => { setEditMode(true); setCellErr(""); setOkMsg(""); }}>
              {canOverride ? "✎ Override Attendance" : "✎ Edit Attendance"}
            </button>
          )}
          {editMode && canOverride && (
            <>
              <span className="muted" style={{ fontSize: 11.5 }}>Click any day to set it — each change saves and is logged on its own.</span>
              <button onClick={() => { setEditMode(false); setOkMsg(""); }}>✓ Done</button>
            </>
          )}
          {editMode && !canOverride && (
            <>
              <button className="primary" disabled={savingAll || !Object.keys(pending).length} onClick={saveAll}>
                {savingAll ? "Saving…" : `💾 Save Changes${Object.keys(pending).length ? " (" + Object.keys(pending).length + ")" : ""}`}
              </button>
              <button disabled={savingAll} onClick={() => { setPending({}); setEditMode(false); setCellErr(""); }}>✕ Cancel</button>
            </>
          )}
          {cellErr && <span className="note red" style={{ padding: "4px 10px", fontSize: 12 }}>{cellErr}</span>}
        </div>
      </div>

      <Toolbar f={f} setF={setF} sites={opts.sites} roles={opts.roles} cats={opts.cats} />

      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      {okMsg && <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46", padding: "7px 11px", borderRadius: 6, marginTop: 8, fontSize: 12.5 }}>{okMsg}</div>}

      {!g ? <div className="muted" style={{ marginTop: 10 }}>Loading…</div> : !g.people.length ? (
        <div className="muted" style={{ marginTop: 10 }}>No attendance for {siteName} in {monthLabel(month)}.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginTop: 12 }}>
            <button style={tabBtn(tab === "office")} onClick={() => setTab("office")}>🏢 Office Staff · {office.length}</button>
            <button style={tabBtn(tab === "site_staff")} onClick={() => setTab("site_staff")}>👷 Site Staff · {siteStaff.length}</button>
            <button style={tabBtn(tab === "labour")} onClick={() => setTab("labour")}>🧰 Workers / Labour · {labourP.length}</button>
          </div>
          <div className="muted" style={{ fontSize: 12, margin: "8px 0" }}>
            {shown.length} employee{shown.length === 1 ? "" : "s"}, each listed once
            {shown.filter(p => p.rows.length > 1).length > 0 && ` · ${shown.filter(p => p.rows.length > 1).length} working across multiple sites`}
          </div>
          <div className="mw-card">
            <PeopleTable people={shown} g={g} editMode={editMode} savingAll={savingAll} pending={pending} setPending={setPending} onOpen={setPerson}
                         canOverride={canOverride} onOverride={(r, d, base) => setOvr({ r, d, base })} />
          </div>
        </>
      )}

      {person && <PersonPanel person={person} month={month} onClose={() => setPerson(null)} />}
      {ovr && (
        <OverrideModal ctx={ovr} month={month} onClose={() => setOvr(null)}
          onSaved={action => {
            setOvr(null);
            setOkMsg(action === "created" ? "Day created manually and logged." : "Attendance overridden and logged.");
            loadAttendanceGrid(month, siteId).then(setG).catch(e => setCellErr(e.message));
          }} />
      )}
      {audit && <AuditModal onClose={() => setAudit(false)} />}
    </div>
  );
}
export function monthLabel(m) { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }).toUpperCase(); }   // update279
