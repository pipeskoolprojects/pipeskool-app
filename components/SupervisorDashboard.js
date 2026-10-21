"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { canSeeModule, canAnySite, setCurrentSite } from "@/lib/auth";
import { getMuster } from "@/lib/mobile";
import { getOpenIndents } from "@/lib/procure";
import { getTodayDpr, getProgress } from "@/lib/dpr";
import { getExpenseClaimQueue } from "@/lib/money";
import { getTasks } from "@/lib/tasks";
import { getMyNotifications } from "@/lib/notify";

const ORANGE = "#f47716";
const modules = [
  ["🛒","Order Material","Create indent and track material","/m/indent","indent"],
  ["👥","Muster","Review worker attendance and muster roll","/m/muster","attendance"],
  ["📋","DPR","Create and submit Daily Progress Report","/m/dpr","dpr"],
  ["🚚","Order Details","Deliveries, challans and GRN","/m/deliveries","stock"],
  ["₹","Money & Expenses","Site expense claims and petty cash","/m/money","money"],
  ["☑","My Task","Today’s work, pending items and approvals","/m/tasks",null],
  ["👷","Add Worker","Register and update worker details","/m/add","workers"],
];
const colors = ["#fff0e5","#eaf6ff","#eaffef","#f3eaff","#ffecef","#fff8df","#e5fbff"];
const dateKey = () => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata"}).format(new Date());
function canOpen(sess, module) { return !module || canSeeModule(sess,module) || (module==="workers" && (canAnySite(sess,"workers","create") || canAnySite(sess,"workers","manage"))); }

