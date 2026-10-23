"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPersonMoneyProfile } from "@/lib/money";
import { todayLocal } from "@/lib/today";

const ORANGE="#f26a1b", NAVY="#0f1b3a", INK="#1f2937", MUTED="#6b7280", LINE="#e6e2d9";
const rupees=n=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(n)||0);
const getMonths=()=>{const now=todayLocal().slice(0,7).split("-").map(Number);return Array.from({length:6},(_,i)=>{const d=new Date(Date.UTC(now[0],now[1]-1-(5-i),1));return d.toISOString().slice(0,7)})};

export default function MyExpenses({ mobile=false }) {
  const router=useRouter();
  const [profile,setProfile]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState("");
  const load=useCallback(async()=>{const session=getSession();if(!session){router.replace(mobile?"/m/login":"/login");return}if(session.role!=="director"){router.replace(mobile?"/m/dashboard":"/home");return}setBusy(true);setError("");try{const result=await getPersonMoneyProfile(session.id);setProfile(result||{txns:[],totals:{all:0,month:0}})}catch(e){setError(e?.message||"Could not load your expenses.")}finally{setBusy(false)}},[mobile,router]);
  useEffect(()=>{if(typeof window!=="undefined"){const small=window.innerWidth<=760;if(small&&!mobile)router.replace("/m/my-expenses");if(!small&&mobile)router.replace("/my-expenses")}load()},[load,mobile,router]);
  const rows=useMemo(()=>profile?.txns?.filter(t=>t.kind==="exp"&&t.status==="approved")||[],[profile]);
  const months=useMemo(getMonths,[]);
  const series=useMemo(()=>months.map(m=>rows.filter(r=>(r.date||"").slice(0,7)===m).reduce((s,r)=>s+Number(r.amount||0),0)),[rows,months]);
  const max=Math.max(1,...series);
  const cats=useMemo(()=>{const map={};rows.forEach(r=>{const k=(r.edit?.category||"other").replace(/_/g," ");map[k]=(map[k]||0)+Number(r.amount||0)});return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5)},[rows]);
  const monthStart=todayLocal().slice(0,7);
  const monthTotal=rows.filter(r=>(r.date||"").slice(0,7)===monthStart).reduce((s,r)=>s+Number(r.amount||0),0);
  return <main style={{minHeight:"100vh",background:"#f3f0ea",color:INK,padding:mobile?"16px 14px 84px":"26px clamp(20px,3vw,44px)"}}>
    <div style={{maxWidth:1400,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"end",gap:12,marginBottom:18,flexWrap:"wrap"}}>
        <div><div style={{fontSize:11,color:ORANGE,fontWeight:800,letterSpacing:".1em",textTransform:"uppercase"}}>PERSONAL FINANCE</div><h1 style={{fontSize:mobile?24:30,color:NAVY,margin:"3px 0 4px"}}>My Expenses</h1><div style={{fontSize:13,color:MUTED}}>Your approved expense claims only</div></div>
        <button onClick={load} style={{border:"1px solid "+LINE,borderRadius:10,background:"#fff",padding:"9px 12px",fontWeight:700,color:INK,cursor:"pointer"}}>↻ Refresh</button>
      </div>
      {error&&<div role="alert" style={{padding:13,marginBottom:14,background:"#fff0ef",color:"#aa2727",borderRadius:12,display:"flex",justifyContent:"space-between",gap:12}}>{error}<button onClick={load}>Retry</button></div>}
      <div style={{display:"grid",gridTemplateColumns:mobile?"1fr 1fr":"repeat(3,minmax(0,1fr))",gap:12,marginBottom:14}}>
        {[["Approved this month",monthTotal],["Approved all time",profile?.totals?.all||0],["Approved claims",rows.length]].map(([label,value])=><section key={label} style={{background:"#fff",border:"1px solid "+LINE,borderRadius:16,padding:mobile?14:18,boxShadow:"0 2px 8px #0f1b3a0a"}}><div style={{fontSize:12,color:MUTED}}>{label}</div><div style={{fontSize:mobile?20:27,fontWeight:850,color:label==="Approved this month"?ORANGE:NAVY,marginTop:7}}>{label==="Approved claims"?value:rupees(value)}</div></section>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"minmax(0,1.25fr) minmax(300px,.75fr)",gap:14,alignItems:"start"}}>
        <section style={{background:"#fff",border:"1px solid "+LINE,borderRadius:16,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:12}}><h2 style={{fontSize:16,color:NAVY,margin:0}}>Monthly approved spend</h2><div style={{fontSize:11,color:MUTED}}>Last 6 months</div></div>
          <div style={{height:160,display:"flex",alignItems:"end",gap:9,borderBottom:"1px solid "+LINE,padding:"8px 2px 0"}}>{busy?months.map(m=><div key={m} style={{flex:1,height:"70%",borderRadius:"5px 5px 0 0",background:"#f3f0ea"}}/>):series.map((n,i)=><div key={months[i]} title={months[i]+": "+rupees(n)} style={{flex:1,height:"100%",display:"flex",flexDirection:"column",justifyContent:"end",alignItems:"center",gap:5}}><div style={{width:"min(32px,80%)",height:n?Math.max(4,n/max*118):2,borderRadius:"5px 5px 0 0",background:i===series.length-1?ORANGE:"#fbc9a5"}}/><span style={{fontSize:9,color:MUTED}}>{months[i].slice(5)}</span></div>)}</div>
        </section>
        <section style={{background:"#fff",border:"1px solid "+LINE,borderRadius:16,padding:16}}><h2 style={{fontSize:16,color:NAVY,margin:"0 0 12px"}}>Spending categories</h2>{busy?<div style={{height:100,background:"#f7f5f1",borderRadius:10}}/>:cats.length?cats.map(([k,v],i)=><div key={k} style={{marginBottom:11}}><div style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:12,marginBottom:4}}><span style={{textTransform:"capitalize"}}>{k}</span><b>{rupees(v)}</b></div><div style={{height:7,background:"#f1eee8",borderRadius:8,overflow:"hidden"}}><div style={{height:"100%",width:Math.max(3,v/cats[0][1]*100)+"%",background:["#f26a1b","#2563eb","#22a45d","#7c3aed","#d97706"][i],borderRadius:8}}/></div></div>):<div style={{fontSize:13,color:MUTED}}>No approved expenses yet.</div>}</section>
      </div>
      <section style={{marginTop:14,background:"#fff",border:"1px solid "+LINE,borderRadius:16,padding:mobile?13:17}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}><h2 style={{fontSize:16,color:NAVY,margin:0}}>Approved claims</h2><span style={{fontSize:11,color:MUTED}}>{rows.length} records</span></div>
        {busy?<div style={{display:"grid",gap:8}}>{[1,2,3].map(i=><div key={i} style={{height:48,borderRadius:9,background:"#f7f5f1"}}/>)}</div>:rows.length?<div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:mobile?540:680,borderCollapse:"collapse",fontSize:12.5}}><thead><tr style={{textAlign:"left",color:MUTED,background:"#faf9f6"}}>{["Date","Expense / payee","Site","Amount"].map(x=><th key={x} style={{padding:"10px 9px"}}>{x}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||i} style={{borderTop:"1px solid #f0eee9"}}><td style={{padding:"11px 9px",whiteSpace:"nowrap"}}>{r.date||"—"}</td><td style={{padding:"11px 9px",maxWidth:340}}><b>{r.what?.split(" — ")[0]||"Expense"}</b><div style={{fontSize:11,color:MUTED,marginTop:3}}>{r.what?.split(" — ").slice(1).join(" — ")}</div></td><td style={{padding:"11px 9px"}}>{r.site||"—"}</td><td style={{padding:"11px 9px",fontWeight:800,whiteSpace:"nowrap"}}>{rupees(r.amount)}</td></tr>)}</tbody></table></div>:<div style={{padding:"24px 8px",textAlign:"center",color:MUTED}}>No approved expenses found.</div>}
      </section>
    </div>
  </main>;
}
