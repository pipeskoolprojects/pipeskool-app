"use client";
// update259: PIPESKOOL CALENDAR.
// Reads live from every module (lib/calendar.js). No new tables, no sync, no duplicated data —
// so permissions, the project scope and every existing workflow behave exactly as before.
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { getSites } from "@/lib/data";
import { getCalendarEvents, groupByDate, monthGrid, iso, EVENT_TYPES, STATUS_META } from "@/lib/calendar";
import { saveHoliday, deleteHoliday } from "@/lib/holidays";   // update264
import { canAnySite } from "@/lib/auth";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// module scope — never define a component inside a component (update204)
function Chip({ ev, onClick }) {
  const t = EVENT_TYPES[ev.type] || EVENT_TYPES.task;
  const st = STATUS_META[ev.state] || STATUS_META.pending;
  return (
    <button type="button" onClick={() => onClick(ev)} title={ev.title + (ev.sub ? " \u2014 " + ev.sub : "")}
      className="cal-chip"
      style={{ background: t.bg, color: t.fg, borderLeft: "3px solid " + st[1] }}>
      {t.icon} {ev.title}
    </button>
  );
}

function Agenda({ list, onClick, empty }) {
  if (!list.length) return <div className="muted" style={{ fontSize: 12.5 }}>{empty}</div>;
  return list.map(ev => {
    const t = EVENT_TYPES[ev.type] || EVENT_TYPES.task;
    const st = STATUS_META[ev.state] || STATUS_META.pending;
    return (
      <div key={ev.id} onClick={() => onClick(ev)} className="cal-agrow">
        <span className="cal-agic" style={{ background: t.bg, color: t.fg }}>{t.icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 12.5, display: "block" }}>{ev.title}</b>
          <span className="muted" style={{ fontSize: 11 }}>{ev.sub}</span>
        </span>
        <span className="badge" style={{ fontSize: 9.5, color: st[1], border: "1px solid " + st[1], background: "transparent", whiteSpace: "nowrap" }}>{st[0]}</span>
      </div>
    );
  });
}


