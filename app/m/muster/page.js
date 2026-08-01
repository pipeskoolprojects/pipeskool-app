"use client";
import { useEffect, useRef, useState } from "react";
import MobileNav from "@/components/MobileNav";
import CameraCapture from "@/components/CameraCapture";
import { isDemo } from "@/lib/supabase";
import { getMuster, proxyPunch, proxyPunchOut, getSiteGeo, getPosition, distanceMeters } from "@/lib/mobile";
import { getSession, setCurrentSite, can } from "@/lib/auth";

const initials = n => n.split(" ").map(x => x[0]).slice(0, 2).join("");

export default function MusterScreen() {
  const [rows, setRows] = useState(null);
  const [target, setTarget] = useState(null);
  const [mode, setMode] = useState("in");   // in | out
  const [msg, setMsg] = useState("");
  const [geo, setGeo] = useState(null);      // { dist, inside, unset }
  const [showCam, setShowCam] = useState(false);

  const sess = typeof window !== "undefined" ? getSession() : null;
  useEffect(() => { if (typeof window !== "undefined" && !getSession()) window.location.replace("/m"); }, []);
  const siteId = sess?.currentSite || sess?.sites?.[0]?.id || 1;
  const canProxy = sess && (sess.role === "director" || can(sess, "attendance", "create", siteId));
  const siteName = sess?.sites?.find(x => x.id === siteId)?.name || "";
  const markedBy = sess?.name || "Supervisor";

  const load = () => getMuster(siteId).then(setRows);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (sess?.role === "director") { if (alive) setGeo({ director: true }); return; }
      const g = await getSiteGeo(siteId);
      if (!g || g.geofence_lat == null) { if (alive) setGeo({ unset: true }); return; }
      const p = await getPosition();
      if (!p) { if (alive) setGeo({ nogps: true }); return; }
      const dist = Math.round(distanceMeters(p.lat, p.lng, g.geofence_lat, g.geofence_lng));
      if (alive) setGeo({ dist, inside: dist <= (g.geofence_radius_m || 200) });
    })();
    return () => { alive = false; };
  }, [siteId]);

  function startProxy(...args) {
    if (!canProxy) { alert("Only the site supervisor / incharge can mark on behalf."); return; }
    return startProxyInner(...args);
  }
  function startProxyInner(r, m) {
    setTarget(r); setMode(m); setMsg("");
    setShowCam(true);   // live camera only — no file picker
  }

  async function onPhoto(file) {
    setShowCam(false);
    if (!file || !target) return;
    const res = mode === "out"
      ? await proxyPunchOut(target.id, siteId, file)
      : await proxyPunch(target.id, siteId, file, markedBy);
    if (!res.ok) { setMsg(res.error); return; }
    setMsg(`Proxy punch-${mode} saved for ${target.name} — photo attached, flagged in records.`);
    setTarget(null);
    load();
  }

  const counts = (rows || []).reduce((c, r) => {
    if (r.status === "present") c.p++;
    else if (r.status === "half_day") c.h++;
    else if (r.status === "absent") c.a++;
    else c.pend++;
    return c;
  }, { p: 0, h: 0, a: 0, pend: 0 });

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div>
          <div className="title">Daily muster</div>
          {sess?.sites?.length > 1 ? (
            <select value={siteId} onChange={e => { setCurrentSite(e.target.value); window.location.reload(); }}
              style={{ marginTop: 2, fontSize: 12.5, background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "3px 8px" }}>
              {sess.sites.map(s => <option key={s.id} value={s.id} style={{ color: "#000" }}>{s.name}</option>)}
            </select>
          ) : (
            <div className="sub">{siteName || "Site"} · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
          )}
        </div>
        {geo?.director ? null :
          !geo ? <span className="geo-chip geo-wait" style={{ fontSize: 11 }}>📍 Checking location…</span> :
          geo.unset ? <span className="geo-chip geo-wait" style={{ fontSize: 11 }}>📍 Location not set</span> :
          geo.nogps ? <span className="geo-chip geo-wait" style={{ fontSize: 11 }}>📍 GPS off</span> :
          geo.inside ? <span className="geo-chip geo-ok" style={{ fontSize: 11 }}>📍 Inside site</span> :
          <span className="geo-chip geo-bad" style={{ fontSize: 11 }}>📍 {geo.dist} m from site</span>}
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — sample muster.</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <span className="badge p">P {counts.p}</span>
          <span className="badge h">½ {counts.h}</span>
          <span className="badge a">A {counts.a}</span>
          <span className="badge gray">Pending {counts.pend}</span>
        </div>
        {msg && <div className="note green">{msg}</div>}

        {!rows ? <div className="muted">Loading…</div> : rows.map(r => (
          <div className="m-row" key={r.id}>
            <div className="avatar">{initials(r.name)}</div>
            <div className="info">
              <div className="nm">{r.name}</div>
              <div className="dt">{r.cat} · {r.lab}{r.in ? ` · In ${r.in}` : ""}{r.out ? ` — Out ${r.out}` : ""}</div>
              {r.punch === "proxy" && <div className="flag">📷 Proxy punch — photo on file</div>}
            </div>
            {r.status === "present" ? <span className="badge p">P</span> :
             r.status === "half_day" ? <span className="badge h">½</span> :
             r.status === "absent" ? <span className="badge a">A</span> :
             r.in && !r.out ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                <span className="badge gray">On site</span>
                {canProxy ? <button style={{ fontSize: 11, padding: "5px 9px" }} onClick={() => startProxy(r, "out")}>Mark out</button> : null}
              </div>
             ) : r.in && r.out ? <span className="badge gray">Out {r.out}</span> : canProxy ? (
              <button style={{ fontSize: 11.5, padding: "6px 10px" }} onClick={() => startProxy(r, "in")}>
                Mark on behalf
              </button>
            ) : null}
          </div>
        ))}

        {showCam && <CameraCapture facing="environment" title={`Live photo of ${target?.name || "worker"} at site`} onCapture={onPhoto} onCancel={() => { setShowCam(false); setTarget(null); }} />}
        <div className="note amber" style={{ marginTop: 14 }}>
          "Mark on behalf" requires a live photo of the worker at site — the camera opens directly,
          gallery photos are not accepted. Every proxy entry is permanently flagged.
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
