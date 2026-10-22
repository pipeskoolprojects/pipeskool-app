"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import styles from "./SupervisorDashboard.module.css";
import { canSeeModule, canAnySite, hasAdminCap, setCurrentSite } from "@/lib/auth";
import { getMuster } from "@/lib/mobile";
import { getOpenIndents } from "@/lib/procure";
import { getTodayDpr, getProgress } from "@/lib/dpr";
import { getExpenseClaimQueue } from "@/lib/money";
import { getTasks } from "@/lib/tasks";
import { getMyNotifications } from "@/lib/notify";
import { getRepairDashboardCount } from "@/lib/machine-repair";
import { approvedExpenseTotal, countOpenIndents, progressPercent } from "@/lib/supervisor-dashboard.mjs";

const modules = [
  ["⏱","Punch","Punch in and out","/m",null],
  ["🛒","Order Material","Create indent and track material","/m/indent","indent"],
  ["👥","Muster","Review worker attendance and muster roll","/m/muster","attendance"],
  ["📋","DPR","Create and submit Daily Progress Report","/m/dpr","dpr"],
  ["🚚","Order Details","Deliveries, challans and GRN","/m/deliveries","stock"],
  ["₹","Money & Expenses","Site expense claims and petty cash","/m/money","money"],
  ["☑","My Task","Today’s work, pending items and approvals","/m/tasks",null],
  ["👷","Add Worker","Register and update worker details","/m/add","workers"],
  ["🛠","Machine Repair","Send tools & machines for repair and track them","/m/repairs","machine_repair"],
];
const colors = ["#fff0e5","#eaf6ff","#eaffef","#f3eaff","#ffecef","#fff8df","#e5fbff","#f0edff","#e8f8f4"];
const roleLabels = { supervisor: "Supervisor", storekeeper: "Storekeeper", site_engineer: "Site Engineer", project_coodinator: "Project Coordinator", ho_admin: "Accountant" };
const dateKey = () => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata"}).format(new Date());
function canOpen(sess, module) { return !module || canSeeModule(sess,module) || (module==="money" && hasAdminCap(sess,"view_all_money")) || (module==="workers" && (canAnySite(sess,"workers","create") || canAnySite(sess,"workers","manage"))); }

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
      (canSeeModule(sess,"money",siteId)||hasAdminCap(sess,"view_all_money"))?getExpenseClaimQueue(siteId):Promise.resolve(null),
      getTasks(),getMyNotifications(8),
      canSeeModule(sess,"machine_repair",siteId)?getRepairDashboardCount(siteId):Promise.resolve(0),
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
  const expenseMonth=useMemo(()=>approvedExpenseTotal(expenses,dateKey().slice(0,7)),[expenses]);
  const repairCount=Number(data?.[6]||0);
  const links=modules.filter(m=>canOpen(sess,m[4]));
  const workerCount=Array.isArray(muster)?muster.length:null;
  const pendingIndents=countOpenIndents(indents);
  const dprDone=dprPack?.[0]!==null&&dprPack?.[0]!==undefined;
  return <main className={styles.wrap}>
    <header className={styles.hero}>
      <div className={styles.top}><Logo variant="white" height={26}/><div className={styles.actions}><button aria-label="Open Pipeskool Assistant" className={styles.assistant} onClick={()=>window.dispatchEvent(new Event("psk-open-assistant"))}>🤖</button><button aria-label="Open menu" className={styles.avatar} onClick={()=>window.dispatchEvent(new Event("psk-open-more"))}>☰</button></div></div>
      <div className={styles.greet}>{greeting},</div><div className={styles.name}>{sess.name||"Supervisor"}</div>
      <div className={styles.sub}>📍 {roleLabels[sess.role] || "Site Staff"} {site?<>　|　{site.name}</>:null}</div>
      {(sess.sites||[]).length>1&&<select aria-label="Current site" className={styles.site} value={siteId} onChange={e=>{setSiteId(e.target.value);setCurrentSite(e.target.value);}}>{sess.sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      <div className={styles.stats}>
        <Link href="/m/muster" className={styles.stat}><b className={styles.statValue}>{busy?"—":workerCount??"—"}</b><strong className={styles.statLabel}>Workers</strong><small className={styles.statHint}>Assigned site</small></Link>
        <Link href="/m/indent" className={styles.stat}><b className={styles.statValue}>{busy?"—":pendingIndents??"—"}</b><strong className={styles.statLabel}>Materials</strong><small className={styles.statHint}>Open requests</small></Link>
        <Link href="/m/dpr" className={styles.stat}><b className={styles.statValue}>{busy?"—":dprDone?"✓":"—"}</b><strong className={styles.statLabel}>DPR</strong><small className={styles.statHint}>Today</small></Link>
        <Link href="/m/money" className={styles.stat}><b className={styles.statValue}>{busy?"—":expenseMonth===null?"—":"₹"+expenseMonth.toLocaleString("en-IN")}</b><strong className={styles.statLabel}>Expenses</strong><small className={styles.statHint}>This month</small></Link>
      </div>
    </header>
    <div className={styles.content}>
      {err&&<div className={styles.error} role="alert">{err}<button onClick={load}>Retry</button></div>}
      <section className={styles.grid} aria-label="Site modules">{links.map((m)=>{const i=modules.indexOf(m);return <Link key={m[1]} href={m[3]} className={styles.card} style={{background:colors[i]}}><span className={styles.icon}>{m[0]}</span><b className={styles.cardTitle}>{m[1]==="Machine Repair"?"7. Machine Repair":(i+1)+". "+m[1]}</b>{m[1]==="Machine Repair"&&repairCount>0&&<small className={styles.liveChip}>{repairCount} with vendor</small>}<span className={styles.cardDescription}>{m[2]}</span><i className={styles.arrow} aria-hidden="true">→</i></Link>})}</section>
      <section className={styles.panel}><div className={styles.panelHead}><h2>Today’s Site Progress</h2><Link href="/m/report">View all →</Link></div>
        {busy?<p className={styles.muted}>Loading progress…</p>:progress.length?progress.map((p,i)=>{const pct=progressPercent(p.done,p.boq);return <div className={styles.progress} key={p.description+i}><span>🏗</span><div><b className={styles.progressTitle}>{p.description}</b><div className={styles.track}><span className={styles.trackFill} style={{width:pct===null?"0%":pct+"%"}}/></div></div><strong>{pct===null?"—":pct+"%"}</strong></div>}):<p className={styles.muted}>No progress records available for this site.</p>}
      </section>
      <section className={styles.lower}>
        <div className={styles.panel}><div className={styles.panelHead}><h2>Today’s Tasks</h2><Link href="/m/tasks">View all →</Link></div>{busy?<p className={styles.muted}>Loading tasks…</p>:todayTasks.length?todayTasks.map(t=><Link className={styles.row} href="/m/tasks" key={t.id}><span className={styles.check}>○</span><span className={styles.rowMain}>{t.title}</span><small>{t.due||t.status}</small></Link>):<p className={styles.muted}>No open tasks.</p>}</div>
        <div className={styles.panel}><div className={styles.panelHead}><h2>Recent Activity</h2><button type="button" onClick={() => window.dispatchEvent(new Event("psk-open-notifications"))} className={styles.viewAll}>View all →</button></div>{(notifications?.rows||[]).length?(notifications.rows.slice(0,4).map(n=><Link className={styles.row} href={n.link?.startsWith("/")?n.link:"/m/dashboard"} key={n.id}><span className={styles.check}>•</span><span className={styles.rowMain}><b>{n.title}</b><small>{n.body||n.sites?.name||""}</small></span><small>{n.created_at?new Date(n.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):""}</small></Link>)): <p className={styles.muted}>No recent activity.</p>}</div>
      </section>
    </div>

  </main>;
}
