"use client";
// update236: MOBILE HOME — now a thin shell around the shared HomeDashboard component.
// The 504-line implementation that used to live here moved to components/HomeDashboard.js so
// that /home (desktop) and this page render exactly the same dashboard. Nothing about the
// phone experience changes: same header, same bottom nav, same inline project explorer.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MobileNav from "@/components/MobileNav";
import HomeHeader from "@/components/HomeHeader";
import HomeDashboard from "@/components/HomeDashboard";
import SupervisorDashboard from "@/components/SupervisorDashboard";

import { getSession } from "@/lib/auth";

export default function MobileHomePage() {
  const router = useRouter();
  const [sess, setSess] = useState(null);
  const [sites, setSites] = useState([]);
  const [asSite, setAsSite] = useState(null);
  const [pickSite, setPickSite] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace("/m/login"); return; }
    // update236: ?desk=1 is retired — the desktop overview is /home itself now.
    // Desktop/web never stays on the mobile home (231). /home bounces back below 760px.
    if (typeof window !== "undefined" && window.innerWidth > 760) { router.replace("/home"); return; }
    setSess(s);
    const onSess = e => { if (e?.detail) setSess(e.detail); };   // update391: rights refresh → header follows
    window.addEventListener("psk-session", onSess);
    return () => window.removeEventListener("psk-session", onSess);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const isDirector = sess?.role === "director";
  const viewSiteId = isDirector ? asSite : (sess?.currentSite || sess?.sites?.[0]?.id || null);
  const siteName = useMemo(() => sites.find(s => String(s.id) === String(viewSiteId))?.name
    || (sess?.sites || []).find(s => String(s.id) === String(viewSiteId))?.name || "", [sites, viewSiteId, sess]);

  if (!sess) return null;

  return (
    <div style={{ background: "var(--bg)", minHeight: "100dvh" }}>
      {["supervisor","storekeeper","site_engineer","project_coodinator","ho_admin"].includes(sess.role) ? <SupervisorDashboard sess={sess} mode="mobile" /> : <>
        <HomeHeader mode="mobile" sess={sess} sites={sites} isDirector={isDirector}
          asSite={asSite} setAsSite={setAsSite} siteName={siteName}
          pickSite={pickSite} setPickSite={setPickSite} />
        <HomeDashboard mode="mobile" asSite={asSite} setAsSite={setAsSite} onSites={setSites} />
      </>}
      <MobileNav />
    </div>
  );
}
