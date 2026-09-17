"use client";
// update392: HOLIDAY & ATTENDANCE CALENDAR — rebuilt from the Director's screen recording
// (16 Sep). Layout, colours, chips, panels, modal and year view follow the recording. Data is
// LIVE: company_holidays / holiday_types / sunday_site_rules (lib/holidays), workers on the
// selected date via fn_holiday_day_workers, per-worker override via fn_set_holiday_payment
// (same server gate the Day Payments panel used). Nothing is invented: every number on the
// page is computed from those tables. Left app navigation (Sidebar) is kept — the recording
// was a standalone prototype; the calendar still lives inside the app.
import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Logo from "@/components/Logo";
import { getSession, canAnySite } from "@/lib/auth";
import { getSites } from "@/lib/data";
import { supabase, isDemo } from "@/lib/supabase";
import { monthGrid, iso } from "@/lib/calendar";
import { saveHoliday, deleteHoliday, getHolidayTypes, getHolidaysBetween } from "@/lib/holidays";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const AUD = [["all","All"],["both","Office + Workers"],["staff","Office"],["labour","Workers"]];
const AUD_LABEL = { both: "Office + Workers", staff: "Office", labour: "Workers", none: "Nobody" };
const STATUS = [["all","All"],["holiday","Holidays"],["working","Working days"]];
const SUN_OPTS = [["weekly_off","Weekly Off"],["working","Working Day"],["special_pay","Special Pay"]];
const TYPE_LABEL = { paid_off: "Holiday", festival_2x: "Festival · 2×", optional: "Optional / unpaid", working: "Special working day", special: "Special / custom" };
const TYPE_PAY = { paid_off: "1X", festival_2x: "2X", optional: "0X", working: "1X", special: "Custom" };

