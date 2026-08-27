"use client";
// update203: PROJECT WORKSPACE — one project (= site), all modules connected.
// Opening it sets the session's current site so every module page lands on this project.
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { isDemo } from "@/lib/supabase";
import { getSession, setCurrentSite } from "@/lib/auth";
import { inr } from "@/lib/money";
import { getProjects, stMeta, getProjectDocs, uploadProjectDoc, projectDocUrl, deleteProjectDoc, getTasks, addTask, toggleTask } from "@/lib/projects";
import ProcureView from "@/components/ProcureView";

const MODULES = [   // update207: every module renders INSIDE this page as a tab (embedded view, ?site scoped)
  ["overview", "🏠", "Overview", null],
  ["attendance", "👷", "Attendance & Labour", "/attendance"],
  // update243: these two are rendered INLINE (see INLINE below) — no iframe, no shared page.
  ["procure", "🛒", "Procurement / Indents", null],
  ["po", "📄", "Purchase Orders", null],
  ["stock", "📦", "Stock", "/stock"],
  ["grn", "🧾", "GRN / Challan", "/stock/grn"],
  ["dpr", "📋", "DPR", "/dpr"],
  ["expenses", "💳", "Expenses & Money", "/expenses"],
  ["wages", "💰", "Salary / Wages", "/wages"],
  ["billing", "🧮", "Billing", "/billing"],
  ["assets", "🏗", "Assets", "/assets"],
  ["reports", "📊", "Reports", "/reports"],
  ["team", "👥", "Team & Access", "/workers"],
];