export default function SupervisorDashboard({ sess }) {
  const [data,setData]=useState(null),[busy,setBusy]=useState(true),[err,setErr]=useState("");
  const [siteId,setSiteId]=useState(sess.currentSite || sess.sites?.[0]?.id || "");
  const [now,setNow]=useState(new Date());
  const site=(sess.sites||[]).find(x=>String(x.id)===String(siteId));
  const load=useCallback(async()=>{
    if(!siteId){setData({});setBusy(false);return;}
    setBusy(true);setErr("");
    const jobs=await Promise.allSettled([
      canSeeModule(sess,"attendance",siteId)?getMuster(siteId):Promise.resolve(null),
      canSeeModule(sess,"indent",siteId)?getOpenIndents(siteId):Promise.resolve(null),
      canSeeModule(sess,"dpr",siteId)?Promise.all([getTodayDpr(siteId),getProgress(siteId)]):Promise.resolve(null),
      canSeeModule(sess,"money",siteId)?getExpenseClaimQueue(siteId):Promise.resolve(null),
      getTasks(),getMyNotifications(8),
    ]);
    const next={};
    jobs.forEach((j,i)=>{if(j.status==="fulfilled")next[i]=j.value;});
    if(jobs.some(j=>j.status==="rejected"))setErr("Some dashboard details could not load. Retry to check the latest data.");
    setData(next);setBusy(false);
  },[sess,siteId]);
  useEffect(()=>{load();const t=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(t);},[load]);
  const greeting=now.getHours()<12?"Good morning":now.getHours()<17?"Good afternoon":"Good evening";
  const muster=data?.[0], indents=data?.[1], dprPack=data?.[2], expenses=data?.[3], taskResult=data?.[4], notifications=data?.[5];
  const tasks=Array.isArray(taskResult)?taskResult:[];
  const todayTasks=tasks.filter(t=>t.status!=="completed").slice(0,4);
  const progress=(dprPack?.[1]||[]).slice(0,4);
  const expenseMonth=useMemo(()=>Array.isArray(expenses)?expenses.filter(e=>String(e.expense_date||e.date||"").slice(0,7)===dateKey().slice(0,7)&&e.status==="approved").reduce((n,e)=>n+Number(e.amount||0),0):null,[expenses]);
  const links=modules.filter(m=>canOpen(sess,m[4]));
  const workerCount=Array.isArray(muster)?muster.length:null;
  const pendingIndents=Array.isArray(indents)?indents.filter(x=>["open","pending","quoting"].includes(String(x.status||"").toLowerCase())).length:null;
  const dprDone=dprPack?.[0]!==null&&dprPack?.[0]!==undefined;
  return <main className="sv-wrap">
    <header className="sv-hero">
      <div className="sv-top"><Logo variant="white" height={26}/><button aria-label="Open menu" className="sv-avatar" onClick={()=>window.dispatchEvent(new Event("psk-open-more"))}>☰</button></div>
      <div className="sv-greet">{greeting},</div><div className="sv-name">{sess.name||"Supervisor"}</div>
      <div className="sv-sub">📍 Supervisor {site?<>　|　{site.name}</>:null}</div>
      {(sess.sites||[]).length>1&&<select aria-label="Current site" className="sv-site" value={siteId} onChange={e=>{setSiteId(e.target.value);setCurrentSite(e.target.value);}}>{sess.sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      <div className="sv-stats">
        <Link href="/m/muster"><b>{busy?"—":workerCount??"—"}</b><strong>Workers</strong><small>Assigned site</small></Link>
        <Link href="/m/indent"><b>{busy?"—":pendingIndents??"—"}</b><strong>Materials</strong><small>Open requests</small></Link>
        <Link href="/m/dpr"><b>{busy?"—":dprDone?"✓":"—"}</b><strong>DPR</strong><small>Today</small></Link>
        <Link href="/m/money"><b>{busy?"—":expenseMonth===null?"—":"₹"+expenseMonth.toLocaleString("en-IN")}</b><strong>Expenses</strong><small>This month</small></Link>
      </div>
    </header>
    <div className="sv-content">
      {err&&<div className="sv-error" role="alert">{err}<button onClick={load}>Retry</button></div>}
      <section className="sv-grid" aria-label="Supervisor modules">{links.map((m)=>{const i=modules.indexOf(m);return <Link key={m[1]} href={m[3]} className="sv-card" style={{background:colors[i]}}><span className="sv-icon">{m[0]}</span><b>{i+1}. {m[1]}</b><span>{m[2]}</span><i aria-hidden="true">→</i></Link>})}</section>
      <section className="sv-panel"><div className="sv-panel-head"><h2>Today’s Site Progress</h2><Link href="/m/report">View all →</Link></div>
        {busy?<p className="sv-muted">Loading progress…</p>:progress.length?progress.map((p,i)=>{const pct=Number(p.boq)>0?Math.max(0,Math.min(100,Math.round(Number(p.done||0)/Number(p.boq)*100))):null;return <div className="sv-progress" key={p.description+i}><span>🏗</span><div><b>{p.description}</b><div className="sv-track"><span style={{width:pct===null?"0%":pct+"%"}}/></div></div><strong>{pct===null?"—":pct+"%"}</strong></div>}):<p className="sv-muted">No progress records available for this site.</p>}
      </section>
      <section className="sv-lower">
        <div className="sv-panel"><div className="sv-panel-head"><h2>Today’s Tasks</h2><Link href="/m/tasks">View all →</Link></div>{busy?<p className="sv-muted">Loading tasks…</p>:todayTasks.length?todayTasks.map(t=><Link className="sv-row" href="/m/tasks" key={t.id}><span className="sv-check">○</span><span>{t.title}</span><small>{t.due||t.status}</small></Link>):<p className="sv-muted">No open tasks.</p>}</div>
        <div className="sv-panel"><div className="sv-panel-head"><h2>Recent Activity</h2><Link href="/m/notifications">View all →</Link></div>{(notifications?.rows||[]).length?(notifications.rows.slice(0,4).map(n=><Link className="sv-row" href={n.link?.startsWith("/")?n.link:"/m/notifications"} key={n.id}><span className="sv-check">•</span><span><b>{n.title}</b><small>{n.body||n.sites?.name||""}</small></span><small>{n.created_at?new Date(n.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):""}</small></Link>)): <p className="sv-muted">No recent activity.</p>}</div>
      </section>
    </div>
    <style jsx>{`
      .sv-wrap{min-height:100dvh;background:#f3f6fa;color:#101828;padding-bottom:calc(82px + env(safe-area-inset-bottom));font-family:inherit}
      .sv-hero{background:linear-gradient(135deg,#101c30,#263e57);color:white;padding:calc(16px + env(safe-area-inset-top)) 16px 18px;border-radius:0 0 24px 24px}
      .sv-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:26px}.sv-avatar{height:44px;min-width:44px;border:1px solid #ffffff55;border-radius:50%;background:#ffffff18;color:white;font-size:22px}
      .sv-greet{font-size:16px;opacity:.86}.sv-name{font-size:25px;font-weight:800;margin:1px 0 6px}.sv-sub{font-size:14px;opacity:.9}
      .sv-site{margin-top:12px;border-radius:10px;border:1px solid #ffffff55;background:#20344d;color:white;padding:8px;max-width:100%}
      .sv-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:22px -3px 0;background:white;color:#101828;border-radius:18px;padding:12px 4px;box-shadow:0 5px 18px #0002}
      .sv-stats a{min-width:0;text-decoration:none;color:inherit;padding:3px 7px;border-right:1px solid #e4e7ec;display:flex;flex-direction:column;gap:2px}.sv-stats a:last-child{border:0}.sv-stats b{font-size:clamp(15px,4.5vw,23px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sv-stats strong{font-size:12px}.sv-stats small{font-size:10px;color:#667085}
      .sv-content{max-width:900px;margin:0 auto;padding:14px 12px}.sv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .sv-card{position:relative;min-height:158px;padding:15px 13px;border-radius:17px;text-decoration:none;color:#101828;display:flex;flex-direction:column;align-items:flex-start;gap:7px;box-shadow:0 2px 8px #1018280b}
      .sv-icon{display:grid;place-items:center;width:54px;height:54px;border-radius:50%;background:#ffffffaa;font-size:27px}.sv-card b{font-size:15px}.sv-card>span:not(.sv-icon){font-size:12px;line-height:1.4;color:#475467;padding-right:12px}.sv-card i{position:absolute;right:12px;bottom:11px;font-style:normal;border-radius:20px;background:#ffffffaa;padding:5px 11px;font-size:18px}
      .sv-panel{background:#fff;border-radius:17px;padding:14px;margin-top:12px;box-shadow:0 2px 8px #1018280b;min-width:0}.sv-panel-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.sv-panel-head h2{font-size:16px;margin:0}.sv-panel-head a{font-size:12px;color:#1674d1;text-decoration:none;white-space:nowrap}
      .sv-progress{display:grid;grid-template-columns:34px minmax(0,1fr) 42px;gap:8px;align-items:center;border-bottom:1px solid #eef0f3;padding:10px 0}.sv-progress:last-child{border:0}.sv-progress b{font-size:12px;font-weight:600}.sv-progress strong{font-size:12px;text-align:right}.sv-track{height:8px;background:#e9edf2;border-radius:8px;margin-top:6px;overflow:hidden}.sv-track span{height:100%;display:block;background:#18b86a;border-radius:8px}
      .sv-lower{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sv-row{min-height:48px;display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eef0f3;text-decoration:none;color:#101828;font-size:12px}.sv-row>span:nth-child(2){flex:1;min-width:0}.sv-row small{font-size:10px;color:#667085}.sv-row span small{display:block;margin-top:3px}.sv-check{font-size:20px;color:#12a35a}.sv-muted{color:#667085;font-size:13px}.sv-error{padding:12px;background:#fff0f0;border-radius:10px;color:#a32727;font-size:13px}.sv-error button{float:right}
      @media(max-width:360px){.sv-stats{padding:10px 2px}.sv-stats a{padding:2px 4px}.sv-stats small{font-size:9px}.sv-content{padding-left:9px;padding-right:9px}.sv-card{padding:12px 10px;min-height:150px}.sv-lower{grid-template-columns:1fr}}
    `}</style>
  </main>;
}
