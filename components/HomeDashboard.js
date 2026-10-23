"use client";
// update236: HOME OVERVIEW — the 229 premium dashboard, extracted out of /m/dashboard so
// that /home (desktop) and /m/dashboard (phone) render the SAME component. No iframes.
// The greeting bar / View-as picker now live in HomeHeader (parent owns asSite), because on
// desktop they sit above the Home tab strip and must survive tab switches.
// Same live loaders, routes and permissions as 229/230 — nothing invented, nothing removed.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getSession, setCurrentSite } from "@/lib/auth";
import { supabase, isDemo, authReady } from "@/lib/supabase";   // update391
import { approvalRights } from "@/lib/perms";
import { getPendingCount } from "@/lib/pending";
import { getSites, getAttendance, getWorkers } from "@/lib/data";
import { getProjects } from "@/lib/projects";
import { getPettyRequestQueue, getAdvanceQueue, getExpenseClaimQueue, inr } from "@/lib/money";
import { getPOs, getOpenIndents } from "@/lib/procure";
import { getDigest } from "@/lib/dpr";
import { todayLocal } from "@/lib/today";
import { getTasks, groupTasks, setTaskStatus, PRIORITY_META, TASK_ST } from "@/lib/tasks";

const ST_META = { active: ["Active", "#15803d"], upcoming: ["Upcoming", "#6b46c1"], on_hold: ["On hold", "#b45309"], delayed: ["Delayed", "#b91c1c"], completed: ["Completed", "#2b6cb0"], idea: ["Idea", "#6b7280"] };
const NAVY = "#0F1A2E", NAVY2 = "#16233d", COPPER = "#e07020";
const arr = x => Array.isArray(x) ? x : (x?.rows || []);
const crore = n => { const v = Number(n) || 0; return v >= 1e7 ? "₹" + (v / 1e7).toFixed(2) + " Cr" : v >= 1e5 ? "₹" + (v / 1e5).toFixed(2) + " L" : inr(v); };

/* ---- shared design-system pieces (module scope — never redefined per render) ---- */
function Ring({ pct, label }) {
  const p = Math.max(0, Math.min(Number(pct) || 0, 100)), R = 30, C = 2 * Math.PI * R;
  return (
    <svg width="78" height="78" viewBox="0 0 78 78" style={{ flexShrink: 0 }}>
      <circle cx="39" cy="39" r={R} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="7" />
      {p > 0 && <circle cx="39" cy="39" r={R} fill="none" stroke={COPPER} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={(C * p / 100) + " " + C} transform="rotate(-90 39 39)" />}{/* update265b: at 0% the rounded cap drew a stray dot at the top of the ring */}
      <text x="39" y="38" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="800">{Math.round(p)}%</text>
      <text x="39" y="50" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="7.5">{label}</text>
    </svg>
  );
}
function Pill({ tone, children }) {
  const c = { green: ["#0f3d24", "#4ade80"], amber: ["#3d2f0f", "#fbbf24"], red: ["#3d1414", "#f87171"] }[tone] || ["#26324a", "#cbd5e1"];
  return <span style={{ background: c[0], color: c[1], borderRadius: 999, padding: "4px 11px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>● {children}</span>;
}
function HeroStat({ ico, label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, letterSpacing: 0.6, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ico} {label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", marginTop: 1 }}>{value}</div>
    </div>
  );
}
function Section({ title, action, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 9, gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
function Tile({ ico, label, badge, href, onClick }) {
  const inner = (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, padding: "13px 6px 10px", textAlign: "center", position: "relative", boxShadow: "0 2px 8px rgba(15,26,46,0.05)", cursor: "pointer", height: "100%" }}>
      <span style={{ display: "inline-flex", width: 42, height: 42, borderRadius: 13, background: "#f6f2ec", alignItems: "center", justifyContent: "center", fontSize: 19 }}>{ico}</span>
      {badge > 0 && <span style={{ position: "absolute", top: 7, right: 9, background: "var(--red)", color: "#fff", borderRadius: 9, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>{badge}</span>}
      <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 6, lineHeight: 1.2 }}>{label}</div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none", color: "var(--text)" }}>{inner}</Link> : <div onClick={onClick}>{inner}</div>;
}
function TrioCard({ v, l, color }) {
  return (
    <div style={{ flex: 1, minWidth: 96, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "11px 12px" }}>
      <div style={{ fontSize: 21, fontWeight: 800, color: color || "var(--text)" }}>{v}</div>
      <div className="muted" style={{ fontSize: 11 }}>{l}</div>
    </div>
  );
}
function WeekChart({ data }) {
  const max = Math.max.apply(null, data.map(d => d.n).concat([1]));
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 10px 8px", marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 112 }}>
        {data.map(d => (
          <div key={d.date} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
            <div style={{ fontSize: 9.5, color: "var(--muted)", marginBottom: 2 }}>{d.n}</div>
            <div title={d.date + ": " + d.n} style={{ height: Math.max(Math.round(d.n / max * 78), 3), borderRadius: "5px 5px 0 0", background: "linear-gradient(180deg, #4c7a99, #2f5470)" }} />
            <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3 }}>{d.day}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function ApprovalRow({ ico, title, sub, count, href }) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "var(--text)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "11px 13px", marginBottom: 8 }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: "#fdf1e7", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{ico}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 13.5, display: "block" }}>{title}</b>
          <span className="muted" style={{ fontSize: 11.5 }}>{sub}</span>
        </span>
        <b style={{ fontSize: 16, color: count > 0 ? COPPER : "var(--muted)" }}>{count}</b>
        <span style={{ fontSize: 15, color: "var(--muted)" }}>›</span>
      </div>
    </Link>
  );
}
function GlanceCard({ label, value, foot, footColor, href }) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "var(--text)", flex: 1, minWidth: 150 }}>
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 16, padding: 14, height: "100%" }}>
        <div className="muted" style={{ fontSize: 11.5 }}>{label}</div>
        <div style={{ fontSize: 21, fontWeight: 800, margin: "3px 0 2px" }}>{value}</div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: footColor || COPPER }}>{foot}</div>
      </div>
    </Link>
  );
}

