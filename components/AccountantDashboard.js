"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSession, canSeeModuleAnySite, hasAdminCap } from "@/lib/auth";
import { getSites } from "@/lib/data";
import { getExpenseClaimQueue, getAdvanceLedger, getPettyReconciliation, inr } from "@/lib/money";
import { getPayouts } from "@/lib/payroll";
import { getStaffPayouts } from "@/lib/staffpay";
import { getVendors } from "@/lib/vendors";

const ORANGE = "#ff7900", NAVY = "#111827", MUTED = "#64748b", BORDER = "#e5e7eb";
const dateMonth = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0"); };
const dateInMonth = (date, month) => String(date || "").slice(0,7) === month;
const icon = { expenses:"💳", muster:"👥", dpr:"📋", challan:"🚚", grn:"📦", ledger:"📒", petty:"₹", site:"🏗", vendor:"🏦", tasks:"☑️", workers:"👷", reports:"📊" };

function hasMoney(session) { return hasAdminCap(session, "view_all_money") || canSeeModuleAnySite(session, "money"); }
function features(session, mobile) {
  const items = [
    ["expenses","All Expenses","View and manage authorized expense records",mobile?"/m/money":"/expenses",hasMoney(session)],
    ["muster","Muster & Wages","Attendance, muster rolls and payroll",mobile?"/m/muster":"/wages",canSeeModuleAnySite(session,"attendance") || canSeeModuleAnySite(session,"wages")],
    ["dpr","DPR","Read site progress reports",mobile?"/m/dpr":"/dpr",canSeeModuleAnySite(session,"dpr")],
    ["challan","Delivery Challan","View deliveries and challan records",mobile?"/m/deliveries":"/stock/challans",canSeeModuleAnySite(session,"stock")],
    ["grn","All GRN","Goods receipt notes and quantities",mobile?"/m/stock":"/stock/grn",canSeeModuleAnySite(session,"stock")],
    ["ledger","Advance & Ledgers","Advances, recoveries and financial ledgers",mobile?"/m/money":"/expenses",hasMoney(session)],
    ["petty","Petty Cash","Balances, requests and settlements",mobile?"/m/money":"/expenses",hasMoney(session)],
    ["site","Site Expenses","Claims, receipts and payment status",mobile?"/m/money":"/expenses",hasMoney(session)],
    ["vendor","Direct Vendor Payment","Vendor payment records and follow-up",mobile?"/m/money":"/expenses",hasMoney(session)],
    ["tasks","My Task","Assigned work and follow-ups",mobile?"/m/tasks":"/tasks",!!session?.id],
    ["workers","Add Worker","Open worker registration and site assignment",mobile?"/m/add":"/workers",canSeeModuleAnySite(session,"workers")],
    ["reports","Reports","Financial and site reporting",mobile?"/m/report":"/reports",hasMoney(session) || canSeeModuleAnySite(session,"dpr")],
  ];
  return items.filter(x=>x[4]);
}

