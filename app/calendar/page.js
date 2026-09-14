"use client";
// update387: HOLIDAY-ONLY CONTROL PAGE — full rewrite.
// This page used to be a general company events calendar. It now shows ONLY holidays and
// their per-category pay rules, on a monthly grid with legend + filters + a day panel.
// Everything that used to live here (tasks, POs, deliveries, expenses, DPR, approvals,
// payroll due dates) is still available in the app — just not on this page.
//
// Data reads: company_holidays + holiday_types (via lib/holidays.getHolidayContext).
// Writes: unchanged — HolidayModal (below), DayPaymentsPanel (component).
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { getSites } from "@/lib/data";
import { monthGrid, iso } from "@/lib/calendar";
import {
  saveHoliday, deleteHoliday, getHolidayTypes, copyHolidaysYear,
  getHolidayContext,
} from "@/lib/holidays";
import { canAnySite } from "@/lib/auth";
import DayPaymentsPanel from "@/components/DayPaymentsPanel";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW    = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Legend + colour tokens. One place for the palette so the swatches, cell bands and side
// panel badge always agree.
const TYPE_META = {
  paid_off:    { color: "#3B6D11", tint: "#EAF3DE", label: "Paid holiday",       hint: "1× pay, no work" },
  festival_2x: { color: "#BA7517", tint: "#FBEBD3", label: "Festival · 2×",      hint: "Double pay if worker present" },
  optional:    { color: "#888780", tint: "#EEECE7", label: "Unpaid / Optional",  hint: "No pay if absent" },
  working:     { color: "#185FA5", tint: "#DDECFA", label: "Working Sunday",    hint: "Normal / OT rules apply" },
  special:     { color: "#7C3AED", tint: "#EDE6FC", label: "Special / Custom",   hint: "Per-row rules" },
};
// Category chips in the filter row.
const CATS = [
  { code: "all",          label: "All categories" },
  { code: "labour",       label: "Workers" },
  { code: "site_staff",   label: "Site Staff" },
  { code: "office_staff", label: "Office Staff" },
];

