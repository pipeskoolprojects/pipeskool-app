"use client";
// update237: HOME = the full-width dashboard. No tab strip.
// 236 put Projects / Dashboard / Site reports in a top tab bar; 237 removes that bar and puts
// them as four cards at the foot of the Home page instead, each linking to its real route.
// The routes are unchanged and still render the same view components — nothing was duplicated
// and nothing was deleted, only the way you get there changed.
//
// Still true, and still the point: there are NO iframes here, and exactly ONE <Sidebar />.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import HomeHeader from "@/components/HomeHeader";
import HomeDashboard from "@/components/HomeDashboard";
import SupervisorDashboard from "@/components/SupervisorDashboard";
import { getSession } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  const [sess, setSess] = useState(null);
  const [sites, setSites] = useState([]);
  const [asSite, setAsSite] = useState(null);       // director: view as site manager
  const [pickSite, setPickSite] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace("/login"); return; }
    // phones keep the mobile home (same component, mobile shell + bottom nav).
    // /m/dashboard bounces back here above 760px — the thresholds do not overlap, so no loop.
    if (typeof window !== "undefined" && window.innerWidth <= 760) { router.replace("/m/dashboard"); return; }
    setSess(s);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const isDirector = sess?.role === "director";
  const viewSiteId = isDirector ? asSite : (sess?.currentSite || sess?.sites?.[0]?.id || null);
  const siteName = useMemo(() => sites.find(s => String(s.id) === String(viewSiteId))?.name
    || (sess?.sites || []).find(s => String(s.id) === String(viewSiteId))?.name || "", [sites, viewSiteId, sess]);

  if (!sess) return null;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main" style={{ padding: 0 }}>
        {sess.role === "ho_admin" ? <SupervisorDashboard sess={sess} /> : <>
          <HomeHeader mode="desk" sess={sess} sites={sites} isDirector={isDirector}
            asSite={asSite} setAsSite={setAsSite} siteName={siteName}
            pickSite={pickSite} setPickSite={setPickSite} />
          <HomeDashboard mode="desk" asSite={asSite} setAsSite={setAsSite}
            onSites={setSites} onOpenProjects={() => router.push("/projects")} showPageCards />
        </>}
      </main>
    </div>
  );
}
