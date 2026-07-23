"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { getLocalWorker, setLocalWorker, findWorkerByMobile, createStaffPunchProfile, getPosition, distanceMeters, getTodayPunch, punch } from "@/lib/mobile";
import { getSession, refreshSessionMobile } from "@/lib/auth";
import { getLang, t } from "@/lib/i18n";
import Logo from "@/components/Logo";

export default function PunchScreen() {
  const router = useRouter();
  const [worker, setWorker] = useState(null);
  const [pos, setPos] = useState(null);
  const [noProfile, setNoProfile] = useState(false);
  const [lang, setLangState] = useState("en");
  useEffect(() => { setLangState(getLang()); }, []);
  const [dist, setDist] = useState(null);
  const [today, setToday] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    const w = getLocalWorker();
    if (!w) {
      const sess = getSession();
      if (!sess) { router.push("/m/login"); return; }
      // staff signed in: auto-link their own worker punch profile by mobile
      (async () => {
        const mob = sess.mobile || await refreshSessionMobile(sess);
        let wk = mob ? await findWorkerByMobile(mob) : null;
        if (!wk && sess.role !== "director" && mob) {
          // every staff member (except Directors) must punch — enrol them automatically
          const made = await createStaffPunchProfile({ ...sess, mobile: mob });
          if (made.ok) wk = await findWorkerByMobile(mob);
          else { setNoProfile(made.error || true); return; }
        }
        if (wk) { setLocalWorker(wk); window.location.reload(); }
        else if (sess.role === "director") { router.push("/m/report"); }
        else setNoProfile(true);
      })();
      return;
    }
    setWorker(w);
    getTodayPunch(w.id).then(setToday);
    getPosition().then(p => {
      setPos(p);
      if (p && w.geofence_lat != null) {
        setDist(distanceMeters(p.lat, p.lng, w.geofence_lat, w.geofence_lng));
      } else {
        setDist(0); // demo / geofence not set yet → allow
      }
    });
  }, [router]);

  if (noProfile) return (
    <div className="m-wrap" style={{ padding: 20 }}>
      <div className="note amber" style={{ marginTop: 30 }}>
        {noProfile === "director"
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
    fileRef.current?.click(); // selfie first, punch on capture
  }

  async function onSelfie(e) {
    const file = e.target.files?.[0];
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
    e.target.value = "";
  }

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div>
          <div className="title">{worker.full_name}</div>
          <div className="sub">{worker.category} · {worker.site_name}</div>
        </div>
        <div className="sub">{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
      </div>
      <div className="m-body" style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <Logo height={20} color="#FF7A1A" wordColor="#0F1419" align="center" />
        </div>
        {isDemo && <div className="note amber">Demo mode — punches save on this phone only.</div>}

        <div style={{ margin: "10px 0" }}>
          {dist === null ? (
            <span className="geo-chip geo-wait">{t(lang, "checking_loc")}</span>
          ) : insideFence ? (
            <span className="geo-chip geo-ok">{t(lang, "inside_site")}</span>
          ) : (
            <span className="geo-chip geo-bad">📍 {dist} {t(lang, "outside_site")}</span>
          )}
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

        <input ref={fileRef} type="file" accept="image/*" capture="user"
               style={{ display: "none" }} onChange={onSelfie} />

        {msg && <div className="note green" style={{ textAlign: "left" }}>{msg}</div>}

        <div className="stat-row">
          <div className="stat-box"><div className="k">In</div><div className="v">{fmtTime(today.punch_in)}</div></div>
          <div className="stat-box"><div className="k">Out</div><div className="v">{fmtTime(today.punch_out)}</div></div>
          <div className="stat-box"><div className="k">Hours</div><div className="v">{today.hours_worked ?? "0.0"}</div></div>
        </div>

        {worker.profile_complete === false && (
          <div className="note amber" style={{ textAlign: "left" }}>
            ⚠ Profile incomplete — bank details pending. Show this to your supervisor.
          </div>
        )}
      </div>
      <MobileNav />
    </div>
  );
}
