"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, refreshSessionRights, setCurrentSite, canSeeModuleAnySite } from "@/lib/auth";
import { getMuster } from "@/lib/mobile";
import { getOpenIndents, getPOs } from "@/lib/procure";
import { getTodayDpr, getProgress } from "@/lib/dpr";
import { getExpenseClaimQueue, reviewExpenseClaim } from "@/lib/money";
import { getTasks, setTaskStatus } from "@/lib/tasks";
import { getBalances } from "@/lib/stock";
import { getMyNotifications } from "@/lib/notify";
import { getAttendanceHeatmap } from "@/lib/data";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

const isIT = role => String(role || "").toLowerCase().replace(/[^a-z]/g, "") === "itexecutive";
const localDate = date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");
const asArray = value => Array.isArray(value) ? value : [];
const safe = (request, timeoutMs = 8000) => new Promise(resolve => {
  let settled = false;
  const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
  const timer = setTimeout(() => finish({ __loadError: "Data request timed out" }), timeoutMs);
  try {
    Promise.resolve(typeof request === "function" ? request() : request)
      .then(finish, error => finish({ __loadError: error?.message || "Could not load data" }));
  } catch (error) {
    finish({ __loadError: error?.message || "Could not load data" });
  }
});

function buildDashboardData(session, siteId, raw) {
  const sites = asArray(session?.sites);
  const site = sites.find(x => String(x.id) === String(siteId)) || sites[0] || null;
  const muster = asArray(raw.muster);
  const presentRows = muster.filter(x => !!x.in || ["present","half_day"].includes(String(x.status || "").toLowerCase()));
  const absentRows = muster.filter(x => String(x.status || "").toLowerCase() === "absent");
  const present = presentRows.length;
  const onRoll = muster.length;
  const indents = asArray(raw.indents);
  const openIndents = indents.filter(x => ["open","pending","quoting","approved"].includes(String(x.status || "").toLowerCase()));
  const pos = asArray(raw.pos).filter(x => String(x.status || "").toLowerCase() !== "cancelled");
  const pendingPOs = pos.filter(x => x.received_pct == null ? x.delivery_status !== "delivered" : Number(x.received_pct) < 100);
  const pendingLines = pendingPOs.reduce((n,x) => n + (Number(x.item_count) || 1), 0);
  const expenses = asArray(raw.expenses);
  const now = new Date(), ym = localDate(now).slice(0,7);
  const inMonth = expenses.filter(x => String(x.expense_date || x.date || "").slice(0,7) === ym && !["rejected","reversed"].includes(String(x.status || "").toLowerCase()));
  const pendingClaims = expenses.filter(x => String(x.status || "").toLowerCase() === "pending");
  const approvedClaims = expenses.filter(x => String(x.status || "").toLowerCase() === "approved");
  const completeItems = asArray(raw.progress).filter(x => Number(x.boq) > 0);
  const completeTotal = completeItems.reduce((n,x) => n + Number(x.done || 0), 0);
  const boqTotal = completeItems.reduce((n,x) => n + Number(x.boq || 0), 0);
  const completePct = boqTotal ? Math.round(100 * completeTotal / boqTotal) : null;
  const todayDpr = raw.dpr;
  const dayCounts = new Map(asArray(raw.heatmap?.rows).map(x => [x.date, Number(x.count) || 0]));
  const today = localDate(now);
  const weekStart = new Date(now); weekStart.setDate(now.getDate()-now.getDay());
  const week = Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);const key=localDate(d);return {label:d.toLocaleDateString("en-IN",{weekday:"short"}),value:dayCounts.get(key)||0}});
  const stocks = asArray(raw.stock).filter(x => Number(x.min_stock) > 0).map(x => ({name:x.display_name || x.item_type || "Material",pct:Math.max(0,Math.min(100,Math.round(100*Number(x.balance||0)/Number(x.min_stock))))})).sort((a,b)=>a.pct-b.pct);
  const trends = Array.from({length:14},(_,i)=>{const d=new Date(now);d.setDate(now.getDate()-13+i);const key=localDate(d);const total=expenses.filter(x=>String(x.expense_date||x.date||"").slice(0,10)===key && ["approved","pending"].includes(String(x.status||"").toLowerCase())).reduce((n,x)=>n+Number(x.amount||0),0);return {label:key.slice(8),value:total}});
  const work = asArray(todayDpr?.work), workGroups = {Piping:0,Fixtures:0,Testing:0,Other:0};
  work.forEach(x=>{const label=String(x.label||"").toLowerCase(),group=/test|commission|flush|pressure/.test(label)?"Testing":/fixture|sanitary|wc|basin|tap/.test(label)?"Fixtures":/pipe|piping|weld|laying|erection/.test(label)?"Piping":"Other";workGroups[group]+=Number(x.qty||1)});
  const workMix=Object.entries(workGroups).filter(x=>x[1]>0).map(([label,value])=>({label,value}));
  const stockTracked=stocks.filter(x=>Number.isFinite(x.pct));
  const materialPct=stockTracked.length?Math.round(stockTracked.filter(x=>x.pct>=100).length*100/stockTracked.length):null;
  const tasks=asArray(raw.tasks).filter(x=>x.status!=="completed").slice(0,4);
  const notifications=asArray(raw.notifications?.rows);
  const activity=[
    ...notifications.map(x=>({title:x.title||"Notification",detail:x.body||x.sites?.name||"",time:x.created_at?new Date(x.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):"",date:x.created_at,color:"#3b9bff"})),
    ...expenses.slice(0,5).map(x=>({title:"Expense claim · "+String(x.category||"expense").replace(/_/g," "),detail:(x.paid_to||x.note||"Claim")+" · ₹"+Number(x.amount||0).toLocaleString("en-IN"),time:x.expense_date||x.date||"",date:x.expense_date||x.date,color:"#8b6cff"})),
    ...openIndents.slice(0,3).map(x=>({title:"Material indent · "+(x.indent_no||x.number||"Request"),detail:String(x.status||"open")+" · "+(x.items?.length||x.item_count||"")+" items",time:x.created_at?new Date(x.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):"",date:x.created_at,color:"#ff7a2f"}))
  ].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).slice(0,4);
  const approvals=pendingClaims.slice(0,4).map(x=>({id:x.id,title:x.paid_to||x.note||"Expense claim",detail:"Expense · ₹"+Number(x.amount||0).toLocaleString("en-IN")+(x.site?" · "+x.site:""),blocked:!!x.possible_duplicate}));
  const trades=new Set(muster.map(x=>x.cat).filter(Boolean)).size;
  const moduleKeys=["attendance","dpr","indent","stock","money"].filter(key=>canSeeModuleAnySite(session,key));
  const latest=openIndents[0];
  const shortDate=d=>new Date(d+"T12:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short"});
  const kpis=[
    {label:"Workers",icon:"👷",value:onRoll||null,sub:onRoll?("Assigned to site · "+present+" marked in today"):"No data yet",backTitle:"Manpower",rows:[["On roll",onRoll||"No data yet"],["Marked today",present],["Absent",absentRows.length]]},
    {label:"Materials",icon:"🛒",value:openIndents.length||null,sub:openIndents.length?"Open requests":"No data yet",backTitle:"Latest indent",rows:[[latest?.indent_no||latest?.number||"Latest request",latest?.status||"No data yet"],["Items",latest?.items?.length||latest?.item_count||"—"],["Need by",latest?.required_by?shortDate(latest.required_by):"—"]]},
    {label:"Pending delivery",icon:"🚚",value:pendingLines||null,sub:pendingLines?"Awaiting GRN · "+pendingPOs.length+" purchase orders":"No data yet",backTitle:"Delivery status",rows:[["Pending lines",pendingLines],["POs",pendingPOs.length],["Oldest due",pendingPOs[0]?.expected_delivery||"—"]]},
    {label:"Expenses",icon:"₹",value:inMonth.length?("₹"+Number(inMonth.reduce((n,x)=>n+Number(x.amount||0),0)).toLocaleString("en-IN")):null,sub:inMonth.length?"This month · "+inMonth.length+" claims":"No data yet",backTitle:"Claims this month",rows:[["Approved",approvedClaims.length],["Pending",pendingClaims.length],["Claims",inMonth.length]]}
  ];
  const dprPct=todayDpr?100:0,approvalPct=expenses.length?Math.round(approvedClaims.length*100/expenses.length):null;
  return {
    name:session?.name||session?.full_name||"IT Executive",roleLabel:"IT Executive",sites,
    siteId:site?.id||null,siteName:site?.name||"No site selected",today:now.toLocaleDateString("en-IN",{weekday:"short",day:"2-digit",month:"short",year:"numeric"}),
    onRoll,present,absent:absentRows.length,shortfall:onRoll?Math.max(0,onRoll-present):null,trades:trades||null,
    completePct,punchPct:onRoll?Math.round(100*present/onRoll):null,dprPct,approvalPct,workforcePct:onRoll?Math.round(100*present/onRoll):null,
    billed:null,kpis,stages:[
      {label:"Punch",value:onRoll?present+" in today":"No data yet",route:"punch"},
      {label:"Muster",value:onRoll?onRoll+" on roll":"No data yet",route:"muster"},
      {label:"Order",value:openIndents.length?openIndents.length+" open":"No data yet",route:"orders"},
      {label:"Delivery",value:pendingLines?pendingLines+" pending":"No data yet",route:"stock"},
      {label:"DPR",value:todayDpr?"Filed":"Not filed",route:"dpr"},
      {label:"Billing",value:completePct==null?"No data yet":completePct+"% complete",route:"expenses"}
    ],
    expenseSeries:trends,weekManpower:week,workMix,health:[
      {key:"attendance",value:onRoll?Math.round(100*present/onRoll):0},
      {key:"material",value:materialPct||0},
      {key:"dpr",value:dprPct},
      {key:"safety",value:0},
      {key:"billing",value:completePct||0}
    ],
    heatmap:raw.heatmap||{rows:[]},stock:stocks.slice(0,4),tasks,
    activity,approvals,approvalCount:pendingClaims.length,notificationRows:notifications.slice(0,12).map(x=>({title:x.title||"Notification",body:x.body||"",created_at:x.created_at||""})),unread:Number(raw.notifications?.unread||0),
    modules:moduleKeys
  };
}

