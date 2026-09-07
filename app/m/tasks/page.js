"use client";
// update327: 📋 My Tasks on mobile — the assignee-side screen that never existed.
// Cards show task name, assigned by, assigned date, due date, priority, status;
// ▶ Start / ✅ Complete act through the same definer fn as web. RLS already scopes
// the list to the signed-in user (admins see all) — nobody sees anyone else's tasks.
import { useEffect, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { getSession } from "@/lib/auth";
import { getTasks, setTaskStatus } from "@/lib/tasks";

const PRI = { high: ["🔴 High", "#b3261e"], normal: ["🟠 Normal", "#8a5a00"], low: ["🟢 Low", "#0e7a3d"] };
const ST = { pending: ["Pending", "#8a5a00", "#fff7e6"], in_progress: ["▶ In progress", "#0b5cad", "#e8f1fb"], completed: ["✅ Completed", "#0e7a3d", "#e9f7ee"] };
const d10 = s => (s || "").slice(0, 10);
const niceDT = s => { if (!s) return "—"; const t = new Date(s); return t.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " " + t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }); };

export default function MTasks() {
  const [sess, setSess] = useState(null);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("open");           // open | done
  const [busyId, setBusyId] = useState(0);

  const load = () => getTasks().then(r => { if (r?.error) { setErr(r.error); setRows([]); } else { setErr(""); setRows(r || []); } });
  useEffect(() => { setSess(getSession()); load(); }, []);

  const mine = (rows || []);
  const open = mine.filter(t => t.status !== "completed");
  const done = mine.filter(t => t.status === "completed");
  const list = tab === "open" ? open : done;
  const today = new Date().toISOString().slice(0, 10);

  async function act(t, status) {
    let remarks = null;
    if (status === "completed") { remarks = prompt("Any remarks for the assigner? (optional)") || null; }
    setBusyId(t.id);
    const r = await setTaskStatus(t.id, status, remarks, sess?.full_name || sess?.name, t.title);
    setBusyId(0);
    if (!r.ok) { alert(r.error || "Failed."); return; }
    load();
  }

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div><div className="title">📋 My Tasks</div><div className="sub">Assigned to you — with due dates &amp; priority</div></div>
      </div>
      <div className="m-body">
        {err && <div className="note red">{err}</div>}
        <div style={{ display: "flex", gap: 8, margin: "4px 0 10px" }}>
          <button className={tab === "open" ? "primary" : ""} style={{ borderRadius: 999, fontSize: 12.5 }} onClick={() => setTab("open")}>To do ({open.length})</button>
          <button className={tab === "done" ? "primary" : ""} style={{ borderRadius: 999, fontSize: 12.5 }} onClick={() => setTab("done")}>Completed ({done.length})</button>
        </div>
        {rows === null && <div className="muted">Loading…</div>}
        {rows !== null && !list.length && (
          <div className="note" style={{ textAlign: "center", padding: 22 }}>
            {tab === "open" ? "🎉 Nothing pending — new assignments appear here the moment they're made." : "No completed tasks yet."}
          </div>
        )}
        {list.map(t => {
          const overdue = t.status !== "completed" && t.due_at && d10(t.due_at) < today;
          const pri = PRI[t.priority] || PRI.normal;
          const st = ST[t.status] || ST.pending;
          return (
            <div key={t.id} className="card" style={{ padding: 12, marginBottom: 10, borderLeft: overdue ? "4px solid #b3261e" : "4px solid var(--copper)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.25 }}>{t.title}</div>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: st[1], background: st[2], borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>{st[0]}</span>
              </div>
              {t.description && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t.description}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", marginTop: 8, fontSize: 11.5 }}>
                <div><span className="muted">Assigned by</span><br /><b>{t.assigner || "—"}</b></div>
                <div><span className="muted">Assigned on</span><br /><b>{niceDT(t.created_at)}</b></div>
                <div><span className="muted">Due</span><br /><b style={{ color: overdue ? "#b3261e" : undefined }}>{niceDT(t.due_at)}{overdue ? " · OVERDUE" : ""}</b></div>
                <div><span className="muted">Priority</span><br /><b style={{ color: pri[1] }}>{pri[0]}</b></div>
              </div>
              {t.site && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>📍 {t.site}</div>}
              {t.remarks && <div style={{ fontSize: 11.5, marginTop: 6, background: "#f6f6f2", borderRadius: 8, padding: "6px 9px" }}>💬 {t.remarks}</div>}
              {t.status !== "completed" && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {t.status === "pending" && <button disabled={busyId === t.id} onClick={() => act(t, "in_progress")} style={{ fontSize: 12.5 }}>▶ Start</button>}
                  <button className="primary" disabled={busyId === t.id} onClick={() => act(t, "completed")} style={{ fontSize: 12.5 }}>{busyId === t.id ? "Saving…" : "✅ Mark complete"}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <MobileNav />
    </div>
  );
}