// update264: MODULE scope — add / edit / delete a company holiday straight from the calendar.
// Writes the same company_holidays rows payroll and the muster read; DB policy is the real gate.
function HolidayModal({ init, sites, onClose, onSaved }) {
  const [f, setF] = useState({ id: init.id || null, on_date: init.on_date, name: init.name || "", site_ids: init.site_ids || [], applies_to: init.applies_to || "both", note: init.note || "" });   // update293
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
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
          Marked holidays are <b>paid</b> (27-Aug rule): absent = 1× pay, worked full day = 2×. Payroll, muster and the attendance register all read this same entry.
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
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState(null);
  const [sites, setSites] = useState([]);
  const [site, setSite] = useState("all");
  const [types, setTypes] = useState({});     // empty = show everything
  const [holWho, setHolWho] = useState("all");   // update293: all | both | staff | labour | none
  const [sel, setSel] = useState(() => iso(new Date()));
  const [err, setErr] = useState("");
  const [hol, setHol] = useState(null);        // update264: holiday modal — null | {id?, on_date, name, site_ids}
  const [msg, setMsg] = useState("");
  const [bump, setBump] = useState(0);         // update264: reload events after a holiday change

  useEffect(() => {
    const s = getSession();
    if (!s) { window.location.replace("/login"); return; }
    setSession(s);
    getSites().then(r => setSites(r?.rows || r || []));
  }, []);

  // the window to load: the whole 6-week grid for month, the week for week, the day for day
  const range = useMemo(() => {
    if (view === "month") {
      const g = monthGrid(cursor.getFullYear(), cursor.getMonth());
      return { from: g[0].key, to: g[41].key };
    }
    if (view === "week") {
      const s = new Date(cursor); s.setDate(cursor.getDate() - cursor.getDay());
      const e = new Date(s); e.setDate(s.getDate() + 6);
      return { from: iso(s), to: iso(e) };
    }
    return { from: iso(cursor), to: iso(cursor) };
  }, [view, cursor]);

  useEffect(() => {
    if (!session) return;
    setEvents(null);
    getCalendarEvents(range.from, range.to, { siteId: site === "all" ? null : site })
      .then(setEvents).catch(e => { setEvents([]); setErr(e.message || String(e)); });
  }, [session, range.from, range.to, site, bump]);   // eslint-disable-line react-hooks/exhaustive-deps

  const activeTypes = Object.keys(types).filter(k => types[k]);
  const filtered = useMemo(() => (events || [])
    .filter(e => activeTypes.length === 0 || activeTypes.includes(e.type))
    .filter(e => e.type !== "holiday" || holWho === "all" || (e.applies_to || "both") === holWho), [events, types, holWho]);   // eslint-disable-line react-hooks/exhaustive-deps
  const byDate = useMemo(() => groupByDate(filtered), [filtered]);

  const grid = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const weekDays = useMemo(() => {
    const s = new Date(cursor); s.setDate(cursor.getDate() - cursor.getDay());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return { date: d, key: iso(d), inMonth: true }; });
  }, [cursor]);

  const step = n => {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + n);
    else if (view === "week") d.setDate(d.getDate() + 7 * n);
    else d.setDate(d.getDate() + n);
    setCursor(d);
  };

  const canManageHol = session?.role === "director" || canAnySite(session, "attendance", "manage");   // update264 (DB policy is the real gate)
  const open = ev => {
    if (ev.type === "holiday" && canManageHol) { setHol({ id: ev.hid, on_date: ev.date, name: ev.title, site_ids: ev.site_ids || [] }); return; }   // update264: edit/delete
    if (ev.href) window.open(ev.href, "_blank", "noopener");
  };
  const cells = view === "month" ? grid : view === "week" ? weekDays : [{ date: cursor, key: iso(cursor), inMonth: true }];
  const t = iso(new Date());

  if (!session) return null;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="cal-top">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📅 Pipeskool Calendar</h1>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              All company events in one place — read live from your existing data.
            </div>
          </div>
          <div className="cal-switch">
            {["month", "week", "day"].map(v => (
              <button key={v} type="button" onClick={() => setView(v)} className={view === v ? "active" : ""}>
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg, #e8f6ee)", color: "var(--green, #1a7f4b)", marginBottom: 10 }}>{msg}</div>}
        {hol && <HolidayModal init={hol} sites={sites} onClose={() => setHol(null)}
          onSaved={m => { setHol(null); setMsg(m); setBump(b => b + 1); }} />}{/* update264 */}

        <div className="cal-filters">
          <button type="button" onClick={() => step(-1)} className="cal-nav">‹</button>
          <b style={{ minWidth: 160, textAlign: "center", fontSize: 15 }}>
            {view === "day"
              ? cursor.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
              : MONTHS[cursor.getMonth()] + " " + cursor.getFullYear()}
          </b>
          <button type="button" onClick={() => step(1)} className="cal-nav">›</button>
          <button type="button" onClick={() => { setCursor(new Date()); setSel(t); }} className="cal-today">Today</button>
          {canManageHol && <button type="button" onClick={() => { setMsg(""); setHol({ on_date: sel, name: "", site_ids: [] }); }}
            style={{ marginLeft: 6 }} title="Add a paid company holiday on the selected date">🪔 ＋ Add holiday</button>}{/* update264 */}

          <select value={site} onChange={e => setSite(e.target.value)}>
            <option value="all">Site / Project: all</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="cal-types">
            {Object.entries(EVENT_TYPES).map(([k, m]) => {
              const on = !!types[k];
              return (
                <button key={k} type="button" onClick={() => setTypes(v => ({ ...v, [k]: !v[k] }))}
                  title={m.label} className={"cal-type" + (on ? " on" : "")}
                  style={on ? { background: m.bg, color: m.fg, borderColor: m.bg } : undefined}>
                  {m.icon} {m.label}
                </button>
              );
            })}
            {activeTypes.length > 0 && <button type="button" className="cal-type" onClick={() => setTypes({})}>✕ clear</button>}
            <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 4px" }} />{/* update293: holiday audience filter */}
            {[["all", "🪔 All holidays"], ["both", "🏢+👷 Both"], ["staff", "🏢 Office"], ["labour", "👷 Workers"], ["none", "📿 Observances"]].map(([k, l]) => (
              <button key={"hw" + k} type="button" onClick={() => setHolWho(k)} className={"cal-type" + (holWho === k ? " on" : "")}
                style={holWho === k ? { background: "#FF6A1F", color: "#fff", borderColor: "#FF6A1F" } : undefined}>{l}</button>
            ))}
          </div>
        </div>

        <div className="cal-body">
          <div className="cal-card">
            {view !== "day" && (
              <div className="cal-dow">{DOW.map(d => <div key={d}>{d}</div>)}</div>
            )}
            <div className={view === "day" ? "cal-daygrid" : "cal-grid"}>
              {cells.map(c => {
                const list = byDate[c.key] || [];
                const isHol = list.some(e => e.type === "holiday");
                const show = view === "month" ? list.slice(0, 3) : list;
                return (
                  <div key={c.key} onClick={() => setSel(c.key)}
                    className={"cal-cell" + (c.inMonth ? "" : " out") + (c.key === t ? " today" : "") +
                      (isHol ? " holiday" : "") + (c.key === sel ? " sel" : "")}>
                    <div className="cal-daynum">
                      {c.date.getDate()}
                      {view !== "month" && <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> {DOW[c.date.getDay()]}</span>}
                    </div>
                    {show.map(ev => <Chip key={ev.id} ev={ev} onClick={open} />)}
                    {view === "month" && list.length > 3 &&
                      <div className="cal-more" onClick={e => { e.stopPropagation(); setSel(c.key); }}>+{list.length - 3} more</div>}
                    {view === "day" && list.length === 0 && <div className="muted" style={{ fontSize: 12 }}>Nothing scheduled.</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="cal-side">
            <div className="panel" style={{ margin: 0 }}>
              <h2 style={{ fontSize: 14 }}>
                {sel === t ? "Today" : new Date(sel + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </h2>
              {events === null
                ? <div className="muted" style={{ fontSize: 12.5 }}>Loading…</div>
                : <Agenda list={byDate[sel] || []} onClick={open} empty="Nothing on this day." />}
            </div>

            <div className="panel" style={{ margin: 0 }}>
              <h2 style={{ fontSize: 14 }}>Next 7 days</h2>
              {events === null ? <div className="muted" style={{ fontSize: 12.5 }}>Loading…</div> : (() => {
                const upcoming = filtered.filter(e => e.date >= t).slice(0, 8);
                return <Agenda list={upcoming} onClick={open} empty="Nothing coming up in this range." />;
              })()}
            </div>

            <div className="panel" style={{ margin: 0 }}>
              <h2 style={{ fontSize: 14 }}>Status</h2>
              {Object.entries(STATUS_META).map(([k, [label, color]]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />{label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
