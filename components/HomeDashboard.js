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

function DirectorWorkspace({ pj, appr, missingDpr, man, weekData, pendCount, pos, billing, autoTasks, myTasks, taskPending, directorName, onProjects, onSite, onComplete, desk }) {
  const first = (name) => String(name || "").trim().split(/\s+/)[0] || "there";
  const inTransit = pos.filter(p => p.delivery_status === "dispatched").length;
  const partial = pos.filter(p => p.delivery_status === "partial").length;
  const totalApprovals = appr.po + appr.adv + appr.claims + appr.petty;
  const health = p => p.status === "delayed" ? "#ef4444" : p.status === "on_hold" ? "#f59e0b" : p.status === "completed" ? "#94a3b8" : "#22a45d";
  const initial = n => String(n || "?").replace(/[^A-Za-z ]/g,"").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase() || "?";
  const fmt = n => crore(Number(n)||0);
  const maxTrend = Math.max(1,...(billing?.billed||[]),...(billing?.collected||[]));
  const months = billing?.months || [];
  const route = (web,mobilePath) => desk ? web : (mobilePath || web);
  const chip = (txt, tone, href) => <Link href={href} key={txt} style={{display:"inline-flex",alignItems:"center",gap:6,whiteSpace:"nowrap",padding:"7px 11px",borderRadius:999,background:tone.bg,color:tone.fg,textDecoration:"none",fontSize:12,fontWeight:700,border:"1px solid "+tone.border}}>{txt}<span aria-hidden="true">→</span></Link>;
  const tile = (title, children, href, cls="") => <Link href={href} style={{textDecoration:"none",color:"#1f2937",gridColumn:cls==="wide"?"span 2":undefined,display:"block",minWidth:0}}>
    <article style={{height:"100%",minHeight:desk?164:150,background:"#fff",border:"1px solid #e6e2d9",borderRadius:17,padding:15,boxShadow:"0 2px 8px rgba(31,41,55,.045)",overflow:"hidden"}}>
      <h3 style={{fontSize:14,margin:"0 0 10px",display:"flex",justifyContent:"space-between",alignItems:"center",fontWeight:750}}>{title}<span style={{fontSize:12,color:"#f26a1b"}}>↗</span></h3>{children}
    </article>
  </Link>;
  return <div style={{background:"#f3f0ea",color:"#1f2937",padding:"0 0 8px"}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
      <div style={{width:42,height:42,borderRadius:"50%",background:"linear-gradient(135deg,#ffb27a,#f26a1b)",color:"#fff",display:"grid",placeItems:"center",fontWeight:800,fontSize:17,boxShadow:"0 3px 9px #f26a1b33"}}>{initial(directorName)}</div>
      <div style={{minWidth:0,flex:1}}><div style={{fontSize:10,color:"#6b7280",fontWeight:800,letterSpacing:".08em",textTransform:"uppercase"}}>Director · {new Intl.DateTimeFormat("en-IN",{weekday:"short",day:"2-digit",month:"short",timeZone:"Asia/Kolkata"}).format(new Date())}</div><div style={{fontSize:18,fontWeight:800,color:"#0f1b3a"}}>Portfolio at a glance</div></div>
      <button type="button" onClick={onProjects} style={{border:"1px solid #e6e2d9",borderRadius:10,background:"#fff",padding:"9px 12px",fontWeight:700,color:"#1f2937",cursor:"pointer"}}>All sites&nbsp; →</button>
    </div>
    <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:4,marginBottom:11}}>
      {totalApprovals>0&&chip("✅ "+totalApprovals+" approvals",{bg:"#fff0dc",fg:"#8a4b08",border:"#f2d5b4"},route("/approvals","/m/approvals"))}
      {missingDpr>0&&chip("📋 "+missingDpr+" DPR missing",{bg:"#fff0f0",fg:"#ad2929",border:"#f2caca"},"/dpr")}
      {inTransit>0&&chip("🚚 "+inTransit+" in transit",{bg:"#eef2f7",fg:"#334155",border:"#dce2eb"},"/procure/pending")}
      {pendCount>0&&chip("📦 "+pendCount+" pending lines",{bg:"#f1efff",fg:"#5d45a7",border:"#ded9f7"},"/procure/pending")}
    </div>
    <div style={{display:"grid",gridTemplateColumns:desk?"repeat(4,minmax(0,1fr))":"repeat(2,minmax(0,1fr))",gap:11}}>
      <Link href="/projects" style={{textDecoration:"none",color:"#fff",gridColumn:"span 2"}}>
        <article style={{height:"100%",minHeight:desk?164:150,borderRadius:17,padding:15,background:"linear-gradient(120deg,#ff8a3d,#f26a1b 58%,#d8530a)",boxShadow:"0 7px 16px #d8530a28",overflow:"hidden"}}>
          <h3 style={{fontSize:14,margin:"0 0 10px",fontWeight:750}}>Portfolio</h3>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
            <div><div style={{fontSize:23,fontWeight:850}}>{fmt(pj.invoiced)}</div><small style={{opacity:.9}}>billed of {fmt(pj.contract)} contract</small></div>
            <div style={{width:67,height:67,borderRadius:"50%",border:"6px solid #ffffff48",borderTopColor:"#fff",display:"grid",placeItems:"center",fontSize:16,fontWeight:800}}>{pj.avg}%</div>
          </div>
          <div style={{height:7,background:"#ffffff40",borderRadius:8,margin:"9px 0 7px",overflow:"hidden"}}><div style={{height:"100%",width:pj.contract?Math.min(100,pj.invoiced/pj.contract*100)+"%":"0%",background:"#fff",borderRadius:8}}/></div>
          <small>{pj.total} sites · {pj.active} active · {pj.hold} on hold · {pj.delayed} delayed · average progress {pj.avg}%</small>
        </article>
      </Link>
      {tile("Approvals",<><div style={{fontSize:28,fontWeight:850,color:"#0f1b3a"}}>{totalApprovals}</div><div style={{display:"flex",height:8,borderRadius:9,overflow:"hidden",margin:"9px 0 6px"}}>{[[appr.petty,"#f59e0b"],[appr.claims,"#3b82f6"],[appr.adv,"#7c3aed"],[appr.po,"#ef4444"]].map(([n,c],i)=><i key={i} style={{flex:Math.max(0,n),minWidth:n?4:0,background:c}}/>)}</div><small style={{color:"#6b7280"}}>Petty {appr.petty} · Claims {appr.claims} · Advances {appr.adv} · PO {appr.po}</small></>,"/approvals")}
      {tile("DPR today",<div style={{display:"flex",alignItems:"center",gap:10}}><svg width="76" height="76" viewBox="0 0 76 76" aria-label={Math.max(0,pj.total-missingDpr)+" sites filed DPR out of "+pj.total}><circle cx="38" cy="38" r="29" fill="none" stroke="#fbd0d0" strokeWidth="10"/><circle cx="38" cy="38" r="29" fill="none" stroke="#22a45d" strokeWidth="10" strokeDasharray={(pj.total?Math.max(0,pj.total-missingDpr)/pj.total:0)*182+" 182"} transform="rotate(-90 38 38)"/><text x="38" y="42" textAnchor="middle" fontSize="12" fontWeight="800" fill="#1f2937">{Math.max(0,pj.total-missingDpr)}/{pj.total}</text></svg><div><b style={{fontSize:18}}>{missingDpr}</b><div style={{fontSize:11,color:"#6b7280"}}>sites missing</div></div></div>,route("/dpr","/m/dpr"))}
      <div style={{gridColumn:"span 2"}}>{tile("Manpower · last 7 days",<><div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}><b style={{fontSize:22}}>{man.inNow} <small style={{fontSize:11,fontWeight:500,color:"#6b7280"}}>on site today</small></b><small style={{color:"#1a8f3c",fontWeight:700}}>{weekData.length>1?((weekData.at(-1)?.n||0)-(weekData.at(-2)?.n||0)>=0?"▲ ":"▼ ")+Math.abs((weekData.at(-1)?.n||0)-(weekData.at(-2)?.n||0))+" vs yesterday":"Live attendance"}</small></div><div style={{height:64,display:"flex",alignItems:"end",gap:7,marginTop:5}}>{weekData.map((d,i)=><div key={d.date} title={d.date+": "+d.n+" present"} style={{flex:1,textAlign:"center"}}><div style={{height:Math.max(3,Math.round((d.n/Math.max(1,...weekData.map(x=>x.n)))*43)),background:i===weekData.length-1?"#f26a1b":"#fbc9a5",borderRadius:"4px 4px 0 0"}}/><small style={{fontSize:9,color:"#6b7280"}}>{d.day}</small></div>)}</div></>,"/attendance")}</div>
      {tile("Deliveries",<><div style={{fontSize:26,fontWeight:850}}>{pendCount}</div><small style={{color:"#6b7280"}}>pending delivery lines</small><div style={{display:"flex",height:8,borderRadius:9,overflow:"hidden",margin:"10px 0 7px"}}>{[[pendCount,"#f59e0b"],[inTransit,"#3b82f6"],[partial,"#7c3aed"]].map(([n,c],i)=><i key={i} style={{flex:Math.max(n,0),minWidth:n?4:0,background:c}}/>)}</div><small style={{color:"#6b7280"}}>{inTransit} in transit · {partial} partial</small></>,"/procure/pending")}
      {tile("Payables",<><div style={{fontSize:24,fontWeight:850,color:"#6b7280"}}>—</div><div style={{display:"flex",gap:5,margin:"13px 0 8px"}}>{["#ef4444","#f59e0b","#3b82f6","#94a3b8"].map(c=><i key={c} style={{height:8,flex:1,background:c,borderRadius:5,opacity:.35}}/>)}</div><small style={{color:"#6b7280"}}>Payable ageing is not recorded in the current finance data.</small></>,"/expenses")}
      <div style={{gridColumn:"span 2"}}>{tile("Billed vs Collected · last 6 months",<><div style={{display:"flex",gap:13,fontSize:10.5,color:"#6b7280",marginBottom:3}}><span><i style={{display:"inline-block",width:8,height:8,background:"#f26a1b",borderRadius:9,marginRight:5}}/>Billed</span><span><i style={{display:"inline-block",width:8,height:8,background:"#22a45d",borderRadius:9,marginRight:5}}/>Collected</span></div><div style={{height:75,display:"flex",alignItems:"end",gap:9}}>{months.map((m,i)=>{const a=billing?.billed?.[i]||0,b=billing?.collected?.[i]||0;return <div key={m} title={m+": billed "+inr(a)+", collected "+inr(b)} style={{flex:1,display:"flex",alignItems:"end",justifyContent:"center",gap:3,height:"100%"}}><i style={{height:Math.max(a?3:0,a/maxTrend*54),width:"35%",background:"#f26a1b",borderRadius:"4px 4px 0 0"}}/><i style={{height:Math.max(b?3:0,b/maxTrend*54),width:"35%",background:"#22a45d",borderRadius:"4px 4px 0 0"}}/></div>})}</div><div style={{display:"flex",gap:9,justifyContent:"space-around",fontSize:9,color:"#6b7280",marginTop:4}}>{months.map(m=><span key={m}>{new Intl.DateTimeFormat("en-IN",{month:"short",timeZone:"Asia/Kolkata"}).format(new Date(m+"-01T12:00:00"))}</span>)}</div>{!billing&&<small style={{color:"#6b7280"}}>Loading verified RA bill totals…</small>}{billing?.error&&<small style={{color:"#ad2929"}}>Billing trend is unavailable right now.</small>}{billing&&!billing.error&&maxTrend===1&&<small style={{color:"#6b7280"}}>No RA bills recorded in this period.</small>}</>,"/expenses")}</div>
      <div style={{gridColumn:"span 2"}}>{tile("Site health",<><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(28px,1fr))",gap:5}}>{pj.all.slice(0,28).map(p=><button key={p.id} type="button" title={p.name+" · "+(ST_META[p.status]?.[0]||p.status)} onClick={e=>{e.preventDefault();onSite(p.id)}} style={{width:"100%",aspectRatio:"1",border:0,borderRadius:7,background:health(p),color:"#fff",fontSize:9,fontWeight:800,cursor:"pointer"}}>{initial(p.name)}</button>)}</div><div style={{display:"flex",gap:11,flexWrap:"wrap",marginTop:9,fontSize:10,color:"#6b7280"}}>{[["#22a45d","Active"],["#ef4444","Delayed"],["#f59e0b","On hold"],["#94a3b8","Other"]].map(([c,l])=><span key={l}><i style={{display:"inline-block",width:8,height:8,borderRadius:8,background:c,marginRight:4}}/>{l}</span>)}</div></>,"/projects")}</div>
    </div>
    <section style={{marginTop:15}}><h2 style={{fontSize:16,margin:"0 0 8px",color:"#1f2937"}}>Modules</h2><div style={{display:"flex",gap:7,overflowX:desk?"visible":"auto",flexWrap:desk?"wrap":"nowrap",paddingBottom:4}}>
      {[
        ["My Expenses","🧾","/my-expenses"],["Finance","💰","/expenses"],["Analytics","📊","/reports"],["All Sites","🏗","/projects"],["PO","📄","/procure?tab=po"],["Pending Del.","🚚","/procure/pending"],["Vendors","🏢","/vendors"],["Assign Task","📝","/tasks"],["Admin","⚙","/admin-access"],["Site Report","📋","/dpr"]
      ].map(([label,ico,href])=><Link key={label} href={href} style={{minWidth:desk?78:72,width:desk?82:76,flexShrink:0,textAlign:"center",textDecoration:"none",color:"#1f2937",fontSize:10.5,fontWeight:650}}><span style={{margin:"0 auto 4px",width:40,height:40,borderRadius:"50%",display:"grid",placeItems:"center",background:"#fff",border:"1px solid #e6e2d9",fontSize:19}}>{ico}</span>{label}</Link>)}
    </div></section>
    <section style={{marginTop:14,background:"#fff",border:"1px solid #e6e2d9",borderRadius:16,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><h2 style={{margin:0,fontSize:16}}>My tasks today</h2><Link href="/tasks" style={{color:"#f26a1b",fontSize:12,textDecoration:"none"}}>View all →</Link></div>
      <div style={{display:"flex",gap:7,marginBottom:8}}>{taskPending>0&&<span style={{background:"#c62828",color:"#fff",borderRadius:20,padding:"3px 9px",fontSize:10,fontWeight:800}}>{taskPending} pending</span>}<button type="button" onClick={()=>window.dispatchEvent(new Event("psk-open-quick-action"))} style={{border:0,background:"#fff3e8",color:"#b95416",borderRadius:20,padding:"3px 9px",fontSize:10,fontWeight:700}}>＋ Assign task</button></div>
      {[...autoTasks.map((t,i)=>({...t,_key:"auto"+i})),...myTasks.map(t=>({...t,_key:"task"+t.id}))].slice(0,6).map(t=><div key={t._key} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 0",borderTop:"1px solid #f0eee9"}}>
        <span style={{width:29,height:29,borderRadius:9,background:"#f7f4ee",display:"grid",placeItems:"center"}}>{t.ico||"📝"}</span><span style={{flex:1,minWidth:0}}><b style={{display:"block",fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name||t.title}</b><small style={{color:"#6b7280"}}>{t.desc||("Assigned: "+(t.assignee||"Team")+" · "+(t.priority||"Normal"))}</small></span><span style={{fontSize:10,color:t.done?"#1a8f3c":"#d97706",fontWeight:750}}>{t.done?"Done":t.status||"Pending"}</span>{t.id&&t.status!=="completed"&&<button type="button" onClick={()=>onComplete(t)} aria-label="Mark task done" style={{border:"1px solid #d6e9dc",borderRadius:9,padding:"5px 8px",background:"#fff",color:"#1a8f3c",fontSize:10,fontWeight:700}}>Done</button>}
      </div>)}
      {!autoTasks.length&&!myTasks.length&&<div style={{fontSize:12,color:"#6b7280",padding:"12px 0"}}>No tasks due today.</div>}
    </section>
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
  const [billingTrend, setBillingTrend] = useState(null);
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

  const billingSiteKey = pj.all.map(p => p.id).join(",");
  useEffect(() => {
    if (!companyView || !billingSiteKey || isDemo || !supabase) { if (!companyView) setBillingTrend(null); return; }
    let alive = true;
    (async () => {
      const ids = billingSiteKey.split(",").filter(Boolean).map(Number);
      const months = [];
      const now = new Date(todayLocal() + "T12:00:00");
      for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")); }
      const empty = Object.fromEntries(months.map(m => [m,{ billed:0, collected:0 }]));
      try {
        const { data: bills, error: be } = await supabase.from("ra_bills").select("id, site_id, bill_no, bill_date, status, billing_mode, material_pct, install_pct").in("site_id",ids).order("site_id").order("bill_no");
        if (be) throw be;
        const billIds = (bills || []).map(b => b.id);
        if (!billIds.length) { if(alive) setBillingTrend({months,billed:months.map(()=>0),collected:months.map(()=>0)}); return; }
        const [{data:lines,error:le},{data:boq,error:qe}] = await Promise.all([
          supabase.from("ra_bill_lines").select("ra_bill_id, boq_item_id, cum_qty, cum_material_qty, cum_install_qty, cum_tc_qty, rate, sup_pct, ins_pct, tc_pct").in("ra_bill_id",billIds),
          supabase.from("boq_items").select("id, rate").in("site_id",ids)
        ]);
        if (le) throw le; if (qe) throw qe;
        const rates = Object.fromEntries((boq||[]).map(x=>[x.id,Number(x.rate)||0]));
        const byBill = new Map();
        (lines||[]).forEach(l=>{const a=byBill.get(l.ra_bill_id)||[];a.push(l);byBill.set(l.ra_bill_id,a);});
        const prior = new Map();
        for (const bill of (bills||[])) {
          const lineRows=byBill.get(bill.id)||[];
          const cumulative=lineRows.reduce((sum,l)=>{
            const rate=l.rate!=null?Number(l.rate):(rates[l.boq_item_id]||0);
            if(bill.billing_mode==="staged") return sum+rate*((Number(l.cum_material_qty)||0)*(Number(l.sup_pct)||0)+(Number(l.cum_install_qty)||0)*(Number(l.ins_pct)||0)+(Number(l.cum_tc_qty)||0)*(Number(l.tc_pct)||0))/100;
            if(bill.billing_mode==="split") return sum+(Number(l.cum_material_qty)||0)*rate*(Number(bill.material_pct)||0)/100+(Number(l.cum_install_qty)||0)*rate*(Number(bill.install_pct)||0)/100;
            return sum+(Number(l.cum_qty)||0)*rate;
          },0);
          const prev=prior.get(bill.site_id)||0, amount=Math.max(0,cumulative-prev);
          prior.set(bill.site_id,cumulative);
          if(["certified","paid"].includes(bill.status)) {
            const month=String(bill.bill_date||"").slice(0,7);
            if(empty[month]) { empty[month].billed+=amount; if(bill.status==="paid") empty[month].collected+=amount; }
          }
        }
        if(alive) setBillingTrend({months,billed:months.map(m=>empty[m].billed),collected:months.map(m=>empty[m].collected)});
      } catch { if(alive) setBillingTrend({months:[],billed:[],collected:[],error:true}); }
    })();
    return()=>{alive=false;};
  }, [companyView,billingSiteKey]);
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
        {!companyView && (
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
        )}

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

        {companyView ? <DirectorWorkspace pj={pj} appr={appr} missingDpr={dprMissing.length} man={man} weekData={weekData} pendCount={pendCount} pos={pos} billing={billingTrend} autoTasks={autoTasks} myTasks={myTasks} taskPending={taskPending} directorName={sess?.name || sess?.full_name} desk={desk} onProjects={openProjects} onComplete={completeTask} onSite={id => { setAsSite(Number(id)); window.scrollTo({ top: 0, behavior: "smooth" }); }} /> : (
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
        {!companyView && (rights.open || appr.ind > 0) && (
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
