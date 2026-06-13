"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase, isDemo } from "@/lib/supabase";
import Logo from "@/components/Logo";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/attendance", label: "Attendance register" },
  { href: "/wages", label: "Muster roll & wages" },
  { href: "/workers", label: "Workers" },
  { href: "/dpr", label: "Daily progress (DPR)" },
  { href: "/expenses", label: "Expenses & petty cash" },
  { href: "/stock", label: "Material stock" },
  { href: "/purchase", label: "Indent & purchase" },
  { href: "/assets", label: "Tools & assets" },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    if (!isDemo) await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Logo height={22} color="#FF7A1A" wordColor="#ffffff" />
          <span style={{ fontSize: 10, fontWeight: 400, color: "#6E7780", letterSpacing: "0.02em" }}>Site Management Software</span>
        </div>
      </div>
      <div className="module-label">Core site operations</div>
      <nav>
        {links.map(l => (
          <Link key={l.href} href={l.href} className={path === l.href ? "active" : ""}>
            {l.label}
          </Link>
        ))}
      </nav>
      <nav style={{ marginTop: 24 }}>
        <a onClick={logout} style={{ cursor: "pointer" }}>Log out</a>
      </nav>
    </aside>
  );
}