function Card({title,value,detail,emoji,href,small=false}) {
  return <Link href={href} style={{textDecoration:"none",color:NAVY,background:"#fff",border:"1px solid "+BORDER,borderRadius:16,padding:small?"12px 10px":"16px",minWidth:0,boxShadow:"0 2px 8px rgba(15,23,42,.04)"}}>
    <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
      <span style={{display:"grid",placeItems:"center",width:small?34:42,height:small?34:42,flexShrink:0,borderRadius:12,background:"#fff1e6",fontSize:small?17:20}}>{emoji}</span>
      <div style={{minWidth:0}}><div style={{fontSize:small?10.5:12,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div><b style={{display:"block",fontSize:small?14:19,marginTop:2,overflow:"hidden",textOverflow:"ellipsis"}}>{value}</b></div>
    </div><div style={{fontSize:10.5,color:MUTED,marginTop:9}}>{detail}</div>
  </Link>;
}
function Section({title,action,children}) { return <section style={{marginTop:20}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:10}}><h2 style={{fontSize:16,margin:0}}>{title}</h2>{action}</div>{children}</section>; }
function Skeleton({mobile}) { return <div style={{display:"grid",gridTemplateColumns:mobile?"repeat(2,minmax(0,1fr))":"repeat(5,minmax(0,1fr))",gap:10}}>{Array.from({length:5},(_,i)=><div key={i} style={{height:88,borderRadius:16,background:"linear-gradient(90deg,#eef1f5,#f8fafc,#eef1f5)"}} />)}</div>; }

export default function AccountantDashboard({ mobile = false }) {
  const [session,setSession]=useState(null), [sites,setSites]=useState([]), [siteId,setSiteId]=useState("all"), [month,setMonth]=useState(dateMonth());
  const [data,setData]=useState(null), [busy,setBusy]=useState(true), [error,setError]=useState("");
  const [now,setNow]=useState(dateMonth());
  useEffect(()=>{setSession(getSession()); getSites({allForMoney:true}).then(setSites).catch(()=>setSites([]));},[]);
  useEffect(()=>{
    if (!session || session.role!=="ho_admin") return;
    let alive=true; setBusy(true); setError("");
    const sid=siteId==="all"?"all":siteId;
    Promise.all([
      getExpenseClaimQueue(sid,{includeVendorDirect:true}),
      getPayouts(month,sid),
      getStaffPayouts(month,sid),
      getAdvanceLedger(sid),
      getPettyReconciliation(sid),
      getVendors(false),
    ]).then(([expenses,wages,staffWages,advances,petty,vendors])=>{
      if(alive) setData({expenses,wages,staffWages,advances,petty,vendors});
    }).catch(e=>{if(alive){setError(e?.message||"Could not load accountant dashboard data.");setData(null);}})
      .finally(()=>{if(alive)setBusy(false);});
    return ()=>{alive=false;};
  },[session,siteId,month]);
  const monthName = useMemo(()=>{try{return new Date(month+"-01T00:00:00").toLocaleDateString(undefined,{month:"long",year:"numeric"});}catch{return month;}},[month]);
  const summary=useMemo(()=>{
    if(!data)return null;
    const expenses=data.expenses.filter(e=>dateInMonth(e.expense_date||e.date,month)&&e.status==="approved"&&!e.reversed_by);
    const expTotal=expenses.reduce((s,e)=>s+Number(e.amount||0),0);
    const wageRows=[...(data.wages||[]),...(data.staffWages||[])];
    const wageTotal=wageRows.reduce((s,r)=>s+Number(r.net??r.gross??0),0);
    const advRows=data.advances?.rows||[];
    const outstanding=advRows.filter(r=>r.status==="approved").reduce((sum,r)=>sum+Math.max(0,Number(r.amount||0)-Number(data.advances.recovered?.[r.pkey]?.total||0)),0);
    const petty=(data.petty||[]).reduce((s,r)=>s+Number(r.balance||0),0);
    const recent=[...expenses].sort((a,b)=>String(b.expense_date||b.date).localeCompare(String(a.expense_date||a.date))).slice(0,6);
    const bySite={}; expenses.forEach(e=>{const k=e.site||"Site";bySite[k]=(bySite[k]||0)+Number(e.amount||0);});
    const byCat={}; expenses.forEach(e=>{const k=e.category||"Other";byCat[k]=(byCat[k]||0)+Number(e.amount||0);});
    return {expTotal,wageTotal,outstanding,petty,vendorCount:(data.vendors||[]).length,recent,bySite:Object.entries(bySite).sort((a,b)=>b[1]-a[1]).slice(0,5),byCat:Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,5),wageCount:wageRows.length};
  },[data,month]);
  const list=useMemo(()=>features(session,mobile),[session,mobile]);
  const goExpenses=mobile?"/m/money":"/expenses";
  if(!session||session.role!=="ho_admin")return null;
  const maxCat=Math.max(1,...(summary?.byCat||[]).map(x=>x[1]));
  const styles={shell:{minHeight:mobile?"100dvh":0,background:"#f5f7fa",color:NAVY,paddingBottom:mobile?"calc(96px + env(safe-area-inset-bottom))":28},wrap:{maxWidth:1500,margin:"0 auto",padding:mobile?"8px 12px 22px":"20px clamp(16px,2vw,30px)"},select:{minHeight:42,border:"1px solid "+BORDER,borderRadius:10,padding:"8px 11px",background:"#fff",color:NAVY,fontSize:13}};
  return <main style={styles.shell}><div style={styles.wrap}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:14}}>
      <div><div style={{fontSize:mobile?20:24,fontWeight:800}}>Accountant Dashboard</div><div style={{fontSize:12,color:MUTED,marginTop:3}}>Manage accounts, expenses, wages and site transactions</div></div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <label style={{fontSize:11,color:MUTED}}>Site <select aria-label="Filter dashboard by site" value={siteId} onChange={e=>setSiteId(e.target.value)} style={styles.select}><option value="all">All Sites</option>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label style={{fontSize:11,color:MUTED}}>Period <input aria-label="Accounting period" type="month" max={now} value={month} onChange={e=>e.target.value&&setMonth(e.target.value)} style={styles.select}/></label>
      </div>
    </div>
    {error&&<div role="alert" style={{background:"#fff0ed",color:"#b42318",padding:12,borderRadius:12,marginBottom:12}}>{error} <button type="button" onClick={()=>setMonth(m=>m)} style={{marginLeft:8,border:"1px solid currentColor",borderRadius:8,padding:"5px 9px",background:"white",color:"inherit"}}>Retry</button></div>}
    {busy?<Skeleton mobile={mobile}/>:summary&&<div style={{display:"grid",gridTemplateColumns:mobile?"repeat(2,minmax(0,1fr))":"repeat(5,minmax(0,1fr))",gap:10}}>
      <Card title="Total Expenses" value={inr(summary.expTotal)} detail={"Approved · "+monthName} emoji="💳" href={goExpenses} small={mobile}/>
      <Card title="Total Wages" value={inr(summary.wageTotal)} detail={"Net payroll · "+monthName} emoji="👥" href={mobile?"/m/muster":"/wages"} small={mobile}/>
      <Card title="Advance Salary Outstanding" value={inr(summary.outstanding)} detail="Approved advances less recorded recovery" emoji="📒" href={goExpenses} small={mobile}/>
      <Card title="Petty Cash Balance" value={inr(summary.petty)} detail="Current assigned custodian balances" emoji="💵" href={goExpenses} small={mobile}/>
      <Card title="Total Vendors" value={String(summary.vendorCount)} detail="Active vendor records" emoji="🏦" href={mobile?"/m/stock":"/vendors"} small={mobile}/>
    </div>}
    <Section title="Accountant Modules">
      <div style={{display:"grid",gridTemplateColumns:mobile?"repeat(2,minmax(0,1fr))":"repeat(auto-fit,minmax(185px,1fr))",gap:10}}>
        {list.map(([key,title,desc,href])=><Link key={key} href={href} style={{textDecoration:"none",color:NAVY,background:"#fff",border:"1px solid "+BORDER,borderRadius:15,padding:mobile?12:15,minHeight:mobile?96:116,display:"flex",flexDirection:"column",alignItems:"flex-start",justifyContent:"space-between",boxShadow:"0 2px 8px rgba(15,23,42,.04)"}}>
          <span style={{width:38,height:38,borderRadius:12,display:"grid",placeItems:"center",background:"#fff1e6",fontSize:19}}>{icon[key]}</span><b style={{fontSize:mobile?12:13,marginTop:8,lineHeight:1.25}}>{title}</b><span style={{fontSize:10.5,color:MUTED,marginTop:4,lineHeight:1.35}}>{desc}</span>
        </Link>)}
      </div>
    </Section>
    {!busy&&summary&&<div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"repeat(3,minmax(0,1fr))",gap:12}}>
      <Section title={"Expense Summary · "+monthName} action={<Link href={goExpenses} style={{fontSize:12,color:"#0875d1",textDecoration:"none"}}>View details →</Link>}>
        {summary.byCat.length?summary.byCat.map(([cat,val])=><div key={cat} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,gap:8}}><span>{cat.replace(/_/g," ")}</span><b>{inr(val)}</b></div><div style={{height:7,background:"#edf0f4",borderRadius:8,marginTop:4}}><div style={{height:"100%",width:Math.max(2,val/maxCat*100)+"%",background:ORANGE,borderRadius:8}}/></div></div>):<div style={{fontSize:12,color:MUTED}}>No approved expenses in this period.</div>}
      </Section>
      <Section title="Expenses by Site" action={<Link href={goExpenses} style={{fontSize:12,color:"#0875d1",textDecoration:"none"}}>View all →</Link>}>
        {summary.bySite.length?summary.bySite.map(([site,val])=><div key={site} style={{display:"flex",justifyContent:"space-between",gap:8,padding:"9px 0",borderBottom:"1px solid #f0f2f5",fontSize:12}}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{site}</span><b>{inr(val)}</b></div>):<div style={{fontSize:12,color:MUTED}}>No expenses for this period.</div>}
      </Section>
      <Section title="Wages Summary" action={<Link href={mobile?"/m/muster":"/wages"} style={{fontSize:12,color:"#0875d1",textDecoration:"none"}}>View details →</Link>}>
        <div style={{fontSize:25,fontWeight:800}}>{inr(summary.wageTotal)}</div><div style={{color:MUTED,fontSize:11}}>Net payroll records · {summary.wageCount} workers and staff · {monthName}</div>
      </Section>
    </div>}
    {!busy&&summary&&<Section title="Recent Approved Expenses" action={<Link href={goExpenses} style={{fontSize:12,color:"#0875d1",textDecoration:"none"}}>View all →</Link>}>
      {summary.recent.length?<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:14,overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:mobile?460:620}}><thead><tr style={{background:"#f8fafc",textAlign:"left"}}>{["Date","Type","Description / vendor","Site","Amount","Status"].map(h=><th key={h} style={{padding:"10px 9px",color:MUTED,fontWeight:700}}>{h}</th>)}</tr></thead><tbody>{summary.recent.map(e=><tr key={e.id} style={{borderTop:"1px solid #f0f2f5"}}><td style={{padding:"10px 9px"}}>{e.expense_date||e.date||"—"}</td><td style={{padding:"10px 9px"}}>{String(e.category||"Expense").replace(/_/g," ")}</td><td style={{padding:"10px 9px"}}>{e.paid_to||e.note||"—"}</td><td style={{padding:"10px 9px"}}>{e.site||"—"}</td><td style={{padding:"10px 9px",fontWeight:700}}>{inr(e.amount)}</td><td style={{padding:"10px 9px"}}><span style={{color:"#16803c"}}>{e.status}</span></td></tr>)}</tbody></table></div>:<div style={{padding:18,background:"#fff",borderRadius:14,color:MUTED,fontSize:13}}>No approved expenses for this period.</div>}
    </Section>}
  </div></main>;
}
