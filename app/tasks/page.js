"use client";
// update219: TASKS — Director/IT create·assign·edit·delete; staff see and work only their
// own (RLS-enforced). One responsive card board serves desktop AND Android (no h-scroll);
// sections: Overdue / Today / Upcoming / Completed. Notifications ride the existing bell+push.
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { getSites } from "@/lib/data";
import { getTasks, createTask, editTask, deleteTask, setTaskStatus, uploadTaskFile, getTaskFiles, taskFileUrl, getStaffOptions, groupTasks, PRIORITY_META, TASK_ST } from "@/lib/tasks";

const emptyForm = { title: "", description: "", assigned_to: "", site_id: "", priority: "normal", due_at: "" };

export default function TasksPage() {
  const [session, setSession] = useState(null);
  const isAdmin = session && (session.role === "director" || session.role === "it_executive");
  const [rows, setRows] = useState(null); const [loadErr, setLoadErr] = useState("");
  const [staff, setStaff] = useState([]); const [sites, setSites] = useState([]);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [form, setForm] = useState(null);        // null | {id?, ...emptyForm}
  const [busy, setBusy] = useState(false);
  const [fWho, setFWho] = useState("all"); const [fSite, setFSite] = useState("all"); const [fPr, setFPr] = useState("all"); const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);        // task detail { ...t, files }
  const [remark, setRemark] = useState("");

  const load = () => getTasks().then(r => { if (r.error) { setLoadErr(r.error); setRows([]); } else setRows(r); });
  useEffect(() => {
    const s = getSession(); if (!s) { window.location.replace("/login"); return; }
    setSession(s); load(); getSites().then(setSites);
    getStaffOptions().then(setStaff);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => (rows || []).filter(t =>
    (fWho === "all" || String(t.assignee_id) === String(fWho)) &&
    (fSite === "all" || String(t.site_id) === String(fSite)) &&
    (fPr === "all" || t.priority === fPr) &&
    (!q || (t.title + " " + t.description + " " + t.assignee).toLowerCase().includes(q.toLowerCase()))
  ), [rows, fWho, fSite, fPr, q]);
  const grp = useMemo(() => groupTasks(shown), [shown]);

  async function save() {
    setBusy(true); setErr("");
    const res = form.id ? await editTask(form.id, form) : await createTask(form, session.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setForm(null); setMsg(form.id ? "Task updated — assignee notified." : "Task assigned — " + (staff.find(s2 => String(s2.id) === String(form.assigned_to))?.name || "") + " has been notified on phone + bell.");
    load();
  }
  async function move(t, status) {
    const res = await setTaskStatus(t.id, status, remark, session.full_name, t.title);
    if (!res.ok) { setErr(res.error); return; }
    setRemark(""); setOpen(null); setMsg(status === "completed" ? "Marked completed — assigner notified." : "Status updated."); load();
  }
  async function openTask(t) { setRemark(t.remarks || ""); setOpen({ ...t, files: await getTaskFiles(t.id) }); }
  async function attach(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !open) return;
    const res = await uploadTaskFile(open.id, f, session.id);
    if (!res.ok) { setErr(res.error); return; }
    setOpen(o => ({ ...o, files: [...o.files, { id: Date.now(), path: res.path }] }));
  }

  const dueBadge = t => {
    if (!t.due_at) return null;
    const od = new Date(t.due_at) < new Date() && t.status !== "completed";
    return <span style={{ fontSize: 11, color: od ? "var(--red)" : "var(--muted)", fontWeight: od ? 800 : 500 }}>⏰ {t.due}{od ? " · OVERDUE" : ""}</span>;
  };
  const Sec = null;   // (rule: no inline components — sections rendered via secBlock() calls)
  const secBlock = (key, icon, label, list, accent) => (
    <div key={key} style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 8px" }}>
        <b style={{ fontSize: 14 }}>{icon} {label}</b>
        <span className="badge" style={{ background: accent + "18", color: accent, border: "1px solid " + accent }}>{list.length}</span>
      </div>
      {list.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>Nothing here.</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {list.map(t => { const [pl, pc] = PRIORITY_META[t.priority] || PRIORITY_META.normal; const [sl, sc] = TASK_ST[t.status]; return (
            <div key={t.id} onClick={() => openTask(t)} className="panel" style={{ margin: 0, padding: 12, borderRadius: 12, borderLeft: "4px solid " + pc, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                <b style={{ fontSize: 13.5, lineHeight: 1.3 }}>{t.title}</b>
                <span className={"badge " + sc} style={{ flexShrink: 0 }}>{sl}</span>
              </div>
              {t.description && <div className="muted clamp2" title={t.description} style={{ fontSize: 12, marginTop: 3 }}>{t.description}</div>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11.5 }}><span className="avatar-chip" style={{ background: pc }}>{(t.assignee || "?").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase()}</span>{t.assignee}</span>
                {t.site && <span className="muted" style={{ fontSize: 11 }}>📍 {t.site}</span>}
                <span className="badge" style={{ fontSize: 10, color: pc, border: "1px solid " + pc, background: "transparent" }}>{pl}</span>
                {dueBadge(t)}
              </div>
            </div>
          ); })}
        </div>
      )}
    </div>
  );

  if (!session) return null;
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <div><h1>📋 Tasks</h1><div className="muted" style={{ fontSize: 12.5 }}>{isAdmin ? "Assign work, track progress — assignees are notified instantly (bell + phone)." : "Your assigned tasks — update status as you work; your Director is notified."}</div></div>
          {isAdmin && <button className="primary" onClick={() => { setErr(""); setForm({ ...emptyForm }); }}>＋ New task</button>}
        </div>
        {msg && <div className="note green">{msg}</div>}
        {err && !form && <div className="note red">{err}</div>}
        {loadErr && <div className="note red">{loadErr}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <input placeholder="🔎 Search tasks…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          {isAdmin && <select value={fWho} onChange={e => setFWho(e.target.value)}><option value="all">Assignee: all</option>{staff.map(s2 => <option key={s2.id} value={s2.id}>{s2.name}</option>)}</select>}
          <select value={fSite} onChange={e => setFSite(e.target.value)}><option value="all">Site: all</option>{sites.map(s2 => <option key={s2.id} value={s2.id}>{s2.name}</option>)}</select>
          <select value={fPr} onChange={e => setFPr(e.target.value)}><option value="all">Priority: all</option>{Object.entries(PRIORITY_META).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>

        {rows === null ? <div className="muted">Loading tasks…</div> : (<>
          {secBlock("od", "🔴", "Overdue", grp.overdue, "#b91c1c")}
          {secBlock("td", "📌", "Today", grp.today, "#e07020")}
          {secBlock("up", "🗓", "Upcoming", grp.upcoming, "#2b6cb0")}
          {secBlock("dn", "✅", "Completed", grp.done, "#15803d")}
        </>)}

        {/* create / edit (Director/IT) */}
        {form && (
          <div onClick={() => setForm(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 97, padding: 14 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 480, width: "100%", maxHeight: "92vh", overflowY: "auto", padding: 20 }}>
              <h2 style={{ marginTop: 0 }}>{form.id ? "✎ Edit task" : "＋ New task"}</h2>
              {err && <div className="note red">{err}</div>}
              <div style={{ display: "grid", gap: 10 }}>
                <div><label className="muted" style={{ fontSize: 11.5 }}>Title *</label><input style={{ width: "100%" }} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
                <div><label className="muted" style={{ fontSize: 11.5 }}>Description</label><textarea rows={3} style={{ width: "100%" }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 150 }}><label className="muted" style={{ fontSize: 11.5 }}>Assign to *</label>
                    <select style={{ width: "100%" }} value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                      <option value="">Select person…</option>{staff.map(s2 => <option key={s2.id} value={s2.id}>{s2.name} ({s2.role})</option>)}</select></div>
                  <div style={{ flex: 1, minWidth: 150 }}><label className="muted" style={{ fontSize: 11.5 }}>Site / project</label>
                    <select style={{ width: "100%" }} value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}>
                      <option value="">— none —</option>{sites.map(s2 => <option key={s2.id} value={s2.id}>{s2.name}</option>)}</select></div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div><label className="muted" style={{ fontSize: 11.5 }}>Priority</label><br />
                    <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>{Object.entries(PRIORITY_META).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div><label className="muted" style={{ fontSize: 11.5 }}>Due date &amp; time</label><br />
                    <input type="datetime-local" value={form.due_at} onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))} /></div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : form.id ? "Save changes" : "Assign task"}</button>
                <button onClick={() => setForm(null)}>Cancel</button>
                {form.id && <button style={{ marginLeft: "auto", color: "var(--red)" }} onClick={async () => { if (!confirm("Delete this task?")) return; const r = await deleteTask(form.id); if (!r.ok) { setErr(r.error); return; } setForm(null); setMsg("Task deleted."); load(); }}>🗑 Delete</button>}
              </div>
            </div>
          </div>
        )}

        {/* task detail — status, remarks, attachments */}
        {open && (
          <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 96, padding: 14 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 520, width: "100%", maxHeight: "92vh", overflowY: "auto", padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 17 }}>{open.title}</h2>
                <button onClick={() => setOpen(null)}>✕</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", margin: "8px 0", fontSize: 12.5 }}>
                <span className={"badge " + TASK_ST[open.status][1]}>{TASK_ST[open.status][0]}</span>
                <span className="badge" style={{ color: PRIORITY_META[open.priority][1], border: "1px solid currentColor", background: "transparent" }}>{PRIORITY_META[open.priority][0]}</span>
                {open.site && <span className="muted">📍 {open.site}</span>}
                {dueBadge(open)}
              </div>
              <div style={{ fontSize: 13 }}>{open.description || <span className="muted">No description.</span>}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Assigned to <b style={{ color: "var(--text)" }}>{open.assignee}</b> by {open.assigner} · {open.created_at?.slice(0, 10)}{open.completed_at ? " · completed " + open.completed_at.slice(0, 10) : ""}</div>

              <div style={{ marginTop: 12 }}>
                <label className="muted" style={{ fontSize: 11.5 }}>Remarks</label>
                <textarea rows={2} style={{ width: "100%" }} value={remark} onChange={e => setRemark(e.target.value)} placeholder="Progress note / remark…" />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {(open.files || []).map(f => <a key={f.id} href={taskFileUrl(f.path)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>📎 attachment</a>)}
                <label style={{ fontSize: 12, cursor: "pointer", color: "var(--copper)", fontWeight: 700 }}>＋ attach file<input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={attach} /></label>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                {open.status === "pending" && <button className="primary" onClick={() => move(open, "in_progress")}>▶ Start task</button>}
                {open.status === "in_progress" && <button className="primary" onClick={() => move(open, "completed")}>✅ Mark completed</button>}
                {open.status === "pending" && <button onClick={() => move(open, "completed")}>✅ Complete directly</button>}
                {open.status === "completed" && (open.assignee_id === session.id || isAdmin) && <button onClick={() => move(open, "pending")}>↺ Reopen</button>}
                {(remark !== (open.remarks || "")) && <button onClick={() => move(open, open.status)}>💾 Save remark</button>}
                {isAdmin && <button style={{ marginLeft: "auto" }} onClick={() => { setOpen(null); setErr(""); setForm({ id: open.id, title: open.title, description: open.description, assigned_to: String(open.assignee_id), site_id: open.site_id || "", priority: open.priority, due_at: open.due_at ? open.due_at.slice(0, 16) : "" }); }}>✎ Edit / delete</button>}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