function DirectorWorkspace({ pj, appr, missingDpr, man, weekData, pendCount, desk, onProjects, onSite }) {
  const peak = Math.max(1, ...(weekData || []).map(d => Number(d.n) || 0));
  const modules = [
    ["Approvals","Review decisions waiting","✅","/approvals","#fff2e8"],["Finance","Expenses and payments","₹","/expenses","#eaf3ff"],
    ["Reports","Company performance","▤","/reports","#edf8f0"],["All sites","Browse the portfolio","⌂","/projects","#f4efff"],
    ["Purchase orders","Review PO activity","▣","/procure?tab=po","#fff7e5"],["Pending deliveries","Follow up material","↗","/procure/pending","#e9f8f7"],
    ["Vendors","Vendor directory","▤","/vendors","#fff0f0"],["Assign task","Create and follow up work","✓","/tasks","#f3f1ff"],
    ["Administration","Access and settings","⚙","/admin-access","#f1f4f7"],["Site reports","Daily progress reports","▤","/dpr","#eef6ff"],["Muster","Workforce attendance","●","/attendance","#eef8f2"]
  ];
  const metrics = [["Active projects",pj.active+pj.hold+pj.delayed,pj.total+" projects on record"],["Average progress",pj.avg+"%","Projects with reported progress"],["Present today",man.inNow,man.roll+" workers on roll"]];
  const followups = [["Money approvals",appr.petty+appr.claims+appr.adv,"Claims, advances and petty cash","/approvals"],["PO approvals",appr.po,"Waiting for review","/procure"],["Sites without today's DPR",missingDpr,"Daily report follow-up","/dpr"],["Pending deliveries",pendCount,"Material still due at site","/procure/pending"]];
  return <div style={{marginTop:22}}>
    <div style={{display:"flex",alignItems:"end",justifyContent:"space-between",gap:12,marginBottom:13,flexWrap:"wrap"}}>
      <div><div style={{color:"#c65b13",fontSize:10,letterSpacing:".14em",fontWeight:800,textTransform:"uppercase"}}>Director workspace</div><h2 style={{margin:"5px 0 0",color:"#172033",fontSize:21,letterSpacing:"-.025em"}}>Portfolio overview</h2><div style={{color:"#727b89",fontSize:13,marginTop:3}}>Live project health and decisions across your sites.</div></div>
      <button type="button" onClick={onProjects} style={{border:"1px solid #d6dbe2",background:"#fff",borderRadius:10,padding:"9px 13px",fontWeight:700,color:"#243047",cursor:"pointer"}}>Open all sites →</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:desk?"repeat(3,minmax(0,1fr))":"repeat(auto-fit,minmax(145px,1fr))",gap:10}}>
      {metrics.map(([label,value,note],i)=><div key={label} style={{background:"#fff",border:"1px solid #e4e7eb",borderRadius:16,padding:"16px 17px"}}><div style={{color:"#6b7280",fontSize:11,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase"}}>{label}</div><div style={{fontSize:25,fontWeight:800,color:i===1?"#b95416":"#172033",marginTop:7}}>{value}</div><div style={{fontSize:12,color:"#727b89",marginTop:4}}>{note}</div></div>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:desk?"minmax(0,1.3fr) minmax(290px,.8fr)":"1fr",gap:13,marginTop:13}}>
      <section style={{background:"#fff",border:"1px solid #e4e7eb",borderRadius:17,padding:16,minWidth:0}}>
        <div style={{marginBottom:11}}><h3 style={{margin:0,fontSize:15,color:"#172033"}}>Project health</h3><div style={{color:"#7b8490",fontSize:11.5,marginTop:3}}>Active, held and delayed projects</div></div>
        {pj.live.length?<div style={{display:"grid",gap:7}}>{pj.live.slice(0,6).map(p=>{const meta=ST_META[p.status]||["Active","#15803d"],pct=Math.max(0,Math.min(100,Number(p.progress)||0));return <button type="button" key={p.id} onClick={()=>onSite(p.id)} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:"6px 12px",alignItems:"center",width:"100%",textAlign:"left",background:"#fbfcfd",border:"1px solid #edf0f3",borderRadius:12,padding:"10px 11px",cursor:"pointer",color:"#172033"}}><span style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:13,fontWeight:700}}>{p.name}</span><span style={{color:meta[1],fontSize:10.5,fontWeight:800}}>{meta[0]}</span><span style={{height:5,background:"#e9edf1",borderRadius:8,overflow:"hidden"}}><span style={{display:"block",width:p.progress==null?"0%":pct+"%",height:"100%",background:meta[1],borderRadius:8}}/></span><span style={{color:"#667085",fontSize:11,textAlign:"right"}}>{p.progress==null?"No update":pct+"%"}</span></button>})}</div>:<div style={{padding:24,textAlign:"center",color:"#7b8490",fontSize:13}}>No active projects to show.</div>}
      </section>
      <section style={{background:"#fff",border:"1px solid #e4e7eb",borderRadius:17,padding:16}}>
        <div style={{marginBottom:7}}><h3 style={{margin:0,fontSize:15,color:"#172033"}}>Needs attention</h3><div style={{color:"#7b8490",fontSize:11.5,marginTop:3}}>Live queues and daily follow-up</div></div>
        {followups.map(([label,count,note,href])=><Link key={label} href={href} style={{textDecoration:"none",color:"#172033",display:"flex",alignItems:"center",gap:10,borderTop:"1px solid #edf0f3",padding:"11px 0"}}><span style={{flex:1}}><b style={{display:"block",fontSize:12.5}}>{label}</b><span style={{display:"block",color:"#7b8490",fontSize:11,marginTop:3}}>{note}</span></span><b style={{color:count?"#b95416":"#16804a",fontSize:19}}>{count}</b><span style={{color:"#9aa2ad"}}>›</span></Link>)}
      </section>
    </div>
    <div style={{display:"grid",gridTemplateColumns:desk?"minmax(260px,.7fr) minmax(0,1.5fr)":"1fr",gap:13,marginTop:13}}>
      <section style={{background:"#fff",border:"1px solid #e4e7eb",borderRadius:17,padding:16}}><h3 style={{margin:0,fontSize:15,color:"#172033"}}>Attendance this week</h3><div style={{color:"#7b8490",fontSize:11.5,marginTop:3}}>Workers marked present each day</div><div style={{display:"flex",alignItems:"end",gap:8,height:102,marginTop:15}}>{(weekData||[]).map(d=><div key={d.date} title={d.date+": "+d.n+" present"} style={{flex:1,textAlign:"center"}}><div style={{fontSize:10,color:"#727b89",marginBottom:4}}>{d.n}</div><div style={{height:Math.max(5,Math.round((Number(d.n)||0)/peak*60)),background:"#cf6a2b",borderRadius:"5px 5px 2px 2px"}}/><div style={{color:"#727b89",fontSize:10,marginTop:5}}>{d.day}</div></div>)}</div></section>
      <section style={{background:"#fff",border:"1px solid #e4e7eb",borderRadius:17,padding:16}}><h3 style={{margin:0,fontSize:15,color:"#172033"}}>Workspace</h3><div style={{color:"#7b8490",fontSize:11.5,marginTop:3,marginBottom:11}}>Go straight to a module</div><div style={{display:"grid",gridTemplateColumns:desk?"repeat(4,minmax(0,1fr))":"repeat(auto-fit,minmax(138px,1fr))",gap:8}}>{modules.map(([title,desc,icon,href,tint])=><Link key={title} href={href} style={{minHeight:64,padding:10,display:"flex",gap:9,alignItems:"center",background:tint,borderRadius:12,textDecoration:"none",color:"#202b3b",border:"1px solid rgba(23,32,51,.045)"}}><span style={{width:31,height:31,borderRadius:9,background:"rgba(255,255,255,.82)",display:"grid",placeItems:"center",color:"#34445d",fontWeight:800,flexShrink:0}}>{icon}</span><span style={{minWidth:0}}><b style={{display:"block",fontSize:11.5,lineHeight:1.2}}>{title}</b><span style={{display:"block",fontSize:10,color:"#687386",lineHeight:1.25,marginTop:3}}>{desc}</span></span></Link>)}</div></section>
    </div>
  </div>;
}