// ---- palette lifted from the recording ----
const C = {
  page: "linear-gradient(180deg,#eef1fb 0%,#f3f0fb 100%)", card: "#ffffff", line: "#e7e9f3", text: "#1c2333", muted: "#6b7280",
  blue: "#3b5bdb", blueSoft: "#8b9df0", ink: "#111827", lav: "#f3f4fb", beige: "#fbf1dc", beigeLine: "#f3dba6",
  amber: "#f2a90a", green: "#16a34a", red: "#e11d48", violet: "#7c3aed", greenSoft: "#dcfce7", greenInk: "#15803d",
};
const card = { background: C.card, borderRadius: 16, boxShadow: "0 1px 2px rgba(20,30,60,.06), 0 8px 24px rgba(40,60,120,.06)" };
const label = { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" };
const sel = { border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 12px", fontSize: 13.5, background: "#fff", color: C.text };
const btnGhost = { border: `1px solid ${C.line}`, background: "#fff", borderRadius: 10, padding: "9px 14px", fontSize: 13.5, cursor: "pointer", color: C.text };
const btnBlue = { border: "none", background: C.blue, color: "#fff", borderRadius: 10, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" };

const fmtLong = k => new Date(k + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(",", ",");
const sundaysIn = y => { let n = 0; for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) if (d.getDay() === 0) n++; return n; };
const daysIn = y => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
const initials = n => String(n || "?").split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase();
const fmtX = n => { const s = Number(n).toFixed(2).replace(/\.?0+$/, ""); return s + "X"; };

function Dot({ c }) { return <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 9, background: c, marginRight: 7, verticalAlign: "middle" }} />; }

// Sunday rule row → option code (mapping stated to the Director in the 392 note)
function ruleCode(r) {
  if (!r || r.weekday_off == null) return "working";
  return r.is_paid_off ? "weekly_off" : "special_pay";
}

export default function CalendarPage() {
  const session = typeof window !== "undefined" ? getSession() : null;
  const canManage = !!session && (session.role === "director" || canAnySite(session, "attendance", "manage"));
  const today = iso(new Date());
  const [view, setView] = useState("month");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selDate, setSelDate] = useState(today);
  const [site, setSite] = useState("all");
  const [aud, setAud] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [sites, setSites] = useState([]);
  const [types, setTypes] = useState({});
  const [hols, setHols] = useState([]);           // all holidays of `year`
  const [sunRules, setSunRules] = useState({});   // siteId → rule row
  const [siteStats, setSiteStats] = useState({}); // siteId → workers
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [modal, setModal] = useState(null);       // add/edit holiday form
  const [busy, setBusy] = useState(false);

  async function loadYear(y) {
    const [h, t, { data: sr }, { data: wk }] = await Promise.all([
      getHolidaysBetween(`${y}-01-01`, `${y}-12-31`), getHolidayTypes(),
      isDemo ? { data: [] } : supabase.from("sunday_site_rules").select("site_id, weekday_off, is_paid_off, paid_off_multiplier_worked"),
      isDemo ? { data: [] } : supabase.from("workers").select("site_id").eq("is_active", true),
    ]);
    setHols(h || []); setTypes(t || {});
    const m = {}; (sr || []).forEach(r => { m[String(r.site_id)] = r; }); setSunRules(m);
    const ws = {}; (wk || []).forEach(w => { ws[String(w.site_id)] = (ws[String(w.site_id)] || 0) + 1; }); setSiteStats(ws);
  }
  useEffect(() => { getSites().then(r => setSites(Array.isArray(r) ? r : (r?.data || []))); }, []);
  useEffect(() => { loadYear(year).catch(e => setErr(e.message)); }, [year]);

  // ---- filters applied to the year's holidays ----
  const inScope = h => {
    if (site !== "all" && (h.site_ids || []).length && !(h.site_ids || []).map(Number).includes(Number(site))) return false;
    if (aud !== "all" && (h.applies_to || "both") !== "both" && h.applies_to !== aud) return false;
    if (q.trim() && !(h.name || "").toLowerCase().includes(q.trim().toLowerCase()) && !h.on_date.includes(q.trim())) return false;
    return true;
  };
  const scoped = useMemo(() => hols.filter(inScope), [hols, site, aud, q]);   // eslint-disable-line react-hooks/exhaustive-deps
  const byDate = useMemo(() => { const m = {}; scoped.forEach(h => (m[h.on_date] = m[h.on_date] || []).push(h)); return m; }, [scoped]);
  const specialWorking = scoped.filter(h => h.type_code === "working").length;
  const holidayCount = scoped.length - specialWorking;
  const sundays = sundaysIn(year);
  const workingDays = daysIn(year) - sundays - new Set(scoped.filter(h => h.type_code !== "working").map(h => h.on_date)).size;

  const rule = site === "all" ? null : sunRules[String(site)];
  const sunCode = site === "all" ? (Object.keys(sunRules).length ? ruleCode(Object.values(sunRules)[0]) : "working") : ruleCode(rule);
  const sunLabel = SUN_OPTS.find(o => o[0] === sunCode)[1];
  const isSunday = k => new Date(k + "T00:00:00").getDay() === 0;
  const dayKind = k => byDate[k]?.length ? (byDate[k][0].type_code === "working" ? "special" : "holiday") : (isSunday(k) && sunCode !== "working" ? "off" : "work");

  // ---- selected-date details ----
  const selRows = byDate[selDate] || [];
  const primary = selRows[0] || null;
  const selKind = dayKind(selDate);
  const [dayWorkers, setDayWorkers] = useState(null);
  const [selWorker, setSelWorker] = useState(null);
  const [chip, setChip] = useState("1.5");
  useEffect(() => {
    setDayWorkers(null); setSelWorker(null); setMsg("");
    if (isDemo) { setDayWorkers([]); return; }
    supabase.rpc("fn_holiday_day_workers", { p_on_date: selDate }).then(({ data, error }) => {
      if (error) { setErr(error.message); setDayWorkers([]); return; }
      setDayWorkers(data || []);
    });
  }, [selDate]);
  async function applyOverride(mult) {
    if (!selWorker) { setErr("Pick a worker row first."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("fn_set_holiday_payment", { p_worker_id: selWorker.worker_id, p_on_date: selDate, p_multiplier: mult, p_reason: mult == null ? null : "Calendar override" });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDayWorkers(l => l.map(w => w.worker_id === selWorker.worker_id ? { ...w, holiday_multiplier: mult } : w));
    setSelWorker(w => w ? { ...w, holiday_multiplier: mult } : w);
    setMsg(mult == null ? "Override removed and synced." : "Worker payment override saved and synced.");
  }
  async function setSunday(code) {
    if (!canManage) return;
    const targets = site === "all" ? sites.map(s => s.id) : [Number(site)];
    setBusy(true); setErr("");
    for (const sid of targets) {
      const r = code === "working"
        ? await supabase.from("sunday_site_rules").delete().eq("site_id", sid)
        : await supabase.from("sunday_site_rules").upsert({ site_id: sid, weekday_off: 0, is_paid_off: code === "weekly_off", paid_off_multiplier_worked: code === "special_pay" ? 2 : 1 }, { onConflict: "site_id" });
      if (r.error) { setErr("Sunday policy not saved: " + r.error.message); setBusy(false); return; }
    }
    setBusy(false); setMsg("Sunday policy saved and synced.");
    loadYear(year);
  }

  // ---- add / edit holiday ----
  function openAdd(date) {
    setModal({ id: null, name: "", on_date: date || selDate, type_code: "paid_off", applies_to: "both", site_ids: site === "all" ? [] : [Number(site)], pay: "2" });
  }
  function openEdit(h) {
    const cr = h.category_rules?.["*"]; const pay = typeof cr === "number" ? String(cr) : (cr?.present != null ? String(cr.present) : "");
    setModal({ id: h.id, name: h.name, on_date: h.on_date, type_code: h.type_code || "paid_off", applies_to: h.applies_to || "both", site_ids: h.site_ids || [], pay });
  }
  async function saveModal() {
    setBusy(true); setErr("");
    const f = { ...modal };
    const r = await saveHoliday({ id: f.id, on_date: f.on_date, name: f.name, site_ids: f.site_ids, applies_to: f.applies_to, type_code: f.type_code,
      category_rules: f.pay ? { "*": Number(f.pay) } : null });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setModal(null); setMsg("Saved and synced."); setSelDate(f.on_date);
    const d = new Date(f.on_date + "T00:00:00"); if (d.getFullYear() !== year) setYear(d.getFullYear()); else loadYear(year); setMonth(d.getMonth());
  }
  async function delHoliday(h) {
    if (!window.confirm(`Delete "${h.name}" on ${h.on_date}?`)) return;
    const r = await deleteHoliday(h.id); if (!r.ok) { setErr(r.error); return; }
    setMsg("Deleted and synced."); loadYear(year);
  }

  const grid = monthGrid(year, month);
  const goMonth = d => { let m = month + d, y = year; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } setMonth(m); setYear(y); };
  const filteredDay = k => { const kd = dayKind(k); return status === "all" || (status === "holiday" ? kd === "holiday" || kd === "special" : kd === "work" || kd === "off"); };
  const activeEntries = scoped.length;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main" style={{ background: C.page, padding: 0 }}>
        <div style={{ padding: "22px 26px 40px", maxWidth: 1400, margin: "0 auto", fontFamily: "var(--sans, Inter, system-ui, sans-serif)", color: C.text }}>
          <style>{`
            .cal392 select { appearance: auto; }
            .cal392 .cell { border: 1px solid ${C.line}; border-radius: 10px; background: #f6f7fb; min-height: 108px; padding: 8px 9px; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between; position: relative; }
            .cal392 .cell.off { background: ${C.beige}; border-color: ${C.beigeLine}; }
            .cal392 .cell.out { opacity: .55; }
            .cal392 .cell.sel { outline: 2px solid ${C.blue}; outline-offset: -1px; background: #eef1ff; }
            .cal392 .cell.hol { background: #fff1f2; border-color: #fecdd3; }
            .cal392 .cell.special { background: #ecfdf5; border-color: #a7f3d0; }
            .cal392 .cell .n { font-size: 13px; font-weight: 600; }
            .cal392 .cell.off .n { color: #b45309; }
            .cal392 .cell .t { font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: ${C.muted}; }
            .cal392 .cell.off .t { color: #b45309; } .cal392 .cell.hol .t { color: ${C.red}; } .cal392 .cell.special .t { color: ${C.greenInk}; }
            .cal392 .chip { border: 1px solid ${C.line}; background: #fff; border-radius: 10px; padding: 9px 0; text-align: center; font-size: 13.5px; font-weight: 600; cursor: pointer; }
            .cal392 .chip.on { background: ${C.blue}; color: #fff; border-color: ${C.blue}; }
            .cal392 .sopt { border: 1px solid ${C.line}; border-radius: 10px; padding: 12px 14px; font-size: 15px; display: flex; justify-content: space-between; align-items: center; background: #fff; cursor: pointer; margin-top: 8px; }
            .cal392 .sopt.on { background: ${C.amber}; color: #fff; border-color: ${C.amber}; font-weight: 700; }
            .cal392 .mcard { border-bottom: 1px solid ${C.line}; padding: 14px 4px; }
            .cal392 .stat { flex: 1; min-width: 200px; padding: 16px 18px; display: flex; gap: 12px; align-items: flex-start; }
            .cal392 .seg { display: inline-flex; background: #fff; border-radius: 12px; padding: 4px; box-shadow: 0 1px 2px rgba(20,30,60,.06); }
            .cal392 .seg button { border: none; background: transparent; padding: 7px 14px; border-radius: 9px; font-size: 13.5px; cursor: pointer; color: ${C.text}; }
            .cal392 .seg button.on { background: ${C.blue}; color: #fff; font-weight: 700; }
            @media (max-width: 1100px) { .cal392 .cols { grid-template-columns: 1fr !important; } }
            @media (max-width: 760px) { .cal392 .cell { min-height: 74px; padding: 6px; } .cal392 .stat { min-width: 44%; } .cal392 .hdr { flex-wrap: wrap; } .cal392 .hdr input { width: 100% !important; } }
          `}</style>
          <div className="cal392">
            {/* header */}
            <div className="hdr" style={{ ...card, display: "flex", alignItems: "center", gap: 14, padding: "14px 22px", marginBottom: 14 }}>
              <Logo height={26} variant="dark" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.01em" }}>Pipeskool</div>
                <div style={{ fontSize: 12.5, color: C.muted }}>Holiday &amp; Attendance Calendar</div>
              </div>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍  Search dates or holidays..." style={{ ...sel, width: 250, background: "#f6f7fb" }} />
              <select value={site} onChange={e => setSite(e.target.value)} style={{ ...sel, minWidth: 150 }}>
                <option value="all">All Sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {canManage && <a href="/calendar/rules" title="Attendance Rules"><button style={{ ...btnGhost, fontWeight: 600 }}>⚙ Attendance Rules</button></a>}{/* update394 */}
              {canManage && <button style={btnBlue} onClick={() => openAdd()}>＋ Add Holiday</button>}
            </div>

            {/* stats */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
              {[[C.red, holidayCount, `Holidays ${year}`], [C.amber, sundays, "Sundays"], [C.green, specialWorking, "Special Working"], [C.blue, workingDays, "Working Days"]].map(([c, n, l]) => (
                <div key={l} className="stat" style={card}><Dot c={c} /><div><div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{n}</div><div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{l}</div></div></div>
              ))}
            </div>

            {/* toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <div className="seg"><button className={view === "month" ? "on" : ""} onClick={() => setView("month")}>Month</button><button className={view === "year" ? "on" : ""} onClick={() => setView("year")}>Year</button></div>
              <span style={{ color: C.muted, fontSize: 15 }}>⛛</span>
              <select value={status} onChange={e => setStatus(e.target.value)} style={sel}>{STATUS.map(([v, l]) => <option key={v} value={v}>Status: {l}</option>)}</select>
              <select value={aud} onChange={e => setAud(e.target.value)} style={sel}>{AUD.map(([v, l]) => <option key={v} value={v}>Audience: {l}</option>)}</select>
              <div style={{ marginLeft: "auto", fontSize: 12.5, color: C.muted, display: "flex", gap: 14 }}>
                <span><Dot c={C.red} />Holiday</span><span><Dot c={C.amber} />Sunday Off</span><span><Dot c={C.green} />Special Pay</span>
              </div>
            </div>
            {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}

            {view === "month" ? (
              <div className="cols" style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 18, alignItems: "start" }}>
                {/* month grid */}
                <div style={{ ...card, padding: 22 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ ...sel, fontWeight: 600, fontSize: 15, minWidth: 170 }}>
                      {MONTHS.map((m, i) => <option key={m} value={i}>{m} {year}</option>)}
                    </select>
                    <button style={btnGhost} onClick={() => goMonth(-1)}>‹</button>
                    <button style={btnGhost} onClick={() => goMonth(1)}>›</button>
                    <button style={{ ...btnGhost, border: "none", background: "transparent", color: C.muted }} onClick={() => { const d = new Date(); setYear(d.getFullYear()); setMonth(d.getMonth()); setSelDate(today); }}>Today</button>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <span style={{ background: "#e5e7eb", borderRadius: 8, padding: "5px 10px", fontSize: 12.5, fontWeight: 600 }}>Applies to: {primary ? AUD_LABEL[primary.applies_to || "both"] : "Both"}</span>
                      <span style={{ background: "#fbecc7", color: "#92400e", borderRadius: 8, padding: "5px 10px", fontSize: 12.5, fontWeight: 600 }}>Sunday: {sunLabel}</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
                    {DOW.map(d => <div key={d} style={{ ...label, color: C.muted, textAlign: "center", padding: "4px 0" }}>{d}</div>)}
                    {grid.map(d => {
                      const kd = dayKind(d.key); const dim = !filteredDay(d.key);
                      const h = byDate[d.key]?.[0];
                      return (
                        <div key={d.key} className={"cell " + (kd === "off" ? "off " : kd === "holiday" ? "hol " : kd === "special" ? "special " : "") + (d.inMonth ? "" : "out ") + (d.key === selDate ? "sel" : "")}
                             style={{ opacity: dim ? .35 : undefined }} onClick={() => setSelDate(d.key)}>
                          <div className="n">{d.date.getDate()}</div>
                          <div className="t" title={h?.name}>{kd === "off" ? "OFF" : kd === "holiday" ? (h.name.length > 14 ? h.name.slice(0, 13) + "…" : h.name) : kd === "special" ? "SPECIAL" : (d.inMonth ? "WORK" : "")}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 16, fontSize: 12.5, color: C.muted, display: "flex", gap: 16 }}>
                    <span><Dot c={C.red} />Holiday</span><span><Dot c={C.amber} />Sunday Off</span><span><Dot c={C.green} />Special Pay</span><span><Dot c={C.blue} />Selected</span>
                  </div>
                </div>

                {/* right column */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* date details */}
                  <div style={{ ...card, padding: 22 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ ...label, color: C.blue }}>Date details</div>
                      <span style={{ background: C.greenSoft, color: C.greenInk, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>Synced</span>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>{fmtLong(selDate)}</div>
                    <div style={{ fontSize: 13.5, color: C.muted, marginTop: 2 }}>
                      {primary ? primary.name + " · " + (TYPE_LABEL[primary.type_code || "paid_off"]) : selKind === "off" ? "Sunday — " + sunLabel : "Regular working day"}
                    </div>
                    <div style={{ fontSize: 13.5, marginTop: 10 }}>Applies to <b>{primary ? AUD_LABEL[primary.applies_to || "both"] : "Office + Workers"}</b> · <b>{primary && (primary.site_ids || []).length ? primary.site_ids.map(id => sites.find(s => Number(s.id) === Number(id))?.name || "Site " + id).join(", ") : "All Sites"}</b></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                      <div style={{ background: C.lav, borderRadius: 10, padding: "10px 12px" }}><div style={{ ...label, fontSize: 10, color: C.muted }}>Event type</div><div style={{ fontWeight: 600, marginTop: 4 }}>{primary ? TYPE_LABEL[primary.type_code || "paid_off"] : selKind === "off" ? "Weekly off" : "Working day"}</div></div>
                      <div style={{ background: C.lav, borderRadius: 10, padding: "10px 12px" }}><div style={{ ...label, fontSize: 10, color: C.muted }}>Payment</div><div style={{ fontWeight: 600, marginTop: 4 }}>{primary ? (typeof primary.category_rules?.["*"] === "number" ? fmtX(primary.category_rules["*"]) : TYPE_PAY[primary.type_code || "paid_off"]) : selKind === "off" && sunCode === "special_pay" ? "2X" : "1X"}</div></div>
                    </div>
                    <div style={{ background: C.lav, borderRadius: 12, padding: 14, marginTop: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Worker payment override</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                        {[["1", "1X"], ["1.5", "1.5X"], ["2", "2X"], ["custom", "Custom"]].map(([v, l]) =>
                          <div key={v} className={"chip " + (chip === v ? "on" : "")} onClick={() => setChip(v)}>{l}</div>)}
                      </div>
                      <div style={{ marginTop: 10, maxHeight: 220, overflowY: "auto" }}>
                        {dayWorkers === null ? <div style={{ fontSize: 12.5, color: C.muted }}>Loading…</div>
                          : dayWorkers.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>No attendance on this date yet.</div>
                          : dayWorkers.map(w => (
                            <div key={w.attendance_id} onClick={() => setSelWorker(w)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 6px", borderRadius: 10, cursor: "pointer", background: selWorker?.attendance_id === w.attendance_id ? "#e0e7ff" : "transparent" }}>
                              <div style={{ width: 32, height: 32, borderRadius: 16, background: C.blue, color: "#fff", fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(w.worker_name)}</div>
                              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.worker_name}</div><div style={{ fontSize: 11.5, color: C.muted }}>{w.site_name || "—"}</div></div>
                              <span style={{ background: C.greenSoft, color: C.greenInk, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>{w.holiday_multiplier != null ? fmtX(w.holiday_multiplier) : "rule"}</span>
                            </div>))}
                      </div>
                    </div>
                    {msg && <div style={{ color: C.greenInk, fontSize: 12.5, marginTop: 10 }}>✓ {msg}</div>}
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <button disabled={!canManage || !primary} onClick={() => primary && openEdit(primary)} style={{ ...btnBlue, flex: 1, background: C.blueSoft, opacity: !primary ? .7 : 1 }}>✎ Edit</button>
                      <button disabled={!canManage || busy} onClick={() => applyOverride(chip === "custom" ? Number(window.prompt("Multiplier (e.g. 1.25):") || NaN) : Number(chip))} style={btnGhost}>Enable</button>
                      <button disabled={!canManage || busy} title={primary ? "Delete holiday" : "Remove worker override"} onClick={() => primary ? delHoliday(primary) : applyOverride(null)} style={{ ...btnGhost, color: C.red }}>🗑</button>
                    </div>
                  </div>

                  {/* sunday policy */}
                  <div style={{ ...card, padding: 22 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ ...label, color: "#92400e" }}>Sunday policy</div><span style={{ fontSize: 12, color: C.muted }}>Applies weekly</span></div>
                    {SUN_OPTS.map(([v, l]) => <div key={v} className={"sopt " + (sunCode === v ? "on" : "")} onClick={() => setSunday(v)}><span>{l}</span>{sunCode === v && <span style={{ fontSize: 12.5 }}>Active</span>}</div>)}
                  </div>

                  {/* site-wise view */}
                  <div style={{ ...card, padding: 22 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ ...label, color: C.violet }}>Site-wise view</div><span style={{ color: C.muted }}>⚙</span></div>
                    <div style={{ fontSize: 18, fontWeight: 800, margin: "6px 0 10px" }}>Sync health</div>
                    {sites.map(s => {
                      const n = scoped.filter(h => (!(h.site_ids || []).length || h.site_ids.map(Number).includes(Number(s.id))) && h.on_date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)).length;
                      return (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, background: C.lav, borderRadius: 12, padding: "10px 12px", marginTop: 8 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: "#e0e7ff", color: C.blue, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(s.name)[0]}</div>
                          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div><div style={{ fontSize: 12, color: C.muted }}>{siteStats[String(s.id)] || 0} workers · {n} month entries</div></div>
                          <span style={{ background: C.greenSoft, color: C.greenInk, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>In sync</span>
                        </div>);
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ ...card, padding: "10px 22px 18px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", columnGap: 40 }}>
                  {MONTHS.map((m, i) => {
                    const n = scoped.filter(h => h.on_date.startsWith(`${year}-${String(i + 1).padStart(2, "0")}`)).length;
                    const max = Math.max(1, ...MONTHS.map((_, j) => scoped.filter(h => h.on_date.startsWith(`${year}-${String(j + 1).padStart(2, "0")}`)).length));
                    return (
                      <div key={m} className="mcard" style={{ cursor: "pointer" }} onClick={() => { setMonth(i); setView("month"); }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontSize: 15 }}>{m}</b><span style={{ fontSize: 12.5, color: C.muted }}>{n} entries</span></div>
                        <div style={{ height: 6, background: "#eef0f6", borderRadius: 6, marginTop: 8, overflow: "hidden" }}><div style={{ width: `${Math.max(8, Math.round(n / max * 100))}%`, height: "100%", background: C.amber, borderRadius: 6 }} /></div>
                      </div>);
                  })}
                </div>
              </div>
            )}

            {/* yearly list */}
            <div style={{ ...card, padding: 22, marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ ...label, color: C.blue }}>Yearly holiday list</div><div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{year} schedule</div></div>
                <span style={{ background: "#e5e7eb", borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontWeight: 700 }}>{activeEntries} active entries</span>
              </div>
              {scoped.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {scoped.map(h => (
                    <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: `1px solid ${C.line}`, fontSize: 13.5, cursor: "pointer" }} onClick={() => { const d = new Date(h.on_date + "T00:00:00"); setMonth(d.getMonth()); setSelDate(h.on_date); setView("month"); }}>
                      <Dot c={h.type_code === "working" ? C.green : C.red} /><span style={{ width: 120, color: C.muted }}>{fmtLong(h.on_date)}</span><b style={{ flex: 1 }}>{h.name}</b>
                      <span style={{ color: C.muted, fontSize: 12.5 }}>{AUD_LABEL[h.applies_to || "both"]} · {(h.site_ids || []).length ? h.site_ids.length + " site(s)" : "All Sites"}</span>
                    </div>))}
                </div>
              )}
            </div>
            <div style={{ textAlign: "center", ...label, color: C.muted, marginTop: 22, fontSize: 11.5 }}>Changes auto-sync to attendance · muster roll · wages · payroll · salary slips</div>
          </div>
        </div>

        {/* add / edit modal */}
        {modal && (
          <div onClick={() => !busy && setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(30,35,60,.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ ...card, width: "min(680px, 100%)", padding: "22px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div><div style={{ ...label, color: C.blue }}>Calendar entry</div><div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{modal.id ? "Edit holiday" : "Add holiday"}</div></div>
                <button onClick={() => setModal(null)} style={{ ...btnGhost, border: "none" }}>✕</button>
              </div>
              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                <div><div style={{ fontSize: 12.5, color: C.muted, marginBottom: 4 }}>Holiday or working day name</div><input value={modal.name} placeholder="e.g. Republic Day" onChange={e => setModal(m => ({ ...m, name: e.target.value }))} style={{ ...sel, width: "100%", boxSizing: "border-box" }} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><div style={{ fontSize: 12.5, color: C.muted, marginBottom: 4 }}>Date</div><input type="date" value={modal.on_date} onChange={e => setModal(m => ({ ...m, on_date: e.target.value }))} style={{ ...sel, width: "100%", boxSizing: "border-box" }} /></div>
                  <div><div style={{ fontSize: 12.5, color: C.muted, marginBottom: 4 }}>Type</div><select value={modal.type_code} onChange={e => setModal(m => ({ ...m, type_code: e.target.value }))} style={{ ...sel, width: "100%" }}>{Object.keys(TYPE_LABEL).map(c => <option key={c} value={c}>{TYPE_LABEL[c]}</option>)}</select></div>
                  <div><div style={{ fontSize: 12.5, color: C.muted, marginBottom: 4 }}>Applies to</div><select value={modal.applies_to} onChange={e => setModal(m => ({ ...m, applies_to: e.target.value }))} style={{ ...sel, width: "100%" }}>{AUD.slice(1).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div><div style={{ fontSize: 12.5, color: C.muted, marginBottom: 4 }}>Sites</div><select value={modal.site_ids.length ? String(modal.site_ids[0]) : "all"} onChange={e => setModal(m => ({ ...m, site_ids: e.target.value === "all" ? [] : [Number(e.target.value)] }))} style={{ ...sel, width: "100%" }}><option value="all">All Sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  <div><div style={{ fontSize: 12.5, color: C.muted, marginBottom: 4 }}>Sunday rule</div><select value={sunCode} disabled style={{ ...sel, width: "100%", color: C.muted }} title="Set from the Sunday policy card">{SUN_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div><div style={{ fontSize: 12.5, color: C.muted, marginBottom: 4 }}>Default payment</div><select value={modal.pay} onChange={e => setModal(m => ({ ...m, pay: e.target.value }))} style={{ ...sel, width: "100%" }}><option value="">Type default</option><option value="1">1X</option><option value="1.5">1.5X</option><option value="2">2X</option></select></div>
                </div>
              </div>
              {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
                <button style={btnGhost} onClick={() => setModal(null)} disabled={busy}>Cancel</button>
                <button style={{ ...btnBlue, background: modal.name.trim() ? C.blue : C.blueSoft }} disabled={busy || !modal.name.trim()} onClick={saveModal}>Save &amp; Sync</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
