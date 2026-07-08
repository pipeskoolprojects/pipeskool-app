"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSitesFull, updateSiteTimings, updateSiteGeofence } from "@/lib/data";
import { isDemo } from "@/lib/supabase";

function endHint(start, std = 8, lunch = 60) {
  if (!start) return "";
  const [h, m] = start.split(":").map(Number);
  const mins = h * 60 + m + std * 60 + lunch;
  const eh = Math.floor(mins / 60) % 24, em = mins % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

export default function SiteMasterPage() {
  const [sites, setSites] = useState(null);
  const [draft, setDraft] = useState({});   // siteId -> {shift_start, shift_end, geofence_lat, geofence_lng, geofence_radius_m}
  const [savingId, setSavingId] = useState(null);
  const [geoSavingId, setGeoSavingId] = useState(null);
  const [capturingId, setCapturingId] = useState(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  useEffect(() => { getSitesFull().then(s => {
    setSites(s);
    const d = {}; s.forEach(x => d[x.id] = {
      shift_start: (x.shift_start || "09:00").slice(0, 5), shift_end: (x.shift_end || "18:00").slice(0, 5),
      geofence_lat: x.geofence_lat ?? "", geofence_lng: x.geofence_lng ?? "", geofence_radius_m: x.geofence_radius_m ?? 200,
    });
    setDraft(d);
  }); }, []);

  const set = (id, k, v) => setDraft(d => ({ ...d, [id]: { ...d[id], [k]: v } }));

  async function save(s) {
    setSavingId(s.id); setMsg(""); setErr("");
    const res = await updateSiteTimings(s.id, draft[s.id].shift_start, draft[s.id].shift_end);
    setSavingId(null);
    res.ok ? setMsg(s.name + " timings saved.") : setErr(res.error);
  }

  async function saveGeo(s) {
    setGeoSavingId(s.id); setMsg(""); setErr("");
    const d = draft[s.id];
    const res = await updateSiteGeofence(s.id, d.geofence_lat, d.geofence_lng, d.geofence_radius_m);
    setGeoSavingId(null);
    res.ok ? setMsg(s.name + " location saved. Punch geofence is now live for this site.") : setErr(res.error);
  }

  function capture(s) {
    if (!navigator.geolocation) { setErr("This device can't get GPS location."); return; }
    setCapturingId(s.id); setErr(""); setMsg("");
    navigator.geolocation.getCurrentPosition(
      p => { set(s.id, "geofence_lat", p.coords.latitude.toFixed(6)); set(s.id, "geofence_lng", p.coords.longitude.toFixed(6)); setCapturingId(null); setMsg("Location captured for " + s.name + " — review the radius, then Save location."); },
      e => { setCapturingId(null); setErr("Couldn't get location: " + e.message + ". Allow location access and try on-site."); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Site Master</h1></div>
        {isDemo && <div className="demo-banner">Demo mode — sample sites.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

        {/* shift timings */}
        <div className="panel">
          <h2>Shift timings</h2>
          <div className="muted" style={{ marginBottom: 12 }}>Set each site's shift start and end. <b>Overtime is counted only after the shift end time.</b></div>
          {!sites ? <div className="muted">Loading…</div> : (
            <table>
              <thead><tr><th>Site</th><th>Shift start</th><th>Shift end (OT after this)</th><th>Work hrs</th><th></th></tr></thead>
              <tbody>
                {sites.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td><input type="time" value={draft[s.id]?.shift_start || ""} onChange={e => set(s.id, "shift_start", e.target.value)} /></td>
                    <td>
                      <input type="time" value={draft[s.id]?.shift_end || ""} onChange={e => set(s.id, "shift_end", e.target.value)} />
                      <div className="muted" style={{ fontSize: 11 }}>typical: {endHint(draft[s.id]?.shift_start, s.std_working_hours, s.lunch_minutes)}</div>
                    </td>
                    <td className="muted">{s.std_working_hours}h + {s.lunch_minutes}m lunch</td>
                    <td><button className="primary" disabled={savingId === s.id} onClick={() => save(s)}>{savingId === s.id ? "Saving…" : "Save"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* geofence / location */}
        <div className="panel">
          <h2>Site location (attendance geofence)</h2>
          <div className="muted" style={{ marginBottom: 12, fontSize: 12.5 }}>Workers can only self-punch when they're within the radius of the site's location. The easiest way to set this: open this page <b>on a phone while standing at the site</b> and tap <b>Capture current location</b>. Or enter the coordinates manually. Until a real location is set, the punch geofence for that site can't be trusted.</div>
          {!sites ? <div className="muted">Loading…</div> : (
            <div style={{ display: "grid", gap: 14 }}>
              {sites.map(s => {
                const d = draft[s.id] || {}; const hasLoc = d.geofence_lat !== "" && d.geofence_lat != null;
                return (
                  <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      {hasLoc ? <span className="badge p">📍 Location set</span> : <span className="badge warn">No location yet</span>}
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div><label className="muted">Latitude</label><input style={{ width: 130 }} value={d.geofence_lat ?? ""} onChange={e => set(s.id, "geofence_lat", e.target.value)} placeholder="e.g. 23.02" /></div>
                      <div><label className="muted">Longitude</label><input style={{ width: 130 }} value={d.geofence_lng ?? ""} onChange={e => set(s.id, "geofence_lng", e.target.value)} placeholder="e.g. 72.58" /></div>
                      <div><label className="muted">Radius (m)</label><input style={{ width: 90 }} value={d.geofence_radius_m ?? 200} onChange={e => set(s.id, "geofence_radius_m", e.target.value)} /></div>
                      <button disabled={capturingId === s.id} onClick={() => capture(s)}>{capturingId === s.id ? "Getting GPS…" : "📍 Capture current location"}</button>
                      <button className="primary" disabled={geoSavingId === s.id} onClick={() => saveGeo(s)}>{geoSavingId === s.id ? "Saving…" : "Save location"}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