export default function ITDashboardHome({ sess, mode="desktop" }) {
  const router=useRouter(),frame=useRef(null),dataInitialized=useRef(false),[active,setActive]=useState(sess||null),[siteId,setSiteId]=useState(sess?.currentSite||sess?.sites?.[0]?.id||null),[data,setData]=useState(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[toast,setToast]=useState(""),[moreOpen,setMoreOpen]=useState(false),[notificationOpen,setNotificationOpen]=useState(false),[frameTimedOut,setFrameTimedOut]=useState(false);
  const site=active?.sites?.find(s=>String(s.id)===String(siteId))||active?.sites?.[0]||null;
  const load=useCallback(async()=>{
    const s=active||sess, sid=site?.id||siteId||"all";
    if(!s)return;
    setBusy(true);setError("");
    if(!dataInitialized.current){
      dataInitialized.current=true;
      setData(buildDashboardData(s,sid,{
        muster:[],indents:[],pos:[],dpr:null,progress:[],expenses:[],tasks:[],
        notifications:{rows:[],unread:0},stock:[],heatmap:{rows:[]}
      }));
    }
    const now=new Date(),from=new Date(now);from.setDate(now.getDate()-97);
    const fromKey=localDate(from),toKey=localDate(now);
    const results=await Promise.allSettled([
      safe(() => getMuster(sid)),safe(() => getOpenIndents(sid)),safe(() => getPOs(sid)),safe(() => getTodayDpr(sid)),safe(() => getProgress(sid)),
      safe(() => getExpenseClaimQueue(sid)),safe(() => getTasks()),safe(() => getMyNotifications(30)),safe(() => getBalances(site?.code||"all")),
      safe(() => getAttendanceHeatmap(fromKey,toKey,sid))
    ]);
    const val=i=>results[i].status==="fulfilled"?results[i].value:null;
    const raw={muster:val(0),indents:val(1),pos:val(2),dpr:val(3),progress:val(4),expenses:val(5),tasks:val(6),notifications:val(7),stock:val(8),heatmap:val(9)};
    if(raw.tasks?.error||raw.tasks?.__loadError)raw.tasks=[];
    if(raw.heatmap?.error||raw.heatmap?.__loadError)raw.heatmap={rows:[]};
    const next=buildDashboardData(s,sid,raw);
    setData(next);setBusy(false);
    const failed=results.filter(r=>r.value?.__loadError).length;setError(failed?"Some live data could not be loaded. Pull down to retry.":"");
  },[active,sess,site,siteId]);
  useEffect(()=>{
    const s=getSession();
    if(!s){router.replace(mode==="mobile"?"/m/login":"/login");return}
    if(!isIT(s.role)){router.replace(mode==="mobile"?"/m/dashboard":"/home");return}
    let alive=true;
    (async()=>{try{const updated=await refreshSessionRights();if(alive&&updated)setActive(updated)}catch{}})();
    return()=>{alive=false};
  },[mode,router]);
  useEffect(()=>{if(active&&isIT(active.role))load()},[active,siteId,load]);
  useEffect(()=>{if(!active)return;const id=setInterval(load,60000);return()=>clearInterval(id)},[active,load]);
  useEffect(()=>{if(ready){setFrameTimedOut(false);return}const id=setTimeout(()=>setFrameTimedOut(true),12000);return()=>clearTimeout(id)},[ready,siteId]);
  useEffect(()=>{
    if(!data||!frame.current?.contentWindow)return;
    frame.current.contentWindow.postMessage({type:"psk-it-dashboard-data",payload:data},window.location.origin);
  },[data]);
  useEffect(()=>{
    const onMessage=async e=>{
      if(e.origin!==window.location.origin||e.source!==frame.current?.contentWindow)return;
      if(e.data?.type==="psk-it-dashboard-render-error"){setError("Dashboard data could not be displayed. Retry to reload.");setFrameTimedOut(true);return}
      if(e.data?.type==="psk-it-dashboard-ready"){setReady(true);return}
      if(e.data?.type!=="psk-it-action")return;
      const {action,route}=e.data;
      if(action==="refresh"){load();return}
      if(action==="site-change"){
        const next=(active?.sites||[]).find(x=>String(x.id)===String(e.data.siteId));if(!next)return;
        setCurrentSite(next.id);dataInitialized.current=false;setData(null);setSiteId(next.id);setReady(false);return;
      }
      if(action==="navigate"){
        if(route==="more"){setMoreOpen(true);return}if(route==="notifications"){setNotificationOpen(true);return}
        const paths={home:mode==="mobile"?"/m/dashboard":"/home",punch:"/m",muster:mode==="mobile"?"/m/muster":"/attendance",dpr:mode==="mobile"?"/m/dpr":"/dpr",orders:mode==="mobile"?"/m/order":"/procure",stock:mode==="mobile"?"/m/stock":"/stock",expenses:mode==="mobile"?"/m/money":"/expenses",notifications:mode==="mobile"?"/m/dashboard":"/notifications"};
        if(paths[route])router.push(paths[route]);return;
      }
      if(action==="approve"){
        const result=await reviewExpenseClaim(e.data.id,"approved","",active?.id);
        setToast(result?.ok?"Expense approved":result?.error||"Approval could not be saved");
        if(result?.ok)load();setTimeout(()=>setToast(""),3200);return;
      }
      if(action==="task"){
        const task=(data?.tasks||[]).find(x=>String(x.id)===String(e.data.id));
        const result=await setTaskStatus(e.data.id,e.data.status,"",active?.name,task?.title||"Task");
        setToast(result?.ok?"Task updated":result?.error||"Task could not be updated");
        if(result?.ok)load();setTimeout(()=>setToast(""),3200);
      }
    };
    window.addEventListener("message",onMessage);return()=>window.removeEventListener("message",onMessage);
  },[active,data,load,mode,router]);
  // update475: tell the dashboard when the ERP sidebar is hidden so its title clears the floating ☰
  useEffect(()=>{
    const send=()=>frame.current?.contentWindow?.postMessage({type:"psk-it-shell",nosb:document.documentElement.classList.contains("psk-nosb")},window.location.origin);
    const mo=new MutationObserver(send);mo.observe(document.documentElement,{attributes:true,attributeFilter:["class"]});
    send();return()=>mo.disconnect();
  },[ready]);
  const onFrameLoad=()=>{
    // Never hold the whole app behind the dashboard's data/ready handshake. The iframe
    // contains its own empty states and can render while slow APIs finish loading.
    setReady(true);
    if(data)frame.current?.contentWindow?.postMessage({type:"psk-it-dashboard-data",payload:data},window.location.origin);
  };
  const go=path=>{setMoreOpen(false);router.push(path)};const moreOptions=[["Punch","/m"],["Orders","/m/order","indent"],["Expenses","/m/money","money"],["Stock","/m/stock","stock"]].filter(x=>!x[2]||(data?.modules||[]).includes(x[2]));
  if(!active||!isIT(active.role))return <div style={{minHeight:"100dvh",background:"#05070f"}}/>;
  const dashboardFrame=<iframe ref={frame} onLoad={onFrameLoad} onError={()=>{setError("The dashboard view failed to load. Retry to reload it.");setFrameTimedOut(true)}} title="IT Command Center" src="/it-dashboard-home.html?shell=erp" style={{width:"100%",height:"100dvh",border:0,display:"block",visibility:"visible"}}/>;
  if(mode==="desktop")return <div className="layout" style={{height:"100dvh",minHeight:0,background:"#05070f"}}><Sidebar/><main className="main" style={{padding:0,height:"100dvh",overflow:"hidden"}}>{dashboardFrame}</main>{error&&ready&&<div role="alert" style={{position:"fixed",left:"50%",top:12,transform:"translateX(-50%)",zIndex:80,padding:"9px 12px",borderRadius:12,background:"#7f1d1d",color:"#fff",font:"12px system-ui"}}>{error}<button onClick={load} style={{marginLeft:8,color:"#fff",textDecoration:"underline"}}>Retry</button></div>}{busy&&ready&&<div aria-live="polite" style={{position:"fixed",right:12,bottom:18,zIndex:5,font:"12px system-ui",color:"#f5f7fb",background:"rgba(12,19,48,.88)",padding:"7px 11px",borderRadius:20}}>Refreshing…</div>}{!!toast&&<div role="status" style={{position:"fixed",left:"50%",bottom:18,transform:"translateX(-50%)",zIndex:90,padding:"10px 16px",borderRadius:14,background:"#18254a",color:"#fff",boxShadow:"0 10px 30px #0007",font:"13px system-ui"}}>{toast}</div>}</div>;
  return <div style={{position:"relative",width:"100%",height:"100dvh",minHeight:"100dvh",overflow:"hidden",background:"#05070f"}}>
    {!ready&&<div role={frameTimedOut?"alert":"status"} style={{position:"absolute",top:12,left:"50%",transform:"translateX(-50%)",zIndex:2,display:"flex",alignItems:"center",gap:8,maxWidth:"calc(100% - 24px)",padding:"9px 12px",borderRadius:12,background:"rgba(16,26,51,.94)",border:"1px solid #ffffff24",color:"#f5f7fb",font:"12px system-ui,sans-serif",boxShadow:"0 8px 24px #0005"}}><span>{frameTimedOut?(error||"Dashboard could not finish loading. The page is still available below."):"Loading live dashboard data…"}</span>{frameTimedOut&&<button onClick={()=>{setError("");setFrameTimedOut(false);setReady(false);if(frame.current)frame.current.src="/it-dashboard-home.html?retry="+Date.now();load()}} style={{padding:"7px 10px",borderRadius:9,background:"#ff7a2f",color:"white",flexShrink:0}}>Retry</button>}</div>}
    {dashboardFrame}
    {error&&ready&&<div role="alert" style={{position:"fixed",left:"50%",top:12,transform:"translateX(-50%)",zIndex:8,padding:"9px 12px",borderRadius:12,background:"#7f1d1d",color:"#fff",font:"12px system-ui"}}>{error}<button onClick={load} style={{marginLeft:8,color:"#fff",textDecoration:"underline"}}>Retry</button></div>}{busy&&ready&&<div aria-live="polite" style={{position:"fixed",right:12,bottom:mode==="mobile"?92:18,zIndex:5,font:"12px system-ui",color:"#f5f7fb",background:"rgba(12,19,48,.88)",padding:"7px 11px",borderRadius:20}}>Refreshing…</div>}
    {!!toast&&<div role="status" style={{position:"fixed",left:"50%",bottom:mode==="mobile"?86:18,transform:"translateX(-50%)",zIndex:9,padding:"10px 16px",borderRadius:14,background:"#18254a",color:"#fff",boxShadow:"0 10px 30px #0007",font:"13px system-ui"}}>{toast}</div>}
    {moreOpen&&<div role="dialog" aria-modal="true" onClick={()=>setMoreOpen(false)} style={{position:"fixed",inset:0,zIndex:10,background:"#0009",display:"grid",placeItems:"end center",fontFamily:"system-ui,sans-serif"}}><div onClick={e=>e.stopPropagation()} style={{width:"min(100%,520px)",padding:"20px 18px calc(20px + env(safe-area-inset-bottom))",borderRadius:"24px 24px 0 0",background:"#101a33",color:"#f5f7fb",boxShadow:"0 -12px 50px #0008"}}><div style={{fontSize:18,fontWeight:700,marginBottom:12}}>More</div>{moreOptions.map(([label,path])=><button key={path} onClick={()=>go(path)} style={{display:"block",width:"100%",textAlign:"left",padding:"14px 8px",color:"inherit",borderBottom:"1px solid #ffffff22",background:"transparent",fontSize:15}}>{label}　→</button>)}<button onClick={()=>{setMoreOpen(false);setNotificationOpen(true)}} style={{display:"block",width:"100%",textAlign:"left",padding:"14px 8px",color:"inherit",borderBottom:"1px solid #ffffff22",background:"transparent",fontSize:15}}>Notifications　→</button></div></div>}
    {notificationOpen&&<div role="dialog" aria-modal="true" onClick={()=>setNotificationOpen(false)} style={{position:"fixed",inset:0,zIndex:11,background:"#0009",display:"grid",placeItems:"center",padding:16,fontFamily:"system-ui,sans-serif"}}><div onClick={e=>e.stopPropagation()} style={{width:"min(100%,520px)",maxHeight:"80dvh",overflow:"auto",padding:20,borderRadius:22,background:"#101a33",color:"#f5f7fb",boxShadow:"0 20px 60px #0008"}}><div style={{fontSize:18,fontWeight:700,marginBottom:12}}>Notifications</div>{(data?.notificationRows||[]).length?(data.notificationRows.map((x,i)=><div key={i} style={{padding:"12px 4px",borderBottom:"1px solid #ffffff22"}}><b>{x.title}</b><div style={{fontSize:13,color:"#b7c1d8",marginTop:4}}>{x.body||"—"}</div><small style={{color:"#8f9bb6"}}>{x.created_at?new Date(x.created_at).toLocaleString("en-IN"):""}</small></div>)):<div style={{color:"#b7c1d8",padding:10}}>No notifications yet.</div>}<button onClick={()=>setNotificationOpen(false)} style={{marginTop:14,padding:"10px 14px",borderRadius:12,background:"#ff7a2f",color:"#fff"}}>Close</button></div></div>}
    <MobileNav/>
  </div>;
}