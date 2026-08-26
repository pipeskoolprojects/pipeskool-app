"use client";
// update203: MASTER PROJECT DASHBOARD — layout per user's reference image.
// Sites ARE projects: everything here reads/extends existing data, zero duplication.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { inr } from "@/lib/money";
import { getProjects, saveProject, PROJECT_STATUSES, stMeta, getTasks, addTask, toggleTask } from "@/lib/projects";

const EMPTY = { name: "", code: "", address: "", client_name: "", client_contact: "", manager_id: "", project_status: "active",
  start_date: "", end_date: "", expected_start: "", contract_value: "", estimated_cost: "", priority: "medium", tags: "", description: "" };

export default function ProjectsPage() {
  const [session, setSession] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("all");
  const [modal, setModal] = useState(null);   // project form (EMPTY or existing)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [tasks, setTasks] = useState([]);
  const [taskForm, setTaskForm] = useState({ title: "", due_date: "", priority: "medium", site_id: "", assigned_to: "" });
  const [showTask, setShowTask] = useState(false);

  const isDirector = session?.role === "director";
  const load = () => { getProjects().then(r => setData(r.rows ? r : { rows: [], staff: [] })); };
  useEffect(() => {
    const s = getSession(); if (!s) { window.location.replace("/login"); return; }
    setSession(s); load();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (session) getTasks({ mine: !isDirector, staffId: session.id }).then(setTasks); }, [session, msg]);   // eslint-disable-line react-hooks/exhaustive-deps

  // staff see only their assigned sites' projects (directors see all)
  const all = useMemo(() => {
    let rows = data?.rows || [];
    if (session && !isDirector) { const mine = (session.sites || []).map(x => Number(x.id)); rows = rows.filter(r => mine.includes(Number(r.id))); }
    return rows;
  }, [data, session, isDirector]);

  const by = st => all.filter(r => r.status === st);
  const counts = { active: by("active").length, upcoming: by("upcoming").length, on_hold: by("on_hold").length,
    delayed: by("delayed").length, completed: by("completed").length, idea: by("idea").length };
  const totalReal = all.length - counts.idea;
  const fin = all.reduce((t, r) => ({ cv: t.cv + Number(r.contract_value || 0), ec: t.ec + Number(r.estimated_cost || 0), inv: t.inv + Number(r.invoiced || 0) }), { cv: 0, ec: 0, inv: 0 });
  const top5 = [...all].filter(r => r.progress !== null).sort((a, b) => b.progress - a.progress).slice(0, 5);
  const shown = tab === "all" ? all.filter(r => r.status !== "idea") : by(tab);

  // update206: card-grid filters (replace DataTable's built-ins; same behavior)
  const [q2, setQ2] = useState(""); const [fFrom, setFFrom] = useState(""); const [fTo, setFTo] = useState("");
  const [fClient, setFClient] = useState("all"); const [fMgr, setFMgr] = useState("all"); const [fSt2, setFSt2] = useState("all");
  const clients = useMemo(() => [...new Set(all.map(r => r.client_name).filter(Boolean))].sort(), [all]);
  const mgrs2 = useMemo(() => [...new Set(all.map(r => r.manager).filter(Boolean))].sort(), [all]);
  const filtered = useMemo(() => shown.filter(r => {
    if (q2 && !((r.name || "") + " " + (r.client_name || "") + " " + (r.address || "") + " " + (r.manager || "") + " " + (r.tags || "")).toLowerCase().includes(q2.toLowerCase())) return false;
    if (fClient !== "all" && r.client_name !== fClient) return false;
    if (fMgr !== "all" && r.manager !== fMgr) return false;
    if (fSt2 !== "all" && r.status !== fSt2) return false;
    const d = r.start_date || r.expected_start || "";
    if (fFrom && (!d || d < fFrom)) return false;
    if (fTo && (!d || d > fTo)) return false;
    return true;
  }), [shown, q2, fClient, fMgr, fSt2, fFrom, fTo]);
  function exportExcel() {
    const head = ["Project", "Client", "Location", "Manager", "Status", "Start", "End", "Progress %", "Contract value", "Invoiced"];
    const rows2 = filtered.map(r => [r.name, r.client_name || "", r.address || "", r.manager || "", stMeta(r.status)[1], r.start_date || r.expected_start || "", r.end_date || "", r.progress ?? "", r.contract_value || "", r.invoiced || ""]);
    const csv = [head, ...rows2].map(row => row.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = "projects.csv"; a.click();
  }
  const initials = n => (n || "").split(/\s+/).slice(0, 2).map(x => x[0] || "").join("").toUpperCase() || "—";


  async function save() {
    setBusy(true); setErr("");
    const res = await saveProject(modal.id, modal);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(modal.id ? "Project updated." : `Project "${modal.name}" created${["upcoming", "idea"].includes(modal.project_status) ? " under " + (modal.project_status === "idea" ? "Project Ideas" : "Upcoming") : ""}.`);
    setModal(null); load();
  }
  async function saveTask() {
    const res = await addTask({ ...taskForm, site_id: taskForm.site_id || null, assigned_to: taskForm.assigned_to || session?.id, created_by: session?.id });
    if (!res.ok) { setErr(res.error); return; }
    setTaskForm({ title: "", due_date: "", priority: "medium", site_id: "", assigned_to: "" }); setShowTask(false); setMsg("Task added.");
  }

  const CARDS = [
    ["📁 Total projects", totalReal, "All company projects", "all", "#2b6cb0"],
    ["🟢 Active", counts.active, "Running projects", "active", "var(--green)"],
    ["⏸ On hold", counts.on_hold, "On hold", "on_hold", "var(--amber)"],
    ["🔴 Delayed", counts.delayed, "Delayed projects", "delayed", "var(--red)"],
    ["✅ Completed", counts.completed, "Completed", "completed", "#2b6cb0"],
    ["📅 Upcoming", counts.upcoming, "Planned / upcoming", "upcoming", "#6b46c1"],
  ];
  const donutSegs = useMemo(() => {
    const parts = [["active", "var(--green)"], ["on_hold", "var(--amber)"], ["delayed", "var(--red)"], ["completed", "#2b6cb0"], ["upcoming", "#6b46c1"]];
    let acc = 0; const stops = [];
    parts.forEach(([k, c]) => { const pct = totalReal ? (counts[k] / totalReal) * 100 : 0; if (pct > 0) { stops.push(`${c} ${acc}% ${acc + pct}%`); acc += pct; } });
    return stops.length ? `conic-gradient(${stops.join(",")})` : "conic-gradient(#eee 0% 100%)";
  }, [counts, totalReal]);

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        {/* update235: consistent way back to the 4-card Director Home (no floating Back/✕) */}
        <a href="/home" style={{ fontSize: 12.5, color: "var(--copper)", fontWeight: 700, textDecoration: "none" }}>← Director Home</a>
        <style>{`.proj-card:hover { box-shadow: 0 6px 18px rgba(15,20,25,0.10); border-color: var(--copper) !important; }`}</style>
        <div className="page-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <div><h1>Project dashboard</h1><div className="muted" style={{ fontSize: 12.5 }}>Overview of all company projects and their progress</div></div>
          {isDirector && <div style={{ display: "flex", gap: 8 }}>
            <button className="primary" onClick={() => { setErr(""); setModal({ ...EMPTY }); }}>＋ New project</button>
            <button onClick={() => { setErr(""); setModal({ ...EMPTY, project_status: "idea" }); }}>💡 Project idea</button>
          </div>}
        </div>
        {isDemo && <div className="note amber">Demo mode.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && !modal && <div className="note red">{err}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
          {CARDS.map(([l, n, sub, t, c]) => (
            <div key={l} className="panel" role="button" tabIndex={0} onClick={() => setTab(t)}
              style={{ padding: "10px 14px", margin: 0, cursor: "pointer", outline: tab === t ? "2px solid " + c : "none" }}>
              <div className="muted" style={{ fontSize: 11.5 }}>{l}</div>
              <div style={{ fontWeight: 800, fontSize: 22, color: c }}>{n}</div>
              <div className="muted" style={{ fontSize: 10.5 }}>{sub} · <span style={{ color: "var(--copper)" }}>view →</span></div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 14 }}>
          <div className="panel" style={{ margin: 0 }}>
            <h2 style={{ fontSize: 15 }}>Projects overview</h2>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: 110, height: 110, borderRadius: "50%", background: donutSegs, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <b style={{ fontSize: 20 }}>{totalReal}</b><span className="muted" style={{ fontSize: 10 }}>Total</span>
                </div>
              </div>
              <div style={{ fontSize: 12.5, display: "grid", gap: 3 }}>
                {[["Active", counts.active, "var(--green)"], ["On hold", counts.on_hold, "var(--amber)"], ["Delayed", counts.delayed, "var(--red)"], ["Completed", counts.completed, "#2b6cb0"], ["Upcoming", counts.upcoming, "#6b46c1"]].map(([l, n, c]) => (
                  <div key={l}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: c, marginRight: 6 }} />{l} · <b>{n}</b>{totalReal ? ` (${Math.round(n / totalReal * 100)}%)` : ""}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="panel" style={{ margin: 0 }}>
            <h2 style={{ fontSize: 15 }}>Financial overview <span className="muted" style={{ fontSize: 11 }}>(all projects)</span></h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[["Contract value", fin.cv, null], ["Estimated cost", fin.ec, null], ["Invoiced (RA bills)", fin.inv, "#2b6cb0"], ["Balance to bill", Math.max(fin.cv - fin.inv, 0), "#6b46c1"]].map(([l, v, c]) => (
                <div key={l} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px" }}>
                  <div className="muted" style={{ fontSize: 11 }}>{l}</div><b style={{ fontSize: 15, color: c || "var(--text)" }}>{inr(v)}</b>
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>Invoiced comes from certified/submitted RA bills; detail on the Billing page.</div>
          </div>
          <div className="panel" style={{ margin: 0 }}>
            <h2 style={{ fontSize: 15 }}>Top projects by progress</h2>
            {top5.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>Add contract values to projects to see billing-based progress.</div> :
              top5.map(r => (
                <div key={r.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><Link href={"/projects/" + r.id}>{r.name}</Link><b>{r.progress}%</b></div>
                  <div style={{ height: 6, background: "#eee", borderRadius: 3 }}><div style={{ width: r.progress + "%", height: 6, borderRadius: 3, background: r.progress >= 60 ? "var(--green)" : r.progress >= 35 ? "var(--amber)" : "var(--red)" }} /></div>
                </div>
              ))}
          </div>
        </div>

        <div className="panel">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <h2 style={{ margin: 0, marginRight: 8 }}>{tab === "idea" ? "💡 Project ideas" : tab === "all" ? "All projects" : stMeta(tab)[1] + " projects"}</h2>
            {["all", ...PROJECT_STATUSES.map(s => s[0])].map(t => (
              <button key={t} style={{ fontSize: 12, background: tab === t ? "var(--copper)" : "#fff", color: tab === t ? "#fff" : "var(--text)" }} onClick={() => setTab(t)}>
                {t === "all" ? "All" : stMeta(t)[1]}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <input placeholder="🔎 Search project / client / location / manager…" value={q2} onChange={e => setQ2(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} title="Start date from" />
            <span className="muted" style={{ fontSize: 11 }}>to</span>
            <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} title="Start date to" />
            <select value={fClient} onChange={e => setFClient(e.target.value)}><option value="all">Client: all</option>{clients.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={fMgr} onChange={e => setFMgr(e.target.value)}><option value="all">Manager: all</option>{mgrs2.map(m2 => <option key={m2} value={m2}>{m2}</option>)}</select>
            <select value={fSt2} onChange={e => setFSt2(e.target.value)}><option value="all">Status: all</option>{PROJECT_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <button type="button" style={{ fontSize: 12 }} onClick={exportExcel}>⬇ Export Excel</button>
          </div>
          {!data ? <div className="muted">Loading…</div> : filtered.length === 0 ? <div className="muted">No projects match.{isDirector ? " Use ＋ New project." : ""}</div> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {filtered.map(r => { const [, sl, sc] = stMeta(r.status); return (
                <div key={r.id} className="panel proj-card" style={{ margin: 0, padding: "14px 14px 12px", borderRadius: 14, display: "flex", flexDirection: "column", gap: 6, transition: "box-shadow .15s, border-color .15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <Link href={"/projects/" + r.id} style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.25 }}>{r.name}</Link>
                    <span className="badge" style={{ background: sc + "18", color: sc, border: "1px solid " + sc, whiteSpace: "nowrap" }}>● {sl}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>Client: <b style={{ color: "var(--text)" }}>{r.client_name || "—"}</b></div>
                  <div className="muted" style={{ fontSize: 12 }}>Location: {r.address || "—"}</div>
                  {r.progress !== null ? (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}><span className="muted">Progress</span><b>{r.progress}%</b></div>
                      <div style={{ height: 7, background: "#eee", borderRadius: 4 }}><div style={{ width: r.progress + "%", height: 7, borderRadius: 4, background: "var(--copper)" }} /></div>
                    </div>
                  ) : <div className="muted" style={{ fontSize: 11.5 }}>{r.status === "upcoming" || r.status === "idea" ? "Expected: " + (r.expected_start || "TBD") : "Add contract value for progress"}</div>}
                  {r.manager && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--copper)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>{initials(r.manager)}</span>
                      <span>{r.manager} <span className="muted">· Project Manager</span></span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: "auto", paddingTop: 4 }}>
                    <Link href={"/projects/" + r.id} style={{ flex: 1 }}><button type="button" style={{ width: "100%", background: "#0F1419", color: "#fff", border: 0, borderRadius: 9, padding: "8px 0", fontWeight: 700, fontSize: 12.5 }}>👁 Open</button></Link>
                    {isDirector && <button type="button" title="Edit project" style={{ fontSize: 13, borderRadius: 9 }} onClick={() => { setErr(""); setModal({ id: r.id, ...r, manager_id: r.manager_id || "" }); }}>⋯</button>}
                  </div>
                </div>
              ); })}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <div className="panel" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15, margin: 0 }}>🗒 {isDirector ? "Tasks" : "My tasks"}</h2>
              <button style={{ fontSize: 12 }} onClick={() => setShowTask(x => !x)}>＋ Add</button>
            </div>
            {showTask && (
              <div style={{ display: "grid", gap: 6, margin: "8px 0", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                <input placeholder="Task *" value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <input type="date" value={taskForm.due_date} onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))} />
                  <select value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))}>
                    {["high", "medium", "low"].map(p => <option key={p} value={p}>{p}</option>)}</select>
                  <select value={taskForm.site_id} onChange={e => setTaskForm(f => ({ ...f, site_id: e.target.value }))}>
                    <option value="">No project</option>{all.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  {isDirector && <select value={taskForm.assigned_to} onChange={e => setTaskForm(f => ({ ...f, assigned_to: e.target.value }))}>
                    <option value="">Assign to me</option>{(data?.staff || []).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>}
                  <button className="primary" style={{ fontSize: 12 }} onClick={saveTask}>Save</button>
                </div>
              </div>
            )}
            {tasks.filter(t => !t.done).length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>No open tasks.</div> :
              tasks.filter(t => !t.done).slice(0, 8).map(t => (
                <label key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 12.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={false} onChange={() => toggleTask(t.id, true).then(() => setMsg("Task done ✓"))} />
                  <span style={{ flex: 1 }}>{t.title}{t.sites?.name ? <span className="muted"> — {t.sites.name}</span> : ""}{t.assignee?.full_name && isDirector ? <span className="muted"> · {t.assignee.full_name}</span> : ""}</span>
                  <span className={"badge " + (t.priority === "high" ? "red" : t.priority === "low" ? "gray" : "warn")}>{t.priority}</span>
                  {t.due_date && <span className="muted" style={{ fontSize: 11 }}>{t.due_date.slice(5)}</span>}
                </label>
              ))}
          </div>
          <div className="panel" style={{ margin: 0 }}>
            <h2 style={{ fontSize: 15 }}>📅 Upcoming reminders</h2>
            {tasks.filter(t => !t.done && t.due_date).length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>Add tasks with due dates — they appear here.</div> :
              tasks.filter(t => !t.done && t.due_date).slice(0, 8).map(t => (
                <div key={t.id} style={{ fontSize: 12.5, padding: "3px 0" }}>📌 {t.title}{t.sites?.name ? " — " + t.sites.name : ""} <b className="muted" style={{ fontSize: 11 }}>{t.due_date}</b></div>
              ))}
            <h2 style={{ fontSize: 15, marginTop: 12 }}>📅 Upcoming projects</h2>
            {by("upcoming").length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>None yet.</div> :
              by("upcoming").slice(0, 6).map(p => (
                <div key={p.id} style={{ fontSize: 12.5, padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
                  <Link href={"/projects/" + p.id}>{p.name}</Link><span className="muted">{p.client_name || ""} · {p.expected_start || "TBD"}</span>
                </div>
              ))}
          </div>
        </div>

        {modal && (
          <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 96, padding: 14 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 640, width: "100%", padding: 22, maxHeight: "92vh", overflowY: "auto" }}>
              <h2>{modal.id ? "✎ Edit project" : modal.project_status === "idea" ? "💡 New project idea" : "＋ New project"}</h2>
              {err && <div className="note red">{err}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
                <div><label className="muted">Project name *</label><input style={{ width: "100%" }} value={modal.name} onChange={e => setModal(m => ({ ...m, name: e.target.value }))} /></div>
                <div><label className="muted">Short code * (e.g. GIFT2)</label><input style={{ width: "100%" }} value={modal.code || ""} onChange={e => setModal(m => ({ ...m, code: e.target.value }))} disabled={!!modal.id} /></div>
                <div><label className="muted">Client name</label><input style={{ width: "100%" }} value={modal.client_name || ""} onChange={e => setModal(m => ({ ...m, client_name: e.target.value }))} /></div>
                <div><label className="muted">Client contact</label><input style={{ width: "100%" }} value={modal.client_contact || ""} onChange={e => setModal(m => ({ ...m, client_contact: e.target.value }))} /></div>
                <div><label className="muted">Location / address</label><input style={{ width: "100%" }} value={modal.address || ""} onChange={e => setModal(m => ({ ...m, address: e.target.value }))} /></div>
                <div><label className="muted">Project manager</label>
                  <select style={{ width: "100%" }} value={modal.manager_id || ""} onChange={e => setModal(m => ({ ...m, manager_id: e.target.value }))}>
                    <option value="">—</option>{(data?.staff || []).map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}</select></div>
                <div><label className="muted">Status</label>
                  <select style={{ width: "100%" }} value={modal.project_status} onChange={e => setModal(m => ({ ...m, project_status: e.target.value }))}>
                    {PROJECT_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className="muted">Priority</label>
                  <select style={{ width: "100%" }} value={modal.priority} onChange={e => setModal(m => ({ ...m, priority: e.target.value }))}>
                    {["high", "medium", "low"].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                <div><label className="muted">Start date</label><input type="date" style={{ width: "100%" }} value={modal.start_date || ""} onChange={e => setModal(m => ({ ...m, start_date: e.target.value }))} /></div>
                <div><label className="muted">Expected end</label><input type="date" style={{ width: "100%" }} value={modal.end_date || ""} onChange={e => setModal(m => ({ ...m, end_date: e.target.value }))} /></div>
                {["upcoming", "idea"].includes(modal.project_status) && (
                  <div><label className="muted">Expected start (upcoming)</label><input type="date" style={{ width: "100%" }} value={modal.expected_start || ""} onChange={e => setModal(m => ({ ...m, expected_start: e.target.value }))} /></div>)}
                <div><label className="muted">Contract value ₹</label><input inputMode="numeric" style={{ width: "100%" }} value={modal.contract_value || ""} onChange={e => setModal(m => ({ ...m, contract_value: e.target.value }))} /></div>
                <div><label className="muted">Estimated cost ₹</label><input inputMode="numeric" style={{ width: "100%" }} value={modal.estimated_cost || ""} onChange={e => setModal(m => ({ ...m, estimated_cost: e.target.value }))} /></div>
                <div><label className="muted">Tags (comma separated)</label><input style={{ width: "100%" }} value={modal.tags || ""} onChange={e => setModal(m => ({ ...m, tags: e.target.value }))} /></div>
                <div style={{ gridColumn: "1 / -1" }}><label className="muted">Description / scope / notes</label>
                  <textarea rows={3} style={{ width: "100%" }} value={modal.description || ""} onChange={e => setModal(m => ({ ...m, description: e.target.value }))} /></div>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                Upcoming / Idea / Completed projects stay OUT of attendance, stock and other operational dropdowns until set Active. Documents are uploaded from inside the project workspace. Geofence for a new site is set later in Site Master when work starts.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : modal.id ? "Save changes" : "Create project"}</button>
                <button onClick={() => setModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
