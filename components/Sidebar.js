"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import NotifyBell from "@/components/NotifyBell";
import { getUnreadNoticeCount } from "@/lib/notices";
import Assistant from "@/components/Assistant";
import { getSession, clearSession, logoutAuth, refreshSessionRights, canSeeModuleAnySite, setCurrentSite } from "@/lib/auth";

const GROUPS = [
  { label: "Core Site Operations", subs: [
    { label: "Labour & Attendance", items: [
      { href: "/attendance", label: "Attendance & Labour", module: "attendance" },
      { href: "/wages", label: "Muster Roll & Wages", module: "wages" },
      { href: "/workers", label: "Workers & Staff Master", module: "workers" },
      { href: "/leave", label: "Leave Requests", module: null },
    ] },
    { label: "Material & Procurement", items: [
      { href: "/procure", label: "Indent & Purchase", module: "indent" },
      { href: "/stock", label: "Material Stock & Inventory", module: "stock" },
      { href: "/stock/grn", label: "GRN Register", module: "stock" }, { href: "/stock/challans", label: "Delivery Challans", module: "stock" },
      { href: "/items", label: "Item / Material Master", module: "stock" },
      { href: "/vendors", label: "Vendor Master", module: "indent" },
      { href: "/assets", label: "Tools & Assets", module: "assets" },
    ] },
    { label: "Site Execution", items: [
      { href: "/dpr", label: "Daily Progress Report (DPR)", module: "dpr" },
      { href: "/rentals", label: "Machines & Rooms (Rent)", module: "rentals" },
      { href: "/expenses", label: "Expenses & Petty Cash", module: "money" },
    ] },
  ] },
  { label: "Communication", items: [
    { href: "/notices", label: "Notice Board", module: "notices" }, { href: "/tasks", label: "Tasks", module: null },
  ] },
  { label: "Commercial / Billing", items: [
    { href: "/boq", label: "BOQ Master", module: "billing" },
    { href: "/billing", label: "RA Billing", module: "billing" },
    { href: "/tally", label: "Tally Export", module: "billing" },
  ] },
];
const groupItems = g => g.items || (g.subs || []).flatMap(x => x.items);

// stable top-level (update204): defined inside Sidebar it remounted the whole nav on every badge/path re-render, eating taps on Android
function Group({ label, items, subs, depth = 0, canSee, path, open, toggle, unreadNotices }) {
  const all = items || (subs || []).flatMap(x => x.items);
  const visibleAll = all.filter(it => canSee(it.module));
  if (visibleAll.length === 0) return null;
  const hasActive = visibleAll.some(it => it.href === path);
  const isOpen = open[label] ?? hasActive;
  return (
    <div style={depth ? { paddingLeft: 10 } : undefined}>
      <button className={"nav-group" + (hasActive && !isOpen ? " has-active" : "")}
              style={depth ? { fontSize: 11, opacity: 0.95 } : undefined}
              onClick={() => toggle(label)}>
        <span>{label}</span>
        <span className="chev">{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && (subs ? (
        subs.map(sg => <Group key={sg.label} label={sg.label} items={sg.items} depth={depth + 1} canSee={canSee} path={path} open={open} toggle={toggle} unreadNotices={unreadNotices} />)
      ) : (
        <nav className="nav-sub" style={{ marginTop: 0, paddingLeft: depth ? 6 : 0 }}>
          {items.filter(it => canSee(it.module)).map(l => (
            <Link key={l.href} href={l.href} className={path === l.href ? "active" : ""}>{l.label}{l.href === "/notices" && unreadNotices > 0 && <span style={{ background: "var(--copper)", color: "#fff", borderRadius: 9, fontSize: 10, padding: "1px 6px", marginLeft: 6 }}>{unreadNotices}</span>}</Link>
          ))}
        </nav>
      ))}
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
  useEffect(() => { if (session) getUnreadNoticeCount(session).then(setUnreadNotices); }, [session, path]);
  useEffect(() => { try { const v = localStorage.getItem("psk_sidebar_hidden") === "1"; setHidden(v); document.documentElement.classList.toggle("psk-nosb", v); } catch {} }, []);
  const toggleHidden = (v) => { setHidden(v); try { localStorage.setItem("psk_sidebar_hidden", v ? "1" : "0"); document.documentElement.classList.toggle("psk-nosb", v); } catch {} };

  useEffect(() => {
    const s = getSession();
    if (!s) { router.push("/login"); return; }
    setSession(s);
    // live rights: re-pull from DB so Access Rights changes apply without re-login
    refreshSessionRights().then(ns => { if (ns) setSession(ns); else router.push("/login"); });
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
      if (path === "/access") next["Admin"] = true;
      return next;
    });
  }, [path]);

  function logout() { logoutAuth(); router.push("/login"); }
  const toggle = label => setOpen(o => ({ ...o, [label]: !o[label] }));

  const canSee = m => !session || !m || canSeeModuleAnySite(session, m);
  const showAccess = session && session.role === "director";
  const showDash = canSee("dashboard");


  if (hidden) return (
    <><button className="sidebar-show" title="Show menu" onClick={() => toggleHidden(false)}>☰</button><Assistant /></>
  );

  if (embedded) return null;

  return (
    <><aside className="sidebar">
      <button className="sidebar-hide" title="Hide menu (more screen space)" onClick={() => toggleHidden(true)}>⟨</button>
      <div className="brand">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Logo height={22} color="#FF7A1A" wordColor="#ffffff" />
          <span style={{ fontSize: 10, fontWeight: 400, color: "#6E7780", letterSpacing: "0.02em" }}>Site Management Software</span>
        </div>
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
          <Link href="/dashboard" className={path === "/dashboard" ? "active" : ""}>Dashboard</Link>
          <Link href="/projects" className={path.startsWith("/projects") ? "active" : ""}>Projects</Link>
        {session?.role === "director" && <Link href="/m/dashboard">📱 Director Home</Link>}   {/* update227: one-tap back to the mobile Director Dashboard from any desktop-layout page */}
          <Link href="/reports" className={path === "/reports" ? "active" : ""}>Site Reports</Link>
        </nav>
      )}

      {GROUPS.map(g => <Group key={g.label} label={g.label} items={g.items} subs={g.subs} canSee={canSee} path={path} open={open} toggle={toggle} unreadNotices={unreadNotices} />)}

      {showAccess && <Group label="Admin" canSee={canSee} path={path} open={open} toggle={toggle} unreadNotices={unreadNotices} items={[{ href: "/access", label: "Access Rights", module: null }, { href: "/sitemaster", label: "Site Master (timings)", module: null }, { href: "/backup", label: "Backup & Restore", module: null }, { href: "/tickets", label: "Support Tickets", module: null }]} />}

      <nav style={{ marginTop: 20 }}>
        <a onClick={logout} style={{ cursor: "pointer" }}>Log out</a>
      </nav>
    </aside><Assistant /></>
  );
}
