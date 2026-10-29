"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import NotifyBell from "@/components/NotifyBell";
import { getUnreadNoticeCount } from "@/lib/notices";
import Assistant from "@/components/Assistant";
import AuthLostBanner from "@/components/AuthLostBanner";   // update451
import { getSession, clearSession, logoutAuth, refreshSessionRights, canSeeModuleAnySite, canAnySite, setCurrentSite } from "@/lib/auth";

const GROUPS = [
  { label: "Core Site Operations", subs: [
    { label: "Labour & Attendance", items: [
      { href: "/attendance", label: "Attendance & Labour", module: "attendance" },
      { href: "/wages", label: "Muster Roll & Wages", module: "wages" },
      { href: "/calendar", label: "Calendar", module: "attendance" },   // update395: moved from Communication
      { href: "/workers", label: "Workers & Staff Master", module: "workers" },
      { href: "/leave", label: "Leave Requests", module: null },
      { href: "/letters", label: "Letters & Documents", module: "letters" },   // update329
    ] },
    { label: "Material & Procurement", items: [
      { href: "/procure", label: "Procurement & POs", module: "indent" },   // update473: office desk (approvals, quotes, POs); ordering is in the catalogue
      { href: "/order", label: "Order Materials (Catalogue)", module: "indent" },   // update464
      { href: "/procure/import", label: "Import Indent from Excel", module: "indent", show: s => s.role === "director" || canAnySite(s, "indent", "create") || canAnySite(s, "indent", "manage") },   // update484: only for people who may raise indents
      { href: "/stock", label: "Material Stock & Inventory", module: "stock" },
      { href: "/stock/grn", label: "GRN Register", module: "stock" }, { href: "/stock/challans", label: "Delivery Challans", module: "stock" },
      { href: "/stock/deliveries", label: "Site Deliveries & Receiving", module: "stock" },   // update462
      { href: "/procure/pending", label: "Pending Deliveries", module: "indent" },   // update256
      { href: "/items", label: "Item / Material Master", module: "stock" },
      { href: "/vendors", label: "Vendor Master", module: "indent" },
      { href: "/assets", label: "Tools & Assets", module: "assets" },
      { href: "/repairs", label: "Machine Repair", module: "machine_repair" },
    ] },
    { label: "Site Execution", items: [
      { href: "/dpr", label: "Daily Progress Report (DPR)", module: "dpr" },
      { href: "/rentals", label: "Machines & Rooms (Rent)", module: "rentals" },
      { href: "/expenses", label: "Expenses & Petty Cash", module: "money" },
    ] },
  ] },
  { label: "Communication", items: [
    { href: "/notices", label: "Notice Board", module: "notices" },   // update230: Tasks removed from nav — tasks live on the Home dashboard
  ] },
  { label: "Commercial / Billing", items: [
    { href: "/clients", label: "Clients", module: "billing" },   // update393
    { href: "/boq", label: "BOQ Master", module: "billing" },
    { href: "/billing", label: "RA Billing", module: "billing" },
    { href: "/tally", label: "Tally Export", module: "billing" },
  ] },
];
const groupItems = g => g.items || (g.subs || []).flatMap(x => x.items);

// stable top-level (update204): defined inside Sidebar it remounted the whole nav on every badge/path re-render, eating taps on Android
function Group({ label, items, subs, depth = 0, canSee, path, open, toggle, unreadNotices }) {
  const all = items || (subs || []).flatMap(x => x.items);
  const visibleAll = all.filter(it => canSee(it.module, it));
  if (visibleAll.length === 0) return null;
  const hasActive = visibleAll.some(it => it.href === path);
  const isOpen = open[label] ?? hasActive;
  return (
    <div style={depth ? { paddingLeft: 10 } : undefined}>
      <button className={"nav-group" + (hasActive && !isOpen ? " has-active" : "")}
              style={depth ? { fontSize: 11, opacity: 0.95 } : undefined}
              aria-expanded={isOpen} onClick={() => toggle(label)}>
        <span>{label}</span>
        <span className="chev">{isOpen ? "▾" : "▸"}</span>
      </button>
      {/* update475: the group body stays mounted inside .nav-acc so the IT theme can animate open/close with
          grid rows (transform-free, no height thrash). Other roles: data-open=false is display:none — unchanged look. */}
      <div className="nav-acc" data-open={isOpen ? "true" : "false"}><div>
      {subs ? (
        subs.map(sg => <Group key={sg.label} label={sg.label} items={sg.items} depth={depth + 1} canSee={canSee} path={path} open={open} toggle={toggle} unreadNotices={unreadNotices} />)
      ) : (
        <nav className="nav-sub" style={{ marginTop: 0, paddingLeft: depth ? 6 : 0 }}>
          {items.filter(it => canSee(it.module, it)).map(l => (
            <Link key={l.href} href={l.href} className={path === l.href ? "active" : ""}>{l.label}{l.href === "/notices" && unreadNotices > 0 && <span style={{ background: "var(--copper)", color: "#fff", borderRadius: 9, fontSize: 10, padding: "1px 6px", marginLeft: 6 }}>{unreadNotices}</span>}</Link>
          ))}
        </nav>
      )}
      </div></div>
    </div>
  );
}

