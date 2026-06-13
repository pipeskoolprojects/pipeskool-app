"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const primary = [
  { href: "/m", ico: "⏱", label: "Punch" },
  { href: "/m/muster", ico: "👥", label: "Muster" },
  { href: "/m/dpr", ico: "📋", label: "DPR" },
  { href: "/m/stock", ico: "📦", label: "Stock" },
];
const more = [
  { href: "/m/indent", ico: "🧾", label: "Material indent" },
  { href: "/m/assets", ico: "🔧", label: "Tools & assets" },
  { href: "/m/money", ico: "₹", label: "Money / expenses" },
  { href: "/m/verify", ico: "✔", label: "Verify attendance" },
  { href: "/m/add", ico: "＋", label: "Add worker" },
];

export default function MobileNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const inMore = more.some(m => m.href === path);

  return (
    <>
      {open && (
        <div onClick={() => setOpen(false)}
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 40 }}>
          <div onClick={e => e.stopPropagation()}
               style={{ position: "fixed", bottom: 58, left: "50%", transform: "translateX(-50%)", width: "min(430px, 100%)", background: "#fff", borderRadius: "14px 14px 0 0", padding: 10, zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" }}>
            {more.map(m => (
              <Link key={m.href} href={m.href} onClick={() => setOpen(false)}
                    style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", fontSize: 14, borderBottom: "1px solid var(--border)", color: path === m.href ? "var(--blue)" : "var(--text)" }}>
                <span style={{ fontSize: 18 }}>{m.ico}</span>{m.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="m-nav">
        {primary.map(t => (
          <Link key={t.href} href={t.href} className={path === t.href ? "active" : ""}>
            <span className="ico">{t.ico}</span>{t.label}
          </Link>
        ))}
        <a onClick={() => setOpen(o => !o)} className={inMore ? "active" : ""} style={{ cursor: "pointer" }}>
          <span className="ico">⋯</span>More
        </a>
      </nav>
    </>
  );
}