function HolidayModal({ init, sites, onClose, onSaved }) {
  const [f, setF] = useState({ id: init.id || null, on_date: init.on_date, name: init.name || "", site_ids: init.site_ids || [], applies_to: init.applies_to || "both", note: init.note || "",
    type_code: init.type_code || "paid_off",            // update386
    category_rules: init.category_rules || null });    // update386: null = use type defaults
  const [types, setTypes] = useState({});
  useEffect(() => { getHolidayTypes().then(setTypes); }, []);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const allSites = f.site_ids.length === 0;
  const toggleSite = id => setF(x => ({ ...x, site_ids: x.site_ids.includes(id) ? x.site_ids.filter(s => s !== id) : [...x.site_ids, id] }));
  async function save() {
    setErr(""); setBusy(true);
    try {
      const r = await saveHoliday(f);
      if (!r.ok) { setErr(r.error); return; }
      onSaved(f.id ? "Holiday updated." : "Holiday added — payroll, muster and attendance will treat this date as a paid holiday.");
    } catch (e) { setErr(e.message || "Could not save."); }
    finally { setBusy(false); }
  }
  async function del() {
    if (!f.id) return;
    if (!window.confirm(`Delete "${f.name}" (${f.on_date})? Pay for this date goes back to normal rules.`)) return;
    setErr(""); setBusy(true);
    try {
      const r = await deleteHoliday(f.id);
      if (!r.ok) { setErr(r.error); return; }
      onSaved("Holiday deleted.");
    } catch (e) { setErr(e.message || "Could not delete."); }
    finally { setBusy(false); }
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--card, #fff)", borderRadius: 12, padding: 18, width: "min(480px, 96vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 18px 50px rgba(0,0,0,.28)" }}>
        <h2 style={{ marginTop: 0 }}>{f.id ? "🪔 Edit holiday" : "🪔 Add holiday"}</h2>
        {/* update293: who it applies to + optional note */}
        <label className="muted">Applies to</label>
        <select value={f.applies_to} onChange={e => setF(x => ({ ...x, applies_to: e.target.value }))} style={{ width: "100%", marginBottom: 8 }}>
          <option value="both">🏢 Office/Staff + 👷 Workers/Labour — paid for both</option>
          <option value="staff">🏢 Office/Staff only</option>
          <option value="labour">👷 Workers/Labour only</option>
          <option value="none">📿 Observance — calendar only, NOT a paid day</option>
        </select>
        <label className="muted">Note (optional)</label>
        <input value={f.note} onChange={e => setF(x => ({ ...x, note: e.target.value }))} placeholder="e.g. Only for Odisha workers" style={{ width: "100%", marginBottom: 8 }} />
        {/* update386: holiday type + per-category multiplier overrides */}
        <div style={{ marginBottom: 10, padding: "10px 12px", background: "#f7f9fc", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: 0.05, textTransform: "uppercase", marginBottom: 6 }}>Rule</div>
          <label className="muted">Holiday type</label>
          <select value={f.type_code || ""} onChange={e => setF(x => ({ ...x, type_code: e.target.value || null }))} style={{ width: "100%", marginBottom: 6 }}>
            <option value="">— use classic rule (2× worked, 1× absent) —</option>
            {Object.values(types).sort((a, b) => a.sort_order - b.sort_order).map(t => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>
          <details style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 12, cursor: "pointer", color: "#334155" }}>Per-category override for THIS date only (advanced)</summary>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11.5 }}>
              {["labour", "site_staff", "office_staff"].map(cat => {
                const c = f.category_rules?.[cat] || {};
                const setCat = (part) => setF(x => {
                  const cr = { ...(x.category_rules || {}) };
                  cr[cat] = { ...(cr[cat] || {}), ...part };
                  Object.keys(cr[cat]).forEach(k => { if (cr[cat][k] === "" || cr[cat][k] == null) delete cr[cat][k]; });
                  if (Object.keys(cr[cat]).length === 0) delete cr[cat];
                  return { ...x, category_rules: Object.keys(cr).length ? cr : null };
                });
                return (
                  <div key={cat}>
                    <div style={{ fontWeight: 700, marginBottom: 3, color: "#0f172a" }}>{cat.replace("_", " ")}</div>
                    <label className="muted" style={{ fontSize: 10.5 }}>Present ×</label>
                    <input inputMode="decimal" value={c.present ?? ""} placeholder="type default"
                      onChange={e => setCat({ present: e.target.value === "" ? null : Number(e.target.value) })}
                      style={{ width: "100%", padding: "3px 5px", fontSize: 11.5 }} />
                    <label className="muted" style={{ fontSize: 10.5, display: "block", marginTop: 3 }}>Absent ×</label>
                    <input inputMode="decimal" value={c.absent ?? ""} placeholder="type default"
                      onChange={e => setCat({ absent: e.target.value === "" ? null : Number(e.target.value) })}
                      style={{ width: "100%", padding: "3px 5px", fontSize: 11.5 }} />
                  </div>
                );
              })}
            </div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>Leave a box blank to use the type default. Overrides apply only to this date.</div>
          </details>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
          <div><label className="muted">Date</label><input type="date" style={{ width: "100%" }} value={f.on_date} onChange={e => setF(x => ({ ...x, on_date: e.target.value }))} /></div>
          <div><label className="muted">Holiday name</label><input style={{ width: "100%" }} placeholder="e.g. Diwali" value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} /></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="muted">Applies to</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={allSites} onChange={() => setF(x => ({ ...x, site_ids: [] }))} /> All sites
            </label>
            {sites.map(s => (
              <label key={s.id} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={f.site_ids.includes(s.id)} onChange={() => toggleSite(s.id)} /> {s.name}
              </label>
            ))}
          </div>
        </div>
        {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : f.id ? "Save changes" : "Add holiday"}</button>
          {f.id && <button disabled={busy} onClick={del} style={{ color: "var(--red)", borderColor: "var(--red)" }}>🗑 Delete</button>}
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}


