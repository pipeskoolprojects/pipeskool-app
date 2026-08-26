"use client";
// update236: HOME = the real dashboard, not a chooser.
// The 235 four-card launcher is gone. /home now renders the SAME HomeDashboard component the
// phone renders, inside the desktop shell, with Projects / Dashboard / Site reports as TABS.
//
// Tabs are plain component swaps — NOT iframes. 233/234 embedded these pages in iframes and a
// link clicked inside one dropped ?embed=1, so the embedded page drew the whole app chrome
// again (two sidebars, two scrollbars). Rendering the view components directly cannot do that:
// there is exactly ONE <Sidebar /> on this page, owned here.
//
// Panes mount lazily on first visit and then stay mounted (hidden), so switching tabs keeps
// scroll position and does not re-run every loader.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import HomeHeader from "@/components/HomeHeader";
import HomeDashboard from "@/components/HomeDashboard";
import ProjectsView from "@/components/ProjectsView";
import DashboardView from "@/components/DashboardView";
import ReportsView from "@/components/ReportsView";
import { getSession } from "@/lib/auth";

const TABS = [
  ["home", "🏠", "Home"],
  ["projects", "📁", "Projects"],
  ["dashboard", "📊", "Dashboard"],
  ["reports", "📋", "Site reports"],
];
const VALID = TABS.map(t => t[0]);

export default function HomePage() {
  const router = useRouter();
  const [sess, setSess] = useState(null);
  const [sites, setSites] = useState([]);
  const [asSite, setAsSite] = useState(null);       // director: view as site manager
  const [pickSite, setPickSite] = useState(false);
  const [tab, setTab] = useState("home");
  const [seen, setSeen] = useState({ home: true }); // lazy mount, then keep alive

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace("/login"); return; }
    // phones keep the mobile home (same component, mobile shell + bottom nav).
    // /m/dashboard bounces back here above 760px — the thresholds do not overlap, so no loop.
    if (typeof window !== "undefined" && window.innerWidth <= 760) { router.replace("/m/dashboard"); return; }
    setSess(s);
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t && VALID.includes(t)) { setTab(t); setSeen(v => ({ ...v, [t]: true })); }
    } catch {}
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const go = t => {
    setTab(t);
    setSeen(v => ({ ...v, [t]: true }));
    setPickSite(false);
    try { window.history.replaceState(null, "", t === "home" ? "/home" : "/home?tab=" + t); } catch {}
  };

  const isDirector = sess?.role === "director";
  const viewSiteId = isDirector ? asSite : (sess?.currentSite || sess?.sites?.[0]?.id || null);
  const siteName = useMemo(() => sites.find(s => String(s.id) === String(viewSiteId))?.name
    || (sess?.sites || []).find(s => String(s.id) === String(viewSiteId))?.name || "", [sites, viewSiteId, sess]);

  if (!sess) return null;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main" style={{ padding: 0 }}>
        <HomeHeader mode="desk" sess={sess} sites={sites} isDirector={isDirector}
          asSite={asSite} setAsSite={setAsSite} siteName={siteName}
          pickSite={pickSite} setPickSite={setPickSite} />

        <div className="home-tabs">
          {TABS.map(([k, ico, label]) => (
            <button key={k} type="button" onClick={() => go(k)} className={tab === k ? "active" : ""}>
              <span aria-hidden="true">{ico}</span> {label}
            </button>
          ))}
        </div>

        <div style={{ display: tab === "home" ? "block" : "none" }}>
          <HomeDashboard mode="desk" asSite={asSite} setAsSite={setAsSite}
            onSites={setSites} onOpenProjects={() => go("projects")} />
        </div>
        {seen.projects && <div className="home-pane" style={{ display: tab === "projects" ? "block" : "none" }}><ProjectsView /></div>}
        {seen.dashboard && <div className="home-pane" style={{ display: tab === "dashboard" ? "block" : "none" }}><DashboardView /></div>}
        {seen.reports && <div className="home-pane" style={{ display: tab === "reports" ? "block" : "none" }}><ReportsView /></div>}
      </main>
    </div>
  );
}