export default function ProjectWorkspace() {
  const { id } = useParams();
  const siteId = Number(id);
  const [session, setSession] = useState(null);
  const [p, setP] = useState(null); const [notFound, setNotFound] = useState(false);
  const [docs, setDocs] = useState([]); const [tasks, setTasks] = useState([]);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [taskTitle, setTaskTitle] = useState(""); const [taskDue, setTaskDue] = useState("");
  const fileRef = useRef(null); const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState("overview");
  const [visited, setVisited] = useState({ overview: true });   // iframes mount lazily, then stay mounted (no reload on tab switch)
  useEffect(() => { try { const t = new URLSearchParams(window.location.search).get("tab"); if (t && MODULES.some(m => m[0] === t)) { setTab(t); setVisited(v => ({ ...v, [t]: true })); } } catch {} }, []);
  const openTab = t => { setTab(t); setVisited(v => ({ ...v, [t]: true }));
    try { window.history.replaceState(null, "", "/projects/" + siteId + (t === "overview" ? "" : "?tab=" + t)); } catch {} };
  const isDirector = session?.role === "director";

  useEffect(() => {
    const s = getSession(); if (!s) { window.location.replace("/login"); return; }
    // staff may open only their assigned projects
    if (s.role !== "director" && !(s.sites || []).some(x => Number(x.id) === siteId)) { setNotFound(true); return; }
    setSession(s);
    setCurrentSite(siteId);   // modules opened from here default to this project
    getProjects().then(r => { const row = (r.rows || []).find(x => Number(x.id) === siteId); row ? setP(row) : setNotFound(true); });
    getProjectDocs(siteId).then(setDocs);
    getTasks({ siteId }).then(setTasks);
  }, [siteId]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(e) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true); setErr("");
    const r = await uploadProjectDoc(siteId, f, session?.id);
    setUploading(false); if (fileRef.current) fileRef.current.value = "";
    if (!r.ok) { setErr(r.error); return; }
    setMsg("Document uploaded."); getProjectDocs(siteId).then(setDocs);
  }
  async function saveTask() {
    const r = await addTask({ site_id: siteId, title: taskTitle, due_date: taskDue, created_by: session?.id, assigned_to: session?.id });
    if (!r.ok) { setErr(r.error); return; }
    setTaskTitle(""); setTaskDue(""); setMsg("Task added."); getTasks({ siteId }).then(setTasks);
  }

  if (notFound) return (<div className="layout"><Sidebar /><main className="main"><div className="note red">Project not found or not assigned to you.</div><Link href="/projects">← All projects</Link></main></div>);
  if (!p) return (<div className="layout"><Sidebar /><main className="main"><div className="muted">Loading project…</div></main></div>);
  const [, stLabel, stColor] = stMeta(p.status);

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <Link href="/projects" className="muted" style={{ fontSize: 12.5 }}>← All projects</Link>
        <div className="panel" style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ minWidth: 230 }}>
              <h1 style={{ margin: 0 }}>{p.name} <span className="badge" style={{ background: stColor + "22", color: stColor, border: "1px solid " + stColor, verticalAlign: "middle" }}>{stLabel}</span></h1>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                {p.client_name && <>Client: <b>{p.client_name}</b>{p.client_contact ? ` (${p.client_contact})` : ""} · </>}
                {p.manager && <>Manager: <b>{p.manager}</b> · </>}
                {p.address || ""}
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {p.start_date ? `Start ${p.start_date}` : p.expected_start ? `Expected start ${p.expected_start}` : ""}{p.end_date ? ` → ${p.end_date}` : ""}
                {p.priority && <> · Priority <b>{p.priority}</b></>}{p.tags ? <> · 🏷 {p.tags}</> : ""}
              </div>
              {p.description && <div style={{ fontSize: 13, marginTop: 6, maxWidth: 620 }}>{p.description}</div>}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[["Contract", p.contract_value], ["Est. cost", p.estimated_cost], ["Invoiced", p.invoiced], ["Progress", p.progress === null ? "—" : p.progress + "%"]].map(([l, v]) => (
                <div key={l} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                  <div className="muted" style={{ fontSize: 10.5 }}>{l}</div>
                  <b style={{ fontSize: 14 }}>{typeof v === "number" ? inr(v) : v || "—"}</b>
                </div>
              ))}
              {isDirector && <Link href="/projects"><button style={{ fontSize: 12 }}>✎ Edit on dashboard</button></Link>}
            </div>
          </div>
        </div>
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && <div className="note red">{err}</div>}

        <div style={{ display: "flex", gap: 2, flexWrap: "wrap", borderBottom: "2px solid var(--border)", margin: "4px 0 12px" }}>
          {MODULES.map(([key, ic, label]) => (
            <button key={key} type="button" onClick={() => openTab(key)}
              style={{ border: "none", background: "none", padding: "8px 10px", fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap",
                fontWeight: tab === key ? 800 : 500, color: tab === key ? "var(--copper)" : "var(--text)",
                borderBottom: tab === key ? "3px solid var(--copper)" : "3px solid transparent", marginBottom: -2 }}>
              {ic} {label}</button>
          ))}
        </div>
        <div className="muted no-print" style={{ fontSize: 11.5, marginBottom: 8 }}>
          Everything for <b>{p.name}</b> lives on this page — switching tabs never navigates away; each tab loads only this project's data (its own filters, search and exports work as usual, and the site dropdown inside can widen the view deliberately).
        </div>

        {/* update243: de-iframed tabs. The view component receives siteId as a PROP, so it
            cannot show another project's data, and `only` splits it to match the two tabs. */}
        {visited.procure && (
          <div style={{ display: tab === "procure" ? "block" : "none" }}>
            <ProcureView siteId={siteId} only="indents" showHead={false} />
          </div>
        )}
        {visited.po && (
          <div style={{ display: tab === "po" ? "block" : "none" }}>
            <ProcureView siteId={siteId} only="po" showHead={false} />
          </div>
        )}

        {MODULES.filter(m => m[3] && visited[m[0]]).map(([key, , label, href]) => (
          <div key={key} style={{ display: tab === key ? "block" : "none" }}>
            <iframe title={label} src={href + "?site=" + siteId + "&embed=1"}
              style={{ width: "100%", height: "calc(100vh - 230px)", minHeight: 480, border: "1px solid var(--border)", borderRadius: 12, background: "#fff" }} />
          </div>
        ))}

        <div style={{ display: tab === "overview" ? "block" : "none" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
          <div className="panel" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15, margin: 0 }}>📁 Documents ({docs.length})</h2>
              <label style={{ fontSize: 12, cursor: "pointer", color: "var(--copper)", fontWeight: 600 }}>
                {uploading ? "Uploading…" : "＋ Upload"}<input ref={fileRef} type="file" style={{ display: "none" }} onChange={upload} accept="image/*,.pdf,.xlsx,.xls,.docx,.doc,.dwg,.zip" />
              </label>
            </div>
            {docs.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>Drawings, work orders, agreements… upload anything for this project.</div> :
              docs.map(d => (
                <div key={d.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {d.name}</span>
                  <span className="muted" style={{ fontSize: 10.5 }}>{d.app_users?.full_name || ""} · {d.created_at?.slice(0, 10)}</span>
                  <a href={projectDocUrl(d.path)} target="_blank" rel="noreferrer"><button style={{ fontSize: 11 }}>⬇</button></a>
                  {isDirector && <button style={{ fontSize: 11, color: "var(--red)" }} onClick={async () => { if (!window.confirm("Delete " + d.name + "?")) return; await deleteProjectDoc(d.id); getProjectDocs(siteId).then(setDocs); }}>✕</button>}
                </div>
              ))}
          </div>
          <div className="panel" style={{ margin: 0 }}>
            <h2 style={{ fontSize: 15 }}>🗒 Tasks for this project</h2>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <input placeholder="Add a task…" style={{ flex: 1, minWidth: 140 }} value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
              <input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} />
              <button className="primary" style={{ fontSize: 12 }} onClick={saveTask}>Add</button>
            </div>
            {tasks.length === 0 ? <div className="muted" style={{ fontSize: 12.5 }}>No tasks yet.</div> :
              tasks.slice(0, 10).map(t => (
                <label key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, padding: "3px 0", cursor: "pointer", opacity: t.done ? 0.55 : 1 }}>
                  <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id, !t.done).then(() => getTasks({ siteId }).then(setTasks))} />
                  <span style={{ flex: 1, textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
                  {t.due_date && <span className="muted" style={{ fontSize: 11 }}>{t.due_date}</span>}
                </label>
              ))}
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