export default function CalendarPage() {
  const [session, setSession] = useState(null);
  const [cursor,  setCursor]  = useState(() => new Date());
  const [sel,     setSel]     = useState(() => iso(new Date()));
  const [site,    setSite]    = useState("all");
  const [cat,     setCat]     = useState("all");
  const [sites,   setSites]   = useState([]);
  const [ctx,     setCtx]     = useState(null);      // getHolidayContext result
  const [types,   setTypes]   = useState({});        // holiday_types map
  const [hol,     setHol]     = useState(null);      // modal state
  const [err,     setErr]     = useState("");
  const [msg,     setMsg]     = useState("");
  const [bump,    setBump]    = useState(0);
  const canManageHol = !!session && (session.role === "director" || canAnySite(session, "attendance", "manage"));

  useEffect(() => {
    const s = getSession();
    if (!s) { window.location.replace("/login"); return; }
    setSession(s);
    getSites().then(r => setSites(r?.rows || r || []));
    getHolidayTypes().then(setTypes);
  }, []);

  // window: the whole 6-week grid the month view shows
  const grid = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const range = { from: grid[0].key, to: grid[41].key };

  useEffect(() => {
    if (!session) return;
    setCtx(null); setErr("");
    // load one day past the last visible cell so the resolver has the whole window
    const lastPlus = new Date(range.to + "T00:00:00"); lastPlus.setDate(lastPlus.getDate() + 1);
    getHolidayContext(range.from, iso(lastPlus))
      .then(setCtx)
      .catch(e => { setCtx({ byDate: {}, types: {}, sundayRules: {} }); setErr(e.message || String(e)); });
  }, [session, range.from, range.to, bump]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Filter: for a given holiday row, does this (site, category) reveal it?
  const rowVisible = (h) => {
    // site
    const list = h.site_ids || [];
    if (site !== "all") {
      if (list.length && !list.map(Number).includes(Number(site))) return false;
    }
    // category
    if (cat !== "all") {
      if (h.category_rules && typeof h.category_rules === "object") {
        if (h.category_rules[cat] == null && h.category_rules["*"] == null) return false;
      } else {
        // fall back to classic applies_to
        const a = h.applies_to || "both";
        if (cat === "labour"       && !(a === "both" || a === "labour")) return false;
        if (cat === "site_staff"   && !(a === "both" || a === "staff"))  return false;
        if (cat === "office_staff" && !(a === "both" || a === "staff"))  return false;
      }
    }
    return true;
  };

  const cellRows = (dateKey) => (ctx?.byDate?.[dateKey] || []).filter(rowVisible);

  // Selected date summary (right-hand panel header)
  const selRows = cellRows(sel);
  const selDate = new Date(sel + "T00:00:00");
  const step = n => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + n); return d; });

  if (!session) return null;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="cal-shell">
          <div className="cal-top">
            <div>
              <h1>🪔 Holiday & Attendance Calendar</h1>
              <div className="cal-sub">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()} · pay rules that flow into Attendance, Muster, Wages and Payslip.</div>
            </div>
            <div className="cal-topright">
              <div className="cal-nav-group" role="group" aria-label="Month navigation">
                <button type="button" onClick={() => step(-1)} className="cal-nav" aria-label="Previous month">‹</button>
                <button type="button" onClick={() => { const t = new Date(); setCursor(t); setSel(iso(t)); }} className="cal-today">Today</button>
                <button type="button" onClick={() => step(1)} className="cal-nav" aria-label="Next month">›</button>
              </div>
              {canManageHol && <button type="button" className="primary"
                onClick={() => { setMsg(""); setHol({ on_date: sel, name: "", site_ids: [] }); }}
                style={{ padding: "8px 14px", borderRadius: 10, fontSize: 12.5 }}>🪔 ＋ Add holiday</button>}
            </div>
          </div>

          {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
          {msg && <div className="demo-banner" style={{ background: "var(--green-bg, #e8f6ee)", color: "var(--green, #1a7f4b)", marginBottom: 10 }}>{msg}</div>}
          {hol && <HolidayModal init={hol} sites={sites} onClose={() => setHol(null)}
            onSaved={m => { setHol(null); setMsg(m); setBump(b => b + 1); }} />}

          {/* Legend — the four colours we use to code the cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
            {["paid_off", "festival_2x", "optional", "working"].map(code => {
              const t = TYPE_META[code];
              return (
                <div key={code} style={{ background: "#fff", border: "1px solid var(--cal-line, #ebeef2)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: t.color, display: "inline-block" }} />
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t.label}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, color: "var(--cal-num, #0f1729)" }}>{t.hint}</div>
                </div>
              );
            })}
          </div>

          {/* Filters — site + category */}
          <div className="cal-filters">
            <span className="cal-filters-label">Filter</span>
            <select value={site} onChange={e => setSite(e.target.value)}>
              <option value="all">Site / Project: all</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="cal-sep" />
            <div className="cal-types">
              {CATS.map(c => (
                <button key={c.code} type="button" onClick={() => setCat(c.code)}
                        className={"cal-type" + (cat === c.code ? " on" : "")}>{c.label}</button>
              ))}
            </div>
          </div>

          <div className="cal-body">
            <div className="cal-card">
              <div className="cal-dow">{DOW.map(d => <div key={d}>{d}</div>)}</div>
              <div className="cal-grid">
                {ctx === null
                  ? DOW.map((_, i) => <div key={i} className="cal-cell" style={{ opacity: 0.4 }}><div className="cal-daynum">·</div></div>)
                  : grid.map(c => {
                      const list = cellRows(c.key);
                      const t    = iso(new Date());
                      const isSun = c.date.getDay() === 0;
                      const primary = list[0];
                      const meta = primary ? TYPE_META[primary.type_code || "paid_off"] || TYPE_META.paid_off : null;
                      return (
                        <div key={c.key} onClick={() => setSel(c.key)}
                          className={"cal-cell" + (c.inMonth ? "" : " out") + (c.key === t ? " today" : "") + (isSun ? " sun" : "") + (c.key === sel ? " sel" : "")}
                          style={meta ? { background: meta.tint, boxShadow: "inset 3px 0 0 " + meta.color } : undefined}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
                            <div className="cal-daynum" style={meta ? { color: meta.color } : undefined}>{c.date.getDate()}</div>
                            {meta && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.03, color: "#fff", background: meta.color, borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{shortRule(primary, types, cat)}</span>}
                          </div>
                          {list.slice(0, 2).map(h => (
                            <div key={h.id || h.on_date + h.name} style={{ fontSize: 10.5, color: "#374151", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {h.name}
                            </div>
                          ))}
                          {list.length > 2 && <div className="cal-more">+{list.length - 2} more</div>}
                        </div>
                      );
                    })}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
                Click a date to see holiday details and per-worker payments. All settings here are read by Attendance, Muster Roll, Wages, Payroll and the Salary Slip.
              </div>
            </div>

            <div className="cal-side">
              {/* Selected date panel */}
              <div className="panel" style={{ margin: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, letterSpacing: 0.04, textTransform: "uppercase" }}>Selected date</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--cal-num, #0f1729)" }}>
                      {selDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  {canManageHol && <button onClick={() => { setMsg(""); setHol({ on_date: sel, name: "", site_ids: [] }); }} style={{ fontSize: 11.5, padding: "5px 10px" }}>＋ Add</button>}
                </div>
                {selRows.length === 0
                  ? <div className="muted" style={{ fontSize: 12.5 }}>No holiday on this date. Click <b>＋ Add</b> to mark it.</div>
                  : selRows.map(h => <HolidayCard key={h.id || h.on_date + h.name} h={h} types={types} onEdit={() => canManageHol && setHol({ id: h.id, on_date: h.on_date, name: h.name, site_ids: h.site_ids || [], applies_to: h.applies_to, note: h.note, type_code: h.type_code, category_rules: h.category_rules })} />)}
              </div>

              {/* Per-worker payment control (from update 382) — same panel we've been using */}
              <DayPaymentsPanel date={sel} isHoliday={selRows.length > 0} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// --- helpers ---

// A one- or two-char tag that fits in the cell: 2× / off / — / etc.
function shortRule(h, types, category) {
  const cat = category === "all" ? "labour" : category;
  const key = "present";
  let m = null;
  if (h.category_rules) {
    const c = h.category_rules[cat] || h.category_rules["*"];
    if (typeof c === "number") m = c;
    else if (c && c[key] != null) m = Number(c[key]);
  }
  if (m == null && h.type_code && types[h.type_code]) {
    const d = types[h.type_code].default_multipliers_present;
    if (d && d[cat] != null) m = Number(d[cat]);
    else if (d && d["*"] != null) m = Number(d["*"]);
  }
  if (m == null) m = 2;   // classic default
  if (m === 0)   return "—";
  if (m === 1)   return "off";
  return fmtX(m);
}
function fmtX(n) { const s = Number(n).toFixed(2).replace(/\.?0+$/, ""); return s + "×"; }

function HolidayCard({ h, types, onEdit }) {
  const t = TYPE_META[h.type_code || "paid_off"] || TYPE_META.paid_off;
  const catRows = [
    { cat: "labour",       label: "Workers"      },
    { cat: "site_staff",   label: "Site Staff"   },
    { cat: "office_staff", label: "Office Staff" },
  ].map(row => ({ ...row, ...multForCategory(h, types, row.cat) })).filter(r => r.applicable);

  return (
    <div style={{ padding: "10px 12px", background: "#fff", border: "1px solid var(--cal-line, #ebeef2)", borderRadius: 10, marginTop: 6, cursor: onEdit ? "pointer" : "default" }} onClick={onEdit}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: t.color, display: "inline-block" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--cal-num, #0f1729)" }}>{h.name}</span>
        <span style={{ marginLeft: "auto", background: t.color, color: "#fff", fontSize: 10.5, padding: "1px 7px", borderRadius: 4, fontWeight: 700 }}>{t.label}</span>
      </div>
      {h.note && <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>{h.note}</div>}
      {catRows.length === 0
        ? <div className="muted" style={{ fontSize: 11.5 }}>No pay rule applies to any category.</div>
        : (
          <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
            <tbody>
              {catRows.map(r => (
                <tr key={r.cat} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "4px 0", color: "#334155" }}>{r.label}</td>
                  <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>{formatPair(r.present, r.absent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>
        Sites: {(h.site_ids || []).length === 0 ? "All sites" : (h.site_ids || []).length + " selected"}
        {onEdit && <span style={{ marginLeft: 8 }}>· click to edit</span>}
      </div>
    </div>
  );
}

function multForCategory(h, types, cat) {
  const audCats = { both: ["labour","site_staff","office_staff"], staff: ["site_staff","office_staff"], labour: ["labour"], none: [] };
  const inScope = h.category_rules
    ? (h.category_rules[cat] != null || h.category_rules["*"] != null)
    : (audCats[h.applies_to || "both"] || []).includes(cat);
  if (!inScope) return { applicable: false };
  const pick = (map, k) => {
    if (h.category_rules) {
      const c = h.category_rules[cat] || h.category_rules["*"];
      if (typeof c === "number" && k === "present") return c;
      if (c && c[k] != null) return Number(c[k]);
    }
    if (h.type_code && types[h.type_code] && types[h.type_code][map]) {
      const d = types[h.type_code][map];
      if (d[cat] != null) return Number(d[cat]);
      if (d["*"]  != null) return Number(d["*"]);
    }
    return k === "present" ? 2 : 1;   // classic fallback
  };
  return { applicable: true, present: pick("default_multipliers_present", "present"), absent: pick("default_multipliers_absent", "absent") };
}
function formatPair(pres, abs) {
  return `${fmtX(pres)} if worked · ${fmtX(abs)} if absent`;
}
