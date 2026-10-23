"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import NotifyBell from "@/components/NotifyBell";

export const NAVY = "#0f1b3a", NAVY2 = "#16233d", COPPER = "#f26a1b";
const INK = "#1f2937", MUTED = "#6b7280", LINE = "#e6e2d9";

const SEARCH = [
  ["Home", "/home"], ["All sites", "/projects"], ["Approvals", "/approvals"],
  ["My expenses", "/my-expenses"], ["Finance", "/expenses"], ["Analytics", "/reports"],
  ["Purchase orders", "/procure?tab=po"], ["Pending deliveries", "/procure/pending"],
  ["Vendors", "/vendors"], ["Assign task", "/tasks"], ["Admin", "/admin-access"],
  ["Site reports", "/dpr"], ["Muster", "/attendance"], ["DPR", "/dpr"]
];

export default function HomeHeader({ sess, sites, isDirector, asSite, setAsSite, siteName, pickSite, setPickSite, mode = "mobile" }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  if (!sess) return null;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const roleLabel = isDirector ? "Director" : String(sess.role || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const desk = mode === "desk";
  const name = String(sess.name || sess.full_name || "").trim().split(/\s+/)[0] || "there";
  const suggestions = useMemo(() => query.trim() ? SEARCH.filter(([label]) => label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6) : [], [query]);
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date());

  if (!isDirector) return (
    <>
      <div style={{ background: NAVY2, color: "#fff", padding: desk ? "10px 28px" : "calc(12px + env(safe-area-inset-top)) 14px 14px", position: "relative", zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 1100, margin: "0 auto", paddingRight: 48 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,.1)", display: "grid", placeItems: "center", flexShrink: 0 }}>🔧</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, letterSpacing: 1, color: COPPER, fontWeight: 800, textTransform: "uppercase" }}>{greet}</div>
            <div style={{ fontSize: 17, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name} <span style={{ opacity: .65, fontWeight: 600, fontSize: 14 }}>· {roleLabel}</span></div>
          </div>
          <Link href="/notices" title="Notice Board" style={{ color: "#fff", fontSize: 19, textDecoration: "none", padding: 6 }}>📢</Link>
        </div>
      </div>
    </>
  );

  return (
    <>
      {desk ? (
        <header style={{position:"sticky",top:0,zIndex:25,background:"#fff",borderBottom:"1px solid "+LINE,padding:"12px 28px",boxShadow:"0 2px 8px rgba(15,27,58,.04)"}}>
          <div style={{display:"flex",alignItems:"center",gap:18,maxWidth:1600,margin:"0 auto"}}>
            <Link href="/home" aria-label="Pipeskool home"><Logo height={27}/></Link>
            <div style={{minWidth:170,flex:1}}>
              <div style={{fontSize:10,color:MUTED,fontWeight:700}}>{date}</div>
              <div style={{fontSize:14,color:NAVY,fontWeight:800}}>{greet}, {name}</div>
            </div>
            <div style={{position:"relative",width:"min(330px,28vw)"}}>
              <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&suggestions[0]){router.push(suggestions[0][1]);setQuery("")} if(e.key==="Escape")setQuery("")}} placeholder="⌕  Search sites, modules…" aria-label="Search sites and modules" style={{width:"100%",height:40,border:"1px solid "+LINE,borderRadius:10,padding:"0 13px",background:"#faf9f6",fontSize:13,outline:"none"}}/>
              {suggestions.length>0&&<div style={{position:"absolute",top:44,left:0,right:0,zIndex:50,background:"#fff",border:"1px solid "+LINE,borderRadius:12,boxShadow:"0 10px 25px #0f1b3a18",overflow:"hidden"}}>{suggestions.map(([label,href])=><button key={label} type="button" onClick={()=>{router.push(href);setQuery("")}} style={{display:"block",width:"100%",textAlign:"left",padding:"10px 12px",border:0,borderBottom:"1px solid #f2f0ea",background:"#fff",color:INK,cursor:"pointer",fontSize:13}}>{label} <span style={{float:"right",color:COPPER}}>→</span></button>)}</div>}
            </div>
            <button type="button" onClick={()=>setPickSite(v=>!v)} style={{border:"1px solid "+LINE,borderRadius:10,background:"#fff",padding:"9px 11px",fontSize:12,fontWeight:700,color:INK,cursor:"pointer",whiteSpace:"nowrap"}}>{asSite?siteName:"All sites"} ▾</button>
            <NotifyBell compact />
            <div style={{width:36,height:36,borderRadius:"50%",background:"#e9effa",color:NAVY,display:"grid",placeItems:"center",fontWeight:800}} title={sess.name||sess.full_name}>{name.charAt(0).toUpperCase()}</div>
          </div>
          {pickSite&&<div style={{position:"absolute",right:120,top:62,zIndex:60,background:"#fff",border:"1px solid "+LINE,borderRadius:12,padding:7,width:270,maxHeight:300,overflowY:"auto",boxShadow:"0 12px 28px #0f1b3a22"}}>
            <button onClick={()=>{setAsSite(null);setPickSite(false)}} style={{width:"100%",textAlign:"left",padding:9,border:0,borderRadius:8,background:!asSite?"#fff3e8":"#fff",color:INK}}>Company portfolio · all sites</button>
            {(sites||[]).filter(s=>s.is_active!==false).map(s=><button key={s.id} onClick={()=>{setAsSite(Number(s.id));setPickSite(false)}} style={{width:"100%",textAlign:"left",padding:9,border:0,borderRadius:8,background:String(asSite)===String(s.id)?"#fff3e8":"#fff",color:INK}}>{s.name}</button>)}
          </div>}
        </header>
      ) : (
        <header style={{background:"#f3f0ea",color:INK,padding:"calc(10px + env(safe-area-inset-top)) 16px 10px",position:"relative",zIndex:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Link href="/m/dashboard" style={{flex:1}}><Logo height={25}/></Link>
            <Link href="/profile" title="Profile" style={{width:38,height:38,borderRadius:"50%",background:NAVY,color:"#fff",textDecoration:"none",display:"grid",placeItems:"center",fontWeight:800}}>{name.charAt(0).toUpperCase()}</Link>
          </div>
          <div style={{marginTop:13}}>
            <div style={{fontSize:10,color:COPPER,fontWeight:800,letterSpacing:".1em",textTransform:"uppercase"}}>{greet} · {date}</div>
            <div style={{fontSize:19,fontWeight:850,color:NAVY,marginTop:2}}>{name} <span style={{fontSize:13,fontWeight:650,color:MUTED}}>· Director</span></div>
            <button type="button" onClick={()=>setPickSite(v=>!v)} style={{marginTop:9,width:"100%",textAlign:"left",border:"1px solid "+(asSite?COPPER:LINE),borderRadius:11,padding:"10px 12px",background:"#fff",color:INK,fontWeight:700,fontSize:13}}>{asSite?(siteName||"Selected site"):"Company portfolio · all sites"} <span style={{float:"right",color:COPPER}}>⌄</span></button>
          </div>
          {pickSite&&<div style={{position:"absolute",top:"100%",left:12,right:12,zIndex:60,background:"#fff",border:"1px solid "+LINE,borderRadius:12,padding:7,maxHeight:280,overflowY:"auto",boxShadow:"0 12px 28px #0f1b3a22"}}>
            <button onClick={()=>{setAsSite(null);setPickSite(false)}} style={{width:"100%",textAlign:"left",padding:10,border:0,borderRadius:8,background:!asSite?"#fff3e8":"#fff",color:INK}}>Company portfolio · all sites</button>
            {(sites||[]).filter(s=>s.is_active!==false).map(s=><button key={s.id} onClick={()=>{setAsSite(Number(s.id));setPickSite(false)}} style={{width:"100%",textAlign:"left",padding:10,border:0,borderRadius:8,background:String(asSite)===String(s.id)?"#fff3e8":"#fff",color:INK}}>{s.name}</button>)}
          </div>}
        </header>
      )}
      {asSite&&<div style={{background:"#fff3e8",borderBottom:"1px solid #f1c49f",padding:"7px 14px",fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
        <span>Viewing <b>{siteName}</b> as site manager</span><button onClick={()=>setAsSite(null)} style={{border:"1px solid "+COPPER,color:COPPER,background:"#fff",borderRadius:8,padding:"5px 9px",fontWeight:700}}>Exit</button>
      </div>}
    </>
  );
}
