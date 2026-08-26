"use client";
// update233: DIRECTOR HOME (desktop shell) — one place with tabs instead of separate
// Dashboard / Projects / Site Reports sidebar items. Each tab EMBEDS the existing page
// unchanged via the same-origin ?embed=1 pattern from update207, so every route, query,
// permission and piece of data keeps working exactly as before. Nothing was rewritten.
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";

const TABS = [
  ["overview", "🏠", "Home overview", "/m/dashboard?embed=1"],
  ["projects", "📁", "Projects", "/projects?embed=1"],
  ["dashboard", "📊", "Dashboard", "/dashboard?embed=1"],
  ["reports", "📋", "Site reports", "/reports?embed=1"],
];

function HomeInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [sess, setSess] = useState(null);
  const [tab, setTab] = useState("overview");
  const [seen, setSeen] = useState({ overview: true });   // lazy-mount, then keep alive

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace("/login"); return; }
    setSess(s);
    const t = sp.get("tab");
    if (t && TABS.some(x => x[0] === t)) { setTab(t); setSeen(v => ({ ...v, [t]: true })); }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  function go(k) {
    setTab(k); setSeen(v => ({ ...v, [k]: true }));
    try { window.history.replaceState(null, "", "/home?tab=" + k); } catch {}
  }
  if (!sess) return null;

  return (
    <div className="app-shell" style={{ display: "flex", minHeight: "100dvh" }}>
      <Sidebar />
      <main className="main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ padding: "16px 20px 0" }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>🏠 Director Home</h1>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Everything in one place — overview, projects, dashboard and site reports.</div>
        </div>
        <div style={{ display: "flex", gap: 4, padding: "10px 20px 0", borderBottom: "2px solid var(--border)", overflowX: "auto" }}>
          {TABS.map(([k, ico, label]) => (
            <button key={k} type="button" onClick={() => go(k)}
              style={{ flexShrink: 0, border: "none", background: "none", padding: "9px 14px", fontSize: 13, cursor: "pointer",
                fontWeight: tab === k ? 800 : 600, color: tab === k ? "var(--copper)" : "var(--text)",
                borderBottom: tab === k ? "3px solid var(--copper)" : "3px solid transparent" }}>
              {ico} {label}</button>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {TABS.map(([k, , , src]) => seen[k] ? (
            <iframe key={k} src={src} title={k}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", display: tab === k ? "block" : "none", background: "var(--bg)" }} />
          ) : null)}
        </div>
      </main>
    </div>
  );
}

export default function DirectorHome() {
  return <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}><HomeInner /></Suspense>;
}
