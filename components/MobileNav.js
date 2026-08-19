"use client";
import Assistant from "@/components/Assistant";
import NotifyBell from "@/components/NotifyBell";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { logoutAuth, getSession, refreshSessionRights, canSeeModuleAnySite, canAnySite } from "@/lib/auth";
import { getLocalWorker } from "@/lib/mobile";
import { LANGS, getLang, setLang, t } from "@/lib/i18n";

// Every tab / More item is mapped to Access Rights, same as the web sidebar.
// show(sess) must be true for the item to appear; Directors pass everything
// (canSeeModuleAnySite / canAnySite return true for director).
const primaryBase = [
  { href: "/m", ico: "⏱", key: "nav_punch", show: () => true },
  { href: "/m/muster", ico: "👥", key: "nav_muster", show: s => canSeeModuleAnySite(s, "attendance") },
  { href: "/m/dpr", ico: "📋", key: "nav_dpr", show: s => canSeeModuleAnySite(s, "dpr") },
  { href: "/m/stock", ico: "📦", key: "nav_stock", show: s => canSeeModuleAnySite(s, "stock") },
];
const more = [
  { href: "/m/report", ico: "📊", key: "m_report", show: s => canSeeModuleAnySite(s, "dpr") || canSeeModuleAnySite(s, "attendance") },
  { href: "/m/indent", ico: "🧾", key: "m_indent", show: s => canSeeModuleAnySite(s, "indent") },
  { href: "/m/assets", ico: "🔧", key: "m_assets", show: s => canSeeModuleAnySite(s, "assets") },
  { href: "/m/rentals", ico: "🚜", key: "m_rentals", show: s => canSeeModuleAnySite(s, "rentals") },
  { href: "/m/money", ico: "₹", key: "m_money", show: s => canSeeModuleAnySite(s, "money") },
  // update186: verification moved INTO Daily Muster (per-row ✓ + Verify all) — menu entry removed
  { href: "/m/add", ico: "＋", key: "m_add", show: s => canAnySite(s, "workers", "create") || canAnySite(s, "workers", "manage") },
];

export default function MobileNav() {
  const [sess, setSess] = useState(null);
  const [workerOnly, setWorkerOnly] = useState(false);
  const [lang, setLangState] = useState("en");
  useEffect(() => {
    const st = getSession(); setSess(st || null); setWorkerOnly(!st && !!getLocalWorker()); setLangState(getLang());
    // live rights: re-pull from DB so Access Rights changes apply without re-login
    if (st?.id) refreshSessionRights().then(ns => { if (ns) setSess(ns); else window.location.href = "/m/login"; });
  }, []);
  const pickLang = l => { setLang(l); window.location.reload(); };
  const role = sess?.role || null;
  const workerPrimary = [{ href: "/m", ico: "⏱", key: "nav_punch" }];
  const primary = workerOnly ? workerPrimary : role === "director"
    ? [{ href: "/m/report", ico: "📊", key: "nav_report" }, ...primaryBase.slice(1)]
    : primaryBase.filter(tab => tab.show(sess));
  const moreVisible = (workerOnly || !sess) ? [] : more.filter(m => m.show(sess));
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const inMore = moreVisible.some(m => m.href === path);

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
            {moreVisible.map(m => (
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
      {sess?.id ? <NotifyBell mobile /> : null}
      <Assistant />
    </>
  );
}
