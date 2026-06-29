"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { getSession, clearSession, canSeeModuleAnySite, setCurrentSite } from "@/lib/auth";

const GROUPS = [
  { label: "Core Site Operations", items: [
    { href: "/attendance", label: "Attendance & Labour", module: "attendance" },
    { href: "/wages", label: "Muster Roll & Wages", module: "wages" },
    { href: "/workers", label: "Workers", module: "workers" },
    { href: "/dpr", label: "Daily Progress Report (DPR)", module: "dpr" },
    { href: "/boq", label: "BOQ Master", module: "dpr" },
    { href: "/expenses", label: "Expenses & Petty Cash", module: "money" },
    { href: "/stock", label: "Material Stock & Inventory", module: "stock" },
    { href: "/procure", label: "Indent & Purchase", module: "indent" },
    { href: "/vendors", label: "Vendor Master", module: "indent" },
    { href: "/assets", label: "Tools & Assets", module: "assets" },
  ] },
  { label: "Commercial / Billing", items: [
    { href: "/billing", label: "RA Billing", module: null },
    { href: "/tally", label: "Tally Export", module: null },
  ] },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [open, setOpen] = useState({});

  useEffect(() => {
    const s = getSession();
    if (!s) { router.push("/login"); return; }
    setSession(s);
  }, [router]);

  // auto-expand the group that holds the current page
  useEffect(() => {
    const g = GROUPS.find(grp => grp.items.some(it => it.href === path));
    setOpen(o => {
      const next = { ...o };
      if (g) next[g.label] = true;
      if (path === "/access") next["Admin"] = true;
      return next;
    });
  }, [path]);

  function logout() { clearSession(); router.push("/login"); }
  const toggle = label => setOpen(o => ({ ...o, [label]: !o[label] }));

  const canSee = m => !session || !m || canSeeModuleAnySite(session, m);
  const showAccess = session && session.role === "director";
  const showDash = canSee("dashboard");

  function Group({ label, items }) {
    const visible = items.filter(it => canSee(it.module));
    if (visible.length === 0) return null;
    const hasActive = visible.some(it => it.href === path);
    const isOpen = open[label] ?? hasActive;
    return (
      <div>
        <button className={"nav-group" + (hasActive && !isOpen ? " has-active" : "")} onClick={() => toggle(label)}>
          <span>{label}</span>
          <span className="chev">{isOpen ? "▾" : "▸"}</span>
        </button>
        {isOpen && (
          <nav className="nav-sub" style={{ marginTop: 0 }}>
            {visible.map(l => <Link key={l.href} href={l.href} className={path === l.href ? "active" : ""}>{l.label}</Link>)}
          </nav>
        )}
      </div>
    );
  }

  return (
    <aside className="sidebar">
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
        </nav>
      )}

      {GROUPS.map(g => <Group key={g.label} label={g.label} items={g.items} />)}

      {showAccess && <Group label="Admin" items={[{ href: "/access", label: "Access Rights", module: null }, { href: "/sitemaster", label: "Site Master (timings)", module: null }]} />}

      <nav style={{ marginTop: 20 }}>
        <a onClick={logout} style={{ cursor: "pointer" }}>Log out</a>
      </nav>
    </aside>
  );
}
