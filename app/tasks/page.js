"use client";
// update219: TASKS — Director/IT create·assign·edit·delete; staff see and work only their
// own (RLS-enforced). One responsive card board serves desktop AND Android (no h-scroll);
// sections: Overdue / Today / Upcoming / Completed. Notifications ride the existing bell+push.
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { getSites } from "@/lib/data";
import { getTasks, createTask, editTask, deleteTask, setTaskStatus, uploadTaskFile, getTaskFiles, taskFileUrl, getStaffOptions, groupTasks, PRIORITY_META, TASK_ST, getSiteStaff, assignTaskBulk } from "@/lib/tasks";
import { getAttendance, getWorkers } from "@/lib/data";
import { getDigest } from "@/lib/dpr";
import { getChallanPOs } from "@/lib/challan";
import { getPettyRequestQueue, getAdvanceQueue, getExpenseClaimQueue } from "@/lib/money";
import { getPOs, getOpenIndents } from "@/lib/procure";
import { getMyNotifications } from "@/lib/notify";
import { todayLocal } from "@/lib/today";

const emptyForm = { title: "", description: "", assigned_to: "", site_id: "", priority: "normal", due_at: "" };
const ago = t => { const m = Math.floor((Date.now() - new Date(t)) / 60000); return m < 1 ? "now" : m < 60 ? m + "m ago" : m < 1440 ? Math.floor(m / 60) + "h ago" : Math.floor(m / 1440) + "d ago"; };
const dueTag = (h, mn = 0) => { const d = new Date(); d.setHours(h, mn, 0, 0); const diff = (d - Date.now()) / 60000;
  return diff < 0 ? ["Overdue", "var(--red)"] : diff < 120 ? ["Due soon", "var(--amber)"] : ["Pending", "var(--amber)"]; };
