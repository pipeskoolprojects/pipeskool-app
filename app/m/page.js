"use client";
import { useEffect, useRef, useState } from "react";
import { getWorkerProxyFlag } from "@/lib/mobile";   // update288
import { useRouter } from "next/navigation";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { getWorkerSiteOptions } from "@/lib/mobile";
import { getLocalWorker, setLocalWorker, findWorkerByMobile, createStaffPunchProfile, getPositionDetailed, distanceMeters, getTodayPunch, punch } from "@/lib/mobile";
import { getSession, refreshSessionMobile, setCurrentSite } from "@/lib/auth";
import { siteForPunch, workerRaiseAdvance, workerMyAdvances } from "@/lib/mobile";   // update436
import { getLang, t } from "@/lib/i18n";
import Logo from "@/components/Logo";
import CameraCapture from "@/components/CameraCapture";
import { getTodayQuote } from "@/lib/notices";
import { getWorkerUpcomingHolidays } from "@/lib/attendanceRules";   // update394

export default function PunchScreen() {
  const router = useRouter();
  const [worker, setWorker] = useState(null);
  const [proxyAuth, setProxyAuth] = useState(false);   // update288
  const [proxyErr, setProxyErr] = useState("");        // update289: the check is never silent
  useEffect(() => { if (worker?.id) getWorkerProxyFlag(worker.id).then(f => { setProxyAuth(f); setProxyErr(""); }).catch(e => { setProxyAuth(false); setProxyErr(e.message); }); }, [worker?.id]);
  // update394: holiday banner — today + next 3 days at this worker's sites (definer RPC; worker app is anon)
  const [upHols, setUpHols] = useState([]);
  useEffect(() => { if (worker?.id) getWorkerUpcomingHolidays(worker.id).then(setUpHols); }, [worker?.id]);
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
    const ov = await siteForPunch(id, worker?.id);
    if (!ov) return;
    setWorker(w => { const nw = { ...w, ...ov }; setLocalWorker(nw); return nw; });
    fenceRef.current = ov; applyFence();
    locate();
  }
  // update470: one place that reads GPS for this screen. A failure is shown with its reason and a Try again
  // button (it used to look like "Checking your location…" forever). The punch stays locked until a real fix.
  const fenceRef = useRef(null);   // the site's current pin/radius
  const posRef = useRef(null);
  const geoRun = useRef(0);
  const [geoErr, setGeoErr] = useState(null);
  const [locating, setLocating] = useState(false);
  function applyFence() {
    const f = fenceRef.current, p = posRef.current;
    if (!f) return;
    if (f.geofence_lat == null) { setDist(0); return; }          // no geofence configured -> nothing to enforce
    if (p) setDist(distanceMeters(p.lat, p.lng, f.geofence_lat, f.geofence_lng));
    else setDist(null);                                           // geofence set but no GPS -> stay locked (update144)
  }
  function locate() {
    const run = ++geoRun.current;
    setGeoErr(null); setLocating(true);
    if (!posRef.current) setDist(fenceRef.current && fenceRef.current.geofence_lat == null ? 0 : null);
    getPositionDetailed().then(r => {
      if (run !== geoRun.current) return;                         // a newer request is running
      setLocating(false);
      if (r.pos) { posRef.current = r.pos; setPos(r.pos); setGeoErr(null); }
      else { setGeoErr(r.error || "timeout"); }
      applyFence();
    });
  }
  // coming back to the app (e.g. after switching Location on in Settings) tries again by itself
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && fenceRef.current && (geoErr || !posRef.current)) locate(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  });
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
      // update411: never trust the geofence cached on the phone — re-read the site's current pin/radius
      // from the server every open (Raju Sahani case: phone said "inside", server said 18 km — stale cache).
      siteForPunch(wv.site_id, wv.id).then(fresh => { if (fresh) { const nw = { ...wv, ...fresh }; setLocalWorker(nw); setWorker(nw);
        fenceRef.current = fresh; applyFence(); } });              // update470: re-check the GPS fix we already have, no second GPS request
      setWorker(wv);
      getTodayPunch(wv.id).then(setToday);
      fenceRef.current = wv;
      locate();
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
      {upHols.length > 0 && (   /* update394 */
        <div style={{ background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", borderRadius: 10, padding: "8px 12px", margin: "8px 10px 0", fontSize: 13 }}>
          {upHols.map(h => { const d = new Date(h.on_date + "T00:00:00"); const today = new Date(); today.setHours(0,0,0,0); const diff = Math.round((d - today) / 86400000);
            return <div key={h.on_date}>🪔 <b>{diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}:</b> {h.name}{h.type_code === "working" ? " — working day" : h.type_code === "optional" ? " — optional (unpaid)" : " — holiday"}</div>; })}
        </div>
      )}
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
          <Logo height={20} align="center" />
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
          {dist === null && geoErr && !locating ? (
            <div role="alert" className="geo-err" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: 12, padding: "10px 12px", fontSize: 13, textAlign: "left", margin: "0 4px" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>📍 {t(lang, geoErr === "denied" ? "gps_denied" : geoErr === "unavailable" ? "gps_off" : geoErr === "timeout" ? "gps_timeout" : "gps_unsupported")}</div>
              <button type="button" className="primary" onClick={locate} style={{ marginTop: 6, width: "100%", minHeight: 42, fontWeight: 700 }}>↻ {t(lang, "gps_retry")}</button>
            </div>
          ) : dist === null ? (
            <span className="geo-chip geo-wait">{t(lang, "checking_loc")}</span>
          ) : insideFence ? (
            <span className="geo-chip geo-ok">{t(lang, "inside_site")}</span>
          ) : (
            <span className="geo-chip geo-bad">📍 {dist} {t(lang, "outside_site")}</span>
          )}
          {dist !== null && (insideFence
            ? <div style={{ fontSize: 11.5, color: "var(--green)", marginTop: 4 }}>📍 You are within the site location{pos?.acc ? " · Accuracy " + Math.round(pos.acc) + "m" : ""}</div>
            : <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 4 }}>You are outside <b>{worker.site_name}</b>{pos?.acc ? " (GPS accuracy " + Math.round(pos.acc) + "m)" : ""} — move closer to punch here, or pick another of your sites above. <button type="button" onClick={locate} disabled={locating} style={{ fontSize: 11.5, padding: "2px 8px", marginLeft: 4 }}>{locating ? "…" : "↻ " + t(lang, "gps_retry")}</button></div>)}
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

        <div className="muted" style={{ textAlign: "center", fontSize: 10, marginTop: 10 }}>Pipeskool v470</div>{/* update289: visible build tag — if this line is missing on the phone, the deploy is not live */}
        {worker.profile_complete === false && (
          <div className="note amber" style={{ textAlign: "left" }}>
            ⚠ Profile incomplete — bank details pending. Show this to your supervisor.
          </div>
        )}
        {worker.contractor_id && !staffRole && <WorkerAdvanceCard worker={worker} />}{/* update436: contractor worker raises his own request */}
      </div>
      <MobileNav />
    </div>
    </>
  );
}

