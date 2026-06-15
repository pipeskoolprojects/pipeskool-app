"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { getSession, clearSession, canSeeModule } from "@/lib/auth";

const allLinks = [
  { href: "/dashboard", label: "Dashboard", module: "dashboard" },
  { href: "/attendance", label: "Attendance register", module: "attendance" },
  { href: "/wages", label: "Muster roll & wages", module: "wages" },
  { href: "/workers", label: "Workers", module: "workers" },
  { href: "/dpr", label: "Daily progress (DPR)", module: "dpr" },
  { href: "/expenses", label: "Expenses & petty cash", module: "money" },
  { href: "/stock", label: "Material stock", module: "stock" },
  { href: "/purchase", label: "Indent & purchase", module: "indent" },
  { href: "/assets", label: "Tools & assets", module: "assets" },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(null);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.push("/login"); return; }
    setSession(s);
  }, [router]);

  function logout() { clearSession(); router.push("/login"); }

  const links = allLinks.filter(l => !session || canSeeModule(session, l.module));
  const showAccess = session && session.role === "director";

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
          <div style={{ color: "#6E7780", fontSize: 11, textTransform: "capitalize" }}>{(session.role || "").replace("_", " ")}</div>
        </div>
      )}
      <div className="module-label">Core site operations</div>
      <nav>
        {links.map(l => (
          <Link key={l.href} href={l.href} className={path === l.href ? "active" : ""}>{l.label}</Link>
        ))}
      </nav>
      {showAccess && <>
        <div className="module-label" style={{ marginTop: 14 }}>Admin</div>
        <nav><Link href="/access" className={path === "/access" ? "active" : ""}>Access rights</Link></nav>
      </>}
      <nav style={{ marginTop: 20 }}>
        <a onClick={logout} style={{ cursor: "pointer" }}>Log out</a>
      </nav>
    </aside>
  );
}