const fmtDue = h => (h % 12 || 12) + ":00 " + (h < 12 ? "AM" : "PM");

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
  // ---- update220: rich dashboard state ----
  const [view, setView] = useState("dash");      // dash | list
  const [att, setAtt] = useState(null); const [workers, setWorkers] = useState(null);
  const [digest, setDigest] = useState(null); const [cpos, setCpos] = useState([]);
  const [pettyQ, setPettyQ] = useState([]); const [advQ, setAdvQ] = useState([]); const [claimsQ, setClaimsQ] = useState([]);
  const [poList, setPoList] = useState([]); const [indents, setIndents] = useState([]);
  const [notifs, setNotifs] = useState([]);
  // assign modal (mock): person / whole site / multiple sites
  const [assign, setAssign] = useState(null);    // { mode, person, siteIds:[], title, due_date, due_time, repeat, priority }
  const [recip, setRecip] = useState([]);        // live recipient preview

  const load = () => getTasks().then(r => { if (r.error) { setLoadErr(r.error); setRows([]); } else setRows(r); });
  useEffect(() => {
    const s = getSession(); if (!s) { window.location.replace("/login"); return; }
    setSession(s); load(); getSites().then(setSites);
    getStaffOptions().then(setStaff);
    getAttendance(todayLocal(), "all").then(r => setAtt(r?.rows || [])).catch(() => setAtt([]));
    getWorkers().then(w => setWorkers(Array.isArray(w) ? w : w?.rows || [])).catch(() => setWorkers([]));
    getDigest(todayLocal()).then(setDigest).catch(() => setDigest([]));
    getChallanPOs().then(setCpos).catch(() => {});
    getPettyRequestQueue().then(setPettyQ).catch(() => {});
    getAdvanceQueue().then(r => setAdvQ(r || [])).catch(() => {});
    getExpenseClaimQueue().then(r => setClaimsQ(r || [])).catch(() => {});
    getPOs("all").then(r => setPoList(r || [])).catch(() => {});
    getOpenIndents("all").then(r => setIndents(r || [])).catch(() => {});
    getMyNotifications(6).then(r => setNotifs(r?.rows || [])).catch(() => {});
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
  // ================= update220: dashboard model (ALL live data, nothing stored) =================
  const curSite = session?.current_site_id || session?.site_id;
  const isAdminish = session && ["director", "it_executive", "accountant", "ho_admin"].includes(session.role);
  const siteName = id => sites.find(s2 => String(s2.id) === String(id))?.name || "";
  const attFor = sid => (att || []).filter(r => String(r.site_id) === String(sid));
  const wFor = sid => (workers || []).filter(w => String(w.site_id) === String(sid));
  const stats = useMemo(() => {
    const rowsA = isAdminish ? (att || []) : attFor(curSite);
    const tot = isAdminish ? (workers || []).length : wFor(curSite).length;
    const present = rowsA.filter(r => r.punch_in || r.status === "present" || r.status === "half_day").length;
    const marked = rowsA.length;
    return { total: tot, present, absent: Math.max(marked - present, 0), np: Math.max(tot - marked, 0) };
  }, [att, workers, curSite, isAdminish]);   // eslint-disable-line react-hooks/exhaustive-deps

  const dprFiled = useMemo(() => new Set((digest || []).map(d => d.site)), [digest]);
  const otPend = sid => attFor(sid).filter(r => Number(r.ot_hours) > 0 && !r.ot_approved);
  const grnPend = sid => cpos.filter(p2 => String(p2.site_id) === String(sid) && p2.pending_items > 0);
  const unver = (att || []).filter(r => r.verify_status && r.verify_status !== "verified").length;
  const proxyToday = (att || []).filter(r => r.punch_type === "proxy").length;
  const agedInd = indents.filter(i => i.created_at ? (Date.now() - new Date(i.created_at)) / 86400000 >= 3 : false).length || indents.length;
  const apprC = { petty: pettyQ.filter(r => r.status === "pending").length, claims: claimsQ.filter(r => r.status === "pending" || r.status === "queried").length,
    adv: advQ.filter(r => r.status === "pending").length, ind: indents.length, po: poList.filter(p2 => p2.approval === "pending" && p2.status !== "cancelled").length };
  const dprMissing = sites.filter(s2 => s2.is_active !== false && !dprFiled.has(s2.name));

  // auto-generated daily tasks per role — status = live state of the underlying work
  const autoTasks = useMemo(() => {
    if (!session) return [];
    const out = [];
    const push = (o) => out.push(o);
    const isMon = new Date().getDay() === 1;
    if (!isAdminish) {
      const sid = curSite; const a = attFor(sid); const p = a.filter(r => r.punch_in || r.status === "present" || r.status === "half_day").length;
      const wtot = wFor(sid).length; const ot = otPend(sid); const g = grnPend(sid);
      push({ ic: "🧑‍🤝‍🧑", name: "Attendance Check", tag: "Morning", desc: "Verify today's punch-ins before 11:00 AM", role: "SITE SUPERVISOR",
        stats: [["Present", p], ["Absent", Math.max(a.length - p, 0)], ["Not punched", Math.max(wtot - a.length, 0)], ["Total", wtot]],
        done: a.length > 0 && a.length >= wtot, dueH: 11, act: ["Check Attendance", "/attendance", "#0F1419"] });
      push({ ic: "📝", name: "DPR Submission", tag: "Evening", desc: "Submit today's Daily Progress Report", role: "SITE SUPERVISOR",
        stats: [["Filed today", dprFiled.has(siteName(sid)) ? "Yes" : "No"]], done: dprFiled.has(siteName(sid)), dueH: 19, act: ["Submit DPR", "/m/dpr", "var(--copper)"] });
      push({ ic: "📦", name: "GRN Pending", tag: "Material", desc: "Create GRN for received materials", role: "SITE SUPERVISOR",
        stats: [["Pending PO", g.length], ["Items", g.reduce((t, x) => t + x.pending_items, 0)]], done: g.length === 0, dueH: 18, act: ["Create GRN", "/stock/grn", "#6b46c1"] });
      push({ ic: "⏱", name: "OT Entry / Approval", tag: "After shift", desc: "Review and approve worker overtime", role: "SITE SUPERVISOR",
        stats: [["OT pending", ot.length], ["Hours", ot.reduce((t, r) => t + Number(r.ot_hours || 0), 0).toFixed(1)]], done: ot.length === 0, dueH: 21, act: ["Review OT", "/attendance", "var(--red)"] });
      if (isMon) push({ ic: "📒", name: "Muster Roll Check", tag: "Weekly", desc: "Verify muster roll matches the attendance register", role: "SITE SUPERVISOR",
        stats: [["Unverified", attFor(sid).filter(r => r.verify_status && r.verify_status !== "verified").length]], done: false, dueH: 17, act: ["Review Muster", "/m/muster", "#7f1d1d"] });
    }
    if (isAdminish) {
      push({ ic: "🗂", name: "Indent Approval Check", tag: "Daily", desc: "Review indents pending 3+ days across sites", role: "IT / ACCOUNTS",
        stats: [["Aged 3d+", agedInd]], done: agedInd === 0, dueH: 18, act: ["Review Indents", "/procure", "#0e7490"] });
      push({ ic: "🛡", name: "Cross-site Attendance Verify", tag: "Daily", desc: "Verify proxy punches & unverified attendance", role: "IT / ACCOUNTS",
        stats: [["Proxy", proxyToday], ["Unverified", unver]], done: unver === 0, dueH: 20, act: ["Verify Now", "/attendance", "#0F1419"] });
      push({ ic: "🔁", name: "GRN Reconciliation", tag: "Daily", desc: "Cross-check GRNs vs POs & delivery challans", role: "IT / ACCOUNTS",
        stats: [["POs w/ pending qty", cpos.filter(p2 => p2.pending_items > 0).length]], done: false, dueH: 19, act: ["Open Challans", "/stock/challans", "#6b46c1"] });
      push({ ic: "✅", name: "Pending Approvals Sweep", tag: "Daily", desc: "Petty cash · Expenses · Advances · PO drafts", role: "IT / ACCOUNTS",
        stats: [["Petty", apprC.petty], ["Claims", apprC.claims], ["Adv", apprC.adv], ["PO", apprC.po]],
        done: apprC.petty + apprC.claims + apprC.adv + apprC.po === 0, dueH: 18, act: ["View Approvals", "/m/approvals", "var(--green)"] });
      push({ ic: "📋", name: "Site Reports Follow-up", tag: "Daily", desc: "Sites with DPR not filed · aged indents", role: "IT / ACCOUNTS",
        stats: [["DPR missing", dprMissing.length], ["Aged indents", agedInd]], done: dprMissing.length === 0, dueH: 19, mn: 30, act: ["View Reports", "/dpr", "var(--copper)"] });
    }
    return out;
  }, [session, att, workers, digest, cpos, indents, pettyQ, advQ, claimsQ, poList, sites, curSite]);   // eslint-disable-line react-hooks/exhaustive-deps
  const assignedToday = useMemo(() => grp.today.concat(grp.overdue), [grp]);
  const pendCount = autoTasks.filter(t => !t.done).length + assignedToday.filter(t => t.status !== "completed").length;

  // ---- assign modal helpers ----
  const blankAssign = { mode: "site", person: "", siteIds: [], title: "", due_date: todayLocal(), due_time: "18:00", repeat: "none", priority: "normal" };
  useEffect(() => {
    if (!assign) return;
    if (assign.mode === "person") { setRecip(assign.person ? [Number(assign.person)] : []); return; }
    const ids = assign.mode === "site" ? assign.siteIds.slice(0, 1) : assign.siteIds;
    if (!ids.length) { setRecip([]); return; }
    getSiteStaff(ids).then(list => setRecip(list.map(x => x.id)));
  }, [assign?.mode, assign?.person, JSON.stringify(assign?.siteIds)]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function doAssign() {
    setBusy(true); setErr("");
    const due_at = assign.due_date + "T" + (assign.due_time || "18:00");
    const base = { title: assign.title, description: "", priority: assign.priority, due_at, repeat: assign.repeat,
      site_id: assign.mode !== "person" && assign.siteIds.length === 1 ? Number(assign.siteIds[0]) : null };
    let res;
    if (assign.mode === "person") res = await createTask({ ...base, assigned_to: assign.person }, session.id);
    else res = await assignTaskBulk(base, recip, session.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setAssign(null); setMsg("Task assigned to " + (assign.mode === "person" ? "1 person" : recip.length + " people") + " — notified on bell + phone."); load();
  }

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
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 16, padding: "18px 18px 16px", marginBottom: 12,
            background: "linear-gradient(115deg, #1a2450 0%, #232f6b 55%, #2b3a86 100%)", color: "#fff", boxShadow: "0 8px 24px rgba(26,36,80,0.35)" }}>
          <div style={{ position: "absolute", right: -50, top: -60, width: 190, height: 190, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", position: "relative" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{new Date().getHours() < 12 ? "Good Morning" : new Date().getHours() < 17 ? "Good Afternoon" : "Good Evening"}, {(session?.full_name || "").split(" ")[0]}! 🤟</div>
              <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 3 }}>{isAdmin ? "Director view — assign tasks to any site or person, and track today's auto-generated tasks across your whole company." : "Here's what needs your attention today — auto-generated daily tasks + anything assigned to you."}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button type="button" onClick={() => setView(v => v === "dash" ? "list" : "dash")}
                style={{ background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                {view === "dash" ? "☰ List view" : "🏠 Dashboard"}</button>
              {isAdmin && <button type="button" onClick={() => { setErr(""); setAssign({ mode: "site", person: "", siteIds: curSite ? [Number(curSite)] : [], title: "", due_date: todayLocal(), due_time: "18:00", repeat: "none", priority: "normal" }); }}
                style={{ background: "linear-gradient(135deg, #ff8a2a, #e06510)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(224,101,16,0.5)" }}>
                ＋ Assign Task</button>}
            </div>
          </div>
        </div>
        {msg && <div className="note green">{msg}</div>}
        {err && !form && <div className="note red">{err}</div>}
        {loadErr && <div className="note red">{loadErr}</div>}

        {view === "list" && <><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
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
        </>)}</>}

        {view === "dash" && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
            {[["Total Workers", stats.total, null, "/workers"], ["Present", stats.present, "var(--green)", "/attendance"],
              ["Absent", stats.absent, "var(--red)", "/attendance"], ["Not Punched", stats.np, "var(--amber)", "/attendance"]].map(([l, v, c, href]) => (
              <div key={l} className="panel" style={{ margin: 0, padding: "12px 14px", cursor: "pointer" }} onClick={() => window.location.assign(href)}>
                <div className="muted" style={{ fontSize: 11.5 }}>{l}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c || "var(--text)" }}>{att === null || workers === null ? "…" : v}
                  {stats.total > 0 && l !== "Total Workers" && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 5, color: c }}>{Math.round(v / stats.total * 1000) / 10}%</span>}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(250px, 1fr)", gap: 12, alignItems: "start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <b style={{ fontSize: 15 }}>Today&apos;s Tasks</b>
                {pendCount > 0 && <span className="badge red">{pendCount} Pending</span>}
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {autoTasks.map((t, i) => { const dt = t.done ? ["Done", "var(--green)"] : dueTag(t.dueH, t.mn || 0); return (
                  <div key={i} className="panel" style={{ margin: 0, padding: 14, borderRadius: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 22, width: 40, height: 40, borderRadius: 12, background: "#faf6f1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{t.ic}</div>
                    <div style={{ flex: 1, minWidth: 170 }}>
                      <b style={{ fontSize: 13.5 }}>{i + 1}. {t.name}</b> <span className="badge gray" style={{ fontSize: 9.5 }}>{t.tag}</span>
                      <div className="muted" style={{ fontSize: 11.5 }}>{t.desc}</div>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--copper)", marginTop: 2 }}>FOR: {t.role}</div>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
                      {t.stats.map(([l2, v2]) => <div key={l2} style={{ textAlign: "center" }}><div className="muted" style={{ fontSize: 9.5 }}>{l2}</div><b style={{ fontSize: 14 }}>{v2}</b></div>)}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <span className="badge" style={{ color: dt[1], border: "1px solid " + dt[1], background: "transparent", fontWeight: 800 }}>{t.done ? "✓ Done" : dt[0]}</span>
                      <div className="muted" style={{ fontSize: 10 }}>{t.done ? "" : "Due " + fmtDue(t.dueH)}</div>
                      {!t.done && <a href={t.act[1]}><button type="button" style={{ marginTop: 4, background: t.act[2], color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{t.act[0]}</button></a>}
                    </div>
                  </div>
                ); })}
                {assignedToday.map(t => { const pm = PRIORITY_META[t.priority] || PRIORITY_META.normal; const st2 = TASK_ST[t.status]; return (
                  <div key={"a" + t.id} onClick={() => openTask(t)} className="panel" style={{ margin: 0, padding: 14, borderRadius: 14, borderLeft: "4px solid " + pm[1], cursor: "pointer", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 170 }}>
                      <b style={{ fontSize: 13.5 }}>{t.title}</b> <span className="badge" style={{ fontSize: 9.5, color: pm[1], border: "1px solid " + pm[1], background: "transparent" }}>{pm[0]}</span>
                      {t.description && <div className="muted clamp2" style={{ fontSize: 11.5 }}>{t.description}</div>}
                      <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>Assigned{isAdmin ? " to " + t.assignee : ""}{t.site ? " · 📍 " + t.site : ""}</div>
                    </div>
                    <span className={"badge " + st2[1]}>{st2[0]}</span>
                  </div>
                ); })}
                {autoTasks.length + assignedToday.length === 0 && <div className="muted">Nothing due today. 🎉</div>}
              </div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <div className="panel" style={{ margin: 0, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontSize: 13.5 }}>🪙 Pending Approvals</b>
                  <span className="badge red">{apprC.petty + apprC.claims + apprC.adv + apprC.ind + apprC.po}</span></div>
                {[["Petty Cash Requests", apprC.petty], ["Expense Claims", apprC.claims], ["Advance Requests", apprC.adv], ["Indent Approvals", apprC.ind], ["PO Draft Approvals", apprC.po]].map(([l2, n2]) => (
                  <div key={l2} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginTop: 6 }}><span>{l2}</span><b>{n2}</b></div>))}
                <a href="/m/approvals" style={{ fontSize: 12, color: "var(--copper)", fontWeight: 700 }}>View All Approvals →</a>
              </div>
              <div className="panel" style={{ margin: 0, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontSize: 13.5 }}>📋 Site Reports</b><span className="badge red">{dprMissing.length + agedInd}</span></div>
                {[["DPR Not Filed", dprMissing.length + " sites"], ["Indents Open", indents.length], ["Attendance Unverified", unver + " records"], ["Proxy Punch", proxyToday + " today"]].map(([l2, v2]) => (
                  <div key={l2} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginTop: 6 }}><span>{l2}</span><b>{v2}</b></div>))}
                <a href="/dpr" style={{ fontSize: 12, color: "var(--copper)", fontWeight: 700 }}>View All Reports →</a>
              </div>
              <div className="panel" style={{ margin: 0, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontSize: 13.5 }}>🔔 Notification Center</b><a href="/notices" style={{ fontSize: 11.5 }}>View All</a></div>
                {notifs.slice(0, 4).map(n2 => (
                  <div key={n2.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, marginTop: 7 }}>
                    <span className="clamp2" style={{ flex: 1 }}>{n2.title}{n2.body ? " — " + n2.body : ""}</span>
                    <span className="muted" style={{ flexShrink: 0, fontSize: 10.5 }}>{ago(n2.created_at)}</span></div>))}
                {notifs.length === 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>No notifications.</div>}
              </div>
            </div>
          </div>
          <div className="panel" style={{ marginTop: 12, padding: 14 }}>
            <b style={{ fontSize: 14 }}>All Sites Overview</b>
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table className="dt-compact" style={{ width: "100%" }}>
                <thead><tr><th>Site Name</th><th>Attendance</th><th>DPR</th><th>OT Pending</th><th>GRN</th><th>Overall</th></tr></thead>
                <tbody>
                  {sites.filter(s2 => s2.is_active !== false).map(s2 => {
                    const a = attFor(s2.id); const dprOk = dprFiled.has(s2.name); const ot = otPend(s2.id).length; const g = grnPend(s2.id).length;
                    const late = new Date().getHours() >= 19;
                    const overall = ((!dprOk && late) || (a.length === 0 && new Date().getHours() >= 12)) ? ["Attention", "var(--red)"] : (!dprOk || ot > 0 || g > 0) ? ["Due Soon", "var(--amber)"] : ["Good", "var(--green)"];
                    return (
                      <tr key={s2.id}>
                        <td style={{ fontWeight: 600 }}>{s2.name}</td>
                        <td>{a.length > 0 ? <span style={{ color: "var(--green)" }}>✓ {a.length} marked</span> : <span style={{ color: "var(--amber)" }}>● Pending</span>}</td>
                        <td>{dprOk ? <span style={{ color: "var(--green)" }}>✓ Filed</span> : <span style={{ color: late ? "var(--red)" : "var(--amber)" }}>{late ? "● Overdue" : "● Pending"}</span>}</td>
                        <td>{ot > 0 ? <span style={{ color: "var(--amber)" }}>{ot} pending</span> : <span style={{ color: "var(--green)" }}>✓ Clear</span>}</td>
                        <td>{g > 0 ? <span style={{ color: "var(--amber)" }}>{g} pending</span> : <span style={{ color: "var(--green)" }}>✓ Clear</span>}</td>
                        <td><span className="badge" style={{ color: overall[1], border: "1px solid " + overall[1], background: "transparent", fontWeight: 800 }}>{overall[0]}</span></td>
                      </tr>
                    ); })}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>Live from today&apos;s attendance, DPR digest, OT queue and open-PO pending quantities.</div>
          </div>
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
        {assign && (
          <div onClick={() => setAssign(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 97, padding: 14 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "92vh", overflowY: "auto" }}>
              <div style={{ background: "linear-gradient(115deg, #1a2450, #2b3a86)", color: "#fff", padding: "14px 18px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><b style={{ fontSize: 15 }}>📋 Assign a new task</b><div style={{ fontSize: 11, opacity: 0.8 }}>Sends instantly via bell + phone notification</div></div>
                <button type="button" onClick={() => setAssign(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 17, cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ padding: 18 }}>
                {err && <div className="note red">{err}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {[["person", "👤", "Specific person"], ["site", "🏗", "Whole site"], ["multi", "🏢", "Multiple sites"]].map(([m2, ic2, l2]) => (
                    <button key={m2} type="button" onClick={() => setAssign(a2 => ({ ...a2, mode: m2, siteIds: m2 === "site" ? a2.siteIds.slice(0, 1) : a2.siteIds }))}
                      style={{ border: assign.mode === m2 ? "2px solid var(--copper)" : "1px solid var(--border)", background: assign.mode === m2 ? "#fff8f2" : "#fff", borderRadius: 12, padding: "10px 4px", fontSize: 12, fontWeight: assign.mode === m2 ? 800 : 600, color: assign.mode === m2 ? "var(--copper)" : "var(--text)", cursor: "pointer" }}>
                      <div style={{ fontSize: 16 }}>{ic2}</div>{l2}</button>
                  ))}
                </div>
                {assign.mode === "person" ? (
                  <div style={{ marginTop: 12 }}>
                    <label className="muted" style={{ fontSize: 11 }}>ASSIGN TO</label><br />
                    <select style={{ width: "100%" }} value={assign.person} onChange={e => setAssign(a2 => ({ ...a2, person: e.target.value }))}>
                      <option value="">Select person…</option>{staff.map(s2 => <option key={s2.id} value={s2.id}>{s2.name}</option>)}</select>
                  </div>
                ) : (
                  <div style={{ marginTop: 12 }}>
                    <label className="muted" style={{ fontSize: 11 }}>SITE(S)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                      {sites.filter(s2 => s2.is_active !== false).map(s2 => { const on = assign.siteIds.includes(Number(s2.id)); return (
                        <button key={s2.id} type="button" onClick={() => setAssign(a2 => ({ ...a2,
                            siteIds: a2.mode === "site" ? [Number(s2.id)] : on ? a2.siteIds.filter(x => x !== Number(s2.id)) : [...a2.siteIds, Number(s2.id)] }))}
                          style={{ borderRadius: 999, padding: "6px 13px", fontSize: 12, fontWeight: on ? 800 : 600, cursor: "pointer",
                            background: on ? "#0F1419" : "#fff", color: on ? "#fff" : "var(--text)", border: "1px solid " + (on ? "#0F1419" : "var(--border)") }}>
                          {s2.name}{on ? " ✓" : ""}</button>
                      ); })}
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <label className="muted" style={{ fontSize: 11 }}>TASK TITLE</label><br />
                  <input style={{ width: "100%" }} placeholder="e.g. Cross-check GRN 2/2608/003 quantities with GRN register" value={assign.title} onChange={e => setAssign(a2 => ({ ...a2, title: e.target.value }))} />
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <div><label className="muted" style={{ fontSize: 11 }}>DUE DATE &amp; TIME</label><br />
                    <input type="date" value={assign.due_date} onChange={e => setAssign(a2 => ({ ...a2, due_date: e.target.value }))} />
                    <input type="time" value={assign.due_time} onChange={e => setAssign(a2 => ({ ...a2, due_time: e.target.value }))} style={{ marginLeft: 6 }} /></div>
                  <div><label className="muted" style={{ fontSize: 11 }}>REPEAT</label><br />
                    <select value={assign.repeat} onChange={e => setAssign(a2 => ({ ...a2, repeat: e.target.value }))}>
                      <option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label className="muted" style={{ fontSize: 11 }}>PRIORITY</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 4 }}>
                    {[["low", "Low"], ["normal", "Medium"], ["high", "High"]].map(([v2, l2]) => (
                      <button key={v2} type="button" onClick={() => setAssign(a2 => ({ ...a2, priority: v2 }))}
                        style={{ border: assign.priority === v2 ? "2px solid var(--copper)" : "1px solid var(--border)", background: assign.priority === v2 ? "#fff8f2" : "#fff", color: assign.priority === v2 ? "var(--copper)" : "var(--text)", borderRadius: 10, padding: "8px 0", fontSize: 12.5, fontWeight: assign.priority === v2 ? 800 : 600, cursor: "pointer" }}>{l2}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 14, background: "#faf9f6", border: "1px dashed var(--border)", borderRadius: 10, padding: "9px 12px", fontSize: 12 }}>
                  {assign.mode === "person"
                    ? (assign.person ? <>Will be sent to <b>{staff.find(s2 => String(s2.id) === String(assign.person))?.name}</b>.</> : "Pick a person above.")
                    : recip.length
                      ? <>Will be sent to <b>everyone assigned to {assign.siteIds.map(id2 => sites.find(s2 => Number(s2.id) === id2)?.name).filter(Boolean).join(", ")}</b> — {recip.length} people.</>
                      : "Pick site(s) above — recipients load automatically."}
                  {assign.repeat !== "none" && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Repeats {assign.repeat}: the next occurrence is created automatically each time it&apos;s completed.</div>}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                  <button type="button" onClick={() => setAssign(null)}>Cancel</button>
                  <button type="button" className="primary" disabled={busy || !assign.title.trim() || (assign.mode === "person" ? !assign.person : recip.length === 0)} onClick={doAssign}
                    style={{ fontWeight: 800 }}>{busy ? "Assigning…" : "➤ Assign Task"}</button>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
