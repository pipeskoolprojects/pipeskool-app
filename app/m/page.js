"use client";
import { useEffect, useRef, useState } from "react";
import { getWorkerProxyFlag } from "@/lib/mobile";   // update288
import { useRouter } from "next/navigation";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { getWorkerSiteOptions } from "@/lib/mobile";
import { getLocalWorker, setLocalWorker, findWorkerByMobile, createStaffPunchProfile, getPosition, distanceMeters, getTodayPunch, punch } from "@/lib/mobile";
import { getSession, refreshSessionMobile, setCurrentSite } from "@/lib/auth";
import { siteForPunch } from "@/lib/mobile";
import { getLang, t } from "@/lib/i18n";
import Logo from "@/components/Logo";
import CameraCapture from "@/components/CameraCapture";
import { getTodayQuote } from "@/lib/notices";

export default function PunchScreen() {
  const router = useRouter();
  const [worker, setWorker] = useState(null);
  const [proxyAuth, setProxyAuth] = useState(false);   // update288
  const [proxyErr, setProxyErr] = useState("");        // update289: the check is never silent
  useEffect(() => { if (worker?.id) getWorkerProxyFlag(worker.id).then(f => { setProxyAuth(f); setProxyErr(""); }).catch(e => { setProxyAuth(false); setProxyErr(e.message); }); }, [worker?.id]);
  const [wSites, setWSites] = useState([]);   // update168: labour multi-site allotments
  useEffect(() => { if (worker?.id) getWorkerSiteOptions(worker).then(setWSites); else setWSites([]); }, [worker?.id]);
  const [mQuote, setMQuote] = useState(null);
  useEffect(() => { getTodayQuote().then(setMQuote); }, []);
  const [pos, setPos] = useState(null);
  const [noProfile, setNoProfile] = useState(false);
  const [staffRole, setStaffRole] = useState(null);
  const [staffSites, setStaffSites] = useState([]);
  async function switchPunchSite(id) {
    setCurrentSite(id);
    const ov = await siteForPunch(id);
    if (!ov) return;
    setWorker(w => { const nw = { ...w, ...ov }; setLocalWorker(nw); return nw; });
    setDist(null);
    getPosition().then(p => {
      setPos(p);
      if (ov.geofence_lat == null) setDist(0);                    // no geofence configured -> nothing to enforce
      else if (p) setDist(distanceMeters(p.lat, p.lng, ov.geofence_lat, ov.geofence_lng));
      else setDist(null);                                          // geofence set but no GPS -> stay locked (update144)
    });
  }
  const [lang, setLangState] = useState("en");
  useEffect(() => { setLangState(getLang()); }, []);
  const [dist, setDist] = useState(null);
  const [today, setToday] = useState({});
  const [busy, setBusy] = useState(false);
  const [showCam, setShowCam] = useState(false);
  const [msg, setMsg] = useState("");


  useEffect(() => {
    const w = getLocalWorker();
    if (!w) {
      const sess = getSession();
      if (!sess) { router.push("/m/login"); return; }
      // staff signed in: auto-link their own worker punch profile by mobile
      (async () => {
        const mob = sess.mobile || await refreshSessionMobile(sess);
        let wk = mob ? await findWorkerByMobile(mob) : null;
        if (sess.requires_punch === false) { setNoProfile("nopunch"); return; }
        if (!wk && sess.role !== "director" && mob) {
          // every staff member (except Directors) must punch — enrol them automatically
          const made = await createStaffPunchProfile({ ...sess, mobile: mob });
          if (made.ok) wk = await findWorkerByMobile(mob);
          else { setNoProfile(made.error || true); return; }
        }
        if (wk) {
          const target = sess.currentSite || sess.sites?.[0]?.id;
          if (target && Number(target) !== Number(wk.site_id)) {
            const ov = await siteForPunch(target);
            if (ov) wk = { ...wk, ...ov };
          }
          setLocalWorker(wk); window.location.reload();
        }
        else if (sess.role === "director") { router.push("/m/report"); }
        else setNoProfile(true);
      })();
      return;
    }
    (async () => {
      let wv = w;
      const sess = getSession();
      if (sess) {
        setStaffRole(String(sess.role || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
        setStaffSites(sess.sites || []);
        const target = sess.currentSite || sess.sites?.[0]?.id;
        if (target && Number(target) !== Number(w.site_id)) {
          const ov = await siteForPunch(target);
          if (ov) { wv = { ...w, ...ov }; setLocalWorker(wv); }
        }
      }
      setWorker(wv);
      getTodayPunch(wv.id).then(setToday);
      getPosition().then(p => {
        setPos(p);
        if (wv.geofence_lat == null) setDist(0);                   // no geofence configured -> nothing to enforce
        else if (p) setDist(distanceMeters(p.lat, p.lng, wv.geofence_lat, wv.geofence_lng));
        else setDist(null);                                        // geofence set but no GPS -> stay locked (update144)
      });
    })();
  }, [router]);

  if (noProfile) return (
    <div className="m-wrap" style={{ padding: 20 }}>
      <div className="note amber" style={{ marginTop: 30 }}>
        {noProfile === "nopunch"
          ? <>Attendance punch is not enabled for your role. Use <b>Muster</b>, <b>DPR</b> and the other tabs — or ask the Director to enable punching for you in Workers &amp; Staff Master.</>
          : noProfile === "director"
          ? <>You are signed in as <b>Director</b> — Directors are exempt from punch in/out. Everyone else punches automatically from this tab.</>
          : typeof noProfile === "string"
          ? <>Punch profile setup failed: <b>{noProfile}</b> — show this message to the Director.</>
          : <>Your punch profile could not be set up automatically. Ask the Director to check your mobile number and site in Workers &amp; Staff Master, then try again.</>}
      </div>
      <button className="primary btn-block" style={{ marginTop: 14 }} onClick={() => window.location.href = "/m/muster"}>Go to Daily muster</button>
    </div>
  );
  if (!worker) return (
    <div className="m-wrap" style={{ padding: 20, textAlign: "center" }}>
      <div className="muted" style={{ marginTop: 60 }}>Checking your punch profile…</div>
    </div>
  );

  const insideFence = dist !== null && dist <= (worker.geofence_radius_m || 200);
  const phase = !today.punch_in ? "in" : !today.punch_out ? "out" : "done";
  const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

  function startPunch() {
    if (!insideFence || phase === "done" || busy) return;
    setShowCam(true); // live selfie first, punch on capture — no file picker
  }

  async function onSelfie(file) {
    setShowCam(false);
    if (!file) return;
    setBusy(true); setMsg("");
    const res = await punch(worker, pos, file);
    setBusy(false);
    if (!res.ok) { setMsg(res.error); return; }
    const fresh = await getTodayPunch(worker.id);
    setToday(fresh);
    setMsg(phase === "in"
      ? t(lang, "punched_in")
      : `${fresh.status === "present" ? t(lang, "full_day") : fresh.status === "half_day" ? t(lang, "half_day") : t(lang, "recorded")}${fresh.ot_hours > 0 ? " · OT " + fresh.ot_hours + "h " + t(lang, "ot_sent") : ""}.`);
    // update241: removed `e.target.value = ""` — a leftover from when the selfie came from a
    // file input. onSelfie(file) is called by CameraCapture's onCapture, so `e` never existed
    // and this threw a ReferenceError AFTER a successful punch, crashing the punch screen.
  }

  return (
    <>
    {staffRole === "director" && (
      <a href="/m/dashboard" style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 40, background: "#0F1419", color: "#fff", borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 700, textDecoration: "none", boxShadow: "0 4px 14px rgba(0,0,0,0.3)", whiteSpace: "nowrap" }}>
        📊 Director Dashboard</a>
    )}
    <div className="m-wrap">
      <div className="m-head">
        <div>
          <div className="title">{worker.full_name}</div>
          <div className="sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>{staffRole || worker.category} ·</span>
            {(staffSites.length > 1 ? staffSites : wSites.length > 1 ? wSites : []).length > 1 ? (
              <select value={worker.site_id} onChange={e => switchPunchSite(e.target.value)}
                style={{ background: "transparent", color: "inherit", border: "1px solid rgba(255,255,255,.35)", borderRadius: 8, padding: "2px 6px", fontSize: 12 }}>
                {(staffSites.length > 1 ? staffSites : wSites).map(st => <option key={st.id} value={st.id} style={{ color: "#0F1419" }}>{st.name}</option>)}
              </select>
            ) : <span>{worker.site_name}</span>}
          </div>
        </div>
        <div className="sub">{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
      </div>
      <div className="m-body" style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <Logo height={20} color="#FF7A1A" wordColor="#0F1419" align="center" />
        </div>
        {mQuote && <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 8px 8px", fontStyle: "italic" }}>💡 {mQuote}</div>}
        {isDemo && <div className="note amber">Demo mode — punches save on this phone only.</div>}

        {/* update224: multi-site worker — large Select Site control (assigned sites ONLY) */}
        {!staffRole && wSites.length > 1 && (
          <div style={{ textAlign: "left", margin: "4px 2px 10px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Select Site</div>
            <select value={worker.site_id} onChange={e => switchPunchSite(e.target.value)}
              style={{ width: "100%", padding: "13px 14px", fontSize: 15.5, fontWeight: 700, borderRadius: 12, border: "1.5px solid var(--copper)", background: "#fff" }}>
              {wSites.map(st => <option key={st.id} value={st.id}>{st.name}{Number(st.id) === Number(worker.site_id) ? " (Current)" : ""}</option>)}
            </select>
          </div>
        )}
        <div style={{ margin: "10px 0" }}>
          {dist === null ? (
            <span className="geo-chip geo-wait">{t(lang, "checking_loc")}</span>
          ) : insideFence ? (
            <span className="geo-chip geo-ok">{t(lang, "inside_site")}</span>
          ) : (
            <span className="geo-chip geo-bad">📍 {dist} {t(lang, "outside_site")}</span>
          )}
          {dist !== null && (insideFence
            ? <div style={{ fontSize: 11.5, color: "var(--green)", marginTop: 4 }}>📍 You are within the site location{pos?.acc ? " · Accuracy " + Math.round(pos.acc) + "m" : ""}</div>
            : <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 4 }}>You are outside <b>{worker.site_name}</b> — move closer to punch here, or pick another of your sites above.</div>)}
        </div>

        <button
          className={"punch-btn " + (phase === "in" ? "punch-in" : phase === "out" ? "punch-out" : "punch-done")}
          onClick={startPunch}
          disabled={!insideFence || phase === "done" || busy}
          style={{ opacity: insideFence || phase === "done" ? 1 : 0.5 }}
        >
          <span style={{ fontSize: 30 }}>{phase === "done" ? "✓" : "☝"}</span>
          {busy ? t(lang, "saving") : phase === "in" ? t(lang, "punch_in") : phase === "out" ? t(lang, "punch_out") : t(lang, "done_today")}
        </button>
        <div className="sub">📷 Selfie is captured with every punch</div>
        {proxyAuth && (
          <a href="/m/proxy" style={{ display: "block", textAlign: "center", margin: "12px 16px 0", padding: "12px 14px", borderRadius: 12, background: "var(--deep)", color: "#fff", fontWeight: 800, textDecoration: "none" }}>
            🛡 Mark attendance for your team →
          </a>
        )}{/* update288: visible only to workers granted Proxy Attendance Authority */}
        {proxyErr && <div className="note amber" style={{ marginTop: 8, fontSize: 11.5 }}>🛡 Proxy-authority check failed: {proxyErr}</div>}{/* update289 */}

        {showCam && <CameraCapture facing="user" title="Live selfie for punch" onCapture={onSelfie} onCancel={() => setShowCam(false)} />}

        {msg && <div className="note green" style={{ textAlign: "left" }}>{msg}</div>}

        <div className="stat-row">
          <div className="stat-box"><div className="k">In</div><div className="v">{fmtTime(today.punch_in)}</div></div>
          <div className="stat-box"><div className="k">Out</div><div className="v">{fmtTime(today.punch_out)}</div></div>
          <div className="stat-box"><div className="k">Hours</div><div className="v">{today.hours_worked != null ? Math.floor(today.hours_worked) + "h " + String(Math.round((today.hours_worked % 1) * 60)).padStart(2, "0") + "m" : "\u2014"}</div></div>
        </div>

        <div className="muted" style={{ textAlign: "center", fontSize: 10, marginTop: 10 }}>Pipeskool v323</div>{/* update289: visible build tag — if this line is missing on the phone, the deploy is not live */}
        {worker.profile_complete === false && (
          <div className="note amber" style={{ textAlign: "left" }}>
            ⚠ Profile incomplete — bank details pending. Show this to your supervisor.
          </div>
        )}
      </div>
      <MobileNav />
    </div>
    </>
  );
}
