"use client";
import Assistant from "@/components/Assistant";
import AuthLostBanner from "@/components/AuthLostBanner";   // update451
import NotifyBell from "@/components/NotifyBell";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { logoutAuth, getSession, refreshSessionRights, canSeeModuleAnySite, canSeeModule, canAnySite } from "@/lib/auth";
import { getLocalWorker } from "@/lib/mobile";
import { LANGS, getLang, setLang, t } from "@/lib/i18n";

// Every tab / More item is mapped to Access Rights, same as the web sidebar.
// show(sess) must be true for the item to appear; Directors pass everything
// (canSeeModuleAnySite / canAnySite return true for director).
const primaryBase = [
  { href: "/m/dashboard", ico: "🏠", key: "nav_home", show: s => !!s?.role },   // update229: staff home dashboard (workers use workerPrimary, unaffected)
  { href: "/m", ico: "⏱", key: "nav_punch", show: () => true },
  { href: "/m/muster", ico: "👥", key: "nav_muster", show: s => canSeeModuleAnySite(s, "attendance") },
  { href: "/m/dpr", ico: "📋", key: "nav_dpr", show: s => canSeeModuleAnySite(s, "dpr") },
  { href: "/m/stock", ico: "📦", key: "nav_stock", show: s => canSeeModuleAnySite(s, "stock") },
];
const more = [
  { href: "/m", ico: "⏱", key: "nav_punch", show: s => s?.role === "supervisor" },
  { href: "/m/report", ico: "📊", key: "m_report", show: s => s?.role !== "director" && (canSeeModuleAnySite(s, "dpr") || canSeeModuleAnySite(s, "attendance")) },
  { href: "/m/dpr", ico: "📋", key: "nav_dpr", show: s => s?.role === "director" },   // update188: director reads DPRs from More
  { href: "/m/report", ico: "📊", key: "nav_report", show: s => s?.role === "director" },   // update227: moved off director tab bar
  { href: "/m/stock", ico: "📦", key: "nav_stock", show: s => s?.role === "director" },     // update227: moved off director tab bar
  { href: "/m/indent", ico: "🧾", key: "m_indent", show: s => canSeeModuleAnySite(s, "indent") },
  { href: "/m/order", ico: "🛒", key: "m_order", show: s => canSeeModuleAnySite(s, "indent") },   // update464
  { href: "/m/deliveries", ico: "📥", key: "m_deliveries", show: s => canSeeModuleAnySite(s, "stock") || canSeeModuleAnySite(s, "indent") },   // update462
  { href: "/m/assets", ico: "🔧", key: "m_assets", show: s => canSeeModuleAnySite(s, "assets") },
  { href: "/m/rentals", ico: "🚜", key: "m_rentals", show: s => canSeeModuleAnySite(s, "rentals") },
  { href: "/m/money", ico: "₹", key: "m_money", show: s => canSeeModuleAnySite(s, "money") },
  { href: "/m/tasks", ico: "📋", key: "m_tasks", show: s => !!s?.id },   // update327: My Tasks — every signed-in user
  { href: "/help", ico: "❓", key: "m_help", show: s => !!s?.id },   // update401: Help Center (contextual ? added at open time)
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
    if (st?.id) import("@/lib/files").then(m => m.ensureFileSession()).catch(() => {});   // update460: file-view cookie
  }, []);
  const pickLang = l => { setLang(l); window.location.reload(); };
  const role = sess?.role || null;
  const workerPrimary = [{ href: "/m", ico: "⏱", key: "nav_punch" }];
  // update188: director tabs = view & approve, entry screens live one tap deeper.
  // update227: director tabs lead with Home (Director Dashboard) + Projects, reachable from every page.
  const primary = workerOnly ? workerPrimary : role === "director"
    ? [{ href: "/m/dashboard", ico: "🏠", key: "nav_home" },
       // update263: Projects tab removed on the Director's instruction — the explorer is reached
       // from the Home page's Projects card; remaining tabs reflow automatically (flex bar)
       { href: "/m/approvals", ico: "✅", key: "nav_approvals" },
       { href: "/m/muster", ico: "👥", key: "nav_muster" }]
    : primaryBase.filter(tab => tab.show(sess));
  const [pendCount, setPendCount] = useState(0);
  useEffect(() => {
    if (role !== "director") return;
    let alive = true;
    import("@/lib/data").then(({ getDirectorPulse }) => getDirectorPulse().then(p => { if (alive && p) setPendCount(p.moneyPending || 0); })).catch(() => {});
    return () => { alive = false; };
  }, [role]);
  const moreVisible = (workerOnly || !sess) ? [] : more.filter(m => m.show(sess));
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const supervisor = role === "supervisor" && !workerOnly;
  const quickItems = [
    { href: "/m/indent", label: "Create Material Indent", icon: "🧾", show: canSeeModule(sess, "indent") },
    { href: "/m/muster", label: "Review Muster", icon: "👥", show: canSeeModule(sess, "attendance") },
    { href: "/m/dpr", label: "Create DPR", icon: "📋", show: canSeeModule(sess, "dpr") },
    { href: "/m/money", label: "Site Expenses", icon: "₹", show: canSeeModule(sess, "money") },
    { href: "/m/add", label: "Add Worker", icon: "👷", show: canAnySite(sess, "workers", "create") || canAnySite(sess, "workers", "manage") },
  ].filter(x => x.show);
  useEffect(() => {
    const showMore = () => setOpen(true);
    window.addEventListener("psk-open-more", showMore);
    return () => window.removeEventListener("psk-open-more", showMore);
  }, []);
  useEffect(() => {
    if (!quickOpen) return;
    window.history.pushState({ pskQuick: true }, "");
    const back = () => setQuickOpen(false);
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [quickOpen]);
  const inMore = moreVisible.some(m => m.href === path);

  async function logout() {
    try { localStorage.removeItem("psk_worker"); } catch {}   // worker punch profile
    await logoutAuth();                                        // staff session + database auth
    setOpen(false);
    router.push("/m/login");
  }

  return (
    <>
      <AuthLostBanner loginHref="/m/login" />
      {supervisor && quickOpen && (
        <div onClick={() => setQuickOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,30,.45)", zIndex: 80, display: "flex", alignItems: "flex-end" }}>
          <section role="dialog" aria-modal="true" aria-labelledby="quick-action-title" onClick={e => e.stopPropagation()} style={{ width: "min(520px,100%)", margin: "0 auto", background: "#fff", borderRadius: "22px 22px 0 0", padding: "18px 16px calc(18px + env(safe-area-inset-bottom))", maxHeight: "75dvh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h2 id="quick-action-title" style={{ margin: 0, fontSize: 19 }}>Quick Action</h2><button aria-label="Close quick actions" onClick={() => setQuickOpen(false)} style={{ minWidth: 44, minHeight: 44, border: 0, background: "transparent", fontSize: 24 }}>×</button></div>
            {quickItems.length ? quickItems.map(x => <Link key={x.href} href={x.href} onClick={() => setQuickOpen(false)} style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 52, borderBottom: "1px solid var(--border)", color: "var(--text)", textDecoration: "none", fontSize: 15 }}><span style={{ fontSize: 22 }}>{x.icon}</span>{x.label}<span style={{ marginLeft: "auto" }}>→</span></Link>) : <p>No quick actions are available for your permissions.</p>}
          </section>
        </div>
      )}
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
      <nav className="m-nav" style={supervisor ? { display: "grid", gridTemplateColumns: "1fr 1fr 1.15fr 1fr 1fr", alignItems: "end", paddingBottom: "env(safe-area-inset-bottom)" } : undefined}>
        {supervisor ? <>
          <Link href="/m/dashboard" className={path === "/m/dashboard" ? "active" : ""}><span className="ico">🏠</span>Home</Link>
          {canSeeModule(sess,"attendance") ? <Link href="/m/muster" className={path === "/m/muster" ? "active" : ""}><span className="ico">👥</span>Muster</Link> : <span />}
          <button type="button" onClick={() => setQuickOpen(true)} style={{ border: 0, background: "transparent", color: "inherit", font: "inherit", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", minHeight: 52 }}><span style={{ width: 48, height: 48, borderRadius: 24, background: "var(--copper)", color: "white", display: "grid", placeItems: "center", fontSize: 28, marginTop: -20 }}>＋</span>Quick Action</button>
          {canSeeModule(sess,"dpr") ? <Link href="/m/dpr" className={path === "/m/dpr" ? "active" : ""}><span className="ico">📋</span>DPR</Link> : <span />}
          <a onClick={() => setOpen(o => !o)} className={inMore ? "active" : ""} style={{ cursor: "pointer" }}><span className="ico">▦</span>More</a>
        </> : primary.map(tab => (
          <Link key={tab.href} href={tab.href} className={path === tab.href ? "active" : ""} style={{ position: "relative" }}>
            <span className="ico">{tab.ico}</span>{t(lang, tab.key)}
            {tab.key === "nav_approvals" && pendCount > 0 && (
              <span style={{ position: "absolute", top: 2, right: "18%", background: "var(--red)", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 6px" }}>{pendCount}</span>
            )}
          </Link>
        ))}
        {!supervisor && <a onClick={() => setOpen(o => !o)} className={inMore ? "active" : ""} style={{ cursor: "pointer" }}>
          <span className="ico">⋯</span>{t(lang, "nav_more")}
        </a>}
      </nav>
      {sess?.id ? <NotifyBell mobile /> : null}
      <Assistant />
    </>
  );
}