/* update237: the four page cards that replaced the top tab strip. Module scope. */
function PageCard({ ico, title, desc, href, current, onClick }) {
  const inner = (
    <div style={{ background: "#fff", border: "1px solid " + (current ? "var(--copper)" : "var(--border)"), borderRadius: 16, padding: "18px 18px 16px",
        display: "flex", flexDirection: "column", gap: 7, height: "100%", cursor: "pointer", boxShadow: "0 2px 10px rgba(15,26,46,0.05)" }}>
      <span style={{ width: 46, height: 46, borderRadius: 14, background: "#f6f2ec", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{ico}</span>
      <b style={{ fontSize: 15.5 }}>{title}</b>
      <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45, flex: 1 }}>{desc}</span>
      <span style={{ color: current ? "var(--muted)" : "var(--copper)", fontWeight: 800, fontSize: 12.5 }}>{current ? "You are here — back to top ↑" : "Open →"}</span>
    </div>
  );
  return current
    ? <div onClick={onClick}>{inner}</div>
    : <Link href={href} style={{ textDecoration: "none", color: "var(--text)" }}>{inner}</Link>;
}

export default function HomeDashboard({ mode = "mobile", asSite = null, setAsSite = () => {}, onOpenProjects = null, onSites = null, showPageCards = false }) {
  const desk = mode === "desk";
  // update236: on desktop, every link goes to the real DESKTOP route; only phones use /m/*.
  const R = (m, d) => desk ? d : m;

  const [sess, setSess] = useState(null);
  const [sites, setSites] = useState([]);
  const [projects, setProjects] = useState(null);
  const [att, setAtt] = useState(null);
  const [week, setWeek] = useState([]);
  const [workers, setWorkers] = useState(null);
  const [pettyQ, setPettyQ] = useState([]);
  const [advQ, setAdvQ] = useState([]);
  const [claims, setClaims] = useState([]);
  const [pos, setPos] = useState([]);
  const [indents, setIndents] = useState([]);
  const [digest, setDigest] = useState(null);
  const [panel, setPanel] = useState(null);       // project explorer (mobile only — kept from 228)
  const [expId, setExpId] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [pendCount, setPendCount] = useState(0);   // update256: PO lines still awaiting delivery
  // update449: the Home tab's own site picker — every role. "all" = every site the person is allotted
  // (Directors: the company portfolio). A real site also becomes the session's current site, so
  // Muster / DPR / Stock / Indent open on it — ONE selection drives all mobile pages (same as before).
  const [staffSite, setStaffSite] = useState(() => { try { return window.sessionStorage.getItem("psk_home_site") || ""; } catch { return ""; } });
  const [pickOpen, setPickOpen] = useState(false);

  // on desktop the Projects TAB owns projects; on the phone the inline explorer does
  // update284: the explorer is an OVERLAY. Opening it now pushes a history entry, so the phone's
  // back button closes the panel instead of leaving the page (leaving looked like a logout — the
  // session was never touched, but the app exited to the login screen). UI closes pop that entry.
  const panelRef = useRef(null);
  useEffect(() => { panelRef.current = panel; }, [panel]);
  useEffect(() => {
    const onPop = () => { if (panelRef.current) { setPanel(null); setExpId(null); } };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const closePanel = () => {
    if (typeof window !== "undefined" && window.history.state && window.history.state.pskPanel) window.history.back();
    else { setPanel(null); setExpId(null); }
  };
  const openProjects = () => {
    if (onOpenProjects) { onOpenProjects(); return; }
    setPanel("all");
    try { window.history.pushState({ pskPanel: 1 }, ""); } catch {}
  };
  // update262: when the explorer closes, remove any leftover #projects from the URL WITHOUT
  // creating a history entry — phantom hash entries were what broke the phone's back button.
  useEffect(() => {
    if (panel === null && typeof window !== "undefined" && window.location.hash === "#projects")
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [panel]);

  // update391: ONE loader for everything on this page. It runs only after the auth token has
  // been restored (fresh load / new deploy / resumed app), and again whenever the session or
  // rights refresh, the token is (re)issued, or the app comes back to the foreground — so a
  // deploy never leaves the page showing empty/zero data until a logout-login.
  const lastLoad = useRef(0);
  async function loadAll(reason) {
    const s = getSession();
    if (!s) return;
    setSess(s);
    if (!isDemo) await authReady();
    lastLoad.current = Date.now();
    getSites().then(r => { const rows = arr(r); setSites(rows); if (onSites) onSites(rows); });
    getProjects().then(r => setProjects(arr(r)));
    getAttendance(todayLocal(), "all").then(r => setAtt(arr(r))).catch(() => setAtt([]));
    getWorkers().then(r => setWorkers(arr(r))).catch(() => setWorkers([]));
    getPettyRequestQueue(undefined, { status: ["pending"] }).then(r => setPettyQ(arr(r))).catch(() => {});   // update446: pending only, all of them
    getAdvanceQueue(undefined, { status: ["pending"] }).then(r => setAdvQ(arr(r))).catch(() => {});
    getExpenseClaimQueue().then(r => setClaims(arr(r))).catch(() => {});   // update447: claims only — direct vendor payments are separate
    getPOs("all").then(r => setPos(arr(r))).catch(() => {});
    getOpenIndents("all").then(r => setIndents(arr(r))).catch(() => {});
    getDigest(todayLocal()).then(r => setDigest(arr(r))).catch(() => setDigest([]));
    getTasks().then(r => setTasks(arr(r))).catch(() => setTasks([]));
    getPendingCount(staffSite && staffSite !== "all" && s.role !== "director" ? staffSite : "all").then(setPendCount).catch(() => setPendCount(0));   // update256 · update449: site-wise when a site is picked
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    const key = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    Promise.all(days.map(d => getAttendance(key(d), "all").then(r => arr(r)).catch(() => [])))
      .then(lists => setWeek(days.map((d, i) => ({ day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()], date: key(d), rows: lists[i] }))));
  }
  useEffect(() => {
    if (!getSession()) return;
    loadAll("mount");
    const onSess = e => { if (e?.detail) setSess(e.detail); loadAll("session"); };
    const onVis = () => { if (document.visibilityState === "visible" && Date.now() - lastLoad.current > 60000) loadAll("resume"); };
    window.addEventListener("psk-session", onSess);
    document.addEventListener("visibilitychange", onVis);
    let sub = null;
    if (!isDemo && supabase?.auth) {
      const r = supabase.auth.onAuthStateChange((ev) => {
        if ((ev === "SIGNED_IN" || ev === "TOKEN_REFRESHED") && Date.now() - lastLoad.current > 3000) loadAll(ev);
      });
      sub = r?.data?.subscription || null;
    }
    return () => { window.removeEventListener("psk-session", onSess); document.removeEventListener("visibilitychange", onVis); if (sub) sub.unsubscribe(); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!getSession()) return;
    if (desk) return;
    const openFromHash = () => { if (window.location.hash === "#projects") setPanel("all"); };
    const openFromNav = () => setPanel("all");   // update262: direct signal from the Projects tab
    openFromHash(); window.addEventListener("hashchange", openFromHash);
    window.addEventListener("psk-open-projects", openFromNav);
    return () => { window.removeEventListener("hashchange", openFromHash); window.removeEventListener("psk-open-projects", openFromNav); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const isDirector = sess?.role === "director";
  // update238: same rights object the Approvals inbox uses — no second opinion on this page
  const rights = approvalRights(sess);
  const viewSiteId = isDirector ? asSite
    : staffSite === "all" ? null
    : (staffSite || sess?.currentSite || sess?.sites?.[0]?.id || null);
  const companyView = isDirector && !asSite;     // Director's portfolio layout (tiles, sections)
  const allView = !viewSiteId;                   // update449: data scope = every allotted site (any role)
  function pickHomeSite(v) {   // update449
    setPickOpen(false);
    if (isDirector) { setAsSite(v === "all" ? null : Number(v)); }
    else { setStaffSite(v === "all" ? "all" : String(v)); if (v !== "all") setCurrentSite(v); }
    try { window.sessionStorage.setItem("psk_home_site", v === "all" ? "all" : String(v)); } catch {}
    getPendingCount(v === "all" ? "all" : v).then(setPendCount).catch(() => setPendCount(0));
  }

  const pj = useMemo(() => {
    const all = projects || [];
    const live = all.filter(p => ["active", "on_hold", "delayed"].includes(p.status));
    const withPct = live.filter(p => p.progress !== null && p.progress !== undefined);
    return { all, live, total: all.length,
      active: all.filter(p => p.status === "active").length,
      hold: all.filter(p => p.status === "on_hold").length,
      delayed: all.filter(p => p.status === "delayed").length,
      done: all.filter(p => p.status === "completed").length,
      avg: withPct.length ? Math.round(withPct.reduce((t, p) => t + p.progress, 0) / withPct.length) : 0,
      contract: all.reduce((t, p) => t + Number(p.contract_value || 0), 0),
      invoiced: all.reduce((t, p) => t + Number(p.invoiced || 0), 0),
      deadline: live.map(p => p.end_date).filter(Boolean).sort()[0] || null,
      site: all.find(p => String(p.id) === String(viewSiteId)) || null };
  }, [projects, viewSiteId]);

  const inSite = rows => allView ? rows : rows.filter(r => String(r.site_id) === String(viewSiteId));   // update449: allView
  const presentCount = rows => rows.filter(r => (r.in && r.in !== "—") || r.status === "present" || r.status === "half_day").length;

  const man = useMemo(() => {
    const rows = allView ? (att || []) : (att || []).filter(r => String(r.site_id) === String(viewSiteId));
    const roll = allView ? (workers || []).length : (workers || []).filter(w => String(w.site_id) === String(viewSiteId)).length;
    const inNow = presentCount(rows);
    return { roll, inNow, absent: Math.max(rows.length - inNow, 0), pct: roll ? Math.round(inNow / roll * 1000) / 10 : 0 };
  }, [att, workers, viewSiteId, allView]);

  const weekData = useMemo(() => week.map(d => ({ day: d.day, date: d.date,
    n: presentCount(allView ? d.rows : d.rows.filter(r => String(r.site_id) === String(viewSiteId))) })), [week, viewSiteId, allView]);

  const appr = useMemo(() => ({
    po: pos.filter(p => p.approval === "pending" && p.status !== "cancelled").length,
    adv: advQ.filter(r => r.status === "pending").length,
    claims: inSite(claims).filter(r => r.status === "pending" || r.status === "queried").length,
    petty: pettyQ.filter(r => r.status === "pending").length,
    ind: allView ? indents.length : indents.filter(i => String(i.site_id) === String(viewSiteId)).length,
  }), [pos, advQ, claims, pettyQ, indents, viewSiteId, allView]);   // eslint-disable-line react-hooks/exhaustive-deps
  const apprTotal = appr.po + appr.adv + appr.claims + appr.petty + appr.ind;

  const expApproved = inSite(claims).filter(c => c.status === "approved").reduce((t, c) => t + Number(c.amount || 0), 0);
  const expPending = inSite(claims).filter(c => c.status === "pending").reduce((t, c) => t + Number(c.amount || 0), 0);
  const dprFiled = new Set((digest || []).map(d => d.site));
  const dprMissing = sites.filter(s => s.is_active !== false && !dprFiled.has(s.name));
  const siteName = sites.find(s => String(s.id) === String(viewSiteId))?.name
    || (sess?.sites || []).find(s => String(s.id) === String(viewSiteId))?.name || "";

  const panelRows = useMemo(() => {
    const all = pj.all;
    if (panel === "active") return all.filter(p => p.status === "active");
    if (panel === "hold") return all.filter(p => p.status === "on_hold" || p.status === "delayed");
    if (panel === "completed") return all.filter(p => p.status === "completed");
    if (panel === "upcoming") return all.filter(p => p.status === "upcoming" || p.status === "idea");
    return all;
  }, [pj, panel]);

  // ---- update230: tasks on Home (auto = computed live; assigned = real rows) ----
  const grp = useMemo(() => groupTasks(tasks || []), [tasks]);
  const myTasks = useMemo(() => grp.overdue.concat(grp.today).slice(0, 6), [grp]);
  async function completeTask(t) {
    const r = await setTaskStatus(t.id, "completed", null, sess?.name, t.title);
    if (r.ok) getTasks().then(x => setTasks(arr(x)));
  }
  const autoTasks = useMemo(() => {
    if (!sess) return [];
    const out = [];
    if (companyView) {
      out.push({ ico: "🧾", name: "PO draft approvals", tag: "Daily", desc: "Review and approve pending purchase orders",
        stats: [["Pending", appr.po]], done: appr.po === 0, href: "/procure", cta: "Review POs" });
      if (rights.money) out.push({ ico: "✅", name: "Approvals sweep", tag: "Daily", desc: "Petty cash · expenses · advances",
        stats: [["Petty", appr.petty], ["Claims", appr.claims], ["Adv", appr.adv]], done: appr.petty + appr.claims + appr.adv === 0, href: R("/m/approvals", "/approvals"), cta: "View approvals" });
      out.push({ ico: "📋", name: "Site reports follow-up", tag: "Daily", desc: "Sites without today's DPR",
        stats: [["Missing", dprMissing.length]], done: dprMissing.length === 0, href: "/dpr", cta: "DPR digest" });
    } else {
      out.push({ ico: "🧑‍🤝‍🧑", name: "Attendance check", tag: "Morning", desc: "Verify today's punch-ins for your site",
        stats: [["In", man.inNow], ["Absent", man.absent]], done: man.inNow > 0 && man.absent === 0, href: "/attendance", cta: "Check attendance" });
      out.push({ ico: "📝", name: "DPR submission", tag: "Evening", desc: "Submit today's Daily Progress Report",
        stats: [["Filed", dprFiled.has(siteName) ? "Yes" : "No"]], done: dprFiled.has(siteName), href: R("/m/dpr", "/dpr"), cta: "Submit DPR" });
      out.push({ ico: "🛒", name: "Open orders", tag: "Material", desc: "Material requests awaiting action",
        stats: [["Open", appr.ind]], done: appr.ind === 0, href: "/procure", cta: "Review orders" });
    }
    return out;
  }, [sess, companyView, appr, dprMissing, man, siteName, rights.money]);   // eslint-disable-line react-hooks/exhaustive-deps
  const taskPending = autoTasks.filter(t => !t.done).length + myTasks.filter(t => t.status !== "completed").length;

  // update238: view_all_money holders get the tile too — read-only inbox, no actions inside
  const apprTile = rights.open ? [["✅", "Approvals", R("/m/approvals", "/approvals"), apprTotal]] : [];
  const dirTiles = [...apprTile, ["💰", "Finance", "/expenses", 0], ["📊", "Reports", R("/m/report", "/reports"), 0], ["🏗", "All Sites", null, 0],
    ["📄", "PO", "/procure?tab=po", 0], ["🏢", "Vendors", "/vendors", 0], ["🗒", "Assign Task", "/tasks", 0], ["🚚", "Pending Del.", "/procure/pending", pendCount], ["⚙", "Admin", "/admin-access", 0]];
  const staffTiles = [["📁", "Projects", null, 0], ["👷", "Muster", R("/m/muster", "/attendance"), 0], ...apprTile, ["📦", "Stock", R("/m/stock", "/stock"), 0],
    ["💳", "Expenses", R("/m/money", "/expenses"), appr.claims], ["🗒", "Tasks", null, 0], ["📋", "Reports", R("/m/report", "/reports"), 0], ["🛒", "Orders", "/procure?tab=indents", appr.ind], ["🚚", "Pending Del.", "/procure/pending", pendCount]];   // update284: Indents tile lands on its tab
  const tiles = companyView ? dirTiles : staffTiles;

  if (!sess) return null;

  return (
    <div style={{ background: "var(--bg)", minHeight: desk ? 0 : "100dvh", paddingBottom: desk ? 24 : "calc(128px + env(safe-area-inset-bottom))" }}>{/* update265: clears the fixed nav AND the floating chat bubble */}
      <div style={{ padding: desk ? "18px 28px 0" : "14px 12px 0", maxWidth: desk ? "none" : 1100, margin: desk ? 0 : "0 auto" }}>
        <div style={{ background: "linear-gradient(140deg, " + NAVY + " 0%, " + NAVY2 + " 100%)", color: "#fff", borderRadius: 18, padding: 17, boxShadow: "0 10px 26px rgba(15,26,46,0.28)", position: "relative", overflow: "hidden" }}>{/* update265b: hard containment */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 1.1, color: COPPER, fontWeight: 800, textTransform: "uppercase" }}>{companyView ? "Company portfolio" : allView ? "All my sites" : "Active site"}</div>
              {/* update449: the site picker — tap to switch the whole Home tab */}
              <button type="button" onClick={() => setPickOpen(true)} title="Switch site"
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", marginTop: 5, background: "rgba(255,255,255,0.08)", border: "1.5px solid " + COPPER, borderRadius: 10, padding: "7px 10px", color: "#fff", cursor: "pointer" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 800, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {projects === null ? "…" : companyView ? (pj.active + pj.hold + pj.delayed) + " Active Sites" : allView ? sites.length + " sites" : (siteName || "Your site")}</span>
                <span style={{ color: COPPER, fontWeight: 800, fontSize: 12.5, whiteSpace: "nowrap" }}>Change ▾</span>
              </button>
              <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>↗ {allView ? pj.total + " projects on record" : (pj.site?.client_name || "Pipeskool project")}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                {allView ? (<>
                  <Pill tone="green">{pj.active} on schedule</Pill>
                  {pj.hold > 0 && <Pill tone="amber">{pj.hold} on hold</Pill>}
                  {pj.delayed > 0 && <Pill tone="red">{pj.delayed} delayed</Pill>}
                </>) : <Pill tone={pj.site?.status === "delayed" ? "red" : pj.site?.status === "on_hold" ? "amber" : "green"}>{(ST_META[pj.site?.status] || ["Active"])[0]}</Pill>}
              </div>
            </div>
            <Ring pct={allView ? pj.avg : (pj.site?.progress || 0)} label={allView ? "AVG" : "COMPLETE"} />
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.14)", margin: "14px 0 12px" }} />
          <div style={{ display: "grid", gridTemplateColumns: desk ? "repeat(4, 1fr)" : "1fr 1fr", gap: 13 }}>
            <HeroStat ico="₹" label={allView ? "Total contract value" : "Contract value"} value={crore(allView ? pj.contract : (pj.site?.contract_value || 0))} />
            <HeroStat ico="↗" label="Billed to date" value={crore(allView ? pj.invoiced : (pj.site?.invoiced || 0))} />
            <HeroStat ico="🗓" label={allView ? "Nearest deadline" : "Target finish"} value={(allView ? pj.deadline : pj.site?.end_date) || "—"} />
            <HeroStat ico="👥" label={allView ? "Total workforce" : "Workforce"} value={workers === null ? "…" : man.roll + " on roll"} />
          </div>
        </div>

        {/* update449: site sheet — same list the Muster / DPR screens use (the person's allotted sites) */}
        {pickOpen && (
          <div onClick={() => setPickOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", zIndex: 120, display: "flex", alignItems: desk ? "center" : "flex-end", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: desk ? 14 : "16px 16px 0 0", width: "100%", maxWidth: 480, maxHeight: "70vh", overflowY: "auto", padding: "12px 12px calc(16px + env(safe-area-inset-bottom))", boxShadow: "0 -10px 30px rgba(0,0,0,0.2)" }}>
              <div className="muted" style={{ fontSize: 11.5, padding: "2px 8px 8px" }}>Switch site — {isDirector ? "every site" : "your allotted sites"}</div>
              {[["all", isDirector ? "🏢 Company portfolio (all sites)" : "🏢 All my sites"], ...sites.map(x => [String(x.id), "📍 " + x.name])].map(([v, l]) => {
                const on = v === "all" ? allView : String(viewSiteId) === v;
                return (
                  <div key={v} onClick={() => pickHomeSite(v)} style={{ padding: "11px 10px", borderRadius: 8, cursor: "pointer", fontSize: 14.5, fontWeight: on ? 800 : 600, color: on ? COPPER : "var(--text)", background: on ? "#fff4e5" : "transparent", display: "flex", justifyContent: "space-between" }}>
                    <span>{l}</span>{on && <span>✓</span>}
                  </div>);
              })}
            </div>
          </div>
        )}

        {companyView ? <DirectorWorkspace pj={pj} appr={appr} missingDpr={dprMissing.length} man={man} weekData={weekData} pendCount={pendCount} desk={desk} onProjects={openProjects} onSite={id => { setAsSite(Number(id)); window.scrollTo({ top: 0, behavior: "smooth" }); }} /> : (
          <Section title="Quick access">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))", gap: 9 }}>
              {tiles.map(([ico, label, href, badge]) => (
                <Tile key={label} ico={ico} label={label} badge={badge} href={href || undefined}
                  onClick={href ? undefined : () => label === "Tasks" ? document.getElementById("home-tasks")?.scrollIntoView({ behavior: "smooth", block: "start" }) : openProjects()} />
              ))}
            </div>
          </Section>
        )}

        {/* update230: TASKS ON HOME — the separate Tasks tab is gone; everything lives here.
            Auto tasks are computed live from the same operational data (never stored). */}
        <div id="home-tasks" />
        <Section title="My tasks today"
          action={<span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {taskPending > 0 && <span style={{ background: "var(--red)", color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 11.5, fontWeight: 800 }}>{taskPending} pending</span>}
            <Link href="/tasks" style={{ fontSize: 12.5, color: COPPER, fontWeight: 700 }}>{isDirector ? "Assign / all →" : "All tasks →"}</Link>
          </span>}>
          <div style={{ display: "grid", gap: 9 }}>
            {autoTasks.map((t, i) => (
              <div key={"a" + i} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: 13, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", minWidth: 0, overflowWrap: "anywhere" }}>
                <span style={{ width: 38, height: 38, borderRadius: 12, background: "#f6f2ec", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{t.ico}</span>
                <span style={{ flex: "1 1 150px", minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{t.name}</b> <span className="badge gray" style={{ fontSize: 9.5 }}>{t.tag}</span>
                  <div className="muted" style={{ fontSize: 11.5 }}>{t.desc}</div>
                </span>
                <span style={{ display: "flex", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
                  {t.stats.map(([l2, v2]) => <span key={l2} style={{ textAlign: "center" }}><span className="muted" style={{ fontSize: 9.5, display: "block" }}>{l2}</span><b style={{ fontSize: 14 }}>{v2}</b></span>)}
                </span>
                <span style={{ textAlign: "right", marginLeft: "auto" }}>
                  <span className="badge" style={{ color: t.done ? "var(--green)" : COPPER, border: "1px solid currentColor", background: "transparent", fontWeight: 800 }}>{t.done ? "✓ Done" : "Pending"}</span>
                  {!t.done && <Link href={t.href}><button type="button" style={{ display: "block", marginTop: 5, background: NAVY, color: "#fff", border: "none", borderRadius: 9, padding: "7px 13px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{t.cta}</button></Link>}
                </span>
              </div>
            ))}
            {myTasks.map(t => { const pm = PRIORITY_META[t.priority] || PRIORITY_META.normal; const st = TASK_ST[t.status] || ["Pending", "gray"]; return (
              <div key={t.id} style={{ background: "#fff", border: "1px solid var(--border)", borderLeft: "4px solid " + pm[1], borderRadius: 14, padding: 13, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", minWidth: 0, overflowWrap: "anywhere" }}>
                <span style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{t.title}</b> <span className="badge" style={{ fontSize: 9.5, color: pm[1], border: "1px solid " + pm[1], background: "transparent" }}>{pm[0]}</span>
                  {t.description && <div className="muted" style={{ fontSize: 11.5 }}>{t.description}</div>}
                  <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{isDirector && t.assignee ? "→ " + t.assignee + " · " : ""}{t.due_at ? "⏰ " + String(t.due_at).slice(0, 16).replace("T", " ") : "No due date"}</div>
                </span>
                <span className={"badge " + st[1]} style={{ flexShrink: 0 }}>{st[0]}</span>
                {t.status !== "completed" && (
                  <button type="button" onClick={() => completeTask(t)} style={{ flexShrink: 0, background: "var(--green)", color: "#fff", border: "none", borderRadius: 9, padding: "7px 13px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>✓ Done</button>
                )}
              </div>
            ); })}
            {autoTasks.length + myTasks.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>{tasks === null ? "Loading tasks…" : "Nothing due today. 🎉"}</div>}
          </div>
        </Section>

        <Section title={companyView ? "Manpower — company wide" : "Manpower today"}
          action={<Link href="/attendance" style={{ fontSize: 12.5, color: COPPER, fontWeight: 700 }}>Full register →</Link>}>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <TrioCard v={att === null ? "…" : man.inNow} l="Marked in today" />
            <TrioCard v={att === null ? "…" : man.absent} l="Absent" color="var(--red)" />
            <TrioCard v={man.pct + "%"} l="Deployment" color="var(--green)" />
          </div>
          {weekData.length > 0 && <WeekChart data={weekData} />}
        </Section>

        {/* update238: each row appears only if this person may actually act on it. Open indents
            is NOT an approval — it is a work queue — so it stays for everyone who sees indents. */}
        {(rights.open || appr.ind > 0) && (
          <Section title={rights.any ? "Pending approvals" : rights.moneyView ? "Pending approvals · view only" : "Pending with you"} action={apprTotal > 0 && rights.open ? <span style={{ background: COPPER, color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 800 }}>{apprTotal}</span> : null}>
            {companyView && rights.indent && <ApprovalRow ico="🧾" title="PO draft approvals" sub="Awaiting your approval" count={appr.po} href="/procure" />}
            {companyView && rights.moneyView && <ApprovalRow ico="₹" title="Advance salary requests" sub="Across all sites" count={appr.adv} href="/expenses" />}
            {rights.moneyView && <ApprovalRow ico="🪙" title="Petty cash requests" sub={companyView ? "Across all sites" : siteName} count={appr.petty} href={R("/m/approvals", "/approvals")} />}
            {rights.moneyView && <ApprovalRow ico="💳" title="Expense claims" sub={companyView ? "Across all sites" : siteName} count={appr.claims} href={R("/m/approvals", "/approvals")} />}
            <ApprovalRow ico="🛒" title={companyView && rights.indent ? "Order approvals" : "Open orders"} sub="Material pending" count={appr.ind} href="/procure" />
          </Section>
        )}

        {showPageCards && !isDirector && (
          <Section title="Go to">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
              <PageCard ico="🏠" title="Home" desc="Overview of sites, tasks and important updates." current
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
              <PageCard ico="📁" title="Projects" desc="Manage and track projects." href="/projects" />
              <PageCard ico="📊" title="Dashboard" desc="View analytics and key site metrics." href="/dashboard" />
              <PageCard ico="📋" title="Site Reports" desc="View and analyze site reports." href="/reports" />
            </div>
          </Section>
        )}

        {!companyView && <Section title="Today at a glance">
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <GlanceCard label="Expenses approved" value={inr(expApproved)} foot={inr(expPending) + " pending"} href="/expenses" />
            {companyView
              ? <GlanceCard label="Sites without DPR" value={dprMissing.length + " today"} foot="Open DPR digest →" footColor={dprMissing.length ? "var(--red)" : "var(--green)"} href="/dpr" />
              : <GlanceCard label="My DPR status" value={dprFiled.has(siteName) ? "Filed ✓" : "Pending"} foot={dprFiled.has(siteName) ? "Submitted today" : "Submit today's DPR →"} footColor={dprFiled.has(siteName) ? "var(--green)" : "var(--red)"} href={R("/m/dpr", "/dpr")} />}
          </div>
        </Section>}
      </div>

      {!desk && panel && (
        <div style={{ position: "fixed", left: 0, right: 0, top: 0, bottom: "calc(62px + env(safe-area-inset-bottom))", background: "var(--bg)", zIndex: 60, display: "flex", flexDirection: "column" }}>
          <div style={{ background: "linear-gradient(115deg, " + NAVY + ", " + NAVY2 + ")", color: "#fff", padding: "calc(10px + env(safe-area-inset-top)) 14px 12px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <button type="button" onClick={closePanel} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>← Back</button>{/* update284 */}
            <b style={{ fontSize: 15, flex: 1 }}>📁 Projects</b>
            <button type="button" onClick={closePanel} style={{ background: "none", border: "none", color: "#fff", fontSize: 17, cursor: "pointer", padding: 6 }}>✕</button>{/* update284 */}
          </div>
          <div style={{ display: "flex", gap: 6, padding: "10px 12px 4px", overflowX: "auto", flexShrink: 0 }}>
            {[["all", "All", pj.total], ["active", "Active", pj.active], ["hold", "On hold", pj.hold + pj.delayed], ["completed", "Completed", pj.done], ["upcoming", "Upcoming", pj.all.filter(p => p.status === "upcoming" || p.status === "idea").length]].map(([k, l, n]) => (
              <button key={k} type="button" onClick={() => { setPanel(k); setExpId(null); }}
                style={{ flexShrink: 0, borderRadius: 999, padding: "7px 13px", fontSize: 12.5, fontWeight: panel === k ? 800 : 600, cursor: "pointer",
                  border: panel === k ? "2px solid var(--copper)" : "1px solid var(--border)", background: panel === k ? "#fff8f2" : "#fff", color: panel === k ? "var(--copper)" : "var(--text)" }}>
                {l} · {n}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px 16px", display: "grid", gap: 10, alignContent: "start", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: 12, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12 }}><span className="muted">Contract</span><br /><b>{crore(pj.contract)}</b></span>
              <span style={{ fontSize: 12, textAlign: "right" }}><span className="muted">Invoiced (RA bills)</span><br /><b style={{ color: "var(--green)" }}>{crore(pj.invoiced)}</b></span>
            </div>
            {panelRows.map(p => { const open2 = expId === p.id; const sm = ST_META[p.status] || [p.status, "#6b7280"]; return (
              <div key={p.id} onClick={() => setExpId(open2 ? null : p.id)} style={{ background: "#fff", border: "1px solid var(--border)", padding: 13, borderRadius: 14, borderLeft: "4px solid " + sm[1], cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <b style={{ fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</b>
                  <span className="badge" style={{ color: sm[1], border: "1px solid currentColor", background: "transparent", flexShrink: 0 }}>{sm[0]}</span>
                </div>
                {p.client_name && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>👤 {p.client_name}</div>}
                {p.progress !== null && p.progress !== undefined && (
                  <div style={{ marginTop: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span className="muted">Progress</span><b>{p.progress}%</b></div>
                    <div style={{ height: 7, background: "#f0ece6", borderRadius: 4, marginTop: 2 }}><div style={{ width: Math.min(p.progress, 100) + "%", height: 7, borderRadius: 4, background: COPPER }} /></div>
                  </div>
                )}
                {open2 && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8, fontSize: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <span><span className="muted">Start</span><br /><b>{p.start_date || "—"}</b></span>
                      <span><span className="muted">End</span><br /><b>{p.end_date || "—"}</b></span>
                      <span><span className="muted">Contract</span><br /><b>{p.contract_value ? crore(p.contract_value) : "—"}</b></span>
                      <span><span className="muted">Invoiced</span><br /><b>{crore(p.invoiced || 0)}</b></span>
                      <span><span className="muted">RA bills</span><br /><b>{p.bills || 0}</b></span>
                      {p.expected_start && <span><span className="muted">Expected start</span><br /><b>{p.expected_start}</b></span>}
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                      <Link href={"/projects/" + p.id} onClick={e => e.stopPropagation()} style={{ color: COPPER, fontWeight: 800, fontSize: 12.5 }}>Open full workspace →</Link>
                      {isDirector && <a onClick={e => { e.stopPropagation(); setAsSite(Number(p.id)); closePanel(); }} style={{ color: "#2b6cb0", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>👁 View as site manager</a>}
                    </div>
                  </div>
                )}
                <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>{open2 ? "Tap to collapse ▲" : "Tap for details ▼"}</div>
              </div>
            ); })}
            {panelRows.length === 0 && <div className="muted" style={{ padding: 20, textAlign: "center" }}>No projects in this filter.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