// update436: contractor workers can raise an advance / wage / petty request themselves (same approval flow; Director chooses "Pay to")
function WorkerAdvanceCard({ worker }) {
  const [open, setOpen] = useState(false); const [amt, setAmt] = useState(""); const [reason, setReason] = useState(""); const [kind, setKind] = useState("advance");
  const [mine, setMine] = useState(null); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = () => workerMyAdvances(worker).then(setMine);
  useEffect(() => { refresh(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const L = { advance: "Advance", wage: "Wage payment", petty: "Petty cash" };
  return (
    <div className="card" style={{ textAlign: "left", marginTop: 12, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>💸 Paise ki request / पैसे की मांग</div>
        <button type="button" onClick={() => setOpen(o => !o)} style={{ fontSize: 12.5 }}>{open ? "Band karo" : "+ Nayi request"}</button>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          <select value={kind} onChange={e => setKind(e.target.value)} style={{ width: "100%", marginBottom: 6 }}><option value="advance">Advance (एडवांस)</option><option value="wage">Wage payment (मजदूरी)</option><option value="petty">Petty cash (छोटा खर्च)</option></select>
          <input type="number" inputMode="numeric" placeholder="Amount ₹ / रकम" value={amt} onChange={e => setAmt(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
          <input placeholder="Reason / कारण (jaise: ghar bhejna, dawai)" value={reason} onChange={e => setReason(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
          <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Yeh request Director ke paas jayegi. Paise aapke thekedaar ko ya seedhe aapke khaate me — yeh Director tay karenge.</div>
          <button type="button" className="primary" disabled={busy || !Number(amt)} style={{ width: "100%" }} onClick={async () => { setBusy(true); setMsg(""); const r = await workerRaiseAdvance(worker, amt, reason, kind); setBusy(false); setMsg(r.ok ? `✅ Request ${r.req_no} bhej di gayi.` : "⚠ " + r.error); if (r.ok) { setAmt(""); setReason(""); setOpen(false); refresh(); } }}>{busy ? "Bhej rahe hain…" : "Request bhejo"}</button>
        </div>)}
      {msg && <div style={{ fontSize: 12.5, marginTop: 6 }}>{msg}</div>}
      {mine && mine.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {mine.slice(0, 5).map(r => (
            <div key={r.req_no} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "6px 0", borderTop: "1px solid var(--border,#e3e3de)" }}>
              <div><b>₹{Number(r.approved_amount ?? r.amount).toLocaleString("en-IN")}</b> · {L[r.kind] || r.kind}<div className="muted" style={{ fontSize: 11 }}>{String(r.raised_at).slice(0, 10)} · {r.req_no}{r.recipient ? " · " + r.recipient : ""}</div></div>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, alignSelf: "center", background: r.status === "approved" || r.status === "paid" ? "#DCFCE7" : r.status === "rejected" ? "#FEE2E2" : "#F3F4F6", color: r.status === "approved" || r.status === "paid" ? "#15803D" : r.status === "rejected" ? "#B91C1C" : "#374151" }}>{r.status}</span>
            </div>))}
        </div>)}
    </div>
  );
}
