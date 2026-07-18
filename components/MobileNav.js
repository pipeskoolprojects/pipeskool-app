"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { logoutAuth, getSession } from "@/lib/auth";
import { getLocalWorker } from "@/lib/mobile";
import { LANGS, getLang, setLang, t } from "@/lib/i18n";

const primaryBase = [
  { href: "/m", ico: "⏱", key: "nav_punch" },
  { href: "/m/muster", ico: "👥", key: "nav_muster" },
  { href: "/m/dpr", ico: "📋", key: "nav_dpr" },
  { href: "/m/stock", ico: "📦", key: "nav_stock" },
];
const more = [
  { href: "/m/report", ico: "📊", key: "m_report" },
  { href: "/m/indent", ico: "🧾", key: "m_indent" },
  { href: "/m/assets", ico: "🔧", key: "m_assets" },
  { href: "/m/money", ico: "₹", key: "m_money" },
  { href: "/m/verify", ico: "✔", key: "m_verify" },
  { href: "/m/add", ico: "＋", key: "m_add" },
];

export default function MobileNav() {
  const [role, setRole] = useState(null);
  const [workerOnly, setWorkerOnly] = useState(false);
  const [lang, setLangState] = useState("en");
  useEffect(() => { const st = getSession(); setRole(st?.role || null); setWorkerOnly(!st && !!getLocalWorker()); setLangState(getLang()); }, []);
  const pickLang = l => { setLang(l); window.location.reload(); };
  const workerPrimary = [{ href: "/m", ico: "⏱", key: "nav_punch" }];
  const primary = workerOnly ? workerPrimary : role === "director"
    ? [{ href: "/m/report", ico: "📊", key: "nav_report" }, ...primaryBase.slice(1)]
    : primaryBase;
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const inMore = more.some(m => m.href === path);

  async function logout() {
    try { localStorage.removeItem("psk_worker"); } catch {}   // worker punch profile
    await logoutAuth();                                        // staff session + database auth
    setOpen(false);
    router.push("/m/login");
  }

  return (
    <>
      {open && (
        <div onClick={() => setOpen(false)}
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 40 }}>
          <div onClick={e => e.stopPropagation()}
               style={{ position: "fixed", bottom: 58, left: "50%", transform: "translateX(-50%)", width: "min(430px, 100%)", background: "#fff", borderRadius: "14px 14px 0 0", padding: 10, zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" }}>
            {(workerOnly ? [] : more).map(m => (
              <Link key={m.href} href={m.href} onClick={() => setOpen(false)}
                    style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", fontSize: 14, borderBottom: "1px solid var(--border)", color: path === m.href ? "var(--blue)" : "var(--text)" }}>
                <span style={{ fontSize: 18 }}>{m.ico}</span>{t(lang, m.key)}
              </Link>
            ))}
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <span style={{ fontSize: 18 }}>🌐</span>
              {LANGS.map(([code, label]) => (
                <button key={code} onClick={() => pickLang(code)}
                  style={{ fontSize: 12, padding: "3px 10px", borderRadius: 12, border: "1px solid var(--border)",
                    background: lang === code ? "var(--copper)" : "#fff", color: lang === code ? "#fff" : "var(--text)" }}>
                  {label}
                </button>
              ))}
            </div>
            <a onClick={logout}
               style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", fontSize: 14, color: "var(--red)", cursor: "pointer" }}>
              <span style={{ fontSize: 18 }}>⎋</span>{t(lang, "m_logout")}
            </a>
          </div>
        </div>
      )}
      <nav className="m-nav">
        {primary.map(tab => (
          <Link key={tab.href} href={tab.href} className={path === tab.href ? "active" : ""}>
            <span className="ico">{tab.ico}</span>{t(lang, tab.key)}
          </Link>
        ))}
        <a onClick={() => setOpen(o => !o)} className={inMore ? "active" : ""} style={{ cursor: "pointer" }}>
          <span className="ico">⋯</span>{t(lang, "nav_more")}
        </a>
      </nav>
    </>
  );
}
