"use client";
// update259: PIPESKOOL CALENDAR.
// Reads live from every module (lib/calendar.js). No new tables, no sync, no duplicated data —
// so permissions, the project scope and every existing workflow behave exactly as before.
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { getSites } from "@/lib/data";
import { getCalendarEvents, groupByDate, monthGrid, iso, EVENT_TYPES, STATUS_META } from "@/lib/calendar";

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

export default function CalendarPage() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState(null);
  const [sites, setSites] = useState([]);
  const [site, setSite] = useState("all");
  const [types, setTypes] = useState({});     // empty = show everything
  const [sel, setSel] = useState(() => iso(new Date()));
  const [err, setErr] = useState("");

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
  }, [session, range.from, range.to, site]);   // eslint-disable-line react-hooks/exhaustive-deps

  const activeTypes = Object.keys(types).filter(k => types[k]);
  const filtered = useMemo(() => (events || [])
    .filter(e => activeTypes.length === 0 || activeTypes.includes(e.type)), [events, types]);   // eslint-disable-line react-hooks/exhaustive-deps
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

  const open = ev => { if (ev.href) window.open(ev.href, "_blank", "noopener"); };
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

        <div className="cal-filters">
          <button type="button" onClick={() => step(-1)} className="cal-nav">‹</button>
          <b style={{ minWidth: 160, textAlign: "center", fontSize: 15 }}>
            {view === "day"
              ? cursor.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
              : MONTHS[cursor.getMonth()] + " " + cursor.getFullYear()}
          </b>
          <button type="button" onClick={() => step(1)} className="cal-nav">›</button>
          <button type="button" onClick={() => { setCursor(new Date()); setSel(t); }} className="cal-today">Today</button>

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