export default function Sidebar() {
  // update207: inside a project tab (iframe with ?embed=1) the project page provides the shell — hide the sidebar
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get("embed") === "1") setEmbedded(true); } catch {} }, []);
  const path = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [open, setOpen] = useState({});
  const [unreadNotices, setUnreadNotices] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [itTheme, setItTheme] = useState("dark");
  useEffect(() => { if (session) getUnreadNoticeCount(session).then(setUnreadNotices); }, [session, path]);
  useEffect(() => { if (session) import("@/lib/files").then(m => m.ensureFileSession()).catch(() => {}); }, [session]);   // update460: file-view cookie
  useEffect(() => { try {
    const wide = window.innerWidth > 760;
    const v = wide && localStorage.getItem("psk_sidebar_hidden_v2") === "1";
    setHidden(v); document.documentElement.classList.toggle("psk-nosb", v);
  } catch {} }, []);
  const toggleHidden = (v) => { setHidden(v); try { localStorage.setItem("psk_sidebar_hidden_v2", v ? "1" : "0"); document.documentElement.classList.toggle("psk-nosb", v); } catch {} };

  useEffect(() => {
    const s = getSession();
    if (!s) { router.push("/login"); return; }
    setSession(s);
    // live rights: re-pull from DB so Access Rights changes apply without re-login
    refreshSessionRights().then(ns => { if (ns) setSession(ns); else router.push("/login"); }).catch(() => {});   // update311: a thrown refresh never logs out
  }, [router]);

  // auto-expand the group that holds the current page
  useEffect(() => {
    const g = GROUPS.find(grp => groupItems(grp).some(it => it.href === path));
    setOpen(o => {
      const next = { ...o };
      if (g) {
        next[g.label] = true;
        (g.subs || []).forEach(sg => { if (sg.items.some(it => it.href === path)) next[sg.label] = true; });
      }
      if (["/access", "/admin-access", "/sitemaster", "/backup", "/tickets", "/it/camera-log", "/procure/import/admin"].includes(path)) next["Admin"] = true;
      return next;
    });
  }, [path]);

  function logout() { logoutAuth(); router.push("/login"); }
  const toggle = label => setOpen(o => ({ ...o, [label]: !o[label] }));

  const canSee = (m, it) => (!session || !m || canSeeModuleAnySite(session, m)) && (!it?.show || (!!session && it.show(session)));   // update484: optional per-link rule
  const showAccess = session && session.role === "director";
  const showDash = canSee("dashboard");
  useEffect(() => {
    const itExecutive = String(session?.role || "").toLowerCase().replace(/[^a-z]/g, "") === "itexecutive";
    const root = document.documentElement;
    root.classList.toggle("it-executive-ui", itExecutive);
    if (itExecutive) {
      const applyPlatform = () => {
        const ua = navigator.userAgent || "", nativePhone = /iPhone|iPad|iPod|Android/i.test(ua), width = window.innerWidth;
        root.dataset.itPlatform = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : /Windows/i.test(ua) ? "windows" : "mac";
        root.dataset.itLayout = nativePhone || width < 760 ? "phone" : width < 1100 ? "tablet" : "desktop";
      };
      applyPlatform(); window.addEventListener("resize", applyPlatform);
      return () => { window.removeEventListener("resize", applyPlatform); delete root.dataset.itLayout; };
    } else {
      delete root.dataset.itPlatform;
      delete root.dataset.itLayout;
      delete root.dataset.itTheme;
    }
  }, [session?.role]);
  useEffect(() => {
    if (String(session?.role || "").toLowerCase().replace(/[^a-z]/g, "") !== "itexecutive") return;
    const root = document.documentElement;
    const sync = value => { const next = value === "light" ? "light" : "dark"; setItTheme(next); root.dataset.itTheme = next; };
    try { sync(localStorage.getItem("pk-theme") || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")); } catch { sync("dark"); }
    const onStorage = e => { if (e.key === "pk-theme") sync(e.newValue); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [session?.role]);
  const toggleItTheme = () => {
    const next = itTheme === "dark" ? "light" : "dark";
    setItTheme(next);
    document.documentElement.dataset.itTheme = next;
    try { localStorage.setItem("pk-theme", next); } catch {}
  };


  // update243: embedded FIRST. When this renders inside an embedded view the page owns the
  // chrome, so nothing here should paint — not even the collapsed-sidebar ☰ button, which
  // used to leak into every embedded tab once you collapsed the sidebar.
  if (embedded) return null;

  if (hidden) return (
    <><AuthLostBanner /><button className="sidebar-show" title="Show menu" onClick={() => toggleHidden(false)}>☰</button><Assistant /></>
  );

  if (session?.role === "director") {
    const links = [
      ["🏠","Home","/home"], ["✅","Approvals","/approvals"], ["🧾","My Expenses","/my-expenses"],
      ["📊","Analytics","/reports"], ["🏗","All Sites","/projects"], ["📝","Assign Task","/tasks"]
    ];
    const directorAdminLinks = [
      ["/admin-access", "Admin & access"], ["/access", "Access Rights"], ["/it/camera-log", "Punch camera diagnostics"], ["/procure/import/admin", "Excel import: settings"], ["/sitemaster", "Site Master (timings)"], ["/backup", "Backup & Restore"], ["/tickets", "Support Tickets"]
    ];
    const adminOpen = open.Admin ?? directorAdminLinks.some(([href]) => path === href);
    const renderDirectorLink = ([ico,label,href]) => { const active=href==="/home"?path==="/home"||path==="/m/dashboard":path===href; return <Link key={href} href={href} style={{display:"flex",alignItems:"center",gap:11,padding:"9px 11px",borderRadius:9,textDecoration:"none",fontSize:12.5,fontWeight:active?750:550,color:active?"#fff":"#dbe3f1",background:active?"#f26a1b":"transparent",borderLeft:active?"3px solid #ffad71":"3px solid transparent"}}><span style={{width:18,textAlign:"center",fontSize:15}}>{ico}</span>{label}</Link>; };
    return <><AuthLostBanner /><aside className="sidebar director-sidebar" style={{width:240,flexShrink:0,height:"100dvh",position:"sticky",top:0,overflowY:"auto",background:"#0f1b3a",color:"#fff",flexDirection:"column",boxShadow:"2px 0 12px #0f1b3a18"}}>
      <button className="sidebar-hide" title="Hide menu (more screen space)" aria-label="Hide menu" onClick={() => toggleHidden(true)}>⟨</button>
      <div style={{padding:"19px 18px 16px",borderBottom:"1px solid #ffffff16"}}><Link href="/home" style={{display:"inline-block"}}><Logo height={25} variant="white"/></Link><div style={{fontSize:10,color:"#aebbd1",marginTop:7}}>Director Workspace</div></div>
      <div style={{padding:"14px 16px",borderBottom:"1px solid #ffffff16",display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:36,height:36,borderRadius:"50%",background:"#fff3e8",color:"#0f1b3a",display:"grid",placeItems:"center",fontWeight:800}}>{String(session.name||session.full_name||"D").trim().charAt(0).toUpperCase()}</div>
        <div style={{minWidth:0,flex:1}}><b style={{display:"block",fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{session.name||session.full_name||"Director"}</b><span style={{fontSize:10,color:"#aebbd1"}}>Director</span></div>
      </div>
      <div style={{padding:"10px 14px"}}><NotifyBell /></div>
      <nav style={{padding:"4px 10px",display:"grid",gap:3}}>
        {renderDirectorLink(links[0])}
        {GROUPS.map(g => <Group key={g.label} label={g.label} items={g.items} subs={g.subs} canSee={canSee} path={path} open={open} toggle={toggle} unreadNotices={unreadNotices} />)}
        <Group label="Help" canSee={() => true} path={path} open={open} toggle={toggle} unreadNotices={unreadNotices} items={[{ href: "/help?ctx=" + encodeURIComponent(path || "/"), label: "❓ Help Center", module: null }]} />
        {links.slice(1).map(renderDirectorLink)}
        <button type="button" aria-expanded={adminOpen} onClick={() => toggle("Admin")} style={{width:"100%",display:"flex",alignItems:"center",gap:11,padding:"9px 11px",border:0,borderRadius:9,textAlign:"left",fontSize:12.5,fontWeight:adminOpen||directorAdminLinks.some(([href])=>path===href)?750:550,color:"#dbe3f1",background:"transparent",cursor:"pointer"}}><span style={{width:18,textAlign:"center",fontSize:15}}>⚙</span>Admin<span style={{marginLeft:"auto"}}>{adminOpen?"▾":"▸"}</span></button>
        {adminOpen && <div style={{display:"grid",gap:2,paddingLeft:25}}>{directorAdminLinks.map(([href,label])=><Link key={href} href={href} style={{display:"block",padding:"7px 9px",borderRadius:7,textDecoration:"none",fontSize:11.5,color:path===href?"#fff":"#c5d0e1",background:path===href?"#f26a1b":"transparent"}}>{label}</Link>)}</div>}
      </nav>
      <div style={{marginTop:"auto",padding:"13px 17px",borderTop:"1px solid #ffffff16"}}><button onClick={logout} style={{border:0,background:"transparent",color:"#e7edf7",fontSize:12.5,cursor:"pointer",padding:"5px 0"}}>↪ Log out</button></div>
    </aside><Assistant /></>;
  }

  return (
    <><AuthLostBanner /><aside className="sidebar">
      <button className="sidebar-hide" title="Hide menu (more screen space)" onClick={() => toggleHidden(true)}>⟨</button>
      <div className="brand">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* update331c: white-knockout wordmark on the navy sidebar. Transparent
              background, no plate — same artwork as the document version. */}
          <Logo height={22} variant="white" />
          <span style={{ fontSize: 10, fontWeight: 400, color: "#6E7780", letterSpacing: "0.02em" }}>Site Management Software</span>
        </div>
        {String(session?.role || "").toLowerCase().replace(/[^a-z]/g, "") === "itexecutive" && <button type="button" onClick={toggleItTheme} aria-label="Toggle light or dark theme" title="Toggle light or dark theme" style={{ marginLeft: "auto", width: 34, height: 34, borderRadius: 18, border: "1px solid #ffffff30", background: "#ffffff12", color: "#fff", cursor: "pointer" }}>{itTheme === "dark" ? "☀" : "☾"}</button>}
      </div>
      {session && (
        <div style={{ padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{session.name}</div>
          <div style={{ color: "#6E7780", fontSize: 11, textTransform: "capitalize", marginBottom: 6 }}>{(session.role || "").replace("_", " ")}</div>
          <div style={{ marginBottom: 6 }}><NotifyBell /></div>
          {session.sites?.length > 1 && (
            <select defaultValue={session.currentSite} onChange={e => { setCurrentSite(e.target.value); window.location.reload(); }}
              style={{ width: "100%", fontSize: 11.5, background: "rgba(255,255,255,0.08)", color: "#fff", borderColor: "rgba(255,255,255,0.15)" }}>
              {session.sites.map(s => <option key={s.id} value={s.id} style={{ color: "#000" }}>{s.name}</option>)}
            </select>
          )}
        </div>
      )}

      {showDash && (
        <nav style={{ marginTop: 10 }}>
          {/* update237: ONE Home entry. Home IS the dashboard; Projects / Dashboard / Site Reports
              are reached from the page cards at the bottom of Home. Approvals is NOT listed here
              (it is reached from Quick Access) — the /approvals route itself is untouched. */}
          {/* update236: Home IS the dashboard now (Projects / Dashboard / Site reports are its tabs) */}
          <Link href="/home" className={path === "/home" || path === "/projects" || path === "/dashboard" || path === "/reports" ? "active" : ""}>🏠 Home</Link>
        </nav>
      )}

      {GROUPS.map(g => <Group key={g.label} label={g.label} items={g.items} subs={g.subs} canSee={canSee} path={path} open={open} toggle={toggle} unreadNotices={unreadNotices} />)}

      <Group label="Help" canSee={() => true} path={path} open={open} toggle={toggle} unreadNotices={unreadNotices} items={[{ href: "/help?ctx=" + encodeURIComponent(path || "/"), label: "❓ Help Center", module: null }]} />{/* update401 */}
      {showAccess && <Group label="Admin" canSee={canSee} path={path} open={open} toggle={toggle} unreadNotices={unreadNotices} items={[{ href: "/access", label: "Access Rights", module: null }, { href: "/it/camera-log", label: "Punch camera diagnostics", module: null }, { href: "/procure/import/admin", label: "Excel import: settings", module: null }, { href: "/admin-access", label: "Admin & access (Director)", module: null }, { href: "/sitemaster", label: "Site Master (timings)", module: null }, { href: "/backup", label: "Backup & Restore", module: null }, { href: "/tickets", label: "Support Tickets", module: null }]} />}

      <nav style={{ marginTop: 20 }}>
        <a onClick={logout} style={{ cursor: "pointer" }}>Log out</a>
      </nav>
    </aside><Assistant /></>
  );
}